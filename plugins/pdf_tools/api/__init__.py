"""PDF tools API blueprint with standardized responses."""

from __future__ import annotations

import base64
import json
import zipfile
from io import BytesIO
from typing import Iterable

from flask import Blueprint, Response, current_app, request, send_file
from pydantic import Field

from common.errors import AppError, ValidationAppError
from common.io import secure_filename
from common.responses import fail, ok
from common.validation import (
    FileLimit,
    SchemaModel,
    ValidationError,
    enforce_limits,
    parse_model,
    validate_mime,
)

from ..core import (
    MergeSpec,
    PageRangeError,
    PageSequenceError,
    SplitTask,
    StitchItem,
    merge_pdfs,
    pdf_metadata,
    split_pdf,
    split_pdf_custom,
    stitch_pdfs,
)


class MergeItem(SchemaModel):
    field: str
    filename: str | None = None
    pages: str = "all"


class MergePayload(SchemaModel):
    manifest: list[MergeItem]
    output_name: str | None = None


class SplitPlanItem(SchemaModel):
    name: str = Field(min_length=1)
    pages: str = Field(min_length=1)


class SplitRequest(SchemaModel):
    plan: list[SplitPlanItem] | None = None


def _merge_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    upload = settings.get("merge_upload")
    return FileLimit.from_settings(upload, default_max_files=10, default_max_mb=5)


def _split_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    upload = settings.get("split_upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=5)


api_bp = Blueprint("pdf_tools_api", __name__, url_prefix="/api/pdf_tools")


def _load_manifest() -> MergePayload | Response:
    manifest_raw = request.form.get("manifest")
    if not manifest_raw:
        return fail(
            ValidationAppError(
                message="Missing merge manifest", code="pdf.missing_manifest"
            )
        )
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        return fail(
            ValidationAppError(
                message="Invalid manifest format",
                code="pdf.invalid_manifest",
                details={"error": str(exc)},
            )
        )
    if not isinstance(manifest, list):
        return fail(
            ValidationAppError(
                message="Manifest must be a list", code="pdf.invalid_manifest"
            )
        )
    payload = {"manifest": manifest, "output_name": request.form.get("output_name")}
    try:
        return parse_model(MergePayload, payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_manifest",
                details=getattr(exc, "details", None),
            )
        )


def _collect_uploads(manifest: Iterable[MergeItem]) -> list:
    uploads = []
    for item in manifest:
        file = request.files.get(item.field)
        if file is None:
            raise ValidationAppError(
                message=f"Missing file for field {item.field}", code="pdf.missing_file"
            )
        uploads.append(file)
    return uploads


def _download_requested() -> bool:
    return request.args.get("download") == "1"


@api_bp.post("/merge")
def merge() -> Response:
    manifest = _load_manifest()
    if isinstance(manifest, Response):
        return manifest

    try:
        uploads = _collect_uploads(manifest.manifest)
        enforce_limits(uploads, _merge_limit())
        validate_mime(uploads, {"application/pdf"})
    except ValidationAppError as exc:
        return fail(exc)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    specs: list[MergeSpec] = []
    for item, file in zip(manifest.manifest, uploads, strict=False):
        filename = item.filename or file.filename or file.name or "document.pdf"
        data = file.read()
        specs.append(MergeSpec(data=data, page_range=item.pages, filename=filename))

    try:
        merged = merge_pdfs(specs)
    except PageRangeError as exc:
        return fail(ValidationAppError(message=str(exc), code="pdf.invalid_page_range"))

    output_name = manifest.output_name or "merged.pdf"
    safe_name = secure_filename(output_name)
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"

    payload = {
        "filename": safe_name,
        "pdf_base64": base64.b64encode(merged).decode("ascii"),
        "total_files": len(specs),
    }
    if _download_requested():
        buffer = BytesIO(merged)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=safe_name,
            max_age=0,
        )
    return ok(payload)


