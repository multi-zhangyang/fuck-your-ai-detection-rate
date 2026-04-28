"""Utility helpers for reading and writing AIGC reduction records.

This module maintains a JSON file under the workspace root `finish/` directory,
by default called `fyadr_records.json`.

The JSON structure is intentionally simple and stable so that other tools
or workflows can rely on it:

{
  "origin/毕业论文_原始_utf8.txt": {
    "origin_path": "origin/毕业论文_原始_utf8.txt",
    "rounds": [
      {
        "round": 1,
        "prompt": "prompts/fyadr-cn-round1.md",
        "input_path": "origin/毕业论文_原始_utf8.txt",
        "output_path": "finish/intermediate/毕业论文_原始_utf8_round1.txt",
        "score_total": 38,
        "timestamp": "2026-03-27T10:01:23Z"
      }
    ]
  }
}

- The top-level keys are logical document identifiers, typically the
  relative path of the source file under `origin/`.
- Each document entry stores the original path and an ordered list of
    completed rounds (1, 2).
- Each round records which prompt was used, which file was the input,
  which file is the output, an optional checklist total score, and a
  timestamp in ISO 8601 format.

You can import this module from other Python code, or use the CLI:

  python scripts/fyadr_records.py show                # show all records
  python scripts/fyadr_records.py show origin/xxx.txt # show one document
  python scripts/fyadr_records.py update-round \
      origin/xxx.txt 1 prompts/fyadr-cn-round1.md \
      origin/xxx.txt finish/intermediate/xxx_round1.txt \
      --score-total 38

The fyadr web pipeline should conceptually perform the same operations as
`update-round` whenever it finishes a single reduction round.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# Paths are computed relative to this file: scripts/ -> workspace root.
ROOT_DIR = Path(__file__).resolve().parents[1]
FINISH_DIR = ROOT_DIR / "finish"
RECORDS_PATH = FINISH_DIR / "fyadr_records.json"
SUPPORTED_PROMPT_PROFILES = {"cn", "cn_prewrite", "cn_custom"}
SUPPORTED_PROMPT_IDS = {"prewrite", "classical", "round1", "round2"}
DELETE_MODES = {"records_and_artifacts", "records_artifacts_and_source", "records_only", "exports_only"}
ORIGIN_DIR = ROOT_DIR / "origin"
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
WEB_EXPORTS_DIR = ROOT_DIR / "finish" / "web_exports"


@dataclass
class RoundRecord:
    """Single reduction round metadata for one document."""

    round: int
    prompt: str
    input_path: str
    output_path: str
    prompt_profile: str = "cn"
    prompt_sequence: Optional[List[str]] = None
    score_total: Optional[int] = None
    chunk_limit: Optional[int] = None
    input_segment_count: Optional[int] = None
    output_segment_count: Optional[int] = None
    manifest_path: Optional[str] = None
    compare_path: Optional[str] = None
    quality_path: Optional[str] = None
    body_map_path: Optional[str] = None
    validation_path: Optional[str] = None
    run_audit: Optional[Dict[str, Any]] = None
    timestamp: str = ""

    def to_dict(self) -> Dict[str, Any]:
        data: Dict[str, Any] = asdict(self)
        # Drop empty timestamp / None score to keep JSON clean.
        if not data.get("timestamp"):
            data.pop("timestamp", None)
        if data.get("score_total") is None:
            data.pop("score_total", None)
        if not data.get("prompt_sequence"):
            data.pop("prompt_sequence", None)
        if not data.get("run_audit"):
            data.pop("run_audit", None)
        return data


def _ensure_finish_dir() -> None:
    FINISH_DIR.mkdir(parents=True, exist_ok=True)


def load_records() -> Dict[str, Any]:
    """Load all AIGC records from the JSON file.

    Returns an empty dict if the file does not exist or is empty.
    """

    if not RECORDS_PATH.exists():
        return {}
    try:
        raw = RECORDS_PATH.read_text(encoding="utf-8")
    except OSError:
        return {}
    if not raw.strip():
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # If the JSON is corrupted, return empty instead of crashing.
        return {}
    if not isinstance(data, dict):
        return {}
    return data


def save_records(records: Dict[str, Any]) -> None:
    """Persist the records dictionary back to disk as JSON."""

    _ensure_finish_dir()
    text = json.dumps(records, ensure_ascii=False, indent=2, sort_keys=True)
    RECORDS_PATH.write_text(text, encoding="utf-8")


def normalize_record_path(path: str) -> str:
    candidate = str(path or "").strip().replace("\\", "/")
    while "//" in candidate:
        candidate = candidate.replace("//", "/")
    return candidate


def normalize_doc_id(doc_id: str) -> str:
    return normalize_record_path(doc_id)


def _normalize_prompt_profile(value: Any) -> str:
    candidate = str(value or "cn").strip().lower() or "cn"
    if candidate not in SUPPORTED_PROMPT_PROFILES:
        return "cn"
    return candidate


def _normalize_prompt_sequence(value: Any) -> List[str]:
    raw_items = value if isinstance(value, list) else []
    normalized: List[str] = []
    for raw_item in raw_items:
        prompt_id = str(raw_item or "").strip().lower()
        if prompt_id in SUPPORTED_PROMPT_IDS:
            normalized.append(prompt_id)
    return normalized[:3]


def _normalize_round_item(item: Dict[str, Any]) -> Dict[str, Any] | None:
    round_number = item.get("round")
    if not isinstance(round_number, int):
        return None

    normalized_item = dict(item)
    for field in (
        "prompt",
        "input_path",
        "output_path",
        "manifest_path",
        "compare_path",
        "quality_path",
        "body_map_path",
        "validation_path",
    ):
        value = normalized_item.get(field)
        if isinstance(value, str):
            normalized_item[field] = normalize_record_path(value)
    normalized_item["prompt_profile"] = _normalize_prompt_profile(normalized_item.get("prompt_profile", "cn"))
    prompt_sequence = _normalize_prompt_sequence(normalized_item.get("prompt_sequence"))
    if prompt_sequence:
        normalized_item["prompt_sequence"] = prompt_sequence
    else:
        normalized_item.pop("prompt_sequence", None)
    run_audit = normalized_item.get("run_audit")
    if isinstance(run_audit, dict):
        normalized_item["run_audit"] = _sanitize_run_audit(run_audit)
    else:
        normalized_item.pop("run_audit", None)
    return normalized_item


def _sanitize_run_audit(value: Dict[str, Any]) -> Dict[str, Any]:
    """Keep run audit metadata useful while stripping connection secrets."""

    allowed_fields = {
        "version",
        "providerName",
        "model",
        "apiType",
        "temperature",
        "offlineMode",
        "requestTimeoutSeconds",
        "maxRetries",
        "rateLimitWindowMinutes",
        "rateLimitMaxRequests",
        "promptProfile",
        "promptSequence",
        "rewriteCandidateMode",
        "candidateMaxPerChunk",
        "estimatedApiCalls",
        "twoCandidateChunkCount",
        "chunkCount",
        "paragraphCount",
        "splitParagraphCount",
        "validationRetryCount",
        "sourceFallbackCount",
        "validationEventCount",
        "machineLikeRiskCount",
        "protectedTokenCount",
    }
    sanitized: Dict[str, Any] = {}
    for key in allowed_fields:
        item = value.get(key)
        if isinstance(item, (str, int, float, bool)) or item is None:
            sanitized[key] = item
        elif key == "promptSequence" and isinstance(item, list):
            sanitized[key] = [str(part).strip() for part in item if str(part).strip()][:3]
    return {key: item for key, item in sanitized.items() if item not in ("", None, [])}


def _round_record_key(item: Dict[str, Any]) -> tuple[str, str, int] | None:
    round_number = item.get("round")
    if not isinstance(round_number, int):
        return None
    prompt_profile = _normalize_prompt_profile(item.get("prompt_profile", "cn"))
    sequence_key = ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"))) if prompt_profile == "cn_custom" else ""
    return (prompt_profile, sequence_key, round_number)


def normalize_records(records: Dict[str, Any]) -> Dict[str, Any]:
    normalized_records: Dict[str, Any] = {}

    for raw_key, raw_entry in records.items():
        if not isinstance(raw_entry, dict):
            continue

        normalized_key = normalize_doc_id(str(raw_key))
        if not normalized_key:
            continue

        target_entry = normalized_records.setdefault(
            normalized_key,
            {"origin_path": normalized_key, "rounds": []},
        )
        target_rounds = target_entry.get("rounds")
        if not isinstance(target_rounds, list):
            target_rounds = []

        merged_by_round_profile: Dict[tuple[str, int], Dict[str, Any]] = {}
        for item in target_rounds:
            if not isinstance(item, dict):
                continue
            normalized_item = _normalize_round_item(item)
            if normalized_item is None:
                continue
            round_key = _round_record_key(normalized_item)
            if round_key is None:
                continue
            merged_by_round_profile[round_key] = normalized_item

        incoming_rounds = raw_entry.get("rounds")
        if not isinstance(incoming_rounds, list):
            incoming_rounds = []

        for item in incoming_rounds:
            if not isinstance(item, dict):
                continue
            normalized_item = _normalize_round_item(item)
            if normalized_item is None:
                continue
            round_key = _round_record_key(normalized_item)
            if round_key is None:
                continue
            merged_by_round_profile[round_key] = normalized_item

        target_entry["origin_path"] = normalize_record_path(str(raw_entry.get("origin_path", normalized_key))) or normalized_key
        target_entry["rounds"] = [
            merged_by_round_profile[key]
            for key in sorted(merged_by_round_profile, key=lambda item: (item[0], item[1]))
        ]

    return normalized_records


def load_records_normalized() -> Dict[str, Any]:
    raw_records = load_records()
    normalized_records = normalize_records(raw_records)
    if normalized_records != raw_records:
        save_records(normalized_records)
    return normalized_records


def _record_path_to_absolute(path: str) -> Optional[Path]:
    normalized = normalize_record_path(path)
    if not normalized:
        return None
    candidate = Path(normalized)
    if not candidate.is_absolute():
        candidate = ROOT_DIR / candidate
    return candidate.resolve()


def _export_related_paths_for_output(output_path: Path) -> set[Path]:
    stem = output_path.stem
    paths: set[Path] = set()
    for export_stem in (stem, f"{stem}_reviewed"):
        for suffix in (".txt", ".docx", ".audit.json", ".guard.json"):
            paths.add((WEB_EXPORTS_DIR / f"{export_stem}{suffix}").resolve())
        paths.add((INTERMEDIATE_DIR / f"{export_stem}_format_preflight.json").resolve())
    return paths


def _derived_paths_for_output(output_path: Path) -> set[Path]:
    return {
        output_path.with_name(f"{output_path.stem}_checkpoint.json").resolve(),
        output_path.with_name(f"{output_path.stem}_compare.json").resolve(),
        output_path.with_name(f"{output_path.stem}_quality.json").resolve(),
        output_path.with_name(f"{output_path.stem}_bodymap.json").resolve(),
        output_path.with_name(f"{output_path.stem}_body_map.json").resolve(),
        output_path.with_name(f"{output_path.stem}_validation.json").resolve(),
        *_export_related_paths_for_output(output_path),
    }


def _collect_round_file_paths(rounds: List[Dict[str, Any]], *, include_exports: bool = True) -> set[Path]:
    collected: set[Path] = set()
    for item in rounds:
        if not isinstance(item, dict):
            continue
        for field in ("input_path", "output_path", "manifest_path", "compare_path", "quality_path", "body_map_path", "validation_path"):
            value = item.get(field)
            if not isinstance(value, str):
                continue
            absolute = _record_path_to_absolute(value)
            if absolute is not None:
                collected.add(absolute)
                if field == "output_path":
                    collected.update(_derived_paths_for_output(absolute) if include_exports else set())
    return collected


def _collect_round_export_paths(rounds: List[Dict[str, Any]]) -> set[Path]:
    collected: set[Path] = set()
    for item in rounds:
        if not isinstance(item, dict):
            continue
        value = item.get("output_path")
        if not isinstance(value, str):
            continue
        absolute = _record_path_to_absolute(value)
        if absolute is not None:
            collected.update(_export_related_paths_for_output(absolute))
    return collected


def _is_safe_generated_artifact(path: Path) -> bool:
    try:
        relative = path.relative_to(ROOT_DIR)
    except ValueError:
        return False

    relative_parts = relative.parts
    if not relative_parts:
        return False

    if relative_parts[0] != "finish":
        return False

    if len(relative_parts) < 2:
        return False

    return relative_parts[1] in {"intermediate", "web_exports"}


def _is_safe_project_source(path: Path) -> bool:
    try:
        path.relative_to(ORIGIN_DIR)
    except ValueError:
        return False
    return path.is_file()


def _source_path_for_entry(doc_id: str, entry: Dict[str, Any]) -> Optional[Path]:
    raw_origin_path = entry.get("origin_path") if isinstance(entry, dict) else None
    source_path = _record_path_to_absolute(str(raw_origin_path or doc_id))
    return source_path.resolve() if source_path is not None else None


def _docx_processing_paths_for_source(source_path: Path) -> set[Path]:
    if source_path.suffix.lower() != ".docx":
        return set()
    return {
        (INTERMEDIATE_DIR / f"{source_path.stem}_docx_snapshot.json").resolve(),
        (INTERMEDIATE_DIR / f"{source_path.stem}_extracted.txt").resolve(),
    }


def _source_related_paths_for_entry(doc_id: str, entry: Dict[str, Any]) -> set[Path]:
    source_path = _source_path_for_entry(doc_id, entry)
    if source_path is None:
        return set()
    paths = _docx_processing_paths_for_source(source_path)
    if _is_safe_project_source(source_path):
        paths.add(source_path)
    return paths


def _collect_record_source_paths(records: Dict[str, Any]) -> set[Path]:
    paths: set[Path] = set()
    for doc_id, entry in records.items():
        if not isinstance(entry, dict):
            continue
        source_path = _source_path_for_entry(str(doc_id), entry)
        if source_path is not None:
            paths.add(source_path)
            paths.update(_docx_processing_paths_for_source(source_path))
    return paths


def _delete_source_related_paths_for_removed_entry(
    doc_id: str,
    deleted_entry: Dict[str, Any],
    retained_records: Dict[str, Any],
) -> List[str]:
    retained_paths = _collect_record_source_paths(retained_records)
    removed_paths: List[str] = []
    for candidate in sorted(_source_related_paths_for_entry(doc_id, deleted_entry)):
        if candidate in retained_paths:
            continue
        if not (_is_safe_project_source(candidate) or _is_safe_generated_artifact(candidate)):
            continue
        if not candidate.exists() or not candidate.is_file():
            continue
        candidate.unlink()
        removed_paths.append(str(candidate.relative_to(ROOT_DIR)).replace("\\", "/"))
    return removed_paths


def _artifact_category(path: Path) -> str:
    try:
        relative = path.relative_to(ROOT_DIR)
    except ValueError:
        return "external"
    parts = relative.parts
    if not parts:
        return "external"
    if parts[0] == "origin":
        return "sources"
    if len(parts) < 2 or parts[0] != "finish":
        return "source"
    if parts[1] == "web_exports":
        return "exports"
    if path.name.endswith((".audit.json", ".guard.json", "_format_preflight.json", "_validation.json")):
        return "reports"
    return "intermediate"


def build_artifact_summary(rounds: List[Dict[str, Any]]) -> Dict[str, Any]:
    paths = _collect_round_file_paths([item for item in rounds if isinstance(item, dict)])
    counts = {
        "total": 0,
        "existing": 0,
        "intermediate": 0,
        "exports": 0,
        "reports": 0,
        "sources": 0,
        "external": 0,
        "missing": 0,
        "bytes": 0,
    }
    for path in paths:
        if not _is_safe_generated_artifact(path):
            counts["external"] += 1
            continue
        category = _artifact_category(path)
        counts["total"] += 1
        if path.exists() and path.is_file():
            counts["existing"] += 1
            if category in counts:
                counts[category] += 1
            try:
                counts["bytes"] += path.stat().st_size
            except OSError:
                pass
        else:
            counts["missing"] += 1
    return counts


def _delete_artifacts_for_removed_rounds(
    deleted_rounds: List[Dict[str, Any]],
    retained_rounds: List[Dict[str, Any]],
    *,
    exports_only: bool = False,
) -> List[str]:
    retained_paths = _collect_round_export_paths(retained_rounds) if exports_only else _collect_round_file_paths(retained_rounds)
    deleted_paths = _collect_round_export_paths(deleted_rounds) if exports_only else _collect_round_file_paths(deleted_rounds)
    removed_paths: List[str] = []

    for candidate in sorted(deleted_paths):
        if candidate in retained_paths:
            continue
        if not _is_safe_generated_artifact(candidate):
            continue
        if not candidate.exists() or not candidate.is_file():
            continue
        candidate.unlink()
        removed_paths.append(str(candidate.relative_to(ROOT_DIR)).replace("\\", "/"))

    return removed_paths


def _deleted_file_stats(removed_paths: List[str]) -> Dict[str, Any]:
    counts = {
        "total": len(removed_paths),
        "existing": len(removed_paths),
        "intermediate": 0,
        "exports": 0,
        "reports": 0,
        "sources": 0,
        "external": 0,
        "missing": 0,
        "bytes": 0,
    }
    for raw_path in removed_paths:
        absolute = _record_path_to_absolute(raw_path)
        if absolute is None:
            counts["external"] += 1
            continue
        category = _artifact_category(absolute)
        if category in counts:
            counts[category] += 1
    return counts


def _history_delete_file_entry(path: Path) -> Dict[str, Any]:
    normalized_path = path.resolve()
    category = _artifact_category(normalized_path)
    exists = normalized_path.exists() and normalized_path.is_file()
    size = 0
    if exists:
        try:
            size = normalized_path.stat().st_size
        except OSError:
            size = 0
    try:
        display_path = str(normalized_path.relative_to(ROOT_DIR)).replace("\\", "/")
    except ValueError:
        display_path = str(normalized_path)
    return {
        "path": str(normalized_path),
        "relativePath": display_path,
        "kind": category,
        "exists": exists,
        "bytes": size,
    }


def _history_delete_stats_for_entries(entries: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts = {
        "total": 0,
        "existing": 0,
        "intermediate": 0,
        "exports": 0,
        "reports": 0,
        "sources": 0,
        "external": 0,
        "missing": 0,
        "bytes": 0,
    }
    for entry in entries:
        counts["total"] += 1
        if bool(entry.get("exists")):
            counts["existing"] += 1
            counts["bytes"] += int(entry.get("bytes", 0) or 0)
            category = str(entry.get("kind", "external"))
            if category in counts:
                counts[category] += 1
            else:
                counts["external"] += 1
        else:
            counts["missing"] += 1
    return counts


def _round_filter(
    from_round: int,
    prompt_profile: str | None,
    prompt_sequence: Optional[List[str]],
) -> tuple[str | None, List[str] | None, str, Any]:
    normalized_prompt_profile = _normalize_prompt_profile(prompt_profile) if prompt_profile is not None else None
    normalized_prompt_sequence = (
        _normalize_prompt_sequence(prompt_sequence)
        if normalized_prompt_profile == "cn_custom" and prompt_sequence is not None
        else None
    )
    normalized_sequence_key = ",".join(normalized_prompt_sequence or [])

    def round_matches(item: Dict[str, Any]) -> bool:
        if not isinstance(item.get("round"), int) or item.get("round") < from_round:
            return False
        if normalized_prompt_profile is None:
            return True
        if _normalize_prompt_profile(item.get("prompt_profile", "cn")) != normalized_prompt_profile:
            return False
        if normalized_prompt_sequence is None:
            return True
        return ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"))) == normalized_sequence_key

    return normalized_prompt_profile, normalized_prompt_sequence, normalized_sequence_key, round_matches


def _build_delete_impact(
    *,
    doc_id: str,
    entry: Dict[str, Any],
    deleted_rounds: List[Dict[str, Any]],
    retained_rounds: List[Dict[str, Any]],
    mode: str,
    records_after: Dict[str, Any],
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
) -> Dict[str, Any]:
    if mode == "exports_only":
        candidate_paths = _collect_round_export_paths(deleted_rounds)
    elif mode == "records_only":
        candidate_paths = set()
    else:
        retained_paths = _collect_round_file_paths(retained_rounds)
        candidate_paths = {
            path
            for path in _collect_round_file_paths(deleted_rounds)
            if path not in retained_paths and _is_safe_generated_artifact(path)
        }
        if mode == "records_artifacts_and_source" and not retained_rounds:
            retained_source_paths = _collect_record_source_paths(records_after)
            candidate_paths.update(
                path
                for path in _source_related_paths_for_entry(doc_id, entry)
                if path not in retained_source_paths
                and (_is_safe_project_source(path) or _is_safe_generated_artifact(path))
            )

    entries = [
        _history_delete_file_entry(path)
        for path in sorted(candidate_paths, key=lambda item: str(item).lower())
    ]
    existing_entries = [entry for entry in entries if bool(entry.get("exists"))]
    affected_rounds = sorted({
        int(item["round"])
        for item in deleted_rounds
        if isinstance(item, dict) and isinstance(item.get("round"), int)
    })
    warnings: list[str] = []
    source_path = _source_path_for_entry(doc_id, entry)
    source_owned = bool(source_path and _is_safe_project_source(source_path))
    will_delete_source = any(str(file.get("kind")) == "sources" for file in existing_entries)
    if mode == "records_artifacts_and_source" and source_path is not None and not source_owned:
        warnings.append("源文档不在项目 origin 目录内，后端不会删除外部本地文件。")
    if mode == "records_only" and deleted_rounds:
        warnings.append("只移除历史索引会让原生成文件变成未归属产物，后续可在孤儿清理中处理。")

    return {
        "docId": doc_id,
        "mode": mode,
        "fromRound": from_round,
        "promptProfile": prompt_profile,
        "promptSequence": prompt_sequence or [],
        "affectedRounds": affected_rounds,
        "willDeleteRounds": mode not in {"records_only", "exports_only"},
        "willRemoveDocument": not retained_rounds and mode != "exports_only",
        "willDeleteSource": will_delete_source,
        "sourceOwnedByProject": source_owned,
        "sourcePath": str(source_path) if source_path is not None else "",
        "fileStats": _history_delete_stats_for_entries(existing_entries),
        "candidateStats": _history_delete_stats_for_entries(entries),
        "files": existing_entries[:80],
        "hasMoreFiles": len(existing_entries) > 80,
        "warnings": warnings,
    }


def preview_delete_document(
    doc_id: str,
    from_round: int | None = None,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
    mode: str | None = None,
) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")
    rounds = doc_entry.get("rounds") if isinstance(doc_entry.get("rounds"), list) else []
    target_rounds = [item for item in rounds if isinstance(item, dict)]

    if from_round is None:
        retained_rounds: List[Dict[str, Any]] = target_rounds if normalized_mode == "exports_only" else []
        records_after = dict(records)
        if normalized_mode != "exports_only":
            records_after.pop(normalized_doc_id, None)
        return _build_delete_impact(
            doc_id=normalized_doc_id,
            entry=doc_entry,
            deleted_rounds=target_rounds,
            retained_rounds=retained_rounds,
            mode=normalized_mode,
            records_after=records_after,
        )

    normalized_prompt_profile, normalized_prompt_sequence, _, round_matches = _round_filter(
        from_round,
        prompt_profile,
        prompt_sequence,
    )
    deleted_rounds = [item for item in target_rounds if round_matches(item)]
    if not deleted_rounds:
        suffix = f" under prompt profile {normalized_prompt_profile}" if normalized_prompt_profile else ""
        raise ValueError(f"No rounds found from round {from_round} for: {normalized_doc_id}{suffix}")
    retained_rounds = [
        item
        for item in target_rounds
        if normalized_mode == "exports_only" or not round_matches(item)
    ]
    records_after = dict(records)
    if normalized_mode != "exports_only":
        if retained_rounds:
            next_entry = dict(doc_entry)
            next_entry["rounds"] = retained_rounds
            records_after[normalized_doc_id] = next_entry
        else:
            records_after.pop(normalized_doc_id, None)
    return _build_delete_impact(
        doc_id=normalized_doc_id,
        entry=doc_entry,
        deleted_rounds=deleted_rounds,
        retained_rounds=retained_rounds,
        mode=normalized_mode,
        records_after=records_after,
        from_round=from_round,
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence,
    )


def update_round(
    doc_id: str,
    round_number: int,
    prompt: str,
    prompt_profile: str,
    input_path: str,
    output_path: str,
    score_total: Optional[int] = None,
    chunk_limit: Optional[int] = None,
    input_segment_count: Optional[int] = None,
    output_segment_count: Optional[int] = None,
    manifest_path: Optional[str] = None,
    compare_path: Optional[str] = None,
    quality_path: Optional[str] = None,
    body_map_path: Optional[str] = None,
    validation_path: Optional[str] = None,
    prompt_sequence: Optional[List[str]] = None,
    run_audit: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Update (or create) the record for a single document round.

    If a record for the same document and round already exists, it will be
    replaced. Otherwise it will be appended to the rounds list.

    Returns the updated document record.
    """

    normalized_doc_id = normalize_doc_id(doc_id)
    records = load_records_normalized()

    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        doc_entry = {"origin_path": normalized_doc_id, "rounds": []}

    rounds = doc_entry.get("rounds")
    if not isinstance(rounds, list):
        rounds = []

    normalized_prompt_profile = _normalize_prompt_profile(prompt_profile)
    normalized_prompt_sequence = _normalize_prompt_sequence(prompt_sequence) if normalized_prompt_profile == "cn_custom" else []
    normalized_sequence_key = ",".join(normalized_prompt_sequence)

    # Remove any existing entry for the same round under the same prompt profile.
    filtered_rounds: List[Dict[str, Any]] = [
        r
        for r in rounds
        if not (
            isinstance(r, dict)
            and r.get("round") == round_number
            and _normalize_prompt_profile(r.get("prompt_profile", "cn")) == normalized_prompt_profile
            and (
                normalized_prompt_profile != "cn_custom"
                or ",".join(_normalize_prompt_sequence(r.get("prompt_sequence"))) == normalized_sequence_key
            )
        )
    ]

    record = RoundRecord(
        round=round_number,
        prompt=normalize_record_path(prompt),
        prompt_profile=normalized_prompt_profile,
        prompt_sequence=normalized_prompt_sequence or None,
        input_path=normalize_record_path(input_path),
        output_path=normalize_record_path(output_path),
        score_total=score_total,
        chunk_limit=chunk_limit,
        input_segment_count=input_segment_count,
        output_segment_count=output_segment_count,
        manifest_path=normalize_record_path(manifest_path) if manifest_path else None,
        compare_path=normalize_record_path(compare_path) if compare_path else None,
        quality_path=normalize_record_path(quality_path) if quality_path else None,
        body_map_path=normalize_record_path(body_map_path) if body_map_path else None,
        validation_path=normalize_record_path(validation_path) if validation_path else None,
        run_audit=_sanitize_run_audit(run_audit) if isinstance(run_audit, dict) else None,
        timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    )

    filtered_rounds.append(record.to_dict())
    # Keep rounds grouped by prompt profile, then sorted by round number.
    filtered_rounds.sort(
        key=lambda item: (
            _normalize_prompt_profile(item.get("prompt_profile", "cn")) if isinstance(item, dict) else "cn",
            ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"))) if isinstance(item, dict) else "",
            int(item.get("round", 0)) if isinstance(item, dict) else 0,
        )
    )

    doc_entry["origin_path"] = normalized_doc_id
    doc_entry["rounds"] = filtered_rounds
    records[normalized_doc_id] = doc_entry

    save_records(records)
    return doc_entry


