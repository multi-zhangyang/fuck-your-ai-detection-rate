from __future__ import annotations

import argparse
import json
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from app_config import DEFAULT_MAX_RETRIES, DEFAULT_REQUEST_TIMEOUT_SECONDS, load_app_config
from llm_client import llm_completion

ROOT_DIR = Path(__file__).resolve().parents[1]
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
ACTIVE_RULES_PATH = INTERMEDIATE_DIR / "active_format_rules.json"
SCHEMA_PATH = ROOT_DIR / "references" / "format_rules.schema.json"
FORMAT_RULES_VERSION = 1
FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS = 300
FORMAT_RULE_PARSE_MAX_TIMEOUT_SECONDS = 1800
FORMAT_RULE_PARSE_MAX_RETRIES = 0

ALIGNMENT_VALUES = {"left", "center", "right", "justify"}

DEFAULT_FORMAT_RULES: dict[str, Any] = {
    "version": FORMAT_RULES_VERSION,
    "schoolName": "default",
    "sourceSummary": "Built-in school thesis formatting rules.",
    "page": {
        "paper": "A4",
        "topMarginCm": 2.5,
        "bottomMarginCm": 2.5,
        "leftMarginCm": 3.0,
        "rightMarginCm": 3.0,
    },
    "styles": {
        "toc_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 18, "lineSpacingMultiple": 1.5},
        "cn_abstract_lead": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "en_abstract_lead": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 16, "bold": True, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "cn_keywords": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": None, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "en_keywords": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": None, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "cn_abstract_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "en_abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_1": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 14, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_2": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 12, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_3": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "heading_4": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "left", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "body_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "caption": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "center", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "note": {"cnFont": "楷体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "left", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "table_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 9, "bold": False, "alignment": "center", "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "references_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 14, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "references_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 10.5, "bold": False, "alignment": "justify", "firstLineIndentPt": 0, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
        "ack_heading": {"cnFont": "黑体", "enFont": "Times New Roman", "fontSizePt": 16, "bold": False, "alignment": "center", "spaceBeforePt": 12, "spaceAfterPt": 0, "lineSpacingMultiple": 1.5},
        "ack_body": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 12, "bold": False, "alignment": "justify", "firstLineIndentPt": 21, "spaceBeforePt": 0, "spaceAfterPt": 0, "lineSpacingPt": 20},
    },
    "notes": [],
}



SIZE_NAME_TO_PT = {
    "\u5c0f2": 18.0,
    "\u5c0f\u4e8c": 18.0,
    "3": 16.0,
    "\u4e09": 16.0,
    "\u5c0f3": 15.0,
    "\u5c0f\u4e09": 15.0,
    "4": 14.0,
    "\u56db": 14.0,
    "\u5c0f4": 12.0,
    "\u5c0f\u56db": 12.0,
    "5": 10.5,
    "\u4e94": 10.5,
    "\u5c0f5": 9.0,
    "\u5c0f\u4e94": 9.0,
}
ROLE_MARKERS = {
    "toc_heading": ("\u76ee\u5f55",),
    "cn_abstract_lead": ("\u6458\u8981",),
    "cn_abstract_body": ("\u6458\u8981",),
    "en_abstract_lead": ("Abstract",),
    "en_abstract_body": ("Abstract",),
    "cn_keywords": ("\u5173\u952e\u8bcd",),
    "en_keywords": ("Key words", "Keywords", "Key Words"),
    "heading_1": ("\u4e00\u7ea7\u6807\u9898",),
    "heading_2": ("\u4e8c\u7ea7\u6807\u9898",),
    "heading_3": ("\u4e09\u7ea7\u6807\u9898",),
    "heading_4": ("\u56db\u7ea7\u6807\u9898",),
    "body_text": ("\u8bba\u6587\u6b63\u6587", "\u6b63\u6587"),
    "caption": ("\u56fe\u5e8f", "\u56fe\u540d", "\u8868\u5e8f", "\u8868\u540d"),
    "note": ("\u56fe\u6ce8", "\u8868\u6ce8"),
    "table_text": ("\u8868\u683c\u5185", "\u8868\u683c\u5185\u5bb9"),
    "references_heading": ("\u53c2\u8003\u6587\u732e",),
    "references_body": ("\u53c2\u8003\u6587\u732e",),
    "ack_heading": ("\u81f4\u8c22",),
    "ack_body": ("\u81f4\u8c22",),
}
FONT_NAMES = ("\u5b8b\u4f53", "\u9ed1\u4f53", "\u6977\u4f53", "\u4eff\u5b8b", "\u5fae\u8f6f\u96c5\u9ed1", "Times New Roman")
CONTENT_STYLE_ROLES = {"cn_abstract_body", "en_abstract_body", "cn_keywords", "en_keywords", "references_body", "ack_body"}
HEADING_STYLE_ROLES = {"toc_heading", "cn_abstract_lead", "en_abstract_lead", "references_heading", "ack_heading", "heading_1", "heading_2", "heading_3", "heading_4"}
REQUIRED_FORMAT_ROLES = [
    "body_text",
    "heading_1",
    "heading_2",
    "heading_3",
    "cn_abstract_lead",
    "cn_abstract_body",
    "cn_keywords",
    "references_heading",
    "references_body",
    "ack_heading",
    "ack_body",
]