@api_bp.post("/split")
def split() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(
            ValidationAppError(message="No file provided", code="pdf.file_missing")
        )
    try:
        enforce_limits([file], _split_limit())
        validate_mime([file], {"application/pdf"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    data = file.read()
    try:
        meta = pdf_metadata(data)
    except Exception:  # pragma: no cover - defensive
        return fail(AppError(code="pdf.metadata_error", message="Unable to read PDF"))

    raw_plan = request.form.get("plan")
    plan_items: list[SplitPlanItem] | None = None
    if raw_plan:
        try:
            plan_payload = json.loads(raw_plan)
        except json.JSONDecodeError as exc:
            return fail(
                ValidationAppError(
                    message="Invalid split plan",
                    code="pdf.invalid_split_plan",
                    details={"error": str(exc)},
                )
            )
        try:
            parsed = parse_model(SplitRequest, {"plan": plan_payload})
        except ValidationError as exc:
            return fail(
                ValidationAppError(
                    message=str(exc),
                    code="pdf.invalid_split_plan",
                    details=getattr(exc, "details", None),
                )
            )
        plan_items = parsed.plan or []
        if not plan_items:
            return fail(
                ValidationAppError(
                    message="Split plan cannot be empty", code="pdf.invalid_split_plan"
                )
            )

    try:
        if plan_items:
            tasks: list[SplitTask] = []
            seen: set[str] = set()
            for item in plan_items:
                safe_name = secure_filename(item.name) or "split"
                if not safe_name.lower().endswith(".pdf"):
                    safe_name = f"{safe_name}.pdf"
                key = safe_name.lower()
                if key in seen:
                    raise ValidationAppError(
                        message="Duplicate split output names",
                        code="pdf.duplicate_split_name",
                    )
                seen.add(key)
                tasks.append(SplitTask(name=safe_name, page_range=item.pages))
            outputs = split_pdf_custom(data, tasks)
        else:
            parts = split_pdf(data)
            outputs = [(f"page-{idx}.pdf", part) for idx, part in enumerate(parts, start=1)]
    except PageRangeError as exc:
        return fail(ValidationAppError(message=str(exc), code="pdf.invalid_page_range"))
    except ValidationAppError as exc:
        return fail(exc)

    if _download_requested():
        zip_buf = BytesIO()
        with zipfile.ZipFile(zip_buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for name, content in outputs:
                zf.writestr(name, content)
        zip_buf.seek(0)
        return send_file(
            zip_buf,
            mimetype="application/zip",
            as_attachment=True,
            download_name="split_pages.zip",
            max_age=0,
        )
    files_payload = [
        {"name": name, "pdf_base64": base64.b64encode(content).decode("ascii")}
        for name, content in outputs
    ]
    payload = {
        "files": files_payload,
        "pages": [item["pdf_base64"] for item in files_payload],
        "page_count": meta.pages,
    }
    return ok(payload)


@api_bp.post("/metadata")
def metadata() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(
            ValidationAppError(message="No file provided", code="pdf.file_missing")
        )

    merge_limit = _merge_limit()
    metadata_limit = FileLimit(max_files=1, max_size=merge_limit.max_size)

    try:
        enforce_limits([file], metadata_limit)
        validate_mime([file], {"application/pdf"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    try:
        info = pdf_metadata(file.read())
    except Exception:  # pragma: no cover - defensive
        return fail(AppError(code="pdf.metadata_error", message="Unable to read PDF"))

    payload = {"pages": info.pages, "size_bytes": info.size_bytes}
    return ok(payload)


class StitchItemPayload(SchemaModel):
    field: str
    alias: str
    pages: str = "all"


class StitchPayload(SchemaModel):
    manifest: list[StitchItemPayload]
    output_name: str | None = None


def _stitch_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    # Use generic 'stripe' or specific 'stitch_upload' config if desired,
    # falling back to default limits similarly to merge
    upload = settings.get("stitch_upload")
    return FileLimit.from_settings(upload, default_max_files=6, default_max_mb=6)


@api_bp.post("/stitch")
def stitch() -> Response:
    manifest_raw = request.form.get("manifest")
    if not manifest_raw:
        return fail(
            ValidationAppError(
                message="Missing stitch manifest", code="pdf.missing_manifest"
            )
        )
    try:
        manifest_data = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        return fail(
            ValidationAppError(
                message="Invalid manifest format",
                code="pdf.invalid_manifest",
                details={"error": str(exc)},
            )
        )
    if not isinstance(manifest_data, list):
        return fail(
            ValidationAppError(
                message="Manifest must be a list", code="pdf.invalid_manifest"
            )
        )

    payload_dict = {
        "manifest": manifest_data,
        "output_name": request.form.get("output_name"),
    }
    try:
        payload = parse_model(StitchPayload, payload_dict)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_manifest",
                details=getattr(exc, "details", None),
            )
        )

    uploads = {}
    for item in payload.manifest:
        file = request.files.get(item.field)
        if file is None:
            return fail(
                ValidationAppError(
                    message=f"Missing file for field {item.field}",
                    code="pdf.missing_file",
                )
            )
        uploads[item.field] = file

    try:
        enforce_limits(uploads.values(), _stitch_limit())
        validate_mime(uploads.values(), {"application/pdf"})
    except ValidationAppError as exc:
        return fail(exc)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    items: list[StitchItem] = []
    parts_meta: list[dict[str, object]] = []
    cached_bytes: dict[str, bytes] = {}

    for item in payload.manifest:
        file = uploads[item.field]
        if item.field not in cached_bytes:
            cached_bytes[item.field] = file.read()
        data = cached_bytes[item.field]

        # Optional: validate metadata read for each file
        try:
            meta = pdf_metadata(data)
        except Exception:
            return fail(
                AppError(code="pdf.metadata_error", message="Unable to read PDF")
            )

        pages = (item.pages or "all").strip() or "all"
        items.append(StitchItem(alias=item.alias, data=data, pages=pages))
        parts_meta.append(
            {
                "alias": item.alias,
                "filename": file.filename or item.field,
                "pages_requested": pages,
                "total_pages": meta.pages,
            }
        )

    try:
        stitched = stitch_pdfs(items)
    except PageSequenceError as exc:
        return fail(
            ValidationAppError(message=str(exc), code="pdf.invalid_page_range")
        )

    output_name = payload.output_name or "stitched.pdf"
    safe_name = secure_filename(output_name)
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"

    if _download_requested():
        buffer = BytesIO(stitched)
        buffer.seek(0)
        return send_file(
            buffer,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=safe_name,
            max_age=0,
        )

    response_payload = {
        "filename": safe_name,
        "pdf_base64": base64.b64encode(stitched).decode("ascii"),
        "parts": parts_meta,
    }
    return ok(response_payload)


blueprints = [api_bp]


__all__ = ["blueprints", "merge", "split", "metadata", "stitch"]
