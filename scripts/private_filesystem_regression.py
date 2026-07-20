from __future__ import annotations

import os
import stat
import tempfile
from pathlib import Path

import app_config
import fyadr_history_db
import private_fs
import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]


def _mode(path: Path) -> int:
    return stat.S_IMODE(path.stat().st_mode)


def _assert_private_directory(path: Path) -> None:
    if os.name != "nt":
        assert _mode(path) == 0o700, f"directory must be 0700: {path} ({_mode(path):04o})"


def _assert_private_file(path: Path, *, expected: int = 0o600) -> None:
    if os.name != "nt":
        assert _mode(path) == expected, f"file must be {expected:04o}: {path} ({_mode(path):04o})"


def run() -> dict[str, object]:
    checks: list[str] = []
    with tempfile.TemporaryDirectory(prefix="fyadr-private-fs-") as temporary_name:
        root = Path(temporary_name)

        original_umask = os.umask(0o022) if os.name != "nt" else None
        try:
            private_fs.configure_private_umask()
            implicit_file = root / "implicit.txt"
            implicit_file.write_text("private", encoding="utf-8")
            _assert_private_file(implicit_file)
        finally:
            if original_umask is not None:
                os.umask(original_umask)
        checks.append("POSIX process umask creates owner-only files")

        legacy_root = root / "legacy"
        legacy_root.mkdir(mode=0o755)
        legacy_file = legacy_root / "document.txt"
        legacy_file.write_text("document", encoding="utf-8")
        legacy_file.chmod(0o644)
        immutable_file = legacy_root / "anchor.txt"
        immutable_file.write_text("anchor", encoding="utf-8")
        immutable_file.chmod(0o444)
        report = private_fs.harden_private_tree(legacy_root, strict=True)
        assert report.get("ok") is True
        assert report.get("supported") is (os.name != "nt")
        _assert_private_directory(legacy_root)
        _assert_private_file(legacy_file)
        _assert_private_file(immutable_file, expected=0o400)
        checks.append("legacy trees are remediated without making immutable anchors writable")

        if os.name != "nt":
            outside_tree = root / "outside-tree"
            outside_tree.mkdir()
            symlink_tree = root / "symlink-tree"
            symlink_tree.symlink_to(outside_tree, target_is_directory=True)
            failed_report = private_fs.harden_private_tree(symlink_tree, strict=False)
            assert failed_report.get("ok") is False
            assert failed_report.get("errors")
            checks.append("non-strict hardening failures remain explicit instead of defaulting to success")

        atomic_path = root / "state" / "run.json"
        web_app.write_json_atomic(atomic_path, {"secret": "state"})
        _assert_private_directory(atomic_path.parent)
        _assert_private_file(atomic_path)
        checks.append("atomic task-state snapshots are owner-only")

        original_dirs = (web_app.ORIGIN_DIR, web_app.EXPORT_DIR, web_app.TASK_STATE_DIR)
        try:
            web_app.ORIGIN_DIR = root / "origin"
            web_app.EXPORT_DIR = root / "finish" / "web_exports"
            web_app.TASK_STATE_DIR = root / "finish" / "intermediate" / "task_states"
            uploaded = web_app.write_uploaded_file("thesis.txt", "private thesis")
            _assert_private_directory(web_app.ORIGIN_DIR)
            _assert_private_directory(uploaded.parent)
            _assert_private_file(uploaded)
        finally:
            web_app.ORIGIN_DIR, web_app.EXPORT_DIR, web_app.TASK_STATE_DIR = original_dirs
        checks.append("content-addressed uploads and directories are owner-only")

        previous_config_dir = os.environ.get("FYADR_APP_CONFIG_DIR")
        try:
            os.environ["FYADR_APP_CONFIG_DIR"] = str(root / "config")
            app_config.save_app_config({"baseUrl": "https://example.invalid", "apiKey": "secret", "model": "model"})
            config_path = app_config.get_app_config_path()
            _assert_private_directory(config_path.parent)
            _assert_private_file(config_path)
        finally:
            if previous_config_dir is None:
                os.environ.pop("FYADR_APP_CONFIG_DIR", None)
            else:
                os.environ["FYADR_APP_CONFIG_DIR"] = previous_config_dir
        checks.append("provider configuration remains owner-only")

        database_path = root / "history" / "fyadr_history.sqlite3"
        fyadr_history_db.rebuild_history_index({}, db_path=database_path)
        _assert_private_directory(database_path.parent)
        _assert_private_file(database_path)
        checks.append("SQLite history files are owner-only")

    launcher = (ROOT_DIR / "start_web.sh").read_text(encoding="utf-8")
    entrypoint = (ROOT_DIR / "docker-entrypoint.sh").read_text(encoding="utf-8")
    assert "umask 077" in launcher
    assert "umask 077" in entrypoint
    assert "configure_private_umask()" in (ROOT_DIR / "scripts" / "web_app.py").read_text(encoding="utf-8")
    assert 'if os.name == "nt"' in (ROOT_DIR / "scripts" / "private_fs.py").read_text(encoding="utf-8")
    checks.append("native, container, Python, and Windows compatibility paths are wired")

    return {"ok": True, "checks": checks}


if __name__ == "__main__":
    import json

    print(json.dumps(run(), ensure_ascii=False, indent=2))
