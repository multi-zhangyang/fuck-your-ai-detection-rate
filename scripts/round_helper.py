from __future__ import annotations

import hashlib
import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from fyadr_records import ROOT_DIR, load_records_normalized, normalize_doc_id, update_round
from fyadr_round_service import (
    get_max_rounds,
    get_prompt_mapping,
    get_prompt_sequence_key,
    get_round_compare_path,
    normalize_path,
    normalize_prompt_profile,
    normalize_prompt_sequence,
    relative_to_root,
    run_round,
)
from prompt_library import DEFAULT_PROMPT_PROFILE, LEGACY_PROMPT_PROFILE, is_prompt_sequence_customizable, prompt_sequence_match_rank
from path_utils import build_document_artifact_stem
from docx_bodymap import (
    build_docx_body_map,
    docx_body_map_from_payload,
    extract_body_map_paragraphs_from_output,
    get_body_map_unit_model_format_anchors,
    load_docx_body_map,
    retag_docx_body_map,
    save_docx_body_map,
    save_docx_body_map_validation,
    update_docx_body_map_texts,
    validate_docx_body_map,
    write_docx_body_map_input,
)
from docx_pipeline import ensure_docx_processing_assets, get_docx_extracted_text_path, get_docx_scope_diagnostics_path, get_docx_snapshot_path
from document_edit_contract import (
    assert_document_edit_contract_ready,
    build_document_edit_contract,
)


Transform = Callable[[str, str, int, str], str]
ProgressCallback = Callable[[dict[str, object]], None]
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"


@dataclass
class RoundContext:
    doc_id: str
    prompt_profile: str
    prompt_sequence: list[str]
    round_number: int
    prompt_path: str
    source_path: Path
    input_text_path: Path
    output_text_path: Path
    manifest_path: Path
    source_kind: str
    extracted_from_docx: bool
    docx_snapshot_path: Path | None = None
    scope_diagnostics_path: Path | None = None
    body_map_path: Path | None = None
    validation_path: Path | None = None
    edit_contract_path: Path | None = None
    parent_output_path: Path | None = None

    def to_dict(self) -> dict:
        return {
            "doc_id": self.doc_id,
            "prompt_profile": self.prompt_profile,
            "prompt_sequence": self.prompt_sequence,
            "round": self.round_number,
            "prompt_path": self.prompt_path,
            "source_path": str(self.source_path),
            "input_text_path": str(self.input_text_path),
            "output_text_path": str(self.output_text_path),
            "manifest_path": str(self.manifest_path),
            "source_kind": self.source_kind,
            "extracted_from_docx": self.extracted_from_docx,
            "docx_snapshot_path": str(self.docx_snapshot_path) if self.docx_snapshot_path else "",
            "scope_diagnostics_path": str(self.scope_diagnostics_path) if self.scope_diagnostics_path else "",
            "body_map_path": str(self.body_map_path) if self.body_map_path else "",
            "validation_path": str(self.validation_path) if self.validation_path else "",
            "edit_contract_path": str(self.edit_contract_path) if self.edit_contract_path else "",
            "parent_output_path": str(self.parent_output_path) if self.parent_output_path else "",
        }


@dataclass
class DocumentRoundState:
    doc_id: str
    prompt_profile: str
    prompt_sequence: list[str]
    completed_rounds: list[int]
    next_round: int | None
    is_complete: bool


def _round_sequence_match_rank(round_item: dict, prompt_profile: str, prompt_sequence: list[str]) -> int:
    if not is_prompt_sequence_customizable(prompt_profile):
        return 0
    return prompt_sequence_match_rank(round_item.get("prompt_sequence"), prompt_sequence, int(round_item.get("round", 0) or 0))


def _positive_int(value: Any) -> int | None:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized > 0 else None


def _round_path(value: Any) -> Path | None:
    raw_path = str(value or "").strip()
    if not raw_path:
        return None
    return normalize_path(Path(raw_path))


