from __future__ import annotations

import base64
import json
import os
import platform
import shutil
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_file, stream_with_context

from app_config import get_app_config_path, load_app_config, save_app_config
from detection_report_parser import parse_detection_report_pdf
from experiment_records import delete_experiment_record, list_experiment_records, save_experiment_record
from app_service import (
    delete_document_history,
    delete_history_orphan_artifacts,
    export_round_output,
    export_reviewed_round_output,
    get_document_history,
    get_document_protection_map,
    get_document_status,
    list_available_models,
    list_document_histories,
    load_review_decisions,
    read_output_text,
    read_round_compare,
    rerun_compare_chunk,
    reset_round_progress,
    run_round_for_app,
    save_review_decisions,
    scan_history_orphan_artifacts,
    test_model_connection,
)
from format_rules import (
    get_default_format_rules,
    load_active_format_rules,
    parse_format_rules_from_text,
    save_active_format_rules,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
ORIGIN_DIR = ROOT_DIR / "origin"
EXPORT_DIR = ROOT_DIR / "finish" / "web_exports"
DETECTION_REPORT_DIR = ROOT_DIR / "finish" / "detection_reports"
RUN_STATE_TTL_SECONDS = 1800
SSE_KEEPALIVE_INTERVAL_SECONDS = 15


@dataclass
class ProgressState:
    source_path: str
    status: str = "running"
    completed: bool = False
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    cancel_requested: bool = False
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    condition: threading.Condition = field(default_factory=threading.Condition)


RUN_STATES: dict[str, ProgressState] = {}
ACTIVE_RUNS_BY_SOURCE: dict[str, str] = {}
RUN_REGISTRY_LOCK = threading.Lock()
app = Flask(__name__)


def ensure_workspace_dirs() -> None:
    ORIGIN_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    DETECTION_REPORT_DIR.mkdir(parents=True, exist_ok=True)


def error_response(message: str, status: int = 400) -> tuple[Response, int]:
    return jsonify({"message": message}), status


def make_ascii_header_value(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return quote(text, safe="")


def sanitize_filename(filename: str) -> str:
    candidate = Path(filename).name.strip()
    if not candidate:
        raise ValueError("Filename is required.")
    return candidate


def write_uploaded_file(filename: str, content: str) -> Path:
    ensure_workspace_dirs()
    safe_name = sanitize_filename(filename)
    target_path = ORIGIN_DIR / safe_name
    target_path.write_text(content, encoding="utf-8")
    return target_path


def write_uploaded_binary_file(filename: str, content_base64: str) -> Path:
    ensure_workspace_dirs()
    safe_name = sanitize_filename(filename)
    target_path = ORIGIN_DIR / safe_name
    target_path.write_bytes(base64.b64decode(content_base64))
    return target_path


def write_uploaded_detection_report(filename: str, content_base64: str) -> Path:
    ensure_workspace_dirs()
    safe_name = sanitize_filename(filename)
    if not safe_name.lower().endswith(".pdf"):
        raise ValueError("Detection report must be a PDF file.")
    target_path = DETECTION_REPORT_DIR / safe_name
    target_path.write_bytes(base64.b64decode(content_base64))
    return target_path


def normalize_source_path(source_path: str) -> str:
    candidate = Path(source_path).expanduser()
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    if not candidate.exists():
        raise ValueError(f"Source file does not exist: {candidate}")
    return str(candidate)


def prune_run_states() -> None:
    cutoff = time.time() - RUN_STATE_TTL_SECONDS
    with RUN_REGISTRY_LOCK:
        stale_run_ids = [
            run_id
            for run_id, state in RUN_STATES.items()
            if state.completed and state.updated_at < cutoff
        ]
        for run_id in stale_run_ids:
            RUN_STATES.pop(run_id, None)
        inactive_sources = [
            source_path
            for source_path, run_id in ACTIVE_RUNS_BY_SOURCE.items()
            if run_id not in RUN_STATES
        ]
        for source_path in inactive_sources:
            ACTIVE_RUNS_BY_SOURCE.pop(source_path, None)


def register_run(source_path: str) -> tuple[str, ProgressState]:
    prune_run_states()
    normalized_source_path = normalize_source_path(source_path)
    with RUN_REGISTRY_LOCK:
        active_run_id = ACTIVE_RUNS_BY_SOURCE.get(normalized_source_path)
        if active_run_id:
            active_state = RUN_STATES.get(active_run_id)
            if active_state and not active_state.completed:
                raise ValueError("This document already has a running task. Please wait for it to finish.")
            ACTIVE_RUNS_BY_SOURCE.pop(normalized_source_path, None)

        run_id = uuid.uuid4().hex
        state = ProgressState(source_path=normalized_source_path)
        RUN_STATES[run_id] = state
        ACTIVE_RUNS_BY_SOURCE[normalized_source_path] = run_id
        return run_id, state


def get_active_run_for_source(source_path: str) -> tuple[str, ProgressState] | None:
    prune_run_states()
    normalized_source_path = normalize_source_path(source_path)
    with RUN_REGISTRY_LOCK:
        active_run_id = ACTIVE_RUNS_BY_SOURCE.get(normalized_source_path)
        if not active_run_id:
            return None
        active_state = RUN_STATES.get(active_run_id)
        if active_state and not active_state.completed:
            return active_run_id, active_state
        ACTIVE_RUNS_BY_SOURCE.pop(normalized_source_path, None)
    return None


def register_or_reuse_run(source_path: str) -> tuple[str, ProgressState, bool]:
    active_run = get_active_run_for_source(source_path)
    if active_run is not None:
        run_id, state = active_run
        return run_id, state, True
    run_id, state = register_run(source_path)
    return run_id, state, False


def touch_run_state(run_id: str) -> None:
    state = RUN_STATES.get(run_id)
    if state is None:
        return
    state.updated_at = time.time()


def release_active_run(run_id: str) -> None:
    with RUN_REGISTRY_LOCK:
        state = RUN_STATES.get(run_id)
        if not state:
            return
        if ACTIVE_RUNS_BY_SOURCE.get(state.source_path) == run_id:
            ACTIVE_RUNS_BY_SOURCE.pop(state.source_path, None)


def serialize_run_state(run_id: str, state: ProgressState) -> dict[str, Any]:
    return {
        "ok": True,
        "runId": run_id,
        "sourcePath": state.source_path,
        "status": state.status,
        "completed": state.completed,
        "cancelRequested": state.cancel_requested,
        "eventCount": len(state.events),
        "lastEvent": state.events[-1] if state.events else None,
        "result": state.result,
        "error": state.error,
        "createdAt": datetime.fromtimestamp(state.created_at, timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.fromtimestamp(state.updated_at, timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def append_progress_event(run_id: str, event: dict[str, Any]) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.events.append(event)
        state.updated_at = time.time()
        state.condition.notify_all()


def finalize_progress(run_id: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.result = result
        state.error = error
        if error:
            state.status = "canceled" if state.cancel_requested or "interrupted" in error.lower() else "failed"
        else:
            state.status = "completed"
        state.completed = True
        state.updated_at = time.time()
        state.condition.notify_all()
    release_active_run(run_id)


def merge_model_config_for_run(incoming: dict[str, Any]) -> dict[str, Any]:
    saved = load_app_config()
    merged = {**saved, **incoming}
    merged["roundModels"] = {**(saved.get("roundModels", {}) or {}), **(incoming.get("roundModels", {}) or {})}
    if "modelProviders" not in incoming:
        merged["modelProviders"] = saved.get("modelProviders", []) or []
    return merged


def summarize_workspace_path(path: Path, *, label: str, kind: str) -> dict[str, Any]:
    exists = path.exists()
    file_count = 0
    size_bytes = 0
    if exists:
        try:
            if path.is_file():
                file_count = 1
                size_bytes = path.stat().st_size
            else:
                for child in path.rglob("*"):
                    if child.is_file():
                        file_count += 1
                        size_bytes += child.stat().st_size
        except OSError:
            pass
    writable_target = path if path.is_dir() else path.parent
    writable = writable_target.exists() and os.access(writable_target, os.W_OK)
    return {
        "key": kind,
        "label": label,
        "path": str(path),
        "exists": exists,
        "writable": writable,
        "fileCount": file_count,
        "sizeBytes": size_bytes,
    }


def build_environment_diagnostics() -> dict[str, Any]:
    ensure_workspace_dirs()
    config = load_app_config()
    config_path = get_app_config_path()
    providers = config.get("modelProviders", []) if isinstance(config.get("modelProviders"), list) else []
    round_models = config.get("roundModels", {}) if isinstance(config.get("roundModels"), dict) else {}
    enabled_providers = [provider for provider in providers if bool(provider.get("enabled"))]
    custom_rounds = [item for item in round_models.values() if isinstance(item, dict) and bool(item.get("enabled"))]
    active_runs: list[dict[str, Any]] = []
    with RUN_REGISTRY_LOCK:
        for run_id, state in RUN_STATES.items():
            if state.completed:
                continue
            active_runs.append(serialize_run_state(run_id, state))
    path_summaries = [
        summarize_workspace_path(ROOT_DIR, label="项目根目录", kind="workspace"),
        summarize_workspace_path(ORIGIN_DIR, label="源文档目录", kind="origin"),
        summarize_workspace_path(ROOT_DIR / "finish" / "intermediate", label="中间产物目录", kind="intermediate"),
        summarize_workspace_path(EXPORT_DIR, label="项目导出目录", kind="exports"),
        summarize_workspace_path(DETECTION_REPORT_DIR, label="检测报告目录", kind="detectionReports"),
        summarize_workspace_path(config_path, label="本地配置文件", kind="config"),
    ]
    checks = [
        {
            "key": "backend",
            "label": "后端服务",
            "ok": True,
            "level": "success",
            "message": "后端 API 已响应。",
        },
        {
            "key": "config",
            "label": "模型配置",
            "ok": bool(config.get("offlineMode")) or (bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model"))),
            "level": "success" if bool(config.get("offlineMode")) or (bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model"))) else "warning",
            "message": "离线模式已启用。" if bool(config.get("offlineMode")) else "默认模型连接已配置。" if (bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model"))) else "默认模型连接未完整配置，可到模型配置页填写。",
        },
        {
            "key": "providers",
            "label": "服务商仓库",
            "ok": len(enabled_providers) > 0,
            "level": "success" if len(enabled_providers) > 0 else "info",
            "message": f"已启用 {len(enabled_providers)} 个服务商。" if enabled_providers else "没有启用服务商；每轮会继承默认连接。",
        },
        {
            "key": "paths",
            "label": "工作目录",
            "ok": all(item.get("exists") and item.get("writable") for item in path_summaries if item["key"] != "config"),
            "level": "success" if all(item.get("exists") and item.get("writable") for item in path_summaries if item["key"] != "config") else "error",
            "message": "项目工作目录可读写。" if all(item.get("exists") and item.get("writable") for item in path_summaries if item["key"] != "config") else "部分项目工作目录不可写，请检查权限。",
        },
        {
            "key": "runs",
            "label": "运行任务",
            "ok": len(active_runs) == 0,
            "level": "success" if len(active_runs) == 0 else "warning",
            "message": "当前没有后台运行中的轮次。" if len(active_runs) == 0 else f"当前有 {len(active_runs)} 个运行中的轮次。",
        },
    ]
    return {
        "ok": all(item["level"] != "error" for item in checks),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workspace": str(ROOT_DIR),
        "activeRunCount": len(active_runs),
        "checks": checks,
        "activeRuns": active_runs,
        "paths": path_summaries,
        "config": {
            "path": str(config_path),
            "exists": config_path.exists(),
            "offlineMode": bool(config.get("offlineMode")),
            "hasBaseUrl": bool(config.get("baseUrl")),
            "hasApiKey": bool(config.get("apiKey")),
            "model": str(config.get("model", "")),
            "apiType": str(config.get("apiType", "")),
            "promptProfile": str(config.get("promptProfile", "")),
            "promptSequence": config.get("promptSequence", []),
            "rewriteCandidateMode": str(config.get("rewriteCandidateMode", "economy")),
            "requestTimeoutSeconds": config.get("requestTimeoutSeconds"),
            "maxRetries": config.get("maxRetries"),
            "providerCount": len(providers),
            "enabledProviderCount": len(enabled_providers),
            "customRoundCount": len(custom_rounds),
        },
        "runtime": {
            "pythonVersion": sys.version.split()[0],
            "pythonExecutable": sys.executable,
            "platform": platform.platform(),
            "nodeExecutable": shutil.which("node") or "",
            "npmExecutable": shutil.which("npm") or "",
        },
    }


def parse_prompt_sequence_value(value: Any) -> list[str] | None:
    if value is None:
        return None
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return None


def run_round_async(run_id: str, source_path: str, model_config: dict[str, Any]) -> None:
    def is_cancelled() -> bool:
        state = RUN_STATES.get(run_id)
        return bool(state and state.cancel_requested)

    try:
        result = run_round_for_app(
            source_path,
            model_config,
            progress_callback=lambda event: append_progress_event(run_id, event),
            cancel_check=is_cancelled,
        )
        finalize_progress(run_id, result=result)
    except Exception as exc:
        finalize_progress(run_id, error=str(exc))


def require_query_value(key: str) -> str:
    value = request.args.get(key, "").strip()
    if not value:
        raise ValueError(f"{key} is required.")
    return value


def optional_int_query_value(key: str) -> int | None:
    raw_value = request.args.get(key, "").strip()
    if not raw_value:
        return None
    return int(raw_value)


@app.route("/api/<path:_path>", methods=["OPTIONS"])
@app.route("/api", methods=["OPTIONS"])
def options_api(_path: str | None = None) -> Response:
    return Response(status=204)


@app.after_request
def add_cors_headers(response: Response) -> Response:
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    response.headers["Access-Control-Expose-Headers"] = (
        "Content-Disposition, X-Export-Format, X-Export-Layout-Mode, "
        "X-Export-Paragraph-Source, X-Export-Format-Mode, X-Export-Format-Scope, "
        "X-Export-Content-Locked-Style-Count, X-Export-Table-Style-Count, X-Export-Table-Border-Count, "
        "X-Export-Validation-Path, X-Export-Audit-Path, X-Export-Audit-Issue-Count, "
        "X-Export-Preflight-Path, X-Export-Preflight-Issue-Count, "
        "X-Export-Guard-Path, X-Export-Guard-Issue-Count"
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/api/model-config", methods=["GET"])
def get_model_config() -> Response:
    return jsonify(load_app_config())


@app.route("/api/health", methods=["GET"])
def get_health() -> Response:
    return jsonify(build_environment_diagnostics())


@app.route("/api/model-config", methods=["POST"])
def post_model_config() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(save_app_config(payload))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/format-rules", methods=["GET"])
def get_format_rules() -> tuple[Response, int] | Response:
    try:
        return jsonify(load_active_format_rules())
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/format-rules/reset", methods=["POST"])
def post_reset_format_rules() -> tuple[Response, int] | Response:
    try:
        path = save_active_format_rules(get_default_format_rules())
        return jsonify({"ok": True, "path": str(path), "rules": load_active_format_rules()})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/format-rules/parse", methods=["POST"])
def post_parse_format_rules() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        document_text = str(payload.get("text", "")).strip()
        model_config = payload.get("modelConfig")
        if not document_text:
            raise ValueError("Format instruction text is required.")
        if model_config is not None and not isinstance(model_config, dict):
            raise ValueError("modelConfig must be an object when provided.")
        rules = parse_format_rules_from_text(document_text, model_config=model_config)
        return jsonify({"ok": True, "path": "", "rules": rules})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/format-rules/activate", methods=["POST"])
def post_activate_format_rules() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        rules = payload.get("rules")
        if not isinstance(rules, dict):
            raise ValueError("rules must be an object.")
        path = save_active_format_rules(rules)
        return jsonify({"ok": True, "path": str(path), "rules": load_active_format_rules()})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/test-connection", methods=["POST"])
def post_test_connection() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(test_model_connection(payload))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/list-models", methods=["POST"])
def post_list_models() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(list_available_models(payload))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/upload-document", methods=["POST"])
def post_upload_document() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        filename = str(payload.get("filename", "")).strip()
        encoding = str(payload.get("encoding", "text")).strip().lower()
        if encoding == "base64":
            content_base64 = str(payload.get("contentBase64", ""))
            target_path = write_uploaded_binary_file(filename, content_base64)
        else:
            content = str(payload.get("content", ""))
            target_path = write_uploaded_file(filename, content)
        return jsonify({"sourcePath": str(target_path), "filename": target_path.name}), 201
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/detection-report", methods=["POST"])
def post_detection_report() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        filename = str(payload.get("filename", "")).strip()
        content_base64 = str(payload.get("contentBase64", ""))
        provider_hint = str(payload.get("providerHint", "")).strip().lower()
        target_path = write_uploaded_detection_report(filename, content_base64)
        return jsonify(parse_detection_report_pdf(target_path, provider_hint=provider_hint)), 201
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/experiments", methods=["GET"])
def get_experiments() -> tuple[Response, int] | Response:
    try:
        doc_id = request.args.get("docId", "").strip() or None
        return jsonify(list_experiment_records(doc_id))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/experiments", methods=["POST"])
def post_experiment() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            raise ValueError("Experiment payload must be an object.")
        return jsonify(save_experiment_record(payload)), 201
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/experiments/<record_id>", methods=["DELETE"])
def delete_experiment(record_id: str) -> tuple[Response, int] | Response:
    try:
        return jsonify(delete_experiment_record(record_id))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-status", methods=["GET"])
def get_status() -> tuple[Response, int] | Response:
    try:
        prompt_profile = request.args.get("promptProfile", "cn_prewrite")
        prompt_sequence = parse_prompt_sequence_value(request.args.get("promptSequence"))
        return jsonify(
            get_document_status(
                require_query_value("sourcePath"),
                prompt_profile=prompt_profile,
                prompt_sequence=prompt_sequence,
            )
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-history", methods=["GET"])
def get_history() -> tuple[Response, int] | Response:
    try:
        return jsonify(get_document_history(require_query_value("sourcePath")))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-protection-map", methods=["GET"])
def get_protection_map() -> tuple[Response, int] | Response:
    try:
        return jsonify(get_document_protection_map(require_query_value("sourcePath")))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-documents", methods=["GET"])
def get_history_list() -> tuple[Response, int] | Response:
    try:
        return jsonify(list_document_histories())
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-orphans", methods=["POST"])
def post_history_orphan_scan() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        protected_paths = payload.get("protectedPaths", [])
        return jsonify(scan_history_orphan_artifacts(protected_paths))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-orphans", methods=["DELETE"])
def delete_history_orphans() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        protected_paths = payload.get("protectedPaths", [])
        return jsonify(delete_history_orphan_artifacts(protected_paths))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-history", methods=["DELETE"])
def delete_history() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        doc_id = str(payload.get("docId", "")).strip()
        from_round = payload.get("fromRound")
        prompt_profile = payload.get("promptProfile")
        prompt_sequence = payload.get("promptSequence")
        mode = payload.get("mode")
        if not doc_id:
            raise ValueError("docId is required.")
        if from_round is not None and not isinstance(from_round, int):
            raise ValueError("fromRound must be an integer when provided.")
        if prompt_profile is not None and not isinstance(prompt_profile, str):
            raise ValueError("promptProfile must be a string when provided.")
        if prompt_sequence is not None and not isinstance(prompt_sequence, list):
            raise ValueError("promptSequence must be a list when provided.")
        if mode is not None and not isinstance(mode, str):
            raise ValueError("mode must be a string when provided.")
        return jsonify(delete_document_history(doc_id, from_round, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence, mode=mode))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/read-output", methods=["GET"])
def get_read_output() -> tuple[Response, int] | Response:
    try:
        return jsonify(
            read_output_text(
                require_query_value("outputPath"),
                max_chars=optional_int_query_value("maxChars"),
            )
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/read-compare", methods=["GET"])
def get_read_compare() -> tuple[Response, int] | Response:
    try:
        return jsonify(read_round_compare(require_query_value("outputPath")))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/review-decisions", methods=["GET"])
def get_review_decisions() -> tuple[Response, int] | Response:
    try:
        return jsonify(load_review_decisions(require_query_value("outputPath")))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/review-decisions", methods=["POST"])
def post_review_decisions() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        output_path = str(payload.get("outputPath", "")).strip()
        decisions = payload.get("decisions")
        if not output_path:
            raise ValueError("outputPath is required.")
        if not isinstance(decisions, dict):
            raise ValueError("decisions must be an object keyed by chunk id.")
        return jsonify(save_review_decisions(output_path, decisions))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/rerun-chunk", methods=["POST"])
def post_rerun_chunk() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        output_path = str(payload.get("outputPath", "")).strip()
        chunk_id = str(payload.get("chunkId", "")).strip()
        model_config = payload.get("modelConfig")
        user_feedback = str(payload.get("userFeedback", "")).strip()
        if not output_path:
            raise ValueError("outputPath is required.")
        if not chunk_id:
            raise ValueError("chunkId is required.")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")
        return jsonify(rerun_compare_chunk(output_path, chunk_id, model_config, user_feedback=user_feedback))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/run-round", methods=["POST"])
def post_run_round() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        source_path = str(payload.get("sourcePath", "")).strip()
        model_config = payload.get("modelConfig")
        if not source_path:
            raise ValueError("sourcePath is required.")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")

        run_id, _, already_active = register_or_reuse_run(source_path)
        if already_active:
            return jsonify({"runId": run_id, "alreadyActive": True}), 202

        effective_model_config = merge_model_config_for_run(model_config)
        worker = threading.Thread(
            target=run_round_async,
            args=(run_id, normalize_source_path(source_path), effective_model_config),
            daemon=True,
        )
        worker.start()
        return jsonify({"runId": run_id, "alreadyActive": False}), 202
    except ValueError as exc:
        message = str(exc)
        status = 409 if "already has a running task" in message else 400
        return error_response(message, status=status)
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/run-round/<run_id>/cancel", methods=["POST"])
def post_cancel_run_round(run_id: str) -> tuple[Response, int] | Response:
    state = RUN_STATES.get(run_id)
    if not state:
        return error_response("Unknown run id.", 404)
    with state.condition:
        if state.completed:
            return jsonify({"ok": True, "runId": run_id, "completed": True, "status": state.status})
        state.cancel_requested = True
        state.status = "canceling"
        state.updated_at = time.time()
        state.condition.notify_all()
    append_progress_event(run_id, {"phase": "cancel-requested", "round": 0})
    return jsonify({"ok": True, "runId": run_id, "completed": False, "status": "canceling"})


@app.route("/api/run-round-status/<run_id>", methods=["GET"])
def get_run_round_status(run_id: str) -> tuple[Response, int] | Response:
    state = RUN_STATES.get(run_id)
    if not state:
        return error_response("Unknown run id.", 404)
    touch_run_state(run_id)
    return jsonify(serialize_run_state(run_id, state))


@app.route("/api/round-progress", methods=["DELETE"])
def delete_round_progress_route() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        source_path = str(payload.get("sourcePath", "")).strip()
        prompt_profile = str(payload.get("promptProfile", "cn_prewrite")).strip()
        prompt_sequence = parse_prompt_sequence_value(payload.get("promptSequence"))
        round_number = int(payload.get("roundNumber", 0) or 0)
        if not source_path or round_number <= 0:
            raise ValueError("sourcePath and roundNumber are required.")
        active_run = get_active_run_for_source(source_path)
        if active_run is not None:
            active_run_id, active_state = active_run
            return error_response(
                f"Current document has an active {active_state.status} run ({active_run_id}); cancel or wait before resetting round progress.",
                409,
            )
        return jsonify(reset_round_progress(source_path, prompt_profile, round_number, prompt_sequence=prompt_sequence))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/export-round", methods=["GET"])
def get_export_round() -> tuple[Response, int] | Response:
    try:
        output_path = require_query_value("outputPath")
        target_format = require_query_value("targetFormat")
        stem = Path(output_path).stem or "current-round"
        export_path = EXPORT_DIR / f"{stem}.{target_format}"
        result = export_round_output(output_path, str(export_path), target_format)
        file_path = Path(result["path"])
        mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if target_format == "txt":
            mimetype = "text/plain; charset=utf-8"
        response = send_file(file_path, mimetype=mimetype, as_attachment=True, download_name=file_path.name)
        response.headers["X-Export-Format"] = str(result.get("format", target_format))
        response.headers["X-Export-Layout-Mode"] = str(result.get("layoutMode", ""))
        response.headers["X-Export-Paragraph-Source"] = str(result.get("paragraphSource", ""))
        response.headers["X-Export-Format-Mode"] = str(result.get("formatMode", ""))
        response.headers["X-Export-Format-Scope"] = str(result.get("formatScope", ""))
        response.headers["X-Export-Content-Locked-Style-Count"] = str(result.get("contentLockedStyleCount", ""))
        response.headers["X-Export-Table-Style-Count"] = str(result.get("tableStyleCount", ""))
        response.headers["X-Export-Table-Border-Count"] = str(result.get("tableBorderCount", ""))
        response.headers["X-Export-Validation-Path"] = make_ascii_header_value(result.get("validationPath", ""))
        response.headers["X-Export-Audit-Path"] = make_ascii_header_value(result.get("auditPath", ""))
        response.headers["X-Export-Audit-Issue-Count"] = str(result.get("auditIssueCount", ""))
        response.headers["X-Export-Preflight-Path"] = make_ascii_header_value(result.get("preflightPath", ""))
        response.headers["X-Export-Preflight-Issue-Count"] = str(result.get("preflightIssueCount", ""))
        response.headers["X-Export-Guard-Path"] = make_ascii_header_value(result.get("guardPath", ""))
        response.headers["X-Export-Guard-Issue-Count"] = str(result.get("guardIssueCount", ""))
        return response
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/export-reviewed-round", methods=["POST"])
def post_export_reviewed_round() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        output_path = str(payload.get("outputPath", "")).strip()
        target_format = str(payload.get("targetFormat", "")).strip().lower()
        decisions = payload.get("decisions")
        if not output_path:
            raise ValueError("outputPath is required.")
        if target_format not in {"txt", "docx"}:
            raise ValueError("targetFormat must be txt or docx.")
        if not isinstance(decisions, dict):
            raise ValueError("decisions must be an object keyed by chunk id.")
        normalized_decisions = {str(chunk_id): decision for chunk_id, decision in decisions.items()}
        stem = Path(output_path).stem or "current-round"
        export_path = EXPORT_DIR / f"{stem}_reviewed.{target_format}"
        result = export_reviewed_round_output(output_path, str(export_path), target_format, normalized_decisions)
        file_path = Path(result["path"])
        mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if target_format == "txt":
            mimetype = "text/plain; charset=utf-8"
        response = send_file(file_path, mimetype=mimetype, as_attachment=True, download_name=file_path.name)
        response.headers["X-Export-Format"] = str(result.get("format", target_format))
        response.headers["X-Export-Layout-Mode"] = str(result.get("layoutMode", ""))
        response.headers["X-Export-Paragraph-Source"] = str(result.get("paragraphSource", ""))
        response.headers["X-Export-Format-Mode"] = str(result.get("formatMode", ""))
        response.headers["X-Export-Format-Scope"] = str(result.get("formatScope", ""))
        response.headers["X-Export-Content-Locked-Style-Count"] = str(result.get("contentLockedStyleCount", ""))
        response.headers["X-Export-Table-Style-Count"] = str(result.get("tableStyleCount", ""))
        response.headers["X-Export-Table-Border-Count"] = str(result.get("tableBorderCount", ""))
        response.headers["X-Export-Validation-Path"] = make_ascii_header_value(result.get("validationPath", ""))
        response.headers["X-Export-Audit-Path"] = make_ascii_header_value(result.get("auditPath", ""))
        response.headers["X-Export-Audit-Issue-Count"] = str(result.get("auditIssueCount", ""))
        response.headers["X-Export-Preflight-Path"] = make_ascii_header_value(result.get("preflightPath", ""))
        response.headers["X-Export-Preflight-Issue-Count"] = str(result.get("preflightIssueCount", ""))
        response.headers["X-Export-Guard-Path"] = make_ascii_header_value(result.get("guardPath", ""))
        response.headers["X-Export-Guard-Issue-Count"] = str(result.get("guardIssueCount", ""))
        return response
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/run-round-events/<run_id>", methods=["GET"])
def get_run_round_events(run_id: str) -> tuple[Response, int] | Response:
    state = RUN_STATES.get(run_id)
    if not state:
        return error_response("Unknown run id.", 404)

    def generate() -> Any:
        cursor = 0
        try:
            while True:
                events_to_send: list[dict[str, Any]] = []
                completed_payload: tuple[str, str] | None = None
                should_send_keepalive = False
                with state.condition:
                    touch_run_state(run_id)
                    if cursor >= len(state.events) and not state.completed:
                        state.condition.wait(timeout=SSE_KEEPALIVE_INTERVAL_SECONDS)
                        if cursor >= len(state.events) and not state.completed:
                            should_send_keepalive = True

                    while cursor < len(state.events):
                        events_to_send.append(state.events[cursor])
                        cursor += 1

                    if state.completed:
                        if state.error:
                            completed_payload = ("run-error", json.dumps({"message": state.error}, ensure_ascii=False))
                        else:
                            completed_payload = ("result", json.dumps(state.result or {}, ensure_ascii=False))

                for event in events_to_send:
                    payload = json.dumps(event, ensure_ascii=False)
                    yield f"event: progress\ndata: {payload}\n\n"

                if should_send_keepalive:
                    yield ": keepalive\n\n"

                if completed_payload:
                    event_name, payload = completed_payload
                    yield f"event: {event_name}\ndata: {payload}\n\n"
                    return
        finally:
            touch_run_state(run_id)

    response = Response(stream_with_context(generate()), mimetype="text/event-stream")
    response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Accel-Buffering"] = "no"
    return response


@app.errorhandler(404)
def not_found_api(_: Any) -> tuple[Response, int]:
    return error_response("Unknown route", 404)


def main() -> None:
    ensure_workspace_dirs()
    print("Fuck your AI detection rate Web API running at http://127.0.0.1:8765")
    app.run(host="127.0.0.1", port=8765, threaded=True)


if __name__ == "__main__":
    main()
