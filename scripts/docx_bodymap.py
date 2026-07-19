from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Sequence

from fyadr_round_service import detect_chunk_language
from chunking import split_text_to_paragraphs
from docx_pipeline import (
    DOCX_EDITABLE_STRUCTURAL_ROLES,
    DOCX_STRUCTURAL_ROLE_POLICY_VERSION,
    DocxSnapshot,
    DocxTextUnit,
    _is_snapshot_current,
    _load_docx_snapshot,
    ensure_docx_processing_assets,
    get_docx_structural_role_map_digest,
    get_docx_unit_edit_eligibility_evidence_digest,
    validate_format_sensitive_anchors,
    verify_docx_snapshot_derivation,
)
from prompt_library import DEFAULT_PROMPT_PROFILE, LEGACY_PROMPT_PROFILE


# v9 scope signatures bind the current structural-role policy. Policy v6 keeps
# the v5 template-instruction exclusions and adds legal block-level bookmarks.
DOCX_BODY_MAP_VERSION = 9
DOCX_BODY_MAP_SCOPE_SIGNATURE_VERSION = 5


@dataclass
class DocxBodyMapUnit:
    unit_id: str
    unit_index: int
    target: dict[str, Any]
    style_name: str
    original_text: str
    current_text: str
    language: str
    leading_whitespace: str = ""
    trailing_whitespace: str = ""
    format_anchors: list[dict[str, Any]] = field(default_factory=list)
    structural_role: str = "unknown"
    edit_eligibility: str = "protected"
    edit_eligibility_evidence_digest: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def source_text(self) -> str:
        return f"{self.leading_whitespace}{self.original_text}{self.trailing_whitespace}"


@dataclass
class DocxBodyMap:
    version: int
    source_path: str
    source_size: int
    source_mtime_ns: int
    source_sha256: str
    snapshot_path: str
    snapshot_version: int
    prompt_profile: str
    round_number: int | None
    editable_unit_count: int
    scope_signature: dict[str, Any]
    units: list[DocxBodyMapUnit]
    structural_role_policy_version: int = DOCX_STRUCTURAL_ROLE_POLICY_VERSION
    structural_role_map_digest: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "source_path": self.source_path,
            "source_size": self.source_size,
            "source_mtime_ns": self.source_mtime_ns,
            "source_sha256": self.source_sha256,
            "snapshot_path": self.snapshot_path,
            "snapshot_version": self.snapshot_version,
            "prompt_profile": self.prompt_profile,
            "round_number": self.round_number,
            "editable_unit_count": self.editable_unit_count,
            "scope_signature": self.scope_signature,
            "structural_role_policy_version": self.structural_role_policy_version,
            "structural_role_map_digest": self.structural_role_map_digest,
            "units": [unit.to_dict() for unit in self.units],
        }

    def current_texts(self) -> list[str]:
        return [unit.current_text for unit in self.units]


def get_body_map_unit_model_format_anchors(unit: DocxBodyMapUnit) -> list[str]:
    """Return exact styled-anchor text as it appears in model-facing prose.

    Snapshot anchor offsets use the literal Word paragraph, while body-map
    model text deliberately excludes paragraph-boundary whitespace.  Clip only
    that frozen boundary here; internal styled whitespace remains part of the
    immutable anchor.
    """

    source_text = unit.source_text()
    core_start = len(unit.leading_whitespace)
    core_end = core_start + len(unit.original_text)
    anchors: list[str] = []
    for raw_anchor in unit.format_anchors:
        if not isinstance(raw_anchor, dict):
            continue
        source_start = max(0, min(int(raw_anchor.get("source_start", 0)), len(source_text)))
        source_end = max(source_start, min(int(raw_anchor.get("source_end", source_start)), len(source_text)))
        clipped_start = max(source_start, core_start)
        clipped_end = min(source_end, core_end)
        if clipped_end <= clipped_start:
            continue
        anchor_text = source_text[clipped_start:clipped_end]
        if anchor_text and anchor_text not in anchors:
            anchors.append(anchor_text)
    return anchors


def build_docx_body_map(
    source_path: Path,
    *,
    snapshot_path: Path | None = None,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
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
        source_sha256=snapshot.source_sha256,
        snapshot_path=str(resolved_snapshot_path.resolve()),
        snapshot_version=snapshot.version,
        prompt_profile=str(prompt_profile or DEFAULT_PROMPT_PROFILE).strip().lower() or DEFAULT_PROMPT_PROFILE,
        round_number=round_number,
        editable_unit_count=len(units),
        scope_signature=_build_scope_signature(units),
        units=units,
        structural_role_policy_version=snapshot.structural_role_policy_version,
        structural_role_map_digest=get_docx_structural_role_map_digest(snapshot),
    )


