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
    list_records,
    normalize_doc_id,
)
from chunking import load_manifest, restore_text_from_chunks, split_text_to_paragraphs
from fyadr_round_service import (
    build_global_style_profile_from_texts,
    build_language_guard,
    build_local_style_card,
    build_paragraph_guard,
    build_prompt_input,
    get_max_rounds,
    get_round_compare_path,
    load_prompt,
    normalize_chunk_output,
    normalize_path,
    normalize_prompt_profile,
    normalize_prompt_sequence,
    normalize_rewrite_candidate_mode,
    protect_structure_tokens,
    restore_structure_tokens,
    validate_chunk_output,
    validate_structure_placeholders,
    _build_chunk_quality,
    _build_validation_repair_steps,
    _extract_required_terms,
    _score_rewrite_candidate,
)
from docx_bodymap import load_docx_body_map, save_docx_body_map, update_docx_body_map_texts, validate_docx_body_map
from docx_audit import audit_docx_export, get_docx_audit_report_path
from docx_export_guard import (
    run_docx_pre_export_guard,
    summarize_docx_export_guard_failure,
)
from docx_pipeline import (
    _load_docx_snapshot,
    _split_text_into_blocks,
    ensure_docx_processing_assets,
    get_docx_snapshot_path,
    rebuild_docx_from_snapshot,
    write_docx_text,
)
from docx_protection_map import build_docx_protection_map
from docx_template import apply_school_format_rules
from llm_client import list_llm_models, llm_completion, test_llm_connection
from round_helper import build_round_context, ensure_round_input_text, get_document_round_state


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
DEFAULT_MAX_RETRIES = 3
DEFAULT_PREVIEW_MAX_CHARS = 12000
TARGETED_RERUN_VALIDATION_ATTEMPTS = 2
_RATE_LIMIT_STATE: dict[str, list[float]] = {}
_RATE_LIMIT_LOCK = threading.Lock()


