from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_history_db as history_db  # noqa: E402
import fyadr_records as records_service  # noqa: E402


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _records(doc_id: str, *, round_count: int) -> dict[str, Any]:
    return {
        doc_id: {
            "origin_path": doc_id,
            "rounds": [
                {
                    "round": index + 1,
                    "prompt": f"prompt-{index + 1}",
                    "input_path": f"finish/{doc_id.replace('/', '_')}_r{index + 1}_in.txt",
                    "output_path": f"finish/{doc_id.replace('/', '_')}_r{index + 1}_out.txt",
                    "prompt_profile": "cn_custom",
                }
                for index in range(round_count)
            ],
        }
    }


def main() -> int:
    original_records_path = records_service.RECORDS_PATH
    original_load_index = records_service._load_records_from_history_index
    original_recover = history_db.recover_history_index
    original_rebuild = history_db.rebuild_history_index
    original_check = history_db.check_history_index
    original_get_status = history_db.get_history_index_status
    checks: list[str] = []

    with tempfile.TemporaryDirectory(prefix="fyadr_history_reconcile_") as temp_dir:
        temp_path = Path(temp_dir)
        records_path = temp_path / "fyadr_records.json"
        records_service.RECORDS_PATH = records_path

        recovered_records = records_service.normalize_records(_records("origin/backup.docx", round_count=1))
        preserved_json_records = records_service.normalize_records(_records("origin/newer.docx", round_count=3))
        rebuilt_calls: list[dict[str, Any]] = []
        recover_calls: list[dict[str, Any]] = []
        check_calls: list[dict[str, Any]] = []

        def fake_recover(**kwargs: Any) -> dict[str, Any]:
            recover_calls.append(dict(kwargs))
            return {"ok": True, "backupPath": str(temp_path / "healthy-backup.sqlite3")}

        def fake_rebuild(records: dict[str, Any], *, records_hash: str = "", **_kwargs: Any) -> dict[str, Any]:
            normalized = records_service.normalize_records(records)
            rebuilt_calls.append({"records": normalized, "recordsHash": records_hash})
            return {
                "rebuilt": True,
                "documentCount": len(normalized),
                "recordsHash": records_hash,
            }

        def fake_check(records: dict[str, Any] | None = None, *, records_hash: str = "", **_kwargs: Any) -> dict[str, Any]:
            check_calls.append({"records": records, "recordsHash": records_hash})
            return {
                "ok": True,
                "errorCount": 0,
                "documentCount": len(records or {}),
                "recordsHash": records_hash,
            }

        history_db.recover_history_index = fake_recover
        history_db.rebuild_history_index = fake_rebuild
        history_db.check_history_index = fake_check
        history_db.get_history_index_status = lambda **_kwargs: {
            "exists": True,
            "documentCount": len(preserved_json_records),
            "roundCount": sum(
                len(entry.get("rounds", []))
                for entry in preserved_json_records.values()
                if isinstance(entry, dict)
            ),
            "recordsHash": records_service._records_hash(preserved_json_records),
        }
        records_service._load_records_from_history_index = lambda _expected_hash=None: recovered_records

        try:
            original_json_text = json.dumps(
                preserved_json_records,
                ensure_ascii=False,
                indent=2,
                sort_keys=True,
            )
            records_path.write_text(original_json_text, encoding="utf-8")
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is True, f"valid JSON reconciliation failed: {result}")
            _assert(
                records_path.read_text(encoding="utf-8") == original_json_text,
                "recovery rewrote or rolled back the valid pre-recovery JSON generation",
            )
            _assert(len(rebuilt_calls) == 1, "different recovered/JSON generations must rebuild the index once")
            _assert(
                rebuilt_calls[0]["records"] == preserved_json_records,
                "recovery rebuilt SQLite from the stale backup instead of preserved JSON",
            )
            _assert(
                rebuilt_calls[0]["recordsHash"] == records_service._records_hash(preserved_json_records),
                "JSON reconciliation used the wrong logical records hash",
            )
            _assert(
                result.get("after", {}).get("recordsHash")
                == records_service._records_hash(preserved_json_records)
                and result.get("validation", {}).get("ok") is True,
                "result.after/validation did not describe the post-rebuild JSON generation",
            )
            reconciliation = result.get("reconciliation") or {}
            _assert(
                reconciliation.get("action") == "rebuild-index-from-preserved-json",
                f"reconciliation action was not explicit: {reconciliation}",
            )
            _assert(
                reconciliation.get("jsonDocumentCount") == 1
                and reconciliation.get("jsonRoundCount") == 3,
                "reconciliation did not retain safe JSON generation counts",
            )
            checks.append("an older healthy SQLite backup cannot roll valid JSON history backwards")

            records_path.unlink()
            rebuilt_calls.clear()
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is True, f"missing JSON hydration failed: {result}")
            _assert(not rebuilt_calls, "missing JSON should hydrate from the recovered healthy index without a second rebuild")
            _assert(
                records_service.normalize_records(json.loads(records_path.read_text(encoding="utf-8")))
                == recovered_records,
                "missing JSON was not hydrated from the recovered index",
            )
            _assert(
                (result.get("reconciliation") or {}).get("action")
                == "hydrate-missing-json-from-recovered-index",
                "missing JSON hydration did not expose its reconciliation source",
            )
            _assert(
                not list(temp_path.glob(".fyadr_records.json.*.tmp")),
                "atomic hydration left a recovery temporary file behind",
            )
            _assert((records_path.stat().st_mode & 0o777) == 0o600, "hydrated JSON was not private")
            checks.append("a genuinely missing JSON compatibility file is hydrated from the recovered index")

            empty_json_text = "{}\n"
            records_path.write_text(empty_json_text, encoding="utf-8")
            rebuilt_calls.clear()
            history_db.get_history_index_status = lambda **_kwargs: {
                "exists": True,
                "documentCount": 0,
                "roundCount": 0,
                "recordsHash": records_service._records_hash({}),
            }
            records_service._load_records_from_history_index = lambda _expected_hash=None: recovered_records
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is True, f"valid empty JSON reconciliation failed: {result}")
            _assert(records_path.read_text(encoding="utf-8") == empty_json_text, "valid empty JSON was hydrated from backup")
            _assert(len(rebuilt_calls) == 1 and rebuilt_calls[0]["records"] == {}, "empty JSON did not rebuild an empty index")
            checks.append("a valid empty JSON object remains authoritative over a non-empty backup")

            records_path.write_text(original_json_text, encoding="utf-8")
            rebuilt_calls.clear()
            check_calls.clear()
            records_service._load_records_from_history_index = lambda _expected_hash=None: preserved_json_records
            history_db.get_history_index_status = lambda **_kwargs: {
                "exists": True,
                "documentCount": 1,
                "roundCount": 3,
                "recordsHash": records_service._records_hash(preserved_json_records),
            }
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is True, f"same-hash recovery failed: {result}")
            _assert(not rebuilt_calls, "same-hash healthy JSON/index pair was rebuilt unnecessarily")
            _assert(check_calls and check_calls[-1]["recordsHash"] == records_service._records_hash(preserved_json_records), "same-hash path skipped strict JSON-bound validation")
            _assert((result.get("reconciliation") or {}).get("action") == "json-and-recovered-index-aligned", "same-hash action was not aligned")
            checks.append("same-hash recovery still performs strict JSON-bound validation")

            low_level_failure_marker = "DO_NOT_EXPOSE_LOW_LEVEL_FAILURE_DETAIL"
            history_db.recover_history_index = lambda **_kwargs: {
                "ok": False,
                "error": low_level_failure_marker,
            }
            rebuilt_calls.clear()
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is False and result.get("errorCode") == "sqlite_recovery_failed", "low-level failure was not structured")
            _assert(low_level_failure_marker not in json.dumps(result, ensure_ascii=False), "low-level failure detail leaked through the wrapper")
            _assert(records_path.read_text(encoding="utf-8") == original_json_text and not rebuilt_calls, "low-level failure mutated JSON or rebuilt SQLite")

            low_level_exception_marker = "DO_NOT_EXPOSE_LOW_LEVEL_EXCEPTION_DETAIL"

            def raising_recover(**_kwargs: Any) -> dict[str, Any]:
                raise RuntimeError(low_level_exception_marker)

            history_db.recover_history_index = raising_recover
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is False and result.get("errorCode") == "sqlite_recovery_exception", "low-level exception escaped the recovery protocol")
            _assert(low_level_exception_marker not in json.dumps(result, ensure_ascii=False), "low-level exception detail leaked")
            _assert(records_path.read_text(encoding="utf-8") == original_json_text, "low-level exception changed valid JSON bytes")
            checks.append("low-level failures and exceptions are JSON-atomic and do not echo internal details")

            history_db.recover_history_index = fake_recover
            records_service._load_records_from_history_index = lambda _expected_hash=None: recovered_records
            rebuild_exception_marker = "DO_NOT_EXPOSE_REBUILD_EXCEPTION_DETAIL"

            def raising_rebuild(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
                raise RuntimeError(rebuild_exception_marker)

            history_db.rebuild_history_index = raising_rebuild
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is False and result.get("errorCode") == "json_reconciliation_exception", "rebuild exception escaped the result protocol")
            _assert(rebuild_exception_marker not in json.dumps(result, ensure_ascii=False), "rebuild exception detail leaked")
            _assert(records_path.read_text(encoding="utf-8") == original_json_text, "rebuild exception changed valid JSON bytes")
            checks.append("rebuild exceptions preserve the exact JSON generation and fail without detail leakage")

            history_db.rebuild_history_index = fake_rebuild
            history_db.recover_history_index = fake_recover

            invalid_json = "{not-valid-json\n"
            records_path.write_text(invalid_json, encoding="utf-8")
            rebuilt_calls.clear()
            recover_count_before_invalid = len(recover_calls)
            result = records_service.recover_history_index(backup_path="healthy-backup.sqlite3")
            _assert(result.get("ok") is False, "invalid JSON must require explicit manual reconciliation")
            _assert(records_path.read_text(encoding="utf-8") == invalid_json, "invalid JSON raw bytes were overwritten")
            _assert(not rebuilt_calls, "invalid JSON must not silently become a rebuild source")
            _assert(
                len(recover_calls) == recover_count_before_invalid,
                "invalid JSON must fail before low-level SQLite recovery mutates the index",
            )
            _assert(
                (result.get("reconciliation") or {}).get("action")
                == "preserve-invalid-json-for-manual-review",
                "invalid JSON preservation was not reported honestly",
            )
            checks.append("invalid JSON raw bytes are preserved instead of silently overwritten")
        finally:
            records_service.RECORDS_PATH = original_records_path
            records_service._load_records_from_history_index = original_load_index
            history_db.recover_history_index = original_recover
            history_db.rebuild_history_index = original_rebuild
            history_db.check_history_index = original_check
            history_db.get_history_index_status = original_get_status

    print(json.dumps({"ok": True, "checks": checks}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
