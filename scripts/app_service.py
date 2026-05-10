from __future__ import annotations

import json
import re
import sys
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from docx import Document  # type: ignore[import]

from fyadr_records import (
    _collect_round_file_paths,
    build_artifact_summary,
    delete_document,
    delete_rounds,
    list_referenced_history_artifact_paths,
    list_records,
    normalize_doc_id,
    preview_delete_document,
)
from chunking import DEFAULT_CHUNK_LIMIT, build_manifest, load_manifest, restore_text_from_chunks, split_text_to_paragraphs
from fyadr_round_service import (
    build_global_style_profile_from_texts,
    build_language_guard,
    build_local_style_card,
    build_paragraph_guard,
    build_prompt_input,
    get_max_rounds,
    get_round_checkpoint_path,
    get_round_compare_path,
    get_chunk_metric,
    load_prompt,
    normalize_chunk_output,
    normalize_path,
    normalize_prompt_profile,
    normalize_prompt_sequence,
    protect_structure_tokens,
    restore_structure_tokens,
    validate_chunk_output,
    validate_structure_placeholders,
    _build_chunk_quality,
    _build_checkpoint_signature,
    _build_validation_repair_steps,
    _extract_required_terms,
    _is_checkpoint_compatible,
    _score_rewrite_output,
    _serialize_failed_output,
    _sha256_text,
)
from prompt_library import DEFAULT_PROMPT_PROFILE, LEGACY_PROMPT_PROFILE, get_prompt_id_for_round, is_prompt_sequence_customizable, prompt_sequence_match_rank
from docx_bodymap import load_docx_body_map, save_docx_body_map, update_docx_body_map_texts
from docx_audit import (
    audit_docx_export,
    audit_docx_ooxml_integrity,
    get_docx_audit_report_path,
    get_docx_ooxml_audit_report_path,
)
from docx_export_guard import (
    run_docx_pre_export_guard,
    summarize_docx_export_guard_failure,
)
from docx_pipeline import (
    _load_docx_snapshot,
    _normalize_rewritten_text,
    _resolve_target_paragraph,
    _split_text_into_blocks,
    build_docx_scope_diagnostics,
    ensure_docx_processing_assets,
    get_docx_scope_diagnostics_path,
    get_docx_snapshot_path,
    rebuild_docx_from_snapshot,
    rebuild_docx_from_body_map_units,
    write_docx_text,
)
from docx_protection_map import build_docx_protection_map
from docx_template import DocxFormatPreflightError, apply_school_format_rules
from llm_client import LLMRequestError, list_llm_models, llm_completion, test_llm_connection
from round_helper import build_round_context, ensure_round_input_text, get_document_round_state


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
MIN_REWRITE_REQUEST_TIMEOUT_SECONDS = 600
DEFAULT_MAX_RETRIES = 3
MIN_REWRITE_TRANSIENT_RETRIES = 6
REWRITE_RETRY_BACKOFF_SECONDS = 5.0
DEFAULT_REWRITE_CONCURRENCY = 2
MAX_REWRITE_CONCURRENCY = 16
DEFAULT_PREVIEW_MAX_CHARS = 12000
TARGETED_RERUN_VALIDATION_ATTEMPTS = 2
_RATE_LIMIT_STATE: dict[str, list[float]] = {}
_RATE_LIMIT_LOCK = threading.Lock()
_PROVIDER_GUARD_STATE: dict[str, dict[str, Any]] = {}
_PROVIDER_GUARD_LOCK = threading.Lock()
API_READ_ALLOWED_ROOTS = tuple((ROOT_DIR / name).resolve() for name in ("finish", "origin", "prompts", "references"))
API_OUTPUT_ALLOWED_ROOTS = ((ROOT_DIR / "finish").resolve(),)
API_EXPORT_ALLOWED_ROOTS = ((ROOT_DIR / "finish").resolve(),)


class ExportRoundError(ValueError):
    def __init__(self, message: str, export_failure: dict[str, Any]) -> None:
        super().__init__(message)
        self.export_failure = export_failure


def _is_path_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _resolve_api_path(path_value: str | Path, *, allowed_roots: tuple[Path, ...], label: str) -> Path:
    normalized_path = normalize_path(Path(path_value)).resolve()
    if not any(_is_path_under(normalized_path, root) for root in allowed_roots):
        allowed = ", ".join(str(root) for root in allowed_roots)
        raise ValueError(f"{label} must stay under allowed workspace directories: {allowed}")
    return normalized_path


def _truncate_issue_text(value: Any, limit: int = 180) -> str:
    text = " ".join(str(value or "").split())
    return text[:limit] + ("…" if len(text) > limit else "")


def _format_issue_location(issue: dict[str, Any]) -> str:
    parts: list[str] = []
    for key, label in (
        ("paragraphIndex", "段落"),
        ("unitIndex", "单元"),
        ("chunkId", "块"),
        ("tableIndex", "表"),
        ("rowIndex", "行"),
        ("cellIndex", "单元格"),
        ("role", "角色"),
    ):
        value = issue.get(key)
        if value is not None and value != "":
            parts.append(f"{label} {value}")
    return " · ".join(parts)


def _normalize_issue_sample(issue: Any) -> dict[str, str] | None:
    if not isinstance(issue, dict):
        text = _truncate_issue_text(issue)
        return {"message": text} if text else None
    message = _truncate_issue_text(issue.get("message") or issue.get("type") or issue.get("code") or "检查项")
    sample = _truncate_issue_text(
        issue.get("sample")
        or issue.get("rewrittenSample")
        or issue.get("originalSample")
        or issue.get("actual")
        or issue.get("expected")
    )
    normalized = {
        "code": _truncate_issue_text(issue.get("code") or issue.get("type") or issue.get("severity"), 80),
        "severity": _truncate_issue_text(issue.get("severity"), 40),
        "message": message,
        "location": _format_issue_location(issue),
        "sample": sample,
    }
    return {key: value for key, value in normalized.items() if value}


