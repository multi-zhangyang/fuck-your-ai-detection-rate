from __future__ import annotations

import hashlib
import io
import json
import os
import re
import shutil
import threading
import uuid
import zipfile
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, BinaryIO

from lxml import etree
from werkzeug.utils import secure_filename

from core_config import get_data_dir


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
M_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
V_NS = "urn:schemas-microsoft-com:vml"
WP_NS = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NS = {"w": W_NS}
W_T = f"{{{W_NS}}}t"
W_P = f"{{{W_NS}}}p"
W_BODY = f"{{{W_NS}}}body"
XML_SPACE = f"{{{XML_NS}}}space"
MAX_RECENT_DOCUMENTS = 20
SCOPE_CLASSIFIER_VERSION = 12
DEFAULT_CHUNK_PRESET = "standard"
CHUNK_PRESETS: dict[str, dict[str, tuple[int, int, int, int]]] = {
    "fine": {
        "default": (180, 160, 280, 60),
        "en": (300, 260, 420, 100),
    },
    "standard": {
        "default": (280, 260, 420, 90),
        "en": (420, 360, 560, 140),
    },
    "long": {
        "default": (600, 520, 800, 180),
        "en": (800, 700, 1000, 220),
    },
}
WORD_RE = re.compile(r"\b\w+(?:[-']\w+)*\b")
CJK_CHAR_RE = re.compile(r"[\u3400-\u4DBF\u4E00-\u9FFF]")
CAPTION_RE = re.compile(
    r"^(?:图|表|fig(?:ure)?|table)(?:[a-z]?\d+|[一二三四五六七八九十百]+)(?:[-.．·—–－]\d+)*",
    re.IGNORECASE,
)
REFERENCE_ENTRY_RE = re.compile(
    r"^\s*(?:\[\s*\d+(?:\s*[-–—]\s*\d+)?\s*\]|doi\s*[:：]|https?://)",
    re.IGNORECASE,
)
_LOCK = threading.RLock()


REVISION_LOCAL_NAMES = {
    "commentRangeEnd",
    "commentRangeStart",
    "commentReference",
    "customXmlDelRangeEnd",
    "customXmlDelRangeStart",
    "customXmlInsRangeEnd",
    "customXmlInsRangeStart",
    "customXmlMoveFromRangeEnd",
    "customXmlMoveFromRangeStart",
    "customXmlMoveToRangeEnd",
    "customXmlMoveToRangeStart",
    "del",
    "ins",
    "moveFrom",
    "moveFromRangeEnd",
    "moveFromRangeStart",
    "moveTo",
    "moveToRangeEnd",
    "moveToRangeStart",
    "numberingChange",
    "pPrChange",
    "rPrChange",
    "sectPrChange",
    "tblGridChange",
    "tblPrChange",
    "tblPrExChange",
    "tcPrChange",
    "trPrChange",
}
STRUCTURAL_STYLE_MARKERS = (
    "heading",
    "title",
    "subtitle",
    "toc",
    "caption",
    "bibliography",
    "reference",
    "标题",
    "目录",
    "题注",
    "参考文献",
)
CAPTION_STYLE_MARKERS = ("caption", "题注", "图题", "表题", "图表标题")
REFERENCE_STYLE_MARKERS = ("bibliography", "references", "reference", "参考文献", "文献")
REFERENCE_HEADING_MARKERS = {"参考文献", "references", "bibliography"}
TOC_STYLE_MARKERS = ("toc", "目录")
TOC_HEADING_MARKERS = {"目录", "tableofcontents", "图目录", "表目录", "插图目录", "表格目录"}
HEADING_STYLE_MARKERS = ("heading", "标题", "title", "subtitle")
HEADING_TEXT_MARKERS = {
    "摘要",
    "中文摘要",
    "abstract",
    "绪论",
    "引言",
    "前言",
    "结论",
    "结语",
    "总结",
    "总结与展望",
    "结论与展望",
    "致谢",
    "谢辞",
    "鸣谢",
}
KEYWORD_PREFIXES = ("关键词", "关键字", "keywords", "keyword")
NON_REWRITE_SECTION_MARKERS = {
    "附录",
    "appendix",
    "appendices",
    "声明",
    "诚信声明",
    "承诺书",
    "独创性声明",
    "原创性声明",
    "作者简介",
    "个人简历",
    "任务书",
    "开题报告",
    "外文资料",
    "外文原文",
    "外文译文",
    "中文译文",
    "译文",
    "原文",
    "封底",
}
TERMINAL_NON_REWRITE_SECTION_MARKERS = {
    "附录",
    "appendix",
    "appendices",
    "作者简介",
    "个人简历",
    "外文资料",
    "外文原文",
    "外文译文",
    "中文译文",
    "译文",
    "原文",
    "封底",
}
ABSTRACT_HEADING_MARKERS = {
    "摘要",
    "中文摘要",
    "英文摘要",
    "abstract",
}
ABSTRACT_PREFIX_RE = re.compile(
    r"^\s*(?P<label>(?:(?:中\s*文|英\s*文)\s*)?摘\s*要|abstract)(?P<tail>.*)$",
    re.IGNORECASE | re.DOTALL,
)
PROTECTION_REASON_LABELS = {
    "empty": "空段落",
    "generated_field": "目录或自动域",
    "formula": "公式",
    "graphic_anchor": "图片或绘图",
    "revision": "修订内容",
    "content_control": "内容控件",
    "note_reference": "脚注或尾注引用",
    "special_control": "特殊换行或控制符",
    "non_text_object": "非文本对象",
    "table_content": "表格内容",
    "heading": "标题或章节名",
    "toc": "目录",
    "caption": "图名或表名",
    "caption_note": "图表注释",
    "references": "参考文献",
    "keywords": "关键词",
    "back_matter": "附属材料",
    "structural_label": "结构标记",
    "before_body_start": "建议正文范围之前",
    "structural_style": "标题等结构样式",
    "user_choice": "本次选择保留",
}


class DocumentError(RuntimeError):
    pass


