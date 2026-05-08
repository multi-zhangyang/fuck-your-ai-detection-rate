from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Sequence

from docx_bodymap import DocxBodyMap, validate_docx_body_map
from docx_pipeline import _is_snapshot_current, _load_docx_snapshot
from fyadr_round_service import (
    _extract_required_term_counts,
    _extract_required_terms,
    detect_chunk_language,
    find_english_spacing_corruptions,
    normalize_chunk_output,
)


MAX_REPORTED_ISSUES = 50


def get_docx_export_guard_report_path(export_path: Path) -> Path:
    return export_path.with_suffix(".guard.json")


def run_docx_pre_export_guard(
    rewritten_paragraphs: Sequence[str],
    *,
    source_path: Path,
    snapshot_path: Path,
    export_path: Path,
    output_path: Path | None = None,
    body_map: DocxBodyMap | None = None,
    compare_payload: dict[str, Any] | None = None,
    decisions: dict[str, str] | None = None,
    mode: str = "docx-export",
    paragraph_source: str = "",
    report_path: Path | None = None,
) -> dict[str, Any]:
    normalized_source_path = source_path.resolve()
    normalized_snapshot_path = snapshot_path.resolve()
    normalized_export_path = export_path.resolve()
    normalized_output_path = output_path.resolve() if output_path is not None else None
    report_path = report_path or get_docx_export_guard_report_path(normalized_export_path)

    blocking_issues: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    report: dict[str, Any] = {
        "ok": False,
        "version": 1,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "mode": mode,
        "paragraphSource": paragraph_source,
        "sourcePath": str(normalized_source_path),
        "snapshotPath": str(normalized_snapshot_path),
        "exportPath": str(normalized_export_path),
        "outputPath": str(normalized_output_path) if normalized_output_path is not None else "",
        "bodyMapPresent": body_map is not None,
        "comparePayloadPresent": compare_payload is not None,
        "expectedEditableUnitCount": 0,
        "bodyMapUnitCount": len(body_map.units) if body_map is not None else 0,
        "actualParagraphCount": len(rewritten_paragraphs),
        "blockingIssues": blocking_issues,
        "warnings": warnings,
    }

    snapshot = _load_docx_snapshot(normalized_snapshot_path)
    if snapshot is None:
        _add_issue(
            blocking_issues,
            "snapshot_missing",
            f"未找到 Word 快照，无法确认导出是否会破坏排版：{normalized_snapshot_path}",
        )
    else:
        editable_units = snapshot.editable_units()
        report["expectedEditableUnitCount"] = len(editable_units)
        report["totalTextUnitCount"] = snapshot.total_text_unit_count
        report["protectedUnitCount"] = snapshot.total_text_unit_count - len(editable_units)
        body_map_export_count_matches = body_map is not None and len(rewritten_paragraphs) == len(body_map.units)

        if not _is_snapshot_current(snapshot, normalized_source_path):
            _add_issue(
                blocking_issues,
                "snapshot_stale",
                "原始 Word 在生成快照后发生过变化，需要重新上传或重新执行当前轮次。",
            )

        if len(rewritten_paragraphs) != len(editable_units):
            if body_map_export_count_matches:
                _add_issue(
                    warnings,
                    "body_map_scope_drift",
                    "\u5f53\u524d Word \u4fdd\u62a4\u533a\u7b97\u6cd5\u8bc6\u522b\u51fa\u7684\u6b63\u6587\u6570\u91cf\u4e0e\u6b64\u8f6e\u51bb\u7ed3\u7684 body map \u4e0d\u4e00\u81f4\uff0c\u5df2\u6309\u5f53\u8f6e body map \u76ee\u6807\u6bb5\u843d\u517c\u5bb9\u5bfc\u51fa\u3002",
                    snapshotEditableUnitCount=len(editable_units),
                    bodyMapUnitCount=len(body_map.units) if body_map is not None else 0,
                    actual=len(rewritten_paragraphs),
                )
            else:
                _add_issue(
                    blocking_issues,
                    "paragraph_count_mismatch",
                    f"\u5bfc\u51fa\u6bb5\u843d\u6570\u4e0e Word \u53ef\u7f16\u8f91\u6b63\u6587\u6570\u4e0d\u4e00\u81f4\uff1a\u9884\u671f {len(editable_units)} \u6bb5\uff0c\u5b9e\u9645 {len(rewritten_paragraphs)} \u6bb5\u3002",
                    expected=len(editable_units),
                    actual=len(rewritten_paragraphs),
                )

        _check_rewritten_paragraphs(
            rewritten_paragraphs,
            editable_units=editable_units,
            body_map=body_map,
            blocking_issues=blocking_issues,
            warnings=warnings,
        )
        if body_map is not None:
            _check_body_map(
                body_map,
                rewritten_paragraphs=rewritten_paragraphs,
                editable_units=editable_units,
                source_path=normalized_source_path,
                snapshot_path=normalized_snapshot_path,
                blocking_issues=blocking_issues,
                warnings=warnings,
                allow_snapshot_scope_drift=body_map_export_count_matches,
            )
        if compare_payload is not None:
            _check_compare_payload(
                compare_payload,
                rewritten_paragraphs=rewritten_paragraphs,
                decisions=decisions,
                blocking_issues=blocking_issues,
                warnings=warnings,
            )

    report["ok"] = not blocking_issues
    report["blockingIssueCount"] = len(blocking_issues)
    report["warningCount"] = len(warnings)
    report["blockingIssues"] = blocking_issues[:MAX_REPORTED_ISSUES]
    report["warnings"] = warnings[:MAX_REPORTED_ISSUES]
    report["truncatedBlockingIssues"] = max(0, len(blocking_issues) - MAX_REPORTED_ISSUES)
    report["truncatedWarnings"] = max(0, len(warnings) - MAX_REPORTED_ISSUES)
    _write_guard_report(report, report_path)
    report["reportPath"] = str(report_path.resolve())
    return report