def _normalize_instruction_text(text: str) -> str:
    normalized = re.sub(r"[\r\n]+", "\n", text or "")
    normalized = re.sub(r"[\u3000\t]+", " ", normalized)
    return normalized


def _split_instruction_units(text: str) -> list[str]:
    units: list[str] = []
    for line in text.splitlines():
        normalized_line = line.strip()
        if not normalized_line:
            continue
        parts = re.split(r"(?<=[\u3002\uff1b;])", normalized_line)
        for part in parts:
            candidate = part.strip()
            if candidate:
                units.append(candidate)
    return units


def _context_windows(text: str, markers: tuple[str, ...], *, radius: int = 180) -> list[str]:
    windows: list[str] = []
    units = _split_instruction_units(text)
    for marker in markers:
        for index, unit in enumerate(units):
            if re.search(re.escape(marker), unit, flags=re.IGNORECASE):
                context = unit
                next_unit = units[index + 1] if index + 1 < len(units) else ""
                if next_unit and re.search(r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?", next_unit):
                    context = f"{unit}{next_unit}"
                windows.append(context[:radius])
    return windows


def _extract_font(context: str, *, prefer_english: bool = False) -> str | None:
    if prefer_english and re.search(r"Times\s+New\s+Roman", context, flags=re.IGNORECASE):
        return "Times New Roman"
    found: list[tuple[int, str]] = []
    for font in FONT_NAMES:
        if font == "Times New Roman":
            match = re.search(r"Times\s+New\s+Roman", context, flags=re.IGNORECASE)
            if match:
                found.append((match.start(), "Times New Roman"))
        elif font in context:
            found.append((context.index(font), font))
    return min(found, key=lambda item: item[0])[1] if found else None


def _normalize_size_token(prefix: str, value: str) -> str:
    token = value.strip()
    if prefix.strip():
        token = "\u5c0f" + token
    return token.replace(" ", "")


def _extract_font_size_pt(context: str) -> float | None:
    patterns = (
        r"(\u5c0f?)\s*([2345])\s*\u53f7",
        r"(\u5c0f?)\s*([\u4e8c\u4e09\u56db\u4e94])\s*\u53f7",
        r"(\u5c0f)\s*([2345\u4e8c\u4e09\u56db\u4e94])",
    )
    for pattern in patterns:
        match = re.search(pattern, context)
        if not match:
            continue
        key = _normalize_size_token(match.group(1), match.group(2))
        if key in SIZE_NAME_TO_PT:
            return SIZE_NAME_TO_PT[key]
    pt_match = re.search(r"(\d+(?:\.\d+)?)\s*(?:pt|\u78c5)", context, flags=re.IGNORECASE)
    if pt_match:
        return float(pt_match.group(1))
    return None


def _extract_line_spacing(context: str) -> dict[str, float]:
    result: dict[str, float] = {}
    fixed = re.search(r"(?:\u56fa\u5b9a(?:\u503c)?\s*)?(\d+(?:\.\d+)?)\s*\u78c5", context)
    if fixed and ("\u884c\u8ddd" in context or "\u884c\u95f4\u8ddd" in context or "\u56fa\u5b9a" in context):
        result["lineSpacingPt"] = float(fixed.group(1))
        result["lineSpacingMultiple"] = None
    multiple = re.search(r"(\d+(?:\.\d+)?)\s*\u500d\u884c\u8ddd", context)
    if multiple:
        result["lineSpacingMultiple"] = float(multiple.group(1))
        result["lineSpacingPt"] = None
    return result


def _extract_alignment(context: str) -> str | None:
    if "\u4e24\u7aef\u5bf9\u9f50" in context:
        return "justify"
    if "\u53f3\u5bf9\u9f50" in context:
        return "right"
    if "\u5c45\u5de6" in context or "\u5de6\u5bf9\u9f50" in context:
        return "left"
    if "\u5c45\u4e2d" in context:
        return "center"
    return None


def _extract_bold(context: str) -> bool | None:
    if "\u4e0d\u52a0\u7c97" in context:
        return False
    if "\u52a0\u7c97" in context:
        return True
    return None


def _extract_indent(context: str) -> float | None:
    if re.search(r"\u4e24\u4e2a\u5b57(?:\u4e2d\u95f4|\u4e4b\u95f4)\u7a7a\u4e24\u683c", context):
        return None
    if "\u7a7a\u4e24\u683c" in context or "\u9996\u884c\u7f29\u8fdb\u4e24\u5b57" in context:
        return 21.0
    if "\u5de6\u9876\u683c" in context:
        return 0.0
    return None


def _extract_content_rule_context_legacy(context: str) -> str | None:
    patterns = (
        r"(?:\uff08|\()(?:[^\uff09)]{0,20})?(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\uff09)]{1,140})(?:\uff09|\))",
        r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^。\uff1b;]{1,140})",
    )
    for pattern in patterns:
        match = re.search(pattern, context, flags=re.IGNORECASE)
        if match:
            return match.group("body").strip()
    return None


