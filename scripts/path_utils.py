"""Shared path-safety helpers for the FYADR backend.

These helpers previously lived as duplicated private copies in
``web_app.py``, ``app_service.py`` and ``fyadr_history_db.py``. Path-traversal
protection is a security-sensitive concern, so the logic must have a single
source of truth — this module.
"""

from __future__ import annotations

from hashlib import sha256
import os
from pathlib import Path
from pathlib import PurePosixPath
import re
import unicodedata


_UNSAFE_ARTIFACT_LABEL_RE = re.compile(r"[^\w.-]+", re.UNICODE)
DOCUMENT_IDENTITY_DIGEST_CHARS = 16


def truncate_utf8_filename_component(value: str, *, max_bytes: int, fallback: str = "document") -> str:
    """Truncate one filename component by UTF-8 bytes, never mid-codepoint."""

    normalized = unicodedata.normalize("NFC", str(value or "")).strip().strip(". ")
    if not normalized:
        normalized = fallback
    if len(normalized.encode("utf-8")) <= max_bytes:
        return normalized
    chunks: list[str] = []
    used = 0
    for character in normalized:
        encoded = character.encode("utf-8")
        if used + len(encoded) > max_bytes:
            break
        chunks.append(character)
        used += len(encoded)
    truncated = "".join(chunks).rstrip(". ")
    return truncated or fallback


def is_path_under(path: Path, root: Path) -> bool:
    """Return True when ``path`` resolves to a location inside ``root``.

    Both operands are resolved with :py:meth:`Path.resolve` so that symlink
    chains cannot escape the allowed root. A non-existent path is still
    resolved (``strict=False``), which is what callers want when validating a
    target path before it is written.
    """

    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def resolve_under(path_value: str | Path, *, allowed_roots: tuple[Path, ...], label: str) -> Path:
    """Resolve ``path_value`` and assert it stays under one of ``allowed_roots``.

    The caller is expected to pass ``allowed_roots`` already anchored to the
    process root (e.g. ``ROOT_DIR / "origin"``). Relative ``path_value`` is
    resolved against the first allowed root, which keeps the behaviour stable
    regardless of the current working directory. Raises ``ValueError`` (with a
    non-leaking message listing only the allowed directories) when the
    candidate escapes the allowed roots.
    """

    candidate = Path(path_value).expanduser()
    if not candidate.is_absolute():
        anchor = allowed_roots[0].resolve()
        candidate = (anchor / candidate).resolve()
    else:
        candidate = candidate.resolve()
    if not any(is_path_under(candidate, root) for root in allowed_roots):
        allowed = ", ".join(str(root) for root in allowed_roots)
        raise ValueError(f"{label} must stay under allowed workspace directories: {allowed}")
    return candidate


def canonical_document_identity(
    *,
    root_dir: Path,
    doc_id: str | None = None,
    source_path: str | Path | None = None,
) -> str:
    """Return a stable identity key for one source document.

    Workspace documents use their canonical root-relative path, matching the
    existing ``doc_id`` semantics. Documents outside the workspace use their
    canonical path only as hash input. Callers must not expose this value to a
    user or place it directly in an artifact filename.

    Resolving both ``doc_id`` and ``source_path`` through the same workspace
    root makes the two call forms converge on one identity. It also collapses
    ``.``/``..`` and symlink aliases, so repeated access to the same document
    deterministically reaches the same artifacts.
    """

    if (doc_id is None) == (source_path is None):
        raise ValueError("Exactly one of doc_id or source_path is required.")

    normalized_root = root_dir.expanduser().resolve()
    if source_path is not None:
        candidate = Path(source_path).expanduser()
    else:
        normalized_doc_id = unicodedata.normalize("NFC", str(doc_id or "").strip()).replace("\\", "/")
        if not normalized_doc_id:
            raise ValueError("doc_id is required.")
        candidate = Path(normalized_doc_id).expanduser()

    if not candidate.is_absolute():
        candidate = normalized_root / candidate
    canonical_path = candidate.resolve(strict=False)
    try:
        relative_path = canonical_path.relative_to(normalized_root)
    except ValueError:
        identity_path = f"external:{os.path.normcase(str(canonical_path))}"
    else:
        identity_path = f"workspace:{relative_path.as_posix()}"
    return unicodedata.normalize("NFC", identity_path)


def build_document_artifact_stem(
    *,
    root_dir: Path,
    doc_id: str | None = None,
    source_path: str | Path | None = None,
) -> str:
    """Build a non-leaking, collision-resistant filename stem for a document.

    The readable portion contains only the original basename. The directory
    (or an external absolute path) is represented solely by a truncated SHA-256
    digest, so same-named documents in different directories cannot collide
    and artifact filenames never reveal the source's absolute path.
    """

    identity = canonical_document_identity(root_dir=root_dir, doc_id=doc_id, source_path=source_path)
    if source_path is not None:
        raw_name = Path(source_path).name
    else:
        raw_name = PurePosixPath(str(doc_id or "").replace("\\", "/")).name
    raw_stem = Path(raw_name).stem
    normalized_label = unicodedata.normalize("NFKC", raw_stem).strip()
    safe_label = _UNSAFE_ARTIFACT_LABEL_RE.sub("_", normalized_label).strip("._-") or "document"
    safe_label = safe_label[:72].rstrip("._-") or "document"
    digest = sha256(identity.encode("utf-8")).hexdigest()[:DOCUMENT_IDENTITY_DIGEST_CHARS]
    return f"{safe_label}__{digest}"