def _read_json_report(path: Any) -> dict[str, Any] | None:
    try:
        if not path:
            return None
        report_path = Path(str(path))
        if not report_path.exists():
            return None
        payload = json.loads(report_path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _collect_issue_samples(*reports: dict[str, Any] | None, keys: tuple[str, ...] = ("issues",), limit: int = 3) -> list[dict[str, str]]:
    samples: list[dict[str, str]] = []
    for report in reports:
        if not isinstance(report, dict):
            continue
        for key in keys:
            raw_issues = report.get(key)
            if not isinstance(raw_issues, list):
                continue
            for issue in raw_issues:
                sample = _normalize_issue_sample(issue)
                if sample:
                    samples.append(sample)
                if len(samples) >= limit:
                    return samples
    return samples


def _build_export_failure(
    *,
    stage: str,
    label: str,
    message: str,
    report: dict[str, Any] | None = None,
    report_path: Any = None,
    issue_count: int | None = None,
    warning_count: int | None = None,
    samples: list[dict[str, str]] | None = None,
    sample_keys: tuple[str, ...] = ("issues",),
) -> dict[str, Any]:
    normalized_report = report if isinstance(report, dict) else None
    normalized_report_path = (
        str(report_path or "").strip()
        or str((normalized_report or {}).get("reportPath", "") or "").strip()
        or str((normalized_report or {}).get("path", "") or "").strip()
    )
    normalized_issue_count = issue_count
    if normalized_issue_count is None and normalized_report is not None:
        normalized_issue_count = int(normalized_report.get("blockingIssueCount", normalized_report.get("issueCount", 0)) or 0)
    normalized_warning_count = warning_count
    if normalized_warning_count is None and normalized_report is not None:
        normalized_warning_count = int(normalized_report.get("warningCount", 0) or 0)
    normalized_samples = samples if samples is not None else _collect_issue_samples(normalized_report, keys=sample_keys, limit=5)
    return {
        "stage": stage,
        "label": label,
        "message": _truncate_issue_text(message, 400),
        "reportPath": normalized_report_path,
        "issueCount": int(normalized_issue_count or 0),
        "warningCount": int(normalized_warning_count or 0),
        "samples": normalized_samples[:5],
    }


def _coerce_int_config(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


def _coerce_rewrite_timeout_seconds(value: Any) -> int:
    return _coerce_int_config(
        value,
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=MIN_REWRITE_REQUEST_TIMEOUT_SECONDS,
        maximum=3600,
    )


def _coerce_rate_limit(value: Any) -> int:
    return _coerce_int_config(value, default=0, minimum=0, maximum=10000)


def _coerce_rate_window_minutes(model_config: dict[str, Any]) -> float:
    try:
        value = float(model_config.get("rateLimitWindowMinutes", 0) or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value > 0:
        return min(1440.0, value)
    if _coerce_rate_limit(model_config.get("rateLimitPerFiveMinutes", 0)) > 0:
        return 5.0
    if _coerce_rate_limit(model_config.get("rateLimitPerMinute", 0)) > 0:
        return 1.0
    return 0.0


def _coerce_rate_max_requests(model_config: dict[str, Any]) -> int:
    value = _coerce_rate_limit(model_config.get("rateLimitMaxRequests", 0))
    if value > 0:
        return value
    five_minute_value = _coerce_rate_limit(model_config.get("rateLimitPerFiveMinutes", 0))
    if five_minute_value > 0:
        return five_minute_value
    return _coerce_rate_limit(model_config.get("rateLimitPerMinute", 0))


def _provider_guard_key(model_config: dict[str, Any]) -> str:
    provider_id = str(model_config.get("providerId", "") or "").strip()
    if provider_id:
        return f"id:{provider_id}"
    return "|".join(
        [
            str(model_config.get("providerName", "")).strip(),
            str(model_config.get("baseUrl", "")).strip(),
            str(model_config.get("apiKey", "")).strip()[-12:],
        ]
    )


def _provider_display_name(model_config: dict[str, Any]) -> str:
    return (
        str(model_config.get("providerName", "") or "").strip()
        or str(model_config.get("providerId", "") or "").strip()
        or str(model_config.get("baseUrl", "") or "").strip()
        or "default-provider"
    )


def _build_provider_rate_limiter(model_config: dict[str, Any]) -> Callable[[], float]:
    window_minutes = _coerce_rate_window_minutes(model_config)
    max_requests = _coerce_rate_max_requests(model_config)
    if window_minutes <= 0 or max_requests <= 0:
        return lambda: 0.0

    window_seconds = window_minutes * 60.0
    provider_key = _provider_guard_key(model_config)

    def wait_for_slot() -> float:
        waited = 0.0
        while True:
            with _RATE_LIMIT_LOCK:
                now = time.monotonic()
                timestamps = _RATE_LIMIT_STATE.setdefault(provider_key, [])
                timestamps[:] = [item for item in timestamps if now - item < window_seconds]
                if len(timestamps) < max_requests:
                    timestamps.append(now)
                    return waited
                wait_seconds = max(0.0, window_seconds - (now - timestamps[0]))
            time.sleep(wait_seconds)
            waited += wait_seconds

    return wait_for_slot


def _wait_for_provider_cooldown(
    model_config: dict[str, Any],
    *,
    cancel_check: Callable[[], bool] | None = None,
) -> float:
    provider_key = _provider_guard_key(model_config)
    waited = 0.0
    while True:
        if cancel_check is not None and cancel_check():
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")
        with _PROVIDER_GUARD_LOCK:
            state = _PROVIDER_GUARD_STATE.get(provider_key) or {}
            cooldown_until = float(state.get("cooldownUntil", 0.0) or 0.0)
            reason = str(state.get("category", "") or "")
            now = time.monotonic()
            remaining = cooldown_until - now
        if remaining <= 0:
            return waited
        time.sleep(min(remaining, 1.0))
        waited += min(remaining, 1.0)
        if waited >= 1.0 and reason:
            continue


def _register_provider_success(model_config: dict[str, Any]) -> None:
    provider_key = _provider_guard_key(model_config)
    with _PROVIDER_GUARD_LOCK:
        state = _PROVIDER_GUARD_STATE.get(provider_key)
        if not state:
            return
        state["successCount"] = int(state.get("successCount", 0) or 0) + 1
        state["failureCount"] = 0
        if float(state.get("cooldownUntil", 0.0) or 0.0) <= time.monotonic():
            state.pop("cooldownUntil", None)
            state.pop("category", None)
            state.pop("message", None)


def _register_provider_failure(model_config: dict[str, Any], exc: BaseException) -> None:
    provider_key = _provider_guard_key(model_config)
    category = str(getattr(exc, "category", "") or "unknown")
    cooldown_seconds = getattr(exc, "cooldown_seconds", None)
    if cooldown_seconds is None:
        cooldown_seconds = 0
    try:
        cooldown_seconds = float(cooldown_seconds)
    except (TypeError, ValueError):
        cooldown_seconds = 0
    retryable = bool(getattr(exc, "retryable", False))
    should_cooldown = retryable or category in {"rate_limit", "server", "timeout", "network"}
    with _PROVIDER_GUARD_LOCK:
        state = _PROVIDER_GUARD_STATE.setdefault(provider_key, {})
        failure_count = int(state.get("failureCount", 0) or 0) + 1
        state.update(
            {
                "provider": _provider_display_name(model_config),
                "failureCount": failure_count,
                "category": category,
                "message": str(exc),
                "updatedAt": time.monotonic(),
            }
        )
        if should_cooldown:
            fallback_seconds = min(60.0, max(3.0, 3.0 * failure_count))
            effective_cooldown = max(cooldown_seconds, fallback_seconds)
            state["cooldownUntil"] = max(float(state.get("cooldownUntil", 0.0) or 0.0), time.monotonic() + effective_cooldown)


def _coerce_history_artifact_stats(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    empty_stats = _empty_artifact_stats()
    if not any(key in value for key in empty_stats):
        return None
    stats = dict(empty_stats)
    for key in stats:
        item = value.get(key)
        if isinstance(item, (int, float)):
            stats[key] = int(item)
    return stats


def _map_history_round(item: dict[str, Any]) -> dict[str, Any]:
    prompt_sequence = item.get("prompt_sequence")
    quality_summary = _load_history_quality_summary(item)
    run_audit = _build_history_run_audit(item, quality_summary)
    artifact_stats = _coerce_history_artifact_stats(item.get("artifactStats"))
    if artifact_stats is None:
        artifact_stats = _coerce_history_artifact_stats(item.get("artifact_stats"))
    return {
        "round": int(item.get("round", 0)),
        "prompt": str(item.get("prompt", "")),
        "promptProfile": str(item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower() or LEGACY_PROMPT_PROFILE,
        "promptSequence": prompt_sequence if isinstance(prompt_sequence, list) else [],
        "inputPath": str(item.get("input_path", "")),
        "outputPath": str(item.get("output_path", "")),
        "manifestPath": str(item.get("manifest_path", "")),
        "comparePath": str(item.get("compare_path", "")),
        "qualityPath": str(item.get("quality_path", "")),
        "scoreTotal": item.get("score_total"),
        "chunkLimit": item.get("chunk_limit"),
        "inputSegmentCount": item.get("input_segment_count"),
        "outputSegmentCount": item.get("output_segment_count"),
        "bodyMapPath": str(item.get("body_map_path", "")),
        "validationPath": str(item.get("validation_path", "")),
        "timestamp": str(item.get("timestamp", "")),
        "artifactStats": artifact_stats if artifact_stats is not None else build_artifact_summary([item]),
        "qualitySummary": quality_summary or None,
        "runAudit": run_audit or None,
    }


def _history_path_to_absolute(value: object) -> Path | None:
    raw_path = str(value or "").strip()
    if not raw_path:
        return None
    candidate = Path(raw_path)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate
    return candidate.resolve()


def _load_history_quality_summary(item: dict[str, Any]) -> dict[str, Any]:
    quality_path = _history_path_to_absolute(item.get("quality_path"))
    if quality_path is None or not quality_path.exists() or not quality_path.is_file():
        return {}
    try:
        payload = json.loads(quality_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _build_history_run_audit(item: dict[str, Any], quality_summary: dict[str, Any]) -> dict[str, Any]:
    stored_audit = item.get("run_audit")
    audit = dict(stored_audit) if isinstance(stored_audit, dict) else {}
    for legacy_key in ("offlineMode", "rewriteCandidateMode", "candidateMaxPerChunk", "twoCandidateChunkCount"):
        audit.pop(legacy_key, None)
    if quality_summary:
        split_summary = quality_summary.get("paragraphSplitSummary")
        audit.setdefault("estimatedApiCalls", quality_summary.get("estimatedApiCalls"))
        audit.setdefault("validationRetryCount", quality_summary.get("validationRetryCount"))
        audit.setdefault("sourceFallbackCount", quality_summary.get("sourceFallbackCount"))
        audit.setdefault("validationEventCount", quality_summary.get("validationEventCount"))
        audit.setdefault("machineLikeRiskCount", quality_summary.get("machineLikeRiskCount"))
        audit.setdefault("protectedTokenCount", quality_summary.get("protectedTokenCount"))
        if isinstance(split_summary, dict):
            audit.setdefault("paragraphCount", split_summary.get("paragraphCount"))
            audit.setdefault("chunkCount", split_summary.get("chunkCount"))
            audit.setdefault("splitParagraphCount", split_summary.get("splitParagraphCount"))
    if item.get("input_segment_count") is not None:
        audit.setdefault("chunkCount", item.get("input_segment_count"))
    audit.setdefault("promptProfile", str(item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE))
    prompt_sequence = item.get("prompt_sequence")
    if isinstance(prompt_sequence, list):
        audit.setdefault("promptSequence", prompt_sequence)
    return {key: value for key, value in audit.items() if value not in ("", None, [])}


def _record_entry_to_history(doc_id: str, entry: dict[str, Any]) -> dict[str, Any]:
    rounds = entry.get("rounds") if isinstance(entry.get("rounds"), list) else []
    history_rounds = [_map_history_round(item) for item in rounds if isinstance(item, dict)]
    history_rounds.sort(key=lambda item: item["round"], reverse=True)
    completed_rounds = sorted({item["round"] for item in history_rounds})
    latest_round = max(
        history_rounds,
        key=lambda item: (item.get("timestamp", ""), item["round"]),
        default=None,
    )
    origin_path = str(entry.get("origin_path", doc_id))
    source_kind = str(entry.get("sourceKind", entry.get("source_kind", Path(origin_path).suffix.lower() or ".txt")))
    artifact_stats = _coerce_history_artifact_stats(entry.get("artifactStats"))
    if artifact_stats is None:
        artifact_stats = _coerce_history_artifact_stats(entry.get("artifact_stats"))

    return {
        "docId": doc_id,
        "sourcePath": origin_path,
        "originPath": origin_path,
        "sourceKind": source_kind,
        "completedRounds": completed_rounds,
        "latestOutputPath": latest_round.get("outputPath", "") if latest_round else "",
        "lastTimestamp": latest_round.get("timestamp", "") if latest_round else "",
        "artifactStats": artifact_stats if artifact_stats is not None else build_artifact_summary([item for item in rounds if isinstance(item, dict)]),
        "rounds": history_rounds,
    }


def _indexed_history_document_to_record_entry(document: dict[str, Any]) -> dict[str, Any]:
    rounds = document.get("rounds") if isinstance(document.get("rounds"), list) else []
    origin_path = str(document.get("originPath", document.get("sourcePath", document.get("docId", ""))))
    return {
        "origin_path": origin_path,
        "sourceKind": str(document.get("sourceKind", Path(origin_path).suffix.lower() or ".txt")),
        "artifactStats": document.get("artifactStats"),
        "rounds": [item for item in rounds if isinstance(item, dict)],
    }


def _list_indexed_history_documents() -> list[dict[str, Any]] | None:
    try:
        from fyadr_history_db import list_history_documents_from_index

        documents = list_history_documents_from_index()
    except Exception:
        return None
    return documents if isinstance(documents, list) else None


def _get_indexed_history_document(doc_id: str) -> dict[str, Any] | None:
    try:
        from fyadr_history_db import get_history_document_from_index

        document = get_history_document_from_index(doc_id)
    except Exception:
        return None
    return document if isinstance(document, dict) else None


def _find_record_context_for_output(output_path: Path) -> tuple[dict[str, Any], dict[str, Any]] | None:
    normalized_output_path = normalize_path(output_path)
    records = list_records()
    for entry in records.values():
        if not isinstance(entry, dict):
            continue
        rounds = entry.get("rounds")
        if not isinstance(rounds, list):
            continue
        for round_item in rounds:
            if not isinstance(round_item, dict):
                continue
            round_output_path = round_item.get("output_path")
            if not isinstance(round_output_path, str) or not round_output_path.strip():
                continue
            if normalize_path(Path(round_output_path)) != normalized_output_path:
                continue
            return entry, round_item
    return None


def _find_origin_docx_for_output(output_path: Path) -> tuple[Path, Path] | None:
    record_context = _find_record_context_for_output(output_path)
    if record_context is None:
        return None
    entry, _ = record_context
    origin_path = entry.get("origin_path")
    if not isinstance(origin_path, str) or not origin_path.strip():
        return None
    resolved_origin_path = normalize_path(Path(origin_path))
    if resolved_origin_path.suffix.lower() != ".docx":
        return None
    return resolved_origin_path, get_docx_snapshot_path(resolved_origin_path)


def _find_compare_path_for_output(output_path: Path) -> Path:
    normalized_output_path = normalize_path(output_path)
    default_compare_path = get_round_compare_path(normalized_output_path)
    if default_compare_path.exists():
        return default_compare_path
    record_context = _find_record_context_for_output(normalized_output_path)
    if record_context is not None:
        _, round_item = record_context
        compare_path = round_item.get("compare_path")
        if isinstance(compare_path, str) and compare_path.strip():
            return normalize_path(Path(compare_path))
    return default_compare_path


def _find_manifest_path_for_output(output_path: Path, *, include_records: bool = True) -> Path | None:
    normalized_output_path = normalize_path(output_path)
    default_manifest_path = normalized_output_path.with_name(f"{normalized_output_path.stem}_manifest.json")
    if default_manifest_path.exists():
        return default_manifest_path
    if not include_records:
        return None
    record_context = _find_record_context_for_output(normalized_output_path)
    if record_context is None:
        return None
    _, round_item = record_context
    manifest_path = round_item.get("manifest_path")
    if not isinstance(manifest_path, str) or not manifest_path.strip():
        return None
    return normalize_path(Path(manifest_path))


def _find_body_map_path_for_output(output_path: Path, *, include_records: bool = True) -> Path | None:
    normalized_output_path = normalize_path(output_path)
    default_body_map_path = normalized_output_path.with_name(f"{normalized_output_path.stem}_body_map.json")
    if default_body_map_path.exists():
        return default_body_map_path
    if not include_records:
        return None
    record_context = _find_record_context_for_output(normalized_output_path)
    if record_context is None:
        return None
    _, round_item = record_context
    body_map_path = round_item.get("body_map_path")
    if not isinstance(body_map_path, str) or not body_map_path.strip():
        return None
    return normalize_path(Path(body_map_path))


def _find_validation_path_for_output(output_path: Path) -> Path | None:
    normalized_output_path = normalize_path(output_path)
    default_validation_path = normalized_output_path.with_name(f"{normalized_output_path.stem}_validation.json")
    if default_validation_path.exists():
        return default_validation_path
    record_context = _find_record_context_for_output(normalized_output_path)
    if record_context is None:
        return None
    _, round_item = record_context
    validation_path = round_item.get("validation_path")
    if not isinstance(validation_path, str) or not validation_path.strip():
        return None
    return normalize_path(Path(validation_path))


def _load_body_map_for_output(output_path: Path):
    body_map_path = _find_body_map_path_for_output(output_path)
    if body_map_path is None:
        return None
    return load_docx_body_map(body_map_path)


def _load_compare_payload_for_output(output_path: Path) -> dict[str, Any] | None:
    compare_path = _find_compare_path_for_output(output_path)
    if not compare_path.exists():
        return None
    try:
        payload = json.loads(compare_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    payload = _normalize_compare_failed_attempts(payload)
    return payload


def _normalize_failed_attempts(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    attempts: list[dict[str, Any]] = []
    for item in value[-4:]:
        if not isinstance(item, dict):
            continue
        output_text = str(item.get("outputText", "") or "")
        if not output_text.strip():
            continue
        attempts.append(
            {
                "attempt": item.get("attempt"),
                "outputText": output_text,
                "outputCharCount": item.get("outputCharCount", len(output_text)),
                "truncated": bool(item.get("truncated")),
                "error": str(item.get("error", "") or ""),
            }
        )
    return attempts


def _normalize_compare_failed_attempts(payload: dict[str, Any]) -> dict[str, Any]:
    chunks = payload.get("chunks")
    if not isinstance(chunks, list):
        return payload
    for chunk in chunks:
        if not isinstance(chunk, dict):
            continue
        failed_attempts = _normalize_failed_attempts(chunk.get("failedAttempts"))
        if not failed_attempts:
            failed_attempts = _normalize_failed_attempts(chunk.get("rejectedCandidates"))
        chunk.pop("rejectedCandidates", None)
        if failed_attempts:
            chunk["failedAttempts"] = failed_attempts
    return payload


def _load_manifest_for_compare(output_path: Path, compare_payload: dict[str, Any]):
    manifest_path: Path | None = None
    raw_manifest_path = compare_payload.get("manifestPath")
    if isinstance(raw_manifest_path, str) and raw_manifest_path.strip():
        manifest_path = normalize_path(Path(raw_manifest_path))
    if manifest_path is None:
        manifest_path = _find_manifest_path_for_output(output_path, include_records=False)
    if manifest_path is None or not manifest_path.exists():
        return None
    try:
        return load_manifest(manifest_path)
    except Exception:
        return None


def _normalize_review_decision_value(decision: Any) -> str | dict[str, Any]:
    if isinstance(decision, dict):
        mode = str(decision.get("mode", "")).strip().lower()
        text = decision.get("text")
        if mode == "custom" and isinstance(text, str) and text.strip():
            source = str(decision.get("source", "")).strip()
            if source == "rejected_candidate":
                source = "failed_output"
            return {
                "mode": "custom",
                "text": text,
                "source": source,
                "confirmed": bool(decision.get("confirmed")),
                "attempt": decision.get("attempt"),
                "error": str(decision.get("error", "")).strip(),
            }
    decision_text = str(decision)
    if decision_text in {"source", "source_confirmed"}:
        return decision_text
    if decision_text in {"rewrite", "rewrite_confirmed"}:
        return decision_text
    return "rewrite"


def _select_review_text(input_text: Any, output_text: Any, decision: Any) -> str:
    source_text = input_text if isinstance(input_text, str) else ""
    rewrite_text = output_text if isinstance(output_text, str) else ""
    normalized_decision = _normalize_review_decision_value(decision)
    if isinstance(normalized_decision, dict):
        if normalized_decision.get("source") == "failed_output" and normalized_decision.get("confirmed") is not True:
            return source_text
        return str(normalized_decision.get("text", ""))
    return source_text if normalized_decision in {"source", "source_confirmed"} else rewrite_text


def _restore_paragraphs_from_compare_manifest(
    output_path: Path,
    compare_payload: dict[str, Any],
    decisions: dict[str, Any] | None = None,
) -> list[str] | None:
    manifest = _load_manifest_for_compare(output_path, compare_payload)
    if manifest is None:
        return None
    raw_chunks = compare_payload.get("chunks")
    if not isinstance(raw_chunks, list):
        return None
    chunk_results: dict[str, str] = {}
    seen_chunk_ids: set[str] = set()
    for raw_chunk in raw_chunks:
        if not isinstance(raw_chunk, dict):
            continue
        chunk_id = str(raw_chunk.get("chunkId", "")).strip()
        if not chunk_id:
            continue
        if chunk_id in seen_chunk_ids:
            return None
        seen_chunk_ids.add(chunk_id)
        input_text = raw_chunk.get("inputText", "")
        output_text = raw_chunk.get("outputText", "")
        selected_text = _select_review_text(input_text, output_text, (decisions or {}).get(chunk_id))
        chunk_results[chunk_id] = normalize_chunk_output(
            input_text if isinstance(input_text, str) else "",
            selected_text,
        )
    manifest_chunk_ids = [chunk.chunk_id for chunk in manifest.chunks]
    manifest_chunk_id_set = set(manifest_chunk_ids)
    if (
        not manifest_chunk_ids
        or any(chunk_id not in chunk_results for chunk_id in manifest_chunk_ids)
        or any(chunk_id not in manifest_chunk_id_set for chunk_id in chunk_results)
    ):
        return None
    restored_text = restore_text_from_chunks(manifest, chunk_results)
    paragraphs = split_text_to_paragraphs(restored_text)
    if len(paragraphs) != manifest.paragraph_count:
        return None
    return paragraphs or None


def _build_paragraphs_from_compare_payload(
    output_path: Path,
    compare_payload: dict[str, Any],
    decisions: dict[str, Any] | None = None,
) -> list[str] | None:
    restored_paragraphs = _restore_paragraphs_from_compare_manifest(output_path, compare_payload, decisions)
    if restored_paragraphs is not None:
        return restored_paragraphs

    raw_chunks = compare_payload.get("chunks")
    if not isinstance(raw_chunks, list):
        return None

    expected_paragraph_count = _coerce_optional_nonnegative_int(compare_payload.get("paragraphCount"))
    expected_chunk_count = _coerce_optional_nonnegative_int(compare_payload.get("chunkCount"))
    if expected_chunk_count is not None and expected_chunk_count != len(raw_chunks):
        return None

    paragraphs_by_index: dict[int, list[tuple[int, str]]] = {}
    seen_chunk_ids: set[str] = set()
    seen_positions: set[tuple[int, int]] = set()
    for raw_chunk in raw_chunks:
        if not isinstance(raw_chunk, dict):
            return None
        chunk_id = str(raw_chunk.get("chunkId", "")).strip()
        if not chunk_id or chunk_id in seen_chunk_ids:
            return None
        seen_chunk_ids.add(chunk_id)
        try:
            paragraph_index = int(raw_chunk.get("paragraphIndex"))
            chunk_index = int(raw_chunk.get("chunkIndex"))
        except (TypeError, ValueError):
            return None
        if paragraph_index < 0 or chunk_index < 0:
            return None
        if expected_paragraph_count is not None and paragraph_index >= expected_paragraph_count:
            return None
        position = (paragraph_index, chunk_index)
        if position in seen_positions:
            return None
        seen_positions.add(position)
        input_text = raw_chunk.get("inputText", "")
        output_text = raw_chunk.get("outputText", "")
        selected_text = _select_review_text(input_text, output_text, (decisions or {}).get(chunk_id))
        normalized_text = normalize_chunk_output(
            input_text if isinstance(input_text, str) else "",
            selected_text,
        )
        paragraphs_by_index.setdefault(paragraph_index, []).append((chunk_index, normalized_text))

    if not paragraphs_by_index:
        return None

    if not _compare_paragraph_chunks_are_complete(paragraphs_by_index, expected_paragraph_count):
        return None

    if expected_paragraph_count is not None:
        return [
            _join_compare_chunk_texts(paragraphs_by_index[paragraph_index])
            for paragraph_index in range(expected_paragraph_count)
        ]

    return [
        _join_compare_chunk_texts(paragraphs_by_index[paragraph_index])
        for paragraph_index in sorted(paragraphs_by_index)
    ]


def _coerce_optional_nonnegative_int(value: Any) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized >= 0 else None


def _compare_paragraph_chunks_are_complete(
    paragraphs_by_index: dict[int, list[tuple[int, str]]],
    expected_paragraph_count: int | None,
) -> bool:
    if expected_paragraph_count is not None and set(paragraphs_by_index) != set(range(expected_paragraph_count)):
        return False
    for chunks in paragraphs_by_index.values():
        indexes = sorted(chunk_index for chunk_index, _ in chunks)
        if indexes != list(range(len(indexes))):
            return False
    return True


def _join_compare_chunk_texts(chunks: list[tuple[int, str]]) -> str:
    ordered = [
        text.strip()
        for _, text in sorted(chunks, key=lambda item: item[0])
        if text and text.strip()
    ]
    if not ordered:
        return ""
    text = ordered[0]
    for part in ordered[1:]:
        text = _join_compare_text_fragments(text, part)
    return text.strip()


def _join_compare_text_fragments(left: str, right: str) -> str:
    left = left.strip()
    right = right.strip()
    if not left:
        return right
    if not right:
        return left
    if _needs_compare_join_space(left[-1], right[0]):
        return f"{left} {right}"
    return f"{left}{right}"


def _needs_compare_join_space(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left.isspace() or right.isspace():
        return False
    if not (left.isascii() and right.isascii()):
        return False
    if left.isalnum() and right.isalnum():
        return True
    if left in ".!?;:," and right.isalnum():
        return True
    if left.isalnum() and right in "([{":
        return True
    return False


def _sync_compare_payload_to_text_artifacts(
    output_path: Path,
    compare_payload: dict[str, Any],
    decisions: dict[str, Any] | None = None,
) -> bool:
    paragraphs = _build_paragraphs_from_compare_payload(output_path, compare_payload, decisions)
    if paragraphs is None:
        return False
    try:
        output_path.write_text("\n\n".join(paragraphs), encoding="utf-8")
    except OSError:
        return False

    body_map_path = _find_body_map_path_for_output(output_path, include_records=False)
    body_map = load_docx_body_map(body_map_path) if body_map_path is not None else None
    if body_map is not None and body_map_path is not None:
        try:
            reviewed_paragraphs = _ensure_reviewed_paragraph_count_for_body_map(
                output_path,
                compare_payload,
                paragraphs,
                len(body_map.units),
                decisions or {},
            )
            save_docx_body_map(
                update_docx_body_map_texts(body_map, reviewed_paragraphs, round_number=body_map.round_number),
                body_map_path,
            )
        except Exception:
            return False
    return True


def _ensure_reviewed_paragraph_count_for_body_map(
    output_path: Path,
    compare_payload: dict[str, Any],
    reviewed_paragraphs: list[str],
    expected_count: int,
    decisions: dict[str, Any] | None = None,
) -> list[str]:
    if len(reviewed_paragraphs) == expected_count:
        return reviewed_paragraphs
    restored_paragraphs = _restore_paragraphs_from_compare_manifest(output_path, compare_payload, decisions)
    if restored_paragraphs is not None and len(restored_paragraphs) == expected_count:
        return restored_paragraphs
    raise ValueError(
        "DOCX body map paragraph count mismatch after manifest restore. "
        f"Expected {expected_count}, got {len(reviewed_paragraphs)}."
    )


def _read_output_paragraphs_for_export(output_path: Path) -> tuple[list[str], str]:
    compare_payload = _load_compare_payload_for_output(output_path)
    if compare_payload is not None:
        paragraphs = _build_paragraphs_from_compare_payload(output_path, compare_payload)
        if paragraphs is not None:
            return paragraphs, "compare"

    text = output_path.read_text(encoding="utf-8")
    return _split_text_into_blocks(text), "text"


def _build_reviewed_paragraphs_from_compare(output_path: Path, decisions: dict[str, Any]) -> list[str]:
    compare_payload = _load_compare_payload_for_output(output_path)
    if compare_payload is None:
        raise ValueError("Review export requires compare data for the selected round.")
    raw_chunks = compare_payload.get("chunks")
    if not isinstance(raw_chunks, list):
        raise ValueError("Review export compare data is invalid: chunks missing.")
    paragraphs = _build_paragraphs_from_compare_payload(output_path, compare_payload, decisions)
    if paragraphs is None:
        raise ValueError("Review export did not find any selectable chunks.")
    return paragraphs


def _round_model_key(prompt_profile: str, round_number: int) -> str:
    return f"{normalize_prompt_profile(prompt_profile)}:{int(round_number)}"


def _record_prompt_sequence_match_rank(item: dict[str, Any], prompt_profile: str, prompt_sequence: list[str]) -> int:
    if not is_prompt_sequence_customizable(prompt_profile):
        return 0
    return prompt_sequence_match_rank(item.get("prompt_sequence"), prompt_sequence, int(item.get("round", 0) or 0))


def _record_matches_prompt(
    item: dict[str, Any],
    prompt_profile: str,
    prompt_sequence: list[str],
) -> bool:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    if str(item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower() != normalized_profile:
        return False
    if not is_prompt_sequence_customizable(normalized_profile):
        return True
    return _record_prompt_sequence_match_rank(item, normalized_profile, prompt_sequence) >= 0


def _source_to_doc_id(source_path: str) -> tuple[Path, str]:
    normalized_source = normalize_path(Path(source_path))
    try:
        relative_doc_id = normalized_source.relative_to(ROOT_DIR)
        doc_id = normalize_doc_id(str(relative_doc_id).replace("\\", "/"))
    except ValueError:
        doc_id = normalize_doc_id(str(normalized_source))
    return normalized_source, doc_id


def _route_key(prompt_profile: str, prompt_sequence: list[str]) -> tuple[str, tuple[str, ...]]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    if not is_prompt_sequence_customizable(normalized_profile):
        return normalized_profile, ()
    return normalized_profile, tuple(prompt_sequence)


def find_conflicting_history_route(source_path: str, model_config: dict[str, Any]) -> dict[str, Any] | None:
    """Return an existing completed route when a fresh route would hide history."""
    _, doc_id = _source_to_doc_id(source_path)
    requested_profile = normalize_prompt_profile(model_config.get("promptProfile", DEFAULT_PROMPT_PROFILE))
    requested_sequence = normalize_prompt_sequence(requested_profile, model_config.get("promptSequence"))
    requested_key = _route_key(requested_profile, requested_sequence)
    records = list_records()
    entry = records.get(doc_id, {}) if isinstance(records, dict) else {}
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []
    normalized_rounds = [item for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)]
    if not normalized_rounds:
        return None
    if any(_record_matches_prompt(item, requested_profile, requested_sequence) for item in normalized_rounds):
        return None

    route_groups: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {}
    for item in normalized_rounds:
        item_profile = normalize_prompt_profile(str(item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE))
        item_sequence = normalize_prompt_sequence(item_profile, item.get("prompt_sequence"))
        item_key = _route_key(item_profile, item_sequence)
        if item_key == requested_key:
            continue
        group = route_groups.setdefault(
            item_key,
            {
                "promptProfile": item_profile,
                "promptSequence": item_sequence,
                "completedRounds": [],
                "latestOutputPath": "",
            },
        )
        group["completedRounds"].append(int(item["round"]))
        if item.get("output_path"):
            group["latestOutputPath"] = str(item.get("output_path") or "")

    if not route_groups:
        return None
    preferred = max(
        route_groups.values(),
        key=lambda item: (max(item["completedRounds"] or [0]), len(item["completedRounds"])),
    )
    preferred["completedRounds"] = sorted(set(preferred["completedRounds"]))
    preferred["docId"] = doc_id
    preferred["requestedPromptProfile"] = requested_profile
    preferred["requestedPromptSequence"] = requested_sequence
    preferred["message"] = (
        "该文档已有另一条提示词路线的完成记录。为避免误开新任务，请先切回历史记录对应路线再继续。"
    )
    return preferred


def _find_round_provider(model_config: dict[str, Any], override: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    provider_id = str(override.get("providerId", "") or "").strip()
    providers = model_config.get("modelProviders")
    if not provider_id or not isinstance(providers, list):
        return None, False
    for provider in providers:
        if not isinstance(provider, dict):
            continue
        if str(provider.get("id", "") or "").strip() == provider_id:
            return provider, True
    return None, True


def _copy_provider_route_fields(resolved: dict[str, Any], provider: dict[str, Any]) -> None:
    field_map = {
        "id": "providerId",
        "name": "providerName",
        "baseUrl": "baseUrl",
        "apiKey": "apiKey",
        "apiType": "apiType",
        "temperature": "temperature",
        "requestTimeoutSeconds": "requestTimeoutSeconds",
        "maxRetries": "maxRetries",
        "rateLimitWindowMinutes": "rateLimitWindowMinutes",
        "rateLimitMaxRequests": "rateLimitMaxRequests",
        "rateLimitPerMinute": "rateLimitPerMinute",
        "rateLimitPerFiveMinutes": "rateLimitPerFiveMinutes",
    }
    for source_key, target_key in field_map.items():
        if source_key in provider:
            resolved[target_key] = provider.get(source_key)
    default_model = str(provider.get("defaultModel", "") or "").strip()
    if not default_model:
        models = provider.get("models")
        if isinstance(models, list):
            default_model = next((str(item).strip() for item in models if str(item).strip()), "")
    if default_model:
        resolved["model"] = default_model


def _resolve_round_model_config(model_config: dict[str, Any], prompt_profile: str, round_number: int) -> dict[str, Any]:
    base_config = dict(model_config)
    round_models = model_config.get("roundModels")
    if not isinstance(round_models, dict):
        return base_config
    override = round_models.get(_round_model_key(prompt_profile, round_number))
    if not isinstance(override, dict) or not bool(override.get("enabled", False)):
        return base_config
    resolved = dict(base_config)
    provider, provider_lookup_attempted = _find_round_provider(model_config, override)
    if provider is not None:
        if provider.get("enabled") is False:
            raise ValueError(
                f"Round {round_number} model provider is disabled: "
                f"{str(provider.get('name') or provider.get('id') or '').strip() or 'unknown provider'}"
            )
        _copy_provider_route_fields(resolved, provider)
        resolved["routeSource"] = "provider"
    elif provider_lookup_attempted and not (
        str(override.get("baseUrl", "") or "").strip()
        and str(override.get("apiKey", "") or "").strip()
        and str(override.get("model", "") or "").strip()
    ):
        raise ValueError(f"Round {round_number} model provider no longer exists; reselect the model route.")
    else:
        resolved["routeSource"] = "round_snapshot"
    override_identity_keys = ("providerId", "model") if provider is not None else ("providerId", "providerName", "model")
    for key in override_identity_keys:
        override_value = str(override.get(key, "") or "").strip()
        if override_value:
            resolved[key] = override.get(key)
    if provider is None:
        for key in (
            "baseUrl",
            "apiKey",
            "apiType",
            "temperature",
            "requestTimeoutSeconds",
            "maxRetries",
            "rateLimitWindowMinutes",
            "rateLimitMaxRequests",
            "rateLimitPerMinute",
            "rateLimitPerFiveMinutes",
        ):
            if key in override:
                resolved[key] = override.get(key)
    return resolved


def emit_progress_event(event: dict[str, Any]) -> None:
    payload = {"event": "round-progress", "payload": event}
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def emit_result_payload(payload: dict[str, Any]) -> None:
    print(json.dumps({"event": "result", "payload": payload}, ensure_ascii=False), flush=True)


def emit_error_payload(message: str) -> None:
    print(json.dumps({"event": "error", "payload": {"message": message}}, ensure_ascii=False), flush=True)


def import_document(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    try:
        relative_doc_id = normalized_source.relative_to(ROOT_DIR)
        doc_id = normalize_doc_id(str(relative_doc_id).replace("\\", "/"))
    except ValueError:
        doc_id = normalize_doc_id(str(normalized_source))

    round_state = get_document_round_state(doc_id)
    input_text_path, extracted_from_docx = ensure_round_input_text(normalized_source)
    output_text_path = ""
    manifest_path = ""

    if round_state.next_round is not None:
        context = build_round_context(normalized_source, round_number=round_state.next_round)
        output_text_path = str(context.output_text_path)
        manifest_path = str(context.manifest_path)

    return {
        "docId": doc_id,
        "sourcePath": str(normalized_source),
        "sourceKind": normalized_source.suffix.lower() or ".txt",
        "completedRounds": round_state.completed_rounds,
        "nextRound": round_state.next_round,
        "plannedRounds": len(round_state.prompt_sequence),
        "maxRounds": get_max_rounds(round_state.prompt_profile, round_state.prompt_sequence),
        "hasNextRound": round_state.next_round is not None,
        "isComplete": round_state.is_complete,
        "inputTextPath": str(input_text_path),
        "outputTextPath": output_text_path,
        "manifestPath": manifest_path,
        "extractedFromDocx": extracted_from_docx,
    }


def get_document_status(
    source_path: str,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    try:
        relative_doc_id = normalized_source.relative_to(ROOT_DIR)
        doc_id = normalize_doc_id(str(relative_doc_id).replace("\\", "/"))
    except ValueError:
        doc_id = normalize_doc_id(str(normalized_source))

    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    round_state = get_document_round_state(
        doc_id,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
    )
    records = list_records()
    entry = records.get(doc_id, {}) if isinstance(records, dict) else {}
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []
    normalized_prompt_profile = round_state.prompt_profile
    normalized_prompt_sequence = round_state.prompt_sequence
    max_rounds = get_max_rounds(normalized_prompt_profile, normalized_prompt_sequence)
    completed_rounds = [
        item.get("round")
        for item in rounds
        if isinstance(item, dict)
        and isinstance(item.get("round"), int)
        and _record_matches_prompt(item, normalized_prompt_profile, normalized_prompt_sequence)
        and 1 <= int(item.get("round")) <= max_rounds
    ]
    completed_rounds.sort()
    latest_output_path = ""
    current_input_path, extracted_from_docx = ensure_round_input_text(normalized_source)
    current_output_path = ""
    manifest_path = ""

    if round_state.next_round is not None:
        context = build_round_context(
            normalized_source,
            round_number=round_state.next_round,
            prompt_profile=normalized_prompt_profile,
            prompt_sequence=normalized_prompt_sequence,
        )
        current_input_path = context.input_text_path
        current_output_path = str(context.output_text_path)
        manifest_path = str(context.manifest_path)

    if rounds:
        latest_round = max(
            (
                item
                for item in rounds
                if isinstance(item, dict)
                and isinstance(item.get("round"), int)
                and _record_matches_prompt(item, normalized_prompt_profile, normalized_prompt_sequence)
                and 1 <= int(item.get("round")) <= max_rounds
            ),
            key=lambda item: item["round"],
            default=None,
        )
        if latest_round:
            latest_output_path = str(normalize_path(Path(str(latest_round.get("output_path", ""))))) if latest_round.get("output_path") else ""
    return {
        "docId": doc_id,
        "promptProfile": normalized_prompt_profile,
        "promptSequence": normalized_prompt_sequence,
        "sourcePath": str(normalized_source),
        "sourceKind": normalized_source.suffix.lower() or ".txt",
        "completedRounds": completed_rounds,
        "nextRound": round_state.next_round,
        "plannedRounds": len(normalized_prompt_sequence),
        "maxRounds": max_rounds,
        "hasNextRound": round_state.next_round is not None,
        "isComplete": round_state.is_complete,
        "currentInputPath": str(current_input_path),
        "currentOutputPath": current_output_path,
        "manifestPath": manifest_path,
        "latestOutputPath": latest_output_path,
        "extractedFromDocx": extracted_from_docx,
    }


def get_document_history(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    try:
        relative_doc_id = normalized_source.relative_to(ROOT_DIR)
        doc_id = normalize_doc_id(str(relative_doc_id).replace("\\", "/"))
    except ValueError:
        doc_id = normalize_doc_id(str(normalized_source))

    indexed_document = _get_indexed_history_document(doc_id)
    if indexed_document is not None:
        history = _record_entry_to_history(doc_id, _indexed_history_document_to_record_entry(indexed_document))
        return {
            "docId": doc_id,
            "sourcePath": str(normalized_source),
            "artifactStats": history.get("artifactStats", _empty_artifact_stats()),
            "rounds": history.get("rounds", []),
        }

    records = list_records()
    entry = records.get(doc_id, {}) if isinstance(records, dict) else {}
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []

    history_rounds = [_map_history_round(item) for item in rounds if isinstance(item, dict)]

    history_rounds.sort(key=lambda item: item["round"], reverse=True)

    return {
        "docId": doc_id,
        "sourcePath": str(normalized_source),
        "artifactStats": build_artifact_summary([item for item in rounds if isinstance(item, dict)]),
        "rounds": history_rounds,
    }


def get_document_protection_map(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    return build_docx_protection_map(normalized_source)


def get_document_scope_diagnostics(source_path: str) -> dict[str, Any]:
    normalized_source = normalize_path(Path(source_path))
    source_kind = normalized_source.suffix.lower() or ".txt"
    if source_kind != ".docx":
        return {
            "available": False,
            "ok": True,
            "sourcePath": str(normalized_source),
            "sourceKind": source_kind,
            "message": "当前文档不是 DOCX，无法生成正文边界诊断。",
            "path": "",
            "totalTextUnitCount": 0,
            "editableUnitCount": 0,
            "protectedUnitCount": 0,
            "scope": {},
            "reasonCounts": {},
            "issues": [],
            "units": [],
            "issueCount": 0,
            "errorCount": 0,
            "warningCount": 0,
        }

    _, snapshot_path, snapshot = ensure_docx_processing_assets(normalized_source)
    diagnostics_path = get_docx_scope_diagnostics_path(normalized_source)
    payload = _read_json_report(diagnostics_path)
    if payload is None:
        payload = build_docx_scope_diagnostics(snapshot, snapshot_path=snapshot_path)
        diagnostics_path.parent.mkdir(parents=True, exist_ok=True)
        diagnostics_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    payload["available"] = True
    payload["sourceKind"] = ".docx"
    payload["path"] = str(diagnostics_path)
    payload["message"] = "已生成 DOCX 正文边界诊断。"
    return payload


def list_document_histories() -> dict[str, Any]:
    indexed_documents = _list_indexed_history_documents()
    if indexed_documents is not None:
        items = [
            _record_entry_to_history(str(document.get("docId", "")), _indexed_history_document_to_record_entry(document))
            for document in indexed_documents
            if isinstance(document, dict) and str(document.get("docId", "")).strip()
        ]
        items.sort(key=lambda item: (item.get("lastTimestamp", ""), item.get("docId", "")), reverse=True)
        return {
            "items": items,
            "total": len(items),
        }

    records = list_records()
    items = [
        _record_entry_to_history(doc_id, entry)
        for doc_id, entry in records.items()
        if isinstance(entry, dict)
    ]
    items.sort(key=lambda item: (item.get("lastTimestamp", ""), item.get("docId", "")), reverse=True)
    return {
        "items": items,
        "total": len(items),
    }


def query_history_artifact_governance(filters: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized_filters = filters if isinstance(filters, dict) else {}
    try:
        from fyadr_history_db import query_history_artifacts_from_index

        result = query_history_artifacts_from_index(normalized_filters)
    except Exception as exc:
        return {
            "ok": False,
            "source": "sqlite",
            "error": str(exc),
            "filters": normalized_filters,
            "items": [],
            "total": 0,
            "limit": 0,
            "offset": 0,
            "hasMore": False,
            "stats": _empty_artifact_stats(),
        }
    if result is None:
        return {
            "ok": False,
            "source": "sqlite",
            "error": "SQLite history index is unavailable or stale.",
            "filters": normalized_filters,
            "items": [],
            "total": 0,
            "limit": 0,
            "offset": 0,
            "hasMore": False,
            "stats": _empty_artifact_stats(),
        }
    return result


def check_history_database_governance() -> dict[str, Any]:
    try:
        from fyadr_records import check_history_index

        return check_history_index(strict=False)
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "issueCount": 1,
            "errorCount": 1,
            "warningCount": 0,
            "repairableIssueCount": 1,
            "issues": [
                {
                    "code": "history_index_check_failed",
                    "severity": "error",
                    "message": str(exc),
                    "repairable": True,
                    "recommendedAction": "history-db-repair",
                }
            ],
        }


def repair_history_database_governance() -> dict[str, Any]:
    try:
        from fyadr_records import repair_history_index

        return repair_history_index(strict=True)
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "before": check_history_database_governance(),
            "after": {
                "ok": False,
                "issueCount": 1,
                "errorCount": 1,
                "warningCount": 0,
                "repairableIssueCount": 1,
                "issues": [
                    {
                        "code": "history_index_repair_failed",
                        "severity": "error",
                        "message": str(exc),
                        "repairable": True,
                        "recommendedAction": "history-db-repair",
                    }
                ],
            },
        }


def list_history_database_backups(validate: bool = False) -> dict[str, Any]:
    from fyadr_records import list_history_index_backups

    return list_history_index_backups(validate=validate)


def backup_history_database_governance(reason: str = "manual", keep: int = 12) -> dict[str, Any]:
    from fyadr_records import backup_history_index

    return backup_history_index(reason=reason, keep=keep)


def compact_history_database_governance(create_backup: bool = True, keep: int = 12) -> dict[str, Any]:
    from fyadr_records import compact_history_index

    return compact_history_index(create_backup=create_backup, keep=keep)


def recover_history_database_governance(backup_path: str | None = None, keep: int = 12) -> dict[str, Any]:
    from fyadr_records import recover_history_index

    return recover_history_index(backup_path=backup_path, keep=keep)


def get_history_database_maintenance_summary() -> dict[str, Any]:
    from fyadr_records import get_history_index_maintenance_summary

    return get_history_index_maintenance_summary()


def ensure_history_database_ready(reason: str = "app", max_age_seconds: float = 30, compact: bool = True) -> dict[str, Any]:
    from fyadr_records import ensure_history_governance_ready

    return ensure_history_governance_ready(reason=reason, max_age_seconds=max_age_seconds, compact=compact)


HISTORY_ORPHAN_SCAN_DIRS: dict[str, Path] = {
    "sources": ROOT_DIR / "origin",
    "intermediate": ROOT_DIR / "finish" / "intermediate",
    "exports": ROOT_DIR / "finish" / "web_exports",
    "reports": ROOT_DIR / "finish" / "detection_reports",
}
HISTORY_ORPHAN_EXCLUDED_FILENAMES = {
    "active_format_rules.json",
}
ROUND_ARTIFACT_PATTERN = re.compile(r"_round\d+(?:[_.]|$)")


def _empty_artifact_stats() -> dict[str, Any]:
    return {
        "total": 0,
        "existing": 0,
        "intermediate": 0,
        "exports": 0,
        "reports": 0,
        "sources": 0,
        "external": 0,
        "missing": 0,
        "bytes": 0,
    }


def _path_to_workspace_display(path: Path) -> str:
    normalized_path = normalize_path(path)
    try:
        return str(normalized_path.relative_to(ROOT_DIR)).replace("\\", "/")
    except ValueError:
        return str(normalized_path)


def _history_artifact_kind(path: Path) -> str:
    normalized_path = normalize_path(path)
    try:
        relative = normalized_path.relative_to(ROOT_DIR)
    except ValueError:
        return "external"
    parts = relative.parts
    if parts and parts[0] == "origin":
        return "sources"
    if len(parts) < 2 or parts[0] != "finish":
        return "external"
    if parts[1] == "web_exports":
        return "exports"
    if parts[1] == "detection_reports":
        return "reports"
    if normalized_path.name.endswith((".audit.json", ".ooxml_audit.json", ".text_integrity.json", ".guard.json", "_validation.json", "_format_preflight.json")):
        return "reports"
    return "intermediate"


def _is_path_under(path: Path, root: Path) -> bool:
    try:
        normalize_path(path).relative_to(normalize_path(root))
        return True
    except ValueError:
        return False


def _is_cleanable_history_artifact(path: Path) -> bool:
    normalized_path = normalize_path(path)
    if normalized_path.name in HISTORY_ORPHAN_EXCLUDED_FILENAMES:
        return False
    if not normalized_path.exists() or not normalized_path.is_file():
        return False
    if _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["sources"]):
        return True
    if _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["exports"]):
        return True
    if _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["reports"]):
        return normalized_path.suffix.lower() in {".pdf", ".json", ".txt"}
    if not _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["intermediate"]):
        return False

    name = normalized_path.name
    if ROUND_ARTIFACT_PATTERN.search(name):
        return True
    if name.endswith(("_format_preflight.json", "_review_decisions.json", ".ooxml_audit.json", ".text_integrity.json")):
        return True
    if ("_export" in name or "_reviewed_export" in name) and normalized_path.suffix.lower() in {".docx", ".txt", ".json"}:
        return True
    return False


def _normalize_protected_paths(protected_paths: object | None) -> set[Path]:
    raw_items: list[Any]
    if protected_paths is None:
        raw_items = []
    elif isinstance(protected_paths, list):
        raw_items = protected_paths
    else:
        raw_items = [protected_paths]

    normalized_paths: set[Path] = set()
    for item in raw_items:
        value = str(item or "").strip()
        if not value:
            continue
        try:
            normalized_paths.add(normalize_path(Path(value)))
        except Exception:
            continue
    return normalized_paths


def _collect_referenced_history_artifacts(protected_paths: object | None = None) -> set[Path]:
    referenced_paths = _normalize_protected_paths(protected_paths)
    indexed_paths = list_referenced_history_artifact_paths()
    if indexed_paths is not None:
        for raw_path in indexed_paths:
            try:
                referenced_paths.add(normalize_path(Path(raw_path)))
            except Exception:
                continue
        return referenced_paths

    records = list_records()
    for entry in records.values():
        if not isinstance(entry, dict):
            continue
        origin_path = entry.get("origin_path")
        if isinstance(origin_path, str) and origin_path.strip():
            try:
                referenced_paths.add(normalize_path(Path(origin_path)))
            except Exception:
                pass
        rounds = entry.get("rounds")
        if not isinstance(rounds, list):
            continue
        normalized_rounds = [item for item in rounds if isinstance(item, dict)]
        referenced_paths.update(_collect_round_file_paths(normalized_rounds))
        for round_item in normalized_rounds:
            compare_path = round_item.get("compare_path")
            if isinstance(compare_path, str) and compare_path.strip():
                try:
                    normalized_compare_path = normalize_path(Path(compare_path))
                    referenced_paths.add(normalized_compare_path.with_name(f"{normalized_compare_path.stem}_review_decisions.json"))
                except Exception:
                    continue
    return referenced_paths


def _iter_cleanable_history_artifacts() -> list[Path]:
    candidates: list[Path] = []
    for root_path in HISTORY_ORPHAN_SCAN_DIRS.values():
        if not root_path.exists():
            continue
        for path in root_path.rglob("*"):
            try:
                normalized_path = normalize_path(path)
                if _is_cleanable_history_artifact(normalized_path):
                    candidates.append(normalized_path)
            except OSError:
                continue
    return sorted(set(candidates), key=lambda item: str(item).lower())


def _artifact_file_entry(path: Path) -> dict[str, Any]:
    normalized_path = normalize_path(path)
    kind = _history_artifact_kind(normalized_path)
    size = 0
    modified_at = ""
    try:
        stat = normalized_path.stat()
        size = stat.st_size
        modified_at = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
    except OSError:
        pass
    return {
        "path": str(normalized_path),
        "relativePath": _path_to_workspace_display(normalized_path),
        "kind": kind,
        "bytes": size,
        "modifiedAt": modified_at,
    }


def _build_stats_from_file_entries(entries: list[dict[str, Any]]) -> dict[str, Any]:
    stats = _empty_artifact_stats()
    for entry in entries:
        kind = str(entry.get("kind", "external"))
        size = int(entry.get("bytes", 0) or 0)
        stats["total"] += 1
        stats["existing"] += 1
        stats["bytes"] += max(0, size)
        if kind in {"sources", "intermediate", "exports", "reports"}:
            stats[kind] += 1
        else:
            stats["external"] += 1
    return stats


def _build_kind_stats(entries: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    kind_stats = {
        "sources": {"files": 0, "bytes": 0},
        "intermediate": {"files": 0, "bytes": 0},
        "exports": {"files": 0, "bytes": 0},
        "reports": {"files": 0, "bytes": 0},
    }
    for entry in entries:
        kind = str(entry.get("kind", ""))
        if kind not in kind_stats:
            continue
        kind_stats[kind]["files"] += 1
        kind_stats[kind]["bytes"] += int(entry.get("bytes", 0) or 0)
    return kind_stats


def _scan_history_orphan_entries(protected_paths: object | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]], set[Path]]:
    referenced_paths = _collect_referenced_history_artifacts(protected_paths)
    candidates = _iter_cleanable_history_artifacts()
    referenced_files = [
        _artifact_file_entry(path)
        for path in candidates
        if path in referenced_paths
    ]
    orphan_files = [
        _artifact_file_entry(path)
        for path in candidates
        if path not in referenced_paths
    ]
    orphan_files.sort(key=lambda item: (str(item.get("kind", "")), str(item.get("relativePath", "")).lower()))
    return referenced_files, orphan_files, referenced_paths


def scan_history_orphan_artifacts(protected_paths: object | None = None) -> dict[str, Any]:
    referenced_files, orphan_files, referenced_paths = _scan_history_orphan_entries(protected_paths)
    protected = sorted(
        _path_to_workspace_display(path)
        for path in referenced_paths
        if any(_is_path_under(path, root_path) for root_path in HISTORY_ORPHAN_SCAN_DIRS.values())
    )
    return {
        "scannedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "rootDir": str(ROOT_DIR),
        "scanDirs": {
            kind: _path_to_workspace_display(path)
            for kind, path in HISTORY_ORPHAN_SCAN_DIRS.items()
        },
        "protectedPaths": protected,
        "referencedStats": _build_stats_from_file_entries(referenced_files),
        "orphanStats": _build_stats_from_file_entries(orphan_files),
        "orphanKindStats": _build_kind_stats(orphan_files),
        "orphanFiles": orphan_files[:200],
        "hasMore": len(orphan_files) > 200,
        "totalOrphanFiles": len(orphan_files),
    }


def delete_history_orphan_artifacts(protected_paths: object | None = None) -> dict[str, Any]:
    before_scan = scan_history_orphan_artifacts(protected_paths)
    _, orphan_files, _ = _scan_history_orphan_entries(protected_paths)
    deleted_entries: list[dict[str, Any]] = []
    failed_files: list[dict[str, str]] = []

    for item in orphan_files:
        if not isinstance(item, dict):
            continue
        raw_path = str(item.get("path", "")).strip()
        if not raw_path:
            continue
        path = normalize_path(Path(raw_path))
        if not _is_cleanable_history_artifact(path):
            continue
        entry = _artifact_file_entry(path)
        try:
            path.unlink()
            deleted_entries.append(entry)
        except OSError as exc:
            failed_files.append({
                "path": entry["relativePath"],
                "message": str(exc),
            })

    after_scan = scan_history_orphan_artifacts(protected_paths)
    return {
        "deletedFiles": [str(item["relativePath"]) for item in deleted_entries],
        "deletedFileStats": _build_stats_from_file_entries(deleted_entries),
        "failedFiles": failed_files,
        "before": before_scan,
        "after": after_scan,
    }


def reset_round_progress(
    source_path: str,
    prompt_profile: str,
    round_number: int,
    prompt_sequence: object | None = None,
) -> dict[str, Any]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    normalized_source = normalize_path(Path(source_path))
    try:
        relative_doc_id = normalized_source.relative_to(ROOT_DIR)
        doc_id = normalize_doc_id(str(relative_doc_id).replace("\\", "/"))
    except ValueError:
        doc_id = normalize_doc_id(str(normalized_source))
    target_round = int(round_number)
    if normalized_profile == LEGACY_PROMPT_PROFILE:
        artifact_stem = Path(doc_id).stem
    elif is_prompt_sequence_customizable(normalized_profile):
        artifact_stem = f"{Path(doc_id).stem}_custom_{'_'.join(normalized_prompt_sequence)}"
    else:
        artifact_stem = f"{Path(doc_id).stem}_{normalized_profile}"
    intermediate_dir = ROOT_DIR / "finish" / "intermediate"
    output_path = intermediate_dir / f"{artifact_stem}_round{target_round}.txt"
    manifest_path = intermediate_dir / f"{artifact_stem}_round{target_round}_manifest.json"
    deleted_files: list[str] = []

    try:
        records_payload = delete_rounds(
            doc_id,
            target_round,
            prompt_profile=normalized_profile,
            prompt_sequence=normalized_prompt_sequence if is_prompt_sequence_customizable(normalized_profile) else None,
        )
    except ValueError as exc:
        message = str(exc)
        if "Document record not found" not in message and "No rounds found" not in message:
            raise
        records_payload = {
            "docId": doc_id,
            "deletedRounds": [],
            "deletedFiles": [],
            "remainingRounds": [],
        }

    candidate_paths = {
        output_path,
        intermediate_dir / f"{artifact_stem}_round{target_round}_input.txt",
        output_path.with_name(f"{output_path.stem}_checkpoint.json"),
        output_path.with_name(f"{output_path.stem}_compare.json"),
        output_path.with_name(f"{output_path.stem}_quality.json"),
        output_path.with_name(f"{output_path.stem}_bodymap.json"),
        intermediate_dir / f"{artifact_stem}_round{target_round}_body_map.json",
        intermediate_dir / f"{artifact_stem}_round{target_round}_validation.json",
        manifest_path,
    }

    for candidate_path in candidate_paths:
        try:
            normalized_path = normalize_path(candidate_path)
            if normalized_path.exists():
                normalized_path.unlink()
                deleted_files.append(str(normalized_path))
        except Exception:
            continue

    return {
        "docId": doc_id,
        "round": target_round,
        "promptProfile": normalized_profile,
        "promptSequence": normalized_prompt_sequence,
        "deletedRounds": records_payload.get("deletedRounds", []),
        "deletedFiles": [*records_payload.get("deletedFiles", []), *deleted_files],
    }


def _build_checkpoint_resume_details(
    *,
    effective_round: int,
    chunk_ids: Any,
    chunk_outputs: Any,
    completed_chunks: int,
    total_chunks: int,
    last_error: str,
) -> dict[str, Any]:
    ordered_chunk_ids = [str(item) for item in chunk_ids if isinstance(item, str)] if isinstance(chunk_ids, list) else []
    completed_chunk_ids = set(chunk_outputs) if isinstance(chunk_outputs, dict) else set()
    pending_chunk_ids = [chunk_id for chunk_id in ordered_chunk_ids if chunk_id not in completed_chunk_ids]
    next_chunk_id = pending_chunk_ids[0] if pending_chunk_ids else ""
    next_chunk_index = (ordered_chunk_ids.index(next_chunk_id) + 1) if next_chunk_id in ordered_chunk_ids else 0
    failed_chunk_id = ""
    failed_match = re.search(r"Chunk\s+([A-Za-z0-9_.:-]+)\s+failed", last_error)
    if failed_match:
        failed_chunk_id = failed_match.group(1)

    if total_chunks and completed_chunks >= total_chunks:
        resume_stage = "finalize_output"
        resume_action_label = "继续收尾"
        resume_explanation = f"第 {effective_round} 轮所有分块都已落盘，继续时会直接进入合并、Diff 和记录写入阶段，不会重跑 100% 已完成的分块。"
    elif next_chunk_id:
        resume_stage = "continue_chunks"
        resume_action_label = f"从第 {next_chunk_index}/{total_chunks or '?'} 块继续"
        resume_explanation = f"继续时会复用已完成分块，并从 {next_chunk_id} 开始处理；不会从第一块重跑。"
    else:
        resume_stage = "inspect_checkpoint"
        resume_action_label = "检查断点"
        resume_explanation = "断点存在，但无法可靠判断下一块；建议先刷新状态，仍异常再放弃本轮进度。"

    return {
        "remainingChunks": max(0, total_chunks - completed_chunks) if total_chunks else 0,
        "nextChunkId": next_chunk_id,
        "nextChunkIndex": next_chunk_index,
        "failedChunkId": failed_chunk_id,
        "resumeStage": resume_stage,
        "resumeActionLabel": resume_action_label,
        "resumeExplanation": resume_explanation,
    }


def get_round_progress_status(
    source_path: str,
    prompt_profile: str,
    round_number: int | None = None,
    prompt_sequence: object | None = None,
) -> dict[str, Any]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    normalized_source = normalize_path(Path(source_path))
    effective_round = int(round_number or 0)
    if effective_round <= 0:
        status = get_document_status(
            str(normalized_source),
            prompt_profile=normalized_profile,
            prompt_sequence=normalized_prompt_sequence,
        )
        effective_round = int(status.get("nextRound", 0) or 0)
    if effective_round <= 0:
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": None,
            "checkpointExists": False,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": "",
            "lastError": "",
            "updatedAt": "",
            "validationEventCount": 0,
            "message": "当前没有待执行轮次。",
        }

    context = build_round_context(
        normalized_source,
        round_number=effective_round,
        prompt_profile=normalized_profile,
        prompt_sequence=normalized_prompt_sequence,
    )
    checkpoint_path = get_round_checkpoint_path(context.output_text_path)
    if not checkpoint_path.exists():
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": False,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": "",
            "updatedAt": "",
            "validationEventCount": 0,
            "message": "当前轮次暂无断点。",
        }

    try:
        payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": True,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": f"Checkpoint file is unreadable: {exc}",
            "updatedAt": "",
            "validationEventCount": 0,
            "message": "断点文件无法读取，可放弃本轮进度后重新开始。",
        }
    if not isinstance(payload, dict):
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": True,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": "Checkpoint payload is not an object.",
            "updatedAt": "",
            "validationEventCount": 0,
            "message": "断点文件格式异常，可放弃本轮进度后重新开始。",
        }
    if payload.get("completed") is True:
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": False,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": "",
            "updatedAt": str(payload.get("updated_at", "") or ""),
            "validationEventCount": 0,
            "message": "当前轮次已完成；残留断点标记无需处理。",
        }
    try:
        input_text = context.input_text_path.read_text(encoding="utf-8")
        chunk_metric = get_chunk_metric(normalized_profile, normalized_prompt_sequence)
        manifest = build_manifest(input_text, chunk_limit=DEFAULT_CHUNK_LIMIT, chunk_metric=chunk_metric)
        prompt_text = load_prompt(normalized_profile, effective_round, normalized_prompt_sequence)
        checkpoint_signature = _build_checkpoint_signature(
            doc_id=context.doc_id,
            round_number=effective_round,
            prompt_profile=normalized_profile,
            prompt_sequence=normalized_prompt_sequence,
            input_path=context.input_text_path,
            output_path=context.output_text_path,
            manifest_path=context.manifest_path,
            manifest_chunk_ids=[chunk.chunk_id for chunk in manifest.chunks],
            input_sha256=_sha256_text(input_text),
            prompt_sha256=_sha256_text(prompt_text),
            chunk_limit=DEFAULT_CHUNK_LIMIT,
            chunk_metric=chunk_metric,
            checkpoint_metadata=None,
        )
    except Exception as exc:
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": True,
            "canResume": False,
            "completedChunks": 0,
            "totalChunks": 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": f"Checkpoint compatibility check failed: {exc}",
            "updatedAt": str(payload.get("updated_at", "") or ""),
            "validationEventCount": 0,
            "resumeStage": "inspect_checkpoint",
            "resumeActionLabel": "检查断点",
            "resumeExplanation": "断点存在，但当前正文状态无法校验；为避免误续跑，请刷新历史文档后再继续。",
            "message": "断点存在，但无法确认是否属于当前正文。",
        }
    if not _is_checkpoint_compatible(payload, checkpoint_signature):
        return {
            "sourcePath": str(normalized_source),
            "promptProfile": normalized_profile,
            "promptSequence": normalized_prompt_sequence,
            "round": effective_round,
            "checkpointExists": True,
            "canResume": False,
            "completedChunks": int(payload.get("completed_chunk_count", 0) or 0),
            "totalChunks": len(payload.get("chunk_ids", [])) if isinstance(payload.get("chunk_ids"), list) else 0,
            "progressPercent": 0,
            "checkpointPath": str(checkpoint_path),
            "lastError": str(payload.get("last_error", "") or "").strip(),
            "updatedAt": str(payload.get("updated_at", "") or ""),
            "validationEventCount": 0,
            "resumeStage": "inspect_checkpoint",
            "resumeActionLabel": "断点不匹配",
            "resumeExplanation": "该断点与当前正文、Prompt 或分块清单不一致，继续会重新生成；请确认历史文档和自定义流程一致。",
            "message": "断点与当前正文不匹配，已阻止假续跑提示。",
        }
    chunk_outputs = payload.get("chunk_outputs")
    chunk_ids = payload.get("chunk_ids")
    validation_events = payload.get("validation_events")
    completed_chunks = int(payload.get("completed_chunk_count", 0) or 0)
    if isinstance(chunk_outputs, dict):
        completed_chunks = max(completed_chunks, len(chunk_outputs))
    total_chunks = len(chunk_ids) if isinstance(chunk_ids, list) else 0
    progress_percent = round((completed_chunks / total_chunks) * 100) if total_chunks else 0
    last_error = str(payload.get("last_error", "") or "").strip()
    last_error_details = payload.get("last_error_details") if isinstance(payload.get("last_error_details"), dict) else {}
    updated_at = str(payload.get("updated_at", "") or "").strip()
    validation_event_count = len(validation_events) if isinstance(validation_events, list) else 0
    resume_details = _build_checkpoint_resume_details(
        effective_round=effective_round,
        chunk_ids=chunk_ids,
        chunk_outputs=chunk_outputs,
        completed_chunks=completed_chunks,
        total_chunks=total_chunks,
        last_error=last_error,
    )
    return {
        "sourcePath": str(normalized_source),
        "promptProfile": normalized_profile,
        "promptSequence": normalized_prompt_sequence,
        "round": effective_round,
        "checkpointExists": True,
        "canResume": True,
        "completedChunks": completed_chunks,
        "totalChunks": total_chunks,
        "progressPercent": progress_percent,
        "checkpointPath": str(checkpoint_path),
        "lastError": last_error,
        "lastErrorDetails": last_error_details,
        "updatedAt": updated_at,
        "validationEventCount": validation_event_count,
        **resume_details,
        "message": (
            f"发现第 {effective_round} 轮断点：已完成 {completed_chunks}/{total_chunks} 块，{resume_details['resumeActionLabel']}。"
            if total_chunks
            else f"发现第 {effective_round} 轮断点。"
        ),
    }


def delete_document_history(
    doc_id: str,
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: object | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    normalized_doc_id = normalize_doc_id(doc_id)
    if from_round is None:
        return delete_document(normalized_doc_id, mode=mode)
    normalized_profile = normalize_prompt_profile(prompt_profile) if prompt_profile is not None else None
    return delete_rounds(
        normalized_doc_id,
        from_round,
        prompt_profile=normalized_profile,
        prompt_sequence=normalize_prompt_sequence(normalized_profile, prompt_sequence) if normalized_profile and is_prompt_sequence_customizable(normalized_profile) else None,
        mode=mode,
    )


def preview_document_history_delete(
    doc_id: str,
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: object | None = None,
    mode: str | None = None,
) -> dict[str, Any]:
    normalized_doc_id = normalize_doc_id(doc_id)
    normalized_profile = normalize_prompt_profile(prompt_profile) if prompt_profile is not None else None
    return preview_delete_document(
        normalized_doc_id,
        from_round,
        prompt_profile=normalized_profile,
        prompt_sequence=normalize_prompt_sequence(normalized_profile, prompt_sequence) if normalized_profile and is_prompt_sequence_customizable(normalized_profile) else None,
        mode=mode,
    )


def run_round_for_app(
    source_path: str,
    model_config: dict[str, Any],
    round_number: int | None = None,
    progress_callback: Callable[[dict[str, Any]], None] | None = None,
    cancel_check: Callable[[], bool] | None = None,
) -> dict[str, Any]:
    from round_helper import run_document_round

    prompt_profile = normalize_prompt_profile(model_config.get("promptProfile", DEFAULT_PROMPT_PROFILE))
    prompt_sequence = normalize_prompt_sequence(prompt_profile, model_config.get("promptSequence"))
    status = get_document_status(source_path, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    max_rounds = get_max_rounds(prompt_profile, prompt_sequence)
    if bool(status.get("isComplete")):
        raise ValueError(f"Document already completed all {max_rounds} rounds.")
    effective_round = int(round_number or status.get("nextRound") or 1)
    if effective_round < 1 or effective_round > max_rounds:
        raise ValueError(f"Round {effective_round} is outside the selected {max_rounds} round prompt workflow.")
    effective_model_config = _resolve_round_model_config(model_config, prompt_profile, effective_round)

    base_url = str(effective_model_config.get("baseUrl", "")).strip()
    api_key = str(effective_model_config.get("apiKey", "")).strip()
    model = str(effective_model_config.get("model", "")).strip()
    api_type = str(effective_model_config.get("apiType", "chat_completions")).strip()
    temperature = float(effective_model_config.get("temperature", model_config.get("temperature", 0.7)) or 0.7)
    configured_timeout_seconds = _coerce_int_config(
        effective_model_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=30,
        maximum=3600,
    )
    request_timeout_seconds = _coerce_rewrite_timeout_seconds(configured_timeout_seconds)
    configured_max_retries = _coerce_int_config(
        effective_model_config.get("maxRetries", DEFAULT_MAX_RETRIES),
        default=DEFAULT_MAX_RETRIES,
        minimum=0,
        maximum=10,
    )
    max_retries = max(configured_max_retries, MIN_REWRITE_TRANSIENT_RETRIES)
    rewrite_concurrency = _coerce_int_config(
        model_config.get("rewriteConcurrency", DEFAULT_REWRITE_CONCURRENCY),
        default=DEFAULT_REWRITE_CONCURRENCY,
        minimum=1,
        maximum=MAX_REWRITE_CONCURRENCY,
    )

    if not base_url or not api_key or not model:
        raise ValueError("Model configuration is incomplete.")

    if progress_callback is not None:
        progress_callback({
            "phase": "model-selected",
            "round": effective_round,
            "roundModel": {
                "providerId": str(effective_model_config.get("providerId", "")),
                "providerName": str(effective_model_config.get("providerName", "")),
                "baseUrl": base_url,
                "model": model,
                "apiType": api_type,
                "temperature": temperature,
                "rateLimitWindowMinutes": _coerce_rate_window_minutes(effective_model_config),
                "rateLimitMaxRequests": _coerce_rate_max_requests(effective_model_config),
                "routeSource": str(effective_model_config.get("routeSource", "default")),
            },
            "concurrency": rewrite_concurrency,
            "configuredConcurrency": rewrite_concurrency,
            "requestTimeoutSeconds": request_timeout_seconds,
            "configuredRequestTimeoutSeconds": configured_timeout_seconds,
            "maxRetries": max_retries,
            "configuredMaxRetries": configured_max_retries,
        })

    def ensure_not_cancelled() -> None:
        if cancel_check is not None and cancel_check():
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")

    rate_limiter = _build_provider_rate_limiter(effective_model_config)

    def transform(_: str, prompt_input: str, __: int, chunk_id: str) -> str:
        ensure_not_cancelled()
        _wait_for_provider_cooldown(effective_model_config, cancel_check=cancel_check)
        ensure_not_cancelled()
        rate_limiter()
        ensure_not_cancelled()

        def emit_retry_wait(event: dict[str, object]) -> None:
            if progress_callback is None:
                return
            progress_callback(
                {
                    "phase": "provider-retry-wait",
                    "round": effective_round,
                    "chunkId": chunk_id,
                    "error": str(event.get("message", "") or ""),
                    "errorCategory": str(event.get("category", "") or ""),
                    "statusCode": event.get("statusCode"),
                    "retryable": event.get("retryable"),
                    "attempts": event.get("attempt"),
                    "maxAttempts": event.get("maxAttempts"),
                    "nextAttempt": event.get("nextAttempt"),
                    "retryDelaySeconds": event.get("retryDelaySeconds"),
                    "retryAfterSeconds": event.get("retryAfterSeconds"),
                    "cooldownSeconds": event.get("cooldownSeconds"),
                    "providerMessage": str(event.get("providerMessage", "") or ""),
                    "concurrency": rewrite_concurrency,
                    "configuredConcurrency": rewrite_concurrency,
                }
            )

        try:
            output = llm_completion(
                prompt_input,
                model=model,
                api_key=api_key,
                base_url=base_url,
                api_type=api_type,
                temperature=temperature,
                timeout=request_timeout_seconds,
                max_retries=max_retries,
                retry_backoff_seconds=REWRITE_RETRY_BACKOFF_SECONDS,
                retry_callback=emit_retry_wait,
            )
        except LLMRequestError as exc:
            _register_provider_failure(effective_model_config, exc)
            raise
        _register_provider_success(effective_model_config)
        return output

    checkpoint_metadata = {
        "base_url": base_url,
        "model": model,
        "api_type": api_type,
        "temperature": temperature,
        "prompt_profile": prompt_profile,
        "prompt_sequence": prompt_sequence,
        "round_model_key": _round_model_key(prompt_profile, effective_round),
        "round_model_provider_id": str(effective_model_config.get("providerId", "")),
        "round_model_provider": str(effective_model_config.get("providerName", "")),
        "round_model_route_source": str(effective_model_config.get("routeSource", "default")),
        "request_timeout_seconds": request_timeout_seconds,
        "configured_request_timeout_seconds": configured_timeout_seconds,
        "max_retries": max_retries,
        "configured_max_retries": configured_max_retries,
        "retry_backoff_seconds": REWRITE_RETRY_BACKOFF_SECONDS,
        "rewrite_concurrency": rewrite_concurrency,
        "rate_limit_window_minutes": _coerce_rate_window_minutes(effective_model_config),
        "rate_limit_max_requests": _coerce_rate_max_requests(effective_model_config),
    }

    result = run_document_round(
        source_path,
        transform=transform,
        round_number=round_number,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
        progress_callback=progress_callback or emit_progress_event,
        checkpoint_metadata=checkpoint_metadata,
        cancel_check=cancel_check,
        max_concurrency=rewrite_concurrency,
    )
    return {
        "round": int(result["round"]),
        "outputPath": str(result["output_path"]),
        "manifestPath": str(result["manifest_path"]),
        "comparePath": str(result["compare_path"]),
        "qualityPath": str(result.get("quality_path", "")),
        "bodyMapPath": str(result.get("body_map_path", "")),
        "validationPath": str(result.get("validation_path", "")),
        "chunkLimit": int(result["chunk_limit"]),
        "inputSegmentCount": int(result["input_segment_count"]),
        "outputSegmentCount": int(result["output_segment_count"]),
        "paragraphCount": int(result["paragraph_count"]),
        "roundModel": {
            "round": effective_round,
            "providerId": str(effective_model_config.get("providerId", "")),
            "providerName": str(effective_model_config.get("providerName", "")),
            "baseUrl": base_url,
            "model": model,
            "apiType": api_type,
            "temperature": temperature,
            "rateLimitWindowMinutes": _coerce_rate_window_minutes(effective_model_config),
            "rateLimitMaxRequests": _coerce_rate_max_requests(effective_model_config),
            "routeSource": str(effective_model_config.get("routeSource", "default")),
        },
        "promptSequence": prompt_sequence,
        "docEntry": result["doc_entry"],
        "roundContext": result["round_context"],
        "qualitySummary": result.get("quality_summary", {}),
        "runAudit": result.get("run_audit", {}),
    }


def test_model_connection(model_config: dict[str, Any]) -> dict[str, Any]:
    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    model = str(model_config.get("model", "")).strip()
    api_type = str(model_config.get("apiType", "chat_completions")).strip()
    request_timeout_seconds = _coerce_int_config(
        model_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=30,
        maximum=3600,
    )
    max_retries = _coerce_int_config(
        model_config.get("maxRetries", DEFAULT_MAX_RETRIES),
        default=DEFAULT_MAX_RETRIES,
        minimum=0,
        maximum=10,
    )

    if not base_url or not api_key or not model:
        raise ValueError("Model configuration is incomplete.")

    result = test_llm_connection(
        model=model,
        api_key=api_key,
        base_url=base_url,
        api_type=api_type,
        timeout=request_timeout_seconds,
        max_retries=max_retries,
    )
    return {
        "ok": True,
        "message": "接口连通性测试成功。",
        **result,
    }


def list_available_models(model_config: dict[str, Any]) -> dict[str, Any]:
    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    request_timeout_seconds = _coerce_int_config(
        model_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=30,
        maximum=3600,
    )
    max_retries = _coerce_int_config(
        model_config.get("maxRetries", DEFAULT_MAX_RETRIES),
        default=DEFAULT_MAX_RETRIES,
        minimum=0,
        maximum=10,
    )

    if not base_url:
        raise ValueError("baseUrl is required before loading models.")
    if not api_key:
        raise ValueError("apiKey is required before loading models.")

    result = list_llm_models(
        api_key=api_key,
        base_url=base_url,
        timeout=request_timeout_seconds,
        max_retries=max_retries,
    )
    return {
        "ok": True,
        "message": "Model catalog loaded successfully.",
        **result,
    }


def export_round_output(output_path: str, export_path: str, target_format: str) -> dict[str, Any]:
    normalized_target_format = str(target_format or "").strip().lower()
    if normalized_target_format not in {"txt", "docx"}:
        raise ValueError(f"Unsupported export format: {target_format}")
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_OUTPUT_ALLOWED_ROOTS, label="Output path")
    if not normalized_output_path.exists():
        raise ValueError(f"Output file does not exist: {normalized_output_path}")
    if not normalized_output_path.is_file():
        raise ValueError(f"Output path is not a file: {normalized_output_path}")
    normalized_export_path = _resolve_api_path(export_path, allowed_roots=API_EXPORT_ALLOWED_ROOTS, label="Export path")
    normalized_export_path.parent.mkdir(parents=True, exist_ok=True)
    review_decisions = load_review_decisions(str(normalized_output_path)).get("decisions", {})
    if not isinstance(review_decisions, dict):
        review_decisions = {}
    if normalized_target_format == "txt":
        if review_decisions:
            blocks = _build_reviewed_paragraphs_from_compare(normalized_output_path, review_decisions)
            normalized_export_path.write_text("\n\n".join(blocks), encoding="utf-8")
        else:
            compare_payload = _load_compare_payload_for_output(normalized_output_path)
            if compare_payload is not None:
                blocks, _paragraph_source = _read_output_paragraphs_for_export(normalized_output_path)
                normalized_export_path.write_text("\n\n".join(blocks), encoding="utf-8")
            else:
                shutil.copyfile(normalized_output_path, normalized_export_path)
        return {
            "format": "txt",
            "path": str(normalized_export_path),
        }

    if normalized_target_format == "docx":
        origin_docx_bundle = _find_origin_docx_for_output(normalized_output_path)
        layout_mode = "plain_text_docx"
        paragraph_source = "text"
        validation_path = _find_validation_path_for_output(normalized_output_path)
        body_map = _load_body_map_for_output(normalized_output_path)
        compare_payload = _load_compare_payload_for_output(normalized_output_path)
        guard_report: dict[str, Any] | None = None
        expected_text_targets: list[tuple[dict[str, Any], str]] = []
        if origin_docx_bundle is not None:
            source_docx_path, snapshot_path = origin_docx_bundle
            ensure_docx_processing_assets(
                source_docx_path,
                snapshot_path=snapshot_path,
            )
            if body_map is not None:
                if review_decisions:
                    reviewed_paragraphs = _build_reviewed_paragraphs_from_compare(normalized_output_path, review_decisions)
                    reviewed_paragraphs = _ensure_reviewed_paragraph_count_for_body_map(
                        normalized_output_path,
                        compare_payload or {},
                        reviewed_paragraphs,
                        len(body_map.units),
                        review_decisions,
                    )
                    body_map = update_docx_body_map_texts(body_map, reviewed_paragraphs, round_number=body_map.round_number)
                    paragraph_source = "body_map_review_decisions"
                elif compare_payload is not None:
                    compare_paragraphs = _build_paragraphs_from_compare_payload(normalized_output_path, compare_payload)
                    if compare_paragraphs is not None:
                        compare_paragraphs = _ensure_reviewed_paragraph_count_for_body_map(
                            normalized_output_path,
                            compare_payload,
                            compare_paragraphs,
                            len(body_map.units),
                            {},
                        )
                        body_map = update_docx_body_map_texts(body_map, compare_paragraphs, round_number=body_map.round_number)
                        paragraph_source = "body_map_compare"
                guard_report = run_docx_pre_export_guard(
                    body_map.current_texts(),
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                    export_path=normalized_export_path,
                    output_path=normalized_output_path,
                    body_map=body_map,
                    compare_payload=compare_payload,
                    mode="docx-export",
                    paragraph_source=paragraph_source,
                )
                if not bool(guard_report.get("ok")):
                    message = summarize_docx_export_guard_failure(guard_report, label="导出")
                    raise ExportRoundError(
                        message,
                        _build_export_failure(
                            stage="guard",
                            label="导出前保护",
                            message=message,
                            report=guard_report,
                            issue_count=int(guard_report.get("blockingIssueCount", 0) or 0),
                            warning_count=int(guard_report.get("warningCount", 0) or 0),
                            sample_keys=("blockingIssues", "warnings"),
                        ),
                    )
                expected_text_targets = _build_docx_text_targets_from_body_map(body_map)
                try:
                    rebuild_docx_from_body_map_units(
                        body_map.units,
                        source_path=source_docx_path,
                        export_path=normalized_export_path,
                    )
                except ValueError as exc:
                    raise _export_text_integrity_error(str(exc)) from exc
                layout_mode = "body-map-roundtrip"
                if not review_decisions:
                    paragraph_source = "body_map"
            else:
                if review_decisions:
                    blocks = _build_reviewed_paragraphs_from_compare(normalized_output_path, review_decisions)
                    paragraph_source = "compare_review_decisions"
                else:
                    blocks, paragraph_source = _read_output_paragraphs_for_export(normalized_output_path)
                snapshot = _load_docx_snapshot(snapshot_path)
                expected_paragraph_count = (
                    snapshot.editable_unit_count
                    if snapshot is not None
                    else None
                )
                if expected_paragraph_count is not None and len(blocks) != expected_paragraph_count:
                    message = (
                        "DOCX 导出已拦截：当前轮次正文段落数与原始 Word 快照不一致。"
                        f" 预期 {expected_paragraph_count} 段，实际 {len(blocks)} 段。"
                        " 请重新执行当前轮次，或回滚后重跑，避免导出成错位排版。"
                    )
                    raise ExportRoundError(
                        message,
                        _build_export_failure(
                            stage="paragraph-count",
                            label="正文段落",
                            message=message,
                            issue_count=1,
                            samples=[
                                {
                                    "code": "paragraph_count_mismatch",
                                    "message": "正文段落数与原始 Word 快照不一致",
                                    "sample": f"expected={expected_paragraph_count}; actual={len(blocks)}",
                                }
                            ],
                        ),
                    )
                guard_report = run_docx_pre_export_guard(
                    blocks,
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                    export_path=normalized_export_path,
                    output_path=normalized_output_path,
                    compare_payload=compare_payload,
                    mode="docx-export",
                    paragraph_source=paragraph_source,
                )
                if not bool(guard_report.get("ok")):
                    message = summarize_docx_export_guard_failure(guard_report, label="导出")
                    raise ExportRoundError(
                        message,
                        _build_export_failure(
                            stage="guard",
                            label="导出前保护",
                            message=message,
                            report=guard_report,
                            issue_count=int(guard_report.get("blockingIssueCount", 0) or 0),
                            warning_count=int(guard_report.get("warningCount", 0) or 0),
                            sample_keys=("blockingIssues", "warnings"),
                        ),
                    )
                expected_text_targets = _build_docx_text_targets_from_snapshot(snapshot_path, blocks)
                try:
                    rebuild_docx_from_snapshot(
                        blocks,
                        source_path=source_docx_path,
                        snapshot_path=snapshot_path,
                        export_path=normalized_export_path,
                    )
                except ValueError as exc:
                    raise _export_text_integrity_error(str(exc)) from exc
                layout_mode = "snapshot-compare-reflow" if paragraph_source.startswith("compare") else "snapshot-roundtrip"
        else:
            if review_decisions:
                blocks = _build_reviewed_paragraphs_from_compare(normalized_output_path, review_decisions)
                paragraph_source = "compare_review_decisions"
            else:
                blocks, paragraph_source = _read_output_paragraphs_for_export(normalized_output_path)
            write_docx_text(blocks, normalized_export_path)
        text_fingerprint_before_format = _collect_docx_text_fingerprint(normalized_export_path)
        try:
            format_result = apply_school_format_rules(
                normalized_export_path,
                snapshot_path=origin_docx_bundle[1] if origin_docx_bundle is not None else None,
            )
        except DocxFormatPreflightError as exc:
            message = str(exc)
            raise ExportRoundError(
                message,
                _build_export_failure(
                    stage="preflight",
                    label="格式预检",
                    message=message,
                    report=exc.report,
                    sample_keys=("blockingIssues", "issues"),
                ),
            ) from exc
        text_fingerprint_after_format = _collect_docx_text_fingerprint(normalized_export_path)
        if text_fingerprint_after_format != text_fingerprint_before_format:
            message = "DOCX 导出已拦截：排版规则意外改变了文档文本内容。"
            raise ExportRoundError(
                message,
                _build_export_failure(
                    stage="format-text",
                    label="排版文本",
                    message=message,
                    issue_count=1,
                    samples=[
                        {
                            "code": "format_changed_text",
                            "message": "排版规则改变了文档文本内容",
                        }
                    ],
                ),
            )
        if expected_text_targets:
            text_integrity_report = _audit_exported_docx_text_targets(normalized_export_path, expected_text_targets)
            if not bool(text_integrity_report.get("ok")):
                text_integrity_report_path = normalized_export_path.with_suffix(".text_integrity.json")
                text_integrity_report["reportPath"] = str(text_integrity_report_path)
                text_integrity_report_path.parent.mkdir(parents=True, exist_ok=True)
                text_integrity_report_path.write_text(
                    json.dumps(text_integrity_report, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                issue_count = int(text_integrity_report.get("issueCount", 0) or 0)
                message = (
                    "DOCX 导出已拦截：导出后的正文文本与本轮结果不一致。"
                    f" 共 {issue_count} 个问题，报告：{text_integrity_report_path}"
                )
                raise ExportRoundError(
                    message,
                    _build_export_failure(
                        stage="text-integrity",
                        label="正文文本",
                        message=message,
                        report=text_integrity_report,
                        report_path=text_integrity_report_path,
                        issue_count=issue_count,
                        sample_keys=("issues",),
                    ),
                )
        audit_report_path = get_docx_audit_report_path(normalized_export_path)
        audit_report: dict[str, Any] | None = None
        ooxml_audit_report_path = get_docx_ooxml_audit_report_path(normalized_export_path)
        ooxml_audit_report: dict[str, Any] | None = None
        if origin_docx_bundle is not None:
            audit_report = audit_docx_export(
                normalized_export_path,
                source_path=origin_docx_bundle[0],
                snapshot_path=origin_docx_bundle[1],
                report_path=audit_report_path,
            )
            if not bool(audit_report.get("ok")):
                issue_count = int(audit_report.get("issueCount", 0) or 0)
                message = (
                    "DOCX 导出已拦截：审计发现保护区内容发生变化。"
                    f" 共 {issue_count} 个问题，报告：{audit_report_path}"
                )
                raise ExportRoundError(
                    message,
                    _build_export_failure(
                        stage="audit",
                        label="保护区审计",
                        message=message,
                        report=audit_report,
                        report_path=audit_report_path,
                        issue_count=issue_count,
                        sample_keys=("issues",),
                    ),
                )
        if origin_docx_bundle is not None:
            ooxml_audit_report = audit_docx_ooxml_integrity(
                normalized_export_path,
                source_path=origin_docx_bundle[0],
                snapshot_path=origin_docx_bundle[1],
                report_path=ooxml_audit_report_path,
            )
            if not bool(ooxml_audit_report.get("ok")):
                issue_count = int(ooxml_audit_report.get("issueCount", 0) or 0)
                message = (
                    "DOCX export blocked: OOXML integrity audit found protected structure changes. "
                    f"Issues: {issue_count}; report: {ooxml_audit_report_path}"
                )
                raise ExportRoundError(
                    message,
                    _build_export_failure(
                        stage="ooxml",
                        label="Word 结构",
                        message=message,
                        report=ooxml_audit_report,
                        report_path=ooxml_audit_report_path,
                        issue_count=issue_count,
                        sample_keys=("issues",),
                    ),
                )
        preflight_report = _read_json_report(format_result.get("preflightPath", ""))
        return {
            "format": "docx",
            "path": str(normalized_export_path),
            "layoutMode": layout_mode,
            "paragraphSource": paragraph_source,
            "formatMode": str(format_result.get("mode", "school_rules")),
            "formatScope": str(format_result.get("formatScope", "")),
            "contentLockedStyleCount": int(format_result.get("contentLockedStyleCount", 0) or 0),
            "tableStyleCount": int(format_result.get("tableStyleCount", 0) or 0),
            "tableBorderCount": int(format_result.get("tableBorderCount", 0) or 0),
            "validationPath": str(validation_path) if validation_path is not None else "",
            "auditPath": str(audit_report_path) if audit_report is not None else "",
            "auditIssueCount": int(audit_report.get("issueCount", 0) or 0) if audit_report is not None else 0,
            "ooxmlAuditPath": str(ooxml_audit_report_path) if ooxml_audit_report is not None else "",
            "ooxmlAuditIssueCount": int(ooxml_audit_report.get("issueCount", 0) or 0) if ooxml_audit_report is not None else 0,
            "preflightPath": str(format_result.get("preflightPath", "")),
            "preflightIssueCount": int(format_result.get("preflightIssueCount", 0) or 0),
            "preflightWarningCount": int(
                format_result.get(
                    "preflightWarningCount",
                    preflight_report.get("warningCount", 0) if preflight_report is not None else 0,
                )
                or 0
            ),
            "guardPath": str(guard_report.get("reportPath", "")) if guard_report is not None else "",
            "guardIssueCount": int(guard_report.get("blockingIssueCount", 0) or 0) if guard_report is not None else 0,
            "guardWarningCount": int(guard_report.get("warningCount", 0) or 0) if guard_report is not None else 0,
            "guardIssueSamples": _collect_issue_samples(guard_report, keys=("blockingIssues", "warnings")),
            "auditIssueSamples": _collect_issue_samples(audit_report, keys=("issues",)),
            "ooxmlAuditIssueSamples": _collect_issue_samples(ooxml_audit_report, keys=("issues",)),
            "preflightIssueSamples": _collect_issue_samples(preflight_report, keys=("blockingIssues", "issues")),
        }

    raise ValueError(f"Unsupported export format: {target_format}")


def _collect_docx_text_fingerprint(path: Path) -> list[tuple[str, str]]:
    document = Document(str(path.resolve()))
    fingerprint: list[tuple[str, str]] = []
    for index, paragraph in enumerate(document.paragraphs):
        fingerprint.append((f"p:{index}", paragraph.text))
    for table_index, table in enumerate(document.tables):
        for row_index, row in enumerate(table.rows):
            for cell_index, cell in enumerate(row.cells):
                for paragraph_index, paragraph in enumerate(cell.paragraphs):
                    fingerprint.append((f"t:{table_index}:{row_index}:{cell_index}:{paragraph_index}", paragraph.text))
    return fingerprint


def _build_docx_text_targets_from_body_map(body_map: Any) -> list[tuple[dict[str, Any], str]]:
    targets: list[tuple[dict[str, Any], str]] = []
    for unit in getattr(body_map, "units", []) or []:
        target = getattr(unit, "target", {})
        if isinstance(target, dict):
            targets.append((dict(target), str(getattr(unit, "current_text", ""))))
    return targets


def _build_docx_text_targets_from_snapshot(snapshot_path: Path, rewritten_paragraphs: list[str]) -> list[tuple[dict[str, Any], str]]:
    snapshot = _load_docx_snapshot(snapshot_path)
    if snapshot is None:
        return []
    return [
        (dict(unit.target), str(rewritten_text))
        for unit, rewritten_text in zip(snapshot.editable_units(), rewritten_paragraphs)
    ]


def _audit_exported_docx_text_targets(export_path: Path, expected_targets: list[tuple[dict[str, Any], str]]) -> dict[str, Any]:
    document = Document(str(export_path.resolve()))
    issues: list[dict[str, Any]] = []
    checks: list[dict[str, Any]] = []
    for index, (target, expected_text) in enumerate(expected_targets):
        try:
            paragraph = _resolve_target_paragraph(document, target)
            actual_text = paragraph.text
        except Exception as exc:
            issues.append({
                "code": "docx_text_target_unreadable",
                "message": f"无法读取导出后的正文目标：{type(exc).__name__}",
                "location": json.dumps(target, ensure_ascii=False, sort_keys=True),
            })
            continue
        expected = _normalize_rewritten_text(str(expected_text))
        check = {
            "index": index,
            "location": json.dumps(target, ensure_ascii=False, sort_keys=True),
            "expectedPreview": _truncate_issue_text(expected, 120),
            "actualPreview": _truncate_issue_text(actual_text, 120),
        }
        checks.append(check)
        if actual_text != expected:
            issues.append({
                "code": "docx_exported_text_changed",
                "message": "导出后的正文文本与本轮结果不一致。",
                "location": check["location"],
                "sample": f"expected={check['expectedPreview']}; actual={check['actualPreview']}",
            })
    return {
        "ok": not issues,
        "issueCount": len(issues),
        "checked": len(checks),
        "issues": issues[:20],
        "sampleChecks": checks[:8],
    }


def _export_text_integrity_error(message: str) -> ExportRoundError:
    return ExportRoundError(
        message,
        _build_export_failure(
            stage="text-integrity",
            label="正文文本",
            message=message,
            issue_count=1,
            samples=[{
                "code": "docx_text_integrity_failed",
                "message": _truncate_issue_text(message, 240),
            }],
        ),
    )


def read_output_text(output_path: str, max_chars: int | None = None) -> dict[str, Any]:
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_READ_ALLOWED_ROOTS, label="Output path")
    text = normalized_output_path.read_text(encoding="utf-8")
    total_chars = len(text)
    normalized_limit = max_chars if isinstance(max_chars, int) and max_chars > 0 else None
    truncated = normalized_limit is not None and total_chars > normalized_limit
    preview_text = text
    if truncated and normalized_limit is not None:
        preview_text = (
            text[:normalized_limit].rstrip()
            + "\n\n[预览已截断，导出文件可查看完整内容]"
        )
    return {
        "path": str(normalized_output_path),
        "text": preview_text,
        "truncated": truncated,
        "totalChars": total_chars,
        "previewChars": len(preview_text),
    }


def read_round_compare(output_path: str) -> dict[str, Any]:
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_OUTPUT_ALLOWED_ROOTS, label="Output path")
    compare_path = _find_compare_path_for_output(normalized_output_path)
    if not compare_path.exists():
        raise ValueError(f"Compare data not found for output: {normalized_output_path}")
    payload = json.loads(compare_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Invalid compare data payload: {compare_path}")
    payload = _normalize_compare_failed_attempts(payload)
    return payload


def _find_review_decisions_path_for_output(output_path: Path) -> Path:
    compare_path = _find_compare_path_for_output(output_path)
    return compare_path.with_name(f"{compare_path.stem}_review_decisions.json")


def load_review_decisions(output_path: str) -> dict[str, Any]:
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_OUTPUT_ALLOWED_ROOTS, label="Output path")
    decisions_path = _find_review_decisions_path_for_output(normalized_output_path)
    if not decisions_path.exists():
        return {"path": str(decisions_path), "decisions": {}}
    try:
        payload = json.loads(decisions_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"path": str(decisions_path), "decisions": {}}
    decisions = payload.get("decisions") if isinstance(payload, dict) else None
    if not isinstance(decisions, dict):
        decisions = {}
    normalized_decisions = {
        str(chunk_id): _normalize_review_decision_value(decision)
        for chunk_id, decision in decisions.items()
    }
    return {"path": str(decisions_path), "decisions": normalized_decisions}


def save_review_decisions(output_path: str, decisions: dict[str, Any]) -> dict[str, Any]:
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_OUTPUT_ALLOWED_ROOTS, label="Output path")
    decisions_path = _find_review_decisions_path_for_output(normalized_output_path)
    compare_payload = read_round_compare(str(normalized_output_path))
    valid_chunk_ids = {
        str(chunk.get("chunkId"))
        for chunk in compare_payload.get("chunks", [])
        if isinstance(chunk, dict) and str(chunk.get("chunkId", "")).strip()
    }
    normalized_decisions = {
        str(chunk_id): _normalize_review_decision_value(decision)
        for chunk_id, decision in decisions.items()
        if str(chunk_id) in valid_chunk_ids
    }
    decisions_path.parent.mkdir(parents=True, exist_ok=True)
    decisions_path.write_text(
        json.dumps({"outputPath": str(normalized_output_path), "decisions": normalized_decisions}, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return {"path": str(decisions_path), "decisions": normalized_decisions}


def _build_transform_from_model_config(model_config: dict[str, Any]) -> tuple[Callable[[str, str, int, str], str], str]:
    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    model = str(model_config.get("model", "")).strip()
    api_type = str(model_config.get("apiType", "chat_completions")).strip()
    temperature = float(model_config.get("temperature", 0.7) or 0.7)
    request_timeout_seconds = _coerce_rewrite_timeout_seconds(
        model_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS)
    )
    configured_max_retries = _coerce_int_config(
        model_config.get("maxRetries", DEFAULT_MAX_RETRIES),
        default=DEFAULT_MAX_RETRIES,
        minimum=0,
        maximum=10,
    )
    max_retries = max(configured_max_retries, MIN_REWRITE_TRANSIENT_RETRIES)

    if not base_url or not api_key or not model:
        raise ValueError("Model configuration is incomplete.")

    rate_limiter = _build_provider_rate_limiter(model_config)

    def transform(_chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
        _wait_for_provider_cooldown(model_config)
        rate_limiter()
        try:
            output = llm_completion(
                prompt_input,
                model=model,
                api_key=api_key,
                base_url=base_url,
                api_type=api_type,
                temperature=temperature,
                timeout=request_timeout_seconds,
                max_retries=max_retries,
                retry_backoff_seconds=REWRITE_RETRY_BACKOFF_SECONDS,
            )
        except LLMRequestError as exc:
            _register_provider_failure(model_config, exc)
            raise
        _register_provider_success(model_config)
        return output

    return transform, "online"


RERUN_FEEDBACK_TEMPLATES: dict[str, dict[str, Any]] = {
    "citation_missing": {
        "tag": "citation-repair",
        "advice": "补回原文所有引用标记，引用必须跟随对应观点，不要移动到无关句子。",
        "instruction": "- Citation repair: preserve each citation marker from the input and place it near the same claim or sentence logic.",
    },
    "over_expanded": {
        "tag": "control-expansion",
        "advice": "控制长度，删除新增背景、泛化解释、额外评价和原文没有的结论。",
        "instruction": "- Length control: stay close to the source length and remove unsupported background, explanations, emphasis, or conclusions.",
    },
    "over_compressed": {
        "tag": "restore-detail",
        "advice": "补回被压缩掉的限定条件、因果关系、对比关系、实验细节和关键术语。",
        "instruction": "- Detail restoration: restore qualifiers, causal links, contrasts, technical terms, and key experimental details.",
    },
    "machine_like_expression": {
        "tag": "de-template-expression",
        "advice": "降低模板句式密度，减少套路连接词，避免整齐划一的总分总表达。",
        "instruction": "- De-template: vary sentence openings and rhythm; avoid generic transitions, boilerplate academic phrasing, and uniform paragraph cadence.",
    },
    "template_phrase_drift": {
        "tag": "avoid-new-template-phrase",
        "advice": "不要沿用或新增“在……背景下、具有重要意义、提供支持”等泛化模板句，改成该段落自己的具体表达。",
        "instruction": "- Template drift repair: remove newly introduced boilerplate phrases and replace them with concrete wording grounded in this paragraph.",
    },
    "connector_overuse": {
        "tag": "connector-trim",
        "advice": "减少“因此、同时、此外、综上”等连接词堆叠，让逻辑关系更多靠句义自然呈现。",
        "instruction": "- Connector trim: remove excessive transition words and express logical relations through content-specific wording.",
    },
    "template_phrase_density": {
        "tag": "phrase-diversify",
        "advice": "替换高频模板短语，不要使用平台化、套壳式、过度规整的论文腔。",
        "instruction": "- Phrase diversity: replace repeated template phrases with context-specific wording grounded in this paragraph.",
    },
    "generic_sentence_rhythm": {
        "tag": "rhythm-vary",
        "advice": "打散句长和句式节奏，避免每句结构过于相似。",
        "instruction": "- Rhythm variation: mix sentence lengths and structures while preserving academic clarity.",
    },
    "uniform_sentence_rhythm": {
        "tag": "rhythm-vary",
        "advice": "打散句长和句式节奏，避免每句结构过于相似。",
        "instruction": "- Rhythm variation: mix sentence lengths and structures while preserving academic clarity.",
    },
}


def _unique_strings(items: list[str]) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    for item in items:
        clean = " ".join(str(item or "").split())
        if clean and clean not in seen:
            seen.add(clean)
            unique.append(clean)
    return unique


def _collect_rerun_feedback_templates(flags: list[str], reasons: list[Any]) -> tuple[list[str], list[str], list[str]]:
    codes = list(flags)
    for reason in reasons:
        if isinstance(reason, dict):
            code = str(reason.get("code", "")).strip()
            if code:
                codes.append(code)
    tags: list[str] = []
    advice: list[str] = []
    instructions: list[str] = []
    for code in codes:
        template = RERUN_FEEDBACK_TEMPLATES.get(code)
        if not template:
            continue
        tags.append(str(template["tag"]))
        advice.append(str(template["advice"]))
        instructions.append(str(template["instruction"]))
    return _unique_strings(tags), _unique_strings(advice), _unique_strings(instructions)


def _format_rerun_evidence(value: Any) -> str:
    if value in (None, "", [], {}):
        return ""
    try:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))[:500]
    except TypeError:
        return str(value)[:500]


def _truncate_prompt_block(text: str, limit: int = 6000) -> str:
    normalized = str(text or "").strip()
    if len(normalized) <= limit:
        return normalized
    half = max(1, limit // 2)
    return f"{normalized[:half]}\n...[TRUNCATED]...\n{normalized[-half:]}"


def _build_rerun_issue_cards(chunk: dict[str, Any]) -> list[str]:
    quality = chunk.get("quality") if isinstance(chunk.get("quality"), dict) else {}
    flags = quality.get("flags") if isinstance(quality, dict) else []
    reasons = quality.get("reviewReasons") if isinstance(quality, dict) else []
    cards: list[str] = []

    if isinstance(reasons, list):
        for reason in reasons[:8]:
            if not isinstance(reason, dict):
                continue
            code = str(reason.get("code", "review")).strip() or "review"
            level = str(reason.get("level", "medium")).strip() or "medium"
            message = str(reason.get("message", "")).strip()
            evidence = _format_rerun_evidence(reason.get("evidence"))
            if not message and not evidence:
                continue
            card = f"- [{code} / {level}] {message or '需要局部修复。'}"
            if evidence:
                card += f"\n  Evidence: {evidence}"
            cards.append(card)

    if isinstance(flags, list):
        known_codes = {card.split("]", 1)[0].lstrip("- [").split(" / ", 1)[0] for card in cards}
        for flag in flags:
            code = str(flag).strip()
            if code and code not in known_codes:
                cards.append(f"- [{code} / medium] 该块被标记为需审阅，请优先修复这个具体问题。")

    return _unique_strings(cards)


def _build_compact_round_brief(
    prompt_profile: str,
    round_number: int,
    prompt_sequence: object | None = None,
) -> list[str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    final_round = round_number >= get_max_rounds(normalized_profile, normalized_prompt_sequence)
    current_prompt_id = get_prompt_id_for_round(normalized_profile, round_number, normalized_prompt_sequence)
    if current_prompt_id == "prewrite":
        return [
            "- 当前轮次是润色改写：只做轻量自然化，不要大幅扩写。",
            "- 字数尽量贴近原文，段落角色、事实、术语和结论保持不变。",
        ]
    if current_prompt_id == "round2" or final_round:
        return [
            "- 当前轮次偏向最终自然化：降低机械论文腔，但不能新增观点或改变逻辑。",
            "- 避免总分总模板、泛化价值判断和过于整齐的连接词节奏。",
        ]
    return [
        "- 当前轮次是规范改写：表达可以更自然、更具解释性，但不能偏离原文。",
        "- 控制长度，优先修正句式与节奏，不要写成总结、建议或答疑。",
    ]


def _build_targeted_validation_retry_note(validation_error: str) -> str:
    repair_steps = _build_validation_repair_steps(validation_error)
    sections = [
        "[TARGETED VALIDATION RETRY]",
        "- The previous targeted rerun output failed local hard validation.",
        "- Regenerate the same chunk and fix the validation problem directly.",
        "- Do not make broader changes just to avoid the error; keep the rewrite conservative.",
    ]
    if repair_steps:
        sections.append(repair_steps)
    sections.append(f"- Validation error: {validation_error.strip()}")
    return "\n".join(sections)

def _build_rerun_strategy_note(chunk: dict[str, Any], user_feedback: str = "") -> tuple[str, list[str], list[str]]:
    quality = chunk.get("quality") if isinstance(chunk.get("quality"), dict) else {}
    flags = quality.get("flags") if isinstance(quality, dict) else []
    normalized_flags = [str(flag) for flag in flags] if isinstance(flags, list) else []
    advice = quality.get("rewriteAdvice") if isinstance(quality, dict) else []
    advice_items = [str(item).strip() for item in advice if str(item).strip()] if isinstance(advice, list) else []
    reasons = quality.get("reviewReasons") if isinstance(quality, dict) else []
    normalized_reasons = reasons if isinstance(reasons, list) else []
    template_tags, template_advice, template_instructions = _collect_rerun_feedback_templates(normalized_flags, normalized_reasons)
    advice_items = _unique_strings([*template_advice, *advice_items])
    reason_messages: list[str] = []
    if isinstance(normalized_reasons, list):
        for reason in normalized_reasons[:5]:
            if not isinstance(reason, dict):
                continue
            message = str(reason.get("message", "")).strip()
            code = str(reason.get("code", "")).strip()
            if message:
                reason_messages.append(f"{code}: {message}" if code else message)
    expansion_ratio = quality.get("expansionRatio") if isinstance(quality, dict) else None
    instructions = [
        "[TARGETED RERUN NOTE]",
        "- The previous rewrite was marked as needing review. Fix the listed problems directly; do not repeat the same rewrite style.",
        "- Preserve every @@FYADR_*@@ placeholder exactly.",
        "- Do not change facts, citations, figure/table references, formula numbers, numbers, units, or conclusions.",
    ]
    if expansion_ratio is not None:
        instructions.append(f"- Previous expansion ratio: {expansion_ratio}. Use it to control length and information density.")
    if reason_messages:
        instructions.append("- Review diagnosis:")
        instructions.extend(f"  * {message}" for message in reason_messages)
    if advice_items:
        instructions.append("- Built-in targeted repair feedback:")
        instructions.extend(f"  * {item}" for item in advice_items[:6])
    clean_feedback = " ".join(str(user_feedback or "").split())
    if clean_feedback:
        instructions.append("- Human reviewer feedback for this rerun:")
        instructions.append(f"  * {clean_feedback[:800]}")
    strategy_tags: list[str] = [*template_tags]

    if template_instructions:
        instructions.append("- Strategy-specific instructions:")
        instructions.extend(template_instructions[:8])

    strategy_tags = _unique_strings(strategy_tags)
    if not strategy_tags:
        strategy_tags.append("general-polish")
        instructions.append("- Improve sentence rhythm without increasing risk to structure or meaning.")

    instructions.append("- Return only the rewritten chunk body text.")
    return "\n".join(instructions), strategy_tags, advice_items


def _build_targeted_rerun_prompt_input(
    *,
    protected_input_text: str,
    previous_output_text: str,
    prompt_profile: str,
    prompt_sequence: object | None = None,
    round_number: int,
    chunk_id: str,
    rerun_note: str,
    issue_cards: list[str],
    style_card: str | None,
    validation_retry_note: str | None = None,
) -> str:
    compact_brief = _build_compact_round_brief(prompt_profile, round_number, prompt_sequence)
    sections = [
        "[TARGETED CHUNK RERUN]",
        (
            "This is a local repair prompt for exactly one chunk. "
            "The repair cards below have higher priority than generic rewrite habits from the full-round prompt."
        ),
        f"[ROUND {round_number}]",
        f"[CHUNK {chunk_id}]",
        "[NON-NEGOTIABLE OUTPUT RULES]\n"
        "- Return only the rewritten chunk body text; no labels, no explanations, no Markdown.\n"
        "- Preserve facts, claims, conclusions, citations, figure/table references, formula numbers, numbers, units, file paths, and technical terms.\n"
        "- Preserve every @@FYADR_*@@ placeholder exactly; do not translate, delete, split, or rename placeholders.\n"
        "- Preserve paragraph count and paragraph role; do not merge or split paragraphs.\n"
        "- Do not copy the previous output's bad rhythm, boilerplate phrases, or unsupported additions.",
        "[COMPACT ROUND STYLE BRIEF]\n" + "\n".join(compact_brief),
    ]

    language_guard = build_language_guard(protected_input_text)
    if language_guard:
        sections.append(language_guard)
    paragraph_guard = build_paragraph_guard(protected_input_text)
    if paragraph_guard:
        sections.append(paragraph_guard)

    if issue_cards:
        sections.append("[REPAIR CARDS]\n" + "\n".join(issue_cards[:10]))
    if style_card:
        sections.append(style_card.strip())
    if rerun_note:
        sections.append(rerun_note.strip())
    if validation_retry_note:
        sections.append(validation_retry_note.strip())

    sections.extend(
        [
            "[TARGETED REPAIR DIRECTION]\n"
            "- Generate one conservative repair for this chunk; do not produce alternatives.\n"
            "- Follow the repair cards and human feedback directly while preserving structure and facts.",
            "[BAD PREVIOUS OUTPUT - DO NOT COPY ITS STYLE]\n" + _truncate_prompt_block(previous_output_text, 5000),
            "[INPUT TEXT]\n" + protected_input_text,
        ]
    )
    return "\n\n".join(section for section in sections if section)


def _pick_targeted_fallback_text(input_text: str, previous_output_text: str, chunk_id: str) -> tuple[str, str]:
    cleaned_previous = previous_output_text.strip()
    if cleaned_previous:
        try:
            validate_chunk_output(input_text, cleaned_previous, chunk_id)
            return cleaned_previous, "previous"
        except ValueError:
            pass
    return input_text, "source"


def _apply_targeted_rerun_fallback_quality(
    quality: dict[str, Any],
    *,
    error_detail: str,
    fallback_mode: str,
    attempts: int,
) -> dict[str, Any]:
    next_quality = dict(quality)
    flags = list(next_quality.get("flags") or [])
    review_reasons = list(next_quality.get("reviewReasons") or [])
    rewrite_advice = list(next_quality.get("rewriteAdvice") or [])
    fallback_flag = "targeted_rerun_fallback"
    if fallback_flag not in flags:
        flags.insert(0, fallback_flag)
    review_reasons.insert(
        0,
        {
            "code": fallback_flag,
            "level": "medium",
            "message": "定向重跑连续输出未通过硬校验，系统已保留当前安全文本，避免错误改写影响后续流程。",
            "evidence": {
                "fallbackMode": fallback_mode,
                "attempts": attempts,
                "error": error_detail,
            },
        },
    )
    rewrite_advice.insert(0, "可更换模型或补充更具体的人工反馈后再单独重跑；在通过硬校验前，不采用失败输出。")
    next_quality["flags"] = _unique_strings([str(flag) for flag in flags])
    next_quality["reviewReasons"] = review_reasons
    next_quality["rewriteAdvice"] = _unique_strings([str(item) for item in rewrite_advice])
    next_quality["needsReview"] = True
    return next_quality


def _append_compare_validation_event(compare_payload: dict[str, Any], event: dict[str, Any]) -> None:
    events = compare_payload.get("validationEvents")
    if not isinstance(events, list):
        events = []
        compare_payload["validationEvents"] = events
    events.append(event)


def _record_targeted_failed_output(
    compare_payload: dict[str, Any],
    target_chunk: dict[str, Any],
    *,
    round_number: int,
    chunk_id: str,
    validation_attempt: int,
    error: str,
    output_text: str,
) -> None:
    failed_payload = _serialize_failed_output(output_text)
    if not failed_payload.get("outputText"):
        return
    event = {
        "event": "validation-retry",
        "round": round_number,
        "chunkId": chunk_id,
        "paragraphIndex": target_chunk.get("paragraphIndex"),
        "chunkIndex": target_chunk.get("chunkIndex"),
        "attempt": validation_attempt,
        "error": error,
        **failed_payload,
    }
    _append_compare_validation_event(compare_payload, event)
    failed_attempts = _normalize_failed_attempts(target_chunk.get("failedAttempts"))
    if not failed_attempts:
        failed_attempts = _normalize_failed_attempts(target_chunk.get("rejectedCandidates"))
    failed_attempts.append(
        {
            "attempt": validation_attempt,
            "outputText": failed_payload.get("outputText", ""),
            "outputCharCount": failed_payload.get("outputCharCount"),
            "truncated": bool(failed_payload.get("truncated")),
            "error": error,
        }
    )
    target_chunk.pop("rejectedCandidates", None)
    target_chunk["failedAttempts"] = failed_attempts[-4:]


def _bump_quality_summary_counter(compare_payload: dict[str, Any], key: str, chunk_id: str) -> None:
    summary = compare_payload.get("qualitySummary")
    if not isinstance(summary, dict):
        summary = {}
        compare_payload["qualitySummary"] = summary
    summary[key] = int(summary.get(key, 0) or 0) + 1
    ids_key = f"{key.removesuffix('Count')}ChunkIds"
    chunk_ids = summary.get(ids_key)
    if not isinstance(chunk_ids, list):
        chunk_ids = []
    if chunk_id not in chunk_ids:
        chunk_ids.append(chunk_id)
    summary[ids_key] = chunk_ids[:24]


def rerun_compare_chunk(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
    normalized_output_path = _resolve_api_path(output_path, allowed_roots=API_OUTPUT_ALLOWED_ROOTS, label="Output path")
    compare_path = _find_compare_path_for_output(normalized_output_path)
    compare_payload = read_round_compare(str(normalized_output_path))
    chunks = compare_payload.get("chunks")
    if not isinstance(chunks, list):
        raise ValueError("Compare data is invalid: chunks missing.")

    target_chunk = None
    for chunk in chunks:
        if isinstance(chunk, dict) and str(chunk.get("chunkId", "")) == chunk_id:
            target_chunk = chunk
            break
    if target_chunk is None:
        raise ValueError(f"Chunk not found in compare data: {chunk_id}")

    prompt_profile = normalize_prompt_profile(compare_payload.get("promptProfile", model_config.get("promptProfile", DEFAULT_PROMPT_PROFILE)))
    prompt_sequence = normalize_prompt_sequence(prompt_profile, compare_payload.get("promptSequence", model_config.get("promptSequence")))
    round_number = int(compare_payload.get("round", 1) or 1)
    input_text = str(target_chunk.get("inputText", ""))
    if not input_text.strip():
        raise ValueError(f"Chunk {chunk_id} has empty input text.")

    transform, mode = _build_transform_from_model_config(_resolve_round_model_config(model_config, prompt_profile, round_number))
    protected_chunk = protect_structure_tokens(input_text)
    previous_output_text = str(target_chunk.get("outputText", "")).strip()
    global_style_profile = build_global_style_profile_from_texts([
        str(chunk.get("inputText", ""))
        for chunk in chunks
        if isinstance(chunk, dict)
    ])
    style_card = build_local_style_card(input_text, global_style_profile)
    rerun_note, strategy_tags, advice_items = _build_rerun_strategy_note(target_chunk, user_feedback=user_feedback)
    issue_cards = _build_rerun_issue_cards(target_chunk)
    if style_card:
        strategy_tags = _unique_strings([*strategy_tags, "global-style-card"])
        advice_items = _unique_strings([*advice_items, "重跑会参考全文高频连接词、模板句和重复开头，避免继续放大全文层面的机械感。"])
    accepted_output: str | None = None
    accepted_score = 999.0
    output_errors: list[str] = []

    validation_retry_note: str | None = None
    used_fallback = False
    fallback_mode = ""
    fallback_detail = ""
    attempts_used = 0

    for validation_attempt in range(1, TARGETED_RERUN_VALIDATION_ATTEMPTS + 1):
        attempts_used = validation_attempt
        prompt_input = _build_targeted_rerun_prompt_input(
            protected_input_text=protected_chunk.text,
            previous_output_text=previous_output_text,
            prompt_profile=prompt_profile,
            prompt_sequence=prompt_sequence,
            round_number=round_number,
            chunk_id=chunk_id,
            rerun_note=rerun_note,
            issue_cards=issue_cards,
            style_card=style_card,
            validation_retry_note=validation_retry_note,
        )
        output_for_review = ""
        try:
            raw_output = transform(protected_chunk.text, prompt_input, round_number, chunk_id)
            output_for_review = str(raw_output or "").strip()
            protected_output = normalize_chunk_output(protected_chunk.text, raw_output)
            validate_structure_placeholders(protected_output, protected_chunk.tokens, chunk_id)
            rewritten_output = restore_structure_tokens(protected_output, protected_chunk.tokens)
            output_for_review = rewritten_output
            validate_chunk_output(input_text, rewritten_output, chunk_id)
            score = _score_rewrite_output(input_text, rewritten_output)
            if previous_output_text and rewritten_output.strip() == previous_output_text:
                score += 2.0
            accepted_output = rewritten_output
            accepted_score = score
        except Exception as exc:
            output_error = f"attempt {validation_attempt}: {exc}"
            output_errors.append(output_error)
            _record_targeted_failed_output(
                compare_payload,
                target_chunk,
                round_number=round_number,
                chunk_id=chunk_id,
                validation_attempt=validation_attempt,
                error=str(exc),
                output_text=output_for_review,
            )
            validation_retry_note = _build_targeted_validation_retry_note(str(exc))
        if accepted_output is not None:
            break

    if accepted_output is not None:
        selected_score, output_text = accepted_score, accepted_output
    else:
        fallback_detail = "; ".join(output_errors[-3:]) if output_errors else "no valid output"
        output_text, fallback_mode = _pick_targeted_fallback_text(input_text, previous_output_text, chunk_id)
        selected_score = 999.0
        used_fallback = True

    target_chunk["outputText"] = output_text
    target_chunk["outputCharCount"] = len(output_text)
    target_chunk["quality"] = _build_chunk_quality(input_text, output_text)
    if used_fallback:
        target_chunk["quality"] = _apply_targeted_rerun_fallback_quality(
            target_chunk["quality"],
            error_detail=fallback_detail,
            fallback_mode=fallback_mode,
            attempts=attempts_used,
        )
    target_chunk["rerunAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    target_chunk["rerunMode"] = mode
    target_chunk["rerunPromptMode"] = "targeted-short-prompt"
    target_chunk["rerunStrategy"] = strategy_tags
    target_chunk["rerunAdvice"] = advice_items
    target_chunk["rerunIssueCards"] = issue_cards
    target_chunk["rerunStyleCard"] = style_card or ""
    target_chunk["rerunGlobalStyleProfile"] = global_style_profile
    target_chunk["rerunAttemptCount"] = attempts_used
    target_chunk["rerunSelectedScore"] = round(selected_score, 3)
    target_chunk["rerunPromptNote"] = rerun_note
    target_chunk["rerunUserFeedback"] = " ".join(str(user_feedback or "").split())[:800]
    if used_fallback:
        target_chunk["rerunStatus"] = "fallback"
        target_chunk["rerunFallbackMode"] = fallback_mode
        target_chunk["rerunFallbackError"] = fallback_detail
        target_chunk["rerunAdvice"] = _unique_strings([
            "定向重跑未通过硬校验，本块已保留当前安全文本，批处理会继续推进。",
            *advice_items,
        ])
        _append_compare_validation_event(
            compare_payload,
            {
                "event": "targeted-rerun-fallback",
                "round": round_number,
                "chunkId": chunk_id,
                "paragraphIndex": target_chunk.get("paragraphIndex"),
                "chunkIndex": target_chunk.get("chunkIndex"),
                "attempts": attempts_used,
                "fallbackMode": fallback_mode,
                "error": fallback_detail,
                "createdAt": target_chunk["rerunAt"],
            },
        )
        _bump_quality_summary_counter(compare_payload, "targetedRerunFallbackCount", chunk_id)

    compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    reviewed_paragraphs = _build_reviewed_paragraphs_from_compare(normalized_output_path, {})
    normalized_output_path.write_text("\n\n".join(reviewed_paragraphs), encoding="utf-8")

    body_map = _load_body_map_for_output(normalized_output_path)
    body_map_path = _find_body_map_path_for_output(normalized_output_path)
    if body_map is not None and body_map_path is not None:
        reviewed_paragraphs = _ensure_reviewed_paragraph_count_for_body_map(
            normalized_output_path,
            compare_payload,
            reviewed_paragraphs,
            len(body_map.units),
            {},
        )
        updated_body_map = update_docx_body_map_texts(body_map, reviewed_paragraphs, round_number=body_map.round_number)
        save_docx_body_map(updated_body_map, body_map_path)

    return {
        "chunk": target_chunk,
        "compare": compare_payload,
        "outputPath": str(normalized_output_path),
        "comparePath": str(compare_path),
    }


def load_model_config_payload(model_config_json: str | None = None, model_config_file: str | None = None) -> dict[str, Any]:
    if model_config_file:
        config_path = Path(model_config_file).resolve()
        return json.loads(config_path.read_text(encoding="utf-8"))
    if model_config_json:
        return json.loads(model_config_json)
    raise ValueError("Either model_config_json or model_config_file must be provided.")


def cli_main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Desktop app service bridge")
    subparsers = parser.add_subparsers(dest="command", required=True)

    import_parser = subparsers.add_parser("import-document")
    import_parser.add_argument("source_path")

    status_parser = subparsers.add_parser("document-status")
    status_parser.add_argument("source_path")
    status_parser.add_argument("prompt_profile", nargs="?", default=DEFAULT_PROMPT_PROFILE)

    history_parser = subparsers.add_parser("document-history")
    history_parser.add_argument("source_path")

    list_history_parser = subparsers.add_parser("document-history-list")

    delete_history_parser = subparsers.add_parser("delete-document-history")
    delete_history_parser.add_argument("doc_id")
    delete_history_parser.add_argument("--from-round", type=int, default=None)
    delete_history_parser.add_argument("--prompt-profile", default=None)

    run_parser = subparsers.add_parser("run-round")
    run_parser.add_argument("source_path")
    run_parser.add_argument("model_config_json", nargs="?", default=None)
    run_parser.add_argument("--config-file", default=None)
    run_parser.add_argument("--round", type=int, default=None)

    test_parser = subparsers.add_parser("test-connection")
    test_parser.add_argument("model_config_json", nargs="?", default=None)
    test_parser.add_argument("--config-file", default=None)

    export_parser = subparsers.add_parser("export-round")
    export_parser.add_argument("output_path")
    export_parser.add_argument("export_path")
    export_parser.add_argument("target_format", choices=["txt", "docx"])

    preview_parser = subparsers.add_parser("read-output")
    preview_parser.add_argument("output_path")
    preview_parser.add_argument("--max-chars", type=int, default=DEFAULT_PREVIEW_MAX_CHARS)

    compare_parser = subparsers.add_parser("read-compare")
    compare_parser.add_argument("output_path")

    args = parser.parse_args()

    try:
        if args.command == "import-document":
            payload = import_document(args.source_path)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "document-status":
            payload = get_document_status(args.source_path, prompt_profile=args.prompt_profile)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "document-history":
            payload = get_document_history(args.source_path)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "document-history-list":
            payload = list_document_histories()
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "delete-document-history":
            payload = delete_document_history(args.doc_id, args.from_round, args.prompt_profile)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "run-round":
            payload = run_round_for_app(
                args.source_path,
                load_model_config_payload(args.model_config_json, args.config_file),
                args.round,
            )
            emit_result_payload(payload)
        elif args.command == "test-connection":
            payload = test_model_connection(load_model_config_payload(args.model_config_json, args.config_file))
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "export-round":
            payload = export_round_output(args.output_path, args.export_path, args.target_format)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "read-output":
            payload = read_output_text(args.output_path, max_chars=args.max_chars)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        elif args.command == "read-compare":
            payload = read_round_compare(args.output_path)
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        else:
            raise ValueError(f"Unsupported command: {args.command}")
    except Exception as exc:
        if args.command == "run-round":
            emit_error_payload(str(exc))
        raise


if __name__ == "__main__":
    cli_main()
