from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from fyadr_records import ROOT_DIR, load_records_normalized, update_round
from fyadr_round_service import (
    get_max_rounds,
    get_prompt_mapping,
    get_prompt_sequence_key,
    normalize_path,
    normalize_prompt_profile,
    normalize_prompt_sequence,
    relative_to_root,
    run_round,
)
from docx_bodymap import (
    build_docx_body_map,
    extract_body_map_paragraphs_from_output,
    load_docx_body_map,
    retag_docx_body_map,
    save_docx_body_map,
    save_docx_body_map_validation,
    update_docx_body_map_texts,
    validate_docx_body_map,
    write_docx_body_map_input,
)
from docx_pipeline import ensure_docx_processing_assets, get_docx_extracted_text_path, get_docx_scope_diagnostics_path, get_docx_snapshot_path


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
        }


@dataclass
class DocumentRoundState:
    doc_id: str
    prompt_profile: str
    prompt_sequence: list[str]
    completed_rounds: list[int]
    next_round: int | None
    is_complete: bool


def _round_sequence_key(round_item: dict, prompt_profile: str) -> str:
    if normalize_prompt_profile(prompt_profile) != "cn_custom":
        return ""
    sequence = round_item.get("prompt_sequence")
    if not isinstance(sequence, list):
        return ""
    return ",".join(str(item or "").strip().lower() for item in sequence if str(item or "").strip())


def get_document_round_state(
    doc_id: str,
    prompt_profile: str = "cn",
    prompt_sequence: object | None = None,
) -> DocumentRoundState:
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = normalize_prompt_sequence(normalized_prompt_profile, prompt_sequence)
    expected_sequence_key = ",".join(normalized_prompt_sequence) if normalized_prompt_profile == "cn_custom" else ""
    max_rounds = get_max_rounds(normalized_prompt_profile, normalized_prompt_sequence)
    rounds = _get_rounds(doc_id)
    completed = sorted(
        round_item.get("round")
        for round_item in rounds
        if isinstance(round_item, dict)
        and isinstance(round_item.get("round"), int)
        and str(round_item.get("prompt_profile", "cn") or "cn").strip().lower() == normalized_prompt_profile
        and (
            normalized_prompt_profile != "cn_custom"
            or _round_sequence_key(round_item, normalized_prompt_profile) == expected_sequence_key
        )
        and 1 <= int(round_item.get("round")) <= max_rounds
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


def detect_next_round(doc_id: str, prompt_profile: str = "cn", prompt_sequence: object | None = None) -> int:
    state = get_document_round_state(doc_id, prompt_profile=prompt_profile, prompt_sequence=prompt_sequence)
    if state.next_round is None:
        raise ValueError(f"Document already completed all {get_max_rounds(prompt_profile, prompt_sequence)} rounds: {doc_id}")
    return state.next_round


def build_round_context(
    source_path: Path | str,
    round_number: int | None = None,
    prompt_profile: str = "cn",
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

    stem = _build_round_artifact_stem(doc_id, normalized_prompt_profile, normalized_prompt_sequence)
    source_kind = normalized_source.suffix.lower() or ".txt"
    output_text_path = INTERMEDIATE_DIR / f"{stem}_round{resolved_round}.txt"
    manifest_path = INTERMEDIATE_DIR / f"{stem}_round{resolved_round}_manifest.json"

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
        )

    if resolved_round == 1:
        input_text_path, extracted_from_docx = ensure_round_input_text(normalized_source)
    else:
        input_text_path = _previous_round_output_path(
            doc_id,
            resolved_round - 1,
            prompt_profile=normalized_prompt_profile,
            prompt_sequence=normalized_prompt_sequence,
        )
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


def run_document_round(
    source_path: Path | str,
    transform: Transform,
    round_number: int | None = None,
    prompt_profile: str = "cn",
    prompt_sequence: object | None = None,
    progress_callback: ProgressCallback | None = None,
    checkpoint_metadata: dict[str, object] | None = None,
    cancel_check: Callable[[], bool] | None = None,
    rewrite_candidate_mode: str = "economy",
) -> dict:
    context = build_round_context(
        source_path,
        round_number=round_number,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
    )

    body_map = None
    if context.source_kind == ".docx":
        body_map = _prepare_docx_body_map(context)
        write_docx_body_map_input(body_map, context.input_text_path)

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
        checkpoint_metadata=checkpoint_metadata,
        cancel_check=cancel_check,
        rewrite_candidate_mode=rewrite_candidate_mode,
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

    result["round_context"] = context.to_dict()
    return result


def dump_round_plan(
    source_path: Path | str,
    round_number: int | None = None,
    prompt_profile: str = "cn",
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


def _doc_stem(doc_id: str) -> str:
    return Path(doc_id).stem


def _build_round_artifact_stem(doc_id: str, prompt_profile: str, prompt_sequence: object | None = None) -> str:
    stem = _doc_stem(doc_id)
    normalized_prompt_profile = normalize_prompt_profile(prompt_profile)
    if normalized_prompt_profile == "cn":
        return stem
    if normalized_prompt_profile == "cn_custom":
        return f"{stem}_{get_prompt_sequence_key(normalized_prompt_profile, prompt_sequence)}"
    return f"{stem}_{normalized_prompt_profile}"


def _get_rounds(doc_id: str) -> list[dict]:
    records = load_records_normalized()
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
    expected_sequence_key = ",".join(normalized_prompt_sequence) if normalized_prompt_profile == "cn_custom" else ""
    rounds = _get_rounds(doc_id)
    for round_item in rounds:
        if (
            round_item.get("round") == round_number
            and str(round_item.get("prompt_profile", "cn") or "cn").strip().lower() == normalized_prompt_profile
            and (
                normalized_prompt_profile != "cn_custom"
                or _round_sequence_key(round_item, normalized_prompt_profile) == expected_sequence_key
            )
        ):
            return round_item
    return None


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


def _prepare_docx_body_map(context: RoundContext):
    if context.docx_snapshot_path is None:
        raise ValueError("DOCX snapshot path is required for DOCX rounds.")

    if context.round_number == 1:
        return build_docx_body_map(
            context.source_path,
            snapshot_path=context.docx_snapshot_path,
            prompt_profile=context.prompt_profile,
            round_number=context.round_number,
        )

    previous_round = context.round_number - 1
    previous_body_map_path = _previous_round_body_map_path(
        context.doc_id,
        previous_round,
        prompt_profile=context.prompt_profile,
        prompt_sequence=context.prompt_sequence,
    )
    if previous_body_map_path is not None:
        previous_body_map = load_docx_body_map(previous_body_map_path)
        if previous_body_map is not None:
            return retag_docx_body_map(
                previous_body_map,
                prompt_profile=context.prompt_profile,
                round_number=context.round_number,
            )

    legacy_body_map = build_docx_body_map(
        context.source_path,
        snapshot_path=context.docx_snapshot_path,
        prompt_profile=context.prompt_profile,
        round_number=context.round_number,
    )
    previous_output_path = _previous_round_output_path(
        context.doc_id,
        previous_round,
        prompt_profile=context.prompt_profile,
        prompt_sequence=context.prompt_sequence,
    )
    legacy_paragraphs = extract_body_map_paragraphs_from_output(previous_output_path)
    migrated_body_map = update_docx_body_map_texts(
        legacy_body_map,
        legacy_paragraphs,
        round_number=context.round_number,
    )
    return retag_docx_body_map(
        migrated_body_map,
        prompt_profile=context.prompt_profile,
        round_number=context.round_number,
    )
