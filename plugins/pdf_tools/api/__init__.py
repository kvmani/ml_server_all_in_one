"""PDF tools API blueprint with standardized responses."""

from __future__ import annotations

import base64
import json
from typing import Iterable

from flask import Blueprint, Response, current_app, request

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

from ..core import MergeSpec, PageRangeError, merge_pdfs, pdf_metadata, split_pdf


class MergeItem(SchemaModel):
    field: str
    filename: str | None = None
    pages: str = "all"


class MergePayload(SchemaModel):
    manifest: list[MergeItem]
    output_name: str | None = None


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

    parts = split_pdf(file.read())
    payload = {
        "pages": [base64.b64encode(part).decode("ascii") for part in parts],
        "page_count": len(parts),
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


blueprints = [api_bp]


__all__ = ["blueprints", "merge", "split", "metadata", "index"]
