"""Utilities for preserving DOCX structure while rewriting text.

The core AIGC reduction still operates on plain text, but this module now
extracts a stable editable-text snapshot from the original DOCX and can write
the rewritten text back onto a copy of the original Word file. This preserves
images, cover pages, tables, page settings, and most existing layout details.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable, Iterator, Sequence

try:
    from docx import Document  # type: ignore[import]
    from docx.document import Document as DocxDocument  # type: ignore[import]
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING  # type: ignore[import]
    from docx.oxml import OxmlElement  # type: ignore[import]
    from docx.oxml.ns import qn  # type: ignore[import]
    from docx.oxml.table import CT_Tbl  # type: ignore[import]
    from docx.oxml.text.paragraph import CT_P  # type: ignore[import]
    from docx.shared import Cm, Pt  # type: ignore[import]
    from docx.table import Table, _Cell  # type: ignore[import]
    from docx.text.paragraph import Paragraph  # type: ignore[import]
except ImportError as exc:  # pragma: no cover - import guard
    raise SystemExit(
        "Missing dependency python-docx. Install it with: pip install python-docx"
    ) from exc


ROOT_DIR = Path(__file__).resolve().parents[1]
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
DOCX_SNAPSHOT_VERSION = 6
DEFAULT_CN_FONT = "宋体"
DEFAULT_EN_FONT = "Times New Roman"
DEFAULT_BODY_FONT_SIZE_PT = 12
DEFAULT_BODY_LINE_SPACING_PT = 20
DEFAULT_BODY_FIRST_LINE_INDENT_CM = 0.74
DEFAULT_PAGE_MARGINS_CM = {
    "top_margin": 2.54,
    "bottom_margin": 2.54,
    "left_margin": 3.17,
    "right_margin": 3.17,
}
ABSTRACT_MARKERS = {"摘要", "abstract"}
ACKNOWLEDGEMENT_MARKERS = {"致谢", "acknowledgements", "acknowledgments"}
TOC_MARKERS = {"目录", "tableofcontents"}
REFERENCE_MARKERS = {"参考文献", "references", "bibliography"}
BACK_MATTER_MARKERS = {
    "附录",
    "appendix",
    "appendices",
    "作者简介",
    "个人简历",
    "原创性声明",
    "学位论文原创性声明",
    "学位论文使用授权声明",
    "攻读学位期间取得的研究成果",
    "攻读学位期间发表的学术论文",
    "在学期间研究成果",
}
KEYWORD_PREFIXES = ("关键词", "关键字", "keywords", "keyword")
BODY_START_RE = re.compile(r"^(第[一二三四五六七八九十0-9]+章|[1-9]\d*(?:\.\d+)*[^\d].*|绪论|引言|前言)$")
HEADING_NUMBER_RE = re.compile(r"^(第[一二三四五六七八九十百0-9]+章.*|[1-9]\d*(?:\.\d+){0,3}[^\d].*)$")
CAPTION_RE = re.compile(r"^(图|表|figure|table)(?:[a-z]?\d+|[一二三四五六七八九十]+)(?:[-.．－—]\d+)*")
DATE_LINE_RE = re.compile(r"^\d{4}年\d{1,2}月\d{1,2}日$")
LATIN_CHAR_RE = re.compile(r"[A-Za-z]")
DIGIT_CHAR_RE = re.compile(r"\d")
FORMULA_SYMBOL_RE = re.compile(r"[=≈≠≤≥±×÷∑Σ√∫∞α-ωΑ-ΩμσλθπφψωΔδβγ_^\[\]{}<>]")
FORMULA_STYLE_HINTS = ("equation", "公式")
SHORT_HEADING_RE = re.compile(r"^[A-Za-z0-9\u4e00-\u9fff\s（）()、：:·/+\-]{2,36}$")
HEADING_KEYWORDS = (
    "研究背景",
    "研究意义",
    "国内外研究",
    "研究现状",
    "相关理论",
    "关键技术",
    "需求分析",
    "总体设计",
    "系统设计",
    "系统实现",
    "模型构建",
    "模型训练",
    "实验设计",
    "实验结果",
    "结果分析",
    "特征工程",
    "数据预处理",
    "系统测试",
    "总结",
    "展望",
)


@dataclass
class DocxTextUnit:
    unit_index: int
    target: dict[str, Any]
    text: str
    style_name: str
    editable: bool = True
    protect_reason: str | None = None
    has_field_code: bool = False
    has_drawing: bool = False

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DocxSnapshot:
    version: int
    source_path: str
    source_size: int
    source_mtime_ns: int
    editable_unit_count: int
    total_text_unit_count: int
    units: list[DocxTextUnit]

    def editable_units(self) -> list[DocxTextUnit]:
        return [unit for unit in self.units if unit.editable]

    def editable_texts(self) -> list[str]:
        return [unit.text for unit in self.units if unit.editable]

    def to_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "source_path": self.source_path,
            "source_size": self.source_size,
            "source_mtime_ns": self.source_mtime_ns,
            "editable_unit_count": self.editable_unit_count,
            "total_text_unit_count": self.total_text_unit_count,
            "units": [unit.to_dict() for unit in self.units],
        }


def get_docx_extracted_text_path(source_path: Path) -> Path:
    return INTERMEDIATE_DIR / f"{source_path.stem}_extracted.txt"


def get_docx_snapshot_path(source_path: Path) -> Path:
    return INTERMEDIATE_DIR / f"{source_path.stem}_docx_snapshot.json"


def read_docx_text(path: Path) -> str:
    """Read a DOCX file as editable text blocks joined by blank lines."""
    snapshot = build_docx_snapshot(path)
    return "\n\n".join(snapshot.editable_texts())


def read_docx_paragraphs(path: Path) -> list[str]:
    """Read a DOCX file as editable text blocks in order."""
    snapshot = build_docx_snapshot(path)
    return snapshot.editable_texts()


def write_docx_text(lines: Iterable[str], path: Path) -> None:
    """Write an iterable of text blocks into a brand-new .docx file."""
    document = Document()
    _apply_default_document_layout(document)
    for block in lines:
        paragraph = document.add_paragraph(block)
        _apply_default_paragraph_layout(paragraph)
    document.save(str(path))


def write_docx_paragraphs(paragraphs: Iterable[str], path: Path) -> None:
    write_docx_text(paragraphs, path)


def build_docx_snapshot(path: Path) -> DocxSnapshot:
    source_path = path.resolve()
    document = Document(str(source_path))
    units = _collect_text_units(document)
    _apply_protection_rules(units)
    source_stat = source_path.stat()
    return DocxSnapshot(
        version=DOCX_SNAPSHOT_VERSION,
        source_path=str(source_path),
        source_size=source_stat.st_size,
        source_mtime_ns=source_stat.st_mtime_ns,
        editable_unit_count=sum(1 for unit in units if unit.editable),
        total_text_unit_count=len(units),
        units=units,
    )


def ensure_docx_processing_assets(
    source_path: Path,
    *,
    extracted_path: Path | None = None,
    snapshot_path: Path | None = None,
) -> tuple[Path, Path, DocxSnapshot]:
    normalized_source = source_path.resolve()
    extracted_path = extracted_path or get_docx_extracted_text_path(normalized_source)
    snapshot_path = snapshot_path or get_docx_snapshot_path(normalized_source)

    snapshot = _load_docx_snapshot(snapshot_path)
    if snapshot is None or not _is_snapshot_current(snapshot, normalized_source):
        snapshot = build_docx_snapshot(normalized_source)
        snapshot_path.parent.mkdir(parents=True, exist_ok=True)
        snapshot_path.write_text(
            json.dumps(snapshot.to_dict(), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    snapshot_mtime_ns = snapshot_path.stat().st_mtime_ns if snapshot_path.exists() else 0
    should_refresh_extracted = (
        not extracted_path.exists()
        or extracted_path.stat().st_mtime_ns < snapshot_mtime_ns
    )
    if should_refresh_extracted:
        extracted_text = "\n\n".join(snapshot.editable_texts())
        extracted_path.parent.mkdir(parents=True, exist_ok=True)
        extracted_path.write_text(extracted_text, encoding="utf-8")
    return extracted_path, snapshot_path, snapshot


def rebuild_docx_from_snapshot(
    rewritten_paragraphs: Sequence[str],
    *,
    source_path: Path,
    snapshot_path: Path,
    export_path: Path,
) -> None:
    snapshot = _load_docx_snapshot(snapshot_path)
    if snapshot is None:
        raise ValueError(f"DOCX snapshot not found: {snapshot_path}")

    editable_units = snapshot.editable_units()
    if len(rewritten_paragraphs) != len(editable_units):
        raise ValueError(
            "Rewritten paragraph count does not match the DOCX editable unit count. "
            f"Expected {len(editable_units)}, got {len(rewritten_paragraphs)}."
        )

    document = Document(str(source_path.resolve()))
    for unit, rewritten_text in zip(editable_units, rewritten_paragraphs):
        paragraph = _resolve_target_paragraph(document, unit.target)
        _replace_paragraph_text(paragraph, rewritten_text)
        _polish_rewritten_paragraph(paragraph)

    export_path.parent.mkdir(parents=True, exist_ok=True)
    document.save(str(export_path))


def _split_text_into_blocks(text: str) -> list[str]:
    blocks: list[str] = []
    current: list[str] = []
    for raw_line in text.splitlines():
        line = raw_line.rstrip("\n")
        if not line.strip():
            if current:
                blocks.append(" ".join(current).strip())
                current = []
            continue
        current.append(line.strip())
    if current:
        blocks.append(" ".join(current).strip())
    return blocks


def _read_paragraphs_file(path: Path) -> list[str]:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list) or not all(isinstance(item, str) for item in data):
            raise SystemExit("Paragraph json must be a string array.")
        return data
    text = path.read_text(encoding="utf-8")
    return _split_text_into_blocks(text)


def _load_docx_snapshot(path: Path) -> DocxSnapshot | None:
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
    units: list[DocxTextUnit] = []
    for raw_unit in raw_units:
        if not isinstance(raw_unit, dict):
            continue
        units.append(
            DocxTextUnit(
                unit_index=int(raw_unit.get("unit_index", len(units))),
                target=dict(raw_unit.get("target", {})) if isinstance(raw_unit.get("target"), dict) else {},
                text=str(raw_unit.get("text", "")),
                style_name=str(raw_unit.get("style_name", "")),
                editable=bool(raw_unit.get("editable", True)),
                protect_reason=str(raw_unit.get("protect_reason")) if raw_unit.get("protect_reason") is not None else None,
                has_field_code=bool(raw_unit.get("has_field_code", False)),
                has_drawing=bool(raw_unit.get("has_drawing", False)),
            )
        )
    return DocxSnapshot(
        version=int(data.get("version", DOCX_SNAPSHOT_VERSION)),
        source_path=str(data.get("source_path", "")),
        source_size=int(data.get("source_size", 0)),
        source_mtime_ns=int(data.get("source_mtime_ns", 0)),
        editable_unit_count=int(data.get("editable_unit_count", sum(1 for unit in units if unit.editable))),
        total_text_unit_count=int(data.get("total_text_unit_count", len(units))),
        units=units,
    )


def _is_snapshot_current(snapshot: DocxSnapshot, source_path: Path) -> bool:
    try:
        stat = source_path.stat()
    except OSError:
        return False
    return (
        snapshot.version == DOCX_SNAPSHOT_VERSION
        and
        Path(snapshot.source_path).resolve() == source_path.resolve()
        and snapshot.source_size == stat.st_size
        and snapshot.source_mtime_ns == stat.st_mtime_ns
    )


def _collect_text_units(document: DocxDocument) -> list[DocxTextUnit]:
    units: list[DocxTextUnit] = []
    top_level_paragraph_index = 0

    for block in _iter_block_items(document):
        if isinstance(block, Paragraph):
            unit = _build_text_unit(
                block,
                {
                    "kind": "paragraph",
                    "paragraph_index": top_level_paragraph_index,
                },
                unit_index=len(units),
            )
            if unit is not None:
                units.append(unit)
            top_level_paragraph_index += 1

    return units


def _build_text_unit(paragraph: Paragraph, target: dict[str, Any], *, unit_index: int) -> DocxTextUnit | None:
    text = paragraph.text.strip()
    if not text:
        return None
    style_name = paragraph.style.name if paragraph.style is not None else ""
    return DocxTextUnit(
        unit_index=unit_index,
        target=target,
        text=text,
        style_name=style_name,
        editable=True,
        protect_reason=None,
        has_field_code=_paragraph_has_field_code(paragraph),
        has_drawing=_paragraph_has_drawing(paragraph),
    )


def _apply_protection_rules(units: list[DocxTextUnit]) -> None:
    if not units:
        return

    abstract_index = next(
        (index for index, unit in enumerate(units) if _normalize_marker_text(unit.text) in ABSTRACT_MARKERS),
        None,
    )
    first_body_index = next(
        (index for index, unit in enumerate(units) if _looks_like_body_start(unit.text, style_name=unit.style_name)),
        None,
    )
    start_index = abstract_index if abstract_index is not None else first_body_index
    if start_index is None:
        start_index = 0

    phase = "body"

    for index, unit in enumerate(units):
        protect_reason: str | None = None
        if unit.has_field_code or _looks_like_toc_heading(unit.text):
            protect_reason = "generated_field"
        elif index < start_index:
            protect_reason = "front_matter"
        elif _is_table_unit(unit):
            protect_reason = "table_content"
        elif unit.has_drawing:
            protect_reason = "graphic_anchor"
        elif _looks_like_formula_paragraph(unit.text, style_name=unit.style_name):
            protect_reason = "formula"
        elif _looks_like_references_heading(unit.text):
            phase = "references"
            protect_reason = "references"
        elif _looks_like_acknowledgement_heading(unit.text):
            phase = "acknowledgements"
            protect_reason = "heading"
        elif _looks_like_back_matter_heading(unit.text):
            phase = "back_matter"
            protect_reason = "back_matter"
        elif phase == "references":
            protect_reason = "references"
        elif phase == "back_matter":
            protect_reason = "back_matter"
        elif _looks_like_heading(unit.text, style_name=unit.style_name):
            protect_reason = "heading"
        elif _looks_like_caption(unit.text):
            protect_reason = "caption"
        elif _looks_like_keyword_line(unit.text):
            protect_reason = "structured_field"

        if protect_reason is not None:
            unit.editable = False
            unit.protect_reason = protect_reason


def _looks_like_body_start(text: str, *, style_name: str = "") -> bool:
    normalized = _normalize_marker_text(text)
    if normalized in ABSTRACT_MARKERS:
        return True
    if DATE_LINE_RE.match(normalized):
        return False
    if normalized in {"绪论", "引言", "前言"}:
        return True
    if normalized.startswith("第") and "章" in normalized:
        return True
    style_prefix = style_name.strip().lower()
    if style_prefix.startswith("heading") and BODY_START_RE.match(normalized):
        return True
    if BODY_START_RE.match(normalized):
        return True
    return False


def _looks_like_toc_heading(text: str) -> bool:
    return _normalize_marker_text(text) in TOC_MARKERS


def _looks_like_acknowledgement_heading(text: str) -> bool:
    return _normalize_marker_text(text) in ACKNOWLEDGEMENT_MARKERS


def _looks_like_references_heading(text: str) -> bool:
    return _normalize_marker_text(text) in REFERENCE_MARKERS


def _looks_like_back_matter_heading(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return (
        normalized in BACK_MATTER_MARKERS
        or normalized.startswith("附录")
        or normalized.startswith("appendix")
        or normalized.endswith("封底格式")
    )


def _looks_like_heading(text: str, *, style_name: str = "") -> bool:
    normalized = _normalize_marker_text(text)
    if not normalized or DATE_LINE_RE.match(normalized):
        return False
    if (
        normalized in ABSTRACT_MARKERS
        or normalized in ACKNOWLEDGEMENT_MARKERS
        or normalized in REFERENCE_MARKERS
        or _looks_like_back_matter_heading(text)
        or normalized in {"绪论", "引言", "前言", "结论", "结语", "总结", "总结与展望", "结论与展望"}
    ):
        return True

    style_prefix = _normalize_style_name(style_name)
    if style_prefix.startswith("heading") or style_prefix.startswith("标题"):
        return True

    if len(normalized) <= 48 and bool(HEADING_NUMBER_RE.match(normalized)):
        return True

    return _looks_like_short_unnumbered_heading(text)


def _looks_like_short_unnumbered_heading(text: str) -> bool:
    stripped = (text or "").strip()
    normalized = _normalize_marker_text(stripped)
    if not normalized or len(normalized) > 36:
        return False
    if any(mark in stripped for mark in "。！？；!?;"):
        return False
    if any(keyword in normalized for keyword in HEADING_KEYWORDS):
        return True
    if len(normalized) <= 14 and SHORT_HEADING_RE.match(stripped):
        return True
    return False


def _looks_like_caption(text: str) -> bool:
    return bool(CAPTION_RE.match(_normalize_marker_text(text)))


def _looks_like_keyword_line(text: str) -> bool:
    normalized = _normalize_marker_text(text)
    return any(normalized.startswith(prefix) for prefix in KEYWORD_PREFIXES)


def _looks_like_formula_paragraph(text: str, *, style_name: str = "") -> bool:
    stripped = (text or "").strip()
    if not stripped:
        return False

    normalized_style = _normalize_style_name(style_name)
    if any(hint in normalized_style for hint in FORMULA_STYLE_HINTS):
        return True

    if len(stripped) > 220:
        return False

    formula_symbol_count = len(FORMULA_SYMBOL_RE.findall(stripped))
    digit_count = len(DIGIT_CHAR_RE.findall(stripped))
    latin_count = len(LATIN_CHAR_RE.findall(stripped))
    has_formula_operator = any(symbol in stripped for symbol in ("=", "≈", "≤", "≥", "∑", "Σ", "√", "×", "÷"))
    has_formula_hint = any(keyword in stripped for keyword in ("计算方式", "计算公式", "公式如下", "定义如下"))

    if has_formula_operator and formula_symbol_count >= 2:
        return True
    if has_formula_hint and formula_symbol_count >= 1:
        return True
    if formula_symbol_count >= 4 and digit_count >= 1 and latin_count >= 1:
        return True
    return False


def _normalize_marker_text(text: str) -> str:
    return re.sub(r"\s+", "", text or "").casefold()


def _normalize_style_name(style_name: str) -> str:
    return re.sub(r"\s+", "", style_name or "").casefold()


def _is_table_unit(unit: DocxTextUnit) -> bool:
    return str(unit.target.get("kind", "")) == "table_cell_paragraph"


def _paragraph_has_field_code(paragraph: Paragraph) -> bool:
    return bool(paragraph._element.xpath(".//w:fldChar | .//w:instrText"))


def _paragraph_has_drawing(paragraph: Paragraph) -> bool:
    return bool(paragraph._element.xpath(".//w:drawing"))


def _iter_block_items(parent: DocxDocument | _Cell) -> Iterator[Paragraph | Table]:
    if isinstance(parent, DocxDocument):
        parent_elm = parent.element.body
    elif isinstance(parent, _Cell):
        parent_elm = parent._tc
    else:  # pragma: no cover - internal contract
        raise TypeError(f"Unsupported parent type: {type(parent)}")

    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield Table(child, parent)


def _resolve_target_paragraph(document: DocxDocument, target: dict[str, Any]) -> Paragraph:
    target_kind = str(target.get("kind", ""))
    if target_kind == "paragraph":
        paragraph_index = int(target["paragraph_index"])
        return document.paragraphs[paragraph_index]

    if target_kind == "table_cell_paragraph":
        table = document.tables[int(target["table_index"])]
        cell = table.rows[int(target["row_index"])].cells[int(target["cell_index"])]
        return cell.paragraphs[int(target["paragraph_index"])]

    raise ValueError(f"Unsupported DOCX target kind: {target_kind}")


def _snap_split_index(text: str, raw_index: int, lower_bound: int, upper_bound: int) -> int:
    if raw_index <= lower_bound:
        return lower_bound
    if raw_index >= upper_bound:
        return upper_bound

    preferred_boundaries = set(" \t\n,.;:!?)]}，。；：！？）】、")
    search_start = max(lower_bound, raw_index - 12)
    search_end = min(upper_bound, raw_index + 12)
    best_index = raw_index
    best_distance = None

    for index in range(search_start, search_end + 1):
        left_char = text[index - 1] if index > 0 else ""
        right_char = text[index] if index < len(text) else ""
        if left_char not in preferred_boundaries and right_char not in preferred_boundaries:
            continue
        distance = abs(index - raw_index)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            best_index = index
            if distance == 0:
                break

    return max(lower_bound, min(best_index, upper_bound))


def _split_text_for_runs(text: str, run_texts: list[str]) -> list[str]:
    if not run_texts:
        return []
    if len(run_texts) == 1:
        return [text]

    total_weight = sum(max(len(run_text), 1) for run_text in run_texts)
    splits: list[int] = []
    previous_index = 0
    consumed_weight = 0

    for run_text in run_texts[:-1]:
        consumed_weight += max(len(run_text), 1)
        raw_index = round(len(text) * consumed_weight / total_weight)
        split_index = _snap_split_index(text, raw_index, previous_index, len(text))
        splits.append(split_index)
        previous_index = split_index

    parts: list[str] = []
    start = 0
    for split_index in splits:
        parts.append(text[start:split_index])
        start = split_index
    parts.append(text[start:])
    return parts


def _replace_paragraph_text(paragraph: Paragraph, text: str) -> None:
    text_runs = [run for run in paragraph.runs if run.text]
    if not text_runs:
        if text.strip():
            paragraph.add_run(text)
        return

    split_parts = _split_text_for_runs(text, [run.text for run in text_runs])
    for run, part in zip(text_runs, split_parts):
        run.text = part


def _apply_default_document_layout(document: DocxDocument) -> None:
    for section in document.sections:
        for attribute, value_cm in DEFAULT_PAGE_MARGINS_CM.items():
            setattr(section, attribute, Cm(value_cm))

    styles = document.styles
    normal_style = styles["Normal"]
    normal_style.font.name = DEFAULT_EN_FONT
    normal_style.font.size = Pt(DEFAULT_BODY_FONT_SIZE_PT)
    _set_run_fonts(normal_style._element.get_or_add_rPr(), cn_font=DEFAULT_CN_FONT, en_font=DEFAULT_EN_FONT)


def _apply_default_paragraph_layout(paragraph: Paragraph) -> None:
    paragraph.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    paragraph_format = paragraph.paragraph_format
    paragraph_format.first_line_indent = Cm(DEFAULT_BODY_FIRST_LINE_INDENT_CM)
    paragraph_format.space_before = Pt(0)
    paragraph_format.space_after = Pt(0)
    paragraph_format.line_spacing_rule = WD_LINE_SPACING.EXACTLY
    paragraph_format.line_spacing = Pt(DEFAULT_BODY_LINE_SPACING_PT)
    for run in paragraph.runs:
        _apply_default_run_layout(run)


def _polish_rewritten_paragraph(paragraph: Paragraph) -> None:
    for run in paragraph.runs:
        if run.text:
            run.text = _normalize_rewritten_text(run.text)
            _ensure_run_font_layout(run)


def _normalize_rewritten_text(text: str) -> str:
    normalized = text.replace("\u00a0", " ").replace("\u3000", " ")
    normalized = re.sub(r"[ \t]+", " ", normalized)
    normalized = re.sub(r"\s+([，。；：！？、,.!?;:])", r"\1", normalized)
    normalized = re.sub(r"([（【《])\s+", r"\1", normalized)
    normalized = re.sub(r"\s+([）】》])", r"\1", normalized)
    return normalized.strip()


def _ensure_run_font_layout(run: Any) -> None:
    if run.font.size is None:
        run.font.size = Pt(DEFAULT_BODY_FONT_SIZE_PT)
    if not str(run.font.name or "").strip():
        run.font.name = DEFAULT_EN_FONT
    _set_run_fonts(run._element.get_or_add_rPr(), cn_font=DEFAULT_CN_FONT, en_font=DEFAULT_EN_FONT, preserve_existing=True)


def _apply_default_run_layout(run: Any) -> None:
    run.font.name = DEFAULT_EN_FONT
    run.font.size = Pt(DEFAULT_BODY_FONT_SIZE_PT)
    _set_run_fonts(run._element.get_or_add_rPr(), cn_font=DEFAULT_CN_FONT, en_font=DEFAULT_EN_FONT)


def _set_run_fonts(r_pr: Any, *, cn_font: str, en_font: str, preserve_existing: bool = False) -> None:
    r_fonts = r_pr.rFonts
    if r_fonts is None:
        r_fonts = OxmlElement("w:rFonts")
        r_pr.insert(0, r_fonts)
    font_values = {
        "eastAsia": cn_font,
        "ascii": en_font,
        "hAnsi": en_font,
        "cs": en_font,
    }
    for key, value in font_values.items():
        attribute = qn(f"w:{key}")
        if preserve_existing and str(r_fonts.get(attribute) or "").strip():
            continue
        r_fonts.set(attribute, value)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="DOCX <-> text helper with layout-preserving roundtrip support")
    subparsers = parser.add_subparsers(dest="command", required=True)

    extract_parser = subparsers.add_parser(
        "extract", help="Extract editable plain text from a .docx file",
    )
    extract_parser.add_argument("input", type=Path, help="Path to input .docx file")

    extract_to_file_parser = subparsers.add_parser(
        "extract-to-file", help="Extract editable plain text from a .docx file into a UTF-8 text file",
    )
    extract_to_file_parser.add_argument("input", type=Path, help="Path to input .docx file")
    extract_to_file_parser.add_argument("output", type=Path, help="Path to output .txt file")
    extract_to_file_parser.add_argument("--snapshot-output", type=Path, default=None, help="Optional output path for the snapshot json.")

    extract_paragraphs_parser = subparsers.add_parser(
        "extract-paragraphs",
        help="Extract editable text blocks from a .docx file into a JSON array",
    )
    extract_paragraphs_parser.add_argument("input", type=Path, help="Path to input .docx file")
    extract_paragraphs_parser.add_argument("output", type=Path, help="Path to output .json file")

    build_parser = subparsers.add_parser(
        "build", help="Build a brand-new .docx file from a plain text file",
    )
    build_parser.add_argument("input", type=Path, help="Path to input .txt file")
    build_parser.add_argument("output", type=Path, help="Path to output .docx file")

    build_paragraphs_parser = subparsers.add_parser(
        "build-paragraphs",
        help="Build a brand-new .docx file from a paragraph JSON array or block text file",
    )
    build_paragraphs_parser.add_argument("input", type=Path, help="Path to paragraph json/txt file")
    build_paragraphs_parser.add_argument("output", type=Path, help="Path to output .docx file")

    roundtrip_build_parser = subparsers.add_parser(
        "build-from-source",
        help="Write rewritten text back onto the original DOCX layout",
    )
    roundtrip_build_parser.add_argument("source_docx", type=Path, help="Path to original .docx file")
    roundtrip_build_parser.add_argument("input", type=Path, help="Path to rewritten .txt file")
    roundtrip_build_parser.add_argument("output", type=Path, help="Path to output .docx file")
    roundtrip_build_parser.add_argument("--snapshot", type=Path, default=None, help="Optional snapshot json path.")

    args = parser.parse_args(argv)

    if args.command == "extract":
        text = read_docx_text(args.input)
        print(text)
    elif args.command == "extract-to-file":
        extracted_path, snapshot_path, _ = ensure_docx_processing_assets(
            args.input,
            extracted_path=args.output,
            snapshot_path=args.snapshot_output,
        )
        if extracted_path != args.output:
            args.output.write_text(extracted_path.read_text(encoding="utf-8"), encoding="utf-8")
        if args.snapshot_output is not None and snapshot_path != args.snapshot_output:
            args.snapshot_output.write_text(snapshot_path.read_text(encoding="utf-8"), encoding="utf-8")
    elif args.command == "extract-paragraphs":
        paragraphs = read_docx_paragraphs(args.input)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(paragraphs, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    elif args.command == "build":
        text = args.input.read_text(encoding="utf-8")
        blocks = _split_text_into_blocks(text)
        write_docx_text(blocks, args.output)
    elif args.command == "build-paragraphs":
        paragraphs = _read_paragraphs_file(args.input)
        write_docx_paragraphs(paragraphs, args.output)
    elif args.command == "build-from-source":
        snapshot_path = args.snapshot or get_docx_snapshot_path(args.source_docx.resolve())
        if not snapshot_path.exists():
            ensure_docx_processing_assets(args.source_docx, snapshot_path=snapshot_path)
        text = args.input.read_text(encoding="utf-8")
        rebuild_docx_from_snapshot(
            _split_text_into_blocks(text),
            source_path=args.source_docx,
            snapshot_path=snapshot_path,
            export_path=args.output,
        )
    else:  # pragma: no cover - argparse guarantees command
        parser.error("Unknown command")


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    main()
