from __future__ import annotations

import base64
import json
from io import BytesIO

from flask import Blueprint, Response, current_app, jsonify, render_template, request, send_file

from app.security import secure_filename, validate_mime
from common.validate import FileLimit, ValidationError, enforce_limits

from ..core import MergeSpec, PageRangeError, merge_pdfs, pdf_metadata, split_pdf

bp = Blueprint(
    "pdf_tools",
    __name__,
    url_prefix="/pdf_tools",
    template_folder="../ui/templates",
    static_folder="../ui/static/pdf_tools",
    static_url_path="/static/pdf_tools",
)

@bp.get("/")
def index() -> str:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    return render_template("pdf_tools/index.html", plugin_settings=settings)


def _merge_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    upload = settings.get("merge_upload")
    return FileLimit.from_settings(upload, default_max_files=10, default_max_mb=5)


def _split_limit() -> FileLimit:
    settings = current_app.config.get("PLUGIN_SETTINGS", {}).get("pdf_tools", {})
    upload = settings.get("split_upload")
    return FileLimit.from_settings(upload, default_max_files=1, default_max_mb=5)


@bp.post("/api/v1/merge")
def merge() -> Response:
    manifest_raw = request.form.get("manifest")
    if not manifest_raw:
        return jsonify({"error": "Missing merge manifest"}), 400
    try:
        manifest = json.loads(manifest_raw)
    except json.JSONDecodeError as exc:
        return jsonify({"error": "Invalid manifest format"}), 400
    if not isinstance(manifest, list) or not manifest:
        return jsonify({"error": "Manifest must describe at least one PDF"}), 400

    uploads = []
    for item in manifest:
        field = item.get("field") if isinstance(item, dict) else None
        if not field:
            return jsonify({"error": "Manifest entry missing field"}), 400
        file = request.files.get(field)
        if file is None:
            return jsonify({"error": f"Missing file for field {field}"}), 400
        uploads.append(file)

    try:
        enforce_limits(uploads, _merge_limit())
        validate_mime(uploads, {"application/pdf"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    specs: list[MergeSpec] = []
    for item, file in zip(manifest, uploads):
        pages = str(item.get("pages", "all"))
        filename = item.get("filename") or file.filename or file.name or "document.pdf"
        data = file.read()
        specs.append(MergeSpec(data=data, page_range=pages, filename=filename))

    try:
        merged = merge_pdfs(specs)
    except PageRangeError as exc:
        return jsonify({"error": str(exc)}), 400

    output_name = request.form.get("output_name") or "merged.pdf"
    safe_name = secure_filename(output_name)
    if not safe_name.lower().endswith(".pdf"):
        safe_name = f"{safe_name}.pdf"

    buf = BytesIO(merged)
    buf.seek(0)
    return send_file(
        buf,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=safe_name,
        max_age=0,
    )


@bp.post("/api/v1/split")
def split() -> Response:
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 400
    try:
        enforce_limits([file], _split_limit())
        validate_mime([file], {"application/pdf"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    parts = split_pdf(file.read())
    payload = [base64.b64encode(part).decode("ascii") for part in parts]
    return jsonify({"pages": payload})


@bp.post("/api/v1/metadata")
def metadata() -> Response:
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "No file provided"}), 400

    merge_limit = _merge_limit()
    metadata_limit = FileLimit(max_files=1, max_size=merge_limit.max_size)

    try:
        enforce_limits([file], metadata_limit)
        validate_mime([file], {"application/pdf"})
    except (ValidationError, ValueError) as exc:
        return jsonify({"error": str(exc)}), 400

    try:
        info = pdf_metadata(file.read())
    except Exception:
        return jsonify({"error": "Unable to read PDF"}), 400

    return jsonify({"pages": info.pages, "size_bytes": info.size_bytes})
