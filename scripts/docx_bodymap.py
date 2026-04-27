from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

from fyadr_round_service import detect_chunk_language
from chunking import split_text_to_paragraphs
from docx_pipeline import (
    DocxTextUnit,
    _is_snapshot_current,
    _load_docx_snapshot,
    ensure_docx_processing_assets,
)


DOCX_BODY_MAP_VERSION = 1


@dataclass
class DocxBodyMapUnit:
    unit_id: str
    unit_index: int
    target: dict[str, Any]
    style_name: str
    original_text: str
    current_text: str
    language: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DocxBodyMap:
    version: int
    source_path: str
    source_size: int
    source_mtime_ns: int
    snapshot_path: str
    snapshot_version: int
    prompt_profile: str
    round_number: int | None
    editable_unit_count: int
    units: list[DocxBodyMapUnit]

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "source_path": self.source_path,
            "source_size": self.source_size,
            "source_mtime_ns": self.source_mtime_ns,
            "snapshot_path": self.snapshot_path,
            "snapshot_version": self.snapshot_version,
            "prompt_profile": self.prompt_profile,
            "round_number": self.round_number,
            "editable_unit_count": self.editable_unit_count,
            "units": [unit.to_dict() for unit in self.units],
        }

    def current_texts(self) -> list[str]:
        return [unit.current_text for unit in self.units]


def build_docx_body_map(
    source_path: Path,
    *,
    snapshot_path: Path | None = None,
    prompt_profile: str = "cn",
    round_number: int | None = None,
) -> DocxBodyMap:
    normalized_source_path = source_path.resolve()
    _, resolved_snapshot_path, snapshot = ensure_docx_processing_assets(
        normalized_source_path,
        snapshot_path=snapshot_path,
    )
    editable_units = snapshot.editable_units()
    units = [
        _build_body_map_unit(text_unit)
        for text_unit in editable_units
    ]
    return DocxBodyMap(
        version=DOCX_BODY_MAP_VERSION,
        source_path=str(normalized_source_path),
        source_size=snapshot.source_size,
        source_mtime_ns=snapshot.source_mtime_ns,
        snapshot_path=str(resolved_snapshot_path.resolve()),
        snapshot_version=snapshot.version,
        prompt_profile=str(prompt_profile or "cn").strip().lower() or "cn",
        round_number=round_number,
        editable_unit_count=len(units),
        units=units,
    )


def load_docx_body_map(path: Path) -> DocxBodyMap | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    raw_units = data.get("units")
    if not isinstance(raw_units, list):
        return None
    units: list[DocxBodyMapUnit] = []
    for raw_unit in raw_units:
        if not isinstance(raw_unit, dict):
            continue
        units.append(
            DocxBodyMapUnit(
                unit_id=str(raw_unit.get("unit_id", f"unit_{len(units)}")),
                unit_index=int(raw_unit.get("unit_index", len(units))),
                target=dict(raw_unit.get("target", {})) if isinstance(raw_unit.get("target"), dict) else {},
                style_name=str(raw_unit.get("style_name", "")),
                original_text=str(raw_unit.get("original_text", "")),
                current_text=str(raw_unit.get("current_text", "")),
                language=str(raw_unit.get("language", "default") or "default"),
            )
        )
    return DocxBodyMap(
        version=int(data.get("version", DOCX_BODY_MAP_VERSION)),
        source_path=str(data.get("source_path", "")),
        source_size=int(data.get("source_size", 0)),
        source_mtime_ns=int(data.get("source_mtime_ns", 0)),
        snapshot_path=str(data.get("snapshot_path", "")),
        snapshot_version=int(data.get("snapshot_version", 0)),
        prompt_profile=str(data.get("prompt_profile", "cn") or "cn").strip().lower() or "cn",
        round_number=_as_optional_int(data.get("round_number")),
        editable_unit_count=int(data.get("editable_unit_count", len(units))),
        units=units,
    )


def save_docx_body_map(body_map: DocxBodyMap, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body_map.to_dict(), ensure_ascii=False, indent=2), encoding="utf-8")


def retag_docx_body_map(body_map: DocxBodyMap, *, prompt_profile: str, round_number: int | None) -> DocxBodyMap:
    return DocxBodyMap(
        version=body_map.version,
        source_path=body_map.source_path,
        source_size=body_map.source_size,
        source_mtime_ns=body_map.source_mtime_ns,
        snapshot_path=body_map.snapshot_path,
        snapshot_version=body_map.snapshot_version,
        prompt_profile=str(prompt_profile or body_map.prompt_profile).strip().lower() or body_map.prompt_profile,
        round_number=round_number,
        editable_unit_count=body_map.editable_unit_count,
        units=[
            DocxBodyMapUnit(
                unit_id=unit.unit_id,
                unit_index=unit.unit_index,
                target=dict(unit.target),
                style_name=unit.style_name,
                original_text=unit.original_text,
                current_text=unit.current_text,
                language=unit.language,
            )
            for unit in body_map.units
        ],
    )