def _strip_content_parentheticals(context: str) -> str:
    stripped = re.sub(r"[\uff08(][^\uff09)]*(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)[^\uff09)]*[\uff09)]", "", context)
    return re.split(r"[\u3002\uff1b;]\s*(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*", stripped, maxsplit=1)[0]


def _extract_content_rule_context(context: str) -> str | None:
    patterns = (
        r"(?:\uff08|\()(?:[^\uff09)]{0,20})?(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\uff09)]{1,140})(?:\uff09|\))",
        r"(?:\u5185\u5bb9\u6587\u5b57|\u5185\u5bb9)\s*(?:\u7528|\u4e3a|\u5b57\u4f53\u4e3a)?(?P<body>[^\u3002\uff1b;]{1,140})",
    )
    for pattern in patterns:
        match = re.search(pattern, context, flags=re.IGNORECASE)
        if match:
            return match.group("body").strip()
    return None


def _style_context_for_role(role: str, context: str) -> str:
    if role in CONTENT_STYLE_ROLES:
        return _extract_content_rule_context(context) or context
    if role in HEADING_STYLE_ROLES:
        return _strip_content_parentheticals(context)
    return context


def _is_role_context_candidate(role: str, context: str) -> bool:
    if role.startswith("heading_"):
        scoped_markers = ("\u6458\u8981", "Abstract", "\u5173\u952e\u8bcd", "Key words", "Keywords", "\u53c2\u8003\u6587\u732e", "\u81f4\u8c22", "\u76ee\u5f55")
        if any(marker in context for marker in scoped_markers):
            return False
    if role == "references_heading" and "\u5185\u5bb9" in context and "\u53c2\u8003\u6587\u732e" not in context[:80]:
        return False
    if role == "ack_heading" and "\u5185\u5bb9" in context and "\u81f4\u8c22" not in context[:80]:
        return False
    return True


def _extract_style_from_context(role: str, context: str) -> dict[str, Any]:
    context = _style_context_for_role(role, context)
    style: dict[str, Any] = {}
    prefer_english = role.startswith("en_")
    font = _extract_font(context, prefer_english=prefer_english)
    if font:
        if font == "Times New Roman" and prefer_english:
            style["cnFont"] = "Times New Roman"
            style["enFont"] = "Times New Roman"
        elif font == "Times New Roman":
            style["enFont"] = "Times New Roman"
        else:
            style["cnFont"] = font
            style.setdefault("enFont", "Times New Roman")
    size = _extract_font_size_pt(context)
    if size is not None:
        style["fontSizePt"] = size
    style.update(_extract_line_spacing(context))
    alignment = _extract_alignment(context)
    if alignment:
        style["alignment"] = alignment
    bold = _extract_bold(context)
    if bold is not None:
        style["bold"] = bold
    indent = _extract_indent(context)
    if indent is not None:
        style["firstLineIndentPt"] = indent
    return style


