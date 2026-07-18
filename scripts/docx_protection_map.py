from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import Any

from docx_pipeline import ensure_docx_processing_assets

PROTECT_REASON_LABELS = {
    "front_matter": "封面/目录前置内容",
    "generated_field": "目录或自动域",
    "table_content": "表格内容",
    "graphic_anchor": "图片/图形锚点",
    "formula": "公式",
    "semantic_range_anchor": "书签/批注范围端点",
    "semantic_range_span": "跨段批注范围",
    "semantic_range_topology_invalid": "书签/批注范围拓扑异常",
    "semantic_point_reference": "批注/脚注/尾注落点",
    "references": "参考文献",
    "heading": "各级标题",
    "back_matter": "附录/声明等后置内容",
    "caption": "图名/表名",
    "structured_field": "关键词等结构字段",
    "outside_body_scope": "摘要到致谢之外的内容",
    "acknowledgement_body": "致谢正文",
    "template_instruction": "模板撰写指导语",
    "ambiguous_non_prose": "无法确认为正文，已安全跳过",
    "complex_inline": "复杂 Word 行内结构",
    "ambiguous_format_anchor": "格式锚点归属不明确",
    "format_sensitive_text": "整段格式敏感文字",
}

STRUCTURAL_ROLE_LABELS = {
    "front_matter": "封面/前置材料",
    "toc_heading": "目录标题",
    "toc_entry": "目录或自动域",
    "abstract_body": "摘要正文",
    "heading": "各级标题",
    "body_prose": "正文内容",
    "body_list": "编号正文",
    "caption": "图名/表名",
    "note": "图表注释",
    "equation": "公式",
    "table_content": "表格内容",
    "acknowledgement_heading": "致谢标题",
    "acknowledgement_body": "致谢正文",
    "template_instruction": "模板撰写指导语",
    "references_heading": "参考文献标题",
    "reference_entry": "参考文献条目",
    "back_matter": "附录/声明等后置材料",
    "keywords": "关键词字段",
    "complex_container": "复杂 Word 结构",
    "ambiguous_non_prose": "无法确认为正文",
    "unknown": "未知结构",
}


