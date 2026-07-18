from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT_DIR / "scripts"))

from app_service import get_document_history, list_document_histories, query_history_artifact_governance  # noqa: E402
from fyadr_history_db import (  # noqa: E402
    DB_PATH,
    MAX_BACKUP_KEEP,
    apply_history_delete_maintenance as sqlite_apply_history_delete_maintenance,
    backup_history_index as sqlite_backup_history_index,
    coerce_backup_keep,
    compact_history_index as sqlite_compact_history_index,
    get_history_document_from_index,
    get_history_index_maintenance_summary as sqlite_get_history_index_maintenance_summary,
    list_history_index_backups as sqlite_list_history_index_backups,
    list_history_documents_from_index,
    query_history_artifacts_from_index,
    recover_history_index as sqlite_recover_history_index,
)
from fyadr_records import (  # noqa: E402
    RECORDS_PATH,
    check_history_index,
    delete_document,
    ensure_history_governance_ready,
    ensure_history_index_ready,
    get_history_index_status,
    list_records,
    list_referenced_history_artifact_paths,
    load_records_normalized,
    preview_delete_document,
    query_history_artifacts,
    rebuild_history_index,
    repair_history_index,
    save_records,
    update_round,
)


TEST_DOC_ID = "origin/__fyadr_history_db_regression__.txt"
REGRESSION_BACKUP_DIR = ROOT_DIR / "finish" / "regression" / "history_db_backups" / "__history_db_regression__"


def _backup(path: Path) -> bytes | None:
    return path.read_bytes() if path.exists() else None


