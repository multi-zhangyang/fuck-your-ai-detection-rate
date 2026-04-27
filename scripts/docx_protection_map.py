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
    "references": "参考文献",
    "heading": "各级标题",
    "back_matter": "附录/声明等后置内容",
    "caption": "图名/表名",
    "structured_field": "关键词等结构字段",
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
    protected_units = [unit for unit in snapshot.units if not unit.editable]
    reason_counts = Counter(unit.protect_reason or "protected" for unit in protected_units)
    target_counts = Counter(str(unit.target.get("kind", "unknown")) for unit in snapshot.units)

    sections: list[dict[str, Any]] = []
    current_section: dict[str, Any] | None = None
    for unit in snapshot.units:
        reason = "editable_body" if unit.editable else (unit.protect_reason or "protected")
        key = f"editable:{unit.editable}:{reason}"
        if current_section is None or current_section["key"] != key:
            current_section = {
                "key": key,
                "editable": unit.editable,
                "reason": reason,
                "label": "可改写正文" if unit.editable else PROTECT_REASON_LABELS.get(reason, reason),
                "startUnit": unit.unit_index,
                "endUnit": unit.unit_index,
                "count": 0,
                "samples": [],
            }
            sections.append(current_section)
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
            "totalUnits": snapshot.total_text_unit_count,
            "editableUnits": len(editable_units),
            "protectedUnits": len(protected_units),
            "tableUnits": target_counts.get("table_cell_paragraph", 0),
            "topLevelParagraphUnits": target_counts.get("paragraph", 0),
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
        "protectionReasons": [],
    }


def _shorten(text: str, limit: int = 96) -> str:
    normalized = " ".join(str(text or "").split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}…"