def _read_json_payload(path: Path | None) -> dict[str, Any] | None:
    if path is None or not path.exists() or not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _artifact_path_key(path_value: Any) -> str:
    raw_path = str(path_value or "").strip()
    if not raw_path:
        return ""
    try:
        return str(normalize_path(Path(raw_path)).resolve(strict=False))
    except (OSError, RuntimeError, ValueError):
        return ""


def _round_artifact_path_keys(round_item: dict[str, Any]) -> set[str]:
    keys = {
        _artifact_path_key(round_item.get(field))
        for field in ("output_path", "compare_path", "manifest_path", "body_map_path", "validation_path")
    }
    output_path = _round_path(round_item.get("output_path"))
    if output_path is not None:
        keys.add(_artifact_path_key(get_round_compare_path(output_path)))
    keys.discard("")
    return keys


def _legacy_round_artifacts_have_unique_owner(
    round_item: dict[str, Any],
    *,
    expected_doc_id: str,
    all_records: dict[str, Any],
) -> bool:
    """Allow untagged legacy artifacts only when history ownership is unique.

    Older compare payloads predate ``docId`` and cannot prove provenance by
    themselves. An explicit path that is also referenced by another document
    is therefore ambiguous and must never be used for continuation/restoration.
    """

    expected_keys = _round_artifact_path_keys(round_item)
    if not expected_keys:
        return False
    normalized_expected_doc_id = normalize_doc_id(expected_doc_id)
    for raw_doc_id, raw_entry in all_records.items():
        if normalize_doc_id(str(raw_doc_id)) == normalized_expected_doc_id or not isinstance(raw_entry, dict):
            continue
        raw_rounds = raw_entry.get("rounds")
        if not isinstance(raw_rounds, list):
            continue
        for other_round in raw_rounds:
            if isinstance(other_round, dict) and expected_keys.intersection(_round_artifact_path_keys(other_round)):
                return False
    return True


def _round_artifact_provenance_matches(
    compare_payload: dict[str, Any],
    round_item: dict[str, Any],
    *,
    expected_doc_id: str,
    all_records: dict[str, Any] | None,
) -> bool:
    payload_doc_id = str(compare_payload.get("docId") or compare_payload.get("doc_id") or "").strip()
    if payload_doc_id:
        return normalize_doc_id(payload_doc_id) == normalize_doc_id(expected_doc_id)
    if not isinstance(all_records, dict):
        return False
    return _legacy_round_artifacts_have_unique_owner(
        round_item,
        expected_doc_id=expected_doc_id,
        all_records=all_records,
    )


def round_record_has_usable_artifacts(
    round_item: dict[str, Any],
    *,
    expected_doc_id: str | None = None,
    all_records: dict[str, Any] | None = None,
) -> bool:
    input_segments = _positive_int(round_item.get("input_segment_count"))
    output_segments = _positive_int(round_item.get("output_segment_count"))
    output_path = _round_path(round_item.get("output_path"))
    if output_path is None or not output_path.exists() or not output_path.is_file():
        return False
    try:
        if output_path.stat().st_size <= 0:
            return False
    except OSError:
        return False

    compare_path = _round_path(round_item.get("compare_path")) or get_round_compare_path(output_path)
    compare_payload = _read_json_payload(compare_path)
    if compare_payload is None:
        return False
    if expected_doc_id is not None and not _round_artifact_provenance_matches(
        compare_payload,
        round_item,
        expected_doc_id=expected_doc_id,
        all_records=all_records,
    ):
        return False
    chunks = compare_payload.get("chunks")
    if not isinstance(chunks, list) or not chunks:
        return False
    compare_chunk_count = _positive_int(compare_payload.get("chunkCount"))
    compare_paragraph_count = _positive_int(compare_payload.get("paragraphCount"))
    if compare_chunk_count is None or compare_chunk_count != len(chunks) or compare_paragraph_count is None:
        return False
    if input_segments is not None and input_segments != compare_chunk_count:
        return False
    if output_segments is not None and output_segments != compare_chunk_count:
        return False

    manifest_payload = _read_json_payload(_round_path(round_item.get("manifest_path")))
    if manifest_payload is not None:
        manifest_chunk_count = _positive_int(manifest_payload.get("chunk_count"))
        manifest_paragraph_count = _positive_int(manifest_payload.get("paragraph_count"))
        if manifest_chunk_count is None or manifest_chunk_count != compare_chunk_count:
            return False
        if manifest_paragraph_count is None or manifest_paragraph_count != compare_paragraph_count:
            return False
    return True