def extract_deterministic_format_rules(document_text: str) -> dict[str, Any]:
    text = _normalize_instruction_text(document_text)
    raw: dict[str, Any] = {
        "version": FORMAT_RULES_VERSION,
        "schoolName": "custom",
        "sourceSummary": "Deterministic parser extracted explicit school formatting rules.",
        "page": {},
        "styles": {},
        "notes": [],
        "styleMeta": {},
        "quality": {"warnings": [], "deterministicHits": 0, "inferredRoles": []},
    }
    page_patterns = {
        "topMarginCm": r"\u4e0a\s*(\d+(?:\.\d+)?)\s*cm",
        "bottomMarginCm": r"\u4e0b\s*(\d+(?:\.\d+)?)\s*cm",
        "leftMarginCm": r"\u5de6\s*(\d+(?:\.\d+)?)\s*cm",
        "rightMarginCm": r"\u53f3\s*(\d+(?:\.\d+)?)\s*cm",
    }
    if "A4" in text.upper():
        raw["page"]["paper"] = "A4"
    for key, pattern in page_patterns.items():
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            raw["page"][key] = float(match.group(1))
    for role, markers in ROLE_MARKERS.items():
        best_style: dict[str, Any] = {}
        best_source = ""
        for context in _context_windows(text, markers):
            if not _is_role_context_candidate(role, context):
                continue
            style = _extract_style_from_context(role, context)
            if len(style) > len(best_style):
                best_style = style
                best_source = context.strip()[:260]
        if best_style:
            raw["styles"][role] = best_style
            raw["styleMeta"][role] = {"sourceText": best_source, "confidence": 0.92, "isInferred": False}
    if "body_text" in raw["styles"]:
        body = raw["styles"]["body_text"]
        for role in ("cn_abstract_body", "en_abstract_body", "references_body"):
            raw["styles"].setdefault(role, dict(body))
            raw["styleMeta"].setdefault(role, {"sourceText": "Inherited from explicit body text rule.", "confidence": 0.66, "isInferred": True})
    raw["notes"].extend(_extract_non_style_instruction_notes(text))
    raw["quality"]["deterministicHits"] = sum(1 for meta in raw["styleMeta"].values() if not bool(meta.get("isInferred")))
    return raw


def _extract_non_style_instruction_notes(text: str) -> list[str]:
    notes: list[str] = []

    def add_if(condition: bool, note: str) -> None:
        if condition and note not in notes:
            notes.append(note)

    add_if("\u5c01\u9762" in text, "封面题名、填写项横线、日期大写等要求属于封面结构区；默认保护原 Word，不由模型改写。")
    add_if("\u76ee\u5f55" in text and ("\u81ea\u52a8\u751f\u6210" in text or "\u9875\u7801\u53f3\u7aef\u5bf9\u9f50" in text), "目录自动生成、三级目录和页码右端对齐属于 Word 域/目录结构；系统会尽量保护，不把目录文本交给模型。")
    add_if("\u9875\u7801" in text and ("I,II" in text or "I\uff0cII" in text or "\u8fde\u7eed\u7f16\u7801" in text), "摘要罗马页码与正文阿拉伯页码涉及分节页脚；当前作为导出审计重点，不作为普通样式规则直接套用。")
    add_if("\u4e09\u7ebf\u8868" in text or "\u9876\u7ebf" in text or "\u5e95\u7ebf" in text, "三线表线宽要求已记录为表格排版风险点；表格内容默认锁定，避免数据和结构被误改。")
    add_if("\u4e0d\u5f97\u62c6\u5f00" in text or "\u6b21\u9875\u6700\u524d\u9762" in text, "图表整体不跨页属于版面流控制，无法仅靠段落样式保证，需导出后人工复查。")
    add_if("\u5f15\u6587\u6807\u793a" in text or "\u53c2\u8003\u6587\u732e" in text and "[1]" in text, "引用标示和参考文献排序属于内容规范，系统会保护引用标记，但不会自动重排文献条目。")
    add_if("\u516c\u5f0f" in text or "\u516c\u5f0f\u7f16\u53f7" in text, "公式编辑器、公式换行和编号右对齐属于公式对象/版式要求，默认保护原结构。")
    return notes