def summarize_docx_export_guard_failure(report: dict[str, Any], *, label: str = "导出") -> str:
    raw_issues = report.get("blockingIssues")
    issues = raw_issues if isinstance(raw_issues, list) else []
    messages = [
        str(item.get("message", "")).strip()
        for item in issues
        if isinstance(item, dict) and str(item.get("message", "")).strip()
    ]
    detail = "；".join(messages[:3]).strip()
    report_path = str(report.get("reportPath", "")).strip()
    suffix = f" 报告：{report_path}" if report_path else ""
    return f"DOCX {label}已拦截：导出前硬审计未通过。" + (f" {detail}" if detail else "") + suffix


def _check_body_map(
    body_map: DocxBodyMap,
    *,
    rewritten_paragraphs: Sequence[str],
    editable_units: Sequence[Any],
    source_path: Path,
    snapshot_path: Path,
    blocking_issues: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
    allow_snapshot_scope_drift: bool = False,
) -> None:
    if body_map.editable_unit_count != len(body_map.units):
        _add_issue(
            blocking_issues,
            "body_map_count_mismatch",
            f"body map 记录的正文数量不一致：声明 {body_map.editable_unit_count} 段，实际 {len(body_map.units)} 段。",
            expected=body_map.editable_unit_count,
            actual=len(body_map.units),
        )
    if len(body_map.units) != len(rewritten_paragraphs):
        _add_issue(
            blocking_issues,
            "body_map_paragraph_mismatch",
            f"body map 与待导出段落数量不一致：body map {len(body_map.units)} 段，待导出 {len(rewritten_paragraphs)} 段。",
            expected=len(body_map.units),
            actual=len(rewritten_paragraphs),
        )
        return

    editable_target_keys = {_target_key(unit.target) for unit in editable_units}
    seen_target_keys: set[tuple[Any, ...]] = set()
    previous_paragraph_index = -1
    previous_unit_index = -1
    for unit_index, unit in enumerate(body_map.units):
        if unit.unit_index < previous_unit_index:
            _add_issue(
                blocking_issues,
                "body_map_order_mismatch",
                "body map 单元序号出现回退，导出会造成正文顺序异常。",
                unitIndex=unit_index,
                recordedUnitIndex=unit.unit_index,
                previousUnitIndex=previous_unit_index,
            )
        previous_unit_index = unit.unit_index
        target_kind = str(unit.target.get("kind", ""))
        if target_kind != "paragraph":
            _add_issue(
                blocking_issues,
                "unsafe_target_kind",
                "检测到非正文段落目标，导出可能改动表格、目录、图注或保护区。",
                unitIndex=unit_index,
                target=unit.target,
            )
            continue
        target_key = _target_key(unit.target)
        if target_key not in editable_target_keys:
            _add_issue(
                blocking_issues,
                "target_not_editable",
                "body map 指向的段落不在 Word 可编辑正文范围内，已阻止导出。",
                unitIndex=unit_index,
                target=unit.target,
            )
        if target_key in seen_target_keys:
            _add_issue(
                blocking_issues,
                "duplicate_target",
                "body map 存在重复目标段落，导出会造成正文错位。",
                unitIndex=unit_index,
                target=unit.target,
            )
        seen_target_keys.add(target_key)

        paragraph_index = _coerce_int(unit.target.get("paragraph_index"), default=-1)
        if paragraph_index < previous_paragraph_index:
            _add_issue(
                blocking_issues,
                "target_order_reversed",
                "body map 目标段落顺序出现回退，导出会造成正文顺序异常。",
                unitIndex=unit_index,
                target=unit.target,
            )
        previous_paragraph_index = paragraph_index

        if unit.current_text != str(rewritten_paragraphs[unit_index]):
            _add_issue(
                warnings,
                "body_map_text_not_identical",
                "body map 当前文本与待导出文本不完全一致，已按待导出文本继续审计。",
                unitIndex=unit_index,
            )

    validation_report = validate_docx_body_map(body_map, source_path=source_path, snapshot_path=snapshot_path)
    for issue in validation_report.get("blockingIssues", []) if isinstance(validation_report, dict) else []:
        if isinstance(issue, dict):
            issue_code = str(issue.get("code", "validation_failed"))
            if allow_snapshot_scope_drift and issue_code == "editable_unit_count_mismatch":
                _add_issue(
                    warnings,
                    "body_map_editable_unit_count_drift",
                    "\u5f53\u524d\u5feb\u7167\u6b63\u6587\u6570\u91cf\u5df2\u53d8\u5316\uff0c\u4f46 body map \u76ee\u6807\u6bb5\u843d\u4ecd\u53ef\u5b9a\u4f4d\uff0c\u5bfc\u51fa\u5c06\u91c7\u7528\u5f53\u8f6e\u51bb\u7ed3\u7684\u6b63\u6587\u6620\u5c04\u3002",
                    **{key: value for key, value in issue.items() if key not in {"code", "message"}},
                )
                continue
            _add_issue(
                blocking_issues,
                f"body_map_{issue_code}",
                str(issue.get("message", "body map \u6821\u9a8c\u5931\u8d25\u3002")),
                **{key: value for key, value in issue.items() if key not in {"code", "message"}},
            )
    for warning in validation_report.get("warnings", []) if isinstance(validation_report, dict) else []:
        if isinstance(warning, dict):
            _add_issue(
                warnings,
                f"body_map_{warning.get('code', 'validation_warning')}",
                str(warning.get("message", "body map 校验存在风险。")),
                **{key: value for key, value in warning.items() if key not in {"code", "message"}},
            )


