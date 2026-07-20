from __future__ import annotations

import gzip
import json
import os
from pathlib import Path
import shutil
import sqlite3
import stat
import tempfile

from fyadr_history_db import (
    backup_history_index,
    get_history_index_status,
    list_history_index_backups,
    rebuild_history_index,
    recover_history_index,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "history_backup_compression_regression_report.json"


def _document_count(path: Path) -> int:
    with sqlite3.connect(path) as connection:
        return int(connection.execute("SELECT COUNT(*) FROM documents").fetchone()[0])


def _delete_documents(path: Path) -> None:
    with sqlite3.connect(path) as connection:
        connection.execute("DELETE FROM documents")
        connection.commit()


def run() -> dict[str, object]:
    checks: list[str] = []
    with tempfile.TemporaryDirectory(prefix="fyadr-history-gzip-") as temporary_name:
        root = Path(temporary_name)
        db_path = root / "finish" / "fyadr_history.sqlite3"
        backup_dir = root / "finish" / "history_db_backups"
        records = {
            "origin/example.txt": {
                "origin_path": "origin/example.txt",
                "payload": "A" * (2 * 1024 * 1024),
                "rounds": [],
            }
        }
        rebuild_history_index(records, records_hash="fixture", db_path=db_path)
        assert get_history_index_status(db_path=db_path)["documentCount"] == 1

        backup = backup_history_index(
            reason="compression_regression",
            keep=20,
            backup_dir=backup_dir,
            db_path=db_path,
        )
        assert backup["ok"] is True, backup
        compressed_path = Path(str(backup["path"]))
        assert compressed_path.name.endswith(".sqlite3.gz")
        assert compressed_path.read_bytes()[:2] == b"\x1f\x8b"
        assert int(backup["sizeBytes"]) < int(backup["sourceSizeBytes"])
        assert int(backup["savedBytes"]) > 0
        assert float(backup["compressionRatio"]) < 1.0
        assert not list(backup_dir.glob(".*.sqlite3.tmp"))
        if os.name != "nt":
            assert stat.S_IMODE(compressed_path.stat().st_mode) == 0o600
            assert stat.S_IMODE(backup_dir.stat().st_mode) == 0o700
        checks.append("new backups are atomic private gzip files with measured savings")

        with gzip.open(compressed_path, "rb") as source:
            decompressed_header = source.read(16)
        assert decompressed_header == b"SQLite format 3\x00"
        listing = list_history_index_backups(backup_dir=backup_dir, validate=True)
        compressed_item = next(item for item in listing["items"] if item["path"] == str(compressed_path.resolve()))
        assert compressed_item["compressed"] is True
        assert compressed_item["format"] == "sqlite3-gzip"
        assert compressed_item["ok"] is True
        checks.append("compressed backups list and validate through bounded materialization")

        _delete_documents(db_path)
        assert _document_count(db_path) == 0
        recovered = recover_history_index(
            backup_path=compressed_path,
            keep=20,
            backup_dir=backup_dir,
            db_path=db_path,
        )
        assert recovered["ok"] is True, recovered
        assert _document_count(db_path) == 1
        checks.append("compressed backups restore a damaged live database")

        legacy_path = backup_dir / "fyadr_history_legacy.sqlite3"
        shutil.copy2(db_path, legacy_path)
        _delete_documents(db_path)
        legacy_listing = list_history_index_backups(backup_dir=backup_dir, validate=True)
        legacy_item = next(item for item in legacy_listing["items"] if item["path"] == str(legacy_path.resolve()))
        assert legacy_item["compressed"] is False
        assert legacy_item["format"] == "sqlite3"
        assert legacy_item["ok"] is True
        legacy_recovery = recover_history_index(
            backup_path=legacy_path,
            keep=20,
            backup_dir=backup_dir,
            db_path=db_path,
        )
        assert legacy_recovery["ok"] is True
        assert _document_count(db_path) == 1
        checks.append("legacy raw .sqlite3 backups still list, validate, and restore")

        if os.name != "nt":
            outside_backup = root / "outside.sqlite3"
            shutil.copy2(db_path, outside_backup)
            symlink_backup = backup_dir / "fyadr_history_symlink.sqlite3"
            symlink_backup.symlink_to(outside_backup)
            symlink_listing = list_history_index_backups(backup_dir=backup_dir, validate=True)
            assert all(Path(str(item["path"])).name != symlink_backup.name for item in symlink_listing["items"])
            symlink_recovery = recover_history_index(
                backup_path=symlink_backup,
                keep=20,
                backup_dir=backup_dir,
                db_path=db_path,
            )
            assert symlink_recovery["ok"] is False
            checks.append("backup discovery and recovery reject symlinks outside the private store")

        corrupt_path = backup_dir / "fyadr_history_corrupt.sqlite3.gz"
        corrupt_path.write_bytes(b"\x1f\x8btruncated")
        corrupt_listing = list_history_index_backups(backup_dir=backup_dir, validate=True)
        corrupt_item = next(item for item in corrupt_listing["items"] if item["path"] == str(corrupt_path.resolve()))
        assert corrupt_item["ok"] is False
        before_count = _document_count(db_path)
        corrupt_recovery = recover_history_index(
            backup_path=corrupt_path,
            keep=20,
            backup_dir=backup_dir,
            db_path=db_path,
        )
        assert corrupt_recovery["ok"] is False
        assert _document_count(db_path) == before_count
        assert not list(backup_dir.glob("*.restore.sqlite3"))
        checks.append("corrupt gzip backups fail closed without changing the live database")

    source = (ROOT_DIR / "scripts" / "fyadr_history_db.py").read_text(encoding="utf-8")
    assert 'glob("fyadr_history_*.sqlite3")' in source
    assert 'glob("fyadr_history_*.sqlite3.gz")' in source
    assert "MAX_HISTORY_BACKUP_UNCOMPRESSED_BYTES" in source
    assert "os.replace(temporary_path, target_path)" in source
    checks.append("mixed-format discovery, expansion bounds, and atomic publication stay wired")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
