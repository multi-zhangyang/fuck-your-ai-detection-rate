from __future__ import annotations

import base64
import copy
from hashlib import sha256
import json
import math
import os
import platform
import re
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from flask import Flask, Response, jsonify, request, send_file, send_from_directory, stream_with_context
from werkzeug.exceptions import RequestEntityTooLarge

# gzip for /api JSON + served static assets. Optional: only the production
# Docker image installs flask-compress; local dev can run without it (no gzip),
# so import lazily and no-op when absent rather than failing to start.
try:
    from flask_compress import Compress
except ImportError:  # pragma: no cover - local dev without flask-compress
    Compress = None  # type: ignore[assignment]

from app_config import get_app_config_path, hydrate_app_config_secrets, load_app_config, redact_app_config, save_app_config
from path_utils import is_path_under, truncate_utf8_filename_component
from app_service import (
    DocumentReleaseGateError,
    ExportRoundError,
    InconsistentReviewStateError,
    MAX_REWRITE_CONCURRENCY,
    MIN_REWRITE_REQUEST_TIMEOUT_SECONDS,
    PARENT_INPUT_BINDING_FIELDS,
    ReviewRevisionRequiredError,
    RoundInputRevisionRequiredError,
    RoundArtifactSnapshotError,
    StaleReviewDecisionsError,
    StaleRoundInputError,
    StaleRateAuditStrategyPlanError,
    backup_history_database_governance,
    check_history_database_governance,
    compact_history_database_governance,
    delete_document_history,
    delete_history_orphan_artifacts,
    ensure_history_database_ready,
    execute_rate_audit_strategy,
    export_round_output,
    find_conflicting_history_route,
    get_document_history,
    get_document_protection_map,
    get_document_scope_diagnostics,
    get_document_status,
    get_output_rerun_lock,
    get_document_rate_audit,
    get_history_database_maintenance_summary,
    get_round_progress_status,
    list_available_models,
    list_document_histories,
    load_review_decisions,
    preview_document_history_delete,
    preflight_run_round_input,
    read_output_text,
    read_round_artifact_snapshot,
    read_round_compare,
    query_history_artifact_governance,
    recover_history_database_governance,
    repair_history_database_governance,
    rerun_compare_chunk,
    reset_round_progress,
    run_round_for_app,
    save_review_decisions,
    scan_history_orphan_artifacts,
    test_model_connection,
    validate_rate_audit_strategy_request,
    list_history_database_backups,
    _normalize_compare_failed_attempts,
)
from fyadr_round_service import (
    _classify_failed_attempt_diagnostic,
    _normalize_failed_attempt_evidence,
    _public_candidate_selection_event,
    _sanitize_public_diagnostic_value,
)
from fyadr_history_db import DEFAULT_BACKUP_KEEP, coerce_backup_keep
from prompt_library import (
    DEFAULT_PROMPT_PROFILE,
    create_prompt,
    delete_prompt,
    list_prompt_backups,
    list_prompt_preview_items,
    list_prompt_workflows,
    restore_default_prompt,
    restore_prompt_backup,
    save_prompt_content,
    update_prompt_metadata,
    update_prompt_workflow,
)
from runtime_error_safety import public_provider_error_message
from web_auth import configure_auth


ROOT_DIR = Path(__file__).resolve().parents[1]
ORIGIN_DIR = ROOT_DIR / "origin"
EXPORT_DIR = ROOT_DIR / "finish" / "web_exports"
TASK_STATE_DIR = ROOT_DIR / "finish" / "intermediate" / "task_states"
RUN_STATE_TTL_SECONDS = 1800
SSE_KEEPALIVE_INTERVAL_SECONDS = 15
TASK_STATE_RETENTION_HOURS = 168
TASK_STATE_TEMP_RETENTION_HOURS = 1
TASK_STATE_SELF_HEAL_INTERVAL_SECONDS = 60
TASK_STATE_SNAPSHOT_PREFIXES = ("run_round_", "batch_rerun_")
DEFAULT_MAX_REQUEST_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_UPLOAD_BYTES = 40 * 1024 * 1024
# In production (Docker) the server must listen on all interfaces so the
# container port can be published. Override with WEB_HOST/WEB_PORT env vars.
WEB_HOST = os.getenv("WEB_HOST", "127.0.0.1")
WEB_PORT = int(os.getenv("WEB_PORT", "8765"))
FRONTEND_DEV_PORT = 1420

# Directory that holds the production frontend build (app/dist) served by Flask
# in single-container deployments. Empty => not served (frontend runs elsewhere).
WEB_STATIC_DIR = os.getenv("WEB_STATIC_DIR", "").strip()
# Windows MIME registration is machine-dependent and does not consistently
# recognize modern image formats. Keep production assets deterministic instead
# of relying on a runner or end user's registry for formats the UI ships.
FRONTEND_ASSET_MIME_TYPES = {
    ".webp": "image/webp",
}


def _local_origin(port: int) -> set[str]:
    return {f"http://127.0.0.1:{port}", f"http://localhost:{port}"}


@dataclass
class ProgressState:
    source_path: str
    expected_previous_compare_revision: str = ""
    expected_parent_input_binding: dict[str, str] = field(default_factory=dict)
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
    preserved_attempts: list[dict[str, Any]] = field(default_factory=list)
    failures: list[dict[str, Any]] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    condition: threading.Condition = field(default_factory=threading.Condition)


class RunRegistry:
    """Single owner of in-flight run/batch-rerun state and its lock.

    Before this class existed, four module-level dicts (``RUN_STATES``,
    ``ACTIVE_RUNS_BY_SOURCE``, ``BATCH_RERUN_STATES``,
    ``ACTIVE_BATCH_RERUNS_BY_OUTPUT``) and ``RUN_REGISTRY_LOCK`` were scattered
    as bare globals. Every access had to remember to take the same lock and to
    keep the four maps mutually consistent. This class gives that state one
    home so the lifecycle rules live next to the data.

    The maps themselves are still plain dict instances (not private copies) so
    existing inline call sites and regression tests that mutate them directly
    keep working — the registry is the owner, the module-level names below are
    backward-compatible aliases for the same dict objects.
    """

    def __init__(self) -> None:
        self.run_states: dict[str, ProgressState] = {}
        self.active_runs_by_source: dict[str, str] = {}
        self.batch_rerun_states: dict[str, BatchRerunState] = {}
        self.active_batch_reruns_by_output: dict[str, str] = {}
        self.lock = threading.Lock()

    def prune_stale(self, cutoff: float) -> None:
        """Drop completed runs and orphaned source/output lookups past ``cutoff``.

        Must be called under ``self.lock``; callers already hold it through the
        registry's lock, so this only mutates the maps.
        """
        stale_run_ids = [
            run_id
            for run_id, state in self.run_states.items()
            if state.completed and state.updated_at < cutoff
        ]
        for run_id in stale_run_ids:
            self.run_states.pop(run_id, None)
        inactive_sources = [
            source_path
            for source_path, run_id in self.active_runs_by_source.items()
            if run_id not in self.run_states
        ]
        for source_path in inactive_sources:
            self.active_runs_by_source.pop(source_path, None)
        stale_batch_ids = [
            run_id
            for run_id, state in self.batch_rerun_states.items()
            if state.completed and state.updated_at < cutoff
        ]
        for run_id in stale_batch_ids:
            self.batch_rerun_states.pop(run_id, None)
        inactive_outputs = [
            output_path
            for output_path, run_id in self.active_batch_reruns_by_output.items()
            if run_id not in self.batch_rerun_states
        ]
        for output_path in inactive_outputs:
            self.active_batch_reruns_by_output.pop(output_path, None)


RUN_REGISTRY = RunRegistry()

# Backward-compatible module-level aliases. These are the *same* dict objects
# and lock instance the registry owns, so inline call sites and regression
# tests that read or mutate them directly keep working unchanged.
RUN_STATES: dict[str, ProgressState] = RUN_REGISTRY.run_states
ACTIVE_RUNS_BY_SOURCE: dict[str, str] = RUN_REGISTRY.active_runs_by_source
BATCH_RERUN_STATES: dict[str, BatchRerunState] = RUN_REGISTRY.batch_rerun_states
ACTIVE_BATCH_RERUNS_BY_OUTPUT: dict[str, str] = RUN_REGISTRY.active_batch_reruns_by_output
RUN_REGISTRY_LOCK = RUN_REGISTRY.lock
TASK_STATE_SELF_HEAL_LOCK = threading.Lock()
TASK_STATE_SELF_HEAL_CACHE: dict[str, Any] | None = None
TASK_STATE_SELF_HEAL_CACHE_AT = 0.0
RUN_AUTO_RETRY_DELAY_SECONDS = 10
RUN_AUTO_RETRY_MAX_ATTEMPTS = 3
RUN_AUTO_NEXT_ROUND_DELAY_SECONDS = 60
INCOMPLETE_RUN_RESULT_MESSAGE = "本轮结果不完整：未生成有效输出或 Diff，不能视为已完成。"
app = Flask(__name__)


def _read_byte_limit_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def create_app() -> Flask:
    """Application factory.

    Centralizes Flask app construction: the request-size cap, CORS preflight
    handler, and the workspace/history readiness bootstrap all live here so the
    server entry point (``main``) and tests can build a configured app the same
    way. The module-level ``app`` is itself the product of this factory, so the
    ``@app.route`` decorators below still bind to the same instance.
    """
    app.config["MAX_CONTENT_LENGTH"] = _read_byte_limit_env("FYADR_MAX_REQUEST_BYTES", DEFAULT_MAX_REQUEST_BYTES)
    # gzip for both /api JSON and served static assets (low-latency public access).
    # Only the production Docker image installs flask-compress; in local dev it
    # is absent and gzip is simply skipped (no crash).
    if Compress is not None and app.extensions.get("fyadr_compress_initialized") is not True:
        Compress(app)
        app.extensions["fyadr_compress_initialized"] = True
    # Optional single-user authentication is installed once and reloaded when
    # tests or an embedding process call the factory with a changed environment.
    # With no auth password source configured this is a no-op for API access.
    configure_auth(app)
    return app


app = create_app()


def ensure_workspace_dirs() -> None:
    ORIGIN_DIR.mkdir(parents=True, exist_ok=True)
    EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    TASK_STATE_DIR.mkdir(parents=True, exist_ok=True)


_SENSITIVE_MESSAGE_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Absolute POSIX paths rooted under a user/system directory.
    (re.compile(r"(?<![A-Za-z0-9])(/(?:root|home|tmp|Users|var|opt|etc|mnt)[A-Za-z0-9_./\-]+(?:[ ][A-Za-z0-9_./\-]+)*[A-Za-z0-9_./\-])"), "<path>"),
    # Windows drive paths rooted under a user directory.
    (re.compile(r"(?<![A-Za-z0-9])([A-Za-z]:\\[A-Za-z0-9_.\\\-]+(?:[ ][A-Za-z0-9_.\\\-]+)*[A-Za-z0-9_.\\\-])"), "<path>"),
    # API-key-like tokens (api_key=..., token: ..., Bearer ...)
    (re.compile(r"(?i)(api[_-]?key|token|secret|bearer|authorization)[\"\']?\s*[:=]\s*[\"\']?[A-Za-z0-9_\-]{12,}"), r"\1=<redacted>"),
    # Bare sk-... style keys
    (re.compile(r"sk-[A-Za-z0-9_\-]{16,}"), "<redacted>"),
)


def sanitize_error_message(message: str) -> str:
    """Strip absolute paths and secret-like tokens before returning to the client.

    Local validation messages (e.g. "Output file does not exist: <path>") keep
    their sentence; only the path/secret tokens are masked. This closes the
    information-leak window where raw exceptions echo the server's filesystem
    layout or upstream credentials to the browser.
    """

    sanitized = message
    for pattern, replacement in _SENSITIVE_MESSAGE_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)
    return sanitized


def error_response(message: str, status: int = 400, **extra: Any) -> tuple[Response, int]:
    safe_message = sanitize_error_message(message)
    if safe_message != message:
        # The original message may carry diagnostic detail we do not want to
        # lose; print it server-side so operators can still debug.
        print(f"[error_response {status}] raw={message!r} safe={safe_message!r}", file=sys.stderr)
    payload: dict[str, Any] = {"message": safe_message}
    payload.update({key: value for key, value in extra.items() if value is not None})
    return jsonify(payload), status


@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(_exc: RequestEntityTooLarge) -> tuple[Response, int]:
    limit_mb = app.config.get("MAX_CONTENT_LENGTH", DEFAULT_MAX_REQUEST_BYTES) / (1024 * 1024)
    return error_response(f"Request body is too large. Limit: {limit_mb:.0f} MB.", 413)


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
    candidate = Path(str(filename or "").replace("\\", "/")).name.strip()
    if not candidate or candidate in {".", ".."} or "\x00" in candidate:
        raise ValueError("Filename is required.")
    return candidate