def list_records() -> Dict[str, Any]:
    return load_records_normalized()


def _normalize_delete_mode(mode: str | None) -> str:
    normalized = str(mode or "records_and_artifacts").strip().lower()
    if normalized not in DELETE_MODES:
        raise ValueError(f"Unsupported delete mode: {mode}")
    return normalized


def delete_rounds(
    doc_id: str,
    from_round: int,
    prompt_profile: str | None = None,
    prompt_sequence: Optional[List[str]] = None,
    mode: str | None = None,
) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    impact = preview_delete_document(
        normalized_doc_id,
        from_round,
        prompt_profile=prompt_profile,
        prompt_sequence=prompt_sequence,
        mode=normalized_mode,
    )
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")

    rounds = doc_entry.get("rounds")
    if not isinstance(rounds, list):
        rounds = []

    normalized_prompt_profile, normalized_prompt_sequence, normalized_sequence_key, round_matches = _round_filter(
        from_round,
        prompt_profile,
        prompt_sequence,
    )

    deleted_rounds = [
        item for item in rounds
        if isinstance(item, dict)
        and round_matches(item)
    ]
    if not deleted_rounds:
        suffix = f" under prompt profile {normalized_prompt_profile}" if normalized_prompt_profile else ""
        raise ValueError(f"No rounds found from round {from_round} for: {normalized_doc_id}{suffix}")

    if normalized_mode == "exports_only":
        retained_export_rounds = [
            item
            for item in rounds
            if isinstance(item, dict) and not round_matches(item)
        ]
        removed_files = _delete_artifacts_for_removed_rounds(deleted_rounds, retained_export_rounds, exports_only=True)
        remaining_rounds_for_response = [
            item
            for item in rounds
            if isinstance(item, dict)
            and (
                normalized_prompt_profile is None
                or (
                    _normalize_prompt_profile(item.get("prompt_profile", "cn")) == normalized_prompt_profile
                    and (
                        normalized_prompt_sequence is None
                        or ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"))) == normalized_sequence_key
                    )
                )
            )
        ]
        result = {
            "docId": normalized_doc_id,
            "mode": normalized_mode,
            "affectedRounds": sorted({
                int(item["round"])
                for item in deleted_rounds
                if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "deletedRounds": [],
            "remainingRounds": sorted({
                int(item["round"])
                for item in remaining_rounds_for_response
                if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "removedDocument": False,
            "deletedFiles": removed_files,
            "deletedFileStats": impact["fileStats"],
        }
        if normalized_prompt_profile is not None:
            result["promptProfile"] = normalized_prompt_profile
        if normalized_prompt_sequence is not None:
            result["promptSequence"] = normalized_prompt_sequence
        return result

    remaining_rounds = [
        item for item in rounds
        if not (
            isinstance(item, dict)
            and round_matches(item)
        )
    ]

    if remaining_rounds:
        doc_entry["origin_path"] = normalized_doc_id
        doc_entry["rounds"] = remaining_rounds
        records[normalized_doc_id] = doc_entry
    else:
        records.pop(normalized_doc_id, None)

    save_records(records)
    removed_files = [] if normalized_mode == "records_only" else _delete_artifacts_for_removed_rounds(deleted_rounds, remaining_rounds)
    if normalized_mode == "records_artifacts_and_source" and not remaining_rounds:
        removed_files.extend(_delete_source_related_paths_for_removed_entry(normalized_doc_id, doc_entry, records))
    remaining_rounds_for_response = remaining_rounds
    if normalized_prompt_profile is not None:
        remaining_rounds_for_response = [
            item
            for item in remaining_rounds
            if isinstance(item, dict)
            and _normalize_prompt_profile(item.get("prompt_profile", "cn")) == normalized_prompt_profile
            and (
                normalized_prompt_sequence is None
                or ",".join(_normalize_prompt_sequence(item.get("prompt_sequence"))) == normalized_sequence_key
            )
        ]

    result = {
        "docId": normalized_doc_id,
        "mode": normalized_mode,
        "affectedRounds": sorted({
            int(item["round"])
            for item in deleted_rounds
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "deletedRounds": sorted({
            int(item["round"])
            for item in deleted_rounds
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "remainingRounds": sorted({
            int(item["round"])
            for item in remaining_rounds_for_response
            if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "removedDocument": not remaining_rounds,
        "deletedFiles": removed_files,
        "deletedFileStats": impact["fileStats"],
    }
    if normalized_prompt_profile is not None:
        result["promptProfile"] = normalized_prompt_profile
    if normalized_prompt_sequence is not None:
        result["promptSequence"] = normalized_prompt_sequence
    return result


def delete_document(doc_id: str, mode: str | None = None) -> Dict[str, Any]:
    normalized_mode = _normalize_delete_mode(mode)
    normalized_doc_id = normalize_doc_id(doc_id)
    impact = preview_delete_document(normalized_doc_id, mode=normalized_mode)
    records = load_records_normalized()
    doc_entry = records.get(normalized_doc_id)
    if not isinstance(doc_entry, dict):
        raise ValueError(f"Document record not found: {normalized_doc_id}")
    rounds = doc_entry.get("rounds") if isinstance(doc_entry.get("rounds"), list) else []
    target_rounds = [item for item in rounds if isinstance(item, dict)]
    if normalized_mode == "exports_only":
        removed_files = _delete_artifacts_for_removed_rounds(target_rounds, [], exports_only=True)
        return {
            "docId": normalized_doc_id,
            "mode": normalized_mode,
            "affectedRounds": sorted({
                int(item["round"]) for item in target_rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "deletedRounds": [],
            "remainingRounds": sorted({
                int(item["round"]) for item in target_rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
            }),
            "removedDocument": False,
            "deletedFiles": removed_files,
            "deletedFileStats": impact["fileStats"],
        }
    records.pop(normalized_doc_id, None)
    save_records(records)
    removed_files = [] if normalized_mode == "records_only" else _delete_artifacts_for_removed_rounds(target_rounds, [])
    if normalized_mode == "records_artifacts_and_source":
        removed_files.extend(_delete_source_related_paths_for_removed_entry(normalized_doc_id, doc_entry, records))
    return {
        "docId": normalized_doc_id,
        "mode": normalized_mode,
        "affectedRounds": sorted({
            int(item["round"]) for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "deletedRounds": sorted({
            int(item["round"]) for item in rounds if isinstance(item, dict) and isinstance(item.get("round"), int)
        }),
        "remainingRounds": [],
        "removedDocument": True,
        "deletedFiles": removed_files,
        "deletedFileStats": impact["fileStats"],
    }


def show_records(doc_id: Optional[str] = None) -> None:
    """Print all records, or the record for a single document.

    Output is raw JSON on stdout so it can be piped or inspected easily.
    """

    records = load_records_normalized()
    if doc_id is not None:
        payload: Any = records.get(normalize_doc_id(doc_id), {})
    else:
        payload = records
    text = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    print(text)


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Manage AIGC reduction records in finish/fyadr_records.json",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    show_parser = subparsers.add_parser(
        "show", help="Show all records or a single document",
    )
    show_parser.add_argument(
        "doc_id",
        nargs="?",
        help="Document identifier (e.g. origin/xxx.txt). If omitted, show all records.",
    )

    delete_parser = subparsers.add_parser(
        "delete-document", help="Delete a whole document record",
    )
    delete_parser.add_argument("doc_id", help="Document identifier to delete.")

    rollback_parser = subparsers.add_parser(
        "delete-rounds", help="Delete one round and all later rounds for a document",
    )
    rollback_parser.add_argument("doc_id", help="Document identifier to modify.")
    rollback_parser.add_argument("from_round", type=int, help="Delete this round and later rounds.")
    rollback_parser.add_argument(
        "--prompt-profile",
        default=None,
        choices=sorted(SUPPORTED_PROMPT_PROFILES),
        help="Optional prompt profile filter for rollback. When omitted, matching rounds are removed across all profiles.",
    )

    update_parser = subparsers.add_parser(
        "update-round", help="Create or update a single document round record",
    )
    update_parser.add_argument(
        "doc_id",
        help="Document identifier, typically the origin/ relative path.",
    )
    update_parser.add_argument(
        "round",
        type=int,
        help="Round number (1, 2, or 3).",
    )
    update_parser.add_argument(
        "prompt",
        help="Prompt file path used for this round (e.g. prompts/fyadr-cn-round1.md).",
    )
    update_parser.add_argument(
        "--prompt-profile",
        default="cn",
        choices=sorted(SUPPORTED_PROMPT_PROFILES),
        help="Prompt profile for this round: cn=中文双轮, cn_prewrite=中文三轮预改写, cn_custom=自定义组合.",
    )
    update_parser.add_argument(
        "input_path",
        help="Input text file path for this round.",
    )
    update_parser.add_argument(
        "output_path",
        help="Output text file path for this round.",
    )
    update_parser.add_argument(
        "--score-total",
        type=int,
        default=None,
        help="Optional checklist total score for this round.",
    )
    update_parser.add_argument(
        "--chunk-limit",
        type=int,
        default=None,
        help="Optional per-chunk character limit used in this round.",
    )
    update_parser.add_argument(
        "--input-segment-count",
        type=int,
        default=None,
        help="Optional number of chunks produced from the input text.",
    )
    update_parser.add_argument(
        "--output-segment-count",
        type=int,
        default=None,
        help="Optional number of chunk outputs written back into the restored text.",
    )
    update_parser.add_argument(
        "--manifest-path",
        default=None,
        help="Optional path to the chunk manifest json for this round.",
    )

    return parser


def main(argv: Optional[List[str]] = None) -> None:
    parser = _build_arg_parser()
    args = parser.parse_args(argv)

    if args.command == "show":
        show_records(args.doc_id)
    elif args.command == "update-round":
        doc_entry = update_round(
            doc_id=args.doc_id,
            round_number=args.round,
            prompt=args.prompt,
            prompt_profile=args.prompt_profile,
            input_path=args.input_path,
            output_path=args.output_path,
            score_total=args.score_total,
            chunk_limit=args.chunk_limit,
            input_segment_count=args.input_segment_count,
            output_segment_count=args.output_segment_count,
            manifest_path=args.manifest_path,
        )
        text = json.dumps(doc_entry, ensure_ascii=False, indent=2, sort_keys=True)
        print(text)
    elif args.command == "delete-document":
        payload = delete_document(args.doc_id)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    elif args.command == "delete-rounds":
        payload = delete_rounds(args.doc_id, args.from_round, prompt_profile=args.prompt_profile)
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:  # pragma: no cover - argparse guarantees command
        parser.error("Unknown command")


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