def _check_rewritten_paragraphs(
    rewritten_paragraphs: Sequence[str],
    *,
    editable_units: Sequence[Any],
    body_map: DocxBodyMap | None,
    blocking_issues: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
) -> None:
    if len(rewritten_paragraphs) != len(editable_units) and not (
        body_map is not None and len(rewritten_paragraphs) == len(body_map.units)
    ):
        return
    for paragraph_index, rewritten_text in enumerate(rewritten_paragraphs):
        original_text = _original_text_for_index(paragraph_index, editable_units=editable_units, body_map=body_map)
        current_text = str(rewritten_text)
        if original_text.strip() and not current_text.strip():
            _add_issue(
                blocking_issues,
                "empty_rewritten_paragraph",
                "有正文段落被改写为空，导出会造成段落缺失。",
                paragraphIndex=paragraph_index,
                originalSample=_sample_text(original_text),
            )
        if "\n" in current_text or "\r" in current_text:
            _add_issue(
                blocking_issues,
                "inline_line_break",
                "有正文段落内部出现换行，导出后很容易产生异常断行。",
                paragraphIndex=paragraph_index,
                rewrittenSample=_sample_text(current_text),
            )
        original_language = _language_for_index(paragraph_index, original_text=original_text, body_map=body_map)
        current_language = detect_chunk_language(current_text)
        if original_language == "en" and current_language != "en":
            _add_issue(
                blocking_issues,
                "english_language_drift",
                "英文正文段落输出后不再像英文，可能被模型翻译或改成中文。",
                paragraphIndex=paragraph_index,
                originalSample=_sample_text(original_text),
                rewrittenSample=_sample_text(current_text),
            )
        if original_language == "en":
            _check_english_text_integrity(
                original_text,
                current_text,
                paragraph_index=paragraph_index,
                blocking_issues=blocking_issues,
            )
        _check_length_ratio(
            original_text,
            current_text,
            paragraph_index=paragraph_index,
            warnings=warnings,
        )