def update_docx_body_map_texts(
    body_map: DocxBodyMap,
    rewritten_paragraphs: Sequence[str],
    *,
    round_number: int | None = None,
) -> DocxBodyMap:
    if len(rewritten_paragraphs) != len(body_map.units):
        raise ValueError(
            "DOCX body map paragraph count mismatch. "
            f"Expected {len(body_map.units)}, got {len(rewritten_paragraphs)}."
        )

    updated_units: list[DocxBodyMapUnit] = []
    for unit, rewritten_text in zip(body_map.units, rewritten_paragraphs):
        updated_units.append(
            DocxBodyMapUnit(
                unit_id=unit.unit_id,
                unit_index=unit.unit_index,
                target=dict(unit.target),
                style_name=unit.style_name,
                original_text=unit.original_text,
                current_text=str(rewritten_text),
                language=unit.language,
            )
        )

    return DocxBodyMap(
        version=body_map.version,
        source_path=body_map.source_path,
        source_size=body_map.source_size,
        source_mtime_ns=body_map.source_mtime_ns,
        snapshot_path=body_map.snapshot_path,
        snapshot_version=body_map.snapshot_version,
        prompt_profile=body_map.prompt_profile,
        round_number=round_number if round_number is not None else body_map.round_number,
        editable_unit_count=body_map.editable_unit_count,
        units=updated_units,
    )


def write_docx_body_map_input(body_map: DocxBodyMap, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n\n".join(body_map.current_texts()), encoding="utf-8")


def extract_body_map_paragraphs_from_output(output_path: Path) -> list[str]:
    return split_text_to_paragraphs(output_path.read_text(encoding="utf-8"))


def validate_docx_body_map(
    body_map: DocxBodyMap,
    *,
    source_path: Path,
    snapshot_path: Path | None = None,
) -> dict[str, Any]:
    normalized_source_path = source_path.resolve()
    resolved_snapshot_path = (snapshot_path or Path(body_map.snapshot_path)).resolve()
    snapshot = _load_docx_snapshot(resolved_snapshot_path)
    blocking_issues: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []

    if snapshot is None:
        blocking_issues.append(
            {
                "code": "snapshot_missing",
                "message": f"DOCX snapshot not found: {resolved_snapshot_path}",
            }
        )
    else:
        if not _is_snapshot_current(snapshot, normalized_source_path):
            blocking_issues.append(
                {
                    "code": "snapshot_stale",
                    "message": "The source DOCX changed after the body map was generated.",
                }
            )
        expected_unit_count = snapshot.editable_unit_count
        if expected_unit_count != len(body_map.units):
            blocking_issues.append(
                {
                    "code": "editable_unit_count_mismatch",
                    "message": f"Expected {expected_unit_count} editable units, got {len(body_map.units)}.",
                }
            )

    for unit in body_map.units:
        if str(unit.target.get("kind", "")) != "paragraph":
            blocking_issues.append(
                {
                    "code": "unsupported_target_kind",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "Only top-level body paragraphs may be rewritten in DOCX paper mode.",
                }
            )
            continue
        if not unit.current_text.strip():
            warnings.append(
                {
                    "code": "empty_unit_text",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "One editable body paragraph became empty.",
                }
            )
        if unit.language == "en" and detect_chunk_language(unit.current_text) != "en":
            warnings.append(
                {
                    "code": "language_drift",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "An English body paragraph no longer looks English after rewriting.",
                }
            )

    return {
        "ok": not blocking_issues,
        "version": DOCX_BODY_MAP_VERSION,
        "sourcePath": str(normalized_source_path),
        "snapshotPath": str(resolved_snapshot_path),
        "promptProfile": body_map.prompt_profile,
        "round": body_map.round_number,
        "editableUnitCount": len(body_map.units),
        "blockingIssues": blocking_issues,
        "warnings": warnings,
    }


def save_docx_body_map_validation(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def _build_body_map_unit(text_unit: DocxTextUnit) -> DocxBodyMapUnit:
    return DocxBodyMapUnit(
        unit_id=f"u{text_unit.unit_index}",
        unit_index=text_unit.unit_index,
        target=dict(text_unit.target),
        style_name=text_unit.style_name,
        original_text=text_unit.text,
        current_text=text_unit.text,
        language=detect_chunk_language(text_unit.text),
    )


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
