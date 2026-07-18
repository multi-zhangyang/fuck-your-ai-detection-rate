"""SQLite sidecar index for FYADR history records.

The JSON records file remains the compatibility format, while this database
stores normalized document, round, and artifact references for fast governance
queries and safer cleanup decisions.
"""

from __future__ import annotations

import json
import shutil
import sqlite3
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path, PurePath
from typing import Any, Iterable

from prompt_library import LEGACY_PROMPT_PROFILE, is_prompt_sequence_customizable
from path_utils import is_path_under

ROOT_DIR = Path(__file__).resolve().parents[1]
FINISH_DIR = ROOT_DIR / "finish"
DB_PATH = FINISH_DIR / "fyadr_history.sqlite3"
BACKUP_DIR = FINISH_DIR / "history_db_backups"
DEFAULT_BACKUP_KEEP = 12
MAX_BACKUP_KEEP = 100


def coerce_backup_keep(value: Any, *, default: int = DEFAULT_BACKUP_KEEP) -> int:
    """Coerce a client-supplied ``keep`` value into a safe retention count.

    Keeps the ``[1, MAX_BACKUP_KEEP]`` most recent backups. ``keep <= 0`` used
    to prune every backup (including the one just written), so it is rejected
    and clamped to the default rather than silently destroying all backups.
    """
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    if parsed <= 0:
        parsed = default
    if parsed > MAX_BACKUP_KEEP:
        return MAX_BACKUP_KEEP
    return parsed
DEFAULT_COMPACT_DELETE_EVENT_THRESHOLD = 8
DEFAULT_COMPACT_DELETED_ROW_THRESHOLD = 128
DEFAULT_COMPACT_FREE_BYTES_THRESHOLD = 4 * 1024 * 1024
DEFAULT_COMPACT_FREE_RATIO_THRESHOLD = 0.25
SCHEMA_VERSION = 2
MIGRATION_IDS = (
    "001_initial_history_index",
    "002_history_integrity_governance",
)

# Concurrency tuning. SQLite serializes writes through its file lock; when a
# background round-completion thread and an API request thread both touch the
# history index at once, the default 5-second connect timeout raises
# "database is locked" far too quickly. We raise the connect-level timeout
# and set PRAGMA busy_timeout so the SQLite engine waits for the lock instead
# of failing fast.
HISTORY_DB_BUSY_TIMEOUT_SECONDS = 30.0


def _connect_history_db(db_path: Path) -> sqlite3.Connection:
    """Open a history-index connection with safe concurrency defaults.

    Enables foreign keys and a busy_timeout so concurrent writers (round
    completion vs. API requests) wait for the file lock instead of raising
    ``database is locked``. Callers own the connection; use as a context
    manager to commit/rollback.
    """

    connection = sqlite3.connect(str(db_path), timeout=HISTORY_DB_BUSY_TIMEOUT_SECONDS)
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute(f"PRAGMA busy_timeout = {int(HISTORY_DB_BUSY_TIMEOUT_SECONDS * 1000)}")
    return connection


PATH_FIELDS = (
    "input_path",
    "output_path",
    "manifest_path",
    "compare_path",
    "quality_path",
    "body_map_path",
    "validation_path",
)