def _restore(path: Path, payload: bytes | None) -> None:
    if payload is None:
        if path.exists():
            path.unlink()
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _strip_test_record_from_json() -> None:
    if not RECORDS_PATH.exists():
        return
    try:
        records = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(records, dict) or TEST_DOC_ID not in records:
        return
    records.pop(TEST_DOC_ID, None)
    RECORDS_PATH.write_text(json.dumps(records, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")


def _write_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path


def _relative(path: Path) -> str:
    return str(path.resolve().relative_to(ROOT_DIR)).replace("\\", "/")


def _write_usable_round_artifacts(
    output_relative: str,
    *,
    doc_id: str,
    round_number: int,
    input_relative: str,
) -> dict[str, Any]:
    output_path = ROOT_DIR / output_relative
    input_path = ROOT_DIR / input_relative
    manifest_path = output_path.with_name(f"{output_path.stem}_manifest.json")
    compare_path = output_path.with_name(f"{output_path.stem}_compare.json")
    input_text = input_path.read_text(encoding="utf-8") if input_path.exists() else f"history regression input {round_number}"
    output_text = f"history regression output {round_number}"
    _write_text(output_path, output_text)
    _write_text(
        manifest_path,
        json.dumps(
            {
                "chunk_limit": 1800,
                "chunk_metric": "char",
                "paragraph_count": 1,
                "chunk_count": 1,
                "paragraphs": [
                    {
                        "paragraph_index": 0,
                        "original_text": input_text,
                        "chunk_ids": ["p0_c0"],
                        "split_reason": "paragraph-kept",
                        "original_metric_count": len(input_text),
                    }
                ],
                "chunks": [
                    {
                        "chunk_id": "p0_c0",
                        "paragraph_index": 0,
                        "chunk_index": 0,
                        "text": input_text,
                        "char_count": len(input_text),
                        "word_count": len(input_text.split()),
                        "paragraph_indices": [0],
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
    )
    _write_text(
        compare_path,
        json.dumps(
            {
                "version": 2,
                "docId": doc_id,
                "round": round_number,
                "promptProfile": "cn",
                "promptSequence": ["classical"],
                "inputPath": input_relative,
                "outputPath": output_relative,
                "manifestPath": _relative(manifest_path),
                "paragraphCount": 1,
                "chunkCount": 1,
                "chunks": [
                    {
                        "chunkId": "p0_c0",
                        "paragraphIndex": 0,
                        "chunkIndex": 0,
                        "inputText": input_text,
                        "outputText": output_text,
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
    )
    return {
        "input_path": input_relative,
        "output_path": output_relative,
        "manifest_path": _relative(manifest_path),
        "compare_path": _relative(compare_path),
        "input_segment_count": 1,
        "output_segment_count": 1,
        "_created_paths": [output_path, manifest_path, compare_path],
    }


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _unlink_with_retries(path: Path, attempts: int = 8) -> None:
    for attempt in range(attempts):
        try:
            path.unlink()
            return
        except FileNotFoundError:
            return
        except OSError:
            if attempt == attempts - 1:
                return
            time.sleep(0.15)


def _fetch_counts() -> dict[str, int]:
    with sqlite3.connect(str(DB_PATH.resolve())) as connection:
        return {
            "documents": int(connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0]),
            "rounds": int(connection.execute("SELECT COUNT(*) FROM rounds").fetchone()[0]),
            "artifacts": int(connection.execute("SELECT COUNT(*) FROM artifacts").fetchone()[0]),
            "refs": int(connection.execute("SELECT COUNT(*) FROM artifact_refs").fetchone()[0]),
            "testDocs": int(connection.execute("SELECT COUNT(*) FROM documents WHERE doc_id = ?", (TEST_DOC_ID,)).fetchone()[0]),
            "testOutputs": int(connection.execute("SELECT COUNT(*) FROM artifacts WHERE path = ?", ("finish/intermediate/__fyadr_history_db_regression___round1.txt",)).fetchone()[0]),
            "testRound2Outputs": int(connection.execute("SELECT COUNT(*) FROM artifacts WHERE path = ?", ("finish/intermediate/__fyadr_history_db_regression___round2.txt",)).fetchone()[0]),
        }


def _insert_sql_only_artifact_ref(path: Path, *, round_number: int) -> str:
    relative_path = str(path.relative_to(ROOT_DIR)).replace("\\", "/")
    stat = path.stat()
    with sqlite3.connect(str(DB_PATH.resolve())) as connection:
        connection.row_factory = sqlite3.Row
        round_row = connection.execute(
            """
            SELECT id
            FROM rounds
            WHERE doc_id = ? AND round_number = ? AND prompt_profile = ? AND prompt_sequence_key = ?
            """,
            (TEST_DOC_ID, round_number, "cn", ""),
        ).fetchone()
        if round_row is None:
            raise AssertionError("round row must exist before inserting SQL-only artifact ref")
        connection.execute(
            """
            INSERT OR REPLACE INTO artifacts (path, absolute_path, kind, exists_flag, bytes, modified_at, payload_json)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                relative_path,
                str(path.resolve()),
                "reports",
                1,
                int(stat.st_size),
                "2026-01-01T00:00:00Z",
                "{}",
            ),
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO artifact_refs (doc_id, round_id, path, role, derived)
            VALUES (?, ?, ?, ?, ?)
            """,
            (TEST_DOC_ID, int(round_row["id"]), relative_path, "sql_preview_probe", 1),
        )
        connection.commit()
    return relative_path


def run_regression() -> dict[str, Any]:
    records_backup = _backup(RECORDS_PATH)
    db_backup = _backup(DB_PATH)
    original_backup_dir_env = os.environ.get("FYADR_HISTORY_BACKUP_DIR")
    os.environ["FYADR_HISTORY_BACKUP_DIR"] = str(REGRESSION_BACKUP_DIR)
    if REGRESSION_BACKUP_DIR.exists():
        shutil.rmtree(REGRESSION_BACKUP_DIR, ignore_errors=True)
    existing_backup_files = set(REGRESSION_BACKUP_DIR.glob("fyadr_history_*.sqlite3")) if REGRESSION_BACKUP_DIR.exists() else set()
    created_paths: list[Path] = []
    checks: list[str] = []

    try:
        source_path = _write_text(ROOT_DIR / TEST_DOC_ID, "source")
        round1_fields = _write_usable_round_artifacts(
            "finish/intermediate/__fyadr_history_db_regression___round1.txt",
            doc_id=TEST_DOC_ID,
            round_number=1,
            input_relative=TEST_DOC_ID,
        )
        created_paths.extend([source_path, *round1_fields.pop("_created_paths")])

        records = load_records_normalized()
        records[TEST_DOC_ID] = {
            "origin_path": TEST_DOC_ID,
            "rounds": [
                {
                    "round": 1,
                    "prompt": "prompts/rewrite-pass-1.md",
                    "prompt_profile": "cn",
                    "timestamp": "2026-01-01T00:00:00Z",
                    **round1_fields,
                }
            ],
        }
        save_records(records)
        status = get_history_index_status(refresh=True)
        health = check_history_index()
        counts = _fetch_counts()

        _assert(status["exists"] is True, "SQLite index must exist after saving records")
        _assert(status["schemaVersion"] == 2, "SQLite index must expose schema version")
        _assert(status["migrationCount"] >= 2, "SQLite index must expose applied migrations")
        _assert(health["ok"] is True, "fresh SQLite index must pass integrity checks")
        _assert(counts["testDocs"] == 1, "SQLite index must include the saved document")
        _assert(counts["testOutputs"] == 1, "SQLite index must include direct output artifacts")
        _assert(counts["rounds"] >= 1, "SQLite index must include round rows")
        _assert(counts["refs"] >= 4, "SQLite index must include artifact references")
        checks.append("save_records synchronizes document, round, artifact references, and migration state")

        round2_fields = _write_usable_round_artifacts(
            "finish/intermediate/__fyadr_history_db_regression___round2.txt",
            doc_id=TEST_DOC_ID,
            round_number=2,
            input_relative="finish/intermediate/__fyadr_history_db_regression___round1.txt",
        )
        created_paths.extend(round2_fields.pop("_created_paths"))
        updated_doc = update_round(
            doc_id=TEST_DOC_ID,
            round_number=2,
            prompt="prompts/rewrite-pass-2.md",
            prompt_profile="cn",
            **round2_fields,
        )
        transaction_health = check_history_index()
        transaction_counts = _fetch_counts()
        _assert(transaction_health["ok"] is True, "transactional update_round must leave the SQLite index healthy")
        _assert(len(updated_doc.get("rounds", [])) == 2, "transactional update_round must return the updated document")
        _assert(transaction_counts["testRound2Outputs"] == 1, "transactional update_round must register new output artifacts")
        checks.append("update_round writes through a SQLite transaction before exporting JSON")

        stale_backup_records = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
        stale_backup_rounds = stale_backup_records[TEST_DOC_ID]["rounds"]
        stale_backup_records[TEST_DOC_ID]["rounds"] = [
            item for item in stale_backup_rounds if isinstance(item, dict) and item.get("round") == 1
        ]
        RECORDS_PATH.write_text(json.dumps(stale_backup_records, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
        stale_backup_health = check_history_index()
        _assert(stale_backup_health["ok"] is True, "stale JSON backup must not make the primary SQLite index unhealthy")
        _assert(
            any(item.get("code") == "json_backup_stale" for item in stale_backup_health.get("issues", [])),
            "integrity check must report a stale JSON compatibility backup as repairable drift",
        )
        readiness = ensure_history_index_ready(reason="regression_json_stale", max_age_seconds=0)
        _assert(readiness["ok"] is True, "startup self-check must tolerate and repair stale JSON backups")
        _assert(
            "refresh-json-backup" in readiness.get("actions", []),
            "startup self-check must refresh stale JSON compatibility backups from SQLite",
        )
        primary_records = list_records()
        primary_rounds = primary_records.get(TEST_DOC_ID, {}).get("rounds", [])
        _assert(len(primary_rounds) == 2, "list_records must prefer SQLite and retain newer rounds when JSON is stale")
        refreshed_backup_records = json.loads(RECORDS_PATH.read_text(encoding="utf-8"))
        refreshed_rounds = refreshed_backup_records.get(TEST_DOC_ID, {}).get("rounds", [])
        _assert(len(refreshed_rounds) == 2, "list_records must refresh the JSON compatibility backup from SQLite")
        checks.append("SQLite startup self-check refreshes stale JSON backups without overwriting newer history")

        maintenance_backup = sqlite_backup_history_index(reason="regression", keep=1000, backup_dir=REGRESSION_BACKUP_DIR)
        _assert(maintenance_backup["ok"] is True, "history DB backup must create a validated copy")
        _assert(Path(maintenance_backup["path"]).exists(), "history DB backup file must exist on disk")
        backup_listing = sqlite_list_history_index_backups(validate=True, backup_dir=REGRESSION_BACKUP_DIR)
        _assert(
            any(item.get("path") == maintenance_backup["path"] and item.get("ok") is True for item in backup_listing.get("items", [])),
            "backup listing must include validated backups",
        )
        with sqlite3.connect(str(DB_PATH.resolve())) as connection:
            connection.execute("DELETE FROM documents WHERE doc_id = ?", (TEST_DOC_ID,))
            connection.commit()
        _assert(_fetch_counts()["testDocs"] == 0, "test must damage the live database before recovery")
        recovered = sqlite_recover_history_index(backup_path=maintenance_backup["path"], keep=1000, backup_dir=REGRESSION_BACKUP_DIR)
        _assert(recovered["ok"] is True, "history DB recovery must restore from a validated backup")
        _assert(_fetch_counts()["testDocs"] == 1, "history DB recovery must restore document rows")
        compacted = sqlite_compact_history_index(keep=1000, backup_dir=REGRESSION_BACKUP_DIR)
        _assert(compacted["ok"] is True, "history DB compaction must preserve a healthy index")
        _assert(compacted.get("backup", {}).get("ok") is True, "history DB compaction must create a pre-compaction backup")
        checks.append("history DB backup, listing, recovery, and compaction preserve a healthy index")

        # keep coercion guards the retention floor: keep<=0 used to prune every
        # backup (including the one just written), and a huge keep would never prune.
        _assert(coerce_backup_keep(0) == 12, "keep=0 must fall back to the default instead of pruning all backups")
        _assert(coerce_backup_keep(-5) == 12, "negative keep must fall back to the default")
        _assert(coerce_backup_keep("not-an-int") == 12, "non-integer keep must fall back to the default")
        _assert(coerce_backup_keep(1_000_000) == MAX_BACKUP_KEEP, "huge keep must clamp to the configured ceiling")
        _assert(coerce_backup_keep(5) == 5, "in-range keep must pass through unchanged")
        _assert(coerce_backup_keep(1000) == MAX_BACKUP_KEEP, "keep above the ceiling must clamp rather than grow unbounded")
        zero_keep_backup = sqlite_backup_history_index(reason="regression_keep_floor", keep=0, backup_dir=REGRESSION_BACKUP_DIR)
        _assert(zero_keep_backup["ok"] is True, "backup with keep=0 must still succeed")
        _assert(Path(zero_keep_backup["path"]).exists(), "backup written under keep=0 must survive coercion (not be pruned away)")
        checks.append("backup keep coercion floors retention at the default and clamps to a ceiling")

        maintenance_summary = sqlite_get_history_index_maintenance_summary(backup_dir=REGRESSION_BACKUP_DIR)
        _assert(maintenance_summary.get("ok") is True, "maintenance summary must expose SQLite history diagnostics")
        forced_policy = sqlite_apply_history_delete_maintenance(
            reason="regression_policy",
            rounds_deleted=1,
            keep=1000,
            backup_dir=REGRESSION_BACKUP_DIR,
            delete_event_threshold=1,
            deleted_row_threshold=1,
            free_bytes_threshold=1024 * 1024 * 1024,
        )
        _assert(forced_policy.get("ok") is True, "delete maintenance policy must compact successfully when thresholds are met")
        _assert(forced_policy.get("compact", {}).get("ok") is True, "delete maintenance policy must run a validated compaction")
        _assert(
            forced_policy.get("counters", {}).get("deleteEventCount") == 0,
            "successful automatic compaction must reset delete maintenance counters",
        )
        checks.append("history DB maintenance policy reports diagnostics and auto-compacts after delete thresholds")

        pending_policy = sqlite_apply_history_delete_maintenance(
            reason="regression_pending_governance",
            rounds_deleted=128,
            keep=1000,
            backup_dir=REGRESSION_BACKUP_DIR,
            delete_event_threshold=9999,
            deleted_row_threshold=9999,
            free_bytes_threshold=1024 * 1024 * 1024,
            free_ratio_threshold=1.0,
        )
        _assert(pending_policy.get("compact") is None, "test setup must leave compaction pending for background governance")
        pending_summary = sqlite_get_history_index_maintenance_summary(backup_dir=REGRESSION_BACKUP_DIR)
        _assert(
            pending_summary.get("policy", {}).get("shouldCompact") is True,
            "maintenance summary must report pending compaction before background governance",
        )
        governed = ensure_history_governance_ready(reason="regression_background_governance", max_age_seconds=0, keep=1000)
        _assert(governed.get("ok") is True, "background history governance must finish cleanly")
        _assert("compact-index" in governed.get("actions", []), "background governance must compact when maintenance policy asks for it")
        _assert(governed.get("compact", {}).get("ok") is True, "background governance compaction must be validated")
        _assert(
            governed.get("after", {}).get("policy", {}).get("shouldCompact") is False,
            "background governance must clear the pending compaction policy",
        )
        checks.append("background history governance auto-compacts pending SQLite maintenance without user action")

        sql_only_artifact = _write_text(
            ROOT_DIR / "finish" / "intermediate" / "__fyadr_history_db_regression___round2_sql_preview.audit.json",
            "{}",
        )
        created_paths.append(sql_only_artifact)
        sql_only_relative_path = _insert_sql_only_artifact_ref(sql_only_artifact, round_number=2)
        sql_preview = preview_delete_document(TEST_DOC_ID, from_round=2, mode="records_and_artifacts")
        _assert(
            any(item.get("relativePath") == sql_only_relative_path for item in sql_preview.get("files", [])),
            "delete preview must use SQLite artifact refs before falling back to JSON-derived paths",
        )
        checks.append("delete preview derives affected artifacts from SQLite refs")

        indexed_document = get_history_document_from_index(TEST_DOC_ID)
        _assert(isinstance(indexed_document, dict), "SQL-native document history detail must be available")
        indexed_round2 = next(
            (
                item
                for item in indexed_document.get("rounds", [])
                if isinstance(item, dict) and item.get("round") == 2
            ),
            {},
        )
        _assert(
            indexed_round2.get("artifactStats", {}).get("reports", 0) >= 1,
            "SQL-native round stats must include SQL-only artifact references",
        )
        indexed_summaries = list_history_documents_from_index()
        indexed_summary = next(
            (
                item
                for item in indexed_summaries or []
                if isinstance(item, dict) and item.get("docId") == TEST_DOC_ID
            ),
            {},
        )
        _assert(
            indexed_summary.get("artifactStats", {}).get("reports", 0) >= 1,
            "SQL-native document summaries must include SQL-only artifact references",
        )

        service_history = get_document_history(str(ROOT_DIR / TEST_DOC_ID))
        service_round2 = next(
            (
                item
                for item in service_history.get("rounds", [])
                if isinstance(item, dict) and item.get("round") == 2
            ),
            {},
        )
        _assert(
            service_round2.get("artifactStats", {}).get("reports", 0) >= 1,
            "app history detail must prefer SQL-native artifact stats",
        )
        service_list = list_document_histories()
        service_summary = next(
            (
                item
                for item in service_list.get("items", [])
                if isinstance(item, dict) and item.get("docId") == TEST_DOC_ID
            ),
            {},
        )
        _assert(
            service_summary.get("artifactStats", {}).get("reports", 0) >= 1,
            "app history list must prefer SQL-native artifact stats",
        )
        checks.append("history list/detail APIs use SQL-native artifact stats")

        artifact_query = query_history_artifacts_from_index({
            "docId": TEST_DOC_ID,
            "roundNumber": 2,
            "kind": "reports",
            "exists": "existing",
            "minBytes": 1,
            "maxBytes": 10,
            "pathContains": "sql_preview",
        })
        _assert(isinstance(artifact_query, dict) and artifact_query.get("ok") is True, "SQL-native artifact query must be available")
        _assert(
            any(item.get("path") == sql_only_relative_path for item in artifact_query.get("items", [])),
            "SQL-native artifact query must filter by document, round, kind, state, and path",
        )
        _assert(artifact_query.get("stats", {}).get("reports", 0) >= 1, "artifact query stats must include filtered report artifacts")
        hidden_from_round1 = query_history_artifacts_from_index({
            "docId": TEST_DOC_ID,
            "roundNumber": 1,
            "pathContains": "sql_preview",
        })
        _assert(
            isinstance(hidden_from_round1, dict) and hidden_from_round1.get("total") == 0,
            "artifact query round filter must exclude artifacts from other rounds",
        )
        records_query = query_history_artifacts({
            "docId": TEST_DOC_ID,
            "kind": "reports",
            "exists": "existing",
            "pathContains": "sql_preview",
        })
        service_query = query_history_artifact_governance({
            "docId": TEST_DOC_ID,
            "kind": "reports",
            "exists": "existing",
            "pathContains": "sql_preview",
        })
        _assert(records_query.get("total", 0) >= 1, "records CLI helper must expose SQL artifact filtering")
        _assert(service_query.get("total", 0) >= 1, "app service must expose SQL artifact filtering")
        checks.append("history artifact governance queries filter SQLite by document, round, kind, state, and path")

        json_after_save = _backup(RECORDS_PATH)
        RECORDS_PATH.unlink()
        indexed_records = list_records()
        _assert(TEST_DOC_ID in indexed_records, "list_records must read from SQLite when JSON is unavailable")
        indexed_refs = list_referenced_history_artifact_paths()
        _assert(
            indexed_refs is not None and "finish/intermediate/__fyadr_history_db_regression___round1.txt" in indexed_refs,
            "artifact reference reads must come from SQLite when JSON is unavailable",
        )
        _restore(RECORDS_PATH, json_after_save)
        checks.append("history and artifact-reference reads can use SQLite as the primary source")

        rebuilt_status = rebuild_history_index(strict=True)
        rebuilt_counts = _fetch_counts()
        _assert(rebuilt_status["exists"] is True, "forced rebuild must keep the SQLite database available")
        _assert(rebuilt_counts["testDocs"] == 1, "forced rebuild must preserve document rows")
        _assert(rebuilt_counts["testOutputs"] == 1, "forced rebuild must preserve artifact rows")
        checks.append("forced rebuild refreshes the SQLite index from JSON records")

        with sqlite3.connect(str(DB_PATH.resolve())) as connection:
            connection.execute(
                "DELETE FROM artifact_refs WHERE doc_id = ? AND path = ? AND role = ?",
                (TEST_DOC_ID, "finish/intermediate/__fyadr_history_db_regression___round1.txt", "output_path"),
            )
            connection.commit()
        broken_health = check_history_index()
        _assert(broken_health["ok"] is False, "integrity check must detect damaged artifact references")
        _assert(
            any(item.get("code") == "artifactRefs_count_mismatch" for item in broken_health["issues"]),
            "integrity check must explain artifact reference drift",
        )
        auto_repaired = ensure_history_index_ready(reason="regression_auto_repair", max_age_seconds=0)
        auto_repaired_counts = _fetch_counts()
        _assert(auto_repaired["ok"] is True, "startup self-check must repair SQLite row-count drift")
        _assert("repair-index" in auto_repaired.get("actions", []), "startup self-check must report index repair action")
        _assert(auto_repaired_counts["refs"] >= 4, "startup self-check must restore missing artifact references")
        with sqlite3.connect(str(DB_PATH.resolve())) as connection:
            connection.execute(
                "DELETE FROM artifact_refs WHERE doc_id = ? AND path = ? AND role = ?",
                (TEST_DOC_ID, "finish/intermediate/__fyadr_history_db_regression___round1.txt", "output_path"),
            )
            connection.commit()
        repaired = repair_history_index(strict=True)
        repaired_counts = _fetch_counts()
        _assert(repaired["ok"] is True, "repair must leave the SQLite index healthy")
        _assert(repaired_counts["refs"] >= 4, "repair must restore missing artifact references")
        checks.append("startup self-check and history-db-repair restore SQLite index drift")

        delete_result = delete_document(TEST_DOC_ID, mode="records_only")
        deleted_counts = _fetch_counts()
        records_after_delete = list_records()
        delete_health = check_history_index()
        _assert(delete_result["removedDocument"] is True, "records-only delete must remove the document record")
        _assert(TEST_DOC_ID not in records_after_delete, "records-only delete must export JSON without the document")
        _assert(deleted_counts["testDocs"] == 0, "transactional delete must remove the SQLite document row")
        _assert(deleted_counts["testOutputs"] == 0, "transactional delete must remove unreferenced artifact rows")
        _assert(delete_health["ok"] is True, "transactional delete must leave the SQLite index healthy")
        _assert(
            delete_result.get("historyMaintenance", {}).get("backup", {}).get("ok") is True,
            "records delete must create a validated SQLite backup before mutating history",
        )
        _assert(
            Path(delete_result.get("historyMaintenance", {}).get("backup", {}).get("path", "")).exists(),
            "records delete backup file must exist on disk",
        )
        _assert(
            delete_result.get("historyMaintenance", {}).get("policy", {}).get("ok") is True,
            "records delete must record maintenance policy state after mutation",
        )
        checks.append("delete_document backs up SQLite before mutation and records maintenance policy state")

    finally:
        _restore(RECORDS_PATH, records_backup)
        _restore(DB_PATH, db_backup)
        _strip_test_record_from_json()
        for path in sorted(set(created_paths), key=lambda item: len(str(item)), reverse=True):
            try:
                if path.exists() and path.is_file():
                    path.unlink()
            except OSError:
                pass
        rebuild_history_index(strict=False)
        if REGRESSION_BACKUP_DIR.exists():
            for backup_path in set(REGRESSION_BACKUP_DIR.glob("fyadr_history_*.sqlite3")):
                is_regression_backup = any(
                    marker in backup_path.name
                    for marker in ("regression", "fyadr_history_db_regression")
                )
                if backup_path in existing_backup_files and not is_regression_backup:
                    continue
                _unlink_with_retries(backup_path)
        shutil.rmtree(REGRESSION_BACKUP_DIR, ignore_errors=True)
        if original_backup_dir_env is None:
            os.environ.pop("FYADR_HISTORY_BACKUP_DIR", None)
        else:
            os.environ["FYADR_HISTORY_BACKUP_DIR"] = original_backup_dir_env

    return {"ok": True, "checks": checks}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
