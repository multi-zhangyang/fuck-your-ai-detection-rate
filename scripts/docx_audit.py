from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any
import xml.etree.ElementTree as ET
import zipfile

from docx import Document  # type: ignore[import]

from docx_pipeline import _load_docx_snapshot, _resolve_target_paragraph


W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
W = f"{{{W_NS}}}"
EXACT_PART_NAMES = {
    "word/fontTable.xml",
    "word/webSettings.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
}
EXACT_PART_PREFIXES = (
    "word/media/",
    "word/embeddings/",
    "word/charts/",
    "word/diagrams/",
    "word/theme/",
)


def audit_docx_export(
    export_path: Path,
    *,
    source_path: Path,
    snapshot_path: Path,
    report_path: Path | None = None,
) -> dict[str, Any]:
    snapshot = _load_docx_snapshot(snapshot_path)
    if snapshot is None:
        raise ValueError(f"DOCX snapshot not found: {snapshot_path}")

    source_document = Document(str(source_path.resolve()))
    export_document = Document(str(export_path.resolve()))
    issues: list[dict[str, Any]] = []
    protected_checked = 0
    editable_checked = 0
    table_checked = 0

    for unit in snapshot.units:
        expected_text = _read_target_text(source_document, unit.target)
        actual_text = _read_target_text(export_document, unit.target)
        target_kind = str(unit.target.get("kind", ""))
        if target_kind == "table_cell_paragraph":
            table_checked += 1
        if unit.editable:
            editable_checked += 1
            continue
        protected_checked += 1
        if actual_text != expected_text:
            issues.append(
                {
                    "type": "protected_text_changed",
                    "unitIndex": unit.unit_index,
                    "target": unit.target,
                    "protectReason": unit.protect_reason,
                    "expected": expected_text,
                    "actual": actual_text,
                }
            )

    table_structure_issues = _audit_table_structure(source_document, export_document)
    issues.extend(table_structure_issues)

    report = {
        "ok": not issues,
        "sourcePath": str(source_path.resolve()),
        "exportPath": str(export_path.resolve()),
        "snapshotPath": str(snapshot_path.resolve()),
        "protectedChecked": protected_checked,
        "editableChecked": editable_checked,
        "tableParagraphChecked": table_checked,
        "issueCount": len(issues),
        "issues": issues[:50],
        "truncatedIssues": max(0, len(issues) - 50),
    }
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        report["reportPath"] = str(report_path.resolve())
    return report


def get_docx_audit_report_path(export_path: Path) -> Path:
    return export_path.with_suffix(".audit.json")


def get_docx_ooxml_audit_report_path(export_path: Path) -> Path:
    return export_path.with_suffix(".ooxml_audit.json")


def audit_docx_ooxml_integrity(
    export_path: Path,
    *,
    source_path: Path,
    snapshot_path: Path,
    report_path: Path | None = None,
) -> dict[str, Any]:
    snapshot = _load_docx_snapshot(snapshot_path)
    if snapshot is None:
        raise ValueError(f"DOCX snapshot not found: {snapshot_path}")

    source_parts = _read_docx_parts(source_path)
    export_parts = _read_docx_parts(export_path)
    issues: list[dict[str, Any]] = []

    if "word/document.xml" not in source_parts or "word/document.xml" not in export_parts:
        issues.append({"type": "document_xml_missing"})
    else:
        issues.extend(_audit_document_xml(source_parts["word/document.xml"], export_parts["word/document.xml"], snapshot))

    issues.extend(_audit_exact_parts(source_parts, export_parts))
    issues.extend(_audit_header_footer_parts(source_parts, export_parts))
    issues.extend(_audit_styles_part(source_parts, export_parts))
    issues.extend(_audit_numbering_part(source_parts, export_parts))
    issues.extend(_audit_settings_part(source_parts, export_parts))

    report = {
        "ok": not issues,
        "sourcePath": str(source_path.resolve()),
        "exportPath": str(export_path.resolve()),
        "snapshotPath": str(snapshot_path.resolve()),
        "issueCount": len(issues),
        "issues": issues[:50],
        "truncatedIssues": max(0, len(issues) - 50),
        "checkedParts": len(source_parts),
    }
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        report["reportPath"] = str(report_path.resolve())
    return report


def _read_target_text(document: Any, target: dict[str, Any]) -> str:
    return _resolve_target_paragraph(document, target).text


