from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_file, send_from_directory, stream_with_context
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.exceptions import HTTPException

from core_config import (
    SCHEMA_VERSION,
    SECRET_PLACEHOLDER,
    delete_profile,
    delete_template,
    find_profile,
    load_config,
    normalize_profile,
    public_config,
    set_preferences,
    upsert_profile,
    upsert_template,
)
from core_documents import (
    DocumentError,
    FormatFidelityError,
    delete_document,
    import_document,
    list_recent_documents,
    load_document,
    public_document,
    update_scope,
)
from core_llm import StreamRequestError, StreamingLLMClient
from core_runs import ExportConfirmationRequired, RUN_MANAGER, RunError


ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIST = ROOT_DIR / "app" / "dist"
DEFAULT_MAX_UPLOAD_BYTES = 40 * 1024 * 1024

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("FYADR_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES))
llm_client = StreamingLLMClient()


def error(message: str, status: int = 400, **extra: Any) -> tuple[Response, int]:
    payload: dict[str, Any] = {"message": message}
    payload.update(extra)
    return jsonify(payload), status


@app.after_request
def local_cors(response: Response) -> Response:
    origin = request.headers.get("Origin", "")
    if origin.startswith("http://127.0.0.1:") or origin.startswith("http://localhost:"):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Last-Event-ID"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response


@app.route("/api", methods=["OPTIONS"])
@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options(_path: str = "") -> Response:
    return Response(status=204)


@app.errorhandler(RequestEntityTooLarge)
def upload_too_large(_exc: RequestEntityTooLarge) -> tuple[Response, int]:
    return error("文件过大，目前最多支持 40 MB。", 413)


@app.errorhandler(DocumentError)
@app.errorhandler(RunError)
@app.errorhandler(StreamRequestError)
@app.errorhandler(ValueError)
def known_error(exc: Exception) -> tuple[Response, int]:
    return error(str(exc), 400)


@app.errorhandler(Exception)
def unexpected_error(exc: Exception) -> tuple[Response, int]:
    if isinstance(exc, HTTPException):
        return error(exc.description, exc.code or 500)
    app.logger.exception("Unhandled request error")
    return error(f"操作失败：{exc}", 500)


@app.get("/api/ping")
@app.get("/api/health")
def health() -> Response:
    return jsonify({"ok": True, "service": "fyadr-core", "schemaVersion": SCHEMA_VERSION})


@app.get("/api/settings")
def get_settings() -> Response:
    return jsonify(public_config())


@app.put("/api/settings/preferences")
def update_preferences() -> Response:
    return jsonify(set_preferences(request.get_json(silent=True) or {}))


@app.get("/api/model-profiles")
def get_model_profiles() -> Response:
    config = public_config()
    return jsonify(
        {"items": config["modelProfiles"], "defaultModelProfileId": config.get("defaultModelProfileId", "")}
    )


@app.post("/api/model-profiles")
def create_model_profile() -> tuple[Response, int]:
    return jsonify(upsert_profile(request.get_json(silent=True) or {})), 201


@app.put("/api/model-profiles/<profile_id>")
def update_model_profile(profile_id: str) -> Response:
    return jsonify(upsert_profile(request.get_json(silent=True) or {}, profile_id))


@app.delete("/api/model-profiles/<profile_id>")
def remove_model_profile(profile_id: str) -> Response:
    delete_profile(profile_id)
    return jsonify({"ok": True})


def _profile_from_request(payload: dict[str, Any]) -> dict[str, Any]:
    profile_id = str(payload.get("id") or "")
    existing = find_profile(profile_id) if profile_id else None
    merged = {**(existing or {}), **payload}
    if payload.get("apiKey") == SECRET_PLACEHOLDER and existing:
        merged["apiKey"] = existing.get("apiKey", "")
    return normalize_profile(merged, existing)


@app.post("/api/model-profiles/models")
def list_models() -> Response:
    profile = _profile_from_request(request.get_json(silent=True) or {})
    models = asyncio.run(llm_client.list_models(profile))
    return jsonify({"models": models})


@app.post("/api/model-profiles/test")
def test_model_profile() -> Response:
    profile = _profile_from_request(request.get_json(silent=True) or {})
    reply = asyncio.run(llm_client.test_connection(profile))
    return jsonify({"ok": True, "reply": reply[:300]})


@app.get("/api/prompt-templates")
def get_prompt_templates() -> Response:
    return jsonify({"items": load_config().get("promptTemplates", [])})


@app.post("/api/prompt-templates")
def create_prompt_template() -> tuple[Response, int]:
    return jsonify(upsert_template(request.get_json(silent=True) or {})), 201


@app.put("/api/prompt-templates/<template_id>")
def update_prompt_template(template_id: str) -> Response:
    return jsonify(upsert_template(request.get_json(silent=True) or {}, template_id))


@app.delete("/api/prompt-templates/<template_id>")
def remove_prompt_template(template_id: str) -> Response:
    delete_template(template_id)
    return jsonify({"ok": True})


@app.post("/api/prompt-templates/<template_id>/copy")
def copy_prompt_template(template_id: str) -> tuple[Response, int]:
    template = next((item for item in load_config().get("promptTemplates", []) if item.get("id") == template_id), None)
    if not template:
        return error("提示词不存在。", 404)
    value = upsert_template(
        {
            "name": f"{template['name']} · 副本",
            "description": template.get("description", ""),
            "content": template["content"],
        }
    )
    return jsonify(value), 201


@app.post("/api/documents")
def upload_document() -> tuple[Response, int]:
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return error("请选择 DOCX 或 TXT 文件。", 400)
    document = import_document(upload.stream, upload.filename)
    return jsonify(document), 201


@app.get("/api/documents/<document_id>")
def get_document(document_id: str) -> Response:
    return jsonify(public_document(load_document(document_id)))


@app.put("/api/documents/<document_id>/scope")
def save_document_scope(document_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    selected = payload.get("selectedParagraphIds", [])
    if not isinstance(selected, list):
        return error("正文范围格式无效。", 400)
    return jsonify(update_scope(document_id, selected))


@app.delete("/api/documents/<document_id>")
def remove_document(document_id: str) -> Response:
    document = load_document(document_id)
    latest_run_id = str(document.get("latestRunId") or "")
    if latest_run_id:
        try:
            latest_run = RUN_MANAGER.public_run(latest_run_id)
            if latest_run.get("status") in {"queued", "running", "cancelling"}:
                return error("请先停止正在进行的改写，再删除文档。", 409)
        except RunError:
            pass
    delete_document(document_id)
    return jsonify({"ok": True})


@app.get("/api/recent-documents")
def recent_documents() -> Response:
    items = list_recent_documents()
    for item in items:
        run_id = str(item.get("latestRunId") or "")
        status = ""
        completed = 0
        total = 0
        latest_run: dict[str, Any] | None = None
        if run_id:
            try:
                latest_run = RUN_MANAGER.public_run(run_id)
                status = str(latest_run.get("status") or "")
                progress = latest_run.get("progress") or {}
                completed = int(progress.get("completed") or 0)
                total = int(progress.get("total") or 0)
            except RunError:
                pass
        item["latestRunStatus"] = status
        item["latestRunProgress"] = {"completed": completed, "total": total}
        item["canResume"] = status in {"paused", "cancelled"} and completed < total
        paragraphs = latest_run.get("paragraphs", []) if latest_run else []
        item["canExport"] = bool(
            latest_run
            and status not in {"queued", "running", "cancelling"}
            and paragraphs
        )
    return jsonify({"items": items})


@app.post("/api/runs")
def create_run() -> tuple[Response, int]:
    payload = request.get_json(silent=True) or {}
    value = RUN_MANAGER.create_run(
        str(payload.get("documentId") or ""),
        str(payload.get("modelProfileId") or ""),
        [str(item) for item in payload.get("roundTemplateIds", []) if str(item)]
        if isinstance(payload.get("roundTemplateIds"), list)
        else None,
        concurrency=int(payload.get("concurrency", 1)),
        protected_terms=payload.get("protectedTerms") if isinstance(payload.get("protectedTerms"), list) else None,
        chunk_preset=str(payload.get("chunkPreset") or "") or None,
    )
    return jsonify(value), 201


@app.get("/api/runs/<run_id>")
def get_run(run_id: str) -> Response:
    return jsonify(RUN_MANAGER.public_run(run_id))


@app.get("/api/runs/<run_id>/events")
def run_events(run_id: str) -> Response:
    raw_after = request.args.get("after") or request.headers.get("Last-Event-ID") or "0"
    try:
        after = int(raw_after)
    except ValueError:
        after = 0

    @stream_with_context
    def generate():
        yield "retry: 1500\n\n"
        for event in RUN_MANAGER.events(run_id, after):
            if event is None:
                yield ": keepalive\n\n"
                continue
            payload = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
            yield f"id: {event['id']}\nevent: {event['type']}\ndata: {payload}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/api/runs/<run_id>/cancel")
def cancel_run(run_id: str) -> Response:
    return jsonify(RUN_MANAGER.cancel(run_id))


@app.post("/api/runs/<run_id>/resume")
def resume_run(run_id: str) -> Response:
    return jsonify(RUN_MANAGER.resume(run_id))


@app.post("/api/runs/<run_id>/continue")
def continue_run(run_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    concurrency = payload.get("concurrency")
    protected_terms = payload.get("protectedTerms")
    round_template_ids = payload.get("roundTemplateIds")
    return jsonify(
        RUN_MANAGER.continue_run(
            run_id,
            model_profile_id=str(payload.get("modelProfileId") or "") or None,
            round_template_ids=(
                [str(item) for item in round_template_ids if str(item)]
                if isinstance(round_template_ids, list)
                else None
            ),
            concurrency=int(concurrency) if concurrency is not None else None,
            protected_terms=protected_terms if isinstance(protected_terms, list) else None,
            chunk_preset=str(payload.get("chunkPreset") or "") or None,
        )
    )


@app.post("/api/runs/<run_id>/paragraphs/<paragraph_id>/retry")
def retry_paragraph(run_id: str, paragraph_id: str) -> Response:
    return jsonify(RUN_MANAGER.retry_paragraph(run_id, paragraph_id))


@app.put("/api/runs/<run_id>/review/<paragraph_id>")
def save_review(run_id: str, paragraph_id: str) -> Response:
    payload = request.get_json(silent=True) or {}
    return jsonify(
        RUN_MANAGER.save_review(
            run_id,
            paragraph_id,
            str(payload.get("decision") or "rewrite"),
            str(payload.get("text") or ""),
        )
    )


@app.post("/api/runs/<run_id>/export")
def export_run(run_id: str) -> Response | tuple[Response, int]:
    payload = request.get_json(silent=True) or {}
    try:
        output, audit = RUN_MANAGER.export(
            run_id,
            output_format=str(payload.get("format") or "docx"),
            acknowledge_warnings=bool(payload.get("acknowledgeWarnings", False)),
            force_format_risk=bool(payload.get("forceFormatRisk", False)),
            use_original_for_incomplete=bool(payload.get("useOriginalForIncomplete", False)),
        )
    except ExportConfirmationRequired as exc:
        return error(
            str(exc),
            409,
            code="export_confirmation_required",
            warningSummary=exc.summary,
            exportConfirmation=exc.summary,
        )
    except FormatFidelityError as exc:
        return error(
            str(exc),
            409,
            code="export_generation_failed",
            formatAudit=exc.audit,
            txtAvailable=True,
        )
    response = send_file(output, as_attachment=True, download_name=output.name)
    response.headers["X-FYADR-Audit"] = str(audit.get("status") or "passed")
    return response


@app.get("/")
@app.get("/<path:path>")
def frontend(path: str = "") -> Response | tuple[Response, int]:
    if path.startswith("api/"):
        return error("接口不存在。", 404)
    if FRONTEND_DIST.exists():
        candidate = FRONTEND_DIST / path
        if path and candidate.is_file():
            return send_from_directory(FRONTEND_DIST, path)
        return send_from_directory(FRONTEND_DIST, "index.html")
    return jsonify({"ok": True, "message": "前端开发服务器请访问 http://127.0.0.1:1420"})


if __name__ == "__main__":
    load_config()
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("FYADR_PORT", "8765")),
        threaded=True,
        use_reloader=False,
    )
