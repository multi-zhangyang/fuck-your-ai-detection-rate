"""Utility helpers for reading and writing AIGC reduction records.

This module maintains a JSON file under the workspace root `finish/` directory,
by default called `fyadr_records.json`.

The JSON structure is intentionally simple and stable so that other tools
or workflows can rely on it:

{
  "origin/毕业论文_原始_utf8.txt": {
    "origin_path": "origin/毕业论文_原始_utf8.txt",
    "rounds": [
      {
        "round": 1,
        "prompt": "prompts/rewrite-pass-1.md",
        "input_path": "origin/毕业论文_原始_utf8.txt",
        "output_path": "finish/intermediate/毕业论文_原始_utf8_round1.txt",
        "score_total": 38,
        "timestamp": "2026-03-27T10:01:23Z"
      }
    ]
  }
}

- The top-level keys are logical document identifiers, typically the
  relative path of the source file under `origin/`.
- Each document entry stores the original path and an ordered list of
    completed rounds (1, 2).
- Each round records which prompt was used, which file was the input,
  which file is the output, an optional checklist total score, and a
  timestamp in ISO 8601 format.

You can import this module from other Python code, or use the CLI:

  python scripts/fyadr_records.py show                # show all records
  python scripts/fyadr_records.py show origin/xxx.txt # show one document
  python scripts/fyadr_records.py update-round \
      origin/xxx.txt 1 prompts/rewrite-pass-1.md \
      origin/xxx.txt finish/intermediate/xxx_round1.txt \
      --score-total 38

The fyadr web pipeline should conceptually perform the same operations as
`update-round` whenever it finishes a single reduction round.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from prompt_library import (
    DEFAULT_PROMPT_PROFILE,
    LEGACY_PROMPT_PROFILE,
    get_default_prompt_profile,
    get_prompt_workflow_ids,
    list_prompt_workflows,
    is_prompt_sequence_customizable,
    normalize_prompt_profile,
    normalize_prompt_sequence,
    prompt_sequence_match_rank,
)

# Paths are computed relative to this file: scripts/ -> workspace root.
ROOT_DIR = Path(__file__).resolve().parents[1]
FINISH_DIR = ROOT_DIR / "finish"
RECORDS_PATH = FINISH_DIR / "fyadr_records.json"
DELETE_MODES = {"records_and_artifacts", "records_artifacts_and_source", "records_only", "exports_only"}
ORIGIN_DIR = ROOT_DIR / "origin"
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
WEB_EXPORTS_DIR = ROOT_DIR / "finish" / "web_exports"
_HISTORY_READY_LOCK = threading.RLock()
_HISTORY_READY_CACHE: Dict[str, Any] | None = None
_HISTORY_READY_CACHE_AT = 0.0
_HISTORY_GOVERNANCE_LOCK = threading.RLock()
_HISTORY_GOVERNANCE_CACHE: Dict[str, Any] | None = None
_HISTORY_GOVERNANCE_CACHE_AT = 0.0
_HISTORY_GOVERNANCE_CACHE_COMPACT = False


def _prompt_workflow_help() -> str:
    workflows = list_prompt_workflows()
    return ", ".join(f"{item['id']}={item['label']}" for item in workflows) or get_default_prompt_profile()
RECOVER_FIRST_HISTORY_ISSUE_CODES = {
    "sqlite_integrity_check_failed",
    "history_index_unreadable",
    "foreign_key_check_failed",
}


def _invalidate_history_ready_cache() -> None:
    global _HISTORY_READY_CACHE, _HISTORY_READY_CACHE_AT
    global _HISTORY_GOVERNANCE_CACHE, _HISTORY_GOVERNANCE_CACHE_AT, _HISTORY_GOVERNANCE_CACHE_COMPACT
    with _HISTORY_READY_LOCK:
        _HISTORY_READY_CACHE = None
        _HISTORY_READY_CACHE_AT = 0.0
    with _HISTORY_GOVERNANCE_LOCK:
        _HISTORY_GOVERNANCE_CACHE = None
        _HISTORY_GOVERNANCE_CACHE_AT = 0.0
        _HISTORY_GOVERNANCE_CACHE_COMPACT = False


@dataclass
class RoundRecord:
    """Single reduction round metadata for one document."""

    round: int
    prompt: str
    input_path: str
    output_path: str
    prompt_profile: str = DEFAULT_PROMPT_PROFILE
    prompt_sequence: Optional[List[str]] = None
    score_total: Optional[int] = None
    chunk_limit: Optional[int] = None
    input_segment_count: Optional[int] = None
    output_segment_count: Optional[int] = None
    manifest_path: Optional[str] = None
    compare_path: Optional[str] = None
    quality_path: Optional[str] = None
    body_map_path: Optional[str] = None
    validation_path: Optional[str] = None
    run_audit: Optional[Dict[str, Any]] = None
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = asdict(self)
        # Drop empty timestamp / None score to keep JSON clean.
        if not data.get("timestamp"):
            data.pop("timestamp", None)
        if data.get("score_total") is None:
            data.pop("score_total", None)
        if not data.get("prompt_sequence"):
            data.pop("prompt_sequence", None)
        if not data.get("run_audit"):
            data.pop("run_audit", None)
        return data


def _ensure_finish_dir() -> None:
    FINISH_DIR.mkdir(parents=True, exist_ok=True)


def _write_records_json(normalized_records: Dict[str, Any]) -> None:
    _ensure_finish_dir()
    text = json.dumps(normalized_records, ensure_ascii=False, indent=2, sort_keys=True)
    RECORDS_PATH.write_text(text, encoding="utf-8")


def load_records() -> Dict[str, Any]:
    """Load all AIGC records from the JSON file.

    Returns an empty dict if the file does not exist or is empty.
    """

    if not RECORDS_PATH.exists():
        return {}
    try:
        raw = RECORDS_PATH.read_text(encoding="utf-8")
    except OSError:
        return {}
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # If the JSON is corrupted, return empty instead of crashing.
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def save_records(records: Dict[str, Any]) -> None:
    """Persist normalized records through SQLite, then export the JSON backup."""

    normalized_records = normalize_records(records)
    records_hash = _records_hash(normalized_records)
    try:
        from fyadr_history_db import (
            check_history_index as _check_history_index,
            rebuild_history_index as _rebuild_history_index,
        )

        _rebuild_history_index(normalized_records, records_hash=records_hash)
        health = _check_history_index(normalized_records, records_hash=records_hash)
        if not bool(health.get("ok")):
            raise RuntimeError(f"SQLite history index is unhealthy after save_records: {health.get('issues', [])}")
        indexed_records = _load_records_from_history_index(records_hash)
        _write_records_json(indexed_records if indexed_records is not None else normalized_records)
        _invalidate_history_ready_cache()
    except Exception:
        from fyadr_history_db import (
            check_history_index as _check_history_index,
            rebuild_history_index as _rebuild_history_index,
        )

        _rebuild_history_index(normalized_records, records_hash=records_hash)
        health = _check_history_index(normalized_records, records_hash=records_hash, strict=True)
        if not bool(health.get("ok")):
            raise RuntimeError(f"SQLite history index is unhealthy after save_records retry: {health.get('issues', [])}")
        indexed_records = _load_records_from_history_index(records_hash)
        _write_records_json(indexed_records if indexed_records is not None else normalized_records)
        _invalidate_history_ready_cache()


def _records_hash(records: Dict[str, Any]) -> str:
    payload = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def sync_history_index(records: Dict[str, Any] | None = None, *, strict: bool = False) -> Dict[str, Any]:
    """Synchronize the SQLite sidecar index with normalized history records."""

    try:
        if records is None:
            indexed_records = _load_records_from_history_index()
            normalized_records = indexed_records if indexed_records is not None else normalize_records(load_records())
        else:
            normalized_records = normalize_records(records)
        records_hash = _records_hash(normalized_records)
        from fyadr_history_db import (  # Local import avoids making JSON storage depend on sqlite at import time.
            SCHEMA_VERSION,
            get_history_index_status as _get_history_index_status,
            rebuild_history_index as _rebuild_history_index,
        )

        status = _get_history_index_status()
        if (
            bool(status.get("exists"))
            and int(status.get("schemaVersion", 0) or 0) == SCHEMA_VERSION
            and str(status.get("recordsHash", "")) == records_hash
        ):
            status["rebuilt"] = False
            return status
        return _rebuild_history_index(normalized_records, records_hash=records_hash)
    except Exception as exc:
        if strict:
            raise
        return {
            "exists": False,
            "rebuilt": False,
            "error": str(exc),
        }


def rebuild_history_index(*, strict: bool = True) -> Dict[str, Any]:
    """Force a full SQLite history index rebuild."""

    normalized_records = load_records_normalized()
    try:
        from fyadr_history_db import rebuild_history_index as _rebuild_history_index

        result = _rebuild_history_index(normalized_records, records_hash=_records_hash(normalized_records))
        _invalidate_history_ready_cache()
        return result
    except Exception:
        if strict:
            raise
        return sync_history_index(normalized_records, strict=False)


def get_history_index_status(*, refresh: bool = True) -> Dict[str, Any]:
    """Return SQLite history index status, refreshing it from JSON by default."""

    if refresh:
        return sync_history_index(load_records_normalized(), strict=False)
    from fyadr_history_db import get_history_index_status as _get_history_index_status

    return _get_history_index_status()


def check_history_index(*, strict: bool = False) -> Dict[str, Any]:
    """Inspect SQLite history integrity without mutating records."""

    raw_records = load_records()
    normalized_json_records = normalize_records(raw_records)
    indexed_records = _load_records_from_history_index()
    if indexed_records is not None:
        normalized_records = indexed_records
    else:
        normalized_records = normalized_json_records
    records_hash = _records_hash(normalized_records) if normalized_records else ""
    from fyadr_history_db import check_history_index as _check_history_index

    report = _check_history_index(
        normalized_records if (indexed_records is not None or RECORDS_PATH.exists()) else None,
        records_hash=records_hash,
        strict=strict,
    )
    if indexed_records is not None and RECORDS_PATH.exists() and normalized_json_records != indexed_records:
        issues = list(report.get("issues", [])) if isinstance(report.get("issues"), list) else []
        issues.append({
            "code": "json_backup_stale",
            "severity": "warning",
            "message": "The JSON compatibility history file is stale compared with the SQLite primary history index.",
            "repairable": True,
            "recommendedAction": "history-db-repair",
        })
        error_count = sum(1 for issue in issues if isinstance(issue, dict) and issue.get("severity") == "error")
        warning_count = sum(1 for issue in issues if isinstance(issue, dict) and issue.get("severity") == "warning")
        report.update({
            "ok": error_count == 0,
            "issues": issues,
            "issueCount": len(issues),
            "errorCount": error_count,
            "warningCount": warning_count,
            "repairableIssueCount": sum(1 for issue in issues if isinstance(issue, dict) and bool(issue.get("repairable"))),
        })
    return report


def repair_history_index(*, strict: bool = True) -> Dict[str, Any]:
    """Repair SQLite history governance state from the primary index, or JSON when needed."""

    indexed_records = _load_records_from_history_index()
    if indexed_records is not None:
        normalized_records = normalize_records(indexed_records)
    else:
        raw_records = load_records()
        normalized_records = normalize_records(raw_records) if (raw_records or RECORDS_PATH.exists()) else {}

    try:
        from fyadr_history_db import repair_history_index as _repair_history_index

        result = _repair_history_index(normalized_records, records_hash=_records_hash(normalized_records))
        repaired_records = _load_records_from_history_index(_records_hash(normalized_records))
        _write_records_json(repaired_records if repaired_records is not None else normalized_records)
        _invalidate_history_ready_cache()
        return result
    except Exception:
        if strict:
            raise
        return check_history_index(strict=False)


def _history_issue_codes(report: Dict[str, Any]) -> set[str]:
    issues = report.get("issues") if isinstance(report.get("issues"), list) else []
    return {str(issue.get("code", "")) for issue in issues if isinstance(issue, dict) and str(issue.get("code", "")).strip()}


def _history_error_codes(report: Dict[str, Any]) -> set[str]:
    issues = report.get("issues") if isinstance(report.get("issues"), list) else []
    return {
        str(issue.get("code", ""))
        for issue in issues
        if isinstance(issue, dict)
        and str(issue.get("code", "")).strip()
        and str(issue.get("severity", "")) == "error"
    }


def _safe_history_governance_label(value: str) -> str:
    label = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in str(value or "").strip())
    return label[:80] or "auto"


def _refresh_json_backup_from_index() -> bool:
    indexed_records = _load_records_from_history_index()
    if indexed_records is None:
        return False
    normalized_indexed_records = normalize_records(indexed_records)
    if RECORDS_PATH.exists() and normalize_records(load_records()) == normalized_indexed_records:
        return False
    _write_records_json(normalized_indexed_records)
    return True


def ensure_history_index_ready(
    *,
    reason: str = "manual",
    recover: bool = True,
    repair: bool = True,
    refresh_json: bool = True,
    max_age_seconds: float = 0,
) -> Dict[str, Any]:
    """Make the SQLite history index usable, repairing only when diagnostics require it."""

    global _HISTORY_READY_CACHE, _HISTORY_READY_CACHE_AT

    with _HISTORY_READY_LOCK:
        now = time.monotonic()
        if max_age_seconds > 0 and _HISTORY_READY_CACHE is not None and now - _HISTORY_READY_CACHE_AT < max_age_seconds:
            cached = dict(_HISTORY_READY_CACHE)
            cached["cached"] = True
            return cached

        checked_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        actions: List[str] = []
        recovered: Dict[str, Any] | None = None
        repaired: Dict[str, Any] | None = None
        refresh_error = ""

        try:
            before = check_history_index(strict=False)
        except Exception as exc:
            before = {
                "ok": False,
                "error": str(exc),
                "issueCount": 1,
                "errorCount": 1,
                "warningCount": 0,
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

        after = before
        if bool(before.get("ok")):
            if refresh_json and "json_backup_stale" in _history_issue_codes(before):
                try:
                    if _refresh_json_backup_from_index():
                        actions.append("refresh-json-backup")
                    after = check_history_index(strict=False)
                except Exception as exc:
                    refresh_error = str(exc)
                    after = check_history_index(strict=False)
        else:
            error_codes = _history_error_codes(before)
            should_try_recovery = recover and bool(error_codes & RECOVER_FIRST_HISTORY_ISSUE_CODES)
            if should_try_recovery:
                recovered = recover_history_index(backup_path=None, keep=12)
                actions.append("recover-from-backup")
                after = check_history_index(strict=False)

            if not bool(after.get("ok")) and repair:
                repaired = repair_history_index(strict=False)
                actions.append("repair-index")
                after = check_history_index(strict=False)

            if bool(after.get("ok")) and refresh_json:
                try:
                    if _refresh_json_backup_from_index():
                        actions.append("refresh-json-backup")
                    after = check_history_index(strict=False)
                except Exception as exc:
                    refresh_error = str(exc)

        ok = bool(after.get("ok")) and int(after.get("errorCount", 0) or 0) == 0
        payload: Dict[str, Any] = {
            "ok": ok,
            "reason": reason,
            "checkedAt": checked_at,
            "actions": actions,
            "action": actions[-1] if actions else "none",
            "before": before,
            "after": after,
            "cached": False,
        }
        if recovered is not None:
            payload["recovery"] = recovered
        if repaired is not None:
            payload["repair"] = repaired
        if refresh_error:
            payload["refreshJsonError"] = refresh_error

        _HISTORY_READY_CACHE = payload
        _HISTORY_READY_CACHE_AT = time.monotonic()
        return payload


def ensure_history_governance_ready(
    *,
    reason: str = "app",
    max_age_seconds: float = 30,
    compact: bool = True,
    keep: int = 12,
) -> Dict[str, Any]:
    """Run the safe background history governance loop without deleting user files."""

    global _HISTORY_GOVERNANCE_CACHE, _HISTORY_GOVERNANCE_CACHE_AT, _HISTORY_GOVERNANCE_CACHE_COMPACT

    with _HISTORY_GOVERNANCE_LOCK:
        now = time.monotonic()
        cache_can_satisfy = _HISTORY_GOVERNANCE_CACHE is not None and (not compact or _HISTORY_GOVERNANCE_CACHE_COMPACT)
        if max_age_seconds > 0 and cache_can_satisfy and now - _HISTORY_GOVERNANCE_CACHE_AT < max_age_seconds:
            cached = dict(_HISTORY_GOVERNANCE_CACHE or {})
            cached["cached"] = True
            return cached

        checked_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        actions: List[str] = []
        compact_result: Dict[str, Any] | None = None
        compact_error = ""

        try:
            index_readiness = ensure_history_index_ready(reason=reason, max_age_seconds=0)
            actions.extend(str(item) for item in index_readiness.get("actions", []) if str(item).strip())
            before_summary = get_history_index_maintenance_summary()
            after_summary = before_summary
            policy = before_summary.get("policy") if isinstance(before_summary.get("policy"), dict) else {}
            should_compact = compact and bool(index_readiness.get("ok")) and bool(policy.get("shouldCompact"))
            if should_compact:
                try:
                    compact_result = compact_history_index(
                        create_backup=True,
                        keep=keep,
                        reason=f"auto_governance_{_safe_history_governance_label(reason)}",
                    )
                    if bool(compact_result.get("ok")):
                        actions.append("compact-index")
                    else:
                        compact_error = str(compact_result.get("error", "Automatic SQLite compaction failed."))
                finally:
                    after_summary = get_history_index_maintenance_summary()

            ok = bool(index_readiness.get("ok")) and not compact_error and (
                compact_result is None or bool(compact_result.get("ok"))
            )
            payload: Dict[str, Any] = {
                "ok": ok,
                "reason": reason,
                "checkedAt": checked_at,
                "actions": actions,
                "action": actions[-1] if actions else "none",
                "cached": False,
                "compactEnabled": bool(compact),
                "index": index_readiness,
                "before": before_summary,
                "after": after_summary,
                "compact": compact_result,
            }
            if compact_error:
                payload["compactError"] = compact_error
        except Exception as exc:
            payload = {
                "ok": False,
                "reason": reason,
                "checkedAt": checked_at,
                "actions": actions,
                "action": "failed",
                "cached": False,
                "compactEnabled": bool(compact),
                "error": str(exc),
            }

        _HISTORY_GOVERNANCE_CACHE = payload
        _HISTORY_GOVERNANCE_CACHE_AT = time.monotonic()
        _HISTORY_GOVERNANCE_CACHE_COMPACT = bool(compact)
        return payload


def _history_backup_dir_override() -> Path | None:
    raw_path = os.getenv("FYADR_HISTORY_BACKUP_DIR", "").strip()
    if not raw_path:
        return None
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = (ROOT_DIR / candidate).resolve()
    return candidate.resolve()


def list_history_index_backups(*, validate: bool = False) -> Dict[str, Any]:
    from fyadr_history_db import list_history_index_backups as _list_history_index_backups

    backup_dir = _history_backup_dir_override()
    return _list_history_index_backups(validate=validate, backup_dir=backup_dir) if backup_dir else _list_history_index_backups(validate=validate)


def backup_history_index(*, reason: str = "manual", keep: int = 12) -> Dict[str, Any]:
    from fyadr_history_db import backup_history_index as _backup_history_index

    backup_dir = _history_backup_dir_override()
    return _backup_history_index(reason=reason, keep=keep, backup_dir=backup_dir) if backup_dir else _backup_history_index(reason=reason, keep=keep)


def compact_history_index(*, create_backup: bool = True, keep: int = 12, reason: str = "manual") -> Dict[str, Any]:
    from fyadr_history_db import compact_history_index as _compact_history_index

    backup_dir = _history_backup_dir_override()
    result = (
        _compact_history_index(create_backup=create_backup, keep=keep, backup_dir=backup_dir, reason=reason)
        if backup_dir
        else _compact_history_index(create_backup=create_backup, keep=keep, reason=reason)
    )
    _invalidate_history_ready_cache()
    return result


def recover_history_index(*, backup_path: str | None = None, keep: int = 12) -> Dict[str, Any]:
    from fyadr_history_db import recover_history_index as _recover_history_index

    backup_dir = _history_backup_dir_override()
    result = (
        _recover_history_index(backup_path=backup_path, keep=keep, backup_dir=backup_dir)
        if backup_dir
        else _recover_history_index(backup_path=backup_path, keep=keep)
    )
    recovered_records = _load_records_from_history_index()
    if recovered_records is not None:
        _write_records_json(recovered_records)
        _invalidate_history_ready_cache()
    return result


def get_history_index_maintenance_summary() -> Dict[str, Any]:
    from fyadr_history_db import get_history_index_maintenance_summary as _get_history_index_maintenance_summary

    backup_dir = _history_backup_dir_override()
    return _get_history_index_maintenance_summary(backup_dir=backup_dir) if backup_dir else _get_history_index_maintenance_summary()


def apply_history_delete_maintenance(
    *,
    reason: str = "history_delete",
    documents_deleted: int = 0,
    rounds_deleted: int = 0,
    artifact_rows_deleted: int = 0,
    files_deleted: int = 0,
    keep: int = 12,
) -> Dict[str, Any]:
    from fyadr_history_db import apply_history_delete_maintenance as _apply_history_delete_maintenance

    backup_dir = _history_backup_dir_override()
    kwargs = {
        "reason": reason,
        "documents_deleted": documents_deleted,
        "rounds_deleted": rounds_deleted,
        "artifact_rows_deleted": artifact_rows_deleted,
        "files_deleted": files_deleted,
        "keep": keep,
    }
    if backup_dir:
        kwargs["backup_dir"] = backup_dir
    result = _apply_history_delete_maintenance(**kwargs)
    _invalidate_history_ready_cache()
    return result


def query_history_artifacts(filters: Dict[str, Any] | None = None, *, strict: bool = False) -> Dict[str, Any]:
    """Query SQLite history artifacts by document, round, kind, state, and size."""

    try:
        from fyadr_history_db import query_history_artifacts_from_index

        result = query_history_artifacts_from_index(filters or {}, strict=strict)
    except Exception:
        if strict:
            raise
        result = None
    if isinstance(result, dict):
        return result
    return {
        "ok": False,
        "source": "sqlite",
        "error": "SQLite history index is unavailable or stale.",
        "filters": filters or {},
        "items": [],
        "total": 0,
        "limit": 0,
        "offset": 0,
        "hasMore": False,
        "stats": _empty_history_artifact_stats(),
    }


def _save_document_record_transactional(records: Dict[str, Any], doc_id: str) -> Dict[str, Any]:
    normalized_records = normalize_records(records)
    normalized_doc_id = normalize_doc_id(doc_id)
    doc_entry = normalized_records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found after normalization: {normalized_doc_id}")

    records_hash = _records_hash(normalized_records)
    try:
        from fyadr_history_db import (
            check_history_index as _check_history_index,
            rebuild_history_index as _rebuild_history_index,
            upsert_document_record,
        )

        upsert_document_record(normalized_doc_id, doc_entry, records_hash=records_hash)
        health = _check_history_index(normalized_records, records_hash=records_hash)
        if not bool(health.get("ok")):
            _rebuild_history_index(normalized_records, records_hash=records_hash)
        indexed_records = _load_records_from_history_index(records_hash)
        if indexed_records is None:
            indexed_records = normalized_records
        _write_records_json(indexed_records)
        _invalidate_history_ready_cache()
        indexed_doc = indexed_records.get(normalized_doc_id)
        return indexed_doc if isinstance(indexed_doc, dict) else doc_entry
    except Exception:
        sync_history_index(normalized_records, strict=True)
        _write_records_json(normalized_records)
        _invalidate_history_ready_cache()
        return doc_entry


def _delete_document_record_transactional(records: Dict[str, Any], doc_id: str) -> Dict[str, Any]:
    normalized_records = normalize_records(records)
    normalized_doc_id = normalize_doc_id(doc_id)
    normalized_records.pop(normalized_doc_id, None)
    records_hash = _records_hash(normalized_records)
    try:
        from fyadr_history_db import (
            check_history_index as _check_history_index,
            delete_document_record,
            rebuild_history_index as _rebuild_history_index,
        )

        delete_document_record(normalized_doc_id, records_hash=records_hash)
        health = _check_history_index(normalized_records, records_hash=records_hash)
        if not bool(health.get("ok")):
            _rebuild_history_index(normalized_records, records_hash=records_hash)
        indexed_records = _load_records_from_history_index(records_hash)
        if indexed_records is None:
            indexed_records = normalized_records
        _write_records_json(indexed_records)
        _invalidate_history_ready_cache()
        return indexed_records
    except Exception:
        sync_history_index(normalized_records, strict=True)
        _write_records_json(normalized_records)
        _invalidate_history_ready_cache()
        return normalized_records


def _load_records_from_history_index(expected_hash: str | None = None) -> Dict[str, Any] | None:
    try:
        from fyadr_history_db import load_records_from_index

        indexed_records = load_records_from_index(expected_hash=expected_hash)
    except Exception:
        return None
    if not isinstance(indexed_records, dict):
        return None
    return normalize_records(indexed_records)


def _load_primary_records() -> Dict[str, Any]:
    indexed_records = _load_records_from_history_index()
    if indexed_records is not None:
        if normalize_records(load_records()) != indexed_records:
            _write_records_json(indexed_records)
        return indexed_records

    raw_records = load_records()
    normalized_records = normalize_records(raw_records)
    if normalized_records != raw_records:
        save_records(normalized_records)
        indexed_records = _load_records_from_history_index(_records_hash(normalized_records))
        return indexed_records if indexed_records is not None else normalized_records

    if normalized_records:
        save_records(normalized_records)
        indexed_records = _load_records_from_history_index(_records_hash(normalized_records))
        return indexed_records if indexed_records is not None else normalized_records
    return {}


def normalize_record_path(path: str) -> str:
    candidate = str(path or "").strip().replace("\\", "/")
    while "//" in candidate:
        candidate = candidate.replace("//", "/")
    return candidate


def normalize_doc_id(doc_id: str) -> str:
    return normalize_record_path(doc_id)


def _normalize_prompt_profile(value: Any) -> str:
    try:
        return normalize_prompt_profile(str(value or LEGACY_PROMPT_PROFILE))
    except ValueError:
        return LEGACY_PROMPT_PROFILE


def _normalize_prompt_sequence(value: Any, prompt_profile: str = DEFAULT_PROMPT_PROFILE) -> List[str]:
    try:
        return normalize_prompt_sequence(prompt_profile, value)
    except ValueError:
        return []


def _normalize_round_item(item: Dict[str, Any]) -> Dict[str, Any] | None:
    round_number = item.get("round")
    if not isinstance(round_number, int):
        return None

    normalized_item = dict(item)
    for field in (
        "prompt",
        "input_path",
        "output_path",
        "manifest_path",
        "compare_path",
        "quality_path",
        "body_map_path",
        "validation_path",
    ):
        value = normalized_item.get(field)
        if isinstance(value, str):
            normalized_item[field] = normalize_record_path(value)
    normalized_item["prompt_profile"] = _normalize_prompt_profile(normalized_item.get("prompt_profile", LEGACY_PROMPT_PROFILE))
    prompt_sequence = (
        _normalize_prompt_sequence(normalized_item.get("prompt_sequence"), normalized_item["prompt_profile"])
        if is_prompt_sequence_customizable(normalized_item["prompt_profile"])
        else []
    )
    if prompt_sequence:
        normalized_item["prompt_sequence"] = prompt_sequence
    else:
        normalized_item.pop("prompt_sequence", None)
    run_audit = normalized_item.get("run_audit")
    if isinstance(run_audit, dict):
        normalized_item["run_audit"] = _sanitize_run_audit(run_audit)
    else:
        normalized_item.pop("run_audit", None)
    return normalized_item


def _sanitize_run_audit(value: Dict[str, Any]) -> Dict[str, Any]:
    """Keep run audit metadata useful while stripping connection secrets."""

    allowed_fields = {
        "version",
        "providerName",
        "model",
        "apiType",
        "temperature",
        "requestTimeoutSeconds",
        "maxRetries",
        "rateLimitWindowMinutes",
        "rateLimitMaxRequests",
        "promptProfile",
        "promptSequence",
        "estimatedApiCalls",
        "chunkCount",
        "paragraphCount",
        "splitParagraphCount",
        "validationRetryCount",
        "sourceFallbackCount",
        "validationEventCount",
        "machineLikeRiskCount",
        "protectedTokenCount",
    }
    sanitized: Dict[str, Any] = {}
    for key in allowed_fields:
        item = value.get(key)
        if isinstance(item, (str, int, float, bool)) or item is None:
            sanitized[key] = item
        elif key == "promptSequence" and isinstance(item, list):
            sanitized[key] = [str(part).strip() for part in item if str(part).strip()][:3]
    return {key: item for key, item in sanitized.items() if item not in ("", None, [])}


def _round_record_key(item: Dict[str, Any]) -> tuple[str, str, int] | None:
    round_number = item.get("round")
    if not isinstance(round_number, int):
        return None
    prompt_profile = _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE))
    sequence_key = ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"), prompt_profile)) if is_prompt_sequence_customizable(prompt_profile) else ""
    return (prompt_profile, sequence_key, round_number)


def normalize_records(records: Dict[str, Any]) -> Dict[str, Any]:
    normalized_records: Dict[str, Any] = {}

    for raw_key, raw_entry in records.items():
        if not isinstance(raw_entry, dict):
            continue

        normalized_key = normalize_doc_id(str(raw_key))
        if not normalized_key:
            continue

        target_entry = normalized_records.setdefault(
            normalized_key,
            {"origin_path": normalized_key, "rounds": []},
        )
        target_rounds = target_entry.get("rounds")
        if not isinstance(target_rounds, list):
            target_rounds = []

        merged_by_round_profile: Dict[tuple[str, int], Dict[str, Any]] = {}
        for item in target_rounds:
            if not isinstance(item, dict):
                continue
            normalized_item = _normalize_round_item(item)
            if normalized_item is None:
                continue
            round_key = _round_record_key(normalized_item)
            if round_key is None:
                continue
            merged_by_round_profile[round_key] = normalized_item

        incoming_rounds = raw_entry.get("rounds")
        if not isinstance(incoming_rounds, list):
            incoming_rounds = []

        for item in incoming_rounds:
            if not isinstance(item, dict):
                continue
            normalized_item = _normalize_round_item(item)
            if normalized_item is None:
                continue
            round_key = _round_record_key(normalized_item)
            if round_key is None:
                continue
            merged_by_round_profile[round_key] = normalized_item

        target_entry["origin_path"] = normalize_record_path(str(raw_entry.get("origin_path", normalized_key))) or normalized_key
        target_entry["rounds"] = [
            merged_by_round_profile[key]
            for key in sorted(merged_by_round_profile, key=lambda item: (item[0], item[1], item[2]))
        ]

    return normalized_records


def load_records_normalized() -> Dict[str, Any]:
    return _load_primary_records()


def _record_path_to_absolute(path: str) -> Optional[Path]:
    normalized = normalize_record_path(path)
    if not normalized:
        return None
    candidate = Path(normalized)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate
    return candidate.resolve()


def _export_related_paths_for_output(output_path: Path) -> set[Path]:
    stem = output_path.stem
    paths: set[Path] = set()
    for export_stem in (stem, f"{stem}_reviewed"):
        for suffix in (".txt", ".docx", ".audit.json", ".guard.json"):
            paths.add((WEB_EXPORTS_DIR / f"{export_stem}{suffix}").resolve())
        paths.add((INTERMEDIATE_DIR / f"{export_stem}_format_preflight.json").resolve())
    return paths


def _derived_paths_for_output(output_path: Path) -> set[Path]:
    return {
        output_path.with_name(f"{output_path.stem}_checkpoint.json").resolve(),
        output_path.with_name(f"{output_path.stem}_compare.json").resolve(),
        output_path.with_name(f"{output_path.stem}_quality.json").resolve(),
        output_path.with_name(f"{output_path.stem}_bodymap.json").resolve(),
        output_path.with_name(f"{output_path.stem}_body_map.json").resolve(),
        output_path.with_name(f"{output_path.stem}_validation.json").resolve(),
        *_export_related_paths_for_output(output_path),
    }


def _collect_round_file_paths(rounds: List[Dict[str, Any]], *, include_exports: bool = True) -> set[Path]:
    collected: set[Path] = set()
    for item in rounds:
        if not isinstance(item, dict):
            continue
        for field in ("input_path", "output_path", "manifest_path", "compare_path", "quality_path", "body_map_path", "validation_path"):
            value = item.get(field)
            if not isinstance(value, str):
                continue
            absolute = _record_path_to_absolute(value)
            if absolute is not None:
                collected.add(absolute)
                if field == "output_path":
                    collected.update(_derived_paths_for_output(absolute) if include_exports else set())
    return collected


def _collect_round_export_paths(rounds: List[Dict[str, Any]]) -> set[Path]:
    collected: set[Path] = set()
    for item in rounds:
        if not isinstance(item, dict):
            continue
        value = item.get("output_path")
        if not isinstance(value, str):
            continue
        absolute = _record_path_to_absolute(value)
        if absolute is not None:
            collected.update(_export_related_paths_for_output(absolute))
    return collected


def _round_sql_filters(rounds: List[Dict[str, Any]]) -> list[Dict[str, Any]]:
    filters: list[Dict[str, Any]] = []
    for item in rounds:
        if not isinstance(item, dict) or not isinstance(item.get("round"), int):
            continue
        prompt_profile = _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE))
        sequence_key = ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"), prompt_profile)) if is_prompt_sequence_customizable(prompt_profile) else ""
        filters.append({
            "roundNumber": int(item["round"]),
            "promptProfile": prompt_profile,
            "promptSequenceKey": sequence_key,
        })
    return filters


def _is_export_related_artifact_path(path: Path) -> bool:
    normalized_path = path.resolve()
    try:
        normalized_path.relative_to(WEB_EXPORTS_DIR.resolve())
        return True
    except ValueError:
        pass
    try:
        normalized_path.relative_to(INTERMEDIATE_DIR.resolve())
    except ValueError:
        return False
    return normalized_path.name.endswith("_format_preflight.json")


def _collect_round_paths_from_history_index(
    doc_id: str,
    rounds: List[Dict[str, Any]],
    *,
    exports_only: bool = False,
) -> set[Path] | None:
    filters = _round_sql_filters(rounds)
    if not filters:
        return set()
    try:
        from fyadr_history_db import list_document_round_artifact_refs

        refs = list_document_round_artifact_refs(doc_id, filters)
    except Exception:
        return None
    if refs is None:
        return None
    paths: set[Path] = set()
    for ref in refs:
        raw_path = ref.get("path") if isinstance(ref, dict) else None
        if not isinstance(raw_path, str) or not raw_path.strip():
            continue
        absolute = _record_path_to_absolute(raw_path)
        if absolute is None:
            continue
        if exports_only and not _is_export_related_artifact_path(absolute):
            continue
        paths.add(absolute)
    return paths


def _is_safe_generated_artifact(path: Path) -> bool:
    try:
        relative = path.relative_to(ROOT_DIR)
    except ValueError:
        return False

    relative_parts = relative.parts
    if not relative_parts:
        return False

    if relative_parts[0] != "finish":
        return False

    if len(relative_parts) < 2:
        return False

    return relative_parts[1] in {"intermediate", "web_exports"}


def _is_safe_project_source(path: Path) -> bool:
    try:
        path.relative_to(ORIGIN_DIR)
    except ValueError:
        return False
    return path.is_file()


def _source_path_for_entry(doc_id: str, entry: Dict[str, Any]) -> Optional[Path]:
    raw_origin_path = entry.get("origin_path") if isinstance(entry, dict) else None
    source_path = _record_path_to_absolute(str(raw_origin_path or doc_id))
    return source_path.resolve() if source_path is not None else None


def _docx_processing_paths_for_source(source_path: Path) -> set[Path]:
    if source_path.suffix.lower() != ".docx":
        return set()
    return {
        (INTERMEDIATE_DIR / f"{source_path.stem}_docx_snapshot.json").resolve(),
        (INTERMEDIATE_DIR / f"{source_path.stem}_extracted.txt").resolve(),
        (INTERMEDIATE_DIR / f"{source_path.stem}_scope_diagnostics.json").resolve(),
    }


def _source_related_paths_for_entry(doc_id: str, entry: Dict[str, Any]) -> set[Path]:
    source_path = _source_path_for_entry(doc_id, entry)
    if source_path is None:
        return set()
    paths = _docx_processing_paths_for_source(source_path)
    if _is_safe_project_source(source_path):
        paths.add(source_path)
    return paths


def _collect_record_source_paths(records: Dict[str, Any]) -> set[Path]:
    paths: set[Path] = set()
    for doc_id, entry in records.items():
        if not isinstance(entry, dict):
            continue
        source_path = _source_path_for_entry(str(doc_id), entry)
        if source_path is not None:
            paths.add(source_path)
            paths.update(_docx_processing_paths_for_source(source_path))
    return paths


def _empty_history_artifact_stats() -> Dict[str, Any]:
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


def _merge_history_artifact_stats(*items: Dict[str, Any]) -> Dict[str, Any]:
    merged = _empty_history_artifact_stats()
    for item in items:
        if not isinstance(item, dict):
            continue
        for key in merged:
            value = item.get(key, 0)
            if isinstance(value, (int, float)):
                merged[key] += int(value)
    return merged


def _safe_delete_file(path: Path) -> tuple[str | None, Dict[str, str] | None, Dict[str, Any] | None]:
    entry = _history_delete_file_entry(path)
    if not entry.get("exists"):
        return None, None, None
    relative_path = str(entry.get("relativePath", str(path)))
    try:
        path.unlink()
    except OSError as exc:
        return None, {"path": relative_path, "message": str(exc)}, None
    return relative_path, None, entry


def _delete_source_related_paths_for_removed_entry(
    doc_id: str,
    deleted_entry: Dict[str, Any],
    retained_records: Dict[str, Any],
) -> tuple[List[str], List[Dict[str, str]], Dict[str, Any]]:
    retained_paths = _collect_record_source_paths(retained_records)
    removed_paths: List[str] = []
    failed_files: List[Dict[str, str]] = []
    removed_entries: List[Dict[str, Any]] = []
    for candidate in sorted(_source_related_paths_for_entry(doc_id, deleted_entry)):
        if candidate in retained_paths:
            continue
        if not (_is_safe_project_source(candidate) or _is_safe_generated_artifact(candidate)):
            continue
        if not candidate.exists() or not candidate.is_file():
            continue
        removed_path, failed_file, removed_entry = _safe_delete_file(candidate)
        if removed_path:
            removed_paths.append(removed_path)
        if failed_file:
            failed_files.append(failed_file)
        if removed_entry:
            removed_entries.append(removed_entry)
    return removed_paths, failed_files, _history_delete_stats_for_entries(removed_entries)


def _artifact_category(path: Path) -> str:
    try:
        relative = path.relative_to(ROOT_DIR)
    except ValueError:
        return "external"
    parts = relative.parts
    if not parts:
        return "external"
    if parts[0] == "origin":
        return "sources"
    if len(parts) < 2 or parts[0] != "finish":
        return "source"
    if parts[1] == "web_exports":
        return "exports"
    if path.name.endswith((".audit.json", ".guard.json", "_format_preflight.json", "_validation.json")):
        return "reports"
    return "intermediate"


def build_artifact_summary(rounds: List[Dict[str, Any]]) -> Dict[str, Any]:
    paths = _collect_round_file_paths([item for item in rounds if isinstance(item, dict)])
    counts = {
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
    for path in paths:
        if not _is_safe_generated_artifact(path):
            counts["external"] += 1
            continue
        category = _artifact_category(path)
        counts["total"] += 1
        if path.exists() and path.is_file():
            counts["existing"] += 1
            if category in counts:
                counts[category] += 1
            try:
                counts["bytes"] += path.stat().st_size
            except OSError:
                pass
        else:
            counts["missing"] += 1
    return counts


def _delete_artifacts_for_removed_rounds(
    deleted_rounds: List[Dict[str, Any]],
    retained_rounds: List[Dict[str, Any]],
    *,
    exports_only: bool = False,
) -> tuple[List[str], List[Dict[str, str]], Dict[str, Any]]:
    retained_paths = _collect_round_export_paths(retained_rounds) if exports_only else _collect_round_file_paths(retained_rounds)
    deleted_paths = _collect_round_export_paths(deleted_rounds) if exports_only else _collect_round_file_paths(deleted_rounds)
    removed_paths: List[str] = []
    failed_files: List[Dict[str, str]] = []
    removed_entries: List[Dict[str, Any]] = []

    for candidate in sorted(deleted_paths):
        if candidate in retained_paths:
            continue
        if not _is_safe_generated_artifact(candidate):
            continue
        if not candidate.exists() or not candidate.is_file():
            continue
        removed_path, failed_file, removed_entry = _safe_delete_file(candidate)
        if removed_path:
            removed_paths.append(removed_path)
        if failed_file:
            failed_files.append(failed_file)
        if removed_entry:
            removed_entries.append(removed_entry)

    return removed_paths, failed_files, _history_delete_stats_for_entries(removed_entries)


def _deleted_file_stats(removed_paths: List[str]) -> Dict[str, Any]:
    counts = {
        "total": len(removed_paths),
        "existing": len(removed_paths),
        "intermediate": 0,
        "exports": 0,
        "reports": 0,
        "sources": 0,
        "external": 0,
        "missing": 0,
        "bytes": 0,
    }
    for raw_path in removed_paths:
        absolute = _record_path_to_absolute(raw_path)
        if absolute is None:
            counts["external"] += 1
            continue
        category = _artifact_category(absolute)
        if category in counts:
            counts[category] += 1
    return counts


def _history_delete_file_entry(path: Path) -> Dict[str, Any]:
    normalized_path = path.resolve()
    category = _artifact_category(normalized_path)
    exists = normalized_path.exists() and normalized_path.is_file()
    size = 0
    if exists:
        try:
            size = normalized_path.stat().st_size
        except OSError:
            size = 0
    try:
        display_path = str(normalized_path.relative_to(ROOT_DIR)).replace("\\", "/")
    except ValueError:
        display_path = str(normalized_path)
    return {
        "path": str(normalized_path),
        "relativePath": display_path,
        "kind": category,
        "exists": exists,
        "bytes": size,
    }


def _history_delete_stats_for_entries(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts = {
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
    for entry in entries:
        counts["total"] += 1
        if bool(entry.get("exists")):
            counts["existing"] += 1
            counts["bytes"] += int(entry.get("bytes", 0) or 0)
            category = str(entry.get("kind", "external"))
            if category in counts:
                counts[category] += 1
            else:
                counts["external"] += 1
        else:
            counts["missing"] += 1
    return counts


def _round_filter(
    from_round: int,
    prompt_profile: str | None,
    prompt_sequence: Optional[List[str]],
) -> tuple[str | None, List[str] | None, str, Any]:
    normalized_prompt_profile = _normalize_prompt_profile(prompt_profile) if prompt_profile is not None else None
    normalized_prompt_sequence = (
        _normalize_prompt_sequence(prompt_sequence, normalized_prompt_profile)
        if normalized_prompt_profile is not None and is_prompt_sequence_customizable(normalized_prompt_profile) and prompt_sequence is not None
        else None
    )
    normalized_sequence_key = ",".join(normalized_prompt_sequence or [])

    def round_matches(item: Dict[str, Any]) -> bool:
        if not isinstance(item.get("round"), int) or item.get("round") < from_round:
            return False
        if normalized_prompt_profile is None:
            return True
        if _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE)) != normalized_prompt_profile:
            return False
        if normalized_prompt_sequence is None:
            return True
        return _record_sequence_covers_selected_route(item, normalized_prompt_profile, normalized_prompt_sequence)

    return normalized_prompt_profile, normalized_prompt_sequence, normalized_sequence_key, round_matches


def _record_sequence_covers_selected_route(item: Dict[str, Any], prompt_profile: str, selected_sequence: Optional[List[str]]) -> bool:
    if selected_sequence is None or not is_prompt_sequence_customizable(prompt_profile):
        return True
    return prompt_sequence_match_rank(
        item.get("prompt_sequence"),
        selected_sequence,
        int(item.get("round", 0) or 0),
    ) >= 0


def _build_delete_impact(
    *,
    doc_id: str,
    entry: Dict[str, Any],
    deleted_rounds: List[Dict[str, Any]],
    retained_rounds: List[Dict[str, Any]],
    mode: str,
    records_after: Dict[str, Any],
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if mode == "exports_only":
        candidate_paths = _collect_round_paths_from_history_index(doc_id, deleted_rounds, exports_only=True)
        if candidate_paths is None:
            candidate_paths = _collect_round_export_paths(deleted_rounds)
    elif mode == "records_only":
        candidate_paths = set()
    else:
        retained_paths = _collect_round_paths_from_history_index(doc_id, retained_rounds)
        if retained_paths is None:
            retained_paths = _collect_round_file_paths(retained_rounds)
        deleted_paths = _collect_round_paths_from_history_index(doc_id, deleted_rounds)
        if deleted_paths is None:
            deleted_paths = _collect_round_file_paths(deleted_rounds)
        candidate_paths = {
            path
            for path in deleted_paths
            if path not in retained_paths and _is_safe_generated_artifact(path)
        }
        if mode == "records_artifacts_and_source" and not retained_rounds:
            retained_source_paths = _collect_record_source_paths(records_after)
            candidate_paths.update(
                path
                for path in _source_related_paths_for_entry(doc_id, entry)
                if path not in retained_source_paths
                and (_is_safe_project_source(path) or _is_safe_generated_artifact(path))
            )

    entries = [
        _history_delete_file_entry(path)
        for path in sorted(candidate_paths, key=lambda item: str(item).lower())
    ]
    existing_entries = [entry for entry in entries if bool(entry.get("exists"))]
    affected_rounds = sorted({
        int(item["round"])
        for item in deleted_rounds
        if isinstance(item, dict) and isinstance(item.get("round"), int)
    })
    warnings: list[str] = []
    source_path = _source_path_for_entry(doc_id, entry)
    source_owned = bool(source_path and _is_safe_project_source(source_path))
    will_delete_source = any(str(file.get("kind")) == "sources" for file in existing_entries)
    if mode == "records_artifacts_and_source" and source_path is not None and not source_owned:
        warnings.append("源文档不在项目 origin 目录内，后端不会删除外部本地文件。")
    if mode == "records_only" and deleted_rounds:
        warnings.append("只移除历史索引会让原生成文件变成未归属产物，后续可在孤儿清理中处理。")

    return {
        "docId": doc_id,
        "mode": mode,
        "fromRound": from_round,
        "promptProfile": prompt_profile,
        "promptSequence": prompt_sequence or [],
        "affectedRounds": affected_rounds,
        "willDeleteRounds": mode not in {"records_only", "exports_only"},
        "willRemoveDocument": not retained_rounds and mode != "exports_only",
        "willDeleteSource": will_delete_source,
        "sourceOwnedByProject": source_owned,
        "sourcePath": str(source_path) if source_path is not None else "",
        "fileStats": _history_delete_stats_for_entries(existing_entries),
        "candidateStats": _history_delete_stats_for_entries(entries),
        "files": existing_entries[:80],
        "hasMoreFiles": len(existing_entries) > 80,
        "warnings": warnings,
    }


def preview_delete_document(
    doc_id: str,
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
    mode: str | None = None,
) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")
    rounds = doc_entry.get("rounds") if isinstance(doc_entry.get("rounds"), list) else []
    target_rounds = [item for item in rounds if isinstance(item, dict)]

    if from_round is None:
        retained_rounds: List[Dict[str, Any]] = target_rounds if normalized_mode == "exports_only" else []
        records_after = dict(records)
        if normalized_mode != "exports_only":
            records_after.pop(normalized_doc_id, None)
        return _build_delete_impact(
            doc_id=normalized_doc_id,
            entry=doc_entry,
            deleted_rounds=target_rounds,
            retained_rounds=retained_rounds,
            mode=normalized_mode,
            records_after=records_after,
        )

    normalized_prompt_profile, normalized_prompt_sequence, _, round_matches = _round_filter(
        from_round,
        prompt_profile,
        prompt_sequence,
    )
    deleted_rounds = [item for item in target_rounds if round_matches(item)]
    if not deleted_rounds:
        suffix = f" under prompt profile {normalized_prompt_profile}" if normalized_prompt_profile else ""
        raise ValueError(f"No rounds found from round {from_round} for: {normalized_doc_id}{suffix}")
    retained_rounds = [
        item
        for item in target_rounds
        if normalized_mode == "exports_only" or not round_matches(item)
    ]
    records_after = dict(records)
    if normalized_mode != "exports_only":
        if retained_rounds:
            next_entry = dict(doc_entry)
            next_entry["rounds"] = retained_rounds
            records_after[normalized_doc_id] = next_entry
        else:
            records_after.pop(normalized_doc_id, None)
    return _build_delete_impact(
        doc_id=normalized_doc_id,
        entry=doc_entry,
        deleted_rounds=deleted_rounds,
        retained_rounds=retained_rounds,
        mode=normalized_mode,
        records_after=records_after,
        from_round=from_round,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
    )


def update_round(
    doc_id: str,
    round_number: int,
    prompt: str,
    prompt_profile: str,
    input_path: str,
    output_path: str,
    score_total: Optional[int] = None,
    chunk_limit: Optional[int] = None,
    input_segment_count: Optional[int] = None,
    output_segment_count: Optional[int] = None,
    manifest_path: Optional[str] = None,
    compare_path: Optional[str] = None,
    quality_path: Optional[str] = None,
    body_map_path: Optional[str] = None,
    validation_path: Optional[str] = None,
    prompt_sequence: Optional[List[str]] = None,
    run_audit: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update (or create) the record for a single document round.

    If a record for the same document and round already exists, it will be
    replaced. Otherwise it will be appended to the rounds list.

    Returns the updated document record.
    """

    normalized_doc_id = normalize_doc_id(doc_id)
    records = load_records_normalized()

    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        doc_entry = {"origin_path": normalized_doc_id, "rounds": []}

    rounds = doc_entry.get("rounds")
    if not isinstance(rounds, list):
        rounds = []

    normalized_prompt_profile = _normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = _normalize_prompt_sequence(prompt_sequence, normalized_prompt_profile) if is_prompt_sequence_customizable(normalized_prompt_profile) else []
    normalized_sequence_key = ",".join(normalized_prompt_sequence)

    # Remove any existing entry for the same round under the same prompt profile.
    filtered_rounds: List[Dict[str, Any]] = [
        r
        for r in rounds
        if not (
            isinstance(r, dict)
            and r.get("round") == round_number
            and _normalize_prompt_profile(r.get("prompt_profile", LEGACY_PROMPT_PROFILE)) == normalized_prompt_profile
            and (
                not is_prompt_sequence_customizable(normalized_prompt_profile)
                or ",".join(_normalize_prompt_sequence(r.get("prompt_sequence"), normalized_prompt_profile)) == normalized_sequence_key
            )
        )
    ]

    record = RoundRecord(
        round=round_number,
        prompt=normalize_record_path(prompt),
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence or None,
        input_path=normalize_record_path(input_path),
        output_path=normalize_record_path(output_path),
        score_total=score_total,
        chunk_limit=chunk_limit,
        input_segment_count=input_segment_count,
        output_segment_count=output_segment_count,
        manifest_path=normalize_record_path(manifest_path) if manifest_path else None,
        compare_path=normalize_record_path(compare_path) if compare_path else None,
        quality_path=normalize_record_path(quality_path) if quality_path else None,
        body_map_path=normalize_record_path(body_map_path) if body_map_path else None,
        validation_path=normalize_record_path(validation_path) if validation_path else None,
        run_audit=_sanitize_run_audit(run_audit) if isinstance(run_audit, dict) else None,
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )

    filtered_rounds.append(record.to_dict())
    # Keep rounds grouped by prompt profile, then sorted by round number.
    filtered_rounds.sort(
        key=lambda item: (
            _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE)) if isinstance(item, dict) else LEGACY_PROMPT_PROFILE,
            ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"), _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE))))
            if isinstance(item, dict) and is_prompt_sequence_customizable(_normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE)))
            else "",
            int(item.get("round", 0)) if isinstance(item, dict) else 0,
        )
    )

    doc_entry["origin_path"] = normalized_doc_id
    doc_entry["rounds"] = filtered_rounds
    records[normalized_doc_id] = doc_entry

    return _save_document_record_transactional(records, normalized_doc_id)