def _check_english_text_integrity(
    original_text: str,
    current_text: str,
    *,
    paragraph_index: int,
    blocking_issues: list[dict[str, Any]],
) -> None:
    corruptions = find_english_spacing_corruptions(original_text, current_text)
    if corruptions:
        _add_issue(
            blocking_issues,
            "english_spacing_corruption",
            "English text lost required spaces between adjacent words, terms, numbers, or punctuation.",
            paragraphIndex=paragraph_index,
            samples=corruptions[:8],
            originalSample=_sample_text(original_text),
            rewrittenSample=_sample_text(current_text),
        )
    required_terms = _extract_required_terms(original_text)
    if required_terms:
        missing = sorted(term for term in required_terms if term not in current_text)
        if missing:
            _add_issue(
                blocking_issues,
                "english_required_term_missing",
                "English output removed or truncated protected technical terms.",
                paragraphIndex=paragraph_index,
                missingTerms=missing[:8],
                originalSample=_sample_text(original_text),
                rewrittenSample=_sample_text(current_text),
            )
    required_term_counts = _extract_required_term_counts(original_text)
    reduced_terms = sorted(
        term for term, count in required_term_counts.items()
        if count > 1 and current_text.count(term) < count
    )
    if reduced_terms:
        _add_issue(
            blocking_issues,
            "english_required_term_count_reduced",
            "English output reduced repeated protected technical terms.",
            paragraphIndex=paragraph_index,
            reducedTerms=reduced_terms[:8],
            originalSample=_sample_text(original_text),
            rewrittenSample=_sample_text(current_text),
        )