def rebuild_history_index(
    records: dict[str, Any],
    *,
    records_hash: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Rebuild the SQLite index from normalized JSON-compatible records."""

    normalized_db_path = db_path.resolve()
    normalized_db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect_history_db(normalized_db_path) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        _ensure_schema(connection)
        _clear_index(connection)
        document_count = 0
        round_count = 0
        artifact_ref_count = 0

        for doc_id, entry in records.items():
            inserted = _insert_document_entry(connection, str(doc_id), entry)
            document_count += inserted["documents"]
            round_count += inserted["rounds"]
            artifact_ref_count += inserted["artifactRefs"]

        synced_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        _set_metadata(connection, "schema_version", str(SCHEMA_VERSION))
        _set_metadata(connection, "records_hash", records_hash)
        _set_metadata(connection, "synced_at", synced_at)
        connection.commit()

    status = get_history_index_status(db_path=normalized_db_path)
    status.update({
        "rebuilt": True,
        "documentCount": document_count,
        "roundCount": round_count,
        "artifactRefCount": artifact_ref_count,
    })
    return status


def upsert_document_record(
    doc_id: str,
    entry: dict[str, Any],
    *,
    records_hash: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Transactionally replace one document's history rows in SQLite."""

    normalized_doc_id = _normalize_record_path(doc_id)
    normalized_db_path = db_path.resolve()
    normalized_db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        _ensure_schema(connection)
        connection.commit()
        connection.execute("BEGIN IMMEDIATE")
        connection.execute("DELETE FROM documents WHERE doc_id = ?", (normalized_doc_id,))
        inserted = _insert_document_entry(connection, normalized_doc_id, entry)
        _delete_unreferenced_artifact_rows(connection)
        synced_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        _set_metadata(connection, "schema_version", str(SCHEMA_VERSION))
        _set_metadata(connection, "records_hash", records_hash)
        _set_metadata(connection, "synced_at", synced_at)
        connection.commit()

    status = get_history_index_status(db_path=normalized_db_path)
    status.update({
        "transactional": True,
        "changedDocIds": [normalized_doc_id],
        "documentsChanged": inserted["documents"],
        "roundsChanged": inserted["rounds"],
        "artifactRefsChanged": inserted["artifactRefs"],
    })
    return status


def delete_document_record(
    doc_id: str,
    *,
    records_hash: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Transactionally delete one document's history rows from SQLite."""

    normalized_doc_id = _normalize_record_path(doc_id)
    normalized_db_path = db_path.resolve()
    normalized_db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        _ensure_schema(connection)
        connection.commit()
        connection.execute("BEGIN IMMEDIATE")
        cursor = connection.execute("DELETE FROM documents WHERE doc_id = ?", (normalized_doc_id,))
        deleted_artifact_rows = _delete_unreferenced_artifact_rows(connection)
        synced_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        _set_metadata(connection, "schema_version", str(SCHEMA_VERSION))
        _set_metadata(connection, "records_hash", records_hash)
        _set_metadata(connection, "synced_at", synced_at)
        connection.commit()

    status = get_history_index_status(db_path=normalized_db_path)
    status.update({
        "transactional": True,
        "changedDocIds": [normalized_doc_id],
        "documentsDeleted": int(cursor.rowcount or 0),
        "artifactRowsDeleted": deleted_artifact_rows,
    })
    return status


def list_history_index_backups(
    *,
    backup_dir: Path = BACKUP_DIR,
    validate: bool = False,
) -> dict[str, Any]:
    normalized_backup_dir = backup_dir.resolve()
    backups: list[dict[str, Any]] = []
    for path in _iter_history_backup_files(normalized_backup_dir):
        item = _backup_file_entry(path)
        if validate:
            item["validation"] = check_history_index(db_path=path)
            item["ok"] = bool(item["validation"].get("ok"))
        backups.append(item)
    return {
        "ok": True,
        "backupDir": str(normalized_backup_dir),
        "total": len(backups),
        "items": backups,
    }


def backup_history_index(
    *,
    reason: str = "manual",
    keep: int = DEFAULT_BACKUP_KEEP,
    backup_dir: Path = BACKUP_DIR,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    keep = coerce_backup_keep(keep)
    normalized_db_path = db_path.resolve()
    normalized_backup_dir = backup_dir.resolve()
    if not normalized_db_path.exists():
        return {
            "ok": False,
            "error": f"SQLite history index does not exist: {normalized_db_path}",
            "path": "",
            "backupDir": str(normalized_backup_dir),
            "sourcePath": str(normalized_db_path),
        }

    normalized_backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = _next_history_backup_path(normalized_backup_dir, reason)
    before_status = get_history_index_status(db_path=normalized_db_path)
    try:
        with _connect_history_db(normalized_db_path) as source:
            _checkpoint_connection(source)
            with _connect_history_db(backup_path) as target:
                source.backup(target)
    except Exception as exc:
        if backup_path.exists():
            backup_path.unlink(missing_ok=True)
        return {
            "ok": False,
            "error": str(exc),
            "path": "",
            "backupDir": str(normalized_backup_dir),
            "sourcePath": str(normalized_db_path),
            "sourceStatus": before_status,
        }

    validation = check_history_index(db_path=backup_path)
    pruned = _prune_history_db_backups(normalized_backup_dir, keep)
    return {
        "ok": bool(validation.get("ok")),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reason": reason,
        "path": str(backup_path),
        "backupDir": str(normalized_backup_dir),
        "sourcePath": str(normalized_db_path),
        "sizeBytes": _file_size(backup_path),
        "sourceStatus": before_status,
        "validation": validation,
        "prunedBackups": pruned,
        "backupCount": len(_iter_history_backup_files(normalized_backup_dir)),
    }


def compact_history_index(
    *,
    create_backup: bool = True,
    keep: int = DEFAULT_BACKUP_KEEP,
    backup_dir: Path = BACKUP_DIR,
    db_path: Path = DB_PATH,
    reason: str = "manual",
) -> dict[str, Any]:
    keep = coerce_backup_keep(keep)
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return {
            "ok": False,
            "error": f"SQLite history index does not exist: {normalized_db_path}",
            "path": str(normalized_db_path),
        }

    before_status = get_history_index_status(db_path=normalized_db_path)
    before_size = _sqlite_file_size_with_journals(normalized_db_path)
    backup = backup_history_index(reason="pre_compact", keep=keep, backup_dir=backup_dir, db_path=normalized_db_path) if create_backup else None
    if backup is not None and not bool(backup.get("ok")):
        return {
            "ok": False,
            "error": backup.get("error", "Pre-compaction backup failed."),
            "path": str(normalized_db_path),
            "before": before_status,
            "beforeSizeBytes": before_size,
            "backup": backup,
        }

    try:
        with _connect_history_db(normalized_db_path) as connection:
            _checkpoint_connection(connection)
            connection.execute("VACUUM")
            connection.execute("ANALYZE")
            try:
                connection.execute("PRAGMA optimize")
            except sqlite3.DatabaseError:
                pass
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "path": str(normalized_db_path),
            "before": before_status,
            "beforeSizeBytes": before_size,
            "backup": backup,
        }

    after_validation = check_history_index(db_path=normalized_db_path)
    if bool(after_validation.get("ok")):
        _mark_history_index_compacted(normalized_db_path, reason)
    after_status = get_history_index_status(db_path=normalized_db_path)
    after_size = _sqlite_file_size_with_journals(normalized_db_path)
    return {
        "ok": bool(after_validation.get("ok")),
        "compactedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reason": reason,
        "path": str(normalized_db_path),
        "before": before_status,
        "after": after_status,
        "beforeSizeBytes": before_size,
        "afterSizeBytes": after_size,
        "savedBytes": max(0, before_size - after_size),
        "backup": backup,
        "validation": after_validation,
    }


def apply_history_delete_maintenance(
    *,
    reason: str = "history_delete",
    documents_deleted: int = 0,
    rounds_deleted: int = 0,
    artifact_rows_deleted: int = 0,
    files_deleted: int = 0,
    keep: int = DEFAULT_BACKUP_KEEP,
    db_path: Path = DB_PATH,
    backup_dir: Path = BACKUP_DIR,
    delete_event_threshold: int = DEFAULT_COMPACT_DELETE_EVENT_THRESHOLD,
    deleted_row_threshold: int = DEFAULT_COMPACT_DELETED_ROW_THRESHOLD,
    free_bytes_threshold: int = DEFAULT_COMPACT_FREE_BYTES_THRESHOLD,
    free_ratio_threshold: float = DEFAULT_COMPACT_FREE_RATIO_THRESHOLD,
) -> dict[str, Any]:
    """Record destructive history activity and compact when policy thresholds are met."""

    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return {
            "ok": True,
            "skipped": True,
            "reason": "db_missing",
            "path": str(normalized_db_path),
        }

    event_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    row_delta = max(0, int(documents_deleted or 0)) + max(0, int(rounds_deleted or 0)) + max(0, int(artifact_rows_deleted or 0))
    file_delta = max(0, int(files_deleted or 0))
    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        _ensure_schema(connection)
        counters = _read_maintenance_counters(connection)
        counters["deleteEventCount"] += 1
        counters["deletedRowCount"] += row_delta
        counters["deletedFileCount"] += file_delta
        counters["lastDeleteAt"] = event_at
        _write_maintenance_counters(connection, counters)
        connection.commit()

    storage = _sqlite_storage_stats(normalized_db_path)
    counters = _read_maintenance_counters_from_db(normalized_db_path)
    advice = _build_compaction_advice(
        counters,
        storage,
        delete_event_threshold=delete_event_threshold,
        deleted_row_threshold=deleted_row_threshold,
        free_bytes_threshold=free_bytes_threshold,
        free_ratio_threshold=free_ratio_threshold,
    )
    compact_result = None
    if advice["shouldCompact"]:
        compact_reason = f"auto_{_safe_backup_label(reason)}"
        compact_result = compact_history_index(
            create_backup=True,
            keep=keep,
            backup_dir=backup_dir,
            db_path=normalized_db_path,
            reason=compact_reason,
        )
        if bool(compact_result.get("ok")):
            counters = _read_maintenance_counters_from_db(normalized_db_path)

    return {
        "ok": bool(compact_result.get("ok")) if isinstance(compact_result, dict) else True,
        "event": reason,
        "path": str(normalized_db_path),
        "eventAt": event_at,
        "delta": {
            "documentsDeleted": max(0, int(documents_deleted or 0)),
            "roundsDeleted": max(0, int(rounds_deleted or 0)),
            "artifactRowsDeleted": max(0, int(artifact_rows_deleted or 0)),
            "filesDeleted": file_delta,
            "rowsDeleted": row_delta,
        },
        "counters": counters,
        "storage": _sqlite_storage_stats(normalized_db_path),
        "policy": advice,
        "compact": compact_result,
    }


def get_history_index_maintenance_summary(
    *,
    db_path: Path = DB_PATH,
    backup_dir: Path = BACKUP_DIR,
) -> dict[str, Any]:
    """Return read-only SQLite history maintenance diagnostics."""

    normalized_db_path = db_path.resolve()
    status = get_history_index_status(db_path=normalized_db_path)
    counters = _read_maintenance_counters_from_db(normalized_db_path) if normalized_db_path.exists() else _empty_maintenance_counters()
    storage = _sqlite_storage_stats(normalized_db_path)
    advice = _build_compaction_advice(counters, storage)
    backups = list_history_index_backups(backup_dir=backup_dir, validate=False)
    items = backups.get("items") if isinstance(backups.get("items"), list) else []
    return {
        "ok": bool(status.get("exists")),
        "path": str(normalized_db_path),
        "status": status,
        "storage": storage,
        "counters": counters,
        "policy": advice,
        "backupDir": str(backup_dir.resolve()),
        "backupCount": int(backups.get("total", 0) or 0),
        "latestBackup": items[0] if items else None,
    }


def recover_history_index(
    *,
    backup_path: str | Path | None = None,
    keep: int = DEFAULT_BACKUP_KEEP,
    backup_dir: Path = BACKUP_DIR,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    keep = coerce_backup_keep(keep)
    normalized_db_path = db_path.resolve()
    normalized_backup_dir = backup_dir.resolve()
    try:
        resolved_backup = _resolve_history_backup_path(backup_path, normalized_backup_dir)
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "path": str(normalized_db_path),
            "backupDir": str(normalized_backup_dir),
        }
    if resolved_backup is None:
        return {
            "ok": False,
            "error": "No healthy SQLite history backup is available.",
            "path": str(normalized_db_path),
            "backupDir": str(normalized_backup_dir),
        }

    source_validation = check_history_index(db_path=resolved_backup)
    if not bool(source_validation.get("ok")):
        return {
            "ok": False,
            "error": "Selected SQLite history backup did not pass integrity checks.",
            "path": str(normalized_db_path),
            "backupPath": str(resolved_backup),
            "sourceValidation": source_validation,
        }

    pre_recovery_backup = None
    raw_current_backup = None
    if normalized_db_path.exists():
        pre_recovery_backup = backup_history_index(
            reason="pre_recover",
            keep=keep,
            backup_dir=normalized_backup_dir,
            db_path=normalized_db_path,
        )
        if not bool(pre_recovery_backup.get("ok")):
            raw_current_backup = _copy_current_db_file(normalized_db_path, normalized_backup_dir, "pre_recover_raw")

    normalized_db_path.parent.mkdir(parents=True, exist_ok=True)
    with _connect_history_db(resolved_backup) as source_connection:
        with _connect_history_db(normalized_db_path) as target_connection:
            source_connection.backup(target_connection)
            target_connection.commit()
            _checkpoint_connection(target_connection)
    _delete_sqlite_journal_files(normalized_db_path)

    after_validation = check_history_index(db_path=normalized_db_path)
    return {
        "ok": bool(after_validation.get("ok")),
        "recoveredAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "path": str(normalized_db_path),
        "backupPath": str(resolved_backup),
        "sourceValidation": source_validation,
        "preRecoveryBackup": pre_recovery_backup,
        "rawCurrentBackup": str(raw_current_backup) if raw_current_backup else "",
        "after": get_history_index_status(db_path=normalized_db_path),
        "validation": after_validation,
    }


def get_history_index_status(*, db_path: Path = DB_PATH) -> dict[str, Any]:
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return {
            "path": str(normalized_db_path),
            "exists": False,
            "schemaVersion": 0,
            "documentCount": 0,
            "roundCount": 0,
            "artifactCount": 0,
            "artifactRefCount": 0,
            "missingArtifactCount": 0,
            "existingBytes": 0,
            "recordsHash": "",
            "syncedAt": "",
            "migrationCount": 0,
            "appliedMigrations": [],
        }

    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        _ensure_schema(connection)
        applied_migrations = _applied_migrations(connection)
        return {
            "path": str(normalized_db_path),
            "exists": True,
            "schemaVersion": int(_get_metadata(connection, "schema_version") or 0),
            "documentCount": _count(connection, "documents"),
            "roundCount": _count(connection, "rounds"),
            "artifactCount": _count(connection, "artifacts"),
            "artifactRefCount": _count(connection, "artifact_refs"),
            "missingArtifactCount": int(connection.execute("SELECT COUNT(*) FROM artifacts WHERE exists_flag = 0").fetchone()[0]),
            "existingBytes": int(connection.execute("SELECT COALESCE(SUM(bytes), 0) FROM artifacts WHERE exists_flag = 1").fetchone()[0]),
            "recordsHash": _get_metadata(connection, "records_hash"),
            "syncedAt": _get_metadata(connection, "synced_at"),
            "migrationCount": len(applied_migrations),
            "appliedMigrations": applied_migrations,
        }


def load_records_from_index(
    *,
    expected_hash: str | None = None,
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> dict[str, Any] | None:
    """Load normalized history records from SQLite.

    Returns None when the index is missing, stale, or unreadable. Callers can
    then fall back to the JSON compatibility file and rebuild the index.
    """

    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return None
    try:
        with _connect_history_db(normalized_db_path) as connection:
            connection.row_factory = sqlite3.Row
            _ensure_schema(connection)
            if int(_get_metadata(connection, "schema_version") or 0) != SCHEMA_VERSION:
                return None
            if expected_hash is not None and expected_hash and _get_metadata(connection, "records_hash") != expected_hash:
                return None

            records: dict[str, Any] = {}
            document_rows = connection.execute(
                "SELECT doc_id, origin_path, payload_json FROM documents ORDER BY doc_id"
            ).fetchall()
            for document_row in document_rows:
                doc_id = str(document_row["doc_id"])
                entry = _json_loads_dict(str(document_row["payload_json"]))
                if not entry:
                    entry = {"origin_path": str(document_row["origin_path"])}
                entry["origin_path"] = _normalize_record_path(str(entry.get("origin_path", document_row["origin_path"])))
                round_rows = connection.execute(
                    """
                    SELECT payload_json
                    FROM rounds
                    WHERE doc_id = ?
                    ORDER BY prompt_profile, prompt_sequence_key, round_number
                    """,
                    (doc_id,),
                ).fetchall()
                entry["rounds"] = [
                    round_payload
                    for round_payload in (_json_loads_dict(str(row["payload_json"])) for row in round_rows)
                    if round_payload
                ]
                records[doc_id] = entry
            return records
    except Exception:
        if strict:
            raise
        return None


def list_referenced_artifact_paths(*, db_path: Path = DB_PATH, strict: bool = False) -> list[str] | None:
    """Return artifact paths that are referenced by at least one document/round."""

    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return None
    try:
        with _connect_history_db(normalized_db_path) as connection:
            _ensure_schema(connection)
            if int(_get_metadata(connection, "schema_version") or 0) != SCHEMA_VERSION:
                return None
            rows = connection.execute(
                "SELECT DISTINCT path FROM artifact_refs ORDER BY path"
            ).fetchall()
            return [str(row[0]) for row in rows if str(row[0]).strip()]
    except Exception:
        if strict:
            raise
        return None


def list_document_round_artifact_refs(
    doc_id: str,
    round_filters: list[dict[str, Any]] | None = None,
    *,
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> list[dict[str, Any]] | None:
    """Return artifact references for selected rounds of one document."""

    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return None
    try:
        normalized_doc_id = _normalize_record_path(doc_id)
        parameters: list[Any] = [normalized_doc_id]
        where_parts = ["rounds.doc_id = ?"]
        normalized_filters = _normalize_round_filters(round_filters)
        if normalized_filters:
            filter_parts: list[str] = []
            for item in normalized_filters:
                filter_parts.append(
                    "(rounds.round_number = ? AND rounds.prompt_profile = ? AND rounds.prompt_sequence_key = ?)"
                )
                parameters.extend([
                    item["roundNumber"],
                    item["promptProfile"],
                    item["promptSequenceKey"],
                ])
            where_parts.append("(" + " OR ".join(filter_parts) + ")")

        with _connect_history_db(normalized_db_path) as connection:
            connection.row_factory = sqlite3.Row
            _ensure_schema(connection)
            if int(_get_metadata(connection, "schema_version") or 0) != SCHEMA_VERSION:
                return None
            rows = connection.execute(
                f"""
                SELECT
                    ref.path,
                    ref.role,
                    ref.derived,
                    artifact.kind,
                    artifact.exists_flag,
                    artifact.bytes,
                    rounds.round_number,
                    rounds.prompt_profile,
                    rounds.prompt_sequence_key
                FROM artifact_refs AS ref
                JOIN rounds ON rounds.id = ref.round_id
                LEFT JOIN artifacts AS artifact ON artifact.path = ref.path
                WHERE {" AND ".join(where_parts)}
                ORDER BY rounds.prompt_profile, rounds.prompt_sequence_key, rounds.round_number, ref.path, ref.role
                """,
                parameters,
            ).fetchall()
            return [
                {
                    "path": str(row["path"]),
                    "role": str(row["role"]),
                    "derived": bool(row["derived"]),
                    "kind": str(row["kind"] or ""),
                    "exists": bool(row["exists_flag"]),
                    "bytes": int(row["bytes"] or 0),
                    "roundNumber": int(row["round_number"]),
                    "promptProfile": str(row["prompt_profile"]),
                    "promptSequenceKey": str(row["prompt_sequence_key"]),
                }
                for row in rows
                if str(row["path"]).strip()
            ]
    except Exception:
        if strict:
            raise
        return None


def list_history_documents_from_index(
    *,
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> list[dict[str, Any]] | None:
    """Return document history summaries with SQL-derived artifact stats."""

    try:
        return _load_history_documents_from_index(db_path=db_path)
    except Exception:
        if strict:
            raise
        return None


def get_history_document_from_index(
    doc_id: str,
    *,
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> dict[str, Any] | None:
    """Return one document history entry with SQL-derived artifact stats."""

    try:
        normalized_doc_id = _normalize_record_path(doc_id)
        documents = _load_history_documents_from_index(doc_id=normalized_doc_id, db_path=db_path)
        return documents[0] if documents else None
    except Exception:
        if strict:
            raise
        return None


def query_history_artifacts_from_index(
    filters: dict[str, Any] | None = None,
    *,
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> dict[str, Any] | None:
    """Query indexed history artifacts without scanning JSON or the filesystem."""

    try:
        return _query_history_artifacts_from_index(filters or {}, db_path=db_path)
    except Exception:
        if strict:
            raise
        return None


def check_history_index(
    records: dict[str, Any] | None = None,
    *,
    records_hash: str = "",
    db_path: Path = DB_PATH,
    strict: bool = False,
) -> dict[str, Any]:
    """Check SQLite history governance health without mutating user records."""

    normalized_db_path = db_path.resolve()
    checked_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    issues: list[dict[str, Any]] = []
    status = get_history_index_status(db_path=normalized_db_path)
    expected_counts = _expected_counts_from_records(records) if isinstance(records, dict) else None

    def add_issue(
        code: str,
        severity: str,
        message: str,
        *,
        repairable: bool = True,
        details: dict[str, Any] | None = None,
    ) -> None:
        issue: dict[str, Any] = {
            "code": code,
            "severity": severity,
            "message": message,
            "repairable": repairable,
            "recommendedAction": "history-db-repair" if repairable else "manual-review",
        }
        if details:
            issue["details"] = details
        issues.append(issue)

    if not normalized_db_path.exists():
        add_issue("db_missing", "error", "SQLite history index is missing and should be rebuilt.")
        return _build_check_report(checked_at, normalized_db_path, status, expected_counts, issues)

    try:
        with _connect_history_db(normalized_db_path) as connection:
            connection.row_factory = sqlite3.Row
            connection.execute("PRAGMA foreign_keys = ON")
            _ensure_schema(connection)

            integrity_rows = [str(row[0]) for row in connection.execute("PRAGMA integrity_check").fetchall()]
            if integrity_rows != ["ok"]:
                add_issue(
                    "sqlite_integrity_check_failed",
                    "error",
                    "SQLite reported low-level integrity problems.",
                    repairable=False,
                    details={"results": integrity_rows[:10]},
                )

            foreign_rows = connection.execute("PRAGMA foreign_key_check").fetchall()
            if foreign_rows:
                add_issue(
                    "foreign_key_check_failed",
                    "error",
                    "SQLite history index has broken foreign-key references.",
                    details={"count": len(foreign_rows)},
                )

            schema_version = int(_get_metadata(connection, "schema_version") or 0)
            if schema_version != SCHEMA_VERSION:
                add_issue(
                    "schema_version_mismatch",
                    "error",
                    "SQLite history schema version does not match the current code.",
                    details={"actual": schema_version, "expected": SCHEMA_VERSION},
                )

            applied_migrations = set(_applied_migrations(connection))
            missing_migrations = [migration_id for migration_id in MIGRATION_IDS if migration_id not in applied_migrations]
            if missing_migrations:
                add_issue(
                    "missing_schema_migrations",
                    "error",
                    "SQLite history index is missing expected migration markers.",
                    details={"missing": missing_migrations},
                )

            if records_hash and _get_metadata(connection, "records_hash") != records_hash:
                add_issue(
                    "records_hash_mismatch",
                    "error",
                    "SQLite index is stale compared with the compatibility JSON history file.",
                    details={"actual": _get_metadata(connection, "records_hash"), "expected": records_hash},
                )

            if expected_counts is not None:
                actual_counts = {
                    "documents": _count(connection, "documents"),
                    "rounds": _count(connection, "rounds"),
                    "artifacts": _count(connection, "artifacts"),
                    "artifactRefs": _count(connection, "artifact_refs"),
                }
                for key, expected_value in expected_counts.items():
                    actual_value = actual_counts.get(key)
                    if actual_value != expected_value:
                        add_issue(
                            f"{key}_count_mismatch",
                            "error",
                            "SQLite history row counts do not match normalized JSON records.",
                            details={"key": key, "actual": actual_value, "expected": expected_value},
                        )

            orphan_artifact_rows = int(
                connection.execute(
                    """
                    SELECT COUNT(*)
                    FROM artifacts AS artifact
                    LEFT JOIN artifact_refs AS ref ON ref.path = artifact.path
                    WHERE ref.path IS NULL
                    """
                ).fetchone()[0]
            )
            if orphan_artifact_rows:
                add_issue(
                    "unreferenced_artifact_rows",
                    "warning",
                    "SQLite contains artifact rows that are not referenced by any document or round.",
                    details={"count": orphan_artifact_rows},
                )

            missing_artifact_rows = int(
                connection.execute(
                    """
                    SELECT COUNT(*)
                    FROM artifact_refs AS ref
                    LEFT JOIN artifacts AS artifact ON artifact.path = ref.path
                    WHERE artifact.path IS NULL
                    """
                ).fetchone()[0]
            )
            if missing_artifact_rows:
                add_issue(
                    "artifact_ref_without_artifact",
                    "error",
                    "SQLite contains artifact references without matching artifact rows.",
                    details={"count": missing_artifact_rows},
                )

            stale_stat_samples = _stale_artifact_stat_samples(connection)
            if stale_stat_samples:
                add_issue(
                    "artifact_stats_stale",
                    "warning",
                    "Some artifact existence or size metadata is stale compared with the filesystem.",
                    details={"count": len(stale_stat_samples), "samples": stale_stat_samples[:8]},
                )

    except Exception as exc:
        if strict:
            raise
        add_issue(
            "history_index_unreadable",
            "error",
            "SQLite history index could not be inspected.",
            repairable=False,
            details={"message": str(exc)},
        )

    return _build_check_report(checked_at, normalized_db_path, status, expected_counts, issues)


def repair_history_index(
    records: dict[str, Any],
    *,
    records_hash: str = "",
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    """Repair SQLite governance state by rebuilding it from normalized records."""

    normalized_db_path = db_path.resolve()
    before = check_history_index(records, records_hash=records_hash, db_path=normalized_db_path)
    rebuild = rebuild_history_index(records, records_hash=records_hash, db_path=normalized_db_path)
    after = check_history_index(records, records_hash=records_hash, db_path=normalized_db_path)
    return {
        "ok": bool(after.get("ok")),
        "repairedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "path": str(normalized_db_path),
        "before": before,
        "rebuild": rebuild,
        "after": after,
    }


def _load_history_documents_from_index(
    doc_id: str | None = None,
    *,
    db_path: Path = DB_PATH,
) -> list[dict[str, Any]] | None:
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return None

    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        _ensure_schema(connection)
        if int(_get_metadata(connection, "schema_version") or 0) != SCHEMA_VERSION:
            return None

        document_parameters: list[Any] = []
        document_where = ""
        if doc_id is not None:
            document_where = "WHERE doc_id = ?"
            document_parameters.append(_normalize_record_path(doc_id))

        document_rows = connection.execute(
            f"""
            SELECT doc_id, origin_path, source_kind, last_timestamp, payload_json
            FROM documents
            {document_where}
            ORDER BY last_timestamp DESC, doc_id DESC
            """,
            document_parameters,
        ).fetchall()
        if not document_rows:
            return []

        round_rows_by_doc: dict[str, list[sqlite3.Row]] = defaultdict(list)
        round_parameters: list[Any] = []
        round_where = ""
        if doc_id is not None:
            round_where = "WHERE doc_id = ?"
            round_parameters.append(_normalize_record_path(doc_id))
        round_rows = connection.execute(
            f"""
            SELECT
                id,
                doc_id,
                round_number,
                prompt_profile,
                prompt_sequence_key,
                prompt,
                input_path,
                output_path,
                timestamp,
                payload_json
            FROM rounds
            {round_where}
            ORDER BY doc_id, prompt_profile, prompt_sequence_key, round_number
            """,
            round_parameters,
        ).fetchall()
        for row in round_rows:
            round_rows_by_doc[str(row["doc_id"])].append(row)

        artifact_rows_by_doc: dict[str, dict[str, dict[str, Any]]] = defaultdict(dict)
        artifact_rows_by_round: dict[int, dict[str, dict[str, Any]]] = defaultdict(dict)
        artifact_parameters: list[Any] = []
        artifact_where = "WHERE ref.round_id IS NOT NULL"
        if doc_id is not None:
            artifact_where += " AND ref.doc_id = ?"
            artifact_parameters.append(_normalize_record_path(doc_id))
        artifact_rows = connection.execute(
            f"""
            SELECT
                ref.doc_id,
                ref.round_id,
                ref.path,
                artifact.kind,
                artifact.exists_flag,
                artifact.bytes
            FROM artifact_refs AS ref
            LEFT JOIN artifacts AS artifact ON artifact.path = ref.path
            {artifact_where}
            ORDER BY ref.doc_id, ref.round_id, ref.path
            """,
            artifact_parameters,
        ).fetchall()
        for row in artifact_rows:
            path = _normalize_record_path(str(row["path"]))
            if not path:
                continue
            item = {
                "path": path,
                "kind": str(row["kind"] or ""),
                "exists": bool(row["exists_flag"]),
                "bytes": _safe_int(row["bytes"]),
            }
            artifact_rows_by_doc[str(row["doc_id"])][path] = item
            if row["round_id"] is not None:
                artifact_rows_by_round[int(row["round_id"])][path] = item

        documents: list[dict[str, Any]] = []
        for row in document_rows:
            document_id = str(row["doc_id"])
            entry = _json_loads_dict(str(row["payload_json"]))
            origin_path = _normalize_record_path(str(entry.get("origin_path", row["origin_path"])))
            if not origin_path:
                origin_path = _normalize_record_path(str(row["origin_path"] or document_id))
            source_kind = str(row["source_kind"] or Path(origin_path).suffix.lower() or ".txt")
            rounds = [
                _history_round_from_row(
                    round_row,
                    _history_artifact_stats_from_index_items(artifact_rows_by_round.get(int(round_row["id"]), {}).values()),
                )
                for round_row in round_rows_by_doc.get(document_id, [])
            ]
            latest_round = max(
                rounds,
                key=lambda item: (str(item.get("timestamp", "")), int(item.get("round", 0) or 0)),
                default=None,
            )
            documents.append({
                "docId": document_id,
                "sourcePath": origin_path,
                "originPath": origin_path,
                "sourceKind": source_kind,
                "completedRounds": sorted({
                    int(item.get("round", 0))
                    for item in rounds
                    if isinstance(item.get("round"), int)
                }),
                "latestOutputPath": str(latest_round.get("output_path", "")) if latest_round else "",
                "lastTimestamp": str(latest_round.get("timestamp", row["last_timestamp"] or "")) if latest_round else str(row["last_timestamp"] or ""),
                "artifactStats": _history_artifact_stats_from_index_items(artifact_rows_by_doc.get(document_id, {}).values()),
                "rounds": rounds,
            })
        return documents


def _query_history_artifacts_from_index(
    raw_filters: dict[str, Any],
    *,
    db_path: Path = DB_PATH,
) -> dict[str, Any] | None:
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return None

    filters = _normalize_artifact_query_filters(raw_filters)
    with _connect_history_db(normalized_db_path) as connection:
        connection.row_factory = sqlite3.Row
        _ensure_schema(connection)
        if int(_get_metadata(connection, "schema_version") or 0) != SCHEMA_VERSION:
            return None

        where_parts, parameters = _artifact_query_where(filters)
        where_sql = " AND ".join(where_parts)
        base_sql = f"""
            FROM artifacts AS artifact
            JOIN artifact_refs AS ref ON ref.path = artifact.path
            LEFT JOIN rounds ON rounds.id = ref.round_id
            WHERE {where_sql}
            GROUP BY artifact.path, artifact.absolute_path, artifact.kind, artifact.exists_flag, artifact.bytes, artifact.modified_at
        """
        total_row = connection.execute(
            f"SELECT COUNT(*) FROM (SELECT artifact.path {base_sql}) AS filtered_artifacts",
            parameters,
        ).fetchone()
        total = int(total_row[0] if total_row else 0)

        stats_row = connection.execute(
            f"""
            SELECT
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN exists_flag = 1 THEN 1 ELSE 0 END), 0) AS existing,
                COALESCE(SUM(CASE WHEN exists_flag = 0 THEN 1 ELSE 0 END), 0) AS missing,
                COALESCE(SUM(CASE WHEN exists_flag = 1 THEN bytes ELSE 0 END), 0) AS bytes,
                COALESCE(SUM(CASE WHEN kind = 'sources' THEN 1 ELSE 0 END), 0) AS sources,
                COALESCE(SUM(CASE WHEN kind = 'intermediate' THEN 1 ELSE 0 END), 0) AS intermediate,
                COALESCE(SUM(CASE WHEN kind = 'exports' THEN 1 ELSE 0 END), 0) AS exports,
                COALESCE(SUM(CASE WHEN kind = 'reports' THEN 1 ELSE 0 END), 0) AS reports,
                COALESCE(SUM(CASE WHEN kind = 'external' THEN 1 ELSE 0 END), 0) AS external
            FROM (
                SELECT
                    artifact.path,
                    artifact.kind,
                    artifact.exists_flag,
                    artifact.bytes
                {base_sql}
            ) AS filtered_artifacts
            """,
            parameters,
        ).fetchone()

        item_rows = connection.execute(
            f"""
            SELECT
                artifact.path,
                artifact.absolute_path,
                artifact.kind,
                artifact.exists_flag,
                artifact.bytes,
                artifact.modified_at,
                COUNT(DISTINCT ref.doc_id) AS document_count,
                COUNT(DISTINCT ref.round_id) AS round_count,
                GROUP_CONCAT(DISTINCT ref.doc_id) AS doc_ids,
                GROUP_CONCAT(DISTINCT ref.role) AS roles,
                MIN(rounds.timestamp) AS first_timestamp,
                MAX(rounds.timestamp) AS last_timestamp
            {base_sql}
            ORDER BY artifact.exists_flag ASC, artifact.kind ASC, artifact.bytes DESC, artifact.path ASC
            LIMIT ? OFFSET ?
            """,
            [*parameters, filters["limit"], filters["offset"]],
        ).fetchall()

        items = [_history_artifact_query_item_from_row(row) for row in item_rows]
        return {
            "ok": True,
            "source": "sqlite",
            "filters": filters,
            "items": items,
            "total": total,
            "limit": filters["limit"],
            "offset": filters["offset"],
            "hasMore": filters["offset"] + len(items) < total,
            "stats": _history_artifact_query_stats_from_row(stats_row),
        }


def _normalize_artifact_query_filters(raw_filters: dict[str, Any]) -> dict[str, Any]:
    kinds = raw_filters.get("kinds", raw_filters.get("kind"))
    if isinstance(kinds, str):
        normalized_kinds = [kinds]
    elif isinstance(kinds, list):
        normalized_kinds = [str(item) for item in kinds]
    else:
        normalized_kinds = []
    normalized_kinds = [
        item.strip().lower()
        for item in normalized_kinds
        if item.strip().lower() in {"sources", "intermediate", "exports", "reports", "external"}
    ]
    exists_filter = _normalize_exists_filter(raw_filters.get("exists", raw_filters.get("state")))
    limit = max(1, min(500, _safe_int(raw_filters.get("limit")) or 200))
    offset = max(0, _safe_int(raw_filters.get("offset")))
    round_number = raw_filters.get("roundNumber", raw_filters.get("round"))
    normalized_round = _safe_int(round_number) if round_number is not None and str(round_number).strip() else None
    if normalized_round is not None and normalized_round <= 0:
        normalized_round = None
    min_bytes = _safe_int(raw_filters.get("minBytes"))
    max_bytes = _safe_int(raw_filters.get("maxBytes"))
    return {
        "docId": _normalize_record_path(str(raw_filters.get("docId", raw_filters.get("doc_id", "")))),
        "roundNumber": normalized_round,
        "kinds": list(dict.fromkeys(normalized_kinds)),
        "exists": exists_filter,
        "minBytes": min_bytes if min_bytes > 0 else None,
        "maxBytes": max_bytes if max_bytes > 0 else None,
        "pathContains": _normalize_query_fragment(str(raw_filters.get("pathContains", raw_filters.get("path_contains", "")))),
        "limit": limit,
        "offset": offset,
    }


def _normalize_exists_filter(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    candidate = str(value or "").strip().lower()
    if candidate in {"1", "true", "yes", "existing", "exists"}:
        return True
    if candidate in {"0", "false", "no", "missing", "absent"}:
        return False
    return None


def _normalize_query_fragment(value: str) -> str:
    return _normalize_record_path(value).replace("%", "").strip()


def _artifact_query_where(filters: dict[str, Any]) -> tuple[list[str], list[Any]]:
    where_parts = ["1 = 1"]
    parameters: list[Any] = []
    if filters.get("docId"):
        where_parts.append("ref.doc_id = ?")
        parameters.append(filters["docId"])
    if filters.get("roundNumber") is not None:
        where_parts.append("rounds.round_number = ?")
        parameters.append(filters["roundNumber"])
    if filters.get("kinds"):
        placeholders = ", ".join("?" for _ in filters["kinds"])
        where_parts.append(f"artifact.kind IN ({placeholders})")
        parameters.extend(filters["kinds"])
    if filters.get("exists") is not None:
        where_parts.append("artifact.exists_flag = ?")
        parameters.append(1 if filters["exists"] else 0)
    if filters.get("minBytes") is not None:
        where_parts.append("artifact.bytes >= ?")
        parameters.append(filters["minBytes"])
    if filters.get("maxBytes") is not None:
        where_parts.append("artifact.bytes <= ?")
        parameters.append(filters["maxBytes"])
    if filters.get("pathContains"):
        where_parts.append("artifact.path LIKE ? ESCAPE '\\'")
        parameters.append(f"%{_escape_sql_like(filters['pathContains'])}%")
    return where_parts, parameters


def _escape_sql_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _history_artifact_query_item_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "path": str(row["path"] or ""),
        "absolutePath": str(row["absolute_path"] or ""),
        "kind": str(row["kind"] or "external"),
        "exists": bool(row["exists_flag"]),
        "bytes": _safe_int(row["bytes"]),
        "modifiedAt": str(row["modified_at"] or ""),
        "documentCount": _safe_int(row["document_count"]),
        "roundCount": _safe_int(row["round_count"]),
        "docIds": _split_group_concat(row["doc_ids"]),
        "roles": _split_group_concat(row["roles"]),
        "firstTimestamp": str(row["first_timestamp"] or ""),
        "lastTimestamp": str(row["last_timestamp"] or ""),
    }


def _history_artifact_query_stats_from_row(row: sqlite3.Row | None) -> dict[str, Any]:
    if row is None:
        return _empty_history_artifact_stats()
    stats = _empty_history_artifact_stats()
    for key in stats:
        stats[key] = _safe_int(row[key]) if key in row.keys() else 0
    return stats


def _split_group_concat(value: Any) -> list[str]:
    return [item for item in str(value or "").split(",") if item]


def _history_round_from_row(row: sqlite3.Row, artifact_stats: dict[str, Any]) -> dict[str, Any]:
    payload = _json_loads_dict(str(row["payload_json"]))
    if not isinstance(payload.get("round"), int):
        payload["round"] = int(row["round_number"])
    if not str(payload.get("prompt_profile", "")).strip():
        payload["prompt_profile"] = str(row["prompt_profile"] or LEGACY_PROMPT_PROFILE)
    if "prompt_sequence" not in payload:
        sequence_key = str(row["prompt_sequence_key"] or "")
        if sequence_key:
            payload["prompt_sequence"] = [part for part in sequence_key.split(",") if part]
    for field in ("prompt", "input_path", "output_path", "timestamp"):
        if not str(payload.get(field, "")).strip():
            payload[field] = str(row[field] or "")
    payload["artifactStats"] = artifact_stats
    return payload


def _empty_history_artifact_stats() -> dict[str, Any]:
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


def _history_artifact_stats_from_index_items(items: Iterable[dict[str, Any]]) -> dict[str, Any]:
    stats = _empty_history_artifact_stats()
    for item in items:
        path = _normalize_record_path(str(item.get("path", "")))
        if not path:
            continue
        if not _is_history_stats_safe_generated_artifact(path):
            stats["external"] += 1
            continue
        stats["total"] += 1
        if bool(item.get("exists")):
            stats["existing"] += 1
            kind = _history_stats_artifact_kind(path, str(item.get("kind", "")))
            if kind in {"intermediate", "exports", "reports", "sources"}:
                stats[kind] += 1
            stats["bytes"] += max(0, _safe_int(item.get("bytes")))
        else:
            stats["missing"] += 1
    return stats


def _history_stats_artifact_kind(path: str, stored_kind: str) -> str:
    kind = str(stored_kind or "").strip().lower()
    if kind in {"intermediate", "exports", "reports", "sources"}:
        return kind
    inferred_kind = _artifact_kind(path)
    return inferred_kind if inferred_kind in {"intermediate", "exports", "reports", "sources"} else "intermediate"


def _is_history_stats_safe_generated_artifact(path: str) -> bool:
    # Fast path: the stored paths are slash-normalized strings. The "safe
    # generated artifact" gate only ever returns True for paths rooted under
    # <ROOT_DIR>/finish/intermediate|web_exports, so reject any path that is
    # clearly outside ROOT_DIR without touching the filesystem (Path.resolve
    # stats every component and dominated the per-round artifact-stats build
    # for list_document_histories — ~50ms for a few hundred artifacts).
    normalized = _normalize_record_path(path)
    if not normalized:
        return False
    root_str = str(ROOT_DIR).replace("\\", "/").rstrip("/")
    if normalized.startswith(root_str + "/"):
        rel = normalized[len(root_str) + 1:]
    elif not PurePath(normalized).is_absolute():
        rel = normalized
    else:
        return False
    rel = rel.lstrip("/")
    parts = [part for part in rel.split("/") if part]
    return len(parts) >= 2 and parts[0] == "finish" and parts[1] in {"intermediate", "web_exports"}


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _ensure_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schema_migrations (
            migration_id TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS documents (
            doc_id TEXT PRIMARY KEY,
            origin_path TEXT NOT NULL,
            source_kind TEXT NOT NULL DEFAULT '',
            last_timestamp TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS rounds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            doc_id TEXT NOT NULL,
            round_number INTEGER NOT NULL,
            prompt_profile TEXT NOT NULL,
            prompt_sequence_key TEXT NOT NULL DEFAULT '',
            prompt TEXT NOT NULL DEFAULT '',
            input_path TEXT NOT NULL DEFAULT '',
            output_path TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}',
            FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
            UNIQUE (doc_id, round_number, prompt_profile, prompt_sequence_key)
        );

        CREATE TABLE IF NOT EXISTS artifacts (
            path TEXT PRIMARY KEY,
            absolute_path TEXT NOT NULL,
            kind TEXT NOT NULL,
            exists_flag INTEGER NOT NULL DEFAULT 0,
            bytes INTEGER NOT NULL DEFAULT 0,
            modified_at TEXT NOT NULL DEFAULT '',
            payload_json TEXT NOT NULL DEFAULT '{}'
        );

        CREATE TABLE IF NOT EXISTS artifact_refs (
            doc_id TEXT NOT NULL,
            round_id INTEGER,
            path TEXT NOT NULL,
            role TEXT NOT NULL,
            derived INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (doc_id, round_id, path, role),
            FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE,
            FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
            FOREIGN KEY (path) REFERENCES artifacts(path) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_rounds_doc ON rounds(doc_id);
        CREATE INDEX IF NOT EXISTS idx_artifact_refs_path ON artifact_refs(path);
        CREATE INDEX IF NOT EXISTS idx_artifacts_kind ON artifacts(kind);
        CREATE INDEX IF NOT EXISTS idx_artifacts_exists ON artifacts(exists_flag);
        """
    )
    _mark_schema_migrations(connection)


def _clear_index(connection: sqlite3.Connection) -> None:
    connection.execute("DELETE FROM artifact_refs")
    connection.execute("DELETE FROM artifacts")
    connection.execute("DELETE FROM rounds")
    connection.execute("DELETE FROM documents")


def _insert_document_entry(connection: sqlite3.Connection, doc_id: str, entry: Any) -> dict[str, int]:
    if not isinstance(entry, dict):
        return {"documents": 0, "rounds": 0, "artifactRefs": 0}

    origin_path = _normalize_record_path(str(entry.get("origin_path", doc_id)))
    rounds = [item for item in entry.get("rounds", []) if isinstance(item, dict)]
    last_timestamp = _last_round_timestamp(rounds)
    connection.execute(
        """
        INSERT INTO documents (doc_id, origin_path, source_kind, last_timestamp, payload_json)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            str(doc_id),
            origin_path,
            Path(origin_path).suffix.lower(),
            last_timestamp,
            _json_dumps(entry),
        ),
    )

    artifact_ref_count = 0
    if origin_path:
        _upsert_artifact(
            connection,
            path=origin_path,
            kind=_artifact_kind(origin_path),
            payload={"role": "origin_path"},
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO artifact_refs (doc_id, round_id, path, role, derived)
            VALUES (?, NULL, ?, ?, ?)
            """,
            (str(doc_id), origin_path, "origin_path", 0),
        )
        artifact_ref_count += 1

    round_count = 0
    for round_item in rounds:
        round_number = round_item.get("round")
        if not isinstance(round_number, int):
            continue
        round_count += 1
        prompt_profile = (
            str(round_item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower()
            or LEGACY_PROMPT_PROFILE
        )
        prompt_sequence_key = _prompt_sequence_key(round_item, prompt_profile)
        cursor = connection.execute(
            """
            INSERT INTO rounds (
                doc_id,
                round_number,
                prompt_profile,
                prompt_sequence_key,
                prompt,
                input_path,
                output_path,
                timestamp,
                payload_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(doc_id),
                round_number,
                prompt_profile,
                prompt_sequence_key,
                _normalize_record_path(str(round_item.get("prompt", ""))),
                _normalize_record_path(str(round_item.get("input_path", ""))),
                _normalize_record_path(str(round_item.get("output_path", ""))),
                str(round_item.get("timestamp", "")),
                _json_dumps(round_item),
            ),
        )
        round_id = int(cursor.lastrowid)
        for ref in _iter_round_artifact_refs(round_item):
            _upsert_artifact(connection, path=ref["path"], kind=ref["kind"], payload=ref)
            connection.execute(
                """
                INSERT OR IGNORE INTO artifact_refs (doc_id, round_id, path, role, derived)
                VALUES (?, ?, ?, ?, ?)
                """,
                (str(doc_id), round_id, ref["path"], ref["role"], int(bool(ref["derived"]))),
            )
            artifact_ref_count += 1

    return {"documents": 1, "rounds": round_count, "artifactRefs": artifact_ref_count}


def _delete_unreferenced_artifact_rows(connection: sqlite3.Connection) -> int:
    cursor = connection.execute(
        """
        DELETE FROM artifacts
        WHERE path NOT IN (
            SELECT DISTINCT path
            FROM artifact_refs
        )
        """
    )
    return int(cursor.rowcount or 0)


def _set_metadata(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        "INSERT INTO metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def _get_metadata(connection: sqlite3.Connection, key: str) -> str:
    row = connection.execute("SELECT value FROM metadata WHERE key = ?", (key,)).fetchone()
    return str(row[0]) if row else ""


def _count(connection: sqlite3.Connection, table: str) -> int:
    return int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])


def _mark_schema_migrations(connection: sqlite3.Connection) -> None:
    applied_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    for migration_id in MIGRATION_IDS:
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations (migration_id, applied_at) VALUES (?, ?)",
            (migration_id, applied_at),
        )


def _applied_migrations(connection: sqlite3.Connection) -> list[str]:
    try:
        rows = connection.execute("SELECT migration_id FROM schema_migrations ORDER BY migration_id").fetchall()
    except sqlite3.Error:
        return []
    return [str(row[0]) for row in rows]


def _normalize_round_filters(round_filters: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    seen: set[tuple[int, str, str]] = set()
    for item in round_filters or []:
        if not isinstance(item, dict):
            continue
        round_number = item.get("roundNumber", item.get("round"))
        if not isinstance(round_number, int):
            continue
        prompt_profile = (
            str(item.get("promptProfile", item.get("prompt_profile", LEGACY_PROMPT_PROFILE)) or LEGACY_PROMPT_PROFILE)
            .strip()
            .lower()
            or LEGACY_PROMPT_PROFILE
        )
        prompt_sequence_key = str(item.get("promptSequenceKey", item.get("prompt_sequence_key", "")) or "").strip().lower()
        key = (round_number, prompt_profile, prompt_sequence_key)
        if key in seen:
            continue
        seen.add(key)
        normalized.append({
            "roundNumber": round_number,
            "promptProfile": prompt_profile,
            "promptSequenceKey": prompt_sequence_key,
        })
    return normalized


def _expected_counts_from_records(records: dict[str, Any]) -> dict[str, int]:
    document_count = 0
    round_count = 0
    artifact_ref_count = 0
    artifact_paths: set[str] = set()

    for doc_id, entry in records.items():
        if not isinstance(entry, dict):
            continue
        document_count += 1
        origin_path = _normalize_record_path(str(entry.get("origin_path", doc_id)))
        if origin_path:
            artifact_paths.add(origin_path)
            artifact_ref_count += 1

        rounds = entry.get("rounds")
        if not isinstance(rounds, list):
            continue
        for round_item in rounds:
            if not isinstance(round_item, dict) or not isinstance(round_item.get("round"), int):
                continue
            round_count += 1
            for ref in _iter_round_artifact_refs(round_item):
                artifact_paths.add(ref["path"])
                artifact_ref_count += 1

    return {
        "documents": document_count,
        "rounds": round_count,
        "artifacts": len(artifact_paths),
        "artifactRefs": artifact_ref_count,
    }


def _stale_artifact_stat_samples(connection: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = connection.execute(
        "SELECT path, exists_flag, bytes FROM artifacts ORDER BY path"
    ).fetchall()
    samples: list[dict[str, Any]] = []
    for row in rows:
        path = str(row["path"] if isinstance(row, sqlite3.Row) else row[0])
        stored_exists = bool(row["exists_flag"] if isinstance(row, sqlite3.Row) else row[1])
        stored_bytes = int(row["bytes"] if isinstance(row, sqlite3.Row) else row[2])
        stat = _artifact_stat(path)
        actual_exists = bool(stat["exists"])
        actual_bytes = int(stat["bytes"])
        if stored_exists != actual_exists or stored_bytes != actual_bytes:
            samples.append({
                "path": path,
                "storedExists": stored_exists,
                "actualExists": actual_exists,
                "storedBytes": stored_bytes,
                "actualBytes": actual_bytes,
            })
    return samples


def _timestamp_for_filename() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _safe_backup_label(value: str) -> str:
    candidate = "".join(char if char.isalnum() or char in {"-", "_"} else "_" for char in str(value or "manual").strip())
    candidate = "_".join(part for part in candidate.split("_") if part)
    return (candidate or "manual")[:48]


def _next_history_backup_path(backup_dir: Path, reason: str) -> Path:
    stem = f"fyadr_history_{_timestamp_for_filename()}_{_safe_backup_label(reason)}"
    candidate = backup_dir / f"{stem}.sqlite3"
    suffix = 1
    while candidate.exists():
        candidate = backup_dir / f"{stem}_{suffix}.sqlite3"
        suffix += 1
    return candidate


def _file_size(path: Path) -> int:
    try:
        return int(path.stat().st_size)
    except OSError:
        return 0


def _sqlite_journal_paths(db_path: Path) -> list[Path]:
    return [
        db_path.with_name(f"{db_path.name}-wal"),
        db_path.with_name(f"{db_path.name}-shm"),
        db_path.with_name(f"{db_path.name}-journal"),
    ]


def _sqlite_file_size_with_journals(db_path: Path) -> int:
    return _file_size(db_path) + sum(_file_size(path) for path in _sqlite_journal_paths(db_path))


def _sqlite_storage_stats(db_path: Path) -> dict[str, Any]:
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return {
            "exists": False,
            "fileSizeBytes": 0,
            "pageSizeBytes": 0,
            "pageCount": 0,
            "freePageCount": 0,
            "freeBytes": 0,
            "freeRatio": 0,
        }
    try:
        with _connect_history_db(normalized_db_path) as connection:
            page_size = int(connection.execute("PRAGMA page_size").fetchone()[0] or 0)
            page_count = int(connection.execute("PRAGMA page_count").fetchone()[0] or 0)
            free_page_count = int(connection.execute("PRAGMA freelist_count").fetchone()[0] or 0)
    except Exception as exc:
        return {
            "exists": True,
            "fileSizeBytes": _sqlite_file_size_with_journals(normalized_db_path),
            "pageSizeBytes": 0,
            "pageCount": 0,
            "freePageCount": 0,
            "freeBytes": 0,
            "freeRatio": 0,
            "error": str(exc),
        }
    free_bytes = max(0, free_page_count * page_size)
    total_bytes = max(0, page_count * page_size)
    return {
        "exists": True,
        "fileSizeBytes": _sqlite_file_size_with_journals(normalized_db_path),
        "pageSizeBytes": page_size,
        "pageCount": page_count,
        "freePageCount": free_page_count,
        "freeBytes": free_bytes,
        "freeRatio": round(free_page_count / page_count, 4) if page_count else 0,
        "estimatedPageBytes": total_bytes,
    }


def _empty_maintenance_counters() -> dict[str, Any]:
    return {
        "deleteEventCount": 0,
        "deletedRowCount": 0,
        "deletedFileCount": 0,
        "lastDeleteAt": "",
        "lastCompactAt": "",
        "lastCompactReason": "",
    }


def _metadata_int(connection: sqlite3.Connection, key: str) -> int:
    try:
        return max(0, int(_get_metadata(connection, key) or 0))
    except (TypeError, ValueError):
        return 0


def _read_maintenance_counters(connection: sqlite3.Connection) -> dict[str, Any]:
    return {
        "deleteEventCount": _metadata_int(connection, "maintenance_delete_event_count"),
        "deletedRowCount": _metadata_int(connection, "maintenance_deleted_row_count"),
        "deletedFileCount": _metadata_int(connection, "maintenance_deleted_file_count"),
        "lastDeleteAt": _get_metadata(connection, "maintenance_last_delete_at"),
        "lastCompactAt": _get_metadata(connection, "maintenance_last_compact_at"),
        "lastCompactReason": _get_metadata(connection, "maintenance_last_compact_reason"),
    }


def _read_maintenance_counters_from_db(db_path: Path) -> dict[str, Any]:
    normalized_db_path = db_path.resolve()
    if not normalized_db_path.exists():
        return _empty_maintenance_counters()
    try:
        with _connect_history_db(normalized_db_path) as connection:
            connection.row_factory = sqlite3.Row
            _ensure_schema(connection)
            return _read_maintenance_counters(connection)
    except Exception:
        return _empty_maintenance_counters()


def _write_maintenance_counters(connection: sqlite3.Connection, counters: dict[str, Any]) -> None:
    _set_metadata(connection, "maintenance_delete_event_count", str(max(0, int(counters.get("deleteEventCount", 0) or 0))))
    _set_metadata(connection, "maintenance_deleted_row_count", str(max(0, int(counters.get("deletedRowCount", 0) or 0))))
    _set_metadata(connection, "maintenance_deleted_file_count", str(max(0, int(counters.get("deletedFileCount", 0) or 0))))
    _set_metadata(connection, "maintenance_last_delete_at", str(counters.get("lastDeleteAt", "") or ""))
    _set_metadata(connection, "maintenance_last_compact_at", str(counters.get("lastCompactAt", "") or ""))
    _set_metadata(connection, "maintenance_last_compact_reason", str(counters.get("lastCompactReason", "") or ""))


def _build_compaction_advice(
    counters: dict[str, Any],
    storage: dict[str, Any],
    *,
    delete_event_threshold: int = DEFAULT_COMPACT_DELETE_EVENT_THRESHOLD,
    deleted_row_threshold: int = DEFAULT_COMPACT_DELETED_ROW_THRESHOLD,
    free_bytes_threshold: int = DEFAULT_COMPACT_FREE_BYTES_THRESHOLD,
    free_ratio_threshold: float = DEFAULT_COMPACT_FREE_RATIO_THRESHOLD,
) -> dict[str, Any]:
    reasons: list[str] = []
    delete_events = int(counters.get("deleteEventCount", 0) or 0)
    deleted_rows = int(counters.get("deletedRowCount", 0) or 0)
    free_bytes = int(storage.get("freeBytes", 0) or 0)
    free_ratio = float(storage.get("freeRatio", 0) or 0)
    file_size = int(storage.get("fileSizeBytes", 0) or 0)
    if delete_event_threshold > 0 and delete_events >= delete_event_threshold:
        reasons.append("delete_event_threshold")
    if deleted_row_threshold > 0 and deleted_rows >= deleted_row_threshold:
        reasons.append("deleted_row_threshold")
    if free_bytes_threshold > 0 and free_bytes >= free_bytes_threshold:
        reasons.append("free_bytes_threshold")
    if free_ratio_threshold > 0 and free_ratio >= free_ratio_threshold and file_size >= free_bytes_threshold:
        reasons.append("free_ratio_threshold")
    return {
        "shouldCompact": bool(reasons),
        "reasons": reasons,
        "thresholds": {
            "deleteEventCount": delete_event_threshold,
            "deletedRowCount": deleted_row_threshold,
            "freeBytes": free_bytes_threshold,
            "freeRatio": free_ratio_threshold,
        },
    }


def _mark_history_index_compacted(db_path: Path, reason: str) -> None:
    compacted_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    with _connect_history_db(db_path.resolve()) as connection:
        connection.row_factory = sqlite3.Row
        _ensure_schema(connection)
        counters = _empty_maintenance_counters()
        counters["lastCompactAt"] = compacted_at
        counters["lastCompactReason"] = reason
        _write_maintenance_counters(connection, counters)
        connection.commit()


def _checkpoint_connection(connection: sqlite3.Connection) -> None:
    try:
        connection.execute("PRAGMA wal_checkpoint(TRUNCATE)")
    except sqlite3.DatabaseError:
        pass


def _iter_history_backup_files(backup_dir: Path = BACKUP_DIR) -> list[Path]:
    normalized_backup_dir = backup_dir.resolve()
    if not normalized_backup_dir.exists():
        return []
    return sorted(
        (path for path in normalized_backup_dir.glob("fyadr_history_*.sqlite3") if path.is_file()),
        key=lambda item: (item.stat().st_mtime if item.exists() else 0, item.name),
        reverse=True,
    )


def _backup_file_entry(path: Path) -> dict[str, Any]:
    normalized_path = path.resolve()
    modified_at = ""
    try:
        modified_at = datetime.fromtimestamp(normalized_path.stat().st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
    except OSError:
        pass
    return {
        "path": str(normalized_path),
        "name": normalized_path.name,
        "sizeBytes": _file_size(normalized_path),
        "modifiedAt": modified_at,
    }


def _prune_history_db_backups(backup_dir: Path, keep: int) -> list[str]:
    keep_count = max(0, int(keep or 0))
    if keep_count <= 0:
        return []
    backups = sorted(
        _iter_history_backup_files(backup_dir),
        key=lambda item: item.stat().st_mtime if item.exists() else 0,
        reverse=True,
    )
    pruned: list[str] = []
    for path in backups[keep_count:]:
        try:
            path.unlink()
            pruned.append(str(path))
        except OSError:
            continue
    return pruned


def _resolve_history_backup_path(backup_path: str | Path | None, backup_dir: Path) -> Path | None:
    normalized_backup_dir = backup_dir.resolve()
    if backup_path is None or not str(backup_path).strip():
        for candidate in sorted(
            _iter_history_backup_files(normalized_backup_dir),
            key=lambda item: item.stat().st_mtime if item.exists() else 0,
            reverse=True,
        ):
            validation = check_history_index(db_path=candidate)
            if bool(validation.get("ok")):
                return candidate.resolve()
        return None

    candidate = Path(backup_path)
    if not candidate.is_absolute():
        candidate = normalized_backup_dir / candidate
    candidate = candidate.resolve()
    if not is_path_under(candidate, normalized_backup_dir):
        raise ValueError(f"Backup path must stay under {normalized_backup_dir}")
    if not candidate.exists() or not candidate.is_file():
        raise ValueError(f"Backup file does not exist: {candidate}")
    return candidate


def _copy_current_db_file(db_path: Path, backup_dir: Path, reason: str) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    target = _next_history_backup_path(backup_dir, reason)
    shutil.copy2(db_path, target)
    return target


def _delete_sqlite_journal_files(db_path: Path) -> None:
    for path in _sqlite_journal_paths(db_path):
        try:
            if path.exists():
                path.unlink()
        except OSError:
            pass


def _build_check_report(
    checked_at: str,
    db_path: Path,
    status: dict[str, Any],
    expected_counts: dict[str, int] | None,
    issues: list[dict[str, Any]],
) -> dict[str, Any]:
    error_count = sum(1 for issue in issues if issue.get("severity") == "error")
    warning_count = sum(1 for issue in issues if issue.get("severity") == "warning")
    return {
        "ok": error_count == 0,
        "checkedAt": checked_at,
        "path": str(db_path),
        "status": status,
        "expectedCounts": expected_counts,
        "issueCount": len(issues),
        "errorCount": error_count,
        "warningCount": warning_count,
        "repairableIssueCount": sum(1 for issue in issues if bool(issue.get("repairable"))),
        "issues": issues,
    }


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _json_loads_dict(value: str) -> dict[str, Any]:
    try:
        payload = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _normalize_record_path(path: str) -> str:
    candidate = str(path or "").strip().replace("\\", "/")
    while "//" in candidate:
        candidate = candidate.replace("//", "/")
    return candidate


def _is_prompt_sequence_customizable(prompt_profile: str) -> bool:
    return bool(is_prompt_sequence_customizable(prompt_profile))


def _prompt_sequence_key(round_item: dict[str, Any], prompt_profile: str) -> str:
    if not _is_prompt_sequence_customizable(prompt_profile):
        return ""
    return ",".join(
        str(part).strip().lower()
        for part in round_item.get("prompt_sequence", [])
        if str(part).strip()
    )


def _record_path_to_absolute(path: str) -> Path | None:
    normalized = _normalize_record_path(path)
    if not normalized:
        return None
    candidate = Path(normalized)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate
    return candidate.resolve()


def _artifact_kind(path: str) -> str:
    absolute = _record_path_to_absolute(path)
    if absolute is None:
        return "external"
    try:
        relative = absolute.relative_to(ROOT_DIR)
    except ValueError:
        return "external"
    parts = relative.parts
    if not parts:
        return "external"
    if parts[0] == "origin":
        return "sources"
    if len(parts) < 2 or parts[0] != "finish":
        return "external"
    if parts[1] == "web_exports":
        return "exports"
    if parts[1] == "detection_reports":
        return "reports"
    if absolute.name.endswith((".audit.json", ".guard.json", "_validation.json", "_format_preflight.json")):
        return "reports"
    return "intermediate"


def _artifact_stat(path: str) -> dict[str, Any]:
    absolute = _record_path_to_absolute(path)
    if absolute is None:
        return {"absolutePath": "", "exists": False, "bytes": 0, "modifiedAt": ""}
    exists = absolute.exists() and absolute.is_file()
    bytes_count = 0
    modified_at = ""
    if exists:
        try:
            stat = absolute.stat()
            bytes_count = int(stat.st_size)
            modified_at = datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")
        except OSError:
            pass
    return {
        "absolutePath": str(absolute),
        "exists": exists,
        "bytes": bytes_count,
        "modifiedAt": modified_at,
    }


def _upsert_artifact(connection: sqlite3.Connection, *, path: str, kind: str, payload: dict[str, Any]) -> None:
    normalized_path = _normalize_record_path(path)
    if not normalized_path:
        return
    stat = _artifact_stat(normalized_path)
    connection.execute(
        """
        INSERT INTO artifacts (path, absolute_path, kind, exists_flag, bytes, modified_at, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(path) DO UPDATE SET
            absolute_path = excluded.absolute_path,
            kind = excluded.kind,
            exists_flag = excluded.exists_flag,
            bytes = excluded.bytes,
            modified_at = excluded.modified_at,
            payload_json = excluded.payload_json
        """,
        (
            normalized_path,
            stat["absolutePath"],
            kind,
            int(bool(stat["exists"])),
            int(stat["bytes"]),
            stat["modifiedAt"],
            _json_dumps(payload),
        ),
    )


def _last_round_timestamp(rounds: Iterable[dict[str, Any]]) -> str:
    timestamps = sorted(str(item.get("timestamp", "")) for item in rounds if str(item.get("timestamp", "")).strip())
    return timestamps[-1] if timestamps else ""


def _iter_round_artifact_refs(round_item: dict[str, Any]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    def add(path: str, role: str, *, derived: bool = False) -> None:
        normalized_path = _normalize_record_path(path)
        if not normalized_path:
            return
        key = (normalized_path, role)
        if key in seen:
            return
        seen.add(key)
        refs.append({
            "path": normalized_path,
            "role": role,
            "kind": _artifact_kind(normalized_path),
            "derived": derived,
        })

    for field in PATH_FIELDS:
        value = round_item.get(field)
        if isinstance(value, str) and value.strip():
            add(value, field)

    output_path = round_item.get("output_path")
    if isinstance(output_path, str) and output_path.strip():
        for path in _derived_paths_for_output(output_path):
            add(path, "derived_from_output", derived=True)
    compare_path = round_item.get("compare_path")
    if isinstance(compare_path, str) and compare_path.strip():
        compare = Path(_normalize_record_path(compare_path))
        add(str(compare.with_name(f"{compare.stem}_review_decisions.json")), "review_decisions", derived=True)

    return refs


def _derived_paths_for_output(output_path: str) -> list[str]:
    normalized_output = _normalize_record_path(output_path)
    if not normalized_output:
        return []
    output = Path(normalized_output)
    stem = output.stem
    parent = output.parent
    paths = [
        parent / f"{stem}_checkpoint.json",
        parent / f"{stem}_compare.json",
        parent / f"{stem}_quality.json",
        parent / f"{stem}_bodymap.json",
        parent / f"{stem}_body_map.json",
        parent / f"{stem}_validation.json",
    ]
    for export_stem in (stem, f"{stem}_reviewed"):
        for suffix in (".txt", ".docx", ".audit.json", ".guard.json"):
            paths.append(Path("finish") / "web_exports" / f"{export_stem}{suffix}")
        paths.append(Path("finish") / "intermediate" / f"{export_stem}_format_preflight.json")
    return [_normalize_record_path(str(path)) for path in paths]
