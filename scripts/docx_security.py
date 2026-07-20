"""Bounded, fail-closed validation for uploaded OOXML Word packages."""

from __future__ import annotations

import stat
import zipfile
from pathlib import Path, PurePosixPath
from typing import Any

MAX_DOCX_ENTRY_COUNT = 4096
MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
MAX_DOCX_XML_PART_BYTES = 64 * 1024 * 1024
MAX_DOCX_COMPRESSION_RATIO = 1000.0
MIN_RATIO_CHECK_BYTES = 4 * 1024 * 1024
MAX_XML_PROLOG_SCAN_BYTES = 16 * 1024
MAX_REQUIRED_METADATA_BYTES = 4 * 1024 * 1024
FORBIDDEN_XML_DECLARATIONS = (b"<!doctype", b"<!entity")

REQUIRED_DOCX_PARTS = frozenset({
    "[Content_Types].xml",
    "_rels/.rels",
    "word/document.xml",
})
ALLOWED_ZIP_COMPRESSION_METHODS = frozenset({zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED})
WORDPROCESSINGML_NAMESPACES = (
    b"schemas.openxmlformats.org/wordprocessingml",
    b"purl.oclc.org/ooxml/wordprocessingml",
)
WORD_DOCUMENT_CONTENT_TYPE = b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"


class UnsafeDocxError(ValueError):
    """The uploaded package is not a bounded, structurally valid DOCX."""


def _safe_entry_name(name: str) -> bool:
    if not name or len(name) > 1024 or "\x00" in name or "\\" in name:
        return False
    candidate = PurePosixPath(name)
    if candidate.is_absolute() or any(part in {"", ".", ".."} for part in candidate.parts):
        return False
    first_part = candidate.parts[0] if candidate.parts else ""
    return not (len(first_part) >= 2 and first_part[1] == ":")


def _is_symlink_entry(info: zipfile.ZipInfo) -> bool:
    unix_mode = (info.external_attr >> 16) & 0xFFFF
    return bool(unix_mode and stat.S_ISLNK(unix_mode))


def _compression_ratio(info: zipfile.ZipInfo) -> float:
    if info.file_size <= 0:
        return 1.0
    return info.file_size / max(1, info.compress_size)


def _read_entry_bounded(
    archive: zipfile.ZipFile,
    info: zipfile.ZipInfo,
    *,
    limit: int,
) -> bytes:
    if info.file_size > limit:
        raise UnsafeDocxError(f"DOCX part exceeds its safe read limit: {info.filename}")
    with archive.open(info, "r") as handle:
        payload = handle.read(limit + 1)
    if len(payload) > limit or len(payload) != info.file_size:
        raise UnsafeDocxError(f"DOCX part size is inconsistent: {info.filename}")
    return payload


def _scan_xml_part(archive: zipfile.ZipFile, info: zipfile.ZipInfo, *, limit: int) -> None:
    """Stream an XML part and reject declarations anywhere in the bounded body."""

    overlap_size = max(len(marker) for marker in FORBIDDEN_XML_DECLARATIONS) - 1
    overlap = b""
    size = 0
    with archive.open(info, "r") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            size += len(block)
            if size > limit:
                raise UnsafeDocxError(f"DOCX XML part exceeds its safe scan limit: {info.filename}")
            lowered = (overlap + block).lower()
            if any(marker in lowered for marker in FORBIDDEN_XML_DECLARATIONS):
                raise UnsafeDocxError("DOCX XML parts may not contain DTD or entity declarations.")
            overlap = lowered[-overlap_size:]
    if size != info.file_size:
        raise UnsafeDocxError(f"DOCX part size is inconsistent: {info.filename}")


def _validate_required_parts(
    archive: zipfile.ZipFile,
    infos: dict[str, zipfile.ZipInfo],
) -> None:
    content_types = _read_entry_bounded(
        archive,
        infos["[Content_Types].xml"],
        limit=MAX_REQUIRED_METADATA_BYTES,
    ).lower()
    if WORD_DOCUMENT_CONTENT_TYPE not in content_types or b"/word/document.xml" not in content_types:
        raise UnsafeDocxError("DOCX content types do not declare a Word main document part.")

    package_relationships = _read_entry_bounded(
        archive,
        infos["_rels/.rels"],
        limit=MAX_REQUIRED_METADATA_BYTES,
    ).lower()
    if b"officedocument" not in package_relationships or b"word/document.xml" not in package_relationships:
        raise UnsafeDocxError("DOCX package relationships do not target the Word document part.")

    document_info = infos["word/document.xml"]
    with archive.open(document_info, "r") as handle:
        document_prefix = handle.read(MAX_XML_PROLOG_SCAN_BYTES).lower()
    if b"<" not in document_prefix or not any(namespace in document_prefix for namespace in WORDPROCESSINGML_NAMESPACES):
        raise UnsafeDocxError("DOCX main document XML is not a WordprocessingML document.")


