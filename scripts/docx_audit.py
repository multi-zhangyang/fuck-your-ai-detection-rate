from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from docx import Document  # type: ignore[import]

from docx_pipeline import _load_docx_snapshot, _resolve_target_paragraph


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


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Audit exported DOCX against original protected regions")
    parser.add_argument("source", type=Path)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("export", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args(argv)
    print(
        json.dumps(
            audit_docx_export(
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