def get_document_round_state(
    doc_id: str,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
) -> DocumentRoundState:
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    max_rounds = get_max_rounds(normalized_prompt_profile, normalized_prompt_sequence)
    records = load_records_normalized()
    rounds = _get_rounds(doc_id, records=records)
    completed = sorted(
        round_item.get("round")
        for round_item in rounds
        if isinstance(round_item, dict)
        and isinstance(round_item.get("round"), int)
        and str(round_item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower() == normalized_prompt_profile
        and _round_sequence_match_rank(round_item, normalized_prompt_profile, normalized_prompt_sequence) >= 0
        and 1 <= int(round_item.get("round")) <= max_rounds
        and round_record_has_usable_artifacts(round_item, expected_doc_id=doc_id, all_records=records)
    )
    for expected in range(1, max_rounds + 1):
        if expected not in completed:
            return DocumentRoundState(
                doc_id=doc_id,
                prompt_profile=normalized_prompt_profile,
                prompt_sequence=normalized_prompt_sequence,
                completed_rounds=completed,
                next_round=expected,
                is_complete=False,
            )
    return DocumentRoundState(
        doc_id=doc_id,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        completed_rounds=completed,
        next_round=None,
        is_complete=True,
    )


def detect_next_round(doc_id: str, prompt_profile: str = DEFAULT_PROMPT_PROFILE, prompt_sequence: object | None = None) -> int:
    state = get_document_round_state(doc_id, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    if state.next_round is None:
        raise ValueError(f"Document already completed all {get_max_rounds(prompt_profile, prompt_sequence)} rounds: {doc_id}")
    return state.next_round


def build_round_context(
    source_path: Path | str,
    round_number: int | None = None,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
) -> RoundContext:
    normalized_source = normalize_path(Path(source_path))
    doc_id = _build_doc_id(normalized_source)
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    prompts = get_prompt_mapping(normalized_prompt_profile, normalized_prompt_sequence)
    resolved_round = round_number or detect_next_round(
        doc_id,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
    )

    if resolved_round not in prompts:
        raise ValueError(f"Round {resolved_round} is not available for document: {doc_id}")

    stem = build_round_artifact_stem(doc_id, normalized_prompt_profile, normalized_prompt_sequence)
    source_kind = normalized_source.suffix.lower() or ".txt"
    output_text_path = INTERMEDIATE_DIR / f"{stem}_round{resolved_round}.txt"
    manifest_path = INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_manifest.json"
    parent_output_path = (
        _previous_round_output_path(
            doc_id,
            resolved_round - 1,
            prompt_profile=normalized_prompt_profile,
            prompt_sequence=normalized_prompt_sequence,
        )
        if resolved_round > 1
        else None
    )

    if source_kind == ".docx":
        docx_snapshot_path = get_docx_snapshot_path(normalized_source)
        scope_diagnostics_path = get_docx_scope_diagnostics_path(normalized_source)
        ensure_docx_processing_assets(
            normalized_source,
            snapshot_path=docx_snapshot_path,
            scope_diagnostics_path=scope_diagnostics_path,
        )
        return RoundContext(
            doc_id=doc_id,
            prompt_profile=normalized_prompt_profile,
            prompt_sequence=normalized_prompt_sequence,
            round_number=resolved_round,
            prompt_path=prompts[resolved_round],
            source_path=normalized_source,
            input_text_path=INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_input.txt",
            output_text_path=output_text_path,
            manifest_path=manifest_path,
            source_kind=source_kind,
            extracted_from_docx=True,
            docx_snapshot_path=docx_snapshot_path,
            scope_diagnostics_path=scope_diagnostics_path,
            body_map_path=INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_body_map.json",
            validation_path=INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_validation.json",
            edit_contract_path=INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_content_contract.json",
            parent_output_path=parent_output_path,
        )

    if resolved_round == 1:
        input_text_path, extracted_from_docx = ensure_round_input_text(normalized_source)
    else:
        # Every downstream round consumes an immutable, review-materialized
        # snapshot.  Never point its input path at the mutable parent output.
        input_text_path = INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_input.txt"
        extracted_from_docx = False

    return RoundContext(
        doc_id=doc_id,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
        round_number=resolved_round,
        prompt_path=prompts[resolved_round],
        source_path=normalized_source,
        input_text_path=input_text_path,
        output_text_path=output_text_path,
        manifest_path=manifest_path,
        source_kind=source_kind,
        extracted_from_docx=extracted_from_docx,
        docx_snapshot_path=None,
        scope_diagnostics_path=None,
        body_map_path=None,
        validation_path=None,
        parent_output_path=parent_output_path,
    )


def ensure_round_input_text(source_path: Path | str) -> tuple[Path, bool]:
    normalized_source = normalize_path(Path(source_path))
    suffix = normalized_source.suffix.lower()

    if suffix == ".txt":
        return normalized_source, False

    if suffix == ".docx":
        extracted_path = get_docx_extracted_text_path(normalized_source)
        snapshot_path = get_docx_snapshot_path(normalized_source)
        scope_diagnostics_path = get_docx_scope_diagnostics_path(normalized_source)
        ensure_docx_processing_assets(
            normalized_source,
            extracted_path=extracted_path,
            snapshot_path=snapshot_path,
            scope_diagnostics_path=scope_diagnostics_path,
        )
        return extracted_path, True

    raise ValueError(f"Unsupported input type for web mode: {normalized_source}")


def _sha256_round_input(text: str) -> str:
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()


def _write_round_input_atomically(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_name(f".{path.name}.{os.getpid()}.{time.monotonic_ns()}.tmp")
    try:
        temporary_path.write_text(text, encoding="utf-8")
        temporary_path.replace(path)
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass


def _prepare_parent_round_snapshot(
    context: RoundContext,
    artifact_snapshot: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if context.round_number <= 1:
        if artifact_snapshot is not None:
            raise ValueError("Round 1 must not receive a parent artifact snapshot.")
        return None
    if not isinstance(artifact_snapshot, dict):
        raise ValueError("A strict review-materialized parent snapshot is required for downstream rounds.")
    if context.parent_output_path is None:
        raise ValueError("Downstream round context is missing its server-derived parent output.")

    internal = artifact_snapshot.get("_internal")
    if not isinstance(internal, dict):
        raise ValueError("Parent artifact snapshot is missing internal effective content.")
    effective_text = internal.get("effectiveText")
    effective_paragraphs = internal.get("effectiveParagraphs")
    if not isinstance(effective_text, str) or not effective_text.strip():
        raise ValueError("Parent artifact snapshot has empty effective text.")
    if (
        not isinstance(effective_paragraphs, list)
        or not effective_paragraphs
        or any(not isinstance(item, str) for item in effective_paragraphs)
    ):
        raise ValueError("Parent artifact snapshot has invalid effective paragraphs.")
    normalized_paragraphs = [str(item) for item in effective_paragraphs]
    if "\n\n".join(normalized_paragraphs) != effective_text:
        raise ValueError("Parent artifact snapshot text does not match its effective paragraphs.")

    snapshot_output_path = normalize_path(Path(str(artifact_snapshot.get("outputPath", "") or "")))
    if snapshot_output_path != normalize_path(context.parent_output_path):
        raise ValueError("Parent artifact snapshot belongs to a different output.")
    compare_revision = str(artifact_snapshot.get("compareRevision", "") or "").strip()
    content_revision = str(artifact_snapshot.get("contentRevision", "") or "").strip()
    review_revision = str(artifact_snapshot.get("reviewRevision", "") or "").strip()
    effective_sha256 = str(artifact_snapshot.get("effectiveTextSha256", "") or "").strip().lower()
    actual_effective_sha256 = _sha256_round_input(effective_text)
    if not compare_revision or not content_revision:
        raise ValueError("Parent artifact snapshot is missing compare/content revision evidence.")
    if effective_sha256 != actual_effective_sha256:
        raise ValueError("Parent artifact snapshot effective-text digest is invalid.")

    materialization_source = str(
        artifact_snapshot.get("materializationSource", "review_materialized_compare")
        or "review_materialized_compare"
    ).strip()
    if materialization_source != "review_materialized_compare":
        raise ValueError("Parent artifact snapshot did not use review-materialized compare content.")
    provenance = {
        "parentOutputPath": str(normalize_path(context.parent_output_path)),
        "parentCompareRevision": compare_revision,
        "parentContentRevision": content_revision,
        "parentReviewRevision": review_revision,
        "effectiveInputSha256": actual_effective_sha256,
        "materializationSource": materialization_source,
    }
    artifact_snapshot_digest = str(artifact_snapshot.get("artifactSnapshotDigest", "") or "").strip()
    if artifact_snapshot_digest:
        provenance["parentArtifactSnapshotDigest"] = artifact_snapshot_digest
    return {
        "effectiveText": effective_text,
        "effectiveParagraphs": normalized_paragraphs,
        "bodyMapPayload": internal.get("bodyMapPayload"),
        "manifestPayload": internal.get("manifestPayload"),
        "provenance": provenance,
    }


def run_document_round(
    source_path: Path | str,
    transform: Transform,
    round_number: int | None = None,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
    progress_callback: ProgressCallback | None = None,
    checkpoint_metadata: dict[str, object] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    max_concurrency: int = 1,
    parent_artifact_snapshot: dict[str, Any] | None = None,
) -> dict:
    context = build_round_context(
        source_path,
        round_number=round_number,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
    )

    prepared_parent = _prepare_parent_round_snapshot(context, parent_artifact_snapshot)
    effective_checkpoint_metadata = dict(checkpoint_metadata or {})
    if prepared_parent is not None:
        effective_checkpoint_metadata["parent_input_provenance"] = dict(prepared_parent["provenance"])

    body_map = None
    if context.source_kind == ".docx":
        body_map = _prepare_docx_body_map(context, prepared_parent=prepared_parent)
        if context.docx_snapshot_path is None or context.edit_contract_path is None:
            raise ValueError("DOCX snapshot and content-contract paths are required for DOCX rounds.")
        pre_run_contract = build_document_edit_contract(
            context.source_path,
            snapshot_path=context.docx_snapshot_path,
            extracted_text_path=get_docx_extracted_text_path(context.source_path),
            body_map=body_map,
            candidate_texts=body_map.current_texts(),
            stage="pre_run",
            report_path=context.edit_contract_path,
        )
        assert_document_edit_contract_ready(pre_run_contract, label="开始降检")
        write_docx_body_map_input(body_map, context.input_text_path)
        if prepared_parent is not None:
            written_input = context.input_text_path.read_text(encoding="utf-8")
            if written_input != prepared_parent["effectiveText"]:
                raise ValueError("DOCX downstream input does not match the captured effective text.")
    elif prepared_parent is not None:
        _write_round_input_atomically(context.input_text_path, prepared_parent["effectiveText"])

    immutable_format_anchors = (
        {
            paragraph_index: anchors
            for paragraph_index, unit in enumerate(body_map.units)
            if (anchors := get_body_map_unit_model_format_anchors(unit))
        }
        if body_map is not None
        else None
    )

    result = run_round(
        doc_id=context.doc_id,
        round_number=context.round_number,
        input_path=context.input_text_path,
        output_path=context.output_text_path,
        manifest_path=context.manifest_path,
        transform=transform,
        prompt_profile=context.prompt_profile,
        prompt_sequence=context.prompt_sequence,
        progress_callback=progress_callback,
        checkpoint_metadata=effective_checkpoint_metadata,
        cancel_check=cancel_check,
        max_concurrency=max_concurrency,
        immutable_format_anchors=immutable_format_anchors,
    )

    if body_map is not None and context.body_map_path is not None:
        rewritten_paragraphs = extract_body_map_paragraphs_from_output(context.output_text_path)
        updated_body_map = update_docx_body_map_texts(
            body_map,
            rewritten_paragraphs,
            round_number=context.round_number,
        )
        updated_body_map = retag_docx_body_map(
            updated_body_map,
            prompt_profile=context.prompt_profile,
            round_number=context.round_number,
        )
        save_docx_body_map(updated_body_map, context.body_map_path)

        validation_report = validate_docx_body_map(
            updated_body_map,
            source_path=context.source_path,
            snapshot_path=context.docx_snapshot_path,
        )
        if context.validation_path is not None:
            save_docx_body_map_validation(validation_report, context.validation_path)

        if context.edit_contract_path is None:
            raise ValueError("DOCX content-contract path is required after a DOCX round.")
        post_round_contract = build_document_edit_contract(
            context.source_path,
            snapshot_path=context.docx_snapshot_path,
            extracted_text_path=get_docx_extracted_text_path(context.source_path),
            body_map=updated_body_map,
            candidate_texts=rewritten_paragraphs,
            stage="post_round",
            report_path=context.edit_contract_path,
        )
        assert_document_edit_contract_ready(post_round_contract, label="保存降检结果")

        result["doc_entry"] = update_round(
            doc_id=context.doc_id,
            round_number=context.round_number,
            prompt=context.prompt_path,
            prompt_profile=context.prompt_profile,
            prompt_sequence=context.prompt_sequence,
            input_path=relative_to_root(context.input_text_path),
            output_path=relative_to_root(context.output_text_path),
            chunk_limit=int(result["chunk_limit"]),
            input_segment_count=int(result["input_segment_count"]),
            output_segment_count=int(result["output_segment_count"]),
            manifest_path=relative_to_root(context.manifest_path),
            compare_path=relative_to_root(Path(str(result["compare_path"]))),
            quality_path=relative_to_root(Path(str(result["quality_path"]))) if result.get("quality_path") else None,
            body_map_path=relative_to_root(context.body_map_path),
            validation_path=relative_to_root(context.validation_path) if context.validation_path is not None else None,
        )
        result["body_map_path"] = str(context.body_map_path)
        if context.scope_diagnostics_path is not None:
            result["scope_diagnostics_path"] = str(context.scope_diagnostics_path)
        if context.validation_path is not None:
            result["validation_path"] = str(context.validation_path)
        result["validation_report"] = validation_report
        result["edit_contract_path"] = str(context.edit_contract_path)
        result["edit_contract"] = post_round_contract

    result["round_context"] = context.to_dict()
    if prepared_parent is not None:
        result["input_provenance"] = dict(prepared_parent["provenance"])
    return result


def dump_round_plan(
    source_path: Path | str,
    round_number: int | None = None,
    prompt_profile: str = DEFAULT_PROMPT_PROFILE,
    prompt_sequence: object | None = None,
) -> str:
    context = build_round_context(
        source_path,
        round_number=round_number,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
    )
    return json.dumps(context.to_dict(), ensure_ascii=False, indent=2)


def _build_doc_id(source_path: Path) -> str:
    return relative_to_root(source_path)


def build_round_artifact_stem(doc_id: str, prompt_profile: str, prompt_sequence: object | None = None) -> str:
    stem = build_document_artifact_stem(root_dir=ROOT_DIR, doc_id=doc_id)
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    if normalized_prompt_profile == LEGACY_PROMPT_PROFILE:
        return stem
    if is_prompt_sequence_customizable(normalized_prompt_profile):
        return f"{stem}_{get_prompt_sequence_key(normalized_prompt_profile, prompt_sequence)}"
    return f"{stem}_{normalized_prompt_profile}"


def _build_round_artifact_stem(doc_id: str, prompt_profile: str, prompt_sequence: object | None = None) -> str:
    """Backward-compatible private alias for callers/tests from older builds."""

    return build_round_artifact_stem(doc_id, prompt_profile, prompt_sequence)


def _get_rounds(doc_id: str, *, records: dict[str, Any] | None = None) -> list[dict]:
    records = load_records_normalized() if records is None else records
    entry = records.get(doc_id, {})
    rounds = entry.get("rounds", []) if isinstance(entry, dict) else []
    return [round_item for round_item in rounds if isinstance(round_item, dict)]


def _get_round_item(
    doc_id: str,
    round_number: int,
    *,
    prompt_profile: str,
    prompt_sequence: object | None = None,
) -> dict | None:
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    records = load_records_normalized()
    rounds = _get_rounds(doc_id, records=records)
    best_item: dict | None = None
    best_rank = -1
    for round_item in rounds:
        if round_item.get("round") != round_number:
            continue
        if str(round_item.get("prompt_profile", LEGACY_PROMPT_PROFILE) or LEGACY_PROMPT_PROFILE).strip().lower() != normalized_prompt_profile:
            continue
        if not round_record_has_usable_artifacts(round_item, expected_doc_id=doc_id, all_records=records):
            continue
        rank = _round_sequence_match_rank(round_item, normalized_prompt_profile, normalized_prompt_sequence)
        if rank > best_rank:
            best_item = round_item
            best_rank = rank
    return best_item


def _previous_round_output_path(
    doc_id: str,
    round_number: int,
    *,
    prompt_profile: str,
    prompt_sequence: object | None = None,
) -> Path:
    round_item = _get_round_item(doc_id, round_number, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    if round_item is not None:
        output_path = round_item.get("output_path")
        if isinstance(output_path, str) and output_path.strip():
            return normalize_path(Path(output_path))
    raise ValueError(
        f"Round {round_number} output not found for document: {doc_id} "
        f"under prompt profile {normalize_prompt_profile(prompt_profile)}"
    )


def _previous_round_body_map_path(
    doc_id: str,
    round_number: int,
    *,
    prompt_profile: str,
    prompt_sequence: object | None = None,
) -> Path | None:
    round_item = _get_round_item(doc_id, round_number, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    if round_item is None:
        return None
    body_map_path = round_item.get("body_map_path")
    if not isinstance(body_map_path, str) or not body_map_path.strip():
        return None
    return normalize_path(Path(body_map_path))


def _prepare_docx_body_map(
    context: RoundContext,
    *,
    prepared_parent: dict[str, Any] | None = None,
):
    if context.docx_snapshot_path is None:
        raise ValueError("DOCX snapshot path is required for DOCX rounds.")

    if context.round_number == 1:
        if prepared_parent is not None:
            raise ValueError("Round 1 DOCX input must not have a parent snapshot.")
        return build_docx_body_map(
            context.source_path,
            snapshot_path=context.docx_snapshot_path,
            prompt_profile=context.prompt_profile,
            round_number=context.round_number,
        )

    if prepared_parent is None:
        raise ValueError("A captured parent body map is required for downstream DOCX rounds.")
    previous_body_map = docx_body_map_from_payload(prepared_parent.get("bodyMapPayload"))
    if previous_body_map is None:
        raise ValueError("Parent artifact snapshot is missing a valid DOCX body map.")
    if normalize_path(Path(previous_body_map.source_path)) != normalize_path(context.source_path):
        raise ValueError("Parent DOCX body map belongs to a different source document.")
    retagged_body_map = retag_docx_body_map(
        previous_body_map,
        prompt_profile=context.prompt_profile,
        round_number=context.round_number,
    )
    return update_docx_body_map_texts(
        retagged_body_map,
        prepared_parent["effectiveParagraphs"],
        round_number=context.round_number,
    )