def _coerce_int_config(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


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


def _build_provider_rate_limiter(model_config: dict[str, Any]) -> Callable[[], float]:
    window_minutes = _coerce_rate_window_minutes(model_config)
    max_requests = _coerce_rate_max_requests(model_config)
    if window_minutes <= 0 or max_requests <= 0:
        return lambda: 0.0

    window_seconds = window_minutes * 60.0
    provider_key = "|".join(
        [
            str(model_config.get("providerName", "")).strip(),
            str(model_config.get("baseUrl", "")).strip(),
            str(model_config.get("apiKey", "")).strip()[-12:],
        ]
    )

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


def _map_history_round(item: dict[str, Any]) -> dict[str, Any]:
    prompt_sequence = item.get("prompt_sequence")
    return {
        "round": int(item.get("round", 0)),
        "prompt": str(item.get("prompt", "")),
        "promptProfile": str(item.get("prompt_profile", "cn") or "cn").strip().lower() or "cn",
        "promptSequence": prompt_sequence if isinstance(prompt_sequence, list) else [],
        "inputPath": str(item.get("input_path", "")),
        "outputPath": str(item.get("output_path", "")),
        "manifestPath": str(item.get("manifest_path", "")),
        "comparePath": str(item.get("compare_path", "")),
        "scoreTotal": item.get("score_total"),
        "chunkLimit": item.get("chunk_limit"),
        "inputSegmentCount": item.get("input_segment_count"),
        "outputSegmentCount": item.get("output_segment_count"),
        "bodyMapPath": str(item.get("body_map_path", "")),
        "validationPath": str(item.get("validation_path", "")),
        "timestamp": str(item.get("timestamp", "")),
        "artifactStats": build_artifact_summary([item]),
    }


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

    return {
        "docId": doc_id,
        "sourcePath": origin_path,
        "originPath": origin_path,
        "completedRounds": completed_rounds,
        "latestOutputPath": latest_round.get("outputPath", "") if latest_round else "",
        "lastTimestamp": latest_round.get("timestamp", "") if latest_round else "",
        "artifactStats": build_artifact_summary([item for item in rounds if isinstance(item, dict)]),
        "rounds": history_rounds,
    }


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
    record_context = _find_record_context_for_output(output_path)
    if record_context is not None:
        _, round_item = record_context
        compare_path = round_item.get("compare_path")
        if isinstance(compare_path, str) and compare_path.strip():
            return normalize_path(Path(compare_path))
    return get_round_compare_path(normalize_path(output_path))


def _find_manifest_path_for_output(output_path: Path) -> Path | None:
    record_context = _find_record_context_for_output(output_path)
    if record_context is None:
        return None
    _, round_item = record_context
    manifest_path = round_item.get("manifest_path")
    if not isinstance(manifest_path, str) or not manifest_path.strip():
        return None
    return normalize_path(Path(manifest_path))


def _find_body_map_path_for_output(output_path: Path) -> Path | None:
    record_context = _find_record_context_for_output(output_path)
    if record_context is None:
        return None
    _, round_item = record_context
    body_map_path = round_item.get("body_map_path")
    if not isinstance(body_map_path, str) or not body_map_path.strip():
        return None
    return normalize_path(Path(body_map_path))


def _find_validation_path_for_output(output_path: Path) -> Path | None:
    record_context = _find_record_context_for_output(output_path)
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
    return payload


def _load_manifest_for_compare(output_path: Path, compare_payload: dict[str, Any]):
    manifest_path: Path | None = None
    raw_manifest_path = compare_payload.get("manifestPath")
    if isinstance(raw_manifest_path, str) and raw_manifest_path.strip():
        manifest_path = normalize_path(Path(raw_manifest_path))
    if manifest_path is None:
        manifest_path = _find_manifest_path_for_output(output_path)
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
            return {
                "mode": "custom",
                "text": text,
                "source": str(decision.get("source", "")).strip(),
                "attempt": decision.get("attempt"),
                "candidate": decision.get("candidate"),
                "error": str(decision.get("error", "")).strip(),
            }
    return "source" if str(decision) == "source" else "rewrite"


def _select_review_text(input_text: Any, output_text: Any, decision: Any) -> str:
    source_text = input_text if isinstance(input_text, str) else ""
    rewrite_text = output_text if isinstance(output_text, str) else ""
    normalized_decision = _normalize_review_decision_value(decision)
    if isinstance(normalized_decision, dict):
        return str(normalized_decision.get("text", ""))
    return source_text if normalized_decision == "source" else rewrite_text


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
    for raw_chunk in raw_chunks:
        if not isinstance(raw_chunk, dict):
            continue
        chunk_id = str(raw_chunk.get("chunkId", "")).strip()
        if not chunk_id:
            continue
        input_text = raw_chunk.get("inputText", "")
        output_text = raw_chunk.get("outputText", "")
        selected_text = _select_review_text(input_text, output_text, (decisions or {}).get(chunk_id))
        chunk_results[chunk_id] = normalize_chunk_output(
            input_text if isinstance(input_text, str) else "",
            selected_text,
        )
    manifest_chunk_ids = [chunk.chunk_id for chunk in manifest.chunks]
    if not manifest_chunk_ids or any(chunk_id not in chunk_results for chunk_id in manifest_chunk_ids):
        return None
    restored_text = restore_text_from_chunks(manifest, chunk_results)
    paragraphs = split_text_to_paragraphs(restored_text)
    return paragraphs or None


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
        restored_paragraphs = _restore_paragraphs_from_compare_manifest(output_path, compare_payload)
        if restored_paragraphs is not None:
            return restored_paragraphs, "compare-manifest"
        raw_chunks = compare_payload.get("chunks")
        if isinstance(raw_chunks, list):
            paragraphs_by_index: dict[int, list[tuple[int, str]]] = {}
            for raw_chunk in raw_chunks:
                if not isinstance(raw_chunk, dict):
                    continue
                try:
                    paragraph_index = int(raw_chunk.get("paragraphIndex"))
                    chunk_index = int(raw_chunk.get("chunkIndex"))
                except (TypeError, ValueError):
                    continue
                input_text = raw_chunk.get("inputText", "")
                output_text = raw_chunk.get("outputText", "")
                if not isinstance(output_text, str):
                    continue
                normalized_output = normalize_chunk_output(
                    input_text if isinstance(input_text, str) else "",
                    output_text,
                )
                paragraphs_by_index.setdefault(paragraph_index, []).append((chunk_index, normalized_output))

            if paragraphs_by_index:
                paragraphs: list[str] = []
                for paragraph_index in sorted(paragraphs_by_index):
                    ordered_parts = [
                        text
                        for _, text in sorted(paragraphs_by_index[paragraph_index], key=lambda item: item[0])
                    ]
                    paragraphs.append("".join(part.strip() for part in ordered_parts if part.strip()).strip())
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
    restored_paragraphs = _restore_paragraphs_from_compare_manifest(output_path, compare_payload, decisions)
    if restored_paragraphs is not None:
        return restored_paragraphs

    paragraphs_by_index: dict[int, list[tuple[int, str]]] = {}
    for raw_chunk in raw_chunks:
        if not isinstance(raw_chunk, dict):
            continue
        chunk_id = str(raw_chunk.get("chunkId", "")).strip()
        try:
            paragraph_index = int(raw_chunk.get("paragraphIndex"))
            chunk_index = int(raw_chunk.get("chunkIndex"))
        except (TypeError, ValueError):
            continue
        input_text = raw_chunk.get("inputText", "")
        output_text = raw_chunk.get("outputText", "")
        selected_text = _select_review_text(input_text, output_text, decisions.get(chunk_id))
        normalized_text = normalize_chunk_output(
            input_text if isinstance(input_text, str) else "",
            selected_text,
        )
        paragraphs_by_index.setdefault(paragraph_index, []).append((chunk_index, normalized_text))

    if not paragraphs_by_index:
        raise ValueError("Review export did not find any selectable chunks.")

    return [
        "".join(text.strip() for _, text in sorted(paragraphs_by_index[paragraph_index], key=lambda item: item[0]) if text.strip()).strip()
        for paragraph_index in sorted(paragraphs_by_index)
    ]


def _round_model_key(prompt_profile: str, round_number: int) -> str:
    return f"{normalize_prompt_profile(prompt_profile)}:{int(round_number)}"


def _record_prompt_sequence_key(item: dict[str, Any], prompt_profile: str) -> str:
    if normalize_prompt_profile(prompt_profile) != "cn_custom":
        return ""
    sequence = item.get("prompt_sequence")
    if not isinstance(sequence, list):
        return ""
    return ",".join(str(value or "").strip().lower() for value in sequence if str(value or "").strip())


def _record_matches_prompt(
    item: dict[str, Any],
    prompt_profile: str,
    prompt_sequence: list[str],
) -> bool:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    if str(item.get("prompt_profile", "cn") or "cn").strip().lower() != normalized_profile:
        return False
    if normalized_profile != "cn_custom":
        return True
    return _record_prompt_sequence_key(item, normalized_profile) == ",".join(prompt_sequence)


def _resolve_round_model_config(model_config: dict[str, Any], prompt_profile: str, round_number: int) -> dict[str, Any]:
    base_config = dict(model_config)
    round_models = model_config.get("roundModels")
    if not isinstance(round_models, dict):
        return base_config
    override = round_models.get(_round_model_key(prompt_profile, round_number))
    if not isinstance(override, dict) or not bool(override.get("enabled", False)):
        return base_config
    resolved = dict(base_config)
    for key in (
        "providerId",
        "providerName",
        "baseUrl",
        "apiKey",
        "model",
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


def export_reviewed_round_output(
    output_path: str,
    export_path: str,
    target_format: str,
    decisions: dict[str, Any],
) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
    normalized_export_path = Path(export_path).resolve()
    normalized_export_path.parent.mkdir(parents=True, exist_ok=True)
    reviewed_paragraphs = _build_reviewed_paragraphs_from_compare(normalized_output_path, decisions)

    if target_format == "txt":
        normalized_export_path.write_text("\n\n".join(reviewed_paragraphs), encoding="utf-8")
        return {
            "format": "txt",
            "path": str(normalized_export_path),
            "layoutMode": "reviewed-text",
            "paragraphSource": "review-decisions",
        }

    if target_format != "docx":
        raise ValueError(f"Unsupported reviewed export format: {target_format}")

    origin_docx_bundle = _find_origin_docx_for_output(normalized_output_path)
    body_map = _load_body_map_for_output(normalized_output_path)
    validation_path = _find_validation_path_for_output(normalized_output_path)
    compare_payload = _load_compare_payload_for_output(normalized_output_path)
    guard_report: dict[str, Any] | None = None
    layout_mode = "reviewed-docx"
    paragraph_source = "review-decisions"
    if origin_docx_bundle is not None:
        source_docx_path, snapshot_path = origin_docx_bundle
        ensure_docx_processing_assets(source_docx_path, snapshot_path=snapshot_path)
        if body_map is not None:
            if compare_payload is not None:
                reviewed_paragraphs = _ensure_reviewed_paragraph_count_for_body_map(
                    normalized_output_path,
                    compare_payload,
                    reviewed_paragraphs,
                    len(body_map.units),
                    decisions,
                )
            reviewed_body_map = update_docx_body_map_texts(body_map, reviewed_paragraphs, round_number=body_map.round_number)
            validation_report = validate_docx_body_map(
                reviewed_body_map,
                source_path=source_docx_path,
                snapshot_path=snapshot_path,
            )
            blocking_issues = validation_report.get("blockingIssues", [])
            if isinstance(blocking_issues, list) and blocking_issues:
                issue_messages = [
                    str(item.get("message", "")).strip()
                    for item in blocking_issues
                    if isinstance(item, dict) and str(item.get("message", "")).strip()
                ]
                detail = "；".join(issue_messages[:3]).strip()
                raise ValueError(
                    "DOCX 审阅导出已拦截：审阅选择导致正文结构校验未通过。"
                    + (f" {detail}" if detail else "")
                )
            guard_report = run_docx_pre_export_guard(
                reviewed_body_map.current_texts(),
                source_path=source_docx_path,
                snapshot_path=snapshot_path,
                export_path=normalized_export_path,
                output_path=normalized_output_path,
                body_map=reviewed_body_map,
                compare_payload=compare_payload,
                decisions=decisions,
                mode="reviewed-docx",
                paragraph_source="review-decisions-body-map",
            )
            if not bool(guard_report.get("ok")):
                raise ValueError(summarize_docx_export_guard_failure(guard_report, label="审阅导出"))
            rebuild_docx_from_snapshot(
                reviewed_body_map.current_texts(),
                source_path=source_docx_path,
                snapshot_path=snapshot_path,
                export_path=normalized_export_path,
            )
            layout_mode = "reviewed-body-map-roundtrip"
        else:
            snapshot = _load_docx_snapshot(snapshot_path)
            expected_paragraph_count = snapshot.editable_unit_count if snapshot is not None else None
            if expected_paragraph_count is not None and len(reviewed_paragraphs) != expected_paragraph_count:
                raise ValueError(
                    "DOCX 审阅导出已拦截：审阅正文段落数与原始 Word 快照不一致。"
                    f" 预期 {expected_paragraph_count} 段，实际 {len(reviewed_paragraphs)} 段。"
                )
            guard_report = run_docx_pre_export_guard(
                reviewed_paragraphs,
                source_path=source_docx_path,
                snapshot_path=snapshot_path,
                export_path=normalized_export_path,
                output_path=normalized_output_path,
                compare_payload=compare_payload,
                decisions=decisions,
                mode="reviewed-docx",
                paragraph_source="review-decisions",
            )
            if not bool(guard_report.get("ok")):
                raise ValueError(summarize_docx_export_guard_failure(guard_report, label="审阅导出"))
            rebuild_docx_from_snapshot(
                reviewed_paragraphs,
                source_path=source_docx_path,
                snapshot_path=snapshot_path,
                export_path=normalized_export_path,
            )
            layout_mode = "reviewed-snapshot-reflow"
    else:
        write_docx_text(reviewed_paragraphs, normalized_export_path)
        layout_mode = "reviewed-plain-text-docx"

    text_fingerprint_before_format = _collect_docx_text_fingerprint(normalized_export_path)
    format_result = apply_school_format_rules(
        normalized_export_path,
        snapshot_path=origin_docx_bundle[1] if origin_docx_bundle is not None else None,
    )
    text_fingerprint_after_format = _collect_docx_text_fingerprint(normalized_export_path)
    if text_fingerprint_after_format != text_fingerprint_before_format:
        raise ValueError("DOCX 审阅导出已拦截：排版规则意外改变了文档文本内容。")

    audit_report_path = get_docx_audit_report_path(normalized_export_path)
    audit_report: dict[str, Any] | None = None
    if origin_docx_bundle is not None:
        audit_report = audit_docx_export(
            normalized_export_path,
            source_path=origin_docx_bundle[0],
            snapshot_path=origin_docx_bundle[1],
            report_path=audit_report_path,
        )
        if not bool(audit_report.get("ok")):
            issue_count = int(audit_report.get("issueCount", 0) or 0)
            raise ValueError(
                "DOCX 审阅导出已拦截：审计发现保护区内容发生变化。"
                f" 共 {issue_count} 个问题，报告：{audit_report_path}"
            )

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
        "preflightPath": str(format_result.get("preflightPath", "")),
        "preflightIssueCount": int(format_result.get("preflightIssueCount", 0) or 0),
        "guardPath": str(guard_report.get("reportPath", "")) if guard_report is not None else "",
        "guardIssueCount": int(guard_report.get("blockingIssueCount", 0) or 0) if guard_report is not None else 0,
    }


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
    prompt_profile: str = "cn",
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
    completed_rounds = [
        item.get("round")
        for item in rounds
        if isinstance(item, dict)
        and isinstance(item.get("round"), int)
        and _record_matches_prompt(item, normalized_prompt_profile, normalized_prompt_sequence)
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
        "maxRounds": get_max_rounds(normalized_prompt_profile, normalized_prompt_sequence),
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


def list_document_histories() -> dict[str, Any]:
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


HISTORY_ORPHAN_SCAN_DIRS: dict[str, Path] = {
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
    if len(parts) < 2 or parts[0] != "finish":
        return "external"
    if parts[1] == "web_exports":
        return "exports"
    if parts[1] == "detection_reports":
        return "reports"
    if normalized_path.name.endswith((".audit.json", ".guard.json", "_validation.json", "_format_preflight.json")):
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
    if _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["exports"]):
        return True
    if _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["reports"]):
        return normalized_path.suffix.lower() in {".pdf", ".json", ".txt"}
    if not _is_path_under(normalized_path, HISTORY_ORPHAN_SCAN_DIRS["intermediate"]):
        return False

    name = normalized_path.name
    if ROUND_ARTIFACT_PATTERN.search(name):
        return True
    if name.endswith(("_format_preflight.json", "_review_decisions.json")):
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
    records = list_records()
    for entry in records.values():
        if not isinstance(entry, dict):
            continue
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
        if kind in {"intermediate", "exports", "reports"}:
            stats[kind] += 1
        else:
            stats["external"] += 1
    return stats


def _build_kind_stats(entries: list[dict[str, Any]]) -> dict[str, dict[str, int]]:
    kind_stats = {
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
    if normalized_profile == "cn":
        artifact_stem = Path(doc_id).stem
    elif normalized_profile == "cn_custom":
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
            prompt_sequence=normalized_prompt_sequence if normalized_profile == "cn_custom" else None,
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
        prompt_sequence=normalize_prompt_sequence(normalized_profile, prompt_sequence) if normalized_profile == "cn_custom" else None,
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

    prompt_profile = normalize_prompt_profile(model_config.get("promptProfile", "cn_prewrite"))
    prompt_sequence = normalize_prompt_sequence(prompt_profile, model_config.get("promptSequence"))
    status = get_document_status(source_path, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    if bool(status.get("isComplete")):
        raise ValueError(f"Document already completed all {get_max_rounds(prompt_profile, prompt_sequence)} rounds.")
    effective_round = int(round_number or status.get("nextRound") or 1)
    effective_model_config = _resolve_round_model_config(model_config, prompt_profile, effective_round)

    base_url = str(effective_model_config.get("baseUrl", "")).strip()
    api_key = str(effective_model_config.get("apiKey", "")).strip()
    model = str(effective_model_config.get("model", "")).strip()
    api_type = str(effective_model_config.get("apiType", "chat_completions")).strip()
    temperature = float(effective_model_config.get("temperature", model_config.get("temperature", 0.7)) or 0.7)
    offline_mode = bool(model_config.get("offlineMode", False))
    rewrite_candidate_mode = normalize_rewrite_candidate_mode(model_config.get("rewriteCandidateMode", "economy"))
    request_timeout_seconds = _coerce_int_config(
        effective_model_config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS),
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=30,
        maximum=3600,
    )
    max_retries = _coerce_int_config(
        effective_model_config.get("maxRetries", DEFAULT_MAX_RETRIES),
        default=DEFAULT_MAX_RETRIES,
        minimum=0,
        maximum=10,
    )

    if not offline_mode and (not base_url or not api_key or not model):
        raise ValueError("Model configuration is incomplete.")

    if progress_callback is not None:
        progress_callback({
            "phase": "model-selected",
            "round": effective_round,
            "roundModel": {
                "providerName": str(effective_model_config.get("providerName", "")),
                "baseUrl": base_url,
                "model": model,
                "apiType": api_type,
                "temperature": temperature,
                "rateLimitWindowMinutes": _coerce_rate_window_minutes(effective_model_config),
                "rateLimitMaxRequests": _coerce_rate_max_requests(effective_model_config),
                "rewriteCandidateMode": rewrite_candidate_mode,
            },
        })

    def ensure_not_cancelled() -> None:
        if cancel_check is not None and cancel_check():
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")

    rate_limiter = _build_provider_rate_limiter(effective_model_config)

    if offline_mode:
        def transform(chunk_text: str, _: str, __: int, ___: str) -> str:
            ensure_not_cancelled()
            return chunk_text
    else:
        def transform(_: str, prompt_input: str, __: int, ___: str) -> str:
            ensure_not_cancelled()
            rate_limiter()
            ensure_not_cancelled()
            return llm_completion(
                prompt_input,
                model=model,
                api_key=api_key,
                base_url=base_url,
                api_type=api_type,
                temperature=temperature,
                timeout=request_timeout_seconds,
                max_retries=max_retries,
            )

    checkpoint_metadata = {
        "base_url": base_url,
        "model": model,
        "api_type": api_type,
        "temperature": temperature,
        "offline_mode": offline_mode,
        "prompt_profile": prompt_profile,
        "prompt_sequence": prompt_sequence,
        "round_model_key": _round_model_key(prompt_profile, effective_round),
        "round_model_provider": str(effective_model_config.get("providerName", "")),
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
        rewrite_candidate_mode=rewrite_candidate_mode,
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
        "offlineMode": offline_mode,
        "roundModel": {
            "round": effective_round,
            "providerName": str(effective_model_config.get("providerName", "")),
            "baseUrl": base_url,
            "model": model,
            "apiType": api_type,
            "temperature": temperature,
            "rateLimitWindowMinutes": _coerce_rate_window_minutes(effective_model_config),
            "rateLimitMaxRequests": _coerce_rate_max_requests(effective_model_config),
            "rewriteCandidateMode": rewrite_candidate_mode,
        },
        "promptSequence": prompt_sequence,
        "docEntry": result["doc_entry"],
        "roundContext": result["round_context"],
        "qualitySummary": result.get("quality_summary", {}),
    }


def test_model_connection(model_config: dict[str, Any]) -> dict[str, Any]:
    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    model = str(model_config.get("model", "")).strip()
    api_type = str(model_config.get("apiType", "chat_completions")).strip()
    offline_mode = bool(model_config.get("offlineMode", False))
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

    if offline_mode:
        return {
            "ok": True,
            "offlineMode": True,
            "message": "当前为离线模式，无需测试远程连通性。",
            "endpoint": "",
            "model": model,
        }

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
        "offlineMode": False,
        "message": "接口连通性测试成功。",
        **result,
    }
def list_available_models(model_config: dict[str, Any]) -> dict[str, Any]:
    base_url = str(model_config.get("baseUrl", "")).strip()
    api_key = str(model_config.get("apiKey", "")).strip()
    offline_mode = bool(model_config.get("offlineMode", False))
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

    if offline_mode:
        return {
            "ok": True,
            "offlineMode": True,
            "endpoint": "",
            "models": [],
            "total": 0,
            "message": "Offline mode is enabled, so remote model discovery is skipped.",
        }

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
        "offlineMode": False,
        "message": "Model catalog loaded successfully.",
        **result,
    }