def merge_deterministic_rules(ai_rules: dict[str, Any], deterministic_rules: dict[str, Any]) -> dict[str, Any]:
    merged = normalize_format_rules(ai_rules)
    normalized_deterministic = normalize_format_rules(deterministic_rules)
    if deterministic_rules.get("page"):
        merged["page"].update({k: v for k, v in normalized_deterministic.get("page", {}).items() if k in deterministic_rules.get("page", {})})
    deterministic_styles = deterministic_rules.get("styles", {}) if isinstance(deterministic_rules.get("styles"), dict) else {}
    for role, style in deterministic_styles.items():
        if not isinstance(style, dict):
            continue
        base = dict(merged["styles"].get(role, merged["styles"]["body_text"]))
        base.update({key: value for key, value in normalize_format_rules({"styles": {role: style}})["styles"][role].items() if key in style})
        merged["styles"][role] = base
    style_meta: dict[str, Any] = {}
    if isinstance(ai_rules.get("styleMeta"), dict):
        style_meta.update(ai_rules["styleMeta"])
    if isinstance(deterministic_rules.get("styleMeta"), dict):
        style_meta.update(deterministic_rules["styleMeta"])
    merged["styleMeta"] = style_meta
    merged["quality"] = build_format_rules_quality(merged, deterministic_rules)
    merged["notes"] = list(dict.fromkeys([*merged.get("notes", []), *deterministic_rules.get("notes", [])]))
    return merged


def build_format_rules_quality(rules: dict[str, Any], deterministic_rules: dict[str, Any] | None = None) -> dict[str, Any]:
    all_roles = list(DEFAULT_FORMAT_RULES["styles"].keys())
    required_roles = list(REQUIRED_FORMAT_ROLES)
    meta = rules.get("styleMeta") if isinstance(rules.get("styleMeta"), dict) else {}
    explicit_roles = [
        role for role in all_roles
        if isinstance(meta.get(role), dict) and not bool(meta[role].get("isInferred"))
    ]
    inherited_roles = [
        role for role in all_roles
        if isinstance(meta.get(role), dict) and bool(meta[role].get("isInferred"))
    ]
    default_roles = [role for role in all_roles if role not in meta]
    required_explicit_roles = [role for role in required_roles if role in explicit_roles]
    required_usable_roles = [role for role in required_roles if role in explicit_roles or role in inherited_roles]
    missing_source_roles = [role for role in required_roles if role in default_roles]
    low_confidence_roles = [
        role for role in required_roles
        if isinstance(meta.get(role), dict) and float(meta[role].get("confidence") or 0) < 0.7
    ]
    explicit_coverage = round(len(required_explicit_roles) / max(1, len(required_roles)) * 100)
    usable_coverage = round(len(required_usable_roles) / max(1, len(required_roles)) * 100)
    warnings: list[str] = []
    suggestions: list[str] = []
    body_size = rules.get("styles", {}).get("body_text", {}).get("fontSizePt")
    if body_size not in (10.5, 12.0):
        warnings.append("正文字号不在常见范围内，请确认学校说明或解析结果。")
    if missing_source_roles:
        warnings.append(f"{len(missing_source_roles)} 个关键角色未从学校说明中命中来源，将使用默认值。")
        suggestions.append("建议补充或核对：正文、标题、摘要、参考文献、致谢等关键区域的字体、字号、行距。")
    if inherited_roles:
        warnings.append(f"{len(inherited_roles)} 个角色来自继承规则，请确认是否符合学校要求。")
    if low_confidence_roles:
        warnings.append(f"{len(low_confidence_roles)} 个关键角色置信度偏低，建议人工复核。")
    return {
        "deterministicHits": int((deterministic_rules or {}).get("quality", {}).get("deterministicHits", len(explicit_roles))),
        "requiredRoles": required_roles,
        "explicitRoles": explicit_roles,
        "inheritedRoles": inherited_roles,
        "defaultRoles": default_roles,
        "inferredRoles": [*inherited_roles, *default_roles],
        "missingSourceRoles": missing_source_roles,
        "lowConfidenceRoles": low_confidence_roles,
        "explicitCoveragePercent": explicit_coverage,
        "usableCoveragePercent": usable_coverage,
        "warningCount": len(warnings),
        "warnings": warnings,
        "suggestions": suggestions,
    }