def _audit_table_structure(source_document: Any, export_document: Any) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    if len(source_document.tables) != len(export_document.tables):
        issues.append(
            {
                "type": "table_count_changed",
                "expected": len(source_document.tables),
                "actual": len(export_document.tables),
            }
        )
        return issues

    for table_index, source_table in enumerate(source_document.tables):
        export_table = export_document.tables[table_index]
        if len(source_table.rows) != len(export_table.rows):
            issues.append(
                {
                    "type": "table_row_count_changed",
                    "tableIndex": table_index,
                    "expected": len(source_table.rows),
                    "actual": len(export_table.rows),
                }
            )
            continue
        for row_index, source_row in enumerate(source_table.rows):
            export_row = export_table.rows[row_index]
            if len(source_row.cells) != len(export_row.cells):
                issues.append(
                    {
                        "type": "table_cell_count_changed",
                        "tableIndex": table_index,
                        "rowIndex": row_index,
                        "expected": len(source_row.cells),
                        "actual": len(export_row.cells),
                    }
                )
                continue
            for cell_index, source_cell in enumerate(source_row.cells):
                export_cell = export_row.cells[cell_index]
                source_text = "\n".join(paragraph.text for paragraph in source_cell.paragraphs)
                export_text = "\n".join(paragraph.text for paragraph in export_cell.paragraphs)
                if source_text != export_text:
                    issues.append(
                        {
                            "type": "table_text_changed",
                            "tableIndex": table_index,
                            "rowIndex": row_index,
                            "cellIndex": cell_index,
                            "expected": source_text,
                            "actual": export_text,
                        }
                    )
    return issues


def _read_docx_parts(path: Path) -> dict[str, bytes]:
    with zipfile.ZipFile(str(path.resolve()), "r") as archive:
        return {
            item.filename: archive.read(item.filename)
            for item in archive.infolist()
            if not item.is_dir()
        }


