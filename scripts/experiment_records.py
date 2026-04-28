from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
EXPERIMENT_DIR = ROOT_DIR / "finish" / "experiments"
EXPERIMENT_RECORDS_PATH = EXPERIMENT_DIR / "records.json"


def list_experiment_records(doc_id: str | None = None) -> dict[str, Any]:
    records = _load_records()
    if doc_id:
        records = [record for record in records if str(record.get("docId", "")) == doc_id]
    records.sort(key=lambda item: str(item.get("createdAt", "")), reverse=True)
    return {
        "items": records,
        "total": len(records),
        "path": str(EXPERIMENT_RECORDS_PATH.resolve()),
    }


def save_experiment_record(payload: dict[str, Any]) -> dict[str, Any]:
    records = _load_records()
    now = _now_iso()
    record_id = str(payload.get("id", "")).strip() or uuid.uuid4().hex
    existing_index = next((index for index, item in enumerate(records) if str(item.get("id", "")) == record_id), -1)
    existing = records[existing_index] if existing_index >= 0 else {}
    created_at = str(existing.get("createdAt") or payload.get("createdAt") or now)
    record = _normalize_record({**existing, **payload, "id": record_id, "createdAt": created_at, "updatedAt": now})
    if existing_index >= 0:
        records[existing_index] = record
    else:
        records.append(record)
    _save_records(records)
    return {"ok": True, "record": record, "path": str(EXPERIMENT_RECORDS_PATH.resolve())}


def delete_experiment_record(record_id: str) -> dict[str, Any]:
    normalized_id = str(record_id or "").strip()
    if not normalized_id:
        raise ValueError("recordId is required.")
    records = _load_records()
    next_records = [record for record in records if str(record.get("id", "")) != normalized_id]
    deleted = len(next_records) != len(records)
    _save_records(next_records)
    return {
        "ok": True,
        "deleted": deleted,
        "id": normalized_id,
        "total": len(next_records),
        "path": str(EXPERIMENT_RECORDS_PATH.resolve()),
    }


def _normalize_record(raw: dict[str, Any]) -> dict[str, Any]:
    speedai_before = _optional_float(raw.get("speedaiBefore"))
    speedai_after = _optional_float(raw.get("speedaiAfter"))
    paperpass_before = _optional_float(raw.get("paperpassBefore"))
    paperpass_after = _optional_float(raw.get("paperpassAfter"))
    round_number = _optional_int(raw.get("round"))
    chunk_count = _optional_int(raw.get("chunkCount"))
    review_chunk_count = _optional_int(raw.get("reviewChunkCount"))
    machine_like_risk_count = _optional_int(raw.get("machineLikeRiskCount"))
    estimated_api_calls = _optional_int(raw.get("estimatedApiCalls"))
    validation_retry_count = _optional_int(raw.get("validationRetryCount"))
    source_fallback_count = _optional_int(raw.get("sourceFallbackCount"))
    prompt_sequence = raw.get("promptSequence")
    if not isinstance(prompt_sequence, list):
        prompt_sequence = []

    return {
        "id": str(raw.get("id", "")).strip(),
        "createdAt": str(raw.get("createdAt", "")).strip(),
        "updatedAt": str(raw.get("updatedAt", "")).strip(),
        "docId": str(raw.get("docId", "")).strip(),
        "sourcePath": str(raw.get("sourcePath", "")).strip(),
        "outputPath": str(raw.get("outputPath", "")).strip(),
        "round": round_number,
        "promptProfile": str(raw.get("promptProfile", "")).strip(),
        "promptSequence": [str(item).strip() for item in prompt_sequence if str(item).strip()],
        "strategy": str(raw.get("strategy", "")).strip(),
        "model": str(raw.get("model", "")).strip(),
        "providerName": str(raw.get("providerName", "")).strip(),
        "roundModel": _sanitize_round_model(raw.get("roundModel")),
        "speedaiBefore": speedai_before,
        "speedaiAfter": speedai_after,
        "speedaiDelta": _score_delta(speedai_before, speedai_after),
        "paperpassBefore": paperpass_before,
        "paperpassAfter": paperpass_after,
        "paperpassDelta": _score_delta(paperpass_before, paperpass_after),
        "reportProvider": str(raw.get("reportProvider", "")).strip(),
        "reportOverall": _optional_float(raw.get("reportOverall")),
        "reportPath": str(raw.get("reportPath", "")).strip(),
        "chunkCount": chunk_count,
        "reviewChunkCount": review_chunk_count,
        "machineLikeRiskCount": machine_like_risk_count,
        "rewriteCandidateMode": _normalize_candidate_mode(raw.get("rewriteCandidateMode")),
        "estimatedApiCalls": estimated_api_calls,
        "validationRetryCount": validation_retry_count,
        "sourceFallbackCount": source_fallback_count,
        "guardIssueCount": _optional_int(raw.get("guardIssueCount")),
        "preflightIssueCount": _optional_int(raw.get("preflightIssueCount")),
        "auditIssueCount": _optional_int(raw.get("auditIssueCount")),
        "notes": str(raw.get("notes", "")).strip()[:3000],
    }


def _sanitize_round_model(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    return {
        "round": _optional_int(value.get("round")),
        "providerName": str(value.get("providerName", "")).strip(),
        "baseUrl": "",
        "model": str(value.get("model", "")).strip(),
        "apiType": str(value.get("apiType", "")).strip(),
        "temperature": _optional_float(value.get("temperature")),
    }


def _normalize_candidate_mode(value: Any) -> str:
    candidate = str(value or "").strip().lower()
    return candidate if candidate in {"economy", "quality"} else ""


def _score_delta(before: float | None, after: float | None) -> float | None:
    if before is None or after is None:
        return None
    return round(after - before, 3)


def _optional_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        normalized = float(value)
    except (TypeError, ValueError):
        return None
    if normalized < 0:
        return None
    return round(normalized, 3)


def _optional_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _load_records() -> list[dict[str, Any]]:
    if not EXPERIMENT_RECORDS_PATH.exists():
        return []
    try:
        data = json.loads(EXPERIMENT_RECORDS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, dict):
        return []
    raw_items = data.get("items")
    if not isinstance(raw_items, list):
        return []
    return [item for item in raw_items if isinstance(item, dict)]


def _save_records(records: list[dict[str, Any]]) -> None:
    EXPERIMENT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "updatedAt": _now_iso(),
        "items": records,
    }
    tmp_path = EXPERIMENT_RECORDS_PATH.with_suffix(".tmp")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp_path.replace(EXPERIMENT_RECORDS_PATH)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