def _safe_error_message(exc: Exception) -> str:
    message = str(exc).strip()
    if not message:
        return exc.__class__.__name__
    message = re.sub(r"Bearer\s+[A-Za-z0-9._-]+", "Bearer ***", message, flags=re.IGNORECASE)
    message = re.sub(r"sk-[A-Za-z0-9_-]{8,}", "sk-***", message)
    return message[:260]


def _fallback_format_rules(document_text: str, reason: str) -> dict[str, Any]:
    deterministic_rules = extract_deterministic_format_rules(document_text)
    rules = merge_deterministic_rules({}, deterministic_rules)
    rules["sourceSummary"] = "Local deterministic parser fallback after AI JSON parsing was unavailable."
    quality = rules.setdefault("quality", {})
    warnings = list(quality.get("warnings", [])) if isinstance(quality.get("warnings"), list) else []
    fallback_warning = f"AI 结构化解析未完成，已使用本地规则抽取兜底：{reason}"
    if fallback_warning not in warnings:
        warnings.insert(0, fallback_warning)
    suggestions = list(quality.get("suggestions", [])) if isinstance(quality.get("suggestions"), list) else []
    suggestion = "如需更高覆盖率，可提高规范解析模型的请求超时，或换用响应更快且支持稳定 JSON 输出的模型重新解析。"
    if suggestion not in suggestions:
        suggestions.insert(0, suggestion)
    quality["warnings"] = warnings
    quality["suggestions"] = suggestions
    quality["warningCount"] = len(warnings)
    notes = list(rules.get("notes", [])) if isinstance(rules.get("notes"), list) else []
    note = "AI 解析不可用时，系统已回退到本地确定性解析；请重点复核未命中或继承的样式角色。"
    if note not in notes:
        notes.append(note)
    rules["notes"] = notes
    return rules

PROMPT_TEMPLATE = """你是论文 Word 排版规范的结构化抽取器。你的输出只是“候选 JSON”，后端程序会继续校验、归一化、合并默认值；不要编造学校没有写明的要求。

硬性要求：
1. 只输出一个 JSON 对象，不要 Markdown 代码块，不要解释，不要前后缀。
2. JSON 顶层字段必须包含 version、schoolName、sourceSummary、page、styles、styleMeta、notes。
3. styles 的键只能使用这些角色：toc_heading, cn_abstract_lead, en_abstract_lead, cn_keywords, en_keywords, cn_abstract_body, en_abstract_body, heading_1, heading_2, heading_3, heading_4, body_text, caption, note, table_text, references_heading, references_body, ack_heading, ack_body。
4. 只抽取能映射到 Word 样式的规则：字体、字号、加粗、对齐、缩进、段前段后、固定行距、倍数行距、页边距、纸张。
5. 封面、目录自动生成、页码分节、图表不跨页、公式编辑器、引用排序等无法直接映射为段落样式的内容，放入 notes，不要硬塞进 styles。
6. 字号统一换算为磅：小2=18，3号=16，小3=15，4号=14，小4=12，5号=10.5，小5=9。
7. alignment 只能是 left、center、right、justify。
8. 固定行距写 lineSpacingPt，倍数行距写 lineSpacingMultiple，两者不要同时写成有效数值。
9. 对每个 styles 角色，styleMeta 中尽量写 sourceText、confidence、isInferred；明确来自原文时 isInferred=false，不确定或继承时 isInferred=true 且 confidence 不要高于 0.7。
10. 学校说明没有提到的角色可以省略；不要为了完整而凭空生成。后端会用默认值补齐。

JSON schema 摘要：
{schema}

学校说明：
{document_text}
"""


def get_default_format_rules() -> dict[str, Any]:
    return deepcopy(DEFAULT_FORMAT_RULES)


def load_active_format_rules(path: Path | None = None) -> dict[str, Any]:
    rules_path = path or ACTIVE_RULES_PATH
    if not rules_path.exists():
        return get_default_format_rules()
    data = json.loads(rules_path.read_text(encoding="utf-8"))
    return normalize_format_rules(data)


