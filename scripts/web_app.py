from __future__ import annotations

import base64
import json
import os
import platform
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
from app_service import (
    delete_document_history,
    delete_history_orphan_artifacts,
    export_round_output,
    export_reviewed_round_output,
    get_document_history,
    get_document_protection_map,
    get_document_status,
    get_round_progress_status,
    list_available_models,
    list_document_histories,
    load_review_decisions,
    preview_document_history_delete,
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
TASK_STATE_DIR = ROOT_DIR / "finish" / "intermediate" / "task_states"
RUN_STATE_TTL_SECONDS = 1800
SSE_KEEPALIVE_INTERVAL_SECONDS = 15
TASK_STATE_RETENTION_HOURS = 168
TASK_STATE_SNAPSHOT_PREFIXES = ("run_round_", "batch_rerun_")
PROMPT_DIR = ROOT_DIR / "prompts"
PROMPT_PREVIEW_FILES: tuple[dict[str, str], ...] = (
    {
        "id": "prewrite",
        "label": "预改写",
        "description": "保守自然化",
        "relativePath": "prompts/fyadr-cn-prewrite.md",
    },
    {
        "id": "classical",
        "label": "经典改写",
        "description": "解释性慢节奏",
        "relativePath": "prompts/fyadr-cn-classical.md",
    },
    {
        "id": "round1",
        "label": "一轮",
        "description": "主体改写",
        "relativePath": "prompts/fyadr-cn-round1.md",
    },
    {
        "id": "round2",
        "label": "二轮",
        "description": "最终降痕",
        "relativePath": "prompts/fyadr-cn-round2.md",
    },
)


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


@dataclass
class BatchRerunState:
    output_path: str
    total_count: int
    status: str = "running"
    completed: bool = False
    error: str | None = None
    events: list[dict[str, Any]] = field(default_factory=list)
    result: dict[str, Any] | None = None
    cancel_requested: bool = False
    completed_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    current_index: int = 0
    current_chunk_id: str = ""
    success_chunk_ids: list[str] = field(default_factory=list)
    failures: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    condition: threading.Condition = field(default_factory=threading.Condition)


RUN_STATES: dict[str, ProgressState] = {}
ACTIVE_RUNS_BY_SOURCE: dict[str, str] = {}
BATCH_RERUN_STATES: dict[str, BatchRerunState] = {}
ACTIVE_BATCH_RERUNS_BY_OUTPUT: dict[str, str] = {}
RUN_REGISTRY_LOCK = threading.Lock()
app = Flask(__name__)


def ensure_workspace_dirs() -> None:
    ORIGIN_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    DETECTION_REPORT_DIR.mkdir(parents=True, exist_ok=True)
    TASK_STATE_DIR.mkdir(parents=True, exist_ok=True)


def error_response(message: str, status: int = 400, **extra: Any) -> tuple[Response, int]:
    payload: dict[str, Any] = {"message": message}
    payload.update({key: value for key, value in extra.items() if value is not None})
    return jsonify(payload), status


def make_ascii_header_value(value: object) -> str:
    text = str(value or "").strip()
    if not text:
        return ""
    return quote(text, safe="")


def make_ascii_header_json(value: object) -> str:
    try:
        return make_ascii_header_value(json.dumps(value or [], ensure_ascii=False, separators=(",", ":")))
    except Exception:
        return ""


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


def build_prompt_preview_item(meta: dict[str, str]) -> dict[str, Any]:
    relative_path = Path(meta["relativePath"])
    if relative_path.is_absolute() or ".." in relative_path.parts:
        raise ValueError("Invalid prompt preview path.")
    prompt_path = (ROOT_DIR / relative_path).resolve()
    if prompt_path.parent != PROMPT_DIR.resolve():
        raise ValueError("Prompt preview path must stay inside prompts directory.")
    stat = prompt_path.stat()
    return {
        "id": meta["id"],
        "label": meta["label"],
        "description": meta["description"],
        "fileName": prompt_path.name,
        "relativePath": str(relative_path).replace("\\", "/"),
        "sizeBytes": stat.st_size,
        "updatedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
        "content": prompt_path.read_text(encoding="utf-8"),
    }


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
        stale_batch_ids = [
            run_id
            for run_id, state in BATCH_RERUN_STATES.items()
            if state.completed and state.updated_at < cutoff
        ]
        for run_id in stale_batch_ids:
            BATCH_RERUN_STATES.pop(run_id, None)
        inactive_outputs = [
            output_path
            for output_path, run_id in ACTIVE_BATCH_RERUNS_BY_OUTPUT.items()
            if run_id not in BATCH_RERUN_STATES
        ]
        for output_path in inactive_outputs:
            ACTIVE_BATCH_RERUNS_BY_OUTPUT.pop(output_path, None)


def normalize_output_path(output_path: str) -> str:
    candidate = Path(output_path).expanduser()
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    if not candidate.exists():
        raise ValueError(f"Output file does not exist: {candidate}")
    return str(candidate)


def batch_rerun_state_path(run_id: str) -> Path:
    safe_run_id = "".join(char for char in run_id if char.isalnum() or char in {"-", "_"}).strip()
    if not safe_run_id:
        safe_run_id = "unknown"
    return TASK_STATE_DIR / f"batch_rerun_{safe_run_id}.json"


def run_round_state_path(run_id: str) -> Path:
    safe_run_id = "".join(char for char in run_id if char.isalnum() or char in {"-", "_"}).strip()
    if not safe_run_id:
        safe_run_id = "unknown"
    return TASK_STATE_DIR / f"run_round_{safe_run_id}.json"


def iter_task_state_snapshot_paths() -> list[Path]:
    ensure_workspace_dirs()
    paths: dict[str, Path] = {}
    try:
        for prefix in TASK_STATE_SNAPSHOT_PREFIXES:
            for path in TASK_STATE_DIR.glob(f"{prefix}*.json"):
                paths[str(path.resolve())] = path
    except OSError:
        return []
    return sorted(paths.values(), key=lambda item: item.stat().st_mtime if item.exists() else 0, reverse=True)


def task_state_snapshot_kind(path: Path) -> str:
    if path.name.startswith("run_round_"):
        return "runRound"
    if path.name.startswith("batch_rerun_"):
        return "batchRerun"
    return "unknown"


def read_task_state_snapshot(path: Path) -> dict[str, Any] | None:
    try:
        if path.parent.resolve() != TASK_STATE_DIR.resolve():
            return None
        if path.suffix.lower() != ".json" or task_state_snapshot_kind(path) == "unknown":
            return None
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def get_active_task_ids() -> set[str]:
    with RUN_REGISTRY_LOCK:
        return {
            *[run_id for run_id, state in RUN_STATES.items() if not state.completed],
            *[run_id for run_id, state in BATCH_RERUN_STATES.items() if not state.completed],
        }


def summarize_task_state_store(retention_hours: int = TASK_STATE_RETENTION_HOURS) -> dict[str, Any]:
    now = time.time()
    cutoff = now - max(1, retention_hours) * 3600
    active_ids = get_active_task_ids()
    file_count = 0
    size_bytes = 0
    run_round_count = 0
    batch_rerun_count = 0
    active_snapshot_count = 0
    stale_count = 0
    newest_mtime = 0.0
    oldest_mtime = 0.0
    for path in iter_task_state_snapshot_paths():
        try:
            stat = path.stat()
        except OSError:
            continue
        payload = read_task_state_snapshot(path) or {}
        state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
        run_id = str(state.get("runId", "")).strip() if isinstance(state, dict) else ""
        kind = task_state_snapshot_kind(path)
        file_count += 1
        size_bytes += stat.st_size
        if kind == "runRound":
            run_round_count += 1
        elif kind == "batchRerun":
            batch_rerun_count += 1
        if run_id in active_ids:
            active_snapshot_count += 1
        elif stat.st_mtime < cutoff:
            stale_count += 1
        newest_mtime = max(newest_mtime, stat.st_mtime)
        oldest_mtime = stat.st_mtime if oldest_mtime <= 0 else min(oldest_mtime, stat.st_mtime)
    return {
        "path": str(TASK_STATE_DIR),
        "fileCount": file_count,
        "sizeBytes": size_bytes,
        "runRoundCount": run_round_count,
        "batchRerunCount": batch_rerun_count,
        "activeSnapshotCount": active_snapshot_count,
        "staleCount": stale_count,
        "retentionHours": retention_hours,
        "oldestUpdatedAt": datetime.fromtimestamp(oldest_mtime, timezone.utc).isoformat().replace("+00:00", "Z") if oldest_mtime else "",
        "newestUpdatedAt": datetime.fromtimestamp(newest_mtime, timezone.utc).isoformat().replace("+00:00", "Z") if newest_mtime else "",
    }


def cleanup_task_state_snapshots(mode: str = "expired", max_age_hours: int = TASK_STATE_RETENTION_HOURS) -> dict[str, Any]:
    normalized_mode = mode if mode in {"expired", "completed", "all"} else "expired"
    normalized_hours = max(1, min(int(max_age_hours or TASK_STATE_RETENTION_HOURS), 24 * 365))
    cutoff = time.time() - normalized_hours * 3600
    active_ids = get_active_task_ids()
    before = summarize_task_state_store(normalized_hours)
    deleted_files: list[str] = []
    failed_files: list[dict[str, str]] = []
    skipped_active_count = 0
    deleted_bytes = 0

    for path in iter_task_state_snapshot_paths():
        payload = read_task_state_snapshot(path)
        if payload is None:
            continue
        state = payload.get("state") if isinstance(payload.get("state"), dict) else {}
        run_id = str(state.get("runId", "")).strip() if isinstance(state, dict) else ""
        if run_id in active_ids:
            skipped_active_count += 1
            continue
        try:
            stat = path.stat()
        except OSError as exc:
            failed_files.append({"file": path.name, "message": str(exc)})
            continue
        completed = bool(state.get("completed")) if isinstance(state, dict) else False
        should_delete = (
            normalized_mode == "all"
            or (normalized_mode == "completed" and completed)
            or (normalized_mode == "expired" and stat.st_mtime < cutoff)
        )
        if not should_delete:
            continue
        try:
            deleted_bytes += stat.st_size
            path.unlink()
            deleted_files.append(path.name)
        except OSError as exc:
            failed_files.append({"file": path.name, "message": str(exc)})

    after = summarize_task_state_store(normalized_hours)
    return {
        "ok": not failed_files,
        "mode": normalized_mode,
        "maxAgeHours": normalized_hours,
        "deletedCount": len(deleted_files),
        "deletedBytes": deleted_bytes,
        "deletedFiles": deleted_files,
        "failedFiles": failed_files,
        "skippedActiveCount": skipped_active_count,
        "before": before,
        "after": after,
    }


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_suffix(f"{path.suffix}.tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    tmp_path.replace(path)


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
    persist_run_state(run_id)
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


def sanitize_round_model_for_task_snapshot(value: Any) -> Any:
    if not isinstance(value, dict):
        return value
    sanitized = dict(value)
    for key in ("apiKey", "baseUrl", "providerId", "providerName"):
        if key in sanitized:
            sanitized[key] = ""
    if "model" in sanitized:
        sanitized["model"] = "<configured>" if sanitized.get("model") else ""
    return sanitized


def clone_json_like(value: Any) -> Any:
    try:
        return json.loads(json.dumps(value, ensure_ascii=False))
    except (TypeError, ValueError):
        return str(value)


def sanitize_run_event_for_task_snapshot(event: Any) -> Any:
    sanitized = clone_json_like(event)
    if isinstance(sanitized, dict) and "roundModel" in sanitized:
        sanitized["roundModel"] = sanitize_round_model_for_task_snapshot(sanitized.get("roundModel"))
    return sanitized


def sanitize_run_result_for_task_snapshot(result: Any) -> Any:
    if not isinstance(result, dict):
        return result
    source = clone_json_like(result)
    if not isinstance(source, dict):
        return source
    allowed_keys = {
        "round",
        "outputPath",
        "manifestPath",
        "comparePath",
        "qualityPath",
        "bodyMapPath",
        "validationPath",
        "chunkLimit",
        "inputSegmentCount",
        "outputSegmentCount",
        "paragraphCount",
        "offlineMode",
        "promptSequence",
        "qualitySummary",
        "runAudit",
    }
    sanitized = {key: source.get(key) for key in allowed_keys if key in source}
    if "roundModel" in source:
        sanitized["roundModel"] = sanitize_round_model_for_task_snapshot(source.get("roundModel"))
    return sanitized


def serialize_run_state_for_task_snapshot(run_id: str, state: ProgressState) -> dict[str, Any]:
    snapshot = serialize_run_state(run_id, state)
    snapshot["lastEvent"] = sanitize_run_event_for_task_snapshot(snapshot.get("lastEvent"))
    snapshot["result"] = sanitize_run_result_for_task_snapshot(snapshot.get("result"))
    return snapshot


def persist_run_state(run_id: str) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    try:
        write_json_atomic(
            run_round_state_path(run_id),
            {
                "kind": "runRound",
                "version": 1,
                "persistedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "state": serialize_run_state_for_task_snapshot(run_id, state),
            },
        )
    except OSError:
        # Persistence is only a recovery hint; a disk snapshot failure must not break the round.
        return


def load_recent_run_summaries(active_run_ids: set[str], limit: int = 8) -> list[dict[str, Any]]:
    ensure_workspace_dirs()
    summaries: list[dict[str, Any]] = []
    try:
        paths = sorted(TASK_STATE_DIR.glob("run_round_*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    except OSError:
        return summaries
    for path in paths:
        if len(summaries) >= limit:
            break
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        state = payload.get("state")
        if not isinstance(state, dict):
            continue
        run_id = str(state.get("runId", "")).strip()
        if not run_id or run_id in active_run_ids:
            continue
        summary = dict(state)
        summary["restoredFromDisk"] = True
        summary["persistedAt"] = payload.get("persistedAt")
        if not bool(summary.get("completed")):
            summary["completed"] = True
            summary["status"] = "interrupted"
            summary["cancelRequested"] = False
            summary["error"] = summary.get("error") or "Backend restarted before this round finished. Completed chunks were kept on disk; use continue to resume from the checkpoint."
        summaries.append(summary)
    return summaries


def load_persisted_run_summary(run_id: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(run_round_state_path(run_id).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    state = payload.get("state")
    if not isinstance(state, dict):
        return None
    if str(state.get("runId", "")).strip() != run_id:
        return None
    summary = dict(state)
    summary["restoredFromDisk"] = True
    summary["persistedAt"] = payload.get("persistedAt")
    if not bool(summary.get("completed")):
        summary["completed"] = True
        summary["status"] = "interrupted"
        summary["cancelRequested"] = False
        summary["error"] = summary.get("error") or "Backend restarted before this round finished. Completed chunks were kept on disk; use continue to resume from the checkpoint."
    return summary


def append_progress_event(run_id: str, event: dict[str, Any]) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.events.append(event)
        state.updated_at = time.time()
        state.condition.notify_all()
    persist_run_state(run_id)


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
    persist_run_state(run_id)
    release_active_run(run_id)


def register_batch_rerun(output_path: str, total_count: int) -> tuple[str, BatchRerunState]:
    prune_run_states()
    normalized_output_path = normalize_output_path(output_path)
    with RUN_REGISTRY_LOCK:
        active_run_id = ACTIVE_BATCH_RERUNS_BY_OUTPUT.get(normalized_output_path)
        if active_run_id:
            active_state = BATCH_RERUN_STATES.get(active_run_id)
            if active_state and not active_state.completed:
                raise ValueError("This output already has a running batch rerun task. Please wait or cancel it first.")
            ACTIVE_BATCH_RERUNS_BY_OUTPUT.pop(normalized_output_path, None)

        run_id = uuid.uuid4().hex
        state = BatchRerunState(output_path=normalized_output_path, total_count=total_count)
        BATCH_RERUN_STATES[run_id] = state
        ACTIVE_BATCH_RERUNS_BY_OUTPUT[normalized_output_path] = run_id
        persist_batch_rerun_state(run_id)
        return run_id, state


def get_active_batch_rerun(output_path: str) -> tuple[str, BatchRerunState] | None:
    prune_run_states()
    normalized_output_path = normalize_output_path(output_path)
    with RUN_REGISTRY_LOCK:
        active_run_id = ACTIVE_BATCH_RERUNS_BY_OUTPUT.get(normalized_output_path)
        if not active_run_id:
            return None
        active_state = BATCH_RERUN_STATES.get(active_run_id)
        if active_state and not active_state.completed:
            return active_run_id, active_state
        ACTIVE_BATCH_RERUNS_BY_OUTPUT.pop(normalized_output_path, None)
    return None


def register_or_reuse_batch_rerun(output_path: str, total_count: int) -> tuple[str, BatchRerunState, bool]:
    active_run = get_active_batch_rerun(output_path)
    if active_run is not None:
        run_id, state = active_run
        return run_id, state, True
    run_id, state = register_batch_rerun(output_path, total_count)
    return run_id, state, False


def touch_batch_rerun_state(run_id: str) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if state is None:
        return
    state.updated_at = time.time()


def release_active_batch_rerun(run_id: str) -> None:
    with RUN_REGISTRY_LOCK:
        state = BATCH_RERUN_STATES.get(run_id)
        if not state:
            return
        if ACTIVE_BATCH_RERUNS_BY_OUTPUT.get(state.output_path) == run_id:
            ACTIVE_BATCH_RERUNS_BY_OUTPUT.pop(state.output_path, None)


def serialize_batch_rerun_state(run_id: str, state: BatchRerunState) -> dict[str, Any]:
    return {
        "ok": True,
        "runId": run_id,
        "outputPath": state.output_path,
        "status": state.status,
        "completed": state.completed,
        "cancelRequested": state.cancel_requested,
        "totalCount": state.total_count,
        "completedCount": state.completed_count,
        "successCount": state.success_count,
        "failureCount": state.failure_count,
        "currentIndex": state.current_index,
        "currentChunkId": state.current_chunk_id,
        "successChunkIds": state.success_chunk_ids,
        "failures": state.failures,
        "eventCount": len(state.events),
        "lastEvent": state.events[-1] if state.events else None,
        "result": state.result,
        "error": state.error,
        "createdAt": datetime.fromtimestamp(state.created_at, timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.fromtimestamp(state.updated_at, timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def find_compare_chunk(compare_payload: Any, chunk_id: str) -> dict[str, Any] | None:
    if not isinstance(compare_payload, dict):
        return None
    chunks = compare_payload.get("chunks")
    if not isinstance(chunks, list):
        return None
    for chunk in chunks:
        if isinstance(chunk, dict) and str(chunk.get("chunkId", "")) == chunk_id:
            return chunk
    return None


def normalize_rejected_candidates_for_failure(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    candidates: list[dict[str, Any]] = []
    for candidate in value[-4:]:
        if not isinstance(candidate, dict):
            continue
        output_text = str(candidate.get("outputText", "") or "")
        if not output_text.strip():
            continue
        candidates.append(
            {
                "attempt": candidate.get("attempt"),
                "candidate": candidate.get("candidate"),
                "outputText": output_text,
                "outputCharCount": candidate.get("outputCharCount", len(output_text)),
                "truncated": bool(candidate.get("truncated")),
                "error": str(candidate.get("error", "") or ""),
            }
        )
    return candidates


def build_batch_rerun_failure(
    chunk_id: str,
    error: str,
    output_path: str,
    latest_compare: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    failure: dict[str, Any] = {"chunkId": chunk_id, "error": error}
    compare_payload = latest_compare if isinstance(latest_compare, dict) else None
    chunk = find_compare_chunk(compare_payload, chunk_id)
    if chunk is None or not normalize_rejected_candidates_for_failure(chunk.get("rejectedCandidates")):
        try:
            disk_compare = read_round_compare(output_path)
            disk_chunk = find_compare_chunk(disk_compare, chunk_id)
            if disk_chunk is not None:
                compare_payload = disk_compare
                chunk = disk_chunk
        except Exception:
            compare_payload = latest_compare if isinstance(latest_compare, dict) else None
            chunk = find_compare_chunk(compare_payload, chunk_id)
    if chunk:
        rejected_candidates = normalize_rejected_candidates_for_failure(chunk.get("rejectedCandidates"))
        if rejected_candidates:
            failure["rejectedCandidates"] = rejected_candidates
        if chunk.get("rerunStatus"):
            failure["rerunStatus"] = chunk.get("rerunStatus")
        if chunk.get("rerunFallbackMode"):
            failure["rerunFallbackMode"] = chunk.get("rerunFallbackMode")
        if chunk.get("rerunFallbackError"):
            failure["rerunFallbackError"] = chunk.get("rerunFallbackError")
        quality = chunk.get("quality")
        if isinstance(quality, dict):
            failure["quality"] = {
                key: quality.get(key)
                for key in ("needsReview", "flags", "advisoryFlags", "reviewReasons", "rewriteAdvice")
                if key in quality
            }
    return failure, compare_payload


def persist_batch_rerun_state(run_id: str) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    try:
        write_json_atomic(
            batch_rerun_state_path(run_id),
            {
                "kind": "batchRerun",
                "version": 1,
                "persistedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "state": serialize_batch_rerun_state(run_id, state),
            },
        )
    except OSError:
        # Persistence is a recovery aid only; never break the running task because disk snapshots failed.
        return


def load_recent_batch_rerun_summaries(active_run_ids: set[str], limit: int = 8) -> list[dict[str, Any]]:
    ensure_workspace_dirs()
    summaries: list[dict[str, Any]] = []
    try:
        paths = sorted(TASK_STATE_DIR.glob("batch_rerun_*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    except OSError:
        return summaries
    for path in paths:
        if len(summaries) >= limit:
            break
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        state = payload.get("state")
        if not isinstance(state, dict):
            continue
        run_id = str(state.get("runId", "")).strip()
        if not run_id or run_id in active_run_ids:
            continue
        summary = dict(state)
        summary["restoredFromDisk"] = True
        summary["persistedAt"] = payload.get("persistedAt")
        if not bool(summary.get("completed")):
            summary["completed"] = True
            summary["status"] = "interrupted"
            summary["cancelRequested"] = False
            summary["error"] = summary.get("error") or "Backend restarted before this batch rerun finished. Completed chunks were already written to disk."
        summaries.append(summary)
    return summaries


def load_persisted_batch_rerun_summary(run_id: str) -> dict[str, Any] | None:
    try:
        payload = json.loads(batch_rerun_state_path(run_id).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    state = payload.get("state")
    if not isinstance(state, dict):
        return None
    if str(state.get("runId", "")).strip() != run_id:
        return None
    summary = dict(state)
    summary["restoredFromDisk"] = True
    summary["persistedAt"] = payload.get("persistedAt")
    if not bool(summary.get("completed")):
        summary["completed"] = True
        summary["status"] = "interrupted"
        summary["cancelRequested"] = False
        summary["error"] = summary.get("error") or "Backend restarted before this batch rerun finished. Completed chunks were already written to disk."
    return summary


def append_batch_rerun_event(run_id: str, event: dict[str, Any]) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.events.append(event)
        state.updated_at = time.time()
        state.condition.notify_all()
    persist_batch_rerun_state(run_id)


def finalize_batch_rerun(run_id: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.result = result
        state.error = error
        if error:
            state.status = "canceled" if state.cancel_requested else "failed"
        elif result and result.get("canceled"):
            state.status = "canceled"
        else:
            state.status = "completed"
        state.completed = True
        state.updated_at = time.time()
        state.condition.notify_all()
    persist_batch_rerun_state(run_id)
    release_active_batch_rerun(run_id)


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
    active_batch_reruns: list[dict[str, Any]] = []
    with RUN_REGISTRY_LOCK:
        for run_id, state in RUN_STATES.items():
            if state.completed:
                continue
            active_runs.append(serialize_run_state(run_id, state))
        for run_id, state in BATCH_RERUN_STATES.items():
            if state.completed:
                continue
            active_batch_reruns.append(serialize_batch_rerun_state(run_id, state))
    recent_runs = load_recent_run_summaries({str(item.get("runId", "")) for item in active_runs})
    recent_batch_reruns = load_recent_batch_rerun_summaries({str(item.get("runId", "")) for item in active_batch_reruns})
    task_state_store = summarize_task_state_store()
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
            "ok": len(active_runs) + len(active_batch_reruns) == 0,
            "level": "success" if len(active_runs) + len(active_batch_reruns) == 0 else "warning",
            "message": "当前没有后台运行中的任务。" if len(active_runs) + len(active_batch_reruns) == 0 else f"当前有 {len(active_runs)} 个运行中的轮次，{len(active_batch_reruns)} 个批量重跑任务。",
        },
    ]
    return {
        "ok": all(item["level"] != "error" for item in checks),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "workspace": str(ROOT_DIR),
        "activeRunCount": len(active_runs),
        "activeBatchRerunCount": len(active_batch_reruns),
        "recentRunCount": len(recent_runs),
        "recentBatchRerunCount": len(recent_batch_reruns),
        "checks": checks,
        "activeRuns": active_runs,
        "activeBatchReruns": active_batch_reruns,
        "recentRuns": recent_runs,
        "recentBatchReruns": recent_batch_reruns,
        "taskStateStore": task_state_store,
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


def batch_rerun_async(run_id: str, output_path: str, targets: list[dict[str, str]], model_config: dict[str, Any]) -> None:
    current_output_path = output_path
    compare_path = ""
    latest_compare: dict[str, Any] | None = None
    try:
        for index, target in enumerate(targets, start=1):
            state = BATCH_RERUN_STATES.get(run_id)
            if not state:
                return
            chunk_id = str(target.get("chunkId", "")).strip()
            if not chunk_id:
                continue
            with state.condition:
                if state.cancel_requested:
                    break
                state.status = "running"
                state.current_index = index
                state.current_chunk_id = chunk_id
                state.updated_at = time.time()
                state.condition.notify_all()
            append_batch_rerun_event(
                run_id,
                {
                    "phase": "chunk-start",
                    "index": index,
                    "total": len(targets),
                    "chunkId": chunk_id,
                },
            )
            try:
                result = rerun_compare_chunk(
                    current_output_path,
                    chunk_id,
                    model_config,
                    user_feedback=str(target.get("userFeedback", "") or ""),
                )
                current_output_path = str(result.get("outputPath", current_output_path) or current_output_path)
                compare_path = str(result.get("comparePath", compare_path) or compare_path)
                latest_compare = result.get("compare") if isinstance(result.get("compare"), dict) else latest_compare
                with state.condition:
                    state.completed_count += 1
                    state.success_count += 1
                    if chunk_id not in state.success_chunk_ids:
                        state.success_chunk_ids.append(chunk_id)
                    state.updated_at = time.time()
                    state.condition.notify_all()
                append_batch_rerun_event(
                    run_id,
                    {
                        "phase": "chunk-complete",
                        "index": index,
                        "total": len(targets),
                        "chunkId": chunk_id,
                    },
                )
            except Exception as exc:
                failure, failure_compare = build_batch_rerun_failure(chunk_id, str(exc), current_output_path, latest_compare)
                if isinstance(failure_compare, dict):
                    latest_compare = failure_compare
                with state.condition:
                    state.completed_count += 1
                    state.failure_count += 1
                    state.failures.append(failure)
                    state.updated_at = time.time()
                    state.condition.notify_all()
                append_batch_rerun_event(
                    run_id,
                    {
                        "phase": "chunk-failed",
                        "index": index,
                        "total": len(targets),
                        "chunkId": chunk_id,
                        "error": str(exc),
                        "rejectedCandidates": failure.get("rejectedCandidates", []),
                    },
                )

        state = BATCH_RERUN_STATES.get(run_id)
        if not state:
            return
        canceled = bool(state.cancel_requested)
        if not latest_compare:
            try:
                latest_compare = read_round_compare(current_output_path)
            except Exception:
                latest_compare = None
        result_payload = {
            "ok": True,
            "runId": run_id,
            "outputPath": current_output_path,
            "comparePath": compare_path,
            "compare": latest_compare,
            "successChunkIds": state.success_chunk_ids,
            "totalCount": state.total_count,
            "completedCount": state.completed_count,
            "successCount": state.success_count,
            "failureCount": state.failure_count,
            "canceled": canceled,
            "failures": state.failures,
        }
        append_batch_rerun_event(
            run_id,
            {
                "phase": "batch-canceled" if canceled else "batch-complete",
                "total": state.total_count,
                "completed": state.completed_count,
                "success": state.success_count,
                "failure": state.failure_count,
            },
        )
        finalize_batch_rerun(run_id, result=result_payload)
    except Exception as exc:
        finalize_batch_rerun(run_id, error=str(exc))


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
        "X-Export-Guard-Path, X-Export-Guard-Issue-Count, "
        "X-Export-Guard-Issue-Samples, X-Export-Audit-Issue-Samples, X-Export-Preflight-Issue-Samples"
    )
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.route("/api/model-config", methods=["GET"])
def get_model_config() -> Response:
    return jsonify(load_app_config())


@app.route("/api/prompts", methods=["GET"])
def get_prompts() -> tuple[Response, int] | Response:
    try:
        return jsonify(
            {
                "ok": True,
                "promptDir": "prompts",
                "items": [build_prompt_preview_item(item) for item in PROMPT_PREVIEW_FILES],
            }
        )
    except Exception as exc:
        return error_response(str(exc), 500)


@app.route("/api/ping", methods=["GET"])
def get_ping() -> Response:
    return jsonify(
        {
            "ok": True,
            "service": "fyadr-web",
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
    )


@app.route("/api/health", methods=["GET"])
def get_health() -> Response:
    return jsonify(build_environment_diagnostics())


@app.route("/api/task-state-snapshots/cleanup", methods=["POST"])
def post_cleanup_task_state_snapshots() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        mode = str(payload.get("mode", "expired")).strip() or "expired"
        max_age_hours = int(payload.get("maxAgeHours", TASK_STATE_RETENTION_HOURS) or TASK_STATE_RETENTION_HOURS)
        return jsonify(cleanup_task_state_snapshots(mode=mode, max_age_hours=max_age_hours))
    except Exception as exc:
        return error_response(str(exc))


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


@app.route("/api/document-history/impact", methods=["POST"])
def preview_history_delete() -> tuple[Response, int] | Response:
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
        return jsonify(
            preview_document_history_delete(
                doc_id,
                from_round,
                prompt_profile=prompt_profile,
                prompt_sequence=prompt_sequence,
                mode=mode,
            )
        )
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
    output_path = ""
    chunk_id = ""
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
        failure: dict[str, Any] | None = None
        if output_path and chunk_id:
            failure, _ = build_batch_rerun_failure(chunk_id, str(exc), output_path)
        return error_response(str(exc), failure=failure)


@app.route("/api/batch-rerun", methods=["POST"])
def post_batch_rerun() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        output_path = str(payload.get("outputPath", "")).strip()
        targets_payload = payload.get("targets")
        model_config = payload.get("modelConfig")
        if not output_path:
            raise ValueError("outputPath is required.")
        if not isinstance(targets_payload, list) or not targets_payload:
            raise ValueError("targets must be a non-empty list.")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")

        targets: list[dict[str, str]] = []
        seen_chunk_ids: set[str] = set()
        for item in targets_payload:
            if not isinstance(item, dict):
                raise ValueError("Each batch rerun target must be an object.")
            chunk_id = str(item.get("chunkId", "")).strip()
            if not chunk_id:
                raise ValueError("Each batch rerun target requires chunkId.")
            if chunk_id in seen_chunk_ids:
                continue
            seen_chunk_ids.add(chunk_id)
            targets.append(
                {
                    "chunkId": chunk_id,
                    "userFeedback": str(item.get("userFeedback", "") or ""),
                }
            )
        if not targets:
            raise ValueError("No valid batch rerun targets were provided.")

        run_id, _, already_active = register_or_reuse_batch_rerun(output_path, len(targets))
        if already_active:
            return jsonify({"runId": run_id, "alreadyActive": True}), 202

        effective_model_config = merge_model_config_for_run(model_config)
        worker = threading.Thread(
            target=batch_rerun_async,
            args=(run_id, normalize_output_path(output_path), targets, effective_model_config),
            daemon=True,
        )
        worker.start()
        return jsonify({"runId": run_id, "alreadyActive": False}), 202
    except ValueError as exc:
        message = str(exc)
        status = 409 if "running batch rerun task" in message else 400
        return error_response(message, status=status)
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/batch-rerun/<run_id>/cancel", methods=["POST"])
def post_cancel_batch_rerun(run_id: str) -> tuple[Response, int] | Response:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        persisted = load_persisted_batch_rerun_summary(run_id)
        if persisted:
            return jsonify({"ok": True, "runId": run_id, "completed": True, "status": persisted.get("status"), "restoredFromDisk": True})
        return error_response("Unknown batch rerun id.", 404)
    with state.condition:
        if state.completed:
            return jsonify({"ok": True, "runId": run_id, "completed": True, "status": state.status})
        state.cancel_requested = True
        state.status = "canceling"
        state.updated_at = time.time()
        state.condition.notify_all()
    append_batch_rerun_event(run_id, {"phase": "cancel-requested"})
    return jsonify({"ok": True, "runId": run_id, "completed": False, "status": "canceling"})


@app.route("/api/batch-rerun-status/<run_id>", methods=["GET"])
def get_batch_rerun_status(run_id: str) -> tuple[Response, int] | Response:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        persisted = load_persisted_batch_rerun_summary(run_id)
        if persisted:
            return jsonify(persisted)
        return error_response("Unknown batch rerun id.", 404)
    touch_batch_rerun_state(run_id)
    return jsonify(serialize_batch_rerun_state(run_id, state))


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
        persisted = load_persisted_run_summary(run_id)
        if persisted:
            return jsonify({"ok": True, "runId": run_id, "completed": True, "status": persisted.get("status"), "restoredFromDisk": True})
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
        persisted = load_persisted_run_summary(run_id)
        if persisted:
            return jsonify(persisted)
        return error_response("Unknown run id.", 404)
    touch_run_state(run_id)
    return jsonify(serialize_run_state(run_id, state))


@app.route("/api/round-progress-status", methods=["GET"])
def get_round_progress_status_route() -> tuple[Response, int] | Response:
    try:
        source_path = require_query_value("sourcePath")
        prompt_profile = request.args.get("promptProfile", "cn_prewrite")
        prompt_sequence = parse_prompt_sequence_value(request.args.get("promptSequence"))
        round_number = optional_int_query_value("roundNumber")
        status = get_round_progress_status(
            source_path,
            prompt_profile,
            round_number=round_number,
            prompt_sequence=prompt_sequence,
        )
        active_run = get_active_run_for_source(source_path)
        if active_run is not None:
            active_run_id, active_state = active_run
            status["activeRun"] = serialize_run_state(active_run_id, active_state)
        else:
            status["activeRun"] = None
        return jsonify(status)
    except Exception as exc:
        return error_response(str(exc))


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
        response.headers["X-Export-Guard-Issue-Samples"] = make_ascii_header_json(result.get("guardIssueSamples", []))
        response.headers["X-Export-Audit-Issue-Samples"] = make_ascii_header_json(result.get("auditIssueSamples", []))
        response.headers["X-Export-Preflight-Issue-Samples"] = make_ascii_header_json(result.get("preflightIssueSamples", []))
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
        response.headers["X-Export-Guard-Issue-Samples"] = make_ascii_header_json(result.get("guardIssueSamples", []))
        response.headers["X-Export-Audit-Issue-Samples"] = make_ascii_header_json(result.get("auditIssueSamples", []))
        response.headers["X-Export-Preflight-Issue-Samples"] = make_ascii_header_json(result.get("preflightIssueSamples", []))
        return response
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/run-round-events/<run_id>", methods=["GET"])
def get_run_round_events(run_id: str) -> tuple[Response, int] | Response:
    state = RUN_STATES.get(run_id)
    if not state:
        persisted = load_persisted_run_summary(run_id)
        if persisted:
            if persisted.get("error"):
                payload = json.dumps({"message": persisted.get("error")}, ensure_ascii=False)
                event_name = "run-error"
            else:
                payload = json.dumps(persisted.get("result") or {}, ensure_ascii=False)
                event_name = "result"
            response = Response(f"event: {event_name}\ndata: {payload}\n\n", mimetype="text/event-stream")
            response.headers["Cache-Control"] = "no-cache"
            response.headers["X-Accel-Buffering"] = "no"
            return response
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