class FormatFidelityError(DocumentError):
    def __init__(self, message: str, audit: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.audit = audit or {"passed": False, "checks": [], "message": message}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def documents_dir() -> Path:
    return get_data_dir() / "documents"


def sources_dir() -> Path:
    return get_data_dir() / "sources"


def exports_dir() -> Path:
    return get_data_dir() / "exports"


def document_path(document_id: str) -> Path:
    if not re.fullmatch(r"doc-[0-9a-f]{32}", str(document_id)):
        raise DocumentError("文档标识无效。")
    return documents_dir() / f"{document_id}.json"


def save_document(document: dict[str, Any]) -> dict[str, Any]:
    document["updatedAt"] = _now()
    _atomic_json(document_path(str(document["id"])), document)
    return document


def load_document(document_id: str) -> dict[str, Any]:
    path = document_path(document_id)
    if not path.exists():
        raise DocumentError("文档不存在或已被删除。")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise DocumentError("文档记录已损坏。") from exc
    if not isinstance(value, dict):
        raise DocumentError("文档记录无效。")
    if value.get("kind") == "docx" and value.get("scopeClassifierVersion") != SCOPE_CLASSIFIER_VERSION:
        upgraded = _upgrade_docx_scope_classification(value)
        if upgraded is not value or upgraded.get("scopeClassifierVersion") == SCOPE_CLASSIFIER_VERSION:
            value = upgraded
            save_document(value)
    return value


def _local_name(element: etree._Element) -> str:
    return etree.QName(element).localname


def _paragraph_text(paragraph: etree._Element) -> str:
    return "".join(node.text or "" for node in paragraph.iter(W_T))


_FIXED_TEXT_ANCESTORS = {
    "AlternateContent",
    "drawing",
    "fldSimple",
    "object",
    "oMath",
    "oMathPara",
    "pict",
    *REVISION_LOCAL_NAMES,
}


def _has_named_ancestor(node: etree._Element, names: set[str], boundary: etree._Element) -> bool:
    parent = node.getparent()
    while parent is not None and parent is not boundary:
        if _local_name(parent) in names:
            return True
        parent = parent.getparent()
    return False


def _run_contains_revision_marker(node: etree._Element, boundary: etree._Element) -> bool:
    """Keep text in a revision-marked run fixed without locking its paragraph."""

    parent = node.getparent()
    while parent is not None and parent is not boundary:
        if _local_name(parent) == "r":
            return any(
                _local_name(descendant) in REVISION_LOCAL_NAMES
                or _local_name(descendant) == "delText"
                for descendant in parent.iterdescendants()
            )
        parent = parent.getparent()
    return False


def _rewriteable_text_nodes(paragraph: etree._Element) -> list[etree._Element]:
    """Return Word text nodes that can change without touching inline objects.

    Field results, equations, drawings and embedded objects stay byte-identical.
    Ordinary Word runs around those anchors remain writable, so one inline object
    does not discard an otherwise normal body paragraph.
    """

    nodes: list[etree._Element] = []
    field_depth = 0
    field_type_attr = f"{{{W_NS}}}fldCharType"
    for element in paragraph.iter():
        name = _local_name(element)
        if name == "fldChar":
            field_type = str(element.get(field_type_attr) or "").casefold()
            if field_type == "begin":
                field_depth += 1
            elif field_type == "end" and field_depth:
                field_depth -= 1
            continue
        if element.tag != W_T or field_depth:
            continue
        if _has_named_ancestor(element, _FIXED_TEXT_ANCESTORS, paragraph):
            continue
        if _run_contains_revision_marker(element, paragraph):
            continue
        nodes.append(element)
    return nodes


def _paragraph_rewrite_text(paragraph: etree._Element) -> str:
    return "".join(node.text or "" for node in _rewriteable_text_nodes(paragraph))


def _style_id(paragraph: etree._Element) -> str:
    style = paragraph.find("./w:pPr/w:pStyle", namespaces=NS)
    return str(style.get(f"{{{W_NS}}}val") or "") if style is not None else ""


def _outline_level(element: etree._Element) -> int | None:
    outline = element.find("./w:pPr/w:outlineLvl", namespaces=NS)
    if outline is None:
        return None
    try:
        value = int(str(outline.get(f"{{{W_NS}}}val") or ""))
    except ValueError:
        return None
    return value if 0 <= value <= 8 else None


def _paragraph_style_metadata(path: Path) -> dict[str, dict[str, Any]]:
    """Resolve paragraph style names and inherited outline levels from styles.xml."""

    try:
        with zipfile.ZipFile(path, "r") as archive:
            xml = archive.read("word/styles.xml")
    except (KeyError, zipfile.BadZipFile, OSError):
        return {}
    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
    try:
        root = etree.fromstring(xml, parser=parser)
    except etree.XMLSyntaxError:
        return {}

    raw: dict[str, dict[str, Any]] = {}
    for style in root.findall("./w:style", namespaces=NS):
        if str(style.get(f"{{{W_NS}}}type") or "") != "paragraph":
            continue
        style_id = str(style.get(f"{{{W_NS}}}styleId") or "")
        if not style_id:
            continue
        name = style.find("./w:name", namespaces=NS)
        based_on = style.find("./w:basedOn", namespaces=NS)
        raw[style_id] = {
            "name": str(name.get(f"{{{W_NS}}}val") or "") if name is not None else "",
            "basedOn": str(based_on.get(f"{{{W_NS}}}val") or "") if based_on is not None else "",
            "outlineLevel": _outline_level(style),
        }

    resolved: dict[str, dict[str, Any]] = {}

    def resolve(style_id: str, trail: frozenset[str] = frozenset()) -> dict[str, Any]:
        if style_id in resolved:
            return resolved[style_id]
        value = raw.get(style_id, {})
        if not value or style_id in trail:
            return {"name": "", "names": [], "outlineLevel": None}
        base_id = str(value.get("basedOn") or "")
        base = resolve(base_id, trail | {style_id}) if base_id else {"names": [], "outlineLevel": None}
        own_name = str(value.get("name") or "")
        names = list(dict.fromkeys([own_name, *base.get("names", [])])) if own_name else list(base.get("names", []))
        result = {
            "name": own_name,
            "names": names,
            "outlineLevel": value.get("outlineLevel") if value.get("outlineLevel") is not None else base.get("outlineLevel"),
        }
        resolved[style_id] = result
        return result

    for style_id in raw:
        resolve(style_id)
    return resolved


def _paragraph_safety(paragraph: etree._Element) -> tuple[bool, str, str]:
    descendants = list(paragraph.iterdescendants())
    names = {_local_name(element) for element in descendants}
    text_nodes = _rewriteable_text_nodes(paragraph)
    if text_nodes and _paragraph_rewrite_text(paragraph).strip():
        return True, "", ""
    namespaces = {etree.QName(element).namespace or "" for element in descendants}
    if names & {"fldChar", "fldSimple", "instrText"}:
        return False, PROTECTION_REASON_LABELS["generated_field"], "generated_field"
    if "oMath" in names or "oMathPara" in names or M_NS in namespaces:
        return False, PROTECTION_REASON_LABELS["formula"], "formula"
    if names & {"drawing", "object", "pict"} or namespaces & {V_NS, WP_NS}:
        return False, PROTECTION_REASON_LABELS["graphic_anchor"], "graphic_anchor"
    if names & REVISION_LOCAL_NAMES or "delText" in names:
        return False, PROTECTION_REASON_LABELS["revision"], "revision"
    if "sdt" in names:
        return False, PROTECTION_REASON_LABELS["content_control"], "content_control"
    if names & {"footnoteReference", "endnoteReference"}:
        return False, PROTECTION_REASON_LABELS["note_reference"], "note_reference"
    if names & {"br", "cr", "sym", "tab"}:
        return False, PROTECTION_REASON_LABELS["special_control"], "special_control"
    if not text_nodes or not _paragraph_text(paragraph).strip():
        if names & {"AlternateContent", "object"}:
            return False, PROTECTION_REASON_LABELS["non_text_object"], "non_text_object"
        return False, PROTECTION_REASON_LABELS["empty"], "empty"
    return False, PROTECTION_REASON_LABELS["non_text_object"], "non_text_object"


def _normalize_marker_text(text: str) -> str:
    return re.sub(r"\s+", "", text or "").casefold()


def _normalized_style_text(style_id: str, style_names: list[str]) -> str:
    return "".join([style_id, *style_names]).casefold().replace(" ", "")


def _looks_like_caption(text: str, style_id: str, style_names: list[str]) -> bool:
    normalized_style = _normalized_style_text(style_id, style_names)
    if any(marker in normalized_style for marker in CAPTION_STYLE_MARKERS):
        return True
    stripped = (text or "").strip()
    normalized = _normalize_marker_text(stripped)
    match = CAPTION_RE.match(normalized)
    if match is None:
        return False
    tail = normalized[match.end() :]
    if tail.startswith(("、图", "、表", ",图", ",表", "，图", "，表")):
        return False
    if tail.startswith(("显示", "展示", "表明", "说明", "描绘", "给出", "分别", "为", "可见", "所示")):
        return False
    if re.match(r"^(?:shows?|illustrates?|depicts?|presents?|demonstrates?)\b", tail, flags=re.IGNORECASE):
        return False
    sentence_marks = sum(stripped.count(mark) for mark in ("。", "！", "？", ". ", "! ", "? "))
    if len(stripped) > 120 or (len(stripped) > 80 and sentence_marks >= 2):
        return False
    return True


def _looks_like_caption_note(text: str) -> bool:
    stripped = (text or "").strip()
    normalized = _normalize_marker_text(stripped)
    if normalized.startswith(("图注", "表注", "数据来源:", "数据来源：", "资料来源:", "资料来源：")):
        return True
    return bool(re.match(r"^(?:注|说明|备注)\s*[:：]", stripped, flags=re.IGNORECASE))


def _looks_like_references_heading(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return normalized in REFERENCE_HEADING_MARKERS or (
        "参考文献" in normalized and len(normalized) <= 16
    )


def _looks_like_reference_entry(text: str, style_id: str, style_names: list[str]) -> bool:
    normalized_style = _normalized_style_text(style_id, style_names)
    return any(marker in normalized_style for marker in REFERENCE_STYLE_MARKERS) or bool(
        REFERENCE_ENTRY_RE.match(text or "")
    )


def _looks_like_toc(text: str, style_id: str, style_names: list[str]) -> bool:
    normalized_style = _normalized_style_text(style_id, style_names)
    if any(marker in normalized_style for marker in TOC_STYLE_MARKERS):
        return True
    stripped = (text or "").strip()
    normalized = _normalize_marker_text(stripped)
    if normalized in TOC_HEADING_MARKERS:
        return True
    return bool(re.search(r"(?:\.{3,}|…{2,}|·{3,}|\t)\s*\d+\s*$", stripped))


def _looks_like_keyword_line(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return any(normalized.startswith(prefix) for prefix in KEYWORD_PREFIXES)


def _abstract_marker(text: str) -> tuple[bool, bool]:
    """Return whether a paragraph starts with an abstract label and has prose.

    Thesis templates use both a standalone heading (``摘要`` / ``Abstract``)
    and a label followed by the complete abstract in the same paragraph.  A
    separator is required for the latter so ordinary prose such as
    ``摘要通常需要……`` is not mistaken for a section boundary.
    """

    match = ABSTRACT_PREFIX_RE.match(text or "")
    if match is None:
        return False, False
    if _normalize_marker_text(match.group("label")) not in ABSTRACT_HEADING_MARKERS:
        return False, False
    tail = match.group("tail") or ""
    if not tail:
        return True, False
    if not (tail[0].isspace() or tail[0] in ":：-—–"):
        return False, False
    body = re.sub(r"^[\s:：—–-]+", "", tail)
    return True, bool(body)


def _looks_like_heading(
    text: str,
    style_id: str,
    style_names: list[str],
    outline_level: int | None,
) -> bool:
    normalized_text = _normalize_marker_text(text)
    if not normalized_text:
        return False
    if outline_level is not None:
        return True
    normalized_style = _normalized_style_text(style_id, style_names)
    if any(marker in normalized_style for marker in HEADING_STYLE_MARKERS):
        return True
    if normalized_text in HEADING_TEXT_MARKERS or normalized_text in TOC_HEADING_MARKERS:
        return True
    if len(normalized_text) > 48 or any(mark in text for mark in "。！？；!?;"):
        return False
    if re.match(r"^第[一二三四五六七八九十百0-9]+章", normalized_text):
        return True
    if re.match(r"^[1-9]\d*(?:\.\d+){1,3}[^\d]", normalized_text):
        return True
    if re.match(r"^[1-9]\d*[.．、][^\d]", normalized_text):
        return True
    # Do not infer a heading merely because a short body sentence contains a
    # common thesis term such as "系统设计".  Text heuristics only propose a
    # range; false positives here would otherwise omit real body prose from the
    # default rewrite selection.
    return False


def _looks_like_non_rewrite_section_heading(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return (
        normalized in NON_REWRITE_SECTION_MARKERS
        or normalized.startswith(("附录", "appendix"))
        or ("声明" in normalized and len(normalized) <= 24)
        or ("承诺书" in normalized and len(normalized) <= 24)
    )


def _is_terminal_non_rewrite_section(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return normalized in TERMINAL_NON_REWRITE_SECTION_MARKERS or normalized.startswith(("附录", "appendix"))


def _is_explicit_section_heading(
    text: str,
    style_id: str,
    style_names: list[str],
    outline_level: int | None,
) -> bool:
    if outline_level is not None:
        return True
    normalized_style = _normalized_style_text(style_id, style_names)
    if any(marker in normalized_style for marker in HEADING_STYLE_MARKERS):
        return True
    normalized = _normalize_marker_text(text)
    return (
        normalized in HEADING_TEXT_MARKERS
        or normalized in TOC_HEADING_MARKERS
        or _looks_like_non_rewrite_section_heading(text)
        or bool(re.match(r"^第[一二三四五六七八九十百0-9]+章", normalized))
        or bool(re.match(r"^[1-9]\d*(?:\.\d+){1,3}[^\d]", normalized))
    )


def _looks_like_equation_number(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return bool(
        re.fullmatch(
            r"(?:式)?[（(]\d{1,4}(?:[.．\-—–－]\d{1,4}){1,3}[）)]",
            normalized,
        )
    )


def _looks_like_structural_label(text: str) -> bool:
    stripped = (text or "").strip()
    normalized = _normalize_marker_text(stripped)
    if not normalized:
        return False
    if normalized.rstrip("，,:：") in {"式中", "其中", "则"}:
        return True
    if re.fullmatch(
        r"(?:式)?[（(](?:[a-z]|[ivx]{1,6}|[一二三四五六七八九十百]+|\d{1,4})"
        r"(?:[.．\-—–－]\d{1,4}){0,3}[）)]",
        normalized,
        flags=re.IGNORECASE,
    ):
        return True
    if re.fullmatch(r"\d{1,4}", normalized):
        return True
    return not bool(re.search(r"[\w\u3400-\u4dbf\u4e00-\u9fff]", normalized))


def _default_selected(
    style_id: str,
    style_names: list[str],
    outline_level: int | None,
    text: str,
) -> bool:
    normalized = _normalized_style_text(style_id, style_names)
    if outline_level is not None:
        return False
    if any(marker in normalized for marker in STRUCTURAL_STYLE_MARKERS):
        return False
    return bool(text.strip())


def _field_command(instruction: str) -> str:
    match = re.match(r"\s*([A-Za-z]+)", instruction or "")
    return match.group(1).upper() if match else ""


def _last_toc_field_end(body_children: list[etree._Element]) -> int | None:
    """Return the body-child index where the last complete Word TOC field ends.

    A generated table of contents is commonly one outer field whose result spans
    many paragraphs and contains nested PAGEREF fields. The stack must therefore
    survive paragraph boundaries; looking for ``TOC`` in one paragraph is not
    enough.
    """

    field_stack: list[dict[str, Any]] = []
    last_end: int | None = None
    field_type_attr = f"{{{W_NS}}}fldCharType"
    field_instruction_attr = f"{{{W_NS}}}instr"

    for body_child_index, child in enumerate(body_children):
        for element in child.iter():
            name = _local_name(element)
            if name == "fldSimple":
                if _field_command(str(element.get(field_instruction_attr) or "")) == "TOC":
                    last_end = body_child_index
                continue
            if name == "fldChar":
                field_type = str(element.get(field_type_attr) or "").casefold()
                if field_type == "begin":
                    field_stack.append({"instruction": [], "separated": False})
                elif field_type == "separate" and field_stack:
                    field_stack[-1]["separated"] = True
                elif field_type == "end" and field_stack:
                    field = field_stack.pop()
                    instruction = "".join(field["instruction"])
                    if _field_command(instruction) == "TOC":
                        last_end = body_child_index
                continue
            if name == "instrText" and field_stack and not field_stack[-1]["separated"]:
                field_stack[-1]["instruction"].append(element.text or "")
    return last_end


def _suggested_body_start(
    body_children: list[etree._Element],
    styles: dict[str, dict[str, Any]],
) -> tuple[int | None, str, str]:
    # Abstract prose belongs to the rewriteable manuscript range.  It may sit
    # either before or after a generated TOC, and some templates place the
    # heading and prose in one paragraph.  Prefer the first real abstract before
    # the first chapter/reference boundary, while ignoring TOC result rows.
    abstract_candidates: list[int] = []
    first_main_heading: int | None = None
    first_references_heading: int | None = None
    for body_child_index, child in enumerate(body_children):
        if child.tag != W_P:
            continue
        text = _paragraph_text(child)
        if not text.strip():
            continue
        style_id = _style_id(child)
        style = styles.get(style_id, {})
        style_names = [str(item) for item in style.get("names", [])]
        outline_level = _outline_level(child)
        if outline_level is None:
            outline_level = style.get("outlineLevel")
        abstract_marker, _abstract_has_prose = _abstract_marker(text)
        if (
            abstract_marker
            and _paragraph_safety(child)[0]
            and not _looks_like_toc(text, style_id, style_names)
        ):
            abstract_candidates.append(body_child_index)
        toc_entry = _looks_like_toc(text, style_id, style_names)
        if first_references_heading is None and not toc_entry and _looks_like_references_heading(text):
            first_references_heading = body_child_index
        if first_main_heading is not None or abstract_marker:
            continue
        normalized = _normalize_marker_text(text)
        chapter_like_text = (
            normalized in {"绪论", "引言", "前言"}
            or bool(re.match(r"^第[一二三四五六七八九十百0-9]+章", normalized))
            or bool(re.match(r"^[1-9]\d*(?:\.\d+){0,3}(?:[.\uff0e、]|\s+)[^\d]", text.strip()))
        )
        if (
            (outline_level is not None or chapter_like_text)
            and not toc_entry
            and not _looks_like_references_heading(text)
            and not _looks_like_non_rewrite_section_heading(text)
        ):
            first_main_heading = body_child_index

    abstract_limit_candidates = [
        index
        for index in (first_main_heading, first_references_heading)
        if index is not None
    ]
    abstract_limit = min(abstract_limit_candidates) if abstract_limit_candidates else None
    abstract_start = next(
        (
            index
            for index in abstract_candidates
            if abstract_limit is None or index < abstract_limit
        ),
        None,
    )
    if abstract_start is not None:
        return (
            abstract_start,
            "abstract_heading",
            "已根据摘要标识将中英文摘要纳入正文建议范围；标题、关键词和参考文献仍保持原样。",
        )

    toc_end = _last_toc_field_end(body_children)
    if toc_end is not None:
        first_heading_after_toc: int | None = None
        for body_child_index, child in enumerate(body_children):
            if body_child_index <= toc_end or child.tag != W_P or not _paragraph_text(child).strip():
                continue
            style = styles.get(_style_id(child), {})
            outline_level = _outline_level(child)
            if outline_level is None:
                outline_level = style.get("outlineLevel")
            if outline_level is not None:
                first_heading_after_toc = body_child_index
                break
        return (
            first_heading_after_toc if first_heading_after_toc is not None else toc_end + 1,
            "toc_field",
            "已根据 Word 目录字段和目录后的首个标题样式建议正文范围。目录前内容仍可手动加入正文范围。",
        )

    # A section boundary followed by a Word outline heading is a useful,
    # school-agnostic signal for the start of the main body. We deliberately do
    # not infer a range from words such as “摘要” or “致谢”.
    seen_section_boundary = False
    for body_child_index, child in enumerate(body_children):
        if child.tag != W_P:
            continue
        if child.find("./w:pPr/w:sectPr", namespaces=NS) is not None:
            seen_section_boundary = True
            continue
        if not seen_section_boundary or not _paragraph_text(child).strip():
            continue
        style = styles.get(_style_id(child), {})
        outline_level = _outline_level(child)
        if outline_level is None:
            outline_level = style.get("outlineLevel")
        if outline_level is not None:
            return (
                body_child_index,
                "section_heading",
                "未发现标准目录字段；已根据 Word 分节后的首个标题样式建议正文范围，请在开始前核对。",
            )

    return (
        None,
        "structure_unclear",
        "未找到可靠的 Word 目录或分节标题边界，已建议所有安全的普通段落，请在开始前重点核对封面和前置内容。",
    )


def _parse_docx(path: Path) -> tuple[etree._Element, list[etree._Element]]:
    try:
        with zipfile.ZipFile(path, "r") as archive:
            if archive.testzip() is not None:
                raise DocumentError("Word 文件压缩包已损坏。")
            xml = archive.read("word/document.xml")
    except (KeyError, zipfile.BadZipFile, OSError) as exc:
        raise DocumentError("无法读取 Word 正文，请确认文件是有效的 DOCX。") from exc
    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
    try:
        root = etree.fromstring(xml, parser=parser)
    except etree.XMLSyntaxError as exc:
        raise DocumentError("Word 正文 XML 无法解析。") from exc
    body = root.find("w:body", namespaces=NS)
    if body is None:
        raise DocumentError("Word 文件中没有可读取的正文。")
    return root, list(body)


def _save_upload(stream: BinaryIO, filename: str, document_id: str) -> Path:
    suffix = Path(filename).suffix.lower()
    safe_name = secure_filename(Path(filename).stem) or "document"
    target_dir = sources_dir() / document_id
    target_dir.mkdir(parents=True, exist_ok=False)
    target = target_dir / f"{safe_name}{suffix}"
    with target.open("wb") as output:
        shutil.copyfileobj(stream, output)
    return target


def import_document(stream: BinaryIO, filename: str) -> dict[str, Any]:
    suffix = Path(filename).suffix.lower()
    if suffix not in {".docx", ".txt"}:
        raise DocumentError("目前只支持 DOCX 和 TXT 文件。")
    document_id = f"doc-{uuid.uuid4().hex}"
    source_path = _save_upload(stream, filename, document_id)
    try:
        if suffix == ".docx":
            document = _import_docx(source_path, filename, document_id)
        else:
            document = _import_txt(source_path, filename, document_id)
        save_document(document)
        _trim_recent_documents()
        return public_document(document)
    except Exception:
        shutil.rmtree(source_path.parent, ignore_errors=True)
        raise


def _import_docx(path: Path, filename: str, document_id: str) -> dict[str, Any]:
    _root, body_children = _parse_docx(path)
    with zipfile.ZipFile(path, "r") as archive:
        has_digital_signature = any(
            name.casefold().startswith("_xmlsignatures/")
            or name.casefold().endswith("origin.sigs")
            for name in archive.namelist()
        )
    styles = _paragraph_style_metadata(path)
    suggested_body_start, suggestion_basis, suggestion_message = _suggested_body_start(body_children, styles)
    paragraphs: list[dict[str, Any]] = []
    protection_units: list[dict[str, Any]] = []
    paragraph_order = 0
    in_references = False
    in_non_rewrite_section = False
    non_rewrite_section_is_terminal = False
    for body_child_index, child in enumerate(body_children):
        if child.tag != W_P:
            reason = "table_content" if _local_name(child) == "tbl" else "non_text_object"
            for nested in child.iter(W_P):
                text = _paragraph_text(nested)
                if not text.strip():
                    continue
                protection_units.append(
                    {
                        "unitIndex": len(protection_units),
                        "paragraphId": "",
                        "text": text,
                        "safe": False,
                        "protectionReason": reason,
                        "bodyChildIndex": body_child_index,
                    }
                )
            continue
        display_text = _paragraph_text(child)
        safe, exclusion_reason, protection_reason = _paragraph_safety(child)
        rewrite_nodes = _rewriteable_text_nodes(child)
        text = _paragraph_rewrite_text(child) if safe else display_text
        style_id = _style_id(child)
        style = styles.get(style_id, {})
        style_name = str(style.get("name") or "")
        style_names = [str(item) for item in style.get("names", [])]
        outline_level = _outline_level(child)
        if outline_level is None:
            outline_level = style.get("outlineLevel")
        references_heading = _looks_like_references_heading(display_text)
        abstract_marker, abstract_has_prose = _abstract_marker(display_text)
        heading = _looks_like_heading(
            display_text,
            style_id,
            style_names,
            outline_level,
        )
        non_rewrite_heading = _looks_like_non_rewrite_section_heading(display_text)
        explicit_section_heading = _is_explicit_section_heading(
            display_text,
            style_id,
            style_names,
            outline_level,
        )
        toc_entry = _looks_like_toc(display_text, style_id, style_names)
        if not toc_entry and in_references and abstract_marker:
            # Several thesis templates append the English title and abstract
            # after the bibliography.  A combined ``Abstract  ...`` paragraph
            # has no heading style, so it must explicitly end reference mode.
            in_references = False
        elif not toc_entry and in_references and not references_heading and explicit_section_heading:
            in_references = False
        if (
            not toc_entry
            and in_non_rewrite_section
            and not non_rewrite_section_is_terminal
            and explicit_section_heading
            and not non_rewrite_heading
        ):
            in_non_rewrite_section = False
            non_rewrite_section_is_terminal = False
        semantic_reason = ""
        if toc_entry:
            semantic_reason = "toc"
        elif references_heading:
            in_references = True
            in_non_rewrite_section = False
            non_rewrite_section_is_terminal = False
            semantic_reason = "references"
        elif in_references or _looks_like_reference_entry(text, style_id, style_names):
            semantic_reason = "references"
        elif non_rewrite_heading:
            in_non_rewrite_section = True
            non_rewrite_section_is_terminal = _is_terminal_non_rewrite_section(display_text)
            semantic_reason = "back_matter"
        elif in_non_rewrite_section:
            semantic_reason = "back_matter"
        elif _looks_like_caption(display_text, style_id, style_names):
            semantic_reason = "caption"
        elif _looks_like_caption_note(display_text):
            semantic_reason = "caption_note"
        elif _looks_like_keyword_line(display_text):
            semantic_reason = "keywords"
        elif heading or (abstract_marker and not abstract_has_prose):
            semantic_reason = "heading"
        elif _looks_like_structural_label(display_text):
            semantic_reason = "structural_label"
        style_suggested = _default_selected(
            style_id,
            style_names,
            outline_level,
            text,
        )
        inside_suggested_body = suggested_body_start is None or body_child_index >= suggested_body_start
        # ``safe`` answers one question only: can this paragraph be written
        # back into the existing OOXML text nodes without rebuilding document
        # structure?  Content-role guesses (heading, caption, references, ...)
        # are range suggestions, never structural locks.
        selected = bool(
            safe
            and inside_suggested_body
            and style_suggested
            and not semantic_reason
        )
        if not safe:
            suggestion_reason = protection_reason or "non_text_object"
        elif semantic_reason:
            suggestion_reason = semantic_reason
        elif not inside_suggested_body:
            suggestion_reason = "before_body_start"
        elif not style_suggested:
            suggestion_reason = "structural_style"
        else:
            suggestion_reason = "body_text"
        paragraph_id = f"p-{paragraph_order:05d}"
        paragraphs.append(
            {
                "id": paragraph_id,
                "order": paragraph_order,
                "bodyChildIndex": body_child_index,
                "text": text,
                "displayText": display_text,
                "styleId": style_id,
                "styleName": style_name,
                "outlineLevel": outline_level,
                "safe": safe,
                "exclusionReason": exclusion_reason,
                "protectionReason": protection_reason,
                "suggestedSelected": selected,
                "suggestionReason": suggestion_reason,
                "selected": selected,
                "textNodeCount": len(rewrite_nodes),
            }
        )
        protection_units.append(
            {
                "unitIndex": len(protection_units),
                "paragraphId": paragraph_id,
                "text": display_text,
                "safe": safe,
                "protectionReason": protection_reason,
                "bodyChildIndex": body_child_index,
            }
        )
        paragraph_order += 1
    safe_count = sum(1 for item in paragraphs if item["safe"])
    if safe_count == 0:
        raise DocumentError("没有找到可写的正文文字。表格和纯对象内容会原样保留；仍可使用 TXT 模式。")
    return {
        "id": document_id,
        "name": Path(filename).name,
        "kind": "docx",
        "sourcePath": str(path),
        "sourceHash": _sha256(path),
        "sourceSize": path.stat().st_size,
        "paragraphs": paragraphs,
        "protectionUnits": protection_units,
        "scopeClassifierVersion": SCOPE_CLASSIFIER_VERSION,
        "suggestionBasis": suggestion_basis,
        "suggestionMessage": suggestion_message,
        "suggestionStartBodyChildIndex": suggested_body_start,
        "hasDigitalSignature": has_digital_signature,
        "scopeConfirmed": False,
        "requiresRangeConfirmation": True,
        "latestRunId": "",
        "createdAt": _now(),
        "updatedAt": _now(),
    }


def _upgrade_docx_scope_classification(document: dict[str, Any]) -> dict[str, Any]:
    source = Path(str(document.get("sourcePath") or ""))
    if not source.is_file() or _sha256(source) != str(document.get("sourceHash") or ""):
        return document

    refreshed = _import_docx(
        source,
        str(document.get("name") or source.name),
        str(document.get("id") or ""),
    )
    previous_by_index = {
        int(item["bodyChildIndex"]): item
        for item in document.get("paragraphs", [])
        if isinstance(item.get("bodyChildIndex"), int)
    }
    previous_classifier_version = int(document.get("scopeClassifierVersion") or 0)
    scope_confirmed = bool(document.get("scopeConfirmed"))
    if scope_confirmed:
        # Once the user confirms a range, that choice is authoritative.  A
        # classifier upgrade may improve labels and safety metadata, but must
        # not silently add newly discovered paragraphs to an accepted scope.
        for paragraph in refreshed["paragraphs"]:
            previous = previous_by_index.get(int(paragraph["bodyChildIndex"]))
            selected = bool(
                paragraph.get("safe")
                and previous is not None
                and previous.get("safe")
                and previous.get("selected")
            )
            if selected and previous is not None:
                stale_equation_suggestion = bool(
                    previous_classifier_version <= 11
                    and paragraph.get("suggestionReason") == "structural_label"
                    and _looks_like_equation_number(str(paragraph.get("text") or ""))
                )
                if stale_equation_suggestion:
                    selected = False
            paragraph["selected"] = selected

    for key in (
        "paragraphs",
        "protectionUnits",
        "scopeClassifierVersion",
        "suggestionBasis",
        "suggestionMessage",
        "suggestionStartBodyChildIndex",
        "hasDigitalSignature",
    ):
        document[key] = refreshed[key]
    if not scope_confirmed:
        # An unconfirmed import still represents an automatic proposal.  Use
        # the new classifier's full suggestion instead of carrying forward old
        # false negatives (for example, omitted abstract paragraphs).
        document["scopeConfirmed"] = False
        document["requiresRangeConfirmation"] = True
    return document


def _decode_txt(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentError("TXT 编码无法识别，请另存为 UTF-8 后重试。")


def _import_txt(path: Path, filename: str, document_id: str) -> dict[str, Any]:
    content = _decode_txt(path)
    paragraphs: list[dict[str, Any]] = []
    for index, match in enumerate(re.finditer(r"[^\r\n]+(?:\r?\n(?!\r?\n)[^\r\n]+)*", content)):
        text = match.group(0)
        if not text.strip():
            continue
        paragraphs.append(
            {
                "id": f"p-{index:05d}",
                "order": index,
                "text": text,
                "start": match.start(),
                "end": match.end(),
                "styleId": "",
                "styleName": "",
                "outlineLevel": None,
                "safe": True,
                "exclusionReason": "",
                "selected": True,
                "textNodeCount": 1,
            }
        )
    if not paragraphs:
        raise DocumentError("TXT 中没有可改写的正文。")
    return {
        "id": document_id,
        "name": Path(filename).name,
        "kind": "txt",
        "sourcePath": str(path),
        "sourceHash": _sha256(path),
        "sourceSize": path.stat().st_size,
        "paragraphs": paragraphs,
        "scopeConfirmed": False,
        "requiresRangeConfirmation": True,
        "latestRunId": "",
        "createdAt": _now(),
        "updatedAt": _now(),
    }


def _shorten(value: str, limit: int = 96) -> str:
    normalized = " ".join(str(value or "").split())
    return normalized if len(normalized) <= limit else f"{normalized[:limit].rstrip()}…"


def build_protection_map(document: dict[str, Any]) -> dict[str, Any]:
    empty_summary = {
        "totalUnits": 0,
        "editableUnits": 0,
        "protectedUnits": 0,
        "availableUnits": 0,
        "lockedUnits": 0,
        "tableUnits": 0,
        "protectionReasons": [],
    }
    if document.get("kind") != "docx":
        return {
            "available": False,
            "message": "TXT 不包含 Word 结构，因此不生成保护区地图。",
            "summary": empty_summary,
            "sections": [],
            "units": [],
        }

    paragraphs = {str(item.get("id")): item for item in document.get("paragraphs", [])}
    raw_units = document.get("protectionUnits")
    if not isinstance(raw_units, list) or not raw_units:
        raw_units = [
            {
                "unitIndex": index,
                "paragraphId": paragraph.get("id", ""),
                "text": paragraph.get("text", ""),
                "safe": bool(paragraph.get("safe")),
                "protectionReason": paragraph.get("protectionReason", ""),
            }
            for index, paragraph in enumerate(document.get("paragraphs", []))
        ]

    units: list[dict[str, Any]] = []
    for index, raw in enumerate(raw_units):
        paragraph = paragraphs.get(str(raw.get("paragraphId") or ""))
        safe = bool(paragraph.get("safe")) if paragraph else bool(raw.get("safe"))
        selected = bool(paragraph and safe and paragraph.get("selected"))
        if selected:
            state = "editable"
            reason = "editable_body"
            label = "改写范围"
        elif safe:
            state = "available"
            suggested = bool(paragraph.get("suggestedSelected", paragraph.get("selected"))) if paragraph else False
            reason = str(paragraph.get("suggestionReason") or "structural_style") if not suggested else "user_choice"
            label = PROTECTION_REASON_LABELS[reason]
        else:
            state = "locked"
            reason = str(raw.get("protectionReason") or (paragraph or {}).get("protectionReason") or "non_text_object")
            if reason not in PROTECTION_REASON_LABELS:
                reason = "non_text_object"
            label = PROTECTION_REASON_LABELS.get(reason, PROTECTION_REASON_LABELS["non_text_object"])
        units.append(
            {
                "unitIndex": int(raw.get("unitIndex", index)),
                "paragraphId": str(raw.get("paragraphId") or (paragraph or {}).get("id") or ""),
                "state": state,
                "editable": selected,
                "selectable": safe,
                "reason": reason,
                "label": label,
                "text": str(raw.get("text") or (paragraph or {}).get("text") or ""),
                "styleId": str((paragraph or {}).get("styleId") or ""),
                "styleName": str((paragraph or {}).get("styleName") or ""),
                "order": (paragraph or {}).get("order"),
            }
        )

    sections: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    for unit in units:
        key = f"{unit['state']}:{unit['reason']}"
        if current is None or current["key"] != key:
            current = {
                "key": key,
                "state": unit["state"],
                "editable": unit["editable"],
                "selectable": unit["selectable"],
                "reason": unit["reason"],
                "label": unit["label"],
                "startUnit": unit["unitIndex"],
                "endUnit": unit["unitIndex"],
                "count": 0,
                "samples": [],
            }
            sections.append(current)
        current["endUnit"] = unit["unitIndex"]
        current["count"] += 1
        sample = _shorten(unit["text"])
        if sample and len(current["samples"]) < 3:
            current["samples"].append(sample)

    reason_counts = Counter(unit["reason"] for unit in units if not unit["editable"])
    editable_units = sum(1 for unit in units if unit["editable"])
    available_units = sum(1 for unit in units if unit["state"] == "available")
    locked_units = sum(1 for unit in units if unit["state"] == "locked")
    summary = {
        "totalUnits": len(units),
        "editableUnits": editable_units,
        "protectedUnits": len(units) - editable_units,
        "availableUnits": available_units,
        "lockedUnits": locked_units,
        "tableUnits": sum(1 for unit in units if unit["reason"] == "table_content"),
        "protectionReasons": [
            {
                "reason": reason,
                "label": PROTECTION_REASON_LABELS.get(reason, reason),
                "count": count,
            }
            for reason, count in sorted(reason_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
    }
    return {
        "available": True,
        "message": "保护区地图说明本次改写边界，不参与评分或结果回退。",
        "summary": summary,
        "sections": sections,
        "units": units,
    }


def public_document(document: dict[str, Any]) -> dict[str, Any]:
    value = deepcopy(document)
    value.pop("sourcePath", None)
    value.pop("protectionUnits", None)
    paragraphs = value.get("paragraphs", [])
    value["selectedCount"] = sum(1 for item in paragraphs if item.get("selected"))
    value["safeCount"] = sum(1 for item in paragraphs if item.get("safe"))
    value["excludedCount"] = sum(1 for item in paragraphs if not item.get("safe"))
    value["protectionMap"] = build_protection_map(document)
    return value


def update_scope(document_id: str, selected_ids: list[str]) -> dict[str, Any]:
    with _LOCK:
        document = load_document(document_id)
        requested = {str(item) for item in selected_ids}
        valid = {item["id"] for item in document["paragraphs"] if item.get("safe")}
        invalid = requested - valid
        if invalid:
            raise DocumentError("所选范围包含无法安全映射的段落，请刷新后重试。")
        if not requested:
            raise DocumentError("请至少选择一个正文段落。")
        for paragraph in document["paragraphs"]:
            paragraph["selected"] = paragraph["id"] in requested
        document["scopeConfirmed"] = True
        save_document(document)
        return public_document(document)


def _detect_chunk_language(text: str) -> str:
    latin_words = len(WORD_RE.findall(text))
    cjk_chars = len(CJK_CHAR_RE.findall(text))
    latin_chars = sum(1 for char in text if char.isascii() and char.isalpha())
    if latin_words >= 5 and cjk_chars == 0 and latin_chars >= 25:
        return "en"
    if latin_words >= 8 and cjk_chars <= 4 and latin_chars >= max(30, cjk_chars * 8):
        return "en"
    if latin_words >= 12 and latin_chars >= max(40, cjk_chars * 6):
        return "en"
    return "default"


def _boundary_name(joiner: str, fallback: str = "direct") -> str:
    if "\n" in joiner or "\r" in joiner:
        return "line_break"
    return "whitespace" if joiner else fallback


def _semantic_boundaries(text: str) -> list[tuple[int, int, str]]:
    boundaries: dict[int, tuple[int, int, str]] = {}
    patterns = (
        (r"[。！？；]+[”’\"」』）》】]*", "sentence"),
        (r"[.!?;:]+[\"')\]]*(?=\s+|$)", "sentence"),
        (r"\r\n|[\r\n]+", "line_break"),
    )
    for pattern, label in patterns:
        for match in re.finditer(pattern, text):
            content_end = match.end() if label == "sentence" else match.start()
            separator_end = match.end()
            if label == "sentence":
                following = re.match(r"\s+", text[content_end:])
                if following:
                    separator_end = content_end + len(following.group(0))
            if 0 < content_end < len(text):
                boundaries[content_end] = (content_end, separator_end, label)
    return sorted(boundaries.values())


def _soft_boundaries(text: str, start: int, end: int) -> list[tuple[int, int, str]]:
    candidates: dict[int, tuple[int, int, str]] = {}
    segment = text[start:end]
    for match in re.finditer(r"[，、,:：]+", segment):
        content_end = start + match.end()
        following = re.match(r"\s+", text[content_end:end])
        separator_end = content_end + (len(following.group(0)) if following else 0)
        if start < content_end < end:
            candidates[content_end] = (content_end, separator_end, "clause")
    for match in re.finditer(r"\r\n|[\r\n]+|[^\S\r\n]+", segment):
        content_end = start + match.start()
        separator_end = start + match.end()
        if start < content_end < end:
            label = "line_break" if "\n" in match.group(0) or "\r" in match.group(0) else "whitespace"
            candidates.setdefault(content_end, (content_end, separator_end, label))
    return sorted(candidates.values())


def _join_parts(left: dict[str, str], right: dict[str, str]) -> dict[str, str]:
    return {
        "text": f"{left['text']}{right['joinerBefore']}{right['text']}",
        "joinerBefore": left["joinerBefore"],
        "boundaryBefore": left["boundaryBefore"],
    }


def _split_long_span(
    text: str,
    start: int,
    end: int,
    joiner_before: str,
    boundary_before: str,
    *,
    target: int,
    hard: int,
) -> list[dict[str, str]]:
    parts: list[dict[str, str]] = []
    cursor = start
    pending_joiner = joiner_before
    pending_boundary = boundary_before
    while end - cursor > hard:
        desired = min(end, cursor + target)
        hard_end = min(end, cursor + hard)
        candidates = _soft_boundaries(text, cursor, hard_end)
        minimum_progress = cursor + max(1, round(target * 0.55))
        before_target = [
            item for item in candidates if minimum_progress <= item[0] <= desired
        ]
        after_target = [item for item in candidates if item[0] > desired]
        if before_target:
            # Preserve the established paragraph-internal splitter behaviour:
            # stop at the latest safe boundary before the target whenever possible.
            content_end, separator_end, label = max(before_target, key=lambda item: item[0])
        elif after_target:
            content_end, separator_end, label = min(after_target, key=lambda item: item[0])
        else:
            content_end = hard_end
            separator_end = hard_end
            label = "hard"
        if content_end <= cursor:
            content_end = hard_end
            separator_end = hard_end
            label = "hard"
        parts.append(
            {
                "text": text[cursor:content_end],
                "joinerBefore": pending_joiner,
                "boundaryBefore": pending_boundary,
            }
        )
        pending_joiner = text[content_end:separator_end]
        pending_boundary = _boundary_name(pending_joiner, label)
        cursor = separator_end
    parts.append(
        {
            "text": text[cursor:end],
            "joinerBefore": pending_joiner,
            "boundaryBefore": pending_boundary,
        }
    )
    return parts


def _split_text_parts(
    text: str,
    limit: int | None = None,
    *,
    preset: str = DEFAULT_CHUNK_PRESET,
) -> list[dict[str, str]]:
    """Split one paragraph without crossing it or losing a single separator."""

    normalized_preset = preset if preset in CHUNK_PRESETS else DEFAULT_CHUNK_PRESET
    language = _detect_chunk_language(text)
    keep, target, hard, min_tail = CHUNK_PRESETS[normalized_preset][language]
    if limit is not None:
        if limit < 2:
            raise ValueError("分块长度至少为 2。")
        keep = limit
        target = max(2, min(limit, round(limit * 0.8)))
        hard = limit
        min_tail = max(1, round(limit * 0.22))
    if len(text) <= keep:
        return [{"text": text, "joinerBefore": "", "boundaryBefore": "start"}]

    semantic = _semantic_boundaries(text)
    units: list[tuple[int, int, str, str]] = []
    cursor = 0
    joiner_before = ""
    boundary_before = "start"
    for content_end, separator_end, label in semantic:
        if content_end <= cursor:
            continue
        units.append((cursor, content_end, joiner_before, boundary_before))
        joiner_before = text[content_end:separator_end]
        boundary_before = _boundary_name(joiner_before, label)
        cursor = separator_end
    if cursor < len(text) or not units:
        units.append((cursor, len(text), joiner_before, boundary_before))
    elif joiner_before and units:
        start, _end, previous_joiner, previous_boundary = units[-1]
        units[-1] = (start, len(text), previous_joiner, previous_boundary)

    parts: list[dict[str, str]] = []
    current: dict[str, str] | None = None
    for start, end, unit_joiner, unit_boundary in units:
        unit = {
            "text": text[start:end],
            "joinerBefore": unit_joiner,
            "boundaryBefore": unit_boundary,
        }
        unit_length = len(unit["text"])
        if unit_length > hard:
            if current is not None:
                parts.append(current)
                current = None
            parts.extend(
                _split_long_span(
                    text,
                    start,
                    end,
                    unit_joiner,
                    unit_boundary,
                    target=target,
                    hard=hard,
                )
            )
            continue
        if current is None:
            current = unit
            continue
        candidate = _join_parts(current, unit)
        candidate_length = len(candidate["text"])
        if candidate_length <= target or (len(current["text"]) < min_tail and candidate_length <= hard):
            current = candidate
        else:
            parts.append(current)
            current = unit
    if current is not None:
        parts.append(current)

    merged: list[dict[str, str]] = []
    for part in parts:
        if merged and len(part["text"]) < min_tail:
            candidate = _join_parts(merged[-1], part)
            if len(candidate["text"]) <= hard:
                merged[-1] = candidate
                continue
        merged.append(part)
    if len(merged) >= 2 and len(merged[-1]["text"]) < min_tail:
        candidate = _join_parts(merged[-2], merged[-1])
        if len(candidate["text"]) <= hard:
            merged[-2:] = [candidate]
    return merged


def split_text(
    text: str, limit: int | None = None, *, preset: str = DEFAULT_CHUNK_PRESET
) -> list[str]:
    parts = _split_text_parts(text, limit, preset=preset)
    return [f"{part['joinerBefore']}{part['text']}" for part in parts]


def build_chunk_manifest(
    document: dict[str, Any],
    limit: int | None = None,
    *,
    preset: str = DEFAULT_CHUNK_PRESET,
) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    for paragraph in document.get("paragraphs", []):
        if not paragraph.get("selected"):
            continue
        paragraph_text = str(paragraph.get("text") or "")
        pieces = _split_text_parts(paragraph_text, limit, preset=preset)
        for part_index, part in enumerate(pieces):
            chunks.append(
                {
                    "id": f"{paragraph['id']}:c-{part_index:03d}",
                    "paragraphId": paragraph["id"],
                    "paragraphOrder": paragraph["order"],
                    "partIndex": part_index,
                    "partCount": len(pieces),
                    "originalText": part["text"],
                    "joinerBefore": part["joinerBefore"],
                    "boundaryBefore": part["boundaryBefore"],
                    "language": _detect_chunk_language(paragraph_text),
                    "chunkPreset": preset if preset in CHUNK_PRESETS else DEFAULT_CHUNK_PRESET,
                }
            )
    return chunks


def set_latest_run(document_id: str, run_id: str) -> None:
    with _LOCK:
        document = load_document(document_id)
        document["latestRunId"] = run_id
        save_document(document)


def list_recent_documents() -> list[dict[str, Any]]:
    documents_dir().mkdir(parents=True, exist_ok=True)
    items: list[dict[str, Any]] = []
    for path in documents_dir().glob("doc-*.json"):
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(value, dict):
                public = public_document(value)
                public.pop("paragraphs", None)
                public.pop("protectionMap", None)
                items.append(public)
        except (OSError, json.JSONDecodeError):
            continue
    items.sort(key=lambda item: str(item.get("updatedAt") or ""), reverse=True)
    return items[:MAX_RECENT_DOCUMENTS]


def _trim_recent_documents() -> None:
    paths = list(documents_dir().glob("doc-*.json"))
    paths.sort(key=lambda path: path.stat().st_mtime, reverse=True)
    for path in paths[MAX_RECENT_DOCUMENTS:]:
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            document_id = str(value.get("id") or path.stem)
            _delete_document_files(document_id, path)
        except (OSError, json.JSONDecodeError):
            path.unlink(missing_ok=True)


def _delete_document_files(document_id: str, manifest_path: Path | None = None) -> None:
    root = get_data_dir().resolve()
    source = (sources_dir() / document_id).resolve()
    if source.parent == sources_dir().resolve() and root in source.parents:
        shutil.rmtree(source, ignore_errors=True)
    (manifest_path or document_path(document_id)).unlink(missing_ok=True)
    run_directory = get_data_dir() / "runs"
    for candidate in run_directory.glob("run-*.json"):
        try:
            value = json.loads(candidate.read_text(encoding="utf-8"))
            if value.get("documentId") == document_id and candidate.parent.resolve() == run_directory.resolve():
                candidate.unlink(missing_ok=True)
        except (OSError, json.JSONDecodeError):
            continue


def delete_document(document_id: str) -> None:
    with _LOCK:
        document = load_document(document_id)
        _delete_document_files(document_id)
        for export in exports_dir().glob(f"{document_id}-*"):
            if export.parent.resolve() == exports_dir().resolve():
                export.unlink(missing_ok=True)


def _preserve_outer_whitespace(original: str, replacement: str) -> str:
    if not original or not original.strip():
        return original
    leading = re.match(r"^\s*", original).group(0)
    trailing = re.search(r"\s*$", original).group(0)
    return f"{leading}{replacement.strip()}{trailing}"


def _text_node_anchor_weight(node: etree._Element | None) -> int:
    """Weight OOXML runs that should remain stable formatting anchors."""

    if node is None:
        return -1
    score = 0
    run_scored = False
    parent = node.getparent()
    while parent is not None:
        local_name = _local_name(parent)
        if local_name == "hyperlink":
            score += 12
        if local_name == "r" and not run_scored:
            properties = parent.find("./w:rPr", namespaces=NS)
            if properties is not None:
                names = {_local_name(item) for item in properties.iterdescendants()}
                score += min(8, len(names))
                if names & {"vertAlign", "position"}:
                    score += 8
                if names & {"b", "i", "u", "rFonts", "sz", "color"}:
                    score += 3
            run_scored = True
        parent = parent.getparent()
    value = node.text or ""
    if re.search(r"https?://|www\.|\[[^\]\r\n]{1,40}\]|\b[A-Za-z][A-Za-z0-9_.:/+-]{2,}\b", value):
        score += 6
    return score


def _aligned_text_boundaries(
    text_nodes: list[etree._Element], original: str, replacement: str
) -> list[int]:
    """Map existing w:t boundaries onto rewritten text without changing OOXML structure."""

    node_boundaries = [0]
    for node in text_nodes:
        node_boundaries.append(node_boundaries[-1] + len(node.text or ""))
    matcher = SequenceMatcher(None, original, replacement, autojunk=True)
    opcodes = matcher.get_opcodes()
    mapped = [0]

    for node_index, position in enumerate(node_boundaries[1:-1], start=1):
        insertions = [
            (new_start, new_end)
            for tag, old_start, old_end, new_start, new_end in opcodes
            if tag == "insert" and old_start == old_end == position
        ]
        if insertions:
            insertion_start = min(item[0] for item in insertions)
            insertion_end = max(item[1] for item in insertions)
            left_score = _text_node_anchor_weight(text_nodes[node_index - 1])
            right_score = _text_node_anchor_weight(text_nodes[node_index])
            target = insertion_start if left_score > right_score else insertion_end
        else:
            target = None
            for tag, old_start, old_end, new_start, new_end in opcodes:
                if old_start <= position <= old_end and old_end > old_start:
                    if tag == "equal":
                        target = new_start + (position - old_start)
                    elif tag == "delete":
                        target = new_start
                    else:
                        old_width = old_end - old_start
                        new_width = new_end - new_start
                        ratio = (position - old_start) / old_width
                        target = new_start + round(new_width * ratio)
                    break
            if target is None:
                target = round(len(replacement) * position / max(1, len(original)))
        mapped.append(max(mapped[-1], min(len(replacement), int(target))))

    mapped.append(len(replacement))
    return mapped


def _distribute_text(text_nodes: list[etree._Element], original: str, replacement: str) -> None:
    if not text_nodes:
        raise FormatFidelityError("正文目标没有可写入的文本节点。")
    final_text = _preserve_outer_whitespace(original, replacement)
    if "".join(node.text or "" for node in text_nodes) != original:
        raise FormatFidelityError("正文文本节点与导入映射不一致。")
    boundaries = _aligned_text_boundaries(text_nodes, original, final_text)
    for index, node in enumerate(text_nodes):
        value = final_text[boundaries[index] : boundaries[index + 1]]
        try:
            node.text = value
        except ValueError as exc:
            raise FormatFidelityError("改写结果包含 Word 正文不支持的控制字符，请手动编辑后再导出。") from exc
        if value[:1].isspace() or value[-1:].isspace():
            node.set(XML_SPACE, "preserve")


def _distributed_text_values(
    text_nodes: list[etree._Element], original: str, replacement: str
) -> list[str]:
    if not text_nodes:
        raise FormatFidelityError("正文目标没有可写入的文本节点。")
    if "".join(node.text or "" for node in text_nodes) != original:
        raise FormatFidelityError("正文文本节点与导入映射不一致。")
    final_text = _preserve_outer_whitespace(original, replacement)
    for character in final_text:
        codepoint = ord(character)
        if not (
            character in "\t\n\r"
            or 0x20 <= codepoint <= 0xD7FF
            or 0xE000 <= codepoint <= 0xFFFD
            or 0x10000 <= codepoint <= 0x10FFFF
        ):
            raise FormatFidelityError(
                "改写结果包含 Word 正文不支持的控制字符，请手动编辑后再导出。"
            )
    boundaries = _aligned_text_boundaries(text_nodes, original, final_text)
    return [
        final_text[boundaries[index] : boundaries[index + 1]]
        for index in range(len(text_nodes))
    ]


def _word_text_tokens(xml: bytes) -> list[dict[str, Any]]:
    namespace = re.compile(
        rb"xmlns(?::(?P<prefix>[A-Za-z_][A-Za-z0-9_.-]*))?\s*=\s*(?P<quote>[\"'])"
        + re.escape(W_NS.encode("ascii"))
        + rb"(?P=quote)"
    )
    names: list[bytes] = []
    for match in namespace.finditer(xml):
        prefix = match.group("prefix")
        name = (prefix + b":t") if prefix else b"t"
        if name not in names:
            names.append(name)
    if not names:
        raise FormatFidelityError("正文 XML 中没有找到 Word 文本命名空间。")
    alternatives = b"|".join(re.escape(name) for name in sorted(names, key=len, reverse=True))
    start_pattern = re.compile(
        rb"<(?P<name>(?:" + alternatives + rb"))(?P<attrs>(?:\s[^<>]*?)?)(?P<self>/?)>"
    )
    tokens: list[dict[str, Any]] = []
    cursor = 0
    while True:
        match = start_pattern.search(xml, cursor)
        if match is None:
            break
        name = match.group("name")
        self_closing = match.group("self") == b"/"
        if self_closing:
            end = match.end()
            close_tag = b""
            content_start = match.end()
            content_end = match.end()
        else:
            close_match = re.compile(rb"</" + re.escape(name) + rb"\s*>").search(xml, match.end())
            if close_match is None:
                raise FormatFidelityError("正文 XML 文本节点没有正确闭合。")
            if b"<" in xml[match.end() : close_match.start()]:
                raise FormatFidelityError("正文 XML 文本节点包含无法定点替换的嵌套结构。")
            end = close_match.end()
            close_tag = close_match.group(0)
            content_start = match.end()
            content_end = close_match.start()
        tokens.append(
            {
                "start": match.start(),
                "end": end,
                "name": name,
                "attrs": match.group("attrs") or b"",
                "startTag": match.group(0),
                "closeTag": close_tag,
                "selfClosing": self_closing,
                "contentStart": content_start,
                "contentEnd": content_end,
            }
        )
        cursor = end
    return tokens


def _escaped_xml_text(value: str) -> bytes:
    escaped = value.replace("&", "&amp;").replace("<", "&lt;").replace("]]>", "]]&gt;")
    return escaped.encode("utf-8")


_XML_SPACE_ATTRIBUTE = re.compile(
    rb"(?P<prefix>\bxml:space\s*=\s*)(?P<quote>[\"'])(?P<value>.*?)(?P=quote)"
)


def _text_token_bytes(token: dict[str, Any], value: str) -> bytes:
    start_tag = bytes(token["startTag"])
    needs_preserve = bool(value[:1].isspace() or value[-1:].isspace())
    if needs_preserve:
        if _XML_SPACE_ATTRIBUTE.search(start_tag):
            start_tag = _XML_SPACE_ATTRIBUTE.sub(
                lambda match: match.group("prefix")
                + match.group("quote")
                + b"preserve"
                + match.group("quote"),
                start_tag,
                count=1,
            )
        else:
            insertion = start_tag.rfind(b"/>")
            if insertion < 0:
                insertion = start_tag.rfind(b">")
            start_tag = start_tag[:insertion] + b' xml:space="preserve"' + start_tag[insertion:]
    encoded = _escaped_xml_text(value)
    if token["selfClosing"]:
        if not value:
            return start_tag
        expanded_start = re.sub(rb"/\s*>$", b">", start_tag)
        return expanded_start + encoded + b"</" + bytes(token["name"]) + b">"
    return start_tag + encoded + bytes(token["closeTag"])


def _patch_document_xml(
    xml: bytes, replacements: dict[int, str], expected_node_count: int
) -> bytes:
    tokens = _word_text_tokens(xml)
    if len(tokens) != expected_node_count:
        raise FormatFidelityError("正文 XML 文本节点与解析映射数量不一致。")
    if any(index < 0 or index >= len(tokens) for index in replacements):
        raise FormatFidelityError("正文目标文本节点不存在。")
    patched = xml
    for index in sorted(replacements, reverse=True):
        token = tokens[index]
        replacement = _text_token_bytes(token, replacements[index])
        patched = patched[: token["start"]] + replacement + patched[token["end"] :]
    return patched


def _normalized_selected_text_token(token: dict[str, Any]) -> bytes:
    attrs = re.sub(
        rb"\s+xml:space\s*=\s*([\"']).*?\1",
        b"",
        bytes(token.get("attrs") or b""),
        count=1,
    )
    name = bytes(token["name"])
    return b"<" + name + attrs + b">__FYADR_TEXT__</" + name + b">"


def _mask_selected_text_tokens(xml: bytes, selected_node_indexes: set[int]) -> bytes:
    tokens = _word_text_tokens(xml)
    if any(index >= len(tokens) for index in selected_node_indexes):
        raise FormatFidelityError("格式审计无法定位所选文本节点。")
    output: list[bytes] = []
    cursor = 0
    for index, token in enumerate(tokens):
        output.append(xml[cursor : token["start"]])
        if index in selected_node_indexes:
            output.append(_normalized_selected_text_token(token))
        else:
            output.append(xml[token["start"] : token["end"]])
        cursor = int(token["end"])
    output.append(xml[cursor:])
    return b"".join(output)


def _masked_document_xml(xml: bytes) -> bytes:
    parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
    root = etree.fromstring(xml, parser=parser)
    for node in root.iter(W_T):
        node.text = "__FYADR_TEXT__"
        node.attrib.pop(XML_SPACE, None)
    return etree.tostring(root, method="c14n", with_comments=True)


def _licensed_xml_changes_only(
    before: etree._Element,
    after: etree._Element,
    selected_body_indexes: set[int],
    *,
    allow_text_changes: bool = False,
) -> bool:
    if before.tag != after.tag or before.prefix != after.prefix or before.nsmap != after.nsmap:
        return False
    if before.tail != after.tail:
        return False

    text_change_allowed = allow_text_changes and before.tag == W_T
    before_attributes = dict(before.attrib)
    after_attributes = dict(after.attrib)
    if text_change_allowed:
        before_space = before.get(XML_SPACE)
        after_space = after.get(XML_SPACE)
        before_attributes.pop(XML_SPACE, None)
        after_attributes.pop(XML_SPACE, None)
        value = after.text or ""
        needs_preserve = value[:1].isspace() or value[-1:].isspace()
        if needs_preserve and after_space != "preserve":
            return False
        if not needs_preserve and after_space != before_space:
            return False
    if before_attributes != after_attributes:
        return False
    if not text_change_allowed and before.text != after.text:
        return False

    before_children = list(before)
    after_children = list(after)
    if len(before_children) != len(after_children):
        return False
    for index, (before_child, after_child) in enumerate(zip(before_children, after_children)):
        if before.tag == W_BODY:
            child_allows_text = index in selected_body_indexes
            child_selected_indexes: set[int] = set()
        else:
            child_allows_text = allow_text_changes
            child_selected_indexes = selected_body_indexes
        if not _licensed_xml_changes_only(
            before_child,
            after_child,
            child_selected_indexes,
            allow_text_changes=child_allows_text,
        ):
            return False
    return True


def _selected_word_text_node_indexes(
    root: etree._Element, selected_body_indexes: set[int]
) -> set[int]:
    body = root.find("w:body", namespaces=NS)
    if body is None:
        raise FormatFidelityError("正文 XML 缺少文档主体。")
    children = list(body)
    selected_nodes: set[etree._Element] = set()
    for body_index in selected_body_indexes:
        if body_index < 0 or body_index >= len(children):
            raise FormatFidelityError("格式审计无法定位所选正文。")
        selected_nodes.update(_rewriteable_text_nodes(children[body_index]))
    return {
        index for index, node in enumerate(root.iter(W_T)) if node in selected_nodes
    }


def _audit_docx(source: Path, output: Path, selected_body_indexes: set[int]) -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    try:
        with zipfile.ZipFile(source, "r") as before, zipfile.ZipFile(output, "r") as after:
            bad = after.testzip()
            checks.append({"name": "DOCX 压缩包完整", "passed": bad is None})
            before_names = before.namelist()
            after_names = after.namelist()
            same_parts = before_names == after_names
            checks.append({"name": "包部件数量与顺序", "passed": same_parts})
            checks.append({"name": "压缩包注释", "passed": before.comment == after.comment})
            metadata_fields = (
                "filename",
                "date_time",
                "compress_type",
                "comment",
                "extra",
                "create_system",
                "create_version",
                "extract_version",
                "volume",
                "internal_attr",
            )

            def equivalent_zip_metadata(left: zipfile.ZipInfo, right: zipfile.ZipInfo) -> bool:
                if any(getattr(left, field) != getattr(right, field) for field in metadata_fields):
                    return False

                # Bits 1-2 describe the compressor's speed/ratio choice and bit 3
                # describes whether a data descriptor was used. Python's zipfile
                # legitimately recalculates those implementation details while
                # preserving the same compression method and package content.
                volatile_flag_bits = 0x000E
                if (left.flag_bits & ~volatile_flag_bits) != (right.flag_bits & ~volatile_flag_bits):
                    return False

                if left.external_attr == right.external_attr:
                    return True
                # zipfile assigns its default regular-file mode when an Office ZIP
                # entry has no external attributes. This is container metadata, not
                # an OOXML or Word-format change.
                return left.external_attr == 0 and right.external_attr == (0o600 << 16)

            metadata_same = same_parts and all(
                equivalent_zip_metadata(left, right)
                for left, right in zip(before.infolist(), after.infolist())
            )
            checks.append({"name": "包部件元数据", "passed": metadata_same})
            unchanged_parts = same_parts and all(
                before.read(name) == after.read(name) for name in before_names if name != "word/document.xml"
            )
            checks.append({"name": "非正文包部件", "passed": unchanged_parts})
            before_xml = before.read("word/document.xml")
            after_xml = after.read("word/document.xml")
            structure_same = _masked_document_xml(before_xml) == _masked_document_xml(after_xml)
            checks.append({"name": "正文 XML 结构", "passed": structure_same})

            parser = etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=False)
            before_root = etree.fromstring(before_xml, parser=parser)
            after_root = etree.fromstring(after_xml, parser=parser)
            selected_node_indexes = _selected_word_text_node_indexes(
                before_root, selected_body_indexes
            )
            raw_changes_licensed = (
                _mask_selected_text_tokens(before_xml, selected_node_indexes)
                == _mask_selected_text_tokens(after_xml, selected_node_indexes)
            )
            checks.append({"name": "正文 XML 非许可字节不变", "passed": raw_changes_licensed})
            licensed_changes = _licensed_xml_changes_only(
                before_root,
                after_root,
                selected_body_indexes,
            )
            checks.append({"name": "仅改动所选正文文字", "passed": licensed_changes})
            before_body = list(before_root.find("w:body", namespaces=NS))
            after_body = list(after_root.find("w:body", namespaces=NS))
            unselected_same = len(before_body) == len(after_body)
            if unselected_same:
                for index, (left, right) in enumerate(zip(before_body, after_body)):
                    if index in selected_body_indexes:
                        continue
                    if etree.tostring(left) != etree.tostring(right):
                        unselected_same = False
                        break
            checks.append({"name": "未选正文区域", "passed": unselected_same})
            signed = any(
                name.casefold().startswith("_xmlsignatures/")
                or name.casefold().endswith("origin.sigs")
                for name in before_names
            )
            if signed:
                checks.append(
                    {
                        "name": "数字签名",
                        "passed": False,
                        "detail": "源文件包含数字签名；修改正文后签名可能失效。",
                    }
                )
    except (OSError, KeyError, zipfile.BadZipFile, etree.XMLSyntaxError, FormatFidelityError) as exc:
        checks.append({"name": "导出验证", "passed": False, "detail": str(exc)})
    passed = all(bool(item.get("passed")) for item in checks)
    return {
        "passed": passed,
        "status": "passed" if passed else "warning",
        "forceExported": False,
        "checks": checks,
        "message": "文档结构检查通过。" if passed else "文件已生成，但结构检查发现风险。",
    }


def export_docx(
    document: dict[str, Any],
    replacements: dict[str, str],
    run_id: str,
    paragraph_ids: set[str] | None = None,
) -> tuple[Path, dict[str, Any]]:
    source = Path(str(document.get("sourcePath") or ""))
    if not source.exists() or _sha256(source) != document.get("sourceHash"):
        raise FormatFidelityError("源文件已变化，无法按原文位置写入。")
    root, body_children = _parse_docx(source)
    all_text_nodes = list(root.iter(W_T))
    node_indexes = {node: index for index, node in enumerate(all_text_nodes)}
    text_replacements: dict[int, str] = {}
    selected_indexes: set[int] = set()
    for paragraph in document.get("paragraphs", []):
        paragraph_id = str(paragraph["id"])
        included = paragraph_id in paragraph_ids if paragraph_ids is not None else bool(paragraph.get("selected"))
        if not included:
            continue
        if paragraph_id not in replacements:
            raise FormatFidelityError("运行结果不完整，无法导出 DOCX。")
        index = int(paragraph["bodyChildIndex"])
        if index >= len(body_children) or body_children[index].tag != W_P:
            raise FormatFidelityError("无法定位原文中的目标段落。")
        target = body_children[index]
        nodes = _rewriteable_text_nodes(target)
        if _paragraph_rewrite_text(target) != paragraph.get("text") or len(nodes) != paragraph.get("textNodeCount"):
            raise FormatFidelityError("原文中的文本节点数量与导入记录不一致。")
        values = _distributed_text_values(
            nodes,
            str(paragraph.get("text") or ""),
            str(replacements[paragraph_id]),
        )
        for node, value in zip(nodes, values):
            if node not in node_indexes:
                raise FormatFidelityError("正文目标文本节点无法定位。")
            text_replacements[node_indexes[node]] = value
        selected_indexes.add(index)

    exports_dir().mkdir(parents=True, exist_ok=True)
    output = exports_dir() / f"{document['id']}-{run_id}.docx"
    try:
        with zipfile.ZipFile(source, "r") as before, zipfile.ZipFile(output, "w") as after:
            original_xml = before.read("word/document.xml")
            document_xml = _patch_document_xml(
                original_xml,
                text_replacements,
                len(all_text_nodes),
            )
            after.comment = before.comment
            for info in before.infolist():
                data = document_xml if info.filename == "word/document.xml" else before.read(info.filename)
                after.writestr(info, data)
    except (OSError, zipfile.BadZipFile) as exc:
        output.unlink(missing_ok=True)
        raise FormatFidelityError("写入 Word 文件失败。") from exc
    audit = _audit_docx(source, output, selected_indexes)
    return output, audit


def export_txt(
    document: dict[str, Any],
    replacements: dict[str, str],
    run_id: str,
    paragraph_ids: set[str] | None = None,
) -> tuple[Path, dict[str, Any]]:
    source = Path(str(document.get("sourcePath") or ""))
    if not source.exists():
        raise DocumentError("源文件不存在。")
    if document.get("kind") == "txt":
        content = _decode_txt(source)
        selected = (
            [item for item in document["paragraphs"] if str(item.get("id") or "") in paragraph_ids]
            if paragraph_ids is not None
            else [item for item in document["paragraphs"] if item.get("selected")]
        )
        for paragraph in reversed(selected):
            paragraph_id = paragraph["id"]
            if paragraph_id not in replacements:
                raise DocumentError("运行结果不完整，无法导出。")
            content = content[: paragraph["start"]] + replacements[paragraph_id] + content[paragraph["end"] :]
    else:
        paragraphs = {str(item.get("id") or ""): item for item in document.get("paragraphs", [])}
        units = document.get("protectionUnits")
        if not isinstance(units, list) or not units:
            units = [
                {"paragraphId": item.get("id", ""), "text": item.get("text", "")}
                for item in document.get("paragraphs", [])
            ]
        lines = []
        for unit in units:
            paragraph_id = str(unit.get("paragraphId") or "")
            paragraph = paragraphs.get(paragraph_id)
            original_text = str(unit.get("text") or (paragraph or {}).get("text") or "")
            lines.append(replacements.get(paragraph_id, original_text) if paragraph_id else original_text)
        content = "\n\n".join(lines)
    exports_dir().mkdir(parents=True, exist_ok=True)
    output = exports_dir() / f"{document['id']}-{run_id}.txt"
    output.write_text(content, encoding="utf-8")
    return output, {
        "passed": True,
        "status": "passed",
        "forceExported": False,
        "checks": [{"name": "文本导出", "passed": True}],
        "message": "TXT 已生成。",
    }