def _check_compare_payload(
    compare_payload: dict[str, Any],
    *,
    rewritten_paragraphs: Sequence[str],
    decisions: dict[str, str] | None,
    blocking_issues: list[dict[str, Any]],
    warnings: list[dict[str, Any]],
) -> None:
    raw_chunks = compare_payload.get("chunks")
    if not isinstance(raw_chunks, list) or not raw_chunks:
        _add_issue(
            warnings,
            "compare_chunks_missing",
            "未找到有效 diff chunk 数据，已跳过 chunk 顺序审计。",
        )
        return

    expected_paragraph_count = _coerce_int(compare_payload.get("paragraphCount"), default=-1)
    if expected_paragraph_count >= 0 and expected_paragraph_count != len(rewritten_paragraphs):
        _add_issue(
            blocking_issues,
            "compare_paragraph_count_mismatch",
            f"diff 记录的段落数与待导出段落数不一致：diff {expected_paragraph_count} 段，待导出 {len(rewritten_paragraphs)} 段。",
            expected=expected_paragraph_count,
            actual=len(rewritten_paragraphs),
        )

    expected_chunk_count = _coerce_int(compare_payload.get("chunkCount"), default=-1)
    if expected_chunk_count >= 0 and expected_chunk_count != len(raw_chunks):
        _add_issue(
            warnings,
            "compare_chunk_count_mismatch",
            f"diff 记录的 chunk 数与实际 chunk 数不一致：记录 {expected_chunk_count} 个，实际 {len(raw_chunks)} 个。",
            expected=expected_chunk_count,
            actual=len(raw_chunks),
        )

    seen_chunk_ids: set[str] = set()
    seen_positions: set[tuple[int, int]] = set()
    chunks_by_paragraph: dict[int, list[int]] = {}
    for raw_chunk_index, raw_chunk in enumerate(raw_chunks):
        if not isinstance(raw_chunk, dict):
            _add_issue(
                blocking_issues,
                "invalid_compare_chunk",
                "diff chunk 结构异常，无法确认导出顺序。",
                chunkListIndex=raw_chunk_index,
            )
            continue
        chunk_id = str(raw_chunk.get("chunkId", "")).strip()
        if not chunk_id:
            _add_issue(
                blocking_issues,
                "missing_chunk_id",
                "diff chunk 缺少 chunkId，无法确认导出顺序。",
                chunkListIndex=raw_chunk_index,
            )
        elif chunk_id in seen_chunk_ids:
            _add_issue(
                blocking_issues,
                "duplicate_chunk_id",
                "diff chunkId 重复，导出会出现片段覆盖或错位。",
                chunkId=chunk_id,
            )
        seen_chunk_ids.add(chunk_id)

        paragraph_index = _coerce_int(raw_chunk.get("paragraphIndex"), default=-1)
        chunk_index = _coerce_int(raw_chunk.get("chunkIndex"), default=-1)
        if paragraph_index < 0 or paragraph_index >= len(rewritten_paragraphs):
            _add_issue(
                blocking_issues,
                "chunk_paragraph_out_of_range",
                "diff chunk 指向不存在的段落，导出会造成正文错位。",
                chunkId=chunk_id,
                paragraphIndex=paragraph_index,
            )
            continue
        if chunk_index < 0:
            _add_issue(
                blocking_issues,
                "chunk_index_invalid",
                "diff chunkIndex 异常，无法确认段内顺序。",
                chunkId=chunk_id,
                chunkIndex=chunk_index,
            )
            continue
        position = (paragraph_index, chunk_index)
        if position in seen_positions:
            _add_issue(
                blocking_issues,
                "duplicate_chunk_position",
                "diff 中同一段落的 chunkIndex 重复，导出会造成正文重复或覆盖。",
                chunkId=chunk_id,
                paragraphIndex=paragraph_index,
                chunkIndex=chunk_index,
            )
        seen_positions.add(position)
        chunks_by_paragraph.setdefault(paragraph_index, []).append(chunk_index)

        input_text = raw_chunk.get("inputText", "")
        selected_text = input_text if (decisions or {}).get(chunk_id) == "source" else raw_chunk.get("outputText", "")
        if isinstance(input_text, str) and input_text.strip() and isinstance(selected_text, str):
            normalized_selected = normalize_chunk_output(input_text, selected_text)
            if not normalized_selected.strip():
                _add_issue(
                    blocking_issues,
                    "empty_selected_chunk",
                    "有非空正文片段被选择为空文本，导出会造成正文缺失。",
                    chunkId=chunk_id,
                    paragraphIndex=paragraph_index,
                )

    if expected_paragraph_count >= 0:
        missing_paragraph_indexes = sorted(set(range(expected_paragraph_count)) - set(chunks_by_paragraph))
        if missing_paragraph_indexes:
            _add_issue(
                blocking_issues,
                "compare_paragraph_missing",
                "diff 缺少部分正文段落的 chunk 数据，导出会造成段落缺失或错位。",
                missingParagraphIndexes=missing_paragraph_indexes[:20],
                missingCount=len(missing_paragraph_indexes),
            )

    for paragraph_index, chunk_indexes in chunks_by_paragraph.items():
        sorted_indexes = sorted(chunk_indexes)
        expected_indexes = list(range(len(sorted_indexes)))
        if sorted_indexes != expected_indexes:
            _add_issue(
                blocking_issues,
                "chunk_order_gap",
                "同一段落内 chunkIndex 不连续，导出会造成段内拼接顺序风险。",
                paragraphIndex=paragraph_index,
                chunkIndexes=sorted_indexes,
                expected=expected_indexes,
            )