def save_active_format_rules(rules: dict[str, Any], path: Path | None = None) -> Path:
    normalized = normalize_format_rules(rules)
    rules_path = path or ACTIVE_RULES_PATH
    rules_path.parent.mkdir(parents=True, exist_ok=True)
    rules_path.write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    return rules_path


def normalize_format_rules(raw_rules: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw_rules, dict):
        raise ValueError("Format rules must be a JSON object.")
    rules = get_default_format_rules()
    rules["version"] = int(raw_rules.get("version", FORMAT_RULES_VERSION) or FORMAT_RULES_VERSION)
    rules["schoolName"] = str(raw_rules.get("schoolName", rules["schoolName"]) or "").strip() or "custom"
    rules["sourceSummary"] = str(raw_rules.get("sourceSummary", rules["sourceSummary"]) or "").strip()

    raw_page = raw_rules.get("page")
    if isinstance(raw_page, dict):
        for key in ("paper", "topMarginCm", "bottomMarginCm", "leftMarginCm", "rightMarginCm"):
            if key in raw_page:
                rules["page"][key] = _coerce_number(raw_page[key]) if key.endswith("Cm") else str(raw_page[key] or "A4")

    raw_styles = raw_rules.get("styles")
    if isinstance(raw_styles, dict):
        for role, raw_style in raw_styles.items():
            if not isinstance(raw_style, dict):
                continue
            base_style = dict(rules["styles"].get(role, rules["styles"]["body_text"]))
            for key in ("cnFont", "enFont"):
                if key in raw_style and str(raw_style[key] or "").strip():
                    base_style[key] = str(raw_style[key]).strip()
            for key in ("fontSizePt", "firstLineIndentPt", "spaceBeforePt", "spaceAfterPt", "lineSpacingPt", "lineSpacingMultiple"):
                if key in raw_style:
                    base_style[key] = _coerce_optional_number(raw_style[key])
            if "bold" in raw_style:
                base_style["bold"] = _coerce_optional_bool(raw_style["bold"])
            if "italic" in raw_style:
                base_style["italic"] = _coerce_optional_bool(raw_style["italic"])
            if str(raw_style.get("alignment", "")).strip() in ALIGNMENT_VALUES:
                base_style["alignment"] = str(raw_style["alignment"]).strip()
            rules["styles"][str(role)] = base_style

    raw_notes = raw_rules.get("notes")
    if isinstance(raw_notes, list):
        rules["notes"] = [str(item).strip() for item in raw_notes if str(item).strip()]
    if isinstance(raw_rules.get("styleMeta"), dict):
        rules["styleMeta"] = raw_rules["styleMeta"]
    if isinstance(raw_rules.get("quality"), dict):
        rules["quality"] = raw_rules["quality"]
    return rules