def list_records() -> Dict[str, Any]:
    return _load_primary_records()


def list_referenced_history_artifact_paths() -> List[str] | None:
    """Return artifact paths referenced by the SQLite history index."""

    # Ensure the index reflects the current compatibility JSON before using it
    # for cleanup governance.
    list_records()
    try:
        from fyadr_history_db import list_referenced_artifact_paths

        return list_referenced_artifact_paths()
    except Exception:
        return None


def _normalize_delete_mode(mode: str | None) -> str:
    normalized = str(mode or "records_and_artifacts").strip().lower()
    if normalized not in DELETE_MODES:
        raise ValueError(f"Unsupported delete mode: {mode}")
    return normalized


def _history_delete_backup_reason(prefix: str, doc_id: str) -> str:
    safe_doc = Path(normalize_doc_id(doc_id)).stem or "document"
    return f"{prefix}_{safe_doc}"


def _prepare_history_delete_backup(reason: str, mode: str) -> Dict[str, Any]:
    if mode == "exports_only":
        return {"ok": True, "skipped": True, "reason": "exports_only", "message": "No SQLite record mutation."}
    try:
        from fyadr_history_db import backup_history_index as _backup_history_index
        from fyadr_history_db import get_history_index_status as _get_history_index_status

        status = _get_history_index_status()
        if not bool(status.get("exists")):
            return {"ok": True, "skipped": True, "reason": "db_missing", "message": "SQLite history index is not present."}
        backup_dir = _history_backup_dir_override()
        backup = (
            _backup_history_index(reason=reason, keep=12, backup_dir=backup_dir)
            if backup_dir
            else _backup_history_index(reason=reason, keep=12)
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to create SQLite history backup before deleting history: {exc}") from exc
    if not bool(backup.get("ok")):
        raise RuntimeError(f"Failed to create SQLite history backup before deleting history: {backup.get('error', 'backup validation failed')}")
    return backup


def _finalize_history_delete_maintenance(result: Dict[str, Any], backup: Dict[str, Any], reason: str) -> Dict[str, Any]:
    if str(result.get("mode", "")) == "exports_only":
        return {
            "backup": backup,
            "policy": {"ok": True, "skipped": True, "reason": "exports_only", "message": "No SQLite record mutation."},
        }
    try:
        policy = apply_history_delete_maintenance(
            reason=reason,
            documents_deleted=1 if bool(result.get("removedDocument")) else 0,
            rounds_deleted=len(result.get("deletedRounds", []) if isinstance(result.get("deletedRounds"), list) else []),
            files_deleted=len(result.get("deletedFiles", []) if isinstance(result.get("deletedFiles"), list) else []),
        )
    except Exception as exc:
        policy = {"ok": False, "error": str(exc)}
    return {
        "backup": backup,
        "policy": policy,
    }


def delete_rounds(
    doc_id: str,
    from_round: int,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
    mode: str | None = None,
) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    impact = preview_delete_document(
        normalized_doc_id,
        from_round,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
        mode=normalized_mode,
    )
    maintenance_reason = _history_delete_backup_reason("pre_delete_rounds", normalized_doc_id)
    maintenance_backup = _prepare_history_delete_backup(maintenance_reason, normalized_mode)
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")

    rounds = doc_entry.get("rounds")
    if not isinstance(rounds, list):
        rounds = []

    normalized_prompt_profile, normalized_prompt_sequence, _, round_matches = _round_filter(
        from_round,
        prompt_profile,
        prompt_sequence,
    )

    deleted_rounds = [
        item for item in rounds
        if isinstance(item, dict)
        and round_matches(item)
    ]
    if not deleted_rounds:
        suffix = f" under prompt profile {normalized_prompt_profile}" if normalized_prompt_profile else ""
        raise ValueError(f"No rounds found from round {from_round} for: {normalized_doc_id}{suffix}")

    if normalized_mode == "exports_only":
        retained_export_rounds = [
            item
            for item in rounds
            if isinstance(item, dict) and not round_matches(item)
        ]
        removed_files, failed_files, deleted_file_stats = _delete_artifacts_for_removed_rounds(
            deleted_rounds,
            retained_export_rounds,
            exports_only=True,
        )
        remaining_rounds_for_response = [
            item
            for item in rounds
            if isinstance(item, dict)
            and (
                normalized_prompt_profile is None
                or (
                    _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE)) == normalized_prompt_profile
                    and (
                        normalized_prompt_sequence is None
                        or _record_sequence_covers_selected_route(item, normalized_prompt_profile, normalized_prompt_sequence)
                    )
                )
            )
        ]
        result = {
            "docId": normalized_doc_id,
            "mode": normalized_mode,
            "affectedRounds": sorted({
                int(item["round"])
                for item in deleted_rounds
                if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "deletedRounds": [],
            "remainingRounds": sorted({
                int(item["round"])
                for item in remaining_rounds_for_response
                if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "removedDocument": False,
            "deletedFiles": removed_files,
            "deletedFileStats": deleted_file_stats,
            "failedFiles": failed_files,
        }
        if normalized_prompt_profile is not None:
            result["promptProfile"] = normalized_prompt_profile
        if normalized_prompt_sequence is not None:
            result["promptSequence"] = normalized_prompt_sequence
        result["historyMaintenance"] = _finalize_history_delete_maintenance(result, maintenance_backup, maintenance_reason)
        return result

    remaining_rounds = [
        item for item in rounds
        if not (
            isinstance(item, dict)
            and round_matches(item)
        )
    ]

    if remaining_rounds:
        doc_entry["origin_path"] = normalized_doc_id
        doc_entry["rounds"] = remaining_rounds
        records[normalized_doc_id] = doc_entry
        _save_document_record_transactional(records, normalized_doc_id)
    else:
        records.pop(normalized_doc_id, None)
        records = _delete_document_record_transactional(records, normalized_doc_id)

    failed_files: List[Dict[str, str]] = []
    deleted_file_stats = _empty_history_artifact_stats()
    if normalized_mode == "records_only":
        removed_files: List[str] = []
    else:
        removed_files, failed_files, deleted_file_stats = _delete_artifacts_for_removed_rounds(deleted_rounds, remaining_rounds)
    if normalized_mode == "records_artifacts_and_source" and not remaining_rounds:
        source_removed_files, source_failed_files, source_deleted_file_stats = _delete_source_related_paths_for_removed_entry(
            normalized_doc_id,
            doc_entry,
            records,
        )
        removed_files.extend(source_removed_files)
        failed_files.extend(source_failed_files)
        deleted_file_stats = _merge_history_artifact_stats(deleted_file_stats, source_deleted_file_stats)
    remaining_rounds_for_response = remaining_rounds
    if normalized_prompt_profile is not None:
        remaining_rounds_for_response = [
            item
            for item in remaining_rounds
            if isinstance(item, dict)
            and _normalize_prompt_profile(item.get("prompt_profile", LEGACY_PROMPT_PROFILE)) == normalized_prompt_profile
            and (
                normalized_prompt_sequence is None
                or _record_sequence_covers_selected_route(item, normalized_prompt_profile, normalized_prompt_sequence)
            )
        ]

    result = {
        "docId": normalized_doc_id,
        "mode": normalized_mode,
        "affectedRounds": sorted({
            int(item["round"])
            for item in deleted_rounds
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "deletedRounds": sorted({
            int(item["round"])
            for item in deleted_rounds
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "remainingRounds": sorted({
            int(item["round"])
            for item in remaining_rounds_for_response
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "removedDocument": not remaining_rounds,
        "deletedFiles": removed_files,
        "deletedFileStats": deleted_file_stats,
        "failedFiles": failed_files,
    }
    if normalized_prompt_profile is not None:
        result["promptProfile"] = normalized_prompt_profile
    if normalized_prompt_sequence is not None:
        result["promptSequence"] = normalized_prompt_sequence
    result["historyMaintenance"] = _finalize_history_delete_maintenance(result, maintenance_backup, maintenance_reason)
    return result


def delete_document(doc_id: str, mode: str | None = None) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    impact = preview_delete_document(normalized_doc_id, mode=normalized_mode)
    maintenance_reason = _history_delete_backup_reason("pre_delete_document", normalized_doc_id)
    maintenance_backup = _prepare_history_delete_backup(maintenance_reason, normalized_mode)
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")
    rounds = doc_entry.get("rounds") if isinstance(doc_entry.get("rounds"), list) else []
    target_rounds = [item for item in rounds if isinstance(item, dict)]
    if normalized_mode == "exports_only":
        removed_files, failed_files, deleted_file_stats = _delete_artifacts_for_removed_rounds(
            target_rounds,
            [],
            exports_only=True,
        )
        result = {
            "docId": normalized_doc_id,
            "mode": normalized_mode,
            "affectedRounds": sorted({
                int(item["round"]) for item in target_rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "deletedRounds": [],
            "remainingRounds": sorted({
                int(item["round"]) for item in target_rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "removedDocument": False,
            "deletedFiles": removed_files,
            "deletedFileStats": deleted_file_stats,
            "failedFiles": failed_files,
        }
        result["historyMaintenance"] = _finalize_history_delete_maintenance(result, maintenance_backup, maintenance_reason)
        return result
    records.pop(normalized_doc_id, None)
    records = _delete_document_record_transactional(records, normalized_doc_id)
    failed_files: List[Dict[str, str]] = []
    deleted_file_stats = _empty_history_artifact_stats()
    if normalized_mode == "records_only":
        removed_files = []
    else:
        removed_files, failed_files, deleted_file_stats = _delete_artifacts_for_removed_rounds(target_rounds, [])
    if normalized_mode == "records_artifacts_and_source":
        source_removed_files, source_failed_files, source_deleted_file_stats = _delete_source_related_paths_for_removed_entry(
            normalized_doc_id,
            doc_entry,
            records,
        )
        removed_files.extend(source_removed_files)
        failed_files.extend(source_failed_files)
        deleted_file_stats = _merge_history_artifact_stats(deleted_file_stats, source_deleted_file_stats)
    result = {
        "docId": normalized_doc_id,
        "mode": normalized_mode,
        "affectedRounds": sorted({
            int(item["round"]) for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "deletedRounds": sorted({
            int(item["round"]) for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "remainingRounds": [],
        "removedDocument": True,
        "deletedFiles": removed_files,
        "deletedFileStats": deleted_file_stats,
        "failedFiles": failed_files,
    }
    result["historyMaintenance"] = _finalize_history_delete_maintenance(result, maintenance_backup, maintenance_reason)
    return result


def show_records(doc_id: Optional[str] = None) -> None:
    """Print all records, or the record for a single document.

    Output is raw JSON on stdout so it can be piped or inspected easily.
    """

    records = list_records()
    if doc_id is not None:
        payload: Any = records.get(normalize_doc_id(doc_id), {})
    else:
        payload = records
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    print(text)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage AIGC reduction records in finish/fyadr_records.json",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_parser = subparsers.add_parser(
        "show", help="Show all records or a single document",
    )
    show_parser.add_argument(
        "doc_id",
        nargs="?",
        help="Document identifier (e.g. origin/xxx.txt). If omitted, show all records.",
    )

    delete_parser = subparsers.add_parser(
        "delete-document", help="Delete a whole document record",
    )
    delete_parser.add_argument("doc_id", help="Document identifier to delete.")

    subparsers.add_parser(
        "history-db-status", help="Show SQLite history index status",
    )
    subparsers.add_parser(
        "history-db-rebuild", help="Rebuild the SQLite history index from JSON records",
    )
    subparsers.add_parser(
        "history-db-check", help="Check SQLite history index integrity without changing records",
    )
    subparsers.add_parser(
        "history-db-repair", help="Repair the SQLite history index from normalized history records",
    )
    ensure_parser = subparsers.add_parser(
        "history-db-ensure", help="Run SQLite history startup self-check and repair recoverable drift",
    )
    ensure_parser.add_argument("--reason", default="cli", help="Short reason label for diagnostics.")
    subparsers.add_parser(
        "history-db-maintenance", help="Show SQLite history backup and compaction policy diagnostics",
    )
    backups_parser = subparsers.add_parser(
        "history-db-backups", help="List SQLite history backups",
    )
    backups_parser.add_argument("--validate", action="store_true", help="Validate each backup while listing it.")
    backup_parser = subparsers.add_parser(
        "history-db-backup", help="Create a validated SQLite history backup",
    )
    backup_parser.add_argument("--reason", default="manual", help="Short backup reason label.")
    backup_parser.add_argument("--keep", type=int, default=12, help="Number of newest backups to keep.")
    compact_parser = subparsers.add_parser(
        "history-db-compact", help="Checkpoint, vacuum, and validate the SQLite history index",
    )
    compact_parser.add_argument("--no-backup", action="store_true", help="Skip the pre-compaction backup.")
    compact_parser.add_argument("--keep", type=int, default=12, help="Number of newest backups to keep.")
    recover_parser = subparsers.add_parser(
        "history-db-recover", help="Recover the SQLite history index from a healthy backup",
    )
    recover_parser.add_argument("--backup-path", default="", help="Backup file name or path under finish/history_db_backups. Defaults to newest healthy backup.")
    recover_parser.add_argument("--keep", type=int, default=12, help="Number of newest backups to keep.")
    artifacts_parser = subparsers.add_parser(
        "history-db-artifacts", help="Query SQLite history artifacts by document, round, kind, state, and size",
    )
    artifacts_parser.add_argument("--doc-id", default="", help="Optional document id filter.")
    artifacts_parser.add_argument("--round", dest="round_number", type=int, default=None, help="Optional round number filter.")
    artifacts_parser.add_argument(
        "--kind",
        action="append",
        choices=["sources", "intermediate", "exports", "reports", "external"],
        help="Optional artifact kind filter. Repeat to include multiple kinds.",
    )
    artifacts_parser.add_argument(
        "--state",
        choices=["all", "existing", "missing"],
        default="all",
        help="Filter by whether the artifact still exists on disk.",
    )
    artifacts_parser.add_argument("--min-bytes", type=int, default=None, help="Minimum stored byte size.")
    artifacts_parser.add_argument("--max-bytes", type=int, default=None, help="Maximum stored byte size.")
    artifacts_parser.add_argument("--path-contains", default="", help="Case-sensitive path fragment filter.")
    artifacts_parser.add_argument("--limit", type=int, default=200, help="Maximum rows to return.")
    artifacts_parser.add_argument("--offset", type=int, default=0, help="Rows to skip.")

    rollback_parser = subparsers.add_parser(
        "delete-rounds", help="Delete one round and all later rounds for a document",
    )
    rollback_parser.add_argument("doc_id", help="Document identifier to modify.")
    rollback_parser.add_argument("from_round", type=int, help="Delete this round and later rounds.")
    rollback_parser.add_argument(
        "--prompt-profile",
        default=None,
        choices=sorted(get_prompt_workflow_ids()),
        help="Optional prompt profile filter for rollback. When omitted, matching rounds are removed across all profiles.",
    )

    update_parser = subparsers.add_parser(
        "update-round", help="Create or update a single document round record",
    )
    update_parser.add_argument(
        "doc_id",
        help="Document identifier, typically the origin/ relative path.",
    )
    update_parser.add_argument(
        "round",
        type=int,
        help="Round number (1, 2, or 3).",
    )
    update_parser.add_argument(
        "prompt",
        help="Prompt file path used for this round (e.g. prompts/rewrite-pass-1.md).",
    )
    update_parser.add_argument(
        "--prompt-profile",
        default=get_default_prompt_profile(),
        choices=sorted(get_prompt_workflow_ids()),
        help=f"Prompt workflow id for this round. Available: {_prompt_workflow_help()}.",
    )
    update_parser.add_argument(
        "input_path",
        help="Input text file path for this round.",
    )
    update_parser.add_argument(
        "output_path",
        help="Output text file path for this round.",
    )
    update_parser.add_argument(
        "--score-total",
        type=int,
        default=None,
        help="Optional checklist total score for this round.",
    )
    update_parser.add_argument(
        "--chunk-limit",
        type=int,
        default=None,
        help="Optional per-chunk character limit used in this round.",
    )
    update_parser.add_argument(
        "--input-segment-count",
        type=int,
        default=None,
        help="Optional number of chunks produced from the input text.",
    )
    update_parser.add_argument(
        "--output-segment-count",
        type=int,
        default=None,
        help="Optional number of chunk outputs written back into the restored text.",
    )
    update_parser.add_argument(
        "--manifest-path",
        default=None,
        help="Optional path to the chunk manifest json for this round.",
    )

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.command == "show":
        show_records(args.doc_id)
    elif args.command == "update-round":
        doc_entry = update_round(
            doc_id=args.doc_id,
            round_number=args.round,
            prompt=args.prompt,
            prompt_profile=args.prompt_profile,
            input_path=args.input_path,
            output_path=args.output_path,
            score_total=args.score_total,
            chunk_limit=args.chunk_limit,
            input_segment_count=args.input_segment_count,
            output_segment_count=args.output_segment_count,
            manifest_path=args.manifest_path,
        )
        text = json.dumps(doc_entry, ensure_ascii=False, indent=2, sort_keys=True)
        print(text)
    elif args.command == "delete-document":
        payload = delete_document(args.doc_id)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "delete-rounds":
        payload = delete_rounds(args.doc_id, args.from_round, prompt_profile=args.prompt_profile)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "history-db-status":
        payload = get_history_index_status(refresh=True)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "history-db-rebuild":
        payload = rebuild_history_index(strict=True)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "history-db-check":
        payload = check_history_index(strict=False)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-repair":
        payload = repair_history_index(strict=True)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "history-db-ensure":
        payload = ensure_history_index_ready(reason=args.reason, max_age_seconds=0)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-maintenance":
        payload = get_history_index_maintenance_summary()
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-backups":
        payload = list_history_index_backups(validate=args.validate)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-backup":
        payload = backup_history_index(reason=args.reason, keep=args.keep)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-compact":
        payload = compact_history_index(create_backup=not args.no_backup, keep=args.keep)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-recover":
        payload = recover_history_index(backup_path=args.backup_path or None, keep=args.keep)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    elif args.command == "history-db-artifacts":
        payload = query_history_artifacts(
            {
                "docId": args.doc_id,
                "roundNumber": args.round_number,
                "kinds": args.kind or [],
                "exists": args.state,
                "minBytes": args.min_bytes,
                "maxBytes": args.max_bytes,
                "pathContains": args.path_contains,
                "limit": args.limit,
                "offset": args.offset,
            },
            strict=True,
        )
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
        return 0 if payload.get("ok") else 1
    else:  # pragma: no cover - argparse guarantees command
        parser.error("Unknown command")
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    raise SystemExit(main())
