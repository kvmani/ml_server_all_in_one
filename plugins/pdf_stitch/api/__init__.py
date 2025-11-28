"""PDF stitch API blueprint."""

from __future__ import annotations

import base64
import json
from io import BytesIO

from flask import Blueprint, Response, current_app, request, send_file

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

from ...pdf_tools.core import pdf_metadata
from ..core.stitch import PageSequenceError, StitchItem, stitch_pdfs


class StitchItemPayload(SchemaModel):
    field: str
    alias: str
    pages: str = "all"


class StitchPayload(SchemaModel):
    manifest: list[StitchItemPayload]
    output_name: str | None = None


api_bp = Blueprint("pdf_stitch", __name__, url_prefix="/api/pdf_stitch")


def _upload_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_stitch", {})
    upload = settings.get("upload")
    return FileLimit.from_settings(upload, default_max_files=6, default_max_mb=6)


def _load_manifest() -> StitchPayload | Response:
    manifest_raw = request.form.get("manifest")
    if not manifest_raw:
        return fail(
            ValidationAppError(message="Missing stitch manifest", code="pdf_stitch.missing_manifest")
        )
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        return fail(
            ValidationAppError(
                message="Invalid manifest format",
                code="pdf_stitch.invalid_manifest",
                details={"error": str(exc)},
            )
        )
    if not isinstance(manifest, list):
        return fail(
            ValidationAppError(message="Manifest must be a list", code="pdf_stitch.invalid_manifest")
        )
    payload = {"manifest": manifest, "output_name": request.form.get("output_name")}
    try:
        return parse_model(StitchPayload, payload)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf_stitch.invalid_manifest",
                details=getattr(exc, "details", None),
            )
        )


def _collect_uploads(manifest: list[StitchItemPayload]) -> list:
    uploads: dict[str, object] = {}
    for item in manifest:
        file = request.files.get(item.field)
        if file is None:
            raise ValidationAppError(
                message=f"Missing file for field {item.field}", code="pdf_stitch.missing_file"
            )
        uploads[item.field] = file
    return uploads


def _download_requested() -> bool:
    return request.args.get("download") == "1"


@api_bp.post("/stitch")
def stitch() -> Response:
    manifest = _load_manifest()
    if isinstance(manifest, Response):
        return manifest

    try:
        uploads = _collect_uploads(manifest.manifest)
        enforce_limits(uploads.values(), _upload_limit())
        validate_mime(uploads.values(), {"application/pdf"})
    except ValidationAppError as exc:
        return fail(exc)
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf_stitch.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    items: list[StitchItem] = []
    parts_meta: list[dict[str, object]] = []
    cached_bytes: dict[str, bytes] = {}
    for item in manifest.manifest:
        file = uploads.get(item.field)
        if file is None:
            return fail(
                ValidationAppError(
                    message=f"Missing file for field {item.field}", code="pdf_stitch.missing_file"
                )
            )
        pages = (item.pages or "all").strip() or "all"
        if item.field not in cached_bytes:
            cached_bytes[item.field] = file.read()
        data = cached_bytes[item.field]
        try:
            meta = pdf_metadata(data)
        except Exception:
            return fail(AppError(code="pdf_stitch.metadata_error", message="Unable to read PDF"))
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
        return fail(ValidationAppError(message=str(exc), code="pdf_stitch.invalid_page_range"))
    output_name = manifest.output_name or "stitched.pdf"
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

    payload = {
        "filename": safe_name,
        "pdf_base64": base64.b64encode(stitched).decode("ascii"),
        "parts": parts_meta,
    }
    return ok(payload)


@api_bp.post("/metadata")
def metadata() -> Response:
    file = request.files.get("file")
    if not file:
        return fail(ValidationAppError(message="No file provided", code="pdf_stitch.file_missing"))
    try:
        enforce_limits([file], _upload_limit())
        validate_mime([file], {"application/pdf"})
    except ValidationError as exc:
        return fail(
            ValidationAppError(
                message=str(exc),
                code="pdf_stitch.invalid_upload",
                details=getattr(exc, "details", None),
            )
        )

    try:
        info = pdf_metadata(file.read())
    except Exception:  # pragma: no cover - defensive
        return fail(AppError(code="pdf_stitch.metadata_error", message="Unable to read PDF"))

    payload = {"pages": info.pages, "size_bytes": info.size_bytes}
    return ok(payload)


blueprints = [api_bp]


__all__ = ["blueprints", "stitch", "metadata"]
