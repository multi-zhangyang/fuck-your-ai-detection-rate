"""Private filesystem defaults for user documents and application state.

FYADR handles source documents, model credentials, prompts, intermediate
rewrites, and history metadata.  On POSIX systems those files must not inherit
a permissive shell umask.  Windows relies on the user's profile/volume ACLs,
so the POSIX mode operations intentionally become no-ops there.
"""

from __future__ import annotations

import os
import stat
from pathlib import Path
from typing import Iterable

PRIVATE_UMASK = 0o077
PRIVATE_DIRECTORY_MODE = 0o700
PRIVATE_FILE_MODE = 0o600
PRIVATE_READ_ONLY_FILE_MODE = 0o400


def configure_private_umask() -> int | None:
    """Set the process-wide POSIX umask used by every downstream writer."""

    if os.name == "nt":
        return None
    return os.umask(PRIVATE_UMASK)


def ensure_private_directory(path: str | Path, *, strict: bool = True) -> Path:
    """Create a directory and remove group/other access on POSIX."""

    normalized = Path(path)
    normalized.mkdir(parents=True, exist_ok=True, mode=PRIVATE_DIRECTORY_MODE)
    if os.name == "nt":
        return normalized
    try:
        if normalized.is_symlink() or not normalized.is_dir():
            raise OSError(f"Private runtime path is not a real directory: {normalized}")
        normalized.chmod(PRIVATE_DIRECTORY_MODE)
    except OSError:
        if strict:
            raise
    return normalized


def harden_private_file(
    path: str | Path,
    *,
    preserve_read_only: bool = True,
    strict: bool = True,
) -> bool:
    """Remove group/other access from one regular file.

    Immutable source-anchor files deliberately use a read-only owner mode.  If
    ``preserve_read_only`` is true, hardening keeps that invariant as ``0400``
    instead of accidentally making the anchor writable.
    """

    if os.name == "nt":
        return False
    normalized = Path(path)
    try:
        metadata = normalized.lstat()
        if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISREG(metadata.st_mode):
            return False
        mode = (
            PRIVATE_READ_ONLY_FILE_MODE
            if preserve_read_only and not metadata.st_mode & stat.S_IWUSR
            else PRIVATE_FILE_MODE
        )
        normalized.chmod(mode)
        return True
    except OSError:
        if strict:
            raise
        return False


def harden_private_tree(path: str | Path, *, strict: bool = False) -> dict[str, object]:
    """Remediate legacy runtime files without following filesystem symlinks."""

    normalized = Path(path)
    report: dict[str, object] = {
        "ok": True,
        "path": str(normalized),
        "directories": 0,
        "files": 0,
        "skippedSymlinks": 0,
        "errors": [],
        "supported": os.name != "nt",
    }
    if os.name == "nt":
        return report

    errors: list[str] = report["errors"]  # type: ignore[assignment]
    try:
        ensure_private_directory(normalized, strict=True)
    except OSError as exc:
        if strict:
            raise
        errors.append(str(exc))
        report["ok"] = False
        return report

    for current_root, directory_names, file_names in os.walk(normalized, topdown=True, followlinks=False):
        current = Path(current_root)
        try:
            current.chmod(PRIVATE_DIRECTORY_MODE)
            report["directories"] = int(report["directories"]) + 1
        except OSError as exc:
            errors.append(str(exc))
            if strict:
                raise

        retained_directories: list[str] = []
        for name in directory_names:
            candidate = current / name
            if candidate.is_symlink():
                report["skippedSymlinks"] = int(report["skippedSymlinks"]) + 1
                continue
            retained_directories.append(name)
        directory_names[:] = retained_directories

        for name in file_names:
            candidate = current / name
            try:
                if candidate.is_symlink():
                    report["skippedSymlinks"] = int(report["skippedSymlinks"]) + 1
                    continue
                if harden_private_file(candidate, preserve_read_only=True, strict=True):
                    report["files"] = int(report["files"]) + 1
            except OSError as exc:
                errors.append(str(exc))
                if strict:
                    raise

    report["ok"] = not errors
    return report


def harden_private_trees(paths: Iterable[str | Path]) -> dict[str, object]:
    items = [harden_private_tree(path, strict=False) for path in paths]
    return {
        "ok": all(bool(item.get("ok", True)) for item in items),
        "supported": os.name != "nt",
        "items": items,
    }