def validate_docx_package(path: str | Path) -> dict[str, Any]:
    """Validate package inventory and expansion bounds without loading it all."""

    normalized = Path(path).resolve()
    try:
        with normalized.open("rb") as handle:
            magic = handle.read(4)
    except OSError as exc:
        raise UnsafeDocxError("DOCX upload could not be read safely.") from exc
    if magic != b"PK\x03\x04":
        raise UnsafeDocxError("DOCX upload does not have a valid ZIP package signature.")

    try:
        with zipfile.ZipFile(normalized, "r") as archive:
            raw_infos = archive.infolist()
            if not raw_infos or len(raw_infos) > MAX_DOCX_ENTRY_COUNT:
                raise UnsafeDocxError(f"DOCX package contains too many parts (limit: {MAX_DOCX_ENTRY_COUNT}).")

            infos: dict[str, zipfile.ZipInfo] = {}
            total_uncompressed = 0
            total_compressed = 0
            maximum_ratio = 1.0
            for info in raw_infos:
                name = info.filename
                if not _safe_entry_name(name):
                    raise UnsafeDocxError("DOCX package contains an unsafe part path.")
                if name in infos:
                    raise UnsafeDocxError("DOCX package contains duplicate part names.")
                infos[name] = info
                if info.is_dir():
                    continue
                if info.flag_bits & 0x1:
                    raise UnsafeDocxError("Encrypted DOCX parts are not supported.")
                if _is_symlink_entry(info):
                    raise UnsafeDocxError("DOCX package contains a symbolic-link part.")
                if info.compress_type not in ALLOWED_ZIP_COMPRESSION_METHODS:
                    raise UnsafeDocxError("DOCX package uses an unsupported compression method.")
                entry_limit = (
                    MAX_DOCX_XML_PART_BYTES
                    if name == "[Content_Types].xml" or name.endswith((".xml", ".rels"))
                    else MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES
                )
                if info.file_size < 0 or info.file_size > entry_limit:
                    raise UnsafeDocxError(f"DOCX part is too large after decompression: {name}")
                ratio = _compression_ratio(info)
                if info.file_size >= MIN_RATIO_CHECK_BYTES and ratio > MAX_DOCX_COMPRESSION_RATIO:
                    raise UnsafeDocxError(f"DOCX part compression ratio is unsafe: {name}")
                maximum_ratio = max(maximum_ratio, ratio)
                total_uncompressed += info.file_size
                total_compressed += info.compress_size
                if total_uncompressed > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES:
                    raise UnsafeDocxError("DOCX package is too large after decompression.")

                # Opening every part makes zipfile apply overlap/header checks.
                # OOXML never needs DTDs, so stream every bounded XML part in
                # full; a long prolog must not hide entity expansion input.
                if name == "[Content_Types].xml" or name.endswith((".xml", ".rels")):
                    _scan_xml_part(archive, info, limit=entry_limit)
                else:
                    with archive.open(info, "r") as part:
                        part.read(1)

            missing = sorted(REQUIRED_DOCX_PARTS - infos.keys())
            if missing:
                raise UnsafeDocxError("DOCX package is missing required OOXML parts: " + ", ".join(missing))
            if total_uncompressed >= MIN_RATIO_CHECK_BYTES:
                total_ratio = total_uncompressed / max(1, total_compressed)
                if total_ratio > MAX_DOCX_COMPRESSION_RATIO:
                    raise UnsafeDocxError("DOCX package compression ratio is unsafe.")
            _validate_required_parts(archive, infos)
    except UnsafeDocxError:
        raise
    except (OSError, RuntimeError, zipfile.BadZipFile, zipfile.LargeZipFile) as exc:
        raise UnsafeDocxError("DOCX upload is not a readable OOXML ZIP package.") from exc

    return {
        "ok": True,
        "path": str(normalized),
        "entryCount": len(infos),
        "totalUncompressedBytes": total_uncompressed,
        "totalCompressedBytes": total_compressed,
        "maximumCompressionRatio": round(maximum_ratio, 3),
        "requiredParts": sorted(REQUIRED_DOCX_PARTS),
    }