def _audit_exact_parts(source_parts: dict[str, bytes], export_parts: dict[str, bytes]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    source_critical = {name for name in source_parts if _is_exact_part(name)}
    export_critical = {name for name in export_parts if _is_exact_part(name)}
    for name in sorted(source_critical - export_critical):
        issues.append({"type": "ooxml_part_missing", "part": name})
    for name in sorted(export_critical - source_critical):
        issues.append({"type": "ooxml_part_added", "part": name})
    for name in sorted(source_critical & export_critical):
        source_hash = hashlib.sha256(source_parts[name]).hexdigest()
        export_hash = hashlib.sha256(export_parts[name]).hexdigest()
        if source_hash != export_hash:
            issues.append(
                {
                    "type": "ooxml_part_changed",
                    "part": name,
                    "sourceHash": source_hash,
                    "exportHash": export_hash,
                }
            )
    return issues


def _is_exact_part(name: str) -> bool:
    return name in EXACT_PART_NAMES or any(name.startswith(prefix) for prefix in EXACT_PART_PREFIXES)


def _audit_header_footer_parts(source_parts: dict[str, bytes], export_parts: dict[str, bytes]) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    source_names = _part_names_with_prefixes(source_parts, ("word/header", "word/footer"))
    export_names = _part_names_with_prefixes(export_parts, ("word/header", "word/footer"))
    for name in sorted(source_names - export_names):
        issues.append({"type": "header_footer_part_missing", "part": name})
    for name in sorted(export_names - source_names):
        issues.append({"type": "header_footer_part_added", "part": name})
    for name in sorted(source_names & export_names):
        source_signature = _header_footer_signature(source_parts[name])
        export_signature = _header_footer_signature(export_parts[name])
        if source_signature != export_signature:
            issues.append(
                {
                    "type": "header_footer_semantics_changed",
                    "part": name,
                    "expected": source_signature,
                    "actual": export_signature,
                }
            )
    return issues


def _audit_styles_part(source_parts: dict[str, bytes], export_parts: dict[str, bytes]) -> list[dict[str, Any]]:
    return _audit_optional_xml_signature(
        source_parts,
        export_parts,
        "word/styles.xml",
        "styles_identity_changed",
        _styles_signature,
    )


def _audit_numbering_part(source_parts: dict[str, bytes], export_parts: dict[str, bytes]) -> list[dict[str, Any]]:
    return _audit_optional_xml_signature(
        source_parts,
        export_parts,
        "word/numbering.xml",
        "numbering_identity_changed",
        _numbering_signature,
    )


def _audit_settings_part(source_parts: dict[str, bytes], export_parts: dict[str, bytes]) -> list[dict[str, Any]]:
    return _audit_optional_xml_signature(
        source_parts,
        export_parts,
        "word/settings.xml",
        "settings_identity_changed",
        _settings_signature,
    )


def _audit_optional_xml_signature(
    source_parts: dict[str, bytes],
    export_parts: dict[str, bytes],
    name: str,
    issue_type: str,
    signature_fn: Any,
) -> list[dict[str, Any]]:
    if name not in source_parts and name not in export_parts:
        return []
    if name not in source_parts:
        return [{"type": "ooxml_part_added", "part": name}]
    if name not in export_parts:
        return [{"type": "ooxml_part_missing", "part": name}]
    source_signature = signature_fn(source_parts[name])
    export_signature = signature_fn(export_parts[name])
    if source_signature == export_signature:
        return []
    return [
        {
            "type": issue_type,
            "part": name,
            "expected": source_signature,
            "actual": export_signature,
        }
    ]


def _part_names_with_prefixes(parts: dict[str, bytes], prefixes: tuple[str, ...]) -> set[str]:
    return {name for name in parts if any(name.startswith(prefix) and name.endswith(".xml") for prefix in prefixes)}


def _header_footer_signature(xml: bytes) -> dict[str, Any]:
    root = ET.fromstring(xml)
    return {
        "text": _element_text(root),
        "fieldCount": len(root.findall(f".//{W}fldChar")),
        "instrText": sorted(" ".join(str(node.text or "").split()) for node in root.findall(f".//{W}instrText")),
        "drawingCount": len(root.findall(f".//{W}drawing")),
        "pictCount": len(root.findall(f".//{W}pict")),
        "tableSignatures": [_table_signature(table) for table in root.findall(f".//{W}tbl")],
    }


def _styles_signature(xml: bytes) -> dict[str, Any]:
    root = ET.fromstring(xml)
    styles: list[tuple[str, str, str, str]] = []
    for style in root.findall(f"{W}style"):
        styles.append(
            (
                _attr(style, "styleId"),
                _attr(style, "type"),
                _attr(style, "default"),
                _child_attr(style, "name", "val"),
            )
        )
    return {"styles": sorted(styles)}


def _numbering_signature(xml: bytes) -> dict[str, Any]:
    root = ET.fromstring(xml)
    abstract_numbers: list[dict[str, Any]] = []
    for abstract in root.findall(f"{W}abstractNum"):
        levels: list[tuple[str, str, str, str]] = []
        for level in abstract.findall(f"{W}lvl"):
            levels.append(
                (
                    _attr(level, "ilvl"),
                    _child_attr(level, "numFmt", "val"),
                    _child_attr(level, "lvlText", "val"),
                    _child_attr(level, "pStyle", "val"),
                )
            )
        abstract_numbers.append({"id": _attr(abstract, "abstractNumId"), "levels": sorted(levels)})
    nums: list[tuple[str, str]] = []
    for num in root.findall(f"{W}num"):
        nums.append((_attr(num, "numId"), _child_attr(num, "abstractNumId", "val")))
    return {"abstractNums": sorted(abstract_numbers, key=lambda item: str(item.get("id", ""))), "nums": sorted(nums)}


def _settings_signature(xml: bytes) -> dict[str, Any]:
    root = ET.fromstring(xml)
    return {
        "footnotePr": _xml_child_names(root.find(f"{W}footnotePr")),
        "endnotePr": _xml_child_names(root.find(f"{W}endnotePr")),
        "docGrid": _element_attrs(root.find(f"{W}docGrid")),
        "defaultTabStop": _element_attrs(root.find(f"{W}defaultTabStop")),
        "evenAndOddHeaders": root.find(f"{W}evenAndOddHeaders") is not None,
        "mirrorMargins": root.find(f"{W}mirrorMargins") is not None,
    }


def _xml_child_names(element: ET.Element | None) -> list[str]:
    if element is None:
        return []
    return [_local_name(child.tag) for child in list(element)]


def _element_attrs(element: ET.Element | None) -> dict[str, str]:
    if element is None:
        return {}
    return {_local_name(key): value for key, value in sorted(element.attrib.items())}


def _child_attr(element: ET.Element, child_name: str, attr_name: str) -> str:
    child = element.find(f"{W}{child_name}")
    return _attr(child, attr_name) if child is not None else ""


def _attr(element: ET.Element | None, name: str) -> str:
    if element is None:
        return ""
    return str(element.attrib.get(f"{W}{name}", ""))


def _audit_document_xml(source_xml: bytes, export_xml: bytes, snapshot: Any) -> list[dict[str, Any]]:
    source_root = ET.fromstring(source_xml)
    export_root = ET.fromstring(export_xml)
    source_body = source_root.find(f"{W}body")
    export_body = export_root.find(f"{W}body")
    issues: list[dict[str, Any]] = []
    if source_body is None or export_body is None:
        return [{"type": "document_body_missing"}]

    source_blocks = [_local_name(child.tag) for child in list(source_body)]
    export_blocks = [_local_name(child.tag) for child in list(export_body)]
    if source_blocks != export_blocks:
        issues.append(
            {
                "type": "body_block_sequence_changed",
                "expected": source_blocks[:80],
                "actual": export_blocks[:80],
            }
        )

    editable_paragraph_indexes = {
        int(unit.target.get("paragraph_index"))
        for unit in snapshot.units
        if bool(getattr(unit, "editable", False))
        and isinstance(getattr(unit, "target", None), dict)
        and str(unit.target.get("kind", "")) == "paragraph"
    }
    source_paragraphs = [child for child in list(source_body) if child.tag == f"{W}p"]
    export_paragraphs = [child for child in list(export_body) if child.tag == f"{W}p"]
    if len(source_paragraphs) != len(export_paragraphs):
        issues.append({"type": "paragraph_count_changed", "expected": len(source_paragraphs), "actual": len(export_paragraphs)})
    for index, (source_paragraph, export_paragraph) in enumerate(zip(source_paragraphs, export_paragraphs)):
        source_text = _element_text(source_paragraph)
        export_text = _element_text(export_paragraph)
        if index not in editable_paragraph_indexes and source_text != export_text:
            issues.append(
                {
                    "type": "protected_paragraph_text_changed",
                    "paragraphIndex": index,
                    "expected": _sample(source_text),
                    "actual": _sample(export_text),
                }
            )
        source_signature = _paragraph_nontext_signature(source_paragraph)
        export_signature = _paragraph_nontext_signature(export_paragraph)
        if source_signature != export_signature and index not in editable_paragraph_indexes:
            issues.append(
                {
                    "type": "protected_paragraph_structure_changed",
                    "paragraphIndex": index,
                    "expected": source_signature,
                    "actual": export_signature,
                }
            )

    source_tables = [child for child in list(source_body) if child.tag == f"{W}tbl"]
    export_tables = [child for child in list(export_body) if child.tag == f"{W}tbl"]
    if len(source_tables) != len(export_tables):
        issues.append({"type": "table_count_changed", "expected": len(source_tables), "actual": len(export_tables)})
    for index, (source_table, export_table) in enumerate(zip(source_tables, export_tables)):
        source_signature = _table_signature(source_table)
        export_signature = _table_signature(export_table)
        if source_signature != export_signature:
            issues.append(
                {
                    "type": "table_structure_or_text_changed",
                    "tableIndex": index,
                    "expected": source_signature,
                    "actual": export_signature,
                }
            )

    for code, tag in (("field_code_count_changed", "fldChar"), ("field_instr_count_changed", "instrText"), ("drawing_count_changed", "drawing")):
        source_count = len(source_root.findall(f".//{W}{tag}"))
        export_count = len(export_root.findall(f".//{W}{tag}"))
        if source_count != export_count:
            issues.append({"type": code, "expected": source_count, "actual": export_count})
    return issues


def _paragraph_nontext_signature(paragraph: ET.Element) -> dict[str, Any]:
    return {
        "fieldCount": len(paragraph.findall(f".//{W}fldChar")),
        "instrCount": len(paragraph.findall(f".//{W}instrText")),
        "drawingCount": len(paragraph.findall(f".//{W}drawing")),
        "pictCount": len(paragraph.findall(f".//{W}pict")),
        "bookmarkStartCount": len(paragraph.findall(f".//{W}bookmarkStart")),
        "bookmarkEndCount": len(paragraph.findall(f".//{W}bookmarkEnd")),
    }


def _table_signature(table: ET.Element) -> dict[str, Any]:
    rows: list[list[list[str]]] = []
    for row in table.findall(f"{W}tr"):
        row_cells: list[list[str]] = []
        for cell in row.findall(f"{W}tc"):
            row_cells.append([_element_text(paragraph) for paragraph in cell.findall(f"{W}p")])
        rows.append(row_cells)
    return {
        "rowCount": len(rows),
        "cellCounts": [len(row) for row in rows],
        "text": rows,
    }


def _element_text(element: ET.Element) -> str:
    return "".join(node.text or "" for node in element.iter(f"{W}t"))


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _sample(text: str, limit: int = 160) -> str:
    compact = " ".join(str(text or "").split())
    return compact[:limit] + ("..." if len(compact) > limit else "")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Audit exported DOCX against original protected regions")
    parser.add_argument("source", type=Path)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("export", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--ooxml", action="store_true")
    args = parser.parse_args(argv)
    audit_fn = audit_docx_ooxml_integrity if args.ooxml else audit_docx_export
    print(
        json.dumps(
            audit_fn(
                args.export,
                source_path=args.source,
                snapshot_path=args.snapshot,
                report_path=args.report,
            ),
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