def _max_upload_bytes() -> int:
    return _read_byte_limit_env("FYADR_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES)


def _assert_upload_size(size_bytes: int, *, label: str) -> None:
    limit = _max_upload_bytes()
    if size_bytes > limit:
        raise ValueError(f"{label} is too large. Limit: {limit // (1024 * 1024)} MB.")


def _decode_upload_base64(content_base64: str, *, label: str) -> bytes:
    compact = "".join(str(content_base64 or "").split())
    estimated_size = (len(compact) * 3) // 4
    _assert_upload_size(estimated_size, label=label)
    try:
        data = base64.b64decode(compact, validate=True)
    except Exception as exc:
        raise ValueError(f"{label} is not valid base64.") from exc
    _assert_upload_size(len(data), label=label)
    return data


def _verify_existing_content_addressed_upload(target_path: Path, data: bytes, digest: str) -> None:
    if target_path.is_symlink() or not target_path.is_file():
        raise ValueError("Upload target already exists but is not a regular file.")
    try:
        if target_path.stat().st_size != len(data) or sha256(target_path.read_bytes()).hexdigest() != digest:
            raise ValueError("Upload target content does not match its content identity.")
    except OSError as exc:
        raise ValueError("Upload target could not be verified safely.") from exc


def _write_content_addressed_upload(safe_name: str, data: bytes) -> Path:
    """Store an upload without ever overwriting a same-named source document.

    The content hash is a directory rather than a basename suffix so existing
    UI/history code can continue to display ``Path(source).name`` unchanged.
    A fully written temporary file is hard-linked into place, making the final
    path appear atomically and preventing concurrent workers from replacing an
    earlier upload. Repeated identical uploads safely reuse the same file.
    """

    digest = sha256(data).hexdigest()
    content_dir = ORIGIN_DIR / digest
    content_dir.mkdir(parents=True, exist_ok=True)
    if content_dir.is_symlink() or not is_path_under(content_dir, ORIGIN_DIR):
        raise ValueError("Upload target directory is not safe.")
    target_path = content_dir / safe_name
    if target_path.exists() or target_path.is_symlink():
        _verify_existing_content_addressed_upload(target_path, data, digest)
        return target_path

    temp_path = content_dir / f".upload-{uuid.uuid4().hex}.tmp"
    try:
        with temp_path.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        try:
            os.link(temp_path, target_path)
        except FileExistsError:
            _verify_existing_content_addressed_upload(target_path, data, digest)
    finally:
        temp_path.unlink(missing_ok=True)
    return target_path


def write_uploaded_file(filename: str, content: str) -> Path:
    ensure_workspace_dirs()
    safe_name = sanitize_filename(filename)
    data = content.encode("utf-8")
    _assert_upload_size(len(data), label="Text upload")
    return _write_content_addressed_upload(safe_name, data)


def write_uploaded_binary_file(filename: str, content_base64: str) -> Path:
    ensure_workspace_dirs()
    safe_name = sanitize_filename(filename)
    data = _decode_upload_base64(content_base64, label="Document upload")
    return _write_content_addressed_upload(safe_name, data)


def _resolve_api_file_path(value: str, *, allowed_roots: tuple[Path, ...], label: str) -> Path:
    candidate = Path(value).expanduser()
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()
    if not any(is_path_under(candidate, root) for root in allowed_roots):
        allowed = ", ".join(str(root) for root in allowed_roots)
        raise ValueError(f"{label} must stay under allowed workspace directories: {allowed}")
    if not candidate.exists():
        raise ValueError(f"{label} does not exist: {candidate}")
    return candidate


def normalize_source_path(source_path: str) -> str:
    """Resolve a source path and assert it lives under ORIGIN_DIR.

    This is the safe variant: unlike the previous implementation it never
    accepts an arbitrary existing path, which could otherwise let a caller
    point at files outside the workspace. All callers that previously relied
    on the exists()-only check now get the same allowlist enforcement as
    :func:`normalize_api_source_path`.
    """

    candidate = Path(source_path).expanduser()
    if not candidate.is_absolute():
        candidate = (ORIGIN_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()
    if not is_path_under(candidate, ORIGIN_DIR):
        raise ValueError("Source file must stay under the origin workspace directory.")
    if not candidate.exists():
        raise ValueError(f"Source file does not exist: {candidate}")
    return str(candidate)


def normalize_api_source_path(source_path: str) -> str:
    return str(_resolve_api_file_path(source_path, allowed_roots=(ORIGIN_DIR,), label="Source file"))


def prune_run_states() -> None:
    cutoff = time.time() - RUN_STATE_TTL_SECONDS
    with RUN_REGISTRY_LOCK:
        RUN_REGISTRY.prune_stale(cutoff)


def normalize_output_path(output_path: str) -> str:
    candidate = Path(output_path).expanduser()
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    if not candidate.exists():
        raise ValueError(f"Output file does not exist: {candidate}")
    return str(candidate)


def normalize_api_output_path(output_path: str) -> str:
    return str(_resolve_api_file_path(output_path, allowed_roots=(ROOT_DIR / "finish",), label="Output file"))


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


def iter_task_state_temp_paths() -> list[Path]:
    ensure_workspace_dirs()
    paths: dict[str, Path] = {}
    try:
        for prefix in TASK_STATE_SNAPSHOT_PREFIXES:
            for path in TASK_STATE_DIR.glob(f"{prefix}*.json.tmp"):
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


def task_state_run_id_from_path(path: Path) -> str:
    name = path.name
    for prefix in TASK_STATE_SNAPSHOT_PREFIXES:
        if name.startswith(prefix):
            suffix = ".json.tmp" if name.endswith(".json.tmp") else ".json"
            if not name.endswith(suffix):
                return ""
            run_id = name[len(prefix):-len(suffix)]
            return run_id.split(".", 1)[0] if suffix == ".json.tmp" else run_id
    return ""


def get_active_task_ids() -> set[str]:
    with RUN_REGISTRY_LOCK:
        return {
            *[run_id for run_id, state in RUN_STATES.items() if not state.completed],
            *[run_id for run_id, state in BATCH_RERUN_STATES.items() if not state.completed],
        }


def inspect_task_state_snapshot(path: Path, *, active_ids: set[str], cutoff: float) -> dict[str, Any] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    payload = read_task_state_snapshot(path)
    state = payload.get("state") if isinstance(payload, dict) and isinstance(payload.get("state"), dict) else {}
    kind = task_state_snapshot_kind(path)
    run_id = str(state.get("runId", "")).strip() if state else ""
    if not run_id:
        run_id = task_state_run_id_from_path(path)
    active = bool(run_id and run_id in active_ids)
    completed = bool(state.get("completed")) if state else False
    status = str(state.get("status", "") or "").strip() if state else ""
    target_path = str(state.get("sourcePath") or state.get("outputPath") or "") if state else ""
    stale = bool(not active and stat.st_mtime < cutoff)
    invalid = payload is None
    interrupted = bool(not active and not completed and not invalid)
    return {
        "file": path.name,
        "path": str(path),
        "kind": kind,
        "runId": run_id,
        "status": status or ("invalid" if invalid else "unknown"),
        "targetPath": target_path,
        "completed": completed,
        "active": active,
        "stale": stale,
        "invalid": invalid,
        "interrupted": interrupted,
        "sizeBytes": stat.st_size,
        "persistedAt": str(payload.get("persistedAt", "") or "") if isinstance(payload, dict) else "",
        "updatedAt": str(state.get("updatedAt", "") or "") if state else datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def inspect_task_state_temp_file(path: Path, *, temp_cutoff: float, active_ids: set[str] | None = None) -> dict[str, Any] | None:
    try:
        stat = path.stat()
    except OSError:
        return None
    run_id = task_state_run_id_from_path(path)
    active = bool(run_id and active_ids and run_id in active_ids)
    return {
        "file": path.name,
        "path": str(path),
        "kind": task_state_snapshot_kind(path),
        "runId": run_id,
        "active": active,
        "stale": stat.st_mtime < temp_cutoff,
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def list_task_state_snapshot_items(retention_hours: int = TASK_STATE_RETENTION_HOURS, limit: int = 40) -> list[dict[str, Any]]:
    normalized_hours = max(1, min(int(retention_hours or TASK_STATE_RETENTION_HOURS), 24 * 365))
    cutoff = time.time() - normalized_hours * 3600
    active_ids = get_active_task_ids()
    items = [
        item
        for item in (inspect_task_state_snapshot(path, active_ids=active_ids, cutoff=cutoff) for path in iter_task_state_snapshot_paths())
        if item is not None
    ]
    items.sort(key=lambda item: str(item.get("modifiedAt", "")), reverse=True)
    return items[: max(1, min(int(limit or 40), 200))]


def summarize_task_state_store(retention_hours: int = TASK_STATE_RETENTION_HOURS) -> dict[str, Any]:
    now = time.time()
    cutoff = now - max(1, retention_hours) * 3600
    temp_cutoff = now - TASK_STATE_TEMP_RETENTION_HOURS * 3600
    active_ids = get_active_task_ids()
    file_count = 0
    size_bytes = 0
    run_round_count = 0
    batch_rerun_count = 0
    active_snapshot_count = 0
    stale_count = 0
    completed_count = 0
    interrupted_count = 0
    invalid_count = 0
    newest_mtime = 0.0
    oldest_mtime = 0.0
    for path in iter_task_state_snapshot_paths():
        item = inspect_task_state_snapshot(path, active_ids=active_ids, cutoff=cutoff)
        if item is None:
            continue
        mtime = path.stat().st_mtime if path.exists() else 0
        kind = str(item.get("kind", "unknown"))
        file_count += 1
        size_bytes += int(item.get("sizeBytes", 0) or 0)
        if kind == "runRound":
            run_round_count += 1
        elif kind == "batchRerun":
            batch_rerun_count += 1
        if bool(item.get("active")):
            active_snapshot_count += 1
        if bool(item.get("stale")):
            stale_count += 1
        if bool(item.get("completed")):
            completed_count += 1
        if bool(item.get("interrupted")):
            interrupted_count += 1
        if bool(item.get("invalid")):
            invalid_count += 1
        newest_mtime = max(newest_mtime, mtime)
        oldest_mtime = mtime if oldest_mtime <= 0 else min(oldest_mtime, mtime)

    temp_items = [
        item
        for item in (inspect_task_state_temp_file(path, temp_cutoff=temp_cutoff, active_ids=active_ids) for path in iter_task_state_temp_paths())
        if item is not None
    ]
    active_temp_count = sum(1 for item in temp_items if bool(item.get("active")))
    stale_active_temp_count = sum(1 for item in temp_items if bool(item.get("active")) and bool(item.get("stale")))
    return {
        "path": str(TASK_STATE_DIR),
        "fileCount": file_count,
        "sizeBytes": size_bytes,
        "runRoundCount": run_round_count,
        "batchRerunCount": batch_rerun_count,
        "activeSnapshotCount": active_snapshot_count,
        "staleCount": stale_count,
        "completedCount": completed_count,
        "interruptedCount": interrupted_count,
        "invalidCount": invalid_count,
        "tempFileCount": len(temp_items),
        "activeTempCount": active_temp_count,
        "staleTempCount": sum(1 for item in temp_items if bool(item.get("stale"))),
        "staleActiveTempCount": stale_active_temp_count,
        "retentionHours": retention_hours,
        "tempRetentionHours": TASK_STATE_TEMP_RETENTION_HOURS,
        "oldestUpdatedAt": datetime.fromtimestamp(oldest_mtime, timezone.utc).isoformat().replace("+00:00", "Z") if oldest_mtime else "",
        "newestUpdatedAt": datetime.fromtimestamp(newest_mtime, timezone.utc).isoformat().replace("+00:00", "Z") if newest_mtime else "",
    }


def cleanup_task_state_snapshots(mode: str = "expired", max_age_hours: int = TASK_STATE_RETENTION_HOURS) -> dict[str, Any]:
    normalized_mode = mode if mode in {"expired", "completed", "all"} else "expired"
    normalized_hours = max(1, min(int(max_age_hours or TASK_STATE_RETENTION_HOURS), 24 * 365))
    now = time.time()
    cutoff = now - normalized_hours * 3600
    temp_cutoff = now - TASK_STATE_TEMP_RETENTION_HOURS * 3600
    active_ids = get_active_task_ids()
    before = summarize_task_state_store(normalized_hours)
    deleted_files: list[str] = []
    deleted_temp_files: list[str] = []
    deleted_invalid_files: list[str] = []
    failed_files: list[dict[str, str]] = []
    skipped_active_count = 0
    skipped_active_temp_count = 0
    deleted_bytes = 0

    for path in iter_task_state_snapshot_paths():
        try:
            stat = path.stat()
        except OSError as exc:
            failed_files.append({"file": path.name, "message": str(exc)})
            continue
        payload = read_task_state_snapshot(path)
        state = payload.get("state") if isinstance(payload, dict) and isinstance(payload.get("state"), dict) else {}
        run_id = str(state.get("runId", "")).strip() if state else task_state_run_id_from_path(path)
        if run_id in active_ids:
            skipped_active_count += 1
            continue
        invalid = payload is None
        completed = bool(state.get("completed")) if isinstance(state, dict) else False
        should_delete = (
            normalized_mode == "all"
            or (normalized_mode == "completed" and completed)
            or (normalized_mode == "expired" and (stat.st_mtime < cutoff or invalid))
        )
        if not should_delete:
            continue
        try:
            deleted_bytes += stat.st_size
            path.unlink()
            deleted_files.append(path.name)
            if invalid:
                deleted_invalid_files.append(path.name)
        except OSError as exc:
            failed_files.append({"file": path.name, "message": str(exc)})

    if normalized_mode in {"expired", "all"}:
        for path in iter_task_state_temp_paths():
            item = inspect_task_state_temp_file(path, temp_cutoff=temp_cutoff)
            if item is None:
                continue
            run_id = str(item.get("runId", "") or "")
            if run_id in active_ids:
                skipped_active_temp_count += 1
                continue
            if normalized_mode == "expired" and not bool(item.get("stale")):
                continue
            try:
                stat = path.stat()
                deleted_bytes += stat.st_size
                path.unlink()
                deleted_temp_files.append(path.name)
                deleted_files.append(path.name)
            except OSError as exc:
                failed_files.append({"file": path.name, "message": str(exc)})

    after = summarize_task_state_store(normalized_hours)
    return {
        "ok": not failed_files,
        "mode": normalized_mode,
        "maxAgeHours": normalized_hours,
        "deletedCount": len(deleted_files),
        "deletedSnapshotCount": len(deleted_files) - len(deleted_temp_files),
        "deletedTempCount": len(deleted_temp_files),
        "deletedInvalidCount": len(deleted_invalid_files),
        "deletedBytes": deleted_bytes,
        "deletedFiles": deleted_files,
        "deletedTempFiles": deleted_temp_files,
        "deletedInvalidFiles": deleted_invalid_files,
        "failedFiles": failed_files,
        "skippedActiveCount": skipped_active_count,
        "skippedActiveTempCount": skipped_active_temp_count,
        "before": before,
        "after": after,
    }


def _task_state_actionable_stale_temp_count(summary: dict[str, Any]) -> int:
    stale_temp_count = int(summary.get("staleTempCount", 0) or 0)
    stale_active_temp_count = int(summary.get("staleActiveTempCount", 0) or 0)
    return max(0, stale_temp_count - stale_active_temp_count)


def _task_state_store_needs_cleanup(summary: dict[str, Any]) -> bool:
    return (
        int(summary.get("invalidCount", 0) or 0) > 0
        or int(summary.get("staleCount", 0) or 0) > 0
        or _task_state_actionable_stale_temp_count(summary) > 0
    )


def ensure_task_state_store_ready(
    reason: str = "health",
    max_age_seconds: float = TASK_STATE_SELF_HEAL_INTERVAL_SECONDS,
) -> dict[str, Any]:
    global TASK_STATE_SELF_HEAL_CACHE, TASK_STATE_SELF_HEAL_CACHE_AT

    with TASK_STATE_SELF_HEAL_LOCK:
        now = time.monotonic()
        if max_age_seconds > 0 and TASK_STATE_SELF_HEAL_CACHE is not None and now - TASK_STATE_SELF_HEAL_CACHE_AT < max_age_seconds:
            cached = dict(TASK_STATE_SELF_HEAL_CACHE)
            cached["cached"] = True
            cached["cachedAction"] = cached.get("action", "none")
            cached["action"] = "cached"
            return cached

        checked_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        cleanup: dict[str, Any] | None = None
        try:
            ensure_workspace_dirs()
            before = summarize_task_state_store()
            after = before
            actions: list[str] = []
            if _task_state_store_needs_cleanup(before):
                cleanup = cleanup_task_state_snapshots(mode="expired", max_age_hours=TASK_STATE_RETENTION_HOURS)
                after = cleanup.get("after") if isinstance(cleanup.get("after"), dict) else summarize_task_state_store()
                if int(cleanup.get("deletedCount", 0) or 0) > 0:
                    actions.append("cleanup-expired")

            cleanup_ok = bool(cleanup.get("ok", True) if cleanup else True)
            ok = cleanup_ok and not _task_state_store_needs_cleanup(after)
            action = "failed" if cleanup is not None and not cleanup_ok else "cleaned" if actions else "none"
            payload: dict[str, Any] = {
                "ok": ok,
                "reason": reason,
                "checkedAt": checked_at,
                "action": action,
                "actions": actions,
                "cached": False,
                "before": before,
                "after": after,
                "deletedCount": int(cleanup.get("deletedCount", 0) or 0) if cleanup else 0,
                "deletedSnapshotCount": int(cleanup.get("deletedSnapshotCount", 0) or 0) if cleanup else 0,
                "deletedTempCount": int(cleanup.get("deletedTempCount", 0) or 0) if cleanup else 0,
                "deletedInvalidCount": int(cleanup.get("deletedInvalidCount", 0) or 0) if cleanup else 0,
                "deletedBytes": int(cleanup.get("deletedBytes", 0) or 0) if cleanup else 0,
                "skippedActiveCount": int(cleanup.get("skippedActiveCount", 0) or 0) if cleanup else 0,
                "skippedActiveTempCount": int(cleanup.get("skippedActiveTempCount", 0) or 0) if cleanup else 0,
                "failedFiles": cleanup.get("failedFiles", []) if cleanup else [],
            }
            if cleanup is not None:
                payload["cleanup"] = cleanup
        except Exception as exc:
            payload = {
                "ok": False,
                "reason": reason,
                "checkedAt": checked_at,
                "action": "failed",
                "actions": [],
                "cached": False,
                "error": str(exc),
            }

        TASK_STATE_SELF_HEAL_CACHE = payload
        TASK_STATE_SELF_HEAL_CACHE_AT = time.monotonic()
        return payload


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    last_error: OSError | None = None
    for attempt in range(8):
        tmp_path = path.with_name(
            f"{path.stem}.{os.getpid()}.{threading.get_ident()}.{time.monotonic_ns()}{path.suffix}.tmp"
        )
        try:
            tmp_path.write_text(text, encoding="utf-8")
            tmp_path.replace(path)
            return
        except OSError as exc:
            last_error = exc
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
            time.sleep(min(0.25, 0.02 * (attempt + 1)))
    if last_error is not None:
        raise last_error


def normalize_run_parent_input_binding(
    expected_previous_compare_revision: str = "",
    expected_parent_input_binding: dict[str, Any] | None = None,
) -> dict[str, str]:
    if expected_parent_input_binding is None:
        raw_binding: dict[str, Any] = {}
    elif isinstance(expected_parent_input_binding, dict):
        raw_binding = expected_parent_input_binding
    else:
        raise ValueError("expected parent input binding must be an object.")
    normalized: dict[str, str] = {}
    for field, _mismatch_code in PARENT_INPUT_BINDING_FIELDS:
        raw_value = raw_binding.get(field)
        if raw_value is None:
            continue
        if not isinstance(raw_value, str):
            raise ValueError(f"expected parent input binding field {field} must be a string.")
        value = raw_value.strip()
        if value:
            normalized[field] = value
    legacy_compare_revision = str(expected_previous_compare_revision or "").strip()
    if (
        legacy_compare_revision
        and normalized.get("compareRevision")
        and normalized["compareRevision"] != legacy_compare_revision
    ):
        raise ValueError("expectedPreviousCompareRevision conflicts with the parent input binding.")
    if legacy_compare_revision:
        normalized["compareRevision"] = legacy_compare_revision
    return normalized


def register_run(
    source_path: str,
    expected_previous_compare_revision: str = "",
    expected_parent_input_binding: dict[str, Any] | None = None,
) -> tuple[str, ProgressState]:
    prune_run_states()
    normalized_source_path = normalize_source_path(source_path)
    with RUN_REGISTRY_LOCK:
        active_run_id = ACTIVE_RUNS_BY_SOURCE.get(normalized_source_path)
        if active_run_id:
            active_state = RUN_STATES.get(active_run_id)
            if active_state and not active_state.completed:
                raise ValueError("This document already has a running task. Please wait for it to finish.")
            ACTIVE_RUNS_BY_SOURCE.pop(normalized_source_path, None)

        normalized_binding = normalize_run_parent_input_binding(
            expected_previous_compare_revision,
            expected_parent_input_binding,
        )
        run_id = uuid.uuid4().hex
        state = ProgressState(
            source_path=normalized_source_path,
            expected_previous_compare_revision=normalized_binding.get("compareRevision", ""),
            expected_parent_input_binding=normalized_binding,
        )
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


def register_or_reuse_run(
    source_path: str,
    expected_previous_compare_revision: str = "",
    expected_parent_input_binding: dict[str, Any] | None = None,
) -> tuple[str, ProgressState, bool]:
    requested_binding = normalize_run_parent_input_binding(
        expected_previous_compare_revision,
        expected_parent_input_binding,
    )
    active_run = get_active_run_for_source(source_path)
    if active_run is not None:
        run_id, state = active_run
        active_binding = dict(state.expected_parent_input_binding or {})
        if not active_binding and state.expected_previous_compare_revision:
            active_binding["compareRevision"] = state.expected_previous_compare_revision
        if active_binding != requested_binding:
            raise StaleRoundInputError(
                state.expected_previous_compare_revision,
                ["active_run_parent_binding_mismatch"],
                "An active run is already bound to a different parent generation.",
            )
        return run_id, state, True
    run_id, state = register_run(
        source_path,
        expected_previous_compare_revision,
        expected_parent_input_binding=requested_binding,
    )
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


def infer_progress_round(state: ProgressState, result: dict[str, Any] | None = None) -> int:
    if isinstance(result, dict):
        try:
            return int(result.get("round") or 0)
        except (TypeError, ValueError):
            pass
    for event in reversed(state.events):
        try:
            round_number = int(event.get("round") or 0)
        except (TypeError, ValueError, AttributeError):
            round_number = 0
        if round_number > 0:
            return round_number
    return 0


def is_run_interruption_error(error: str | None) -> bool:
    lowered = str(error or "").lower()
    return "interrupted" in lowered or "progress channel disconnected" in lowered or "backend restarted" in lowered


def build_terminal_run_event(state: ProgressState, *, result: dict[str, Any] | None = None, error: str | None = None) -> dict[str, Any] | None:
    round_number = infer_progress_round(state, result)
    if error:
        interrupted = state.cancel_requested or is_run_interruption_error(error)
        return {
            "phase": "run-interrupted" if interrupted else "run-failed",
            "round": round_number,
            "error": error,
            "autoRetryEligible": bool(interrupted and not state.cancel_requested),
            "retryDelaySeconds": RUN_AUTO_RETRY_DELAY_SECONDS,
            "maxAutoRetries": RUN_AUTO_RETRY_MAX_ATTEMPTS,
        }
    if isinstance(result, dict) and round_number > 0:
        return {
            "phase": "round-complete",
            "round": round_number,
            "nextRoundDelaySeconds": RUN_AUTO_NEXT_ROUND_DELAY_SECONDS,
        }
    return None


def task_artifact_path(value: Any) -> Path | None:
    raw_path = str(value or "").strip()
    if not raw_path:
        return None
    path = Path(raw_path)
    return path if path.is_absolute() else ROOT_DIR / path


def read_task_json(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists() or not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def positive_task_int(value: Any) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized > 0 else None


def run_result_has_usable_artifacts(result: Any) -> bool:
    if not isinstance(result, dict):
        return False
    output_path = task_artifact_path(result.get("outputPath") or result.get("output_path"))
    if output_path is None or not output_path.exists() or not output_path.is_file():
        return False
    try:
        if output_path.stat().st_size <= 0:
            return False
    except OSError:
        return False

    compare_path = task_artifact_path(result.get("comparePath") or result.get("compare_path"))
    compare_payload = read_task_json(compare_path)
    if compare_payload is None:
        return False
    chunks = compare_payload.get("chunks")
    chunk_count = positive_task_int(compare_payload.get("chunkCount"))
    paragraph_count = positive_task_int(compare_payload.get("paragraphCount"))
    if not isinstance(chunks, list) or not chunks or chunk_count is None or chunk_count != len(chunks):
        return False
    if paragraph_count is None:
        return False
    input_segments = positive_task_int(result.get("inputSegmentCount") or result.get("input_segment_count"))
    output_segments = positive_task_int(result.get("outputSegmentCount") or result.get("output_segment_count"))
    if input_segments is not None and input_segments != chunk_count:
        return False
    if output_segments is not None and output_segments != chunk_count:
        return False

    manifest_path = task_artifact_path(result.get("manifestPath") or result.get("manifest_path"))
    manifest_payload = read_task_json(manifest_path)
    if manifest_payload is not None:
        manifest_chunk_count = positive_task_int(manifest_payload.get("chunk_count"))
        manifest_paragraph_count = positive_task_int(manifest_payload.get("paragraph_count"))
        if manifest_chunk_count is None or manifest_chunk_count != chunk_count:
            return False
        if manifest_paragraph_count is None or manifest_paragraph_count != paragraph_count:
            return False
    return True


def normalize_run_summary_result(summary: dict[str, Any]) -> dict[str, Any]:
    if (
        bool(summary.get("completed"))
        and not summary.get("error")
        and isinstance(summary.get("result"), dict)
        and not run_result_has_usable_artifacts(summary.get("result"))
    ):
        summary["status"] = "failed"
        summary["error"] = INCOMPLETE_RUN_RESULT_MESSAGE
        summary["result"] = None
        summary["automation"] = None
    return summary


def build_run_automation_hint(state: ProgressState) -> dict[str, Any] | None:
    if not state.completed:
        return None
    if state.error:
        interrupted = state.status in {"canceled", "interrupted"} or is_run_interruption_error(state.error)
        return {
            "kind": "retry",
            "eligible": bool(interrupted and not state.cancel_requested),
            "delaySeconds": RUN_AUTO_RETRY_DELAY_SECONDS,
            "maxAttempts": RUN_AUTO_RETRY_MAX_ATTEMPTS,
        }
    if state.result:
        return {
            "kind": "next-round",
            "eligible": True,
            "delaySeconds": RUN_AUTO_NEXT_ROUND_DELAY_SECONDS,
        }
    return None


def serialize_run_state(run_id: str, state: ProgressState) -> dict[str, Any]:
    return normalize_run_summary_result({
        "ok": True,
        "runId": run_id,
        "sourcePath": state.source_path,
        "expectedPreviousCompareRevision": state.expected_previous_compare_revision,
        "expectedParentInputBinding": dict(state.expected_parent_input_binding),
        "status": state.status,
        "completed": state.completed,
        "cancelRequested": state.cancel_requested,
        "eventCount": len(state.events),
        "lastEvent": state.events[-1] if state.events else None,
        "result": state.result,
        "error": state.error,
        "automation": build_run_automation_hint(state),
        "createdAt": datetime.fromtimestamp(state.created_at, timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.fromtimestamp(state.updated_at, timezone.utc).isoformat().replace("+00:00", "Z"),
    })


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
    with state.condition:
        snapshot = serialize_run_state_for_task_snapshot(run_id, state)
    try:
        write_json_atomic(
            run_round_state_path(run_id),
            {
                "kind": "runRound",
                "version": 1,
                "persistedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "state": snapshot,
            },
        )
    except OSError:
        # Persistence is only a recovery hint; a disk snapshot failure must not break the round.
        return


def _project_persisted_run_source_path(value: object) -> str:
    """Project only an existing source file inside the local origin tree."""

    if not isinstance(value, str) or not value.strip() or len(value) > 4096:
        return ""
    try:
        normalized = normalize_api_source_path(value.strip())
        return normalized if Path(normalized).is_file() else ""
    except (OSError, RuntimeError, ValueError):
        return ""


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
        summary = project_batch_rerun_public_payload(state)
        summary["restoredFromDisk"] = True
        summary["persistedAt"] = payload.get("persistedAt")
        if not bool(summary.get("completed")):
            summary["completed"] = True
            summary["status"] = "interrupted"
            summary["cancelRequested"] = False
            summary["error"] = summary.get("error") or "Backend restarted before this round finished. Completed chunks were kept on disk; use continue to resume from the checkpoint."
        summary = normalize_run_summary_result(summary)
        public_summary = project_batch_rerun_public_payload(summary)
        source_path = _project_persisted_run_source_path(state.get("sourcePath"))
        if source_path:
            public_summary["sourcePath"] = source_path
        summaries.append(public_summary)
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
    summary = project_batch_rerun_public_payload(state)
    summary["restoredFromDisk"] = True
    summary["persistedAt"] = payload.get("persistedAt")
    if not bool(summary.get("completed")):
        summary["completed"] = True
        summary["status"] = "interrupted"
        summary["cancelRequested"] = False
        summary["error"] = summary.get("error") or "Backend restarted before this round finished. Completed chunks were kept on disk; use continue to resume from the checkpoint."
    summary = normalize_run_summary_result(summary)
    source_path = _project_persisted_run_source_path(state.get("sourcePath"))
    if source_path:
        summary["sourcePath"] = source_path
    return summary


PROVIDER_PROGRESS_PHASES = frozenset({"provider-stream", "provider-retry-wait"})
PROVIDER_RETRY_ERROR_CATEGORIES = frozenset({
    "auth",
    "endpoint",
    "network",
    "provider",
    "rate_limit",
    "response_limit",
    "response_parse",
    "server",
    "timeout",
    "unknown",
})


def _provider_progress_int(value: Any, *, minimum: int = 0, maximum: int | None = None) -> int | None:
    if isinstance(value, bool):
        return None
    try:
        number = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if isinstance(value, float) and (not math.isfinite(value) or value != number):
        return None
    if isinstance(value, str) and str(number) != value.strip():
        return None
    if number < minimum or (maximum is not None and number > maximum):
        return None
    return number


def _provider_progress_number(value: Any, *, minimum: float = 0.0) -> int | float | None:
    if isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    if not math.isfinite(number) or number < minimum:
        return None
    return int(number) if number.is_integer() else round(number, 3)


def _copy_provider_progress_int(
    target: dict[str, Any],
    source: dict[str, Any],
    key: str,
    *,
    minimum: int = 0,
    maximum: int | None = None,
) -> None:
    if key not in source:
        return
    value = _provider_progress_int(source.get(key), minimum=minimum, maximum=maximum)
    if value is not None:
        target[key] = value


def _copy_provider_progress_number(
    target: dict[str, Any],
    source: dict[str, Any],
    key: str,
) -> None:
    if key not in source:
        return
    value = _provider_progress_number(source.get(key))
    if value is not None:
        target[key] = value


def project_provider_progress_event(event: dict[str, Any]) -> dict[str, Any]:
    """Keep provider transport progress metadata-only at its final public sink.

    The model transport already emits a safe schema, but this is the last
    boundary shared by in-memory state, recovery snapshots, status JSON and
    browser SSE.  Re-projecting here prevents a future or accidental caller
    from persisting partial output, reasoning, provider bodies, or endpoints.
    Ordinary lifecycle events deliberately bypass this projection so their
    existing chunk failure/review evidence remains available to the UI.
    """

    raw_phase = event.get("phase")
    phase = raw_phase if isinstance(raw_phase, str) else ""
    if phase not in PROVIDER_PROGRESS_PHASES:
        return event

    projected: dict[str, Any] = {
        "phase": phase,
        # These values describe this sink's projection, rather than trusting
        # similarly named assertions supplied by an upstream caller.
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }
    _copy_provider_progress_int(projected, event, "round")
    chunk_id = event.get("chunkId")
    if isinstance(chunk_id, str) and chunk_id:
        projected["chunkId"] = chunk_id[:256]
    for key in ("concurrency", "configuredConcurrency"):
        _copy_provider_progress_int(projected, event, key, minimum=1, maximum=MAX_REWRITE_CONCURRENCY)

    if phase == "provider-stream":
        _copy_provider_progress_int(projected, event, "streamEventCount")
        stream_done = event.get("streamDone") is True
        projected["streamDone"] = stream_done
        if stream_done:
            _copy_provider_progress_int(projected, event, "finalTextChars")
        return projected

    raw_category = event.get("errorCategory")
    category = str(raw_category or "provider").strip().lower() if isinstance(raw_category, str) else "provider"
    if category not in PROVIDER_RETRY_ERROR_CATEGORIES:
        category = "provider"
    projected["errorCategory"] = category
    status_code = _provider_progress_int(event.get("statusCode"), minimum=100, maximum=599)
    if status_code is not None:
        projected["statusCode"] = status_code
    projected["error"] = public_provider_error_message(category=category, status_code=status_code)
    if isinstance(event.get("retryable"), bool):
        projected["retryable"] = event["retryable"]
    for key in ("attempt", "attempts", "maxAttempts", "nextAttempt"):
        _copy_provider_progress_int(projected, event, key)
    for key in ("retryDelaySeconds", "retryAfterSeconds", "cooldownSeconds"):
        _copy_provider_progress_number(projected, event, key)
    return projected


def append_progress_event(run_id: str, event: dict[str, Any]) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    safe_event = project_provider_progress_event(event)
    with state.condition:
        state.events.append(safe_event)
        state.updated_at = time.time()
        state.condition.notify_all()
    persist_run_state(run_id)


def finalize_progress(run_id: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    state = RUN_STATES.get(run_id)
    if not state:
        return
    if error is None and isinstance(result, dict) and not run_result_has_usable_artifacts(result):
        error = INCOMPLETE_RUN_RESULT_MESSAGE
        result = None
    with state.condition:
        terminal_event = build_terminal_run_event(state, result=result, error=error)
        if terminal_event:
            state.events.append(terminal_event)
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
    return project_batch_rerun_public_payload({
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
        "preservedAttempts": state.preserved_attempts,
        "failures": state.failures,
        "eventCount": len(state.events),
        "lastEvent": state.events[-1] if state.events else None,
        "result": state.result,
        "error": state.error,
        "createdAt": datetime.fromtimestamp(state.created_at, timezone.utc).isoformat().replace("+00:00", "Z"),
        "updatedAt": datetime.fromtimestamp(state.updated_at, timezone.utc).isoformat().replace("+00:00", "Z"),
    })


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


def normalize_failed_attempts_for_failure(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    attempts: list[dict[str, Any]] = []
    for attempt in value[-4:]:
        normalized = _normalize_failed_attempt_evidence(attempt)
        if normalized is not None:
            attempts.append(dict(normalized))
    return attempts


def get_chunk_failed_attempts(chunk: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not isinstance(chunk, dict):
        return []
    failed_attempts = normalize_failed_attempts_for_failure(chunk.get("failedAttempts"))
    return failed_attempts or normalize_failed_attempts_for_failure(chunk.get("rejectedCandidates"))


def project_preserved_candidate_selection_attempt(value: Any) -> dict[str, Any] | None:
    """Keep only text-free v2 selection attempts for soft-noop UI feedback."""

    projected = _public_candidate_selection_event(value)
    if not isinstance(projected, dict):
        return None
    if (
        projected.get("event") != "candidate-selection"
        or projected.get("schema") != "fyadr.chunk-candidate-selection"
        or projected.get("schemaVersion") != 2
    ):
        return None
    return projected


_BATCH_FAILURE_MESSAGES = {
    "structure": "候选未通过结构与格式保护校验；失败正文和原始错误已隐藏。",
    "factual": "候选未通过事实关系保护校验；失败正文和原始错误已隐藏。",
    "readability": "候选出现学术可读性回退；失败正文和原始错误已隐藏。",
    "style": "候选未通过写作结构启发式校验；失败正文和原始错误已隐藏。",
    "provider": "模型服务调用失败；上游响应、思考内容和原始错误已隐藏。",
    "local_validation": "候选未通过本地安全校验；失败正文和原始错误已隐藏。",
}


def _batch_failure_reason(
    error: object,
    *,
    guard_category: object = None,
    issue_codes: object = None,
) -> tuple[str, list[str], str]:
    category, codes = _classify_failed_attempt_diagnostic(
        error,
        guard_category=guard_category,
        issue_codes=issue_codes,
    )
    return category, codes, _BATCH_FAILURE_MESSAGES.get(
        category,
        _BATCH_FAILURE_MESSAGES["local_validation"],
    )


def _safe_batch_code(value: object, *, fallback: str = "") -> str:
    normalized = str(value or "").strip()
    return normalized if re.fullmatch(r"[A-Za-z0-9_.:-]{1,128}", normalized) else fallback


def _project_batch_quality(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    result: dict[str, Any] = {}
    if isinstance(value.get("needsReview"), bool):
        result["needsReview"] = value.get("needsReview")
    for key in ("flags", "advisoryFlags"):
        raw_codes = value.get(key)
        if isinstance(raw_codes, list):
            result[key] = [
                code
                for code in (_safe_batch_code(item) for item in raw_codes[:24])
                if code
            ]
    return result or None


def project_batch_rerun_failure(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    failed_attempts = normalize_failed_attempts_for_failure(value.get("failedAttempts"))
    latest_attempt = failed_attempts[-1] if failed_attempts else {}
    category, issue_codes, message = _batch_failure_reason(
        value.get("error", ""),
        guard_category=(
            value.get("guardCategory")
            or latest_attempt.get("guardCategory")
            or value.get("rerunFallbackGuardCategory")
        ),
        issue_codes=(
            value.get("issueCodes")
            or latest_attempt.get("issueCodes")
            or value.get("rerunFallbackIssueCodes")
        ),
    )
    result: dict[str, Any] = {
        "chunkId": _safe_batch_code(value.get("chunkId")),
        "error": message,
        "guardCategory": category,
        "issueCodes": issue_codes,
        "errorStored": False,
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }
    if failed_attempts:
        result["failedAttempts"] = failed_attempts
    for key in ("rerunStatus", "rerunFallbackMode", "scopeKey"):
        code = _safe_batch_code(value.get(key))
        if code:
            result[key] = code
    fallback_category = value.get("rerunFallbackGuardCategory")
    fallback_codes = value.get("rerunFallbackIssueCodes")
    if fallback_category or fallback_codes:
        normalized_category, normalized_codes, _ = _batch_failure_reason(
            "",
            guard_category=fallback_category,
            issue_codes=fallback_codes,
        )
        result["rerunFallbackGuardCategory"] = normalized_category
        result["rerunFallbackIssueCodes"] = normalized_codes
        result["rerunFallbackErrorStored"] = False
    quality = _project_batch_quality(value.get("quality"))
    if quality is not None:
        result["quality"] = quality
    return result


def build_batch_rerun_failure(
    chunk_id: str,
    error: str,
    output_path: str,
    latest_compare: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], dict[str, Any] | None]:
    failure: dict[str, Any] = {"chunkId": chunk_id, "error": error}
    compare_payload = latest_compare if isinstance(latest_compare, dict) else None
    chunk = find_compare_chunk(compare_payload, chunk_id)
    if chunk is None or not get_chunk_failed_attempts(chunk):
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
        failed_attempts = get_chunk_failed_attempts(chunk)
        if failed_attempts:
            failure["failedAttempts"] = failed_attempts
        if chunk.get("rerunStatus"):
            failure["rerunStatus"] = chunk.get("rerunStatus")
        if chunk.get("rerunFallbackMode"):
            failure["rerunFallbackMode"] = chunk.get("rerunFallbackMode")
        if chunk.get("rerunFallbackGuardCategory"):
            failure["rerunFallbackGuardCategory"] = chunk.get("rerunFallbackGuardCategory")
        if isinstance(chunk.get("rerunFallbackIssueCodes"), list):
            failure["rerunFallbackIssueCodes"] = chunk.get("rerunFallbackIssueCodes")
        quality = chunk.get("quality")
        if isinstance(quality, dict):
            failure["quality"] = {
                key: quality.get(key)
                for key in ("needsReview", "flags", "advisoryFlags")
                if key in quality
            }
    projected_failure = project_batch_rerun_failure(failure)
    return projected_failure or {
        "chunkId": _safe_batch_code(chunk_id),
        "error": _BATCH_FAILURE_MESSAGES["local_validation"],
        "guardCategory": "local_validation",
        "issueCodes": ["validation_rejected_unspecified"],
        "errorStored": False,
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }, compare_payload


def _project_preserved_attempts(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    projected: list[dict[str, Any]] = []
    for item in value[:256]:
        if not isinstance(item, dict):
            continue
        attempt = project_preserved_candidate_selection_attempt(
            item.get("candidateSelectionAttempt")
        )
        chunk_id = _safe_batch_code(item.get("chunkId"))
        if attempt is not None and chunk_id:
            projected.append(
                {
                    "chunkId": chunk_id,
                    "candidateSelectionAttempt": attempt,
                }
            )
    return projected


def project_batch_rerun_event(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"phase": "unknown", "payloadStored": False}
    provider_projected = project_provider_progress_event(value)
    raw = provider_projected if isinstance(provider_projected, dict) else {}
    if str(raw.get("phase", "") or "") in PROVIDER_PROGRESS_PHASES:
        return raw
    phase = _safe_batch_code(raw.get("phase"), fallback="unknown")
    result: dict[str, Any] = {"phase": phase}
    event_code = _safe_batch_code(raw.get("code"))
    if event_code:
        result["code"] = event_code
    raw_mismatch_codes = raw.get("mismatchCodes")
    if isinstance(raw_mismatch_codes, list):
        result["mismatchCodes"] = [
            code
            for code in (_safe_batch_code(item) for item in raw_mismatch_codes[:24])
            if code
        ]
    chunk_id = _safe_batch_code(raw.get("chunkId"))
    if chunk_id:
        result["chunkId"] = chunk_id
    for key in (
        "index",
        "total",
        "completed",
        "success",
        "failure",
        "attempts",
        "streamEventCount",
        "finalTextChars",
        "concurrency",
        "configuredConcurrency",
    ):
        raw_number = raw.get(key)
        if isinstance(raw_number, int) and not isinstance(raw_number, bool) and 0 <= raw_number <= 2_000_000_000:
            result[key] = raw_number
    for key in ("streamDone", "retryable", "reasoningSuppressed", "providerContentStored"):
        if isinstance(raw.get(key), bool):
            result[key] = raw.get(key)
    for key in ("statusCode", "nextAttempt", "maxAttempts"):
        raw_number = raw.get(key)
        if isinstance(raw_number, int) and not isinstance(raw_number, bool) and 0 <= raw_number <= 100_000:
            result[key] = raw_number
    if raw.get("error") not in (None, ""):
        category, issue_codes, message = _batch_failure_reason(
            raw.get("error"),
            guard_category=raw.get("guardCategory") or raw.get("errorCategory"),
            issue_codes=raw.get("issueCodes"),
        )
        result.update(
            {
                "error": message,
                "guardCategory": category,
                "issueCodes": issue_codes,
                "errorStored": False,
                "reasoningSuppressed": True,
                "providerContentStored": False,
            }
        )
    failed_attempts = normalize_failed_attempts_for_failure(raw.get("failedAttempts"))
    if failed_attempts:
        result["failedAttempts"] = failed_attempts
    if phase == "unknown":
        result["payloadStored"] = False
    return result


def _project_batch_rerun_result(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    result: dict[str, Any] = {}
    if isinstance(value.get("ok"), bool):
        result["ok"] = value.get("ok")
    run_id = _safe_batch_code(value.get("runId"))
    if run_id:
        result["runId"] = run_id
    for key in ("outputPath", "comparePath"):
        if isinstance(value.get(key), str):
            result[key] = value.get(key)
    compare = value.get("compare")
    if isinstance(compare, dict):
        result["compare"] = _normalize_compare_failed_attempts(copy.deepcopy(compare))
    result["successChunkIds"] = [
        chunk_id
        for chunk_id in (_safe_batch_code(item) for item in (value.get("successChunkIds") or [])[:10_000])
        if chunk_id
    ] if isinstance(value.get("successChunkIds"), list) else []
    result["preservedAttempts"] = _project_preserved_attempts(value.get("preservedAttempts"))
    for key in ("totalCount", "completedCount", "successCount", "failureCount"):
        raw_number = value.get(key)
        if isinstance(raw_number, int) and not isinstance(raw_number, bool) and 0 <= raw_number <= 10_000_000:
            result[key] = raw_number
    if isinstance(value.get("canceled"), bool):
        result["canceled"] = value.get("canceled")
    raw_failures = value.get("failures")
    result["failures"] = [
        failure
        for failure in (
            project_batch_rerun_failure(item)
            for item in (raw_failures[:10_000] if isinstance(raw_failures, list) else [])
        )
        if failure is not None
    ]

    # RateAudit strategy tasks intentionally reuse the BatchRerun status
    # protocol.  Keep their safe, structured completion evidence instead of
    # dropping it at the final privacy boundary.  The recursive projector
    # removes excerpts, body/prompt/error/provider fields and reasoning-like
    # payloads before the result can reach an API response or task snapshot.
    raw_post_audit = value.get("postAudit")
    if isinstance(raw_post_audit, dict):
        projected_post_audit = _sanitize_public_diagnostic_value(
            copy.deepcopy(raw_post_audit)
        )
        if isinstance(projected_post_audit, dict):
            result["postAudit"] = projected_post_audit
    raw_strategy_binding = value.get("strategyBinding")
    if isinstance(raw_strategy_binding, dict):
        projected_binding = _sanitize_public_diagnostic_value(
            copy.deepcopy(raw_strategy_binding)
        )
        if isinstance(projected_binding, dict):
            result["strategyBinding"] = projected_binding
    for key in (
        "strategyDecision",
        "resultingStrategyDecision",
        "plateauReason",
        "compareRevisionBefore",
        "compareRevisionAfter",
    ):
        code = _safe_batch_code(value.get(key))
        if code:
            result[key] = code
    for key in (
        "manualReviewRequired",
        "manualReviewStillRequired",
        "plateauReached",
    ):
        if isinstance(value.get(key), bool):
            result[key] = value.get(key)
    raw_manual_dimensions = value.get("blockingManualDimensions")
    if isinstance(raw_manual_dimensions, list):
        projected_dimensions = _sanitize_public_diagnostic_value(
            copy.deepcopy(raw_manual_dimensions[:64])
        )
        if isinstance(projected_dimensions, list):
            result["blockingManualDimensions"] = projected_dimensions
    return result


def project_batch_rerun_public_payload(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {"ok": False, "status": "invalid", "completed": True}
    result: dict[str, Any] = {}
    if isinstance(value.get("ok"), bool):
        result["ok"] = value.get("ok")
    run_id = _safe_batch_code(value.get("runId"))
    if run_id:
        result["runId"] = run_id
    if isinstance(value.get("outputPath"), str):
        result["outputPath"] = value.get("outputPath")
    result["status"] = _safe_batch_code(value.get("status"), fallback="unknown")
    for key in ("completed", "cancelRequested", "restoredFromDisk"):
        if isinstance(value.get(key), bool):
            result[key] = value.get(key)
    for key in (
        "totalCount",
        "completedCount",
        "successCount",
        "failureCount",
        "currentIndex",
        "eventCount",
    ):
        raw_number = value.get(key)
        if isinstance(raw_number, int) and not isinstance(raw_number, bool) and 0 <= raw_number <= 10_000_000:
            result[key] = raw_number
    current_chunk_id = _safe_batch_code(value.get("currentChunkId"))
    result["currentChunkId"] = current_chunk_id
    result["successChunkIds"] = [
        chunk_id
        for chunk_id in (_safe_batch_code(item) for item in (value.get("successChunkIds") or [])[:10_000])
        if chunk_id
    ] if isinstance(value.get("successChunkIds"), list) else []
    result["preservedAttempts"] = _project_preserved_attempts(value.get("preservedAttempts"))
    raw_failures = value.get("failures")
    result["failures"] = [
        failure
        for failure in (
            project_batch_rerun_failure(item)
            for item in (raw_failures[:10_000] if isinstance(raw_failures, list) else [])
        )
        if failure is not None
    ]
    last_event = value.get("lastEvent")
    result["lastEvent"] = project_batch_rerun_event(last_event) if isinstance(last_event, dict) else None
    result["result"] = _project_batch_rerun_result(value.get("result"))
    if value.get("error") not in (None, ""):
        category, issue_codes, message = _batch_failure_reason(value.get("error"))
        result.update(
            {
                "error": message,
                "guardCategory": category,
                "issueCodes": issue_codes,
                "errorStored": False,
                "reasoningSuppressed": True,
                "providerContentStored": False,
            }
        )
    else:
        result["error"] = None
    for key in ("createdAt", "updatedAt", "persistedAt"):
        raw_text = value.get(key)
        if isinstance(raw_text, str):
            result[key] = raw_text[:96]
    return result


def persist_batch_rerun_state(run_id: str) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        snapshot = serialize_batch_rerun_state(run_id, state)
    try:
        write_json_atomic(
            batch_rerun_state_path(run_id),
            {
                "kind": "batchRerun",
                "version": 1,
                "persistedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "state": snapshot,
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
    return project_batch_rerun_public_payload(summary)


def normalize_task_summary_item(summary: dict[str, Any], *, task_type: str, task_group: str) -> dict[str, Any]:
    item = dict(summary)
    target_path = str(item.get("sourcePath") or item.get("outputPath") or "")
    item["taskType"] = task_type
    item["taskGroup"] = task_group
    item["targetPath"] = target_path
    item["active"] = task_group == "active"
    item["sortAt"] = str(item.get("updatedAt") or item.get("persistedAt") or item.get("createdAt") or "")
    return item


def build_task_summary_items(
    active_runs: list[dict[str, Any]],
    active_batch_reruns: list[dict[str, Any]],
    recent_runs: list[dict[str, Any]],
    recent_batch_reruns: list[dict[str, Any]],
    *,
    include_active: bool = True,
    limit: int = 16,
) -> list[dict[str, Any]]:
    normalized_limit = max(1, min(int(limit or 16), 100))
    items: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add_many(source: list[dict[str, Any]], *, task_type: str, task_group: str) -> None:
        for summary in source:
            run_id = str(summary.get("runId", "")).strip()
            if not run_id:
                continue
            key = (task_type, run_id)
            if key in seen:
                continue
            seen.add(key)
            items.append(normalize_task_summary_item(summary, task_type=task_type, task_group=task_group))

    if include_active:
        add_many(active_runs, task_type="run-round", task_group="active")
        add_many(active_batch_reruns, task_type="batch-rerun", task_group="active")
    add_many(recent_runs, task_type="run-round", task_group="recent")
    add_many(recent_batch_reruns, task_type="batch-rerun", task_group="recent")
    items.sort(key=lambda item: str(item.get("sortAt", "")), reverse=True)
    return items[:normalized_limit]


def append_batch_rerun_event(run_id: str, event: dict[str, Any]) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    safe_event = project_batch_rerun_event(event)
    with state.condition:
        state.events.append(safe_event)
        state.updated_at = time.time()
        state.condition.notify_all()
    persist_batch_rerun_state(run_id)


def finalize_batch_rerun(run_id: str, *, result: dict[str, Any] | None = None, error: str | None = None) -> None:
    state = BATCH_RERUN_STATES.get(run_id)
    if not state:
        return
    with state.condition:
        state.result = _project_batch_rerun_result(result)
        state.error = (
            _batch_failure_reason(error)[2]
            if error
            else None
        )
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
    hydrated_incoming = hydrate_app_config_secrets(incoming)
    merged = {**saved, **hydrated_incoming}
    if "roundModels" in incoming:
        merged["roundModels"] = {
            **(saved.get("roundModels", {}) or {}),
            **(hydrated_incoming.get("roundModels", {}) or {}),
        }
    else:
        merged["roundModels"] = saved.get("roundModels", {}) or {}
    if "modelProviders" not in incoming:
        merged["modelProviders"] = saved.get("modelProviders", []) or []
    return hydrate_app_config_secrets(merged)


# Directories that are never relevant to the user's workspace data but can hold
# enormous file trees (git metadata, python venv, node modules, build output).
# Skipping them keeps /api/health fast instead of stat-ing tens of thousands of files.
WORKSPACE_STAT_SKIP_DIRS: tuple[str, ...] = (
    ".git",
    ".venv",
    "venv",
    "env",
    "node_modules",
    "dist",
    "__pycache__",
    ".cache",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".idea",
    ".vscode",
)


def summarize_workspace_path(path: Path, *, label: str, kind: str, include_stats: bool = True) -> dict[str, Any]:
    exists = path.exists()
    file_count = 0
    size_bytes = 0
    if exists and include_stats:
        try:
            if path.is_file():
                file_count = 1
                size_bytes = path.stat().st_size
            else:
                # Walk the tree manually so we can prune heavy, data-irrelevant
                # subtrees instead of rglob-ing every file under them.
                stack: list[Path] = [path]
                while stack:
                    current = stack.pop()
                    try:
                        for child in current.iterdir():
                            name = child.name
                            if child.is_dir():
                                if name in WORKSPACE_STAT_SKIP_DIRS:
                                    continue
                                stack.append(child)
                                continue
                            if child.is_file():
                                try:
                                    size_bytes += child.stat().st_size
                                except OSError:
                                    pass
                                file_count += 1
                    except OSError:
                        pass
        except OSError:
            pass
    writable_target = path if path.is_dir() else path.parent
    # Saving a not-yet-created config is supported: app_config creates its
    # parent directories atomically on first save.  Check the nearest existing
    # ancestor so diagnostics reflect whether that mkdir operation can succeed
    # instead of reporting a false failure merely because the optional config
    # directory has not been materialized yet.
    while not writable_target.exists() and writable_target.parent != writable_target:
        writable_target = writable_target.parent
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


def workspace_paths_are_ready(path_summaries: list[dict[str, Any]]) -> bool:
    """Return whether the paths required for normal runtime writes are ready.

    Production images intentionally keep the application root read-only for
    the non-root service account.  Treating that immutable root like a data
    directory makes an otherwise healthy container report ``ok=false``.  The
    root only has to exist; uploads, intermediate files, exports, and the
    configuration parent are the locations that must remain writable.
    """

    summaries_by_key = {
        str(item.get("key", "")): item
        for item in path_summaries
        if isinstance(item, dict) and item.get("key")
    }
    workspace = summaries_by_key.get("workspace")
    if not workspace or not bool(workspace.get("exists")):
        return False

    for key in ("origin", "intermediate", "exports"):
        item = summaries_by_key.get(key)
        if not item or not bool(item.get("exists")) or not bool(item.get("writable")):
            return False

    # The configuration file is optional until the operator saves model
    # settings, so only its parent-directory writability is required here.
    config = summaries_by_key.get("config")
    return bool(config and config.get("writable"))


def build_environment_diagnostics() -> dict[str, Any]:
    ensure_workspace_dirs()
    config = load_app_config()
    config_path = get_app_config_path()
    providers = config.get("modelProviders", []) if isinstance(config.get("modelProviders"), list) else []
    round_models = config.get("roundModels", {}) if isinstance(config.get("roundModels"), dict) else {}
    try:
        rewrite_concurrency = int(config.get("rewriteConcurrency", 2) or 2)
    except (TypeError, ValueError):
        rewrite_concurrency = 2
    rewrite_concurrency = max(1, min(MAX_REWRITE_CONCURRENCY, rewrite_concurrency))
    try:
        configured_timeout = int(config.get("requestTimeoutSeconds", MIN_REWRITE_REQUEST_TIMEOUT_SECONDS) or MIN_REWRITE_REQUEST_TIMEOUT_SECONDS)
    except (TypeError, ValueError):
        configured_timeout = MIN_REWRITE_REQUEST_TIMEOUT_SECONDS
    effective_rewrite_timeout = max(MIN_REWRITE_REQUEST_TIMEOUT_SECONDS, min(3600, configured_timeout))
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
    recent_tasks = build_task_summary_items([], [], recent_runs, recent_batch_reruns, include_active=False, limit=16)
    tasks = build_task_summary_items(active_runs, active_batch_reruns, recent_runs, recent_batch_reruns, limit=20)
    task_state_readiness = ensure_task_state_store_ready(reason="health", max_age_seconds=TASK_STATE_SELF_HEAL_INTERVAL_SECONDS)
    task_state_store = summarize_task_state_store()
    task_state_store["readiness"] = task_state_readiness
    task_state_ready_ok = bool(task_state_readiness.get("ok"))
    task_state_has_actionable_drift = _task_state_store_needs_cleanup(task_state_store)
    task_state_level = "success" if task_state_ready_ok and not task_state_has_actionable_drift else "warning"
    task_state_message = (
        "Task state snapshots were cleaned automatically."
        if task_state_ready_ok and task_state_readiness.get("action") == "cleaned"
        else "Task state snapshots are healthy."
        if task_state_ready_ok and not task_state_has_actionable_drift
        else "Task state snapshots need attention; automatic cleanup did not finish cleanly."
        if not task_state_ready_ok
        else "Task state snapshots still include stale or invalid files."
    )
    history_readiness = ensure_history_database_ready(reason="health", max_age_seconds=30, compact=True)
    try:
        history_database = get_history_database_maintenance_summary()
    except Exception as exc:
        history_database = {"ok": False, "error": str(exc)}
    history_database["readiness"] = history_readiness
    history_policy = history_database.get("policy") if isinstance(history_database.get("policy"), dict) else {}
    history_should_compact = bool(history_policy.get("shouldCompact"))
    history_ready_ok = bool(history_readiness.get("ok"))
    history_db_level = "success" if bool(history_database.get("ok")) and history_ready_ok and not history_should_compact else "warning"
    history_db_message = (
        "SQLite history index is healthy."
        if bool(history_database.get("ok")) and history_ready_ok and not history_should_compact
        else "SQLite history index was optimized automatically."
        if history_ready_ok and history_readiness.get("action") == "compact-index"
        else "SQLite history index was repaired automatically."
        if history_ready_ok and history_readiness.get("action") not in {"", "none", "compact-index"}
        else "SQLite history index can be compacted; automatic cleanup will handle it after destructive history changes."
        if history_should_compact
        else "SQLite history index needs attention; automatic repair did not finish cleanly."
        if not history_ready_ok
        else f"SQLite history diagnostics are unavailable: {history_database.get('error')}"
        if history_database.get("error")
        else "SQLite history index has not been created yet."
    )
    path_summaries = [
        # ROOT_DIR is the whole repo — walking it on every health check is the
        # single biggest public-latency cost. Skip the file/byte walk here; the
        # diagnostic badge only needs exists/writable (O(1) stat). Same for the
        # large intermediate tree. Smaller data dirs keep their counts.
        summarize_workspace_path(ROOT_DIR, label="项目根目录", kind="workspace", include_stats=False),
        summarize_workspace_path(ORIGIN_DIR, label="源文档目录", kind="origin"),
        summarize_workspace_path(ROOT_DIR / "finish" / "intermediate", label="中间产物目录", kind="intermediate", include_stats=False),
        summarize_workspace_path(EXPORT_DIR, label="项目导出目录", kind="exports"),
        summarize_workspace_path(config_path, label="本地配置文件", kind="config"),
    ]
    workspace_paths_ready = workspace_paths_are_ready(path_summaries)
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
            "ok": bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model")),
            "level": "success" if (bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model"))) else "warning",
            "message": "默认模型连接已配置。" if (bool(config.get("baseUrl")) and bool(config.get("apiKey")) and bool(config.get("model"))) else "默认模型连接未完整配置，可到模型配置页填写。",
        },
        {
            "key": "providers",
            "label": "服务商仓库",
            "ok": len(enabled_providers) > 0,
            "level": "success" if len(enabled_providers) > 0 else "info",
            "message": f"已启用 {len(enabled_providers)} 个服务商。" if enabled_providers else "没有启用服务商；每轮会继承默认连接。",
        },
        {
            "key": "rewriteConcurrency",
            "label": "轮内并发",
            "ok": 1 <= rewrite_concurrency <= MAX_REWRITE_CONCURRENCY,
            "level": "success",
            "message": f"当前轮内并发 {rewrite_concurrency}/{MAX_REWRITE_CONCURRENCY}，默认建议 2；自建服务商可按稳定性调到 16。",
        },
        {
            "key": "paths",
            "label": "工作目录",
            "ok": workspace_paths_ready,
            "level": "success" if workspace_paths_ready else "error",
            "message": "运行数据目录可读写，项目根目录可保持只读。" if workspace_paths_ready else "部分运行数据目录不可写，请检查权限。",
        },
        {
            "key": "runs",
            "label": "运行任务",
            "ok": len(active_runs) + len(active_batch_reruns) == 0,
            "level": "success" if len(active_runs) + len(active_batch_reruns) == 0 else "warning",
            "message": "当前没有后台运行中的任务。" if len(active_runs) + len(active_batch_reruns) == 0 else f"当前有 {len(active_runs)} 个运行中的轮次，{len(active_batch_reruns)} 个批量重跑任务。",
        },
        {
            "key": "taskStateStore",
            "label": "Task state",
            "ok": task_state_ready_ok and not task_state_has_actionable_drift,
            "level": task_state_level,
            "message": task_state_message,
        },
        {
            "key": "historyDatabase",
            "label": "SQLite history",
            "ok": bool(history_database.get("ok")),
            "level": history_db_level,
            "message": history_db_message,
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
        "taskCount": len(tasks),
        "recentTaskCount": len(recent_tasks),
        "checks": checks,
        "tasks": tasks,
        "activeRuns": active_runs,
        "activeBatchReruns": active_batch_reruns,
        "recentTasks": recent_tasks,
        "recentRuns": recent_runs,
        "recentBatchReruns": recent_batch_reruns,
        "taskStateStore": task_state_store,
        "historyDatabase": history_database,
        "paths": path_summaries,
        "config": {
            "path": str(config_path),
            "exists": config_path.exists(),
            "hasBaseUrl": bool(config.get("baseUrl")),
            "hasApiKey": bool(config.get("apiKey")),
            "model": str(config.get("model", "")),
            "apiType": str(config.get("apiType", "")),
            "promptProfile": str(config.get("promptProfile", "")),
            "promptSequence": config.get("promptSequence", []),
            "rewriteConcurrency": rewrite_concurrency,
            "maxRewriteConcurrency": MAX_REWRITE_CONCURRENCY,
            "requestTimeoutSeconds": config.get("requestTimeoutSeconds"),
            "effectiveRewriteTimeoutSeconds": effective_rewrite_timeout,
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


def run_round_async(
    run_id: str,
    source_path: str,
    model_config: dict[str, Any],
    expected_previous_compare_revision: str = "",
    expected_parent_input_binding: dict[str, str] | None = None,
) -> None:
    def is_cancelled() -> bool:
        state = RUN_STATES.get(run_id)
        return bool(state and state.cancel_requested)

    try:
        result = run_round_for_app(
            source_path,
            model_config,
            progress_callback=lambda event: append_progress_event(run_id, event),
            cancel_check=is_cancelled,
            expected_previous_compare_revision=expected_previous_compare_revision,
            expected_parent_input_binding=expected_parent_input_binding,
        )
        finalize_progress(run_id, result=result)
    except Exception as exc:
        finalize_progress(run_id, error=str(exc))


def batch_rerun_async(run_id: str, output_path: str, targets: list[dict[str, str]], model_config: dict[str, Any]) -> None:
    current_output_path = output_path
    compare_path = ""
    latest_compare: dict[str, Any] | None = None
    output_lock = get_output_rerun_lock(current_output_path)
    output_lock.acquire()
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
                preserved_attempt = (
                    project_preserved_candidate_selection_attempt(
                        result.get("candidateSelectionAttempt")
                    )
                    if result.get("preservedExisting") is True
                    else None
                )
                with state.condition:
                    state.completed_count += 1
                    state.success_count += 1
                    if chunk_id not in state.success_chunk_ids:
                        state.success_chunk_ids.append(chunk_id)
                    if preserved_attempt is not None:
                        state.preserved_attempts = [
                            item
                            for item in state.preserved_attempts
                            if str(item.get("chunkId", "") or "") != chunk_id
                        ]
                        state.preserved_attempts.append(
                            {
                                "chunkId": chunk_id,
                                "candidateSelectionAttempt": preserved_attempt,
                            }
                        )
                    state.updated_at = time.time()
                    state.condition.notify_all()
                append_batch_rerun_event(
                    run_id,
                    {
                        "phase": "chunk-preserved" if preserved_attempt is not None else "chunk-complete",
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
                        "error": failure.get("error", _BATCH_FAILURE_MESSAGES["local_validation"]),
                        "guardCategory": failure.get("guardCategory", "local_validation"),
                        "issueCodes": failure.get("issueCodes", ["validation_rejected_unspecified"]),
                        "errorStored": False,
                        "failedAttempts": failure.get("failedAttempts", []),
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
            "preservedAttempts": state.preserved_attempts,
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
    finally:
        output_lock.release()


def rate_audit_strategy_async(
    run_id: str,
    request_payload: dict[str, Any],
    model_config: dict[str, Any],
) -> None:
    """Run a bound RateAudit plan while preserving BatchRerun status shape."""

    def is_cancelled() -> bool:
        state = BATCH_RERUN_STATES.get(run_id)
        return bool(state and state.cancel_requested)

    def on_progress(event: dict[str, Any]) -> None:
        state = BATCH_RERUN_STATES.get(run_id)
        if state is None:
            return
        phase = str(event.get("phase", "") or "")
        chunk_id = str(event.get("chunkId", "") or "")
        with state.condition:
            state.status = "running"
            state.current_index = int(event.get("index", state.current_index) or state.current_index)
            state.current_chunk_id = chunk_id
            if phase == "chunk-complete":
                state.completed_count += 1
                state.success_count += 1
                if chunk_id and chunk_id not in state.success_chunk_ids:
                    state.success_chunk_ids.append(chunk_id)
            elif phase == "chunk-failed":
                state.completed_count += 1
                state.failure_count += 1
                projected_failure = project_batch_rerun_failure(
                    {
                        "chunkId": chunk_id,
                        "error": event.get("error", ""),
                        "guardCategory": event.get("guardCategory") or event.get("errorCategory"),
                        "issueCodes": event.get("issueCodes"),
                        "failedAttempts": event.get("failedAttempts"),
                    }
                )
                if projected_failure is not None:
                    state.failures.append(projected_failure)
            state.updated_at = time.time()
            state.condition.notify_all()
        append_batch_rerun_event(run_id, event)

    try:
        result = execute_rate_audit_strategy(
            request_payload,
            model_config,
            progress_callback=on_progress,
            cancel_check=is_cancelled,
        )
        result["runId"] = run_id
        state = BATCH_RERUN_STATES.get(run_id)
        if state is not None:
            # Use the executor's authoritative final lists. The progress fields
            # remain useful during polling but cannot drift from the result.
            with state.condition:
                state.completed_count = int(result.get("completedCount", state.completed_count) or 0)
                state.success_count = int(result.get("successCount", state.success_count) or 0)
                state.failure_count = int(result.get("failureCount", state.failure_count) or 0)
                state.success_chunk_ids = list(result.get("successChunkIds", []) or [])
                state.failures = list(result.get("failures", []) or [])
                state.updated_at = time.time()
                state.condition.notify_all()
        append_batch_rerun_event(
            run_id,
            {
                "phase": "batch-canceled" if result.get("canceled") else "batch-complete",
                "total": result.get("totalCount", 0),
                "completed": result.get("completedCount", 0),
                "success": result.get("successCount", 0),
                "failure": result.get("failureCount", 0),
                "strategy": "rate-audit",
            },
        )
        finalize_batch_rerun(run_id, result=result)
    except StaleRateAuditStrategyPlanError as exc:
        append_batch_rerun_event(
            run_id,
            {
                "phase": "strategy-stale",
                "code": "stale_strategy_plan",
                "mismatchCodes": exc.mismatch_codes,
            },
        )
        finalize_batch_rerun(run_id, error=str(exc))
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


def bounded_int_query_value(key: str, *, minimum: int, maximum: int, default: int | None = None) -> int | None:
    """Parse an integer query param, clamping it to [minimum, maximum].

    A missing/empty value returns ``default``. An out-of-range or non-integer
    value also falls back to ``default`` so a hostile or malformed request can
    never force an unbounded response payload.
    """
    raw_value = request.args.get(key, "").strip()
    if not raw_value:
        return default
    try:
        parsed = int(raw_value)
    except (TypeError, ValueError):
        return default
    if parsed < minimum:
        return minimum
    if parsed > maximum:
        return maximum
    return parsed


@app.route("/api/<path:_path>", methods=["OPTIONS"])
@app.route("/api", methods=["OPTIONS"])
def options_api(_path: str | None = None) -> Response:
    return Response(status=204)


@app.after_request
def add_cors_headers(response: Response) -> Response:
    origin = request.headers.get("Origin", "").strip()
    allowed_origins = {
        *_local_origin(FRONTEND_DEV_PORT),
        *_local_origin(WEB_PORT),
        *{
            item.strip()
            for item in os.getenv("FYADR_ALLOWED_ORIGINS", "").split(",")
            if item.strip()
        },
    }
    if origin in allowed_origins:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-FYADR-CSRF"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    response.headers["Access-Control-Expose-Headers"] = (
        "Content-Disposition, X-Export-Path, X-Export-Format, X-Export-Layout-Mode, "
        "X-Export-Evidence-Version, X-Export-Overall-Status, X-Export-Source-Kind, "
        "X-Export-Content-Contract-Status, X-Export-Format-Lock-Status, X-Export-Checks-Performed, "
        "X-Export-Attempt-Id, X-Export-Artifact-Sha256, X-Export-Evidence-Manifest-Path, "
        "X-Export-Output-Path, X-Export-Doc-Id, X-Export-Round, X-Export-Compare-Revision, "
        "X-Export-Content-Revision, X-Export-Artifact-Snapshot-Digest, "
        "X-Export-Paragraph-Source, X-Export-Format-Mode, X-Export-Format-Scope, "
        "X-Export-Validation-Path, X-Export-Audit-Path, X-Export-Audit-Issue-Count, "
        "X-Export-Ooxml-Audit-Path, X-Export-Ooxml-Audit-Issue-Count, "
        "X-Export-Format-Lock-Path, X-Export-Format-Lock-Issue-Count, X-Export-Format-Lock-Editable-Checked, "
        "X-Export-Content-Contract-Path, X-Export-Content-Contract-Ready, X-Export-Content-Contract-Issue-Count, "
        "X-Export-Editable-Unit-Count, X-Export-Protected-Unit-Count, X-Export-Protected-Heading-Count, "
        "X-Export-Editable-Heading-Count, X-Export-Model-Input-Scope-Match, "
        "X-Export-Guard-Path, X-Export-Guard-Issue-Count, X-Export-Guard-Warning-Count, "
        "X-Export-Guard-Issue-Samples, X-Export-Audit-Issue-Samples, "
        "X-Export-Ooxml-Audit-Issue-Samples"
    )
    # API payloads can contain document/task metadata and must never be stored
    # by shared caches.  Static responses set their own policy in the frontend
    # serving helpers below; do not overwrite immutable hashed-asset caching.
    if request.path == "/api" or request.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif "Cache-Control" not in response.headers:
        response.headers["Cache-Control"] = "no-cache"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.route("/api/model-config", methods=["GET"])
def get_model_config() -> Response:
    return jsonify(redact_app_config(load_app_config()))


@app.route("/api/prompts", methods=["GET", "POST"])
def get_prompts() -> tuple[Response, int] | Response:
    try:
        if request.method == "POST":
            payload = request.get_json(silent=True) or {}
            item = create_prompt(payload.get("label"), payload.get("content"), payload.get("description", ""))
            return jsonify({"ok": True, "promptDir": "prompts", "item": item}), 201
        return jsonify(
            {
                "ok": True,
                "promptDir": "prompts",
                "items": list_prompt_preview_items(),
                "workflows": list_prompt_workflows(),
            }
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompts/<prompt_id>", methods=["PUT", "DELETE"])
def update_prompt(prompt_id: str) -> tuple[Response, int] | Response:
    try:
        if request.method == "DELETE":
            payload = delete_prompt(prompt_id)
            return jsonify({"ok": True, "promptDir": "prompts", **payload})
        payload = request.get_json(silent=True) or {}
        item = save_prompt_content(prompt_id, payload.get("content"))
        return jsonify({"ok": True, "promptDir": "prompts", "item": item})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompts/<prompt_id>/meta", methods=["PATCH"])
def update_prompt_meta(prompt_id: str) -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        item = update_prompt_metadata(prompt_id, payload.get("label"), payload.get("description", ""))
        return jsonify({"ok": True, "promptDir": "prompts", "item": item})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompts/<prompt_id>/restore-default", methods=["POST"])
def restore_prompt_default(prompt_id: str) -> tuple[Response, int] | Response:
    try:
        item = restore_default_prompt(prompt_id)
        return jsonify({"ok": True, "promptDir": "prompts", "item": item})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompts/<prompt_id>/backups", methods=["GET"])
def get_prompt_backups(prompt_id: str) -> tuple[Response, int] | Response:
    try:
        return jsonify({"ok": True, "items": list_prompt_backups(prompt_id)})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompts/<prompt_id>/restore-backup", methods=["POST"])
def restore_prompt_from_backup(prompt_id: str) -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        item = restore_prompt_backup(prompt_id, payload.get("relativePath"))
        return jsonify({"ok": True, "promptDir": "prompts", "item": item})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/prompt-workflows/<workflow_id>", methods=["PATCH"])
def patch_prompt_workflow(workflow_id: str) -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        workflows = update_prompt_workflow(workflow_id, payload)
        return jsonify({"ok": True, "promptDir": "prompts", "workflows": workflows})
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/ping", methods=["GET"])
def get_ping() -> Response:
    return jsonify(
        {
            "ok": True,
            "service": "fyadr-web",
            "maxRewriteConcurrency": MAX_REWRITE_CONCURRENCY,
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
        if mode not in {"expired", "completed", "all"}:
            raise ValueError("mode must be one of: expired, completed, all.")
        max_age_hours = positive_task_int(payload.get("maxAgeHours", TASK_STATE_RETENTION_HOURS)) or TASK_STATE_RETENTION_HOURS
        return jsonify(cleanup_task_state_snapshots(mode=mode, max_age_hours=max_age_hours))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/model-config", methods=["POST"])
def post_model_config() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(redact_app_config(save_app_config(payload)))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/test-connection", methods=["POST"])
def post_test_connection() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(test_model_connection(hydrate_app_config_secrets(payload)))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/list-models", methods=["POST"])
def post_list_models() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        return jsonify(list_available_models(hydrate_app_config_secrets(payload)))
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


@app.route("/api/document-status", methods=["GET"])
def get_status() -> tuple[Response, int] | Response:
    try:
        prompt_profile = request.args.get("promptProfile", DEFAULT_PROMPT_PROFILE)
        prompt_sequence = parse_prompt_sequence_value(request.args.get("promptSequence"))
        return jsonify(
            get_document_status(
                normalize_api_source_path(require_query_value("sourcePath")),
                prompt_profile=prompt_profile,
                prompt_sequence=prompt_sequence,
            )
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-history", methods=["GET"])
def get_history() -> tuple[Response, int] | Response:
    try:
        ensure_history_database_ready(reason="document-history", max_age_seconds=15, compact=False)
        return jsonify(get_document_history(normalize_api_source_path(require_query_value("sourcePath"))))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-protection-map", methods=["GET"])
def get_protection_map() -> tuple[Response, int] | Response:
    try:
        return jsonify(get_document_protection_map(normalize_api_source_path(require_query_value("sourcePath"))))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/document-scope-diagnostics", methods=["GET"])
def get_scope_diagnostics() -> tuple[Response, int] | Response:
    try:
        return jsonify(get_document_scope_diagnostics(normalize_api_source_path(require_query_value("sourcePath"))))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/rate-audit", methods=["GET"])
def get_rate_audit_route() -> tuple[Response, int] | Response:
    try:
        source_path = normalize_api_source_path(require_query_value("sourcePath"))
        raw_output_path = str(request.args.get("outputPath", "") or "").strip()
        output_path = normalize_api_output_path(raw_output_path) if raw_output_path else None
        return jsonify(get_document_rate_audit(source_path, output_path))
    except RoundArtifactSnapshotError as exc:
        status = 423 if exc.code == "round_snapshot_busy" else 400
        return error_response(
            str(exc),
            status=status,
            code=exc.code,
            retryable=exc.retryable,
            details=exc.details or None,
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/rate-audit/execute", methods=["POST"])
def post_rate_audit_execute() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            raise ValueError("RateAudit strategy request must be an object.")
        model_config = payload.get("modelConfig")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")
        if not isinstance(payload.get("sourcePath"), str):
            raise ValueError("sourcePath must be a string.")
        if not isinstance(payload.get("outputPath"), str):
            raise ValueError("outputPath must be a string.")

        source_path = normalize_api_source_path(payload["sourcePath"].strip())
        output_path = normalize_api_output_path(payload["outputPath"].strip())
        normalized_payload = {
            **payload,
            "sourcePath": source_path,
            "outputPath": output_path,
        }
        _, binding = validate_rate_audit_strategy_request(normalized_payload)
        target_chunk_ids = list(binding.get("targetChunkIds", []) or [])
        effective_model_config = merge_model_config_for_run(model_config)

        # Registration reserves the same output identity used by ordinary
        # batch reruns. Never attach a strategy request to an unrelated active
        # batch task: a conflict is explicit and retryable.
        run_id, _ = register_batch_rerun(output_path, len(target_chunk_ids))
        worker = threading.Thread(
            target=rate_audit_strategy_async,
            args=(run_id, normalized_payload, effective_model_config),
            daemon=True,
        )
        worker.start()
        return jsonify({"runId": run_id, "alreadyActive": False}), 202
    except StaleRateAuditStrategyPlanError as exc:
        return error_response(
            str(exc),
            status=409,
            code="stale_strategy_plan",
            mismatchCodes=exc.mismatch_codes,
        )
    except ValueError as exc:
        message = str(exc)
        status = 409 if "running batch rerun task" in message else 400
        return error_response(
            message,
            status=status,
            code="strategy_execution_conflict" if status == 409 else "invalid_strategy_request",
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-documents", methods=["GET"])
def get_history_list() -> tuple[Response, int] | Response:
    try:
        ensure_history_database_ready(reason="history-list", max_age_seconds=15, compact=False)
        return jsonify(list_document_histories())
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-artifacts", methods=["GET", "POST"])
def get_history_artifacts() -> tuple[Response, int] | Response:
    try:
        ensure_history_database_ready(reason="history-artifacts", max_age_seconds=15, compact=False)
        payload = (request.get_json(silent=True) or {}) if request.method == "POST" else {}
        filters = {
            "docId": payload.get("docId", request.args.get("docId", "")),
            "roundNumber": payload.get("roundNumber", request.args.get("roundNumber", "")),
            "kind": payload.get("kinds", payload.get("kind", request.args.getlist("kind") or request.args.get("kind", ""))),
            "exists": payload.get("exists", request.args.get("exists", "")),
            "minBytes": payload.get("minBytes", request.args.get("minBytes", "")),
            "maxBytes": payload.get("maxBytes", request.args.get("maxBytes", "")),
            "pathContains": payload.get("pathContains", request.args.get("pathContains", "")),
            "limit": payload.get("limit", request.args.get("limit", "")),
            "offset": payload.get("offset", request.args.get("offset", "")),
        }
        return jsonify(query_history_artifact_governance(filters))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/check", methods=["GET"])
def get_history_database_check() -> tuple[Response, int] | Response:
    try:
        ensure_history_database_ready(reason="history-check", max_age_seconds=0, compact=False)
        return jsonify(check_history_database_governance())
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/maintenance", methods=["GET"])
def get_history_database_maintenance() -> tuple[Response, int] | Response:
    try:
        readiness = ensure_history_database_ready(reason="history-maintenance", max_age_seconds=0, compact=True)
        payload = get_history_database_maintenance_summary()
        payload["readiness"] = readiness
        return jsonify(payload)
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/repair", methods=["POST"])
def post_history_database_repair() -> tuple[Response, int] | Response:
    try:
        return jsonify(repair_history_database_governance())
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/backups", methods=["GET"])
def get_history_database_backups() -> tuple[Response, int] | Response:
    try:
        validate = request.args.get("validate", "").strip().lower() in {"1", "true", "yes"}
        return jsonify(list_history_database_backups(validate=validate))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/backup", methods=["POST"])
def post_history_database_backup() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        reason = str(payload.get("reason", "manual")).strip() or "manual"
        keep = coerce_backup_keep(payload.get("keep", DEFAULT_BACKUP_KEEP))
        return jsonify(backup_history_database_governance(reason=reason, keep=keep))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/compact", methods=["POST"])
def post_history_database_compact() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        create_backup = payload.get("createBackup", True)
        keep = coerce_backup_keep(payload.get("keep", DEFAULT_BACKUP_KEEP))
        return jsonify(compact_history_database_governance(create_backup=bool(create_backup), keep=keep))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/history-db/recover", methods=["POST"])
def post_history_database_recover() -> tuple[Response, int] | Response:
    try:
        payload = request.get_json(silent=True) or {}
        backup_path = str(payload.get("backupPath", "")).strip() or None
        keep = coerce_backup_keep(payload.get("keep", DEFAULT_BACKUP_KEEP))
        return jsonify(recover_history_database_governance(backup_path=backup_path, keep=keep))
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
                max_chars=bounded_int_query_value("maxChars", minimum=1, maximum=2_000_000, default=None),
            )
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/round-snapshot", methods=["GET"])
def get_round_snapshot() -> tuple[Response, int] | Response:
    try:
        return jsonify(
            read_round_artifact_snapshot(
                require_query_value("outputPath"),
                max_preview_chars=bounded_int_query_value(
                    "maxChars",
                    minimum=1,
                    maximum=2_000_000,
                    default=None,
                ),
            )
        )
    except RoundArtifactSnapshotError as exc:
        status = 423 if exc.code == "round_snapshot_busy" else 409
        return error_response(
            str(exc),
            status=status,
            code=exc.code,
            retryable=exc.retryable,
            details=exc.details or None,
        )
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/read-compare", methods=["GET"])
def get_read_compare() -> tuple[Response, int] | Response:
    try:
        return jsonify(read_round_compare(require_query_value("outputPath"), include_revision=True))
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
        expected_compare_revision = payload.get("expectedCompareRevision")
        if not output_path:
            raise ValueError("outputPath is required.")
        if not isinstance(decisions, dict):
            raise ValueError("decisions must be an object keyed by chunk id.")
        if expected_compare_revision is not None and not isinstance(expected_compare_revision, str):
            raise ValueError("expectedCompareRevision must be a string.")
        return jsonify(
            save_review_decisions(
                output_path,
                decisions,
                expected_compare_revision=expected_compare_revision,
                require_compare_revision=True,
            )
        )
    except ReviewRevisionRequiredError as exc:
        return error_response(str(exc), status=428, code="review_revision_required")
    except StaleReviewDecisionsError as exc:
        return error_response(
            str(exc),
            status=409,
            code="stale_review_decisions",
            currentCompareRevision=exc.current_compare_revision,
        )
    except InconsistentReviewStateError as exc:
        return error_response(
            str(exc),
            status=409,
            code="review_state_inconsistent",
            currentCompareRevision=exc.current_compare_revision,
        )
    except DocumentReleaseGateError as exc:
        return error_response(
            str(exc),
            status=409,
            code=exc.code,
            chunkId=exc.chunk_id,
            mode=exc.mode,
            issueCodes=list(exc.issue_codes),
        )
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
        return jsonify(rerun_compare_chunk(output_path, chunk_id, hydrate_app_config_secrets(model_config), user_feedback=user_feedback))
    except Exception as exc:
        failure: dict[str, Any] | None = None
        if output_path and chunk_id:
            failure, _ = build_batch_rerun_failure(chunk_id, str(exc), output_path)
        public_message = (
            str((failure or {}).get("error", "") or "")
            or _batch_failure_reason(str(exc))[2]
        )
        return error_response(public_message, failure=failure)


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

        normalized_output_path = normalize_api_output_path(output_path)
        run_id, _, already_active = register_or_reuse_batch_rerun(normalized_output_path, len(targets))
        if already_active:
            return jsonify({"runId": run_id, "alreadyActive": True}), 202

        effective_model_config = merge_model_config_for_run(model_config)
        worker = threading.Thread(
            target=batch_rerun_async,
            args=(run_id, normalized_output_path, targets, effective_model_config),
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
        expected_previous_compare_revision = payload.get("expectedPreviousCompareRevision")
        request_binding_fields = (
            ("expectedPreviousCompareRevision", "compareRevision"),
            ("expectedPreviousReviewRevision", "reviewRevision"),
            ("expectedPreviousContentRevision", "contentRevision"),
            ("expectedPreviousArtifactSnapshotDigest", "artifactSnapshotDigest"),
            ("expectedPreviousEffectiveTextSha256", "effectiveTextSha256"),
        )
        if not source_path:
            raise ValueError("sourcePath is required.")
        if not isinstance(model_config, dict):
            raise ValueError("modelConfig is required.")
        expected_parent_input_binding: dict[str, str] = {}
        for request_field, snapshot_field in request_binding_fields:
            raw_value = payload.get(request_field)
            if raw_value is None:
                continue
            if not isinstance(raw_value, str):
                raise ValueError(f"{request_field} must be a string.")
            value = raw_value.strip()
            if value:
                expected_parent_input_binding[snapshot_field] = value

        normalized_source_path = normalize_api_source_path(source_path)
        effective_model_config = merge_model_config_for_run(model_config)
        if not bool(payload.get("allowNewRoute") or effective_model_config.get("allowNewRoute")):
            route_conflict = find_conflicting_history_route(normalized_source_path, effective_model_config)
            if route_conflict:
                return error_response(
                    str(route_conflict.get("message") or "Document has completed history under another prompt route."),
                    status=409,
                    code="prompt_route_conflict",
                    routeConflict=route_conflict,
                )
        input_binding = preflight_run_round_input(
            normalized_source_path,
            effective_model_config,
            expected_previous_compare_revision=expected_previous_compare_revision,
            expected_parent_input_binding=expected_parent_input_binding or None,
            require_revision=True,
        )
        bound_parent_revision = str(input_binding.get("parentCompareRevision", "") or "")
        bound_parent_input_binding = input_binding.get("parentInputBinding")
        if not isinstance(bound_parent_input_binding, dict):
            bound_parent_input_binding = {}
        run_id, _, already_active = register_or_reuse_run(
            normalized_source_path,
            bound_parent_revision,
            expected_parent_input_binding=bound_parent_input_binding,
        )
        if already_active:
            return jsonify({
                "runId": run_id,
                "alreadyActive": True,
                "parentInputBinding": bound_parent_input_binding,
            }), 202

        worker = threading.Thread(
            target=run_round_async,
            args=(
                run_id,
                normalized_source_path,
                effective_model_config,
                bound_parent_revision,
                bound_parent_input_binding,
            ),
            daemon=True,
        )
        worker.start()
        return jsonify({
            "runId": run_id,
            "alreadyActive": False,
            "parentInputBinding": bound_parent_input_binding,
        }), 202
    except RoundInputRevisionRequiredError as exc:
        return error_response(str(exc), status=428, code="round_input_revision_required")
    except StaleRoundInputError as exc:
        return error_response(
            str(exc),
            status=409,
            code="stale_round_input",
            currentCompareRevision=exc.current_compare_revision,
            mismatchCodes=exc.mismatch_codes,
        )
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
        source_path = normalize_api_source_path(require_query_value("sourcePath"))
        prompt_profile = request.args.get("promptProfile", DEFAULT_PROMPT_PROFILE)
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
        prompt_profile = str(payload.get("promptProfile", DEFAULT_PROMPT_PROFILE)).strip()
        prompt_sequence = parse_prompt_sequence_value(payload.get("promptSequence"))
        round_number = positive_task_int(payload.get("roundNumber", 0) or 0) or 0
        if not source_path or round_number <= 0:
            raise ValueError("sourcePath and roundNumber are required.")
        normalized_source_path = normalize_api_source_path(source_path)
        active_run = get_active_run_for_source(normalized_source_path)
        if active_run is not None:
            active_run_id, active_state = active_run
            return error_response(
                f"Current document has an active {active_state.status} run ({active_run_id}); cancel or wait before resetting round progress.",
                409,
            )
        return jsonify(reset_round_progress(normalized_source_path, prompt_profile, round_number, prompt_sequence=prompt_sequence))
    except Exception as exc:
        return error_response(str(exc))


@app.route("/api/export-round", methods=["POST"])
def post_export_round() -> tuple[Response, int] | Response:
    try:
        revision_binding: dict[str, Any] = {}
        payload = request.get_json(silent=True) or {}
        output_path = str(payload.get("outputPath", "") or "").strip()
        target_format = str(payload.get("targetFormat", "") or "").strip().lower()
        if not output_path:
            return error_response("outputPath is required.", 400)
        if not target_format:
            return error_response("targetFormat is required.", 400)
        binding_fields = {
            "expectedDocId": payload.get("expectedDocId"),
            "expectedRound": payload.get("expectedRound"),
            "expectedCompareRevision": payload.get("expectedCompareRevision"),
            "expectedContentRevision": payload.get("expectedContentRevision"),
            "expectedArtifactSnapshotDigest": payload.get("expectedArtifactSnapshotDigest"),
        }
        if any(value is not None for value in binding_fields.values()):
            missing = [key for key, value in binding_fields.items() if value is None]
            if missing:
                return error_response(
                    "Revision-bound export fields must be supplied together: " + ", ".join(missing),
                    400,
                )
            for key in (
                "expectedDocId",
                "expectedCompareRevision",
                "expectedContentRevision",
                "expectedArtifactSnapshotDigest",
            ):
                value = binding_fields[key]
                if not isinstance(value, str) or not value.strip() or len(value) > 512:
                    return error_response(f"{key} must be a non-empty string.", 400)
                binding_fields[key] = value.strip()
            raw_expected_round = binding_fields["expectedRound"]
            if (
                isinstance(raw_expected_round, bool)
                or not isinstance(raw_expected_round, int)
                or raw_expected_round < 1
            ):
                return error_response("expectedRound must be a positive integer.", 400)
            for key in ("expectedContentRevision", "expectedArtifactSnapshotDigest"):
                if not re.fullmatch(r"[0-9a-f]{64}", str(binding_fields[key])):
                    return error_response(f"{key} must be a lowercase SHA-256 digest.", 400)
            revision_binding = {
                "expected_doc_id": binding_fields["expectedDocId"],
                "expected_round": raw_expected_round,
                "expected_compare_revision": binding_fields["expectedCompareRevision"],
                "expected_content_revision": binding_fields["expectedContentRevision"],
                "expected_artifact_snapshot_digest": binding_fields["expectedArtifactSnapshotDigest"],
            }
        if target_format not in {"txt", "docx"}:
            return error_response(f"Unsupported export format: {target_format}", 400)
        # Path.stem yields only the basename, so it cannot escape EXPORT_DIR;
        # we additionally sanitize it and validate the resolved export path
        # stays under EXPORT_DIR as defense-in-depth against a malicious
        # targetFormat (e.g. "../../evil") that could otherwise break out of
        # the export directory via the f-string below.
        raw_stem = Path(output_path).stem or "current-round"
        stem = truncate_utf8_filename_component(
            sanitize_filename(raw_stem),
            max_bytes=96,
            fallback="current-round",
        )
        output_identity = sha256(str(Path(output_path).expanduser().resolve()).encode("utf-8")).hexdigest()[:12]
        export_path = (EXPORT_DIR / f"{stem}__{output_identity}.{target_format}").resolve()
        if not is_path_under(export_path, EXPORT_DIR):
            return error_response("Export path must stay under the export workspace directory.", 400)
        result = export_round_output(output_path, str(export_path), target_format, **revision_binding)
        required_evidence_fields = (
            "evidenceVersion",
            "overallStatus",
            "sourceKind",
            "contentContractStatus",
            "formatLockStatus",
            "checksPerformed",
        )
        missing_evidence_fields = [field for field in required_evidence_fields if field not in result]
        if target_format == "docx":
            missing_evidence_fields.extend(
                field
                for field in ("exportAttemptId", "artifactSha256", "evidenceManifestPath")
                if field not in result
            )
        if missing_evidence_fields or not isinstance(result.get("checksPerformed"), list):
            raise RuntimeError(
                "Export service returned an incomplete evidence protocol: "
                + ", ".join(missing_evidence_fields or ["checksPerformed"])
            )
        file_path = Path(result["path"])
        mimetype = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if target_format == "txt":
            mimetype = "text/plain; charset=utf-8"
        response = send_file(file_path, mimetype=mimetype, as_attachment=True, download_name=f"{stem}.{target_format}")
        response.headers["X-Export-Path"] = make_ascii_header_value(file_path)
        response.headers["X-Export-Format"] = str(result.get("format", target_format))
        response.headers["X-Export-Evidence-Version"] = str(result["evidenceVersion"])
        response.headers["X-Export-Overall-Status"] = str(result["overallStatus"])
        response.headers["X-Export-Certification"] = str(result.get("certification", ""))
        response.headers["X-Export-Source-Kind"] = str(result["sourceKind"])
        response.headers["X-Export-Content-Contract-Status"] = str(result["contentContractStatus"])
        response.headers["X-Export-Format-Lock-Status"] = str(result["formatLockStatus"])
        checks_performed = result["checksPerformed"]
        response.headers["X-Export-Checks-Performed"] = ",".join(
            str(item).strip() for item in checks_performed if str(item).strip()
        )
        response.headers["X-Export-Attempt-Id"] = str(result.get("exportAttemptId", ""))
        response.headers["X-Export-Artifact-Sha256"] = str(result.get("artifactSha256", ""))
        response.headers["X-Export-Evidence-Manifest-Path"] = make_ascii_header_value(result.get("evidenceManifestPath", ""))
        response.headers["X-Export-Output-Path"] = make_ascii_header_value(result.get("outputPath", output_path))
        response.headers["X-Export-Doc-Id"] = make_ascii_header_value(result.get("docId", ""))
        response.headers["X-Export-Round"] = str(result.get("round", ""))
        response.headers["X-Export-Compare-Revision"] = make_ascii_header_value(result.get("compareRevision", ""))
        response.headers["X-Export-Content-Revision"] = str(result.get("contentRevision", ""))
        response.headers["X-Export-Artifact-Snapshot-Digest"] = str(result.get("artifactSnapshotDigest", ""))
        response.headers["X-Export-Layout-Mode"] = str(result.get("layoutMode", ""))
        response.headers["X-Export-Paragraph-Source"] = str(result.get("paragraphSource", ""))
        response.headers["X-Export-Format-Mode"] = str(result.get("formatMode", ""))
        response.headers["X-Export-Format-Scope"] = str(result.get("formatScope", ""))
        response.headers["X-Export-Validation-Path"] = make_ascii_header_value(result.get("validationPath", ""))
        response.headers["X-Export-Audit-Path"] = make_ascii_header_value(result.get("auditPath", ""))
        response.headers["X-Export-Audit-Issue-Count"] = str(result.get("auditIssueCount", ""))
        response.headers["X-Export-Ooxml-Audit-Path"] = make_ascii_header_value(result.get("ooxmlAuditPath", ""))
        response.headers["X-Export-Ooxml-Audit-Issue-Count"] = str(result.get("ooxmlAuditIssueCount", ""))
        response.headers["X-Export-Format-Lock-Path"] = make_ascii_header_value(result.get("formatLockPath", ""))
        response.headers["X-Export-Format-Lock-Issue-Count"] = str(result.get("formatLockIssueCount", ""))
        response.headers["X-Export-Format-Lock-Editable-Checked"] = str(result.get("formatLockEditableChecked", ""))
        response.headers["X-Export-Content-Contract-Path"] = make_ascii_header_value(result.get("contentContractPath", ""))
        response.headers["X-Export-Content-Contract-Ready"] = "1" if result.get("contentContractReady") else "0"
        response.headers["X-Export-Content-Contract-Issue-Count"] = str(result.get("contentContractIssueCount", ""))
        response.headers["X-Export-Editable-Unit-Count"] = str(result.get("editableUnitCount", ""))
        response.headers["X-Export-Protected-Unit-Count"] = str(result.get("protectedUnitCount", ""))
        response.headers["X-Export-Protected-Heading-Count"] = str(result.get("protectedHeadingCount", ""))
        response.headers["X-Export-Editable-Heading-Count"] = str(result.get("editableHeadingCount", ""))
        response.headers["X-Export-Model-Input-Scope-Match"] = "1" if result.get("modelInputMatchesEditableUnits") else "0"
        response.headers["X-Export-Guard-Path"] = make_ascii_header_value(result.get("guardPath", ""))
        response.headers["X-Export-Guard-Issue-Count"] = str(result.get("guardIssueCount", ""))
        response.headers["X-Export-Guard-Warning-Count"] = str(result.get("guardWarningCount", ""))
        response.headers["X-Export-Guard-Issue-Samples"] = make_ascii_header_json(result.get("guardIssueSamples", []))
        response.headers["X-Export-Audit-Issue-Samples"] = make_ascii_header_json(result.get("auditIssueSamples", []))
        response.headers["X-Export-Ooxml-Audit-Issue-Samples"] = make_ascii_header_json(result.get("ooxmlAuditIssueSamples", []))
        return response
    except ExportRoundError as exc:
        return error_response(
            str(exc),
            status=400,
            code="docx_export_blocked",
            exportFailure=exc.export_failure,
        )
    except RoundArtifactSnapshotError as exc:
        status = 423 if exc.code == "round_snapshot_busy" else 409
        return error_response(
            str(exc),
            status=status,
            code=exc.code,
            retryable=exc.retryable,
            details=exc.details or None,
        )
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


def _serve_frontend_asset(asset_path: str) -> Response:
    """Serve a real file from the production build with the right cache tier."""

    if not WEB_STATIC_DIR:
        return error_response("Frontend build not mounted", 404)
    normalized_asset_path = str(asset_path or "").replace("\\", "/").lstrip("/")
    if not normalized_asset_path or any(part.startswith(".") for part in Path(normalized_asset_path).parts):
        return error_response("Not found", 404)
    static_root = Path(WEB_STATIC_DIR).resolve()
    candidate = (static_root / normalized_asset_path).resolve()
    if not is_path_under(candidate, static_root):
        return error_response("Forbidden", 403)
    if not candidate.is_file():
        return error_response("Not found", 404)
    response = send_from_directory(
        str(static_root),
        normalized_asset_path,
        mimetype=FRONTEND_ASSET_MIME_TYPES.get(candidate.suffix.lower()),
        conditional=True,
    )
    if normalized_asset_path.startswith("assets/"):
        # Vite assets are content-hashed, so a one-year immutable cache is safe.
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    else:
        # Public root files (logo/favicon) keep stable names and need revalidation.
        response.headers["Cache-Control"] = "public, max-age=86400"
    return response


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_frontend(path: str) -> Response:
    """Serve real dist files and use index.html only for extensionless SPA routes."""

    normalized_path = str(path or "").replace("\\", "/").lstrip("/")
    # The generic SPA GET route would otherwise hide Flask's method rejection
    # for this former compatibility endpoint.  Keep the API POST-only and make
    # the retired side-effecting GET contract explicit to old clients.
    if normalized_path == "api/export-round":
        response = jsonify({"ok": False, "code": "method_not_allowed", "message": "Use POST to export an artifact."})
        response.status_code = 405
        response.headers["Allow"] = "POST, OPTIONS"
        return response
    if not WEB_STATIC_DIR:
        return error_response("Unknown route", 404)
    if normalized_path == "api" or normalized_path.startswith("api/"):
        return error_response("Unknown route", 404)

    static_root = Path(WEB_STATIC_DIR).resolve()
    candidate = (static_root / normalized_path).resolve() if normalized_path else static_root
    if normalized_path and is_path_under(candidate, static_root) and candidate.is_file():
        return _serve_frontend_asset(normalized_path)

    # Missing assets must be a real 404. Returning index.html with image/JS URLs
    # hides deployment mistakes behind a misleading HTTP 200 and wrong MIME.
    if normalized_path.startswith("assets/") or Path(normalized_path).suffix:
        return error_response("Not found", 404)

    index_path = static_root / "index.html"
    if index_path.is_file():
        response = send_file(str(index_path), mimetype="text/html", conditional=True)
        response.headers["Cache-Control"] = "no-cache"
        return response
    return error_response("Frontend build not found", 404)


def initialize_runtime(*, reason: str = "startup") -> dict[str, Any]:
    """Run one-time writable-store checks before serving production traffic."""

    ensure_workspace_dirs()
    task_state_readiness = ensure_task_state_store_ready(reason=reason, max_age_seconds=0)
    if task_state_readiness.get("action") not in {"", "none"}:
        print(
            f"Task state {reason} check: {task_state_readiness.get('action')} "
            f"(ok={bool(task_state_readiness.get('ok'))})"
        )
    history_readiness = ensure_history_database_ready(reason=reason, max_age_seconds=0, compact=True)
    if history_readiness.get("action") not in {"", "none"}:
        print(
            f"SQLite history {reason} check: {history_readiness.get('action')} "
            f"(ok={bool(history_readiness.get('ok'))})"
        )
    return {
        "ok": bool(task_state_readiness.get("ok", True)) and bool(history_readiness.get("ok", True)),
        "taskState": task_state_readiness,
        "history": history_readiness,
    }


def main() -> None:
    initialize_runtime(reason="startup")
    print(f"fyadr Web API running at http://{WEB_HOST}:{WEB_PORT}")
    # Gunicorn imports the module-level app and does not call main(); the
    # container entrypoint invokes initialize_runtime explicitly before it
    # starts Gunicorn. app.run is only the local diagnostic/development path.
    app.run(host=WEB_HOST, port=WEB_PORT, threaded=True)


if __name__ == "__main__":
    main()