def _check_length_ratio(
    original_text: str,
    current_text: str,
    *,
    paragraph_index: int,
    warnings: list[dict[str, Any]],
) -> None:
    original_length = len(original_text.strip())
    current_length = len(current_text.strip())
    if original_length < 80 or current_length <= 0:
        return
    ratio = current_length / max(1, original_length)
    if ratio > 2.5:
        _add_issue(
            warnings,
            "paragraph_too_long",
            "有正文段落长度膨胀明显，可能影响 Word 分页和版面。",
            paragraphIndex=paragraph_index,
            ratio=round(ratio, 2),
            originalLength=original_length,
            currentLength=current_length,
        )
    elif ratio < 0.35:
        _add_issue(
            warnings,
            "paragraph_too_short",
            "有正文段落长度缩短明显，请确认不是模型漏写。",
            paragraphIndex=paragraph_index,
            ratio=round(ratio, 2),
            originalLength=original_length,
            currentLength=current_length,
        )


def _original_text_for_index(
    paragraph_index: int,
    *,
    editable_units: Sequence[Any],
    body_map: DocxBodyMap | None,
) -> str:
    if body_map is not None and paragraph_index < len(body_map.units):
        return body_map.units[paragraph_index].original_text
    if paragraph_index < len(editable_units):
        return str(getattr(editable_units[paragraph_index], "text", ""))
    return ""


def _language_for_index(paragraph_index: int, *, original_text: str, body_map: DocxBodyMap | None) -> str:
    if body_map is not None and paragraph_index < len(body_map.units):
        return body_map.units[paragraph_index].language or detect_chunk_language(original_text)
    return detect_chunk_language(original_text)


def _target_key(target: dict[str, Any]) -> tuple[Any, ...]:
    kind = str(target.get("kind", ""))
    if kind == "paragraph":
        return kind, _coerce_int(target.get("paragraph_index"), default=-1)
    if kind == "table_cell_paragraph":
        return (
            kind,
            _coerce_int(target.get("table_index"), default=-1),
            _coerce_int(target.get("row_index"), default=-1),
            _coerce_int(target.get("cell_index"), default=-1),
            _coerce_int(target.get("paragraph_index"), default=-1),
        )
    return kind, json.dumps(target, ensure_ascii=False, sort_keys=True)


def _coerce_int(value: Any, *, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _add_issue(issues: list[dict[str, Any]], code: str, message: str, **extra: Any) -> None:
    issue = {
        "code": code,
        "message": message,
    }
    issue.update(extra)
    issues.append(issue)


def _sample_text(text: str, limit: int = 120) -> str:
    compact = " ".join(str(text).split())
    return compact[:limit] + ("…" if len(compact) > limit else "")


def _write_guard_report(report: dict[str, Any], report_path: Path) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