def load_docx_body_map(path: Path) -> DocxBodyMap | None:
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return docx_body_map_from_payload(data)


def docx_body_map_from_payload(data: Any) -> DocxBodyMap | None:
    """Parse a body map captured in an immutable artifact snapshot."""

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
                leading_whitespace=str(raw_unit.get("leading_whitespace", "")),
                trailing_whitespace=str(raw_unit.get("trailing_whitespace", "")),
                format_anchors=[
                    dict(item)
                    for item in raw_unit.get("format_anchors", [])
                    if isinstance(item, dict)
                ] if isinstance(raw_unit.get("format_anchors", []), list) else [],
                structural_role=str(raw_unit.get("structural_role", "unknown") or "unknown"),
                edit_eligibility=str(raw_unit.get("edit_eligibility", "protected") or "protected"),
                edit_eligibility_evidence_digest=str(
                    raw_unit.get("edit_eligibility_evidence_digest", "") or ""
                ),
            )
        )
    return DocxBodyMap(
        version=int(data.get("version", 0)),
        source_path=str(data.get("source_path", "")),
        source_size=int(data.get("source_size", 0)),
        source_mtime_ns=int(data.get("source_mtime_ns", 0)),
        source_sha256=str(data.get("source_sha256", "") or ""),
        snapshot_path=str(data.get("snapshot_path", "")),
        snapshot_version=int(data.get("snapshot_version", 0)),
        prompt_profile=str(data.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower() or LEGACY_PROMPT_PROFILE,
        round_number=_as_optional_int(data.get("round_number")),
        editable_unit_count=int(data.get("editable_unit_count", len(units))),
        scope_signature=dict(data.get("scope_signature", {})) if isinstance(data.get("scope_signature"), dict) else {},
        units=units,
        structural_role_policy_version=int(data.get("structural_role_policy_version", 0)),
        structural_role_map_digest=str(data.get("structural_role_map_digest", "") or ""),
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
        source_sha256=body_map.source_sha256,
        snapshot_path=body_map.snapshot_path,
        snapshot_version=body_map.snapshot_version,
        prompt_profile=str(prompt_profile or body_map.prompt_profile).strip().lower() or body_map.prompt_profile,
        round_number=round_number,
        editable_unit_count=body_map.editable_unit_count,
        scope_signature=dict(body_map.scope_signature),
        structural_role_policy_version=body_map.structural_role_policy_version,
        structural_role_map_digest=body_map.structural_role_map_digest,
        units=[
            DocxBodyMapUnit(
                unit_id=unit.unit_id,
                unit_index=unit.unit_index,
                target=dict(unit.target),
                style_name=unit.style_name,
                original_text=unit.original_text,
                current_text=unit.current_text,
                language=unit.language,
                leading_whitespace=unit.leading_whitespace,
                trailing_whitespace=unit.trailing_whitespace,
                format_anchors=[dict(anchor) for anchor in unit.format_anchors],
                structural_role=unit.structural_role,
                edit_eligibility=unit.edit_eligibility,
                edit_eligibility_evidence_digest=unit.edit_eligibility_evidence_digest,
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
                leading_whitespace=unit.leading_whitespace,
                trailing_whitespace=unit.trailing_whitespace,
                format_anchors=[dict(anchor) for anchor in unit.format_anchors],
                structural_role=unit.structural_role,
                edit_eligibility=unit.edit_eligibility,
                edit_eligibility_evidence_digest=unit.edit_eligibility_evidence_digest,
            )
        )

    return DocxBodyMap(
        version=body_map.version,
        source_path=body_map.source_path,
        source_size=body_map.source_size,
        source_mtime_ns=body_map.source_mtime_ns,
        source_sha256=body_map.source_sha256,
        snapshot_path=body_map.snapshot_path,
        snapshot_version=body_map.snapshot_version,
        prompt_profile=body_map.prompt_profile,
        round_number=round_number if round_number is not None else body_map.round_number,
        editable_unit_count=body_map.editable_unit_count,
        scope_signature=dict(body_map.scope_signature) if body_map.scope_signature else _build_scope_signature(updated_units),
        units=updated_units,
        structural_role_policy_version=body_map.structural_role_policy_version,
        structural_role_map_digest=body_map.structural_role_map_digest,
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
    authoritative_snapshot: DocxSnapshot | None = None,
    snapshot_derivation_report: dict[str, Any] | None = None,
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
        if authoritative_snapshot is None or snapshot_derivation_report is None:
            snapshot_derivation_report, authoritative_snapshot = verify_docx_snapshot_derivation(
                snapshot,
                normalized_source_path,
            )
        if not bool(snapshot_derivation_report.get("ok")):
            blocking_issues.append(
                {
                    "code": "snapshot_authority_mismatch",
                    "message": "The cached DOCX snapshot scope does not match a fresh derivation from the source OOXML.",
                    "cachedDigest": str(snapshot_derivation_report.get("cachedDigest", "")),
                    "authoritativeDigest": str(snapshot_derivation_report.get("authoritativeDigest", "")),
                    "mismatchUnitIndexes": list(snapshot_derivation_report.get("mismatchUnitIndexes", []))[:40],
                }
            )
        authority = authoritative_snapshot
        if body_map.version != DOCX_BODY_MAP_VERSION:
            blocking_issues.append(
                {
                    "code": "body_map_version_stale",
                    "message": f"Expected DOCX body map version {DOCX_BODY_MAP_VERSION}, got {body_map.version}.",
                }
            )
        if body_map.structural_role_policy_version != DOCX_STRUCTURAL_ROLE_POLICY_VERSION:
            blocking_issues.append(
                {
                    "code": "structural_role_policy_version_mismatch",
                    "message": (
                        "The DOCX body map structural-role policy version is stale or missing."
                    ),
                    "expected": DOCX_STRUCTURAL_ROLE_POLICY_VERSION,
                    "actual": body_map.structural_role_policy_version,
                }
            )
        expected_role_map_digest = get_docx_structural_role_map_digest(authority)
        if (
            not body_map.structural_role_map_digest
            or body_map.structural_role_map_digest != expected_role_map_digest
        ):
            blocking_issues.append(
                {
                    "code": "structural_role_map_digest_mismatch",
                    "message": "The DOCX body map is not bound to the current source-derived structural role map.",
                    "expected": expected_role_map_digest,
                    "actual": body_map.structural_role_map_digest,
                }
            )
        if Path(body_map.source_path).resolve() != normalized_source_path:
            blocking_issues.append(
                {
                    "code": "source_path_mismatch",
                    "message": "The DOCX body map belongs to a different source document.",
                    "bodyMapSourcePath": body_map.source_path,
                }
            )
        if body_map.source_size != authority.source_size:
            blocking_issues.append(
                {
                    "code": "source_size_mismatch",
                    "message": "The DOCX body map source size differs from the current frozen source.",
                }
            )
        if body_map.source_mtime_ns != authority.source_mtime_ns:
            blocking_issues.append(
                {
                    "code": "source_mtime_mismatch",
                    "message": "The DOCX body map source timestamp differs from the current frozen source.",
                }
            )
        if not body_map.source_sha256 or body_map.source_sha256 != authority.source_sha256:
            blocking_issues.append(
                {
                    "code": "source_sha256_mismatch",
                    "message": "The DOCX body map source hash differs from the current frozen source.",
                }
            )
        if Path(body_map.snapshot_path).resolve() != resolved_snapshot_path:
            blocking_issues.append(
                {
                    "code": "snapshot_path_mismatch",
                    "message": "The DOCX body map references a different snapshot artifact.",
                }
            )
        if body_map.snapshot_version != authority.version:
            blocking_issues.append(
                {
                    "code": "snapshot_version_mismatch",
                    "message": "The DOCX body map snapshot version differs from the current snapshot.",
                }
            )
        if body_map.editable_unit_count != len(body_map.units):
            blocking_issues.append(
                {
                    "code": "declared_editable_unit_count_mismatch",
                    "message": "The DOCX body map declared editable-unit count does not match its units.",
                }
            )
        if not _is_snapshot_current(snapshot, normalized_source_path):
            blocking_issues.append(
                {
                    "code": "snapshot_stale",
                    "message": "The source DOCX changed after the body map was generated.",
                }
            )
        expected_unit_count = authority.editable_unit_count
        if expected_unit_count != len(body_map.units):
            blocking_issues.append(
                {
                    "code": "editable_unit_count_mismatch",
                    "message": f"Expected {expected_unit_count} editable units, got {len(body_map.units)}.",
                }
            )
        _validate_scope_signature(
            body_map,
            snapshot_editable_units=authority.editable_units(),
            blocking_issues=blocking_issues,
            warnings=warnings,
        )

    for unit in body_map.units:
        if unit.structural_role not in DOCX_EDITABLE_STRUCTURAL_ROLES:
            blocking_issues.append(
                {
                    "code": "illegal_editable_structural_role",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "structuralRole": unit.structural_role,
                    "message": "A body-map unit does not carry an allowed source prose role.",
                }
            )
        if unit.edit_eligibility != "eligible" or not unit.edit_eligibility_evidence_digest:
            blocking_issues.append(
                {
                    "code": "missing_edit_eligibility_evidence",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "editEligibility": unit.edit_eligibility,
                    "message": "A body-map unit lacks source-derived edit-eligibility evidence.",
                }
            )
        boundary_whitespace = f"{unit.leading_whitespace}{unit.trailing_whitespace}"
        if any(not character.isspace() for character in boundary_whitespace):
            blocking_issues.append(
                {
                    "code": "invalid_boundary_whitespace_evidence",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "DOCX boundary-whitespace evidence contains non-whitespace characters.",
                }
            )
        if "\n" in boundary_whitespace or "\r" in boundary_whitespace:
            blocking_issues.append(
                {
                    "code": "unsupported_boundary_line_break",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "DOCX boundary-whitespace evidence may not contain paragraph line breaks.",
                }
            )
        if unit.original_text[:1].isspace() or unit.original_text[-1:].isspace():
            blocking_issues.append(
                {
                    "code": "unnormalized_original_model_text",
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                    "message": "DOCX body-map model text still contains source boundary whitespace.",
                }
            )
        anchor_issues = validate_format_sensitive_anchors(
            f"{unit.leading_whitespace}{unit.current_text}{unit.trailing_whitespace}",
            unit.format_anchors,
        )
        for anchor_issue in anchor_issues:
            blocking_issues.append(
                {
                    **anchor_issue,
                    "unitId": unit.unit_id,
                    "unitIndex": unit.unit_index,
                }
            )
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
        "scopeSignaturePresent": bool(body_map.scope_signature),
        "scopeFingerprint": str(body_map.scope_signature.get("fingerprint", "")) if isinstance(body_map.scope_signature, dict) else "",
        "snapshotAuthorityVerified": bool(snapshot_derivation_report and snapshot_derivation_report.get("ok")),
        "structuralRolePolicyVersion": body_map.structural_role_policy_version,
        "structuralRoleMapDigest": body_map.structural_role_map_digest,
        "illegalEditableRoleCount": sum(
            1
            for issue in blocking_issues
            if str(issue.get("code", "")) == "illegal_editable_structural_role"
        ),
        "missingEditEligibilityEvidenceCount": sum(
            1
            for issue in blocking_issues
            if str(issue.get("code", "")) == "missing_edit_eligibility_evidence"
        ),
        "formatAnchorCount": sum(len(unit.format_anchors) for unit in body_map.units),
        "formatAnchorIssueCount": sum(
            1
            for issue in blocking_issues
            if str(issue.get("code", "")).startswith("format_anchor_")
        ),
        "cachedSnapshotDigest": str((snapshot_derivation_report or {}).get("cachedDigest", "")),
        "authoritativeSnapshotDigest": str((snapshot_derivation_report or {}).get("authoritativeDigest", "")),
        "blockingIssues": blocking_issues,
        "warnings": warnings,
    }


def save_docx_body_map_validation(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")


def _validate_scope_signature(
    body_map: DocxBodyMap,
    *,
    snapshot_editable_units: Sequence[DocxTextUnit],
    blocking_issues: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
) -> None:
    if not body_map.scope_signature:
        blocking_issues.append(
            {
                "code": "legacy_body_map_without_scope_signature",
                "message": "This DOCX body map lacks a frozen scope signature and cannot be reused safely.",
            }
        )
        return

    body_map_signature = _build_scope_signature(body_map.units)
    expected_signature = _build_scope_signature(snapshot_editable_units)
    stored_fingerprint = str(body_map.scope_signature.get("fingerprint", ""))
    actual_fingerprint = str(body_map_signature.get("fingerprint", ""))
    expected_fingerprint = str(expected_signature.get("fingerprint", ""))

    if stored_fingerprint != actual_fingerprint:
        blocking_issues.append(
            {
                "code": "body_map_scope_signature_mismatch",
                "message": "The DOCX body map unit targets no longer match its frozen editable-scope signature.",
                "storedFingerprint": stored_fingerprint,
                "actualFingerprint": actual_fingerprint,
            }
        )
    if stored_fingerprint != expected_fingerprint:
        blocking_issues.append(
            {
                "code": "snapshot_scope_signature_drift",
                "message": "The current DOCX editable scope differs from this round's frozen body map; reuse is blocked.",
                "storedFingerprint": stored_fingerprint,
                "currentSnapshotFingerprint": expected_fingerprint,
            }
        )


def _build_body_map_unit(text_unit: DocxTextUnit) -> DocxBodyMapUnit:
    return DocxBodyMapUnit(
        unit_id=f"u{text_unit.unit_index}",
        unit_index=text_unit.unit_index,
        target=dict(text_unit.target),
        style_name=text_unit.style_name,
        original_text=text_unit.text,
        current_text=text_unit.text,
        language=detect_chunk_language(text_unit.text),
        leading_whitespace=text_unit.leading_whitespace,
        trailing_whitespace=text_unit.trailing_whitespace,
        format_anchors=[dict(anchor) for anchor in text_unit.format_anchors],
        structural_role=text_unit.structural_role,
        edit_eligibility=text_unit.edit_eligibility,
        edit_eligibility_evidence_digest=get_docx_unit_edit_eligibility_evidence_digest(text_unit),
    )


def _build_scope_signature(units: Sequence[Any]) -> dict[str, Any]:
    unit_indexes: list[int] = []
    target_keys: list[str] = []
    text_hashes: list[str] = []
    source_text_hashes: list[str] = []
    leading_whitespace_hashes: list[str] = []
    trailing_whitespace_hashes: list[str] = []
    style_names: list[str] = []
    format_anchor_hashes: list[str] = []
    structural_roles: list[str] = []
    edit_eligibilities: list[str] = []
    edit_eligibility_evidence_digests: list[str] = []
    for unit in units:
        unit_indexes.append(int(getattr(unit, "unit_index", len(unit_indexes))))
        target = getattr(unit, "target", {})
        target_keys.append(json.dumps(target if isinstance(target, dict) else {}, ensure_ascii=False, sort_keys=True))
        original_text = str(getattr(unit, "original_text", getattr(unit, "text", "")))
        leading_whitespace = str(getattr(unit, "leading_whitespace", ""))
        trailing_whitespace = str(getattr(unit, "trailing_whitespace", ""))
        text_hashes.append(hashlib.sha256(original_text.encode("utf-8")).hexdigest()[:16])
        source_text_hashes.append(
            hashlib.sha256(
                f"{leading_whitespace}{original_text}{trailing_whitespace}".encode("utf-8")
            ).hexdigest()[:16]
        )
        leading_whitespace_hashes.append(
            hashlib.sha256(leading_whitespace.encode("utf-8")).hexdigest()[:16]
        )
        trailing_whitespace_hashes.append(
            hashlib.sha256(trailing_whitespace.encode("utf-8")).hexdigest()[:16]
        )
        style_names.append(str(getattr(unit, "style_name", "")))
        structural_roles.append(str(getattr(unit, "structural_role", "unknown") or "unknown"))
        edit_eligibilities.append(str(getattr(unit, "edit_eligibility", "protected") or "protected"))
        edit_eligibility_evidence_digests.append(
            str(
                getattr(
                    unit,
                    "edit_eligibility_evidence_digest",
                    get_docx_unit_edit_eligibility_evidence_digest(unit)
                    if isinstance(unit, DocxTextUnit)
                    else "",
                )
                or ""
            )
        )
        raw_anchors = getattr(unit, "format_anchors", [])
        anchors = [dict(anchor) for anchor in raw_anchors if isinstance(anchor, dict)] if isinstance(raw_anchors, list) else []
        format_anchor_hashes.append(
            hashlib.sha256(
                json.dumps(anchors, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest()[:16]
        )

    payload = {
        "version": DOCX_BODY_MAP_SCOPE_SIGNATURE_VERSION,
        "editableUnitCount": len(unit_indexes),
        "startUnitIndex": unit_indexes[0] if unit_indexes else None,
        "endUnitIndex": unit_indexes[-1] if unit_indexes else None,
        "unitIndexes": unit_indexes,
        "targetKeys": target_keys,
        "originalTextHashes": text_hashes,
        "sourceTextHashes": source_text_hashes,
        "leadingWhitespaceHashes": leading_whitespace_hashes,
        "trailingWhitespaceHashes": trailing_whitespace_hashes,
        "styleNames": style_names,
        "formatAnchorHashes": format_anchor_hashes,
        "structuralRolePolicyVersion": DOCX_STRUCTURAL_ROLE_POLICY_VERSION,
        "structuralRoles": structural_roles,
        "editEligibilities": edit_eligibilities,
        "editEligibilityEvidenceDigests": edit_eligibility_evidence_digests,
    }
    payload["fingerprint"] = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:24]
    return payload


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