def parse_format_rules_from_text(document_text: str, *, model_config: dict[str, Any] | None = None) -> dict[str, Any]:
    text = str(document_text or "").strip()
    if not text:
        raise ValueError("Format instruction text is empty.")
    if text.startswith("{") or text.startswith("```"):
        try:
            parsed_rules = _extract_json_object(text)
            deterministic_rules = extract_deterministic_format_rules(text)
            rules = merge_deterministic_rules(parsed_rules, deterministic_rules)
            notes = list(rules.get("notes", [])) if isinstance(rules.get("notes"), list) else []
            direct_note = "检测到输入本身为结构化 JSON，已直接归一化并合并本地显式规则。"
            if direct_note not in notes:
                notes.insert(0, direct_note)
            rules["notes"] = notes
            return rules
        except Exception:
            pass
    config = model_config or load_app_config()
    if bool(config.get("offlineMode", False)):
        return _fallback_format_rules(text, "当前处于离线模式。")
    if not str(config.get("baseUrl", "")).strip() or not str(config.get("model", "")).strip():
        return _fallback_format_rules(text, "解析模型配置不完整。")

    schema_text = SCHEMA_PATH.read_text(encoding="utf-8") if SCHEMA_PATH.exists() else "{}"
    prompt = PROMPT_TEMPLATE.format(schema=schema_text, document_text=text[:20000])
    try:
        configured_timeout = int(config.get("requestTimeoutSeconds", DEFAULT_REQUEST_TIMEOUT_SECONDS))
    except (TypeError, ValueError):
        configured_timeout = DEFAULT_REQUEST_TIMEOUT_SECONDS
    try:
        configured_retries = int(config.get("maxRetries", DEFAULT_MAX_RETRIES))
    except (TypeError, ValueError):
        configured_retries = DEFAULT_MAX_RETRIES
    parse_timeout = max(
        FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS,
        min(FORMAT_RULE_PARSE_MAX_TIMEOUT_SECONDS, configured_timeout or FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_SECONDS),
    )
    parse_retries = max(0, min(FORMAT_RULE_PARSE_MAX_RETRIES, configured_retries))
    try:
        response_text = llm_completion(
            prompt,
            model=str(config.get("model", "")),
            api_key=str(config.get("apiKey", "")),
            base_url=str(config.get("baseUrl", "")),
            api_type=str(config.get("apiType", "chat_completions")),
            temperature=0,
            timeout=parse_timeout,
            max_retries=parse_retries,
        )
        parsed = _extract_json_object(response_text)
        deterministic_rules = extract_deterministic_format_rules(text)
        return merge_deterministic_rules(parsed, deterministic_rules)
    except Exception as exc:
        return _fallback_format_rules(text, f"{_safe_error_message(exc)}；本次解析等待上限 {parse_timeout} 秒。")


def _extract_json_object(text: str) -> dict[str, Any]:
    candidate = text.strip()
    if candidate.startswith("```"):
        candidate = re.sub(r"^```(?:json)?\s*", "", candidate, flags=re.IGNORECASE)
        candidate = re.sub(r"\s*```$", "", candidate)
    try:
        data = json.loads(candidate)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", candidate, flags=re.DOTALL)
        if not match:
            raise
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object.")
    return data


def _coerce_number(value: Any) -> float:
    result = _coerce_optional_number(value)
    if result is None:
        raise ValueError(f"Expected number, got {value!r}")
    return result


def _coerce_optional_number(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _coerce_optional_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    normalized = str(value).strip().lower()
    if normalized in {"true", "yes", "1", "加粗", "bold"}:
        return True
    if normalized in {"false", "no", "0", "不加粗", "normal"}:
        return False
    return None


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Parse school formatting instructions into structured Word format rules")
    subparsers = parser.add_subparsers(dest="command", required=True)

    parse_parser = subparsers.add_parser("parse-text", help="Parse a text/markdown instruction file with the configured LLM")
    parse_parser.add_argument("input", type=Path)
    parse_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    deterministic_parser = subparsers.add_parser("parse-deterministic", help="Parse explicit school rules without calling an LLM")
    deterministic_parser.add_argument("input", type=Path)
    deterministic_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    reset_parser = subparsers.add_parser("reset", help="Reset active format rules to built-in defaults")
    reset_parser.add_argument("--output", type=Path, default=ACTIVE_RULES_PATH)

    show_parser = subparsers.add_parser("show", help="Print active format rules")
    show_parser.add_argument("--input", type=Path, default=ACTIVE_RULES_PATH)

    args = parser.parse_args(argv)
    if args.command == "parse-text":
        rules = parse_format_rules_from_text(args.input.read_text(encoding="utf-8"))
        output_path = save_active_format_rules(rules, args.output)
        print(json.dumps({"ok": True, "path": str(output_path), "rules": rules}, ensure_ascii=False, indent=2))
        return
    if args.command == "parse-deterministic":
        deterministic = extract_deterministic_format_rules(args.input.read_text(encoding="utf-8"))
        rules = merge_deterministic_rules({}, deterministic)
        output_path = save_active_format_rules(rules, args.output)
        print(json.dumps({"ok": True, "path": str(output_path), "rules": rules}, ensure_ascii=False, indent=2))
        return
    if args.command == "reset":
        output_path = save_active_format_rules(get_default_format_rules(), args.output)
        print(json.dumps({"ok": True, "path": str(output_path)}, ensure_ascii=False, indent=2))
        return
    if args.command == "show":
        print(json.dumps(load_active_format_rules(args.input), ensure_ascii=False, indent=2))
        return
    parser.error("Unknown command")


if __name__ == "__main__":
    main()