def export_round_output(output_path: str, export_path: str, target_format: str) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
    normalized_export_path = Path(export_path).resolve()
    normalized_export_path.parent.mkdir(parents=True, exist_ok=True)
    if target_format == "txt":
        shutil.copyfile(normalized_output_path, normalized_export_path)
        return {
            "format": "txt",
            "path": str(normalized_export_path),
        }

    if target_format == "docx":
        origin_docx_bundle = _find_origin_docx_for_output(normalized_output_path)
        layout_mode = "plain_text_docx"
        paragraph_source = "text"
        validation_path = _find_validation_path_for_output(normalized_output_path)
        body_map = _load_body_map_for_output(normalized_output_path)
        compare_payload = _load_compare_payload_for_output(normalized_output_path)
        guard_report: dict[str, Any] | None = None
        if origin_docx_bundle is not None:
            source_docx_path, snapshot_path = origin_docx_bundle
            ensure_docx_processing_assets(
                source_docx_path,
                snapshot_path=snapshot_path,
            )
            if body_map is not None:
                validation_report = validate_docx_body_map(
                    body_map,
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                )
                blocking_issues = validation_report.get("blockingIssues", [])
                if isinstance(blocking_issues, list) and blocking_issues:
                    issue_messages = [
                        str(item.get("message", "")).strip()
                        for item in blocking_issues
                        if isinstance(item, dict) and str(item.get("message", "")).strip()
                    ]
                    detail = "；".join(issue_messages[:3]).strip()
                    if detail:
                        detail = f" {detail}"
                    raise ValueError(
                        "DOCX 导出已拦截：当前正文结构校验未通过，暂时不会生成可能错位的 Word。"
                        f"{detail} 请重新执行当前轮次，或回滚后重跑。"
                    )
                guard_report = run_docx_pre_export_guard(
                    body_map.current_texts(),
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                    export_path=normalized_export_path,
                    output_path=normalized_output_path,
                    body_map=body_map,
                    compare_payload=compare_payload,
                    mode="docx-export",
                    paragraph_source="body_map",
                )
                if not bool(guard_report.get("ok")):
                    raise ValueError(summarize_docx_export_guard_failure(guard_report, label="导出"))
                rebuild_docx_from_snapshot(
                    body_map.current_texts(),
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                    export_path=normalized_export_path,
                )
                layout_mode = "body-map-roundtrip"
                paragraph_source = "body_map"
            else:
                blocks, paragraph_source = _read_output_paragraphs_for_export(normalized_output_path)
                snapshot = _load_docx_snapshot(snapshot_path)
                expected_paragraph_count = (
                    snapshot.editable_unit_count
                    if snapshot is not None
                    else None
                )
                if expected_paragraph_count is not None and len(blocks) != expected_paragraph_count:
                    raise ValueError(
                        "DOCX 导出已拦截：当前轮次正文段落数与原始 Word 快照不一致。"
                        f" 预期 {expected_paragraph_count} 段，实际 {len(blocks)} 段。"
                        " 请重新执行当前轮次，或回滚后重跑，避免导出成错位排版。"
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
                    raise ValueError(summarize_docx_export_guard_failure(guard_report, label="导出"))
                rebuild_docx_from_snapshot(
                    blocks,
                    source_path=source_docx_path,
                    snapshot_path=snapshot_path,
                    export_path=normalized_export_path,
                )
                layout_mode = "snapshot-compare-reflow" if paragraph_source.startswith("compare") else "snapshot-roundtrip"
        else:
            blocks, paragraph_source = _read_output_paragraphs_for_export(normalized_output_path)
            write_docx_text(blocks, normalized_export_path)
        text_fingerprint_before_format = _collect_docx_text_fingerprint(normalized_export_path)
        format_result = apply_school_format_rules(
            normalized_export_path,
            snapshot_path=origin_docx_bundle[1] if origin_docx_bundle is not None else None,
        )
        text_fingerprint_after_format = _collect_docx_text_fingerprint(normalized_export_path)
        if text_fingerprint_after_format != text_fingerprint_before_format:
            raise ValueError("DOCX 导出已拦截：排版规则意外改变了文档文本内容。")
        audit_report_path = get_docx_audit_report_path(normalized_export_path)
        audit_report: dict[str, Any] | None = None
        if origin_docx_bundle is not None:
            audit_report = audit_docx_export(
                normalized_export_path,
                source_path=origin_docx_bundle[0],
                snapshot_path=origin_docx_bundle[1],
                report_path=audit_report_path,
            )
            if not bool(audit_report.get("ok")):
                issue_count = int(audit_report.get("issueCount", 0) or 0)
                raise ValueError(
                    "DOCX 导出已拦截：审计发现保护区内容发生变化。"
                    f" 共 {issue_count} 个问题，报告：{audit_report_path}"
                )
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
            "preflightPath": str(format_result.get("preflightPath", "")),
            "preflightIssueCount": int(format_result.get("preflightIssueCount", 0) or 0),
            "guardPath": str(guard_report.get("reportPath", "")) if guard_report is not None else "",
            "guardIssueCount": int(guard_report.get("blockingIssueCount", 0) or 0) if guard_report is not None else 0,
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


def read_output_text(output_path: str, max_chars: int | None = None) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
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
    normalized_output_path = normalize_path(Path(output_path))
    compare_path = _find_compare_path_for_output(normalized_output_path)
    if not compare_path.exists():
        raise ValueError(f"Compare data not found for output: {normalized_output_path}")
    payload = json.loads(compare_path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Invalid compare data payload: {compare_path}")
    return payload


def _find_review_decisions_path_for_output(output_path: Path) -> Path:
    compare_path = _find_compare_path_for_output(output_path)
    return compare_path.with_name(f"{compare_path.stem}_review_decisions.json")


def load_review_decisions(output_path: str) -> dict[str, Any]:
    normalized_output_path = normalize_path(Path(output_path))
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
    normalized_output_path = normalize_path(Path(output_path))
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
    offline_mode = bool(model_config.get("offlineMode", False))
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

    if not offline_mode and (not base_url or not api_key or not model):
        raise ValueError("Model configuration is incomplete.")

    if offline_mode:
        return (lambda chunk_text, _prompt_input, _round, _chunk_id: chunk_text), "offline"

    rate_limiter = _build_provider_rate_limiter(model_config)

    def transform(_chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
        rate_limiter()
        return llm_completion(
            prompt_input,
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type=api_type,
            temperature=temperature,
            timeout=request_timeout_seconds,
            max_retries=max_retries,
        )

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


def _is_external_detection_feedback(user_feedback: str) -> bool:
    return bool(re.search(r"(外部检测报告|检测报告|PaperPass|SpeedAI|AIGC|疑似度|风险片段)", str(user_feedback or ""), re.I))


def _looks_like_english_text(text: str) -> bool:
    letters = re.findall(r"[A-Za-z]", text or "")
    chinese = re.findall(r"[\u4e00-\u9fff]", text or "")
    return len(letters) >= 30 and len(letters) > len(chinese) * 2


def _short_evidence(text: str, patterns: list[str], limit: int = 90) -> str:
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if not match:
            continue
        start = max(0, match.start() - 24)
        end = min(len(text), match.end() + 48)
        return " ".join(text[start:end].split())[:limit]
    return ""


def _build_detection_surgery_feedback(
    input_text: str,
    previous_output_text: str,
    user_feedback: str,
) -> tuple[list[str], list[str], list[str], str]:
    if not _is_external_detection_feedback(user_feedback):
        return [], [], [], ""

    analysis_text = "\n".join(
        item for item in [previous_output_text.strip(), input_text.strip(), str(user_feedback or "").strip()] if item
    )
    cards: list[str] = []
    tags: list[str] = ["detector-surgery"]
    advice: list[str] = []
    note_lines = [
        "[DETECTOR MICRO-REPAIR MODE]",
        "- External AI-detection feedback is active, but this is targeted local repair, not a broad rewrite.",
        "- Do not make the paragraph smoother, more complete, or more explanatory by default.",
        "- Change only sentence openings, connector choices, word order, and a few template-like phrases where necessary.",
        "- Keep facts, numbers, citations, figure/table references, technical terms, paragraph role, and language unchanged.",
    ]

    def add_card(code: str, level: str, title: str, repair: str, evidence: str = "") -> None:
        card = f"- [{code} / {level}] {title}\n  Repair: {repair}"
        if evidence:
            card += f"\n  Evidence: {evidence}"
        cards.append(card)
        tags.append(code)
        advice.append(title)

    if _looks_like_english_text(input_text or previous_output_text):
        add_card(
            "detector-english-lock",
            "high",
            "英文段落只做英文改写，不能翻译成中文，也不能改成标准机器摘要腔。",
            "Keep the output fully English, keep the same claims and data, and only make small rhythm changes. Avoid generic thesis-summary phrases such as 'this thesis focuses on' when the source can be stated more concretely.",
            _short_evidence(analysis_text, [r"this thesis", r"important for", r"according to", r"the results show"]),
        )

    definition_patterns = [
        r"[\u4e00-\u9fffA-Za-z0-9\-]{2,30}\s*是.{0,40}(关键|核心|重要|基础|框架|方法|步骤|环节|工具|平台)",
        r"(是|属于|指|作为).{0,25}(关键|核心|重要|基础|框架|方法|步骤|工具)",
    ]
    if any(re.search(pattern, analysis_text) for pattern in definition_patterns):
        add_card(
            "de-definition",
            "high",
            "疑似百科式定义开头，容易被报告判成模板化解释。",
            "只微调“X 是……”这类开头，不要重写整段；可以改成从本文的数据处理、实验动作、系统页面或本段实际任务切入。",
            _short_evidence(analysis_text, definition_patterns),
        )

    encyclopedia_patterns = [
        r"(主要用于|广泛应用|具有较高的|能够在不依赖|提供.*(技术支撑|理论依据)|实际应用价值|工程落地潜力)",
        r"(研究意义|应用意义|理论价值|实践价值).{0,30}(重要|明显|较高|突出)",
    ]
    if any(re.search(pattern, analysis_text) for pattern in encyclopedia_patterns):
        add_card(
            "de-encyclopedia",
            "high",
            "疑似通用技术说明过多，像在解释概念而不是写本文。",
            "删除或替换少量泛泛介绍，把句子轻微落回“本文如何使用它、在哪个实验/模块/图表中出现、解决了什么具体处理问题”。",
            _short_evidence(analysis_text, encyclopedia_patterns),
        )

    enumeration_hits = len(re.findall(r"(首先|其次|随后|最后|第一|第二|第三|一方面|另一方面|与此同时|总体来看|整体来看)", analysis_text))
    if enumeration_hits >= 2:
        add_card(
            "break-neat-enumeration",
            "medium",
            "段落推进过于整齐，存在明显总分式机器节奏。",
            "保留逻辑顺序，只替换一小部分“首先/其次/最后”等连接方式，不要重排论证。",
            f"enumeration_hits={enumeration_hits}",
        )

    value_patterns = [
        r"(显著|明显|充分|极大|更好|有效).{0,20}(提升|提高|增强|改善|体现|展示)",
        r"(表达能力|预测效果|应用价值|工程落地|技术支撑|研究价值|应用意义|有效性与优越性)",
    ]
    if any(re.search(pattern, analysis_text) for pattern in value_patterns):
        add_card(
            "ground-value-claim",
            "medium",
            "抽象价值判断偏多，容易形成“正确但空”的 AI 论文腔。",
            "弱化少量“提升价值/提供支撑/体现意义”式判断，能贴近已有图表、数值、模块行为时再做轻微替换。",
            _short_evidence(analysis_text, value_patterns),
        )

    connector_hits = len(re.findall(r"(通过|对于.{0,12}而言|因此|同时|此外|也就是说|换句话说|从.{0,12}来看|基于|为了)", analysis_text))
    if connector_hits >= 5:
        add_card(
            "trim-mechanical-connectors",
            "medium",
            "连接词密度偏高，段落读起来过于顺滑和机械。",
            "只删除或替换一小部分套话连接词，让因果和递进更多依靠具体内容自然呈现。",
            f"connector_hits={connector_hits}",
        )

    result_patterns = [
        r"(图|表)\s*\d",
        r"(准确率|召回率|AUC|F1|F1-Score|实验结果|对比实验|特征重要性)",
        r"(LSTM|Bi-LSTM|XGBoost|Random Forest|Streamlit)",
        r"\d+\.\d+",
    ]
    if sum(1 for pattern in result_patterns if re.search(pattern, analysis_text, re.I)) >= 2:
        add_card(
            "ground-in-experiment",
            "high",
            "本段涉及实验/图表/系统实现，应贴近本文结果而不是泛化说明。",
            "围绕本段已有图表编号、模型名称、指标数值或系统模块做轻微表达调整；不要新增结论，不要升华成宽泛行业价值。",
            _short_evidence(analysis_text, result_patterns),
        )

    if not cards:
        add_card(
            "detector-local-naturalize",
            "medium",
            "报告命中但未识别到单一强模式，需要做局部外科式自然化。",
            "只改句式入口、连接方式和局部词序；避免新增背景解释，避免把段落写得更完整、更像标准答案。",
            "",
        )

    note_lines.append("- Detector repair focus:")
    note_lines.extend(f"  * {item}" for item in advice[:6])
    return _unique_strings(cards), _unique_strings(tags), _unique_strings(advice), "\n".join(note_lines)


def _build_compact_round_brief(
    prompt_profile: str,
    round_number: int,
    prompt_sequence: object | None = None,
) -> list[str]:
    normalized_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_profile, prompt_sequence)
    final_round = round_number >= get_max_rounds(normalized_profile, normalized_prompt_sequence)
    if normalized_profile == "cn_prewrite" and round_number == 1:
        return [
            "- 当前轮次是保守预改写：只做轻量自然化，不要大幅扩写。",
            "- 字数尽量贴近原文，段落角色、事实、术语和结论保持不变。",
        ]
    if final_round:
        return [
            "- 当前轮次偏向最终自然化：降低机械论文腔，但不能新增观点或改变逻辑。",
            "- 避免总分总模板、泛化价值判断和过于整齐的连接词节奏。",
        ]
    return [
        "- 当前轮次是主体改写：表达可以更自然、更具解释性，但不能偏离原文。",
        "- 控制长度，优先修正句式与节奏，不要写成总结、建议或答疑。",
    ]


def _build_rerun_candidate_note(candidate_index: int) -> str:
    if candidate_index <= 1:
        return "- Candidate 1: make the most direct repair according to the repair cards."
    if candidate_index == 2:
        return "- Candidate 2: use a visibly different sentence rhythm and avoid the previous output's opening and transition pattern."
    return "- Candidate 3: choose a more conservative version with tighter length control and fewer abstract template phrases."


def _build_targeted_validation_retry_note(validation_error: str) -> str:
    repair_steps = _build_validation_repair_steps(validation_error)
    sections = [
        "[TARGETED VALIDATION RETRY]",
        "- The previous targeted rerun candidate failed local hard validation.",
        "- Regenerate the same chunk and fix the validation problem directly.",
        "- Do not make broader changes just to avoid the error; keep the rewrite conservative.",
    ]
    if repair_steps:
        sections.append(repair_steps)
    sections.append(f"- Validation error: {validation_error.strip()}")
    return "\n".join(sections)


def _should_generate_rerun_candidates(chunk: dict[str, Any], input_text: str) -> bool:
    quality = chunk.get("quality") if isinstance(chunk.get("quality"), dict) else {}
    flags = quality.get("flags") if isinstance(quality, dict) else []
    flag_set = {str(flag) for flag in flags} if isinstance(flags, list) else set()
    if flag_set & {"machine_like_expression", "template_phrase_drift", "over_expanded", "over_compressed"}:
        return True
    return len(input_text.strip()) >= 180


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
    candidate_index: int,
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
            "[CANDIDATE DIRECTION]\n" + _build_rerun_candidate_note(candidate_index),
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
    rewrite_advice.insert(0, "可更换模型或补充更具体的人工反馈后再单独重跑；在通过硬校验前，不采用失败候选。")
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
    normalized_output_path = normalize_path(Path(output_path))
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

    prompt_profile = normalize_prompt_profile(compare_payload.get("promptProfile", model_config.get("promptProfile", "cn")))
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
    detector_cards, detector_tags, detector_advice, detector_note = _build_detection_surgery_feedback(
        input_text,
        previous_output_text,
        user_feedback,
    )
    if detector_cards:
        issue_cards = _unique_strings([*detector_cards, *issue_cards])
    if detector_note:
        rerun_note = f"{detector_note}\n\n{rerun_note}"
    strategy_tags = _unique_strings([*strategy_tags, *detector_tags])
    advice_items = _unique_strings([*detector_advice, *advice_items])
    if style_card:
        strategy_tags = _unique_strings([*strategy_tags, "global-style-card"])
        advice_items = _unique_strings([*advice_items, "重跑会参考全文高频连接词、模板句和重复开头，避免继续放大全文层面的机械感。"])
    needs_detector_candidates = _is_external_detection_feedback(user_feedback)
    candidate_count = 1 if mode == "offline" else (2 if needs_detector_candidates or _should_generate_rerun_candidates(target_chunk, input_text) else 1)
    valid_candidates: list[tuple[float, str, int]] = []
    candidate_errors: list[str] = []

    validation_retry_note: str | None = None
    used_fallback = False
    fallback_mode = ""
    fallback_detail = ""
    attempts_used = 0

    for validation_attempt in range(1, TARGETED_RERUN_VALIDATION_ATTEMPTS + 1):
        attempts_used = validation_attempt
        for candidate_index in range(1, candidate_count + 1):
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
                candidate_index=candidate_index,
                validation_retry_note=validation_retry_note,
            )
            try:
                raw_output = transform(protected_chunk.text, prompt_input, round_number, chunk_id)
                protected_output = normalize_chunk_output(protected_chunk.text, raw_output)
                validate_structure_placeholders(protected_output, protected_chunk.tokens, chunk_id)
                candidate_output = restore_structure_tokens(protected_output, protected_chunk.tokens)
                validate_chunk_output(input_text, candidate_output, chunk_id)
                score = _score_rewrite_candidate(input_text, candidate_output)
                if previous_output_text and candidate_output.strip() == previous_output_text:
                    score += 2.0
                valid_candidates.append((score, candidate_output, candidate_index))
            except Exception as exc:
                candidate_error = f"attempt {validation_attempt} candidate {candidate_index}: {exc}"
                candidate_errors.append(candidate_error)
                validation_retry_note = _build_targeted_validation_retry_note(str(exc))
        if valid_candidates:
            break

    if valid_candidates:
        selected_score, output_text, selected_candidate = min(valid_candidates, key=lambda item: item[0])
    else:
        fallback_detail = "; ".join(candidate_errors[-3:]) if candidate_errors else "no valid candidate"
        output_text, fallback_mode = _pick_targeted_fallback_text(input_text, previous_output_text, chunk_id)
        selected_score = 999.0
        selected_candidate = 0
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
    target_chunk["rerunCandidateCount"] = candidate_count
    target_chunk["rerunAttemptCount"] = attempts_used
    target_chunk["rerunSelectedCandidate"] = selected_candidate
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
                "candidateCount": candidate_count,
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
    status_parser.add_argument("prompt_profile", nargs="?", default="cn")

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