def build_docx_protection_map(source_path: Path) -> dict[str, Any]:
    normalized_source = source_path.resolve()
    if normalized_source.suffix.lower() != ".docx":
        return {
            "sourcePath": str(normalized_source),
            "sourceKind": normalized_source.suffix.lower() or ".txt",
            "available": False,
            "message": "当前文档不是 DOCX，无法生成 Word 结构保护地图。",
            "summary": _empty_summary(),
            "sections": [],
        }

    _, snapshot_path, snapshot = ensure_docx_processing_assets(normalized_source)
    editable_units = snapshot.editable_units()
    all_units = [*snapshot.units, *snapshot.protected_structural_units]
    protected_units = [unit for unit in all_units if not unit.editable]
    reason_counts = Counter(unit.protect_reason or "protected" for unit in protected_units)
    target_counts = Counter(str(unit.target.get("kind", "unknown")) for unit in all_units)
    role_counts = Counter(unit.structural_role or "unknown" for unit in all_units)

    sections: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None
    for unit in all_units:
        reason = "editable_body" if unit.editable else (unit.protect_reason or "protected")
        structural_role = unit.structural_role or "unknown"
        edit_eligibility = unit.edit_eligibility or "protected"
        raw_reason_codes = (
            unit.edit_eligibility_evidence.get("reasonCodes", [])
            if isinstance(unit.edit_eligibility_evidence, dict)
            else []
        )
        reason_codes = [str(code) for code in raw_reason_codes if str(code)]
        key = f"editable:{unit.editable}:{structural_role}:{reason}"
        if current_section is None or current_section["key"] != key:
            current_section = {
                "key": key,
                "editable": unit.editable,
                "reason": reason,
                "structuralRole": structural_role,
                "structuralRoleLabel": STRUCTURAL_ROLE_LABELS.get(structural_role, structural_role),
                "editEligibility": edit_eligibility,
                "eligibilityReasonCodes": reason_codes,
                "label": (
                    STRUCTURAL_ROLE_LABELS.get(structural_role, "可改写正文")
                    if unit.editable
                    else STRUCTURAL_ROLE_LABELS.get(
                        structural_role,
                        PROTECT_REASON_LABELS.get(reason, reason),
                    )
                ),
                "startUnit": unit.unit_index,
                "endUnit": unit.unit_index,
                "count": 0,
                "samples": [],
            }
            sections.append(current_section)
        else:
            current_section["eligibilityReasonCodes"] = sorted(
                set(current_section.get("eligibilityReasonCodes", [])) | set(reason_codes)
            )
        current_section["endUnit"] = unit.unit_index
        current_section["count"] += 1
        if len(current_section["samples"]) < 3:
            current_section["samples"].append(_shorten(unit.text))

    return {
        "sourcePath": str(normalized_source),
        "sourceKind": ".docx",
        "available": True,
        "message": "已生成 DOCX 结构保护地图。",
        "snapshotPath": str(snapshot_path),
        "summary": {
            "totalUnits": len(all_units),
            "editableUnits": len(editable_units),
            "protectedUnits": len(protected_units),
            "tableUnits": target_counts.get("table_cell_paragraph", 0),
            "topLevelParagraphUnits": target_counts.get("paragraph", 0),
            "structuralRolePolicyVersion": snapshot.structural_role_policy_version,
            "structuralInventoryVersion": snapshot.structural_inventory_version,
            "ambiguousUnits": role_counts.get("ambiguous_non_prose", 0) + role_counts.get("unknown", 0),
            "roleCounts": dict(sorted(role_counts.items())),
            "semanticRangeCount": int(getattr(snapshot, "semantic_range_count", 0)),
            "bookmarkRangeCount": int(getattr(snapshot, "bookmark_range_count", 0)),
            "commentRangeCount": int(getattr(snapshot, "comment_range_count", 0)),
            "bookmarkRangeInteriorUnits": sum(
                1
                for unit in snapshot.units
                if bool(getattr(unit, "inside_bookmark_range", False))
            ),
            "editableBookmarkRangeInteriorUnits": sum(
                1
                for unit in snapshot.units
                if bool(
                    getattr(unit, "inside_bookmark_range", False)
                    and unit.editable
                )
            ),
            "commentRangeInteriorUnits": sum(
                1
                for unit in snapshot.units
                if bool(getattr(unit, "inside_comment_range", False))
            ),
            "semanticRangeTopologyValid": bool(
                getattr(snapshot, "semantic_range_topology_valid", True)
            ),
            "semanticRangeCoveredUnits": sum(
                1
                for unit in snapshot.units
                if bool(getattr(unit, "inside_comment_range", False))
            ),
            "protectionReasons": [
                {
                    "reason": reason,
                    "label": PROTECT_REASON_LABELS.get(reason, reason),
                    "count": count,
                }
                for reason, count in sorted(reason_counts.items(), key=lambda item: (-item[1], item[0]))
            ],
        },
        "sections": sections,
    }


def _empty_summary() -> dict[str, Any]:
    return {
        "totalUnits": 0,
        "editableUnits": 0,
        "protectedUnits": 0,
        "tableUnits": 0,
        "topLevelParagraphUnits": 0,
        "semanticRangeCount": 0,
        "bookmarkRangeCount": 0,
        "commentRangeCount": 0,
        "bookmarkRangeInteriorUnits": 0,
        "editableBookmarkRangeInteriorUnits": 0,
        "commentRangeInteriorUnits": 0,
        "semanticRangeTopologyValid": True,
        "semanticRangeCoveredUnits": 0,
        "structuralRolePolicyVersion": 0,
        "structuralInventoryVersion": 0,
        "ambiguousUnits": 0,
        "roleCounts": {},
        "protectionReasons": [],
    }


def _shorten(text: str, limit: int = 96) -> str:
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}…"
