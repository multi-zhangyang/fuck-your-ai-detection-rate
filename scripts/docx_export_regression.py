from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from docx import Document  # type: ignore[import]
    from docx.enum.section import WD_SECTION  # type: ignore[import]
    from docx.enum.text import WD_ALIGN_PARAGRAPH  # type: ignore[import]
    from docx.shared import Cm, Pt  # type: ignore[import]
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Missing dependency python-docx. Install it with: pip install python-docx") from exc

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from app_service import export_round_output  # noqa: E402
from format_rules import ACTIVE_RULES_PATH, extract_deterministic_format_rules, merge_deterministic_rules, save_active_format_rules  # noqa: E402
from docx_audit import audit_docx_export, get_docx_audit_report_path  # noqa: E402
from docx_bodymap import load_docx_body_map  # noqa: E402
from docx_pipeline import _load_docx_snapshot, get_docx_snapshot_path  # noqa: E402
from round_helper import run_document_round  # noqa: E402

REGRESSION_DIR = ROOT_DIR / "finish" / "regression"
DEFAULT_SAMPLE_PATH = REGRESSION_DIR / "fyadr_regression_sample.docx"
DEFAULT_EXPORT_PATH = REGRESSION_DIR / "fyadr_regression_export.docx"
DEFAULT_REPORT_PATH = REGRESSION_DIR / "fyadr_regression_report.json"
DEFAULT_SCHOOL_SPEC_PATH = ROOT_DIR / "references" / "school_format_instruction.md"


def zh(*codes: int) -> str:
    return "".join(chr(code) for code in codes)


def _set_paragraph_font(paragraph: Any, *, size_pt: int = 12, bold: bool | None = None) -> None:
    for run in paragraph.runs:
        run.font.name = "Times New Roman"
        run.font.size = Pt(size_pt)
        if bold is not None:
            run.bold = bold
        run._element.rPr.rFonts.set(qn("w:eastAsia"), zh(0x5b8b, 0x4f53))


try:
    from docx.oxml.ns import qn  # type: ignore[import]
except ImportError:  # pragma: no cover
    qn = None  # type: ignore[assignment]


def add_paragraph(document: Any, text: str, *, style: str | None = None, align: int | None = None, size_pt: int = 12, bold: bool | None = None) -> Any:
    paragraph = document.add_paragraph(text, style=style) if style else document.add_paragraph(text)
    if align is not None:
        paragraph.alignment = align
    _set_paragraph_font(paragraph, size_pt=size_pt, bold=bold)
    return paragraph


def create_regression_sample(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = Document()
    section = document.sections[0]
    section.top_margin = Cm(2.5)
    section.bottom_margin = Cm(2.5)
    section.left_margin = Cm(3)
    section.right_margin = Cm(3)

    add_paragraph(document, zh(0x57fa, 0x4e8e, 0x56fe, 0x50cf, 0x5206, 0x5272, 0x7684, 0x5178, 0x578b, 0x70df, 0x53f6, 0x75c5, 0x866b, 0x5bb3, 0x76ee, 0x6807, 0x68c0, 0x6d4b, 0x7b97, 0x6cd5), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=18, bold=True)
    add_paragraph(document, "Typical Tobacco Disease and Pest Detection Based on Image Segmentation", align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=18, bold=True)
    add_paragraph(document, zh(0x5b66, 0x751f, 0x59d3, 0x540d, 0xff1a, 0x5f20, 0x4e09), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=15)
    add_paragraph(document, zh(0x4e8c, 0x25cb, 0x4e8c, 0x516d, 0x5e74, 0x56db, 0x6708), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=15)

    document.add_page_break()
    add_paragraph(document, zh(0x76ee, 0x20, 0x20, 0x5f55), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=16, bold=True)
    add_paragraph(document, zh(0x6458, 0x8981) + " ................................................................ I")
    add_paragraph(document, "1 " + zh(0x5f15, 0x8a00) + " .............................................................. 1")
    add_paragraph(document, zh(0x53c2, 0x8003, 0x6587, 0x732e) + " ...................................................... 8")

    document.add_page_break()
    add_paragraph(document, zh(0x6458, 0x20, 0x20, 0x8981), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=16, bold=True)
    add_paragraph(document, zh(0x672c, 0x6587, 0x56f4, 0x7ed5, 0x70df, 0x53f6, 0x75c5, 0x866b, 0x5bb3, 0x56fe, 0x50cf, 0x68c0, 0x6d4b, 0x4efb, 0x52a1, 0x5c55, 0x5f00, 0xff0c, 0x901a, 0x8fc7, 0x5206, 0x5272, 0x7ed3, 0x679c, 0x4e0e, 0x76ee, 0x6807, 0x68c0, 0x6d4b, 0x6a21, 0x578b, 0x8fdb, 0x884c, 0x7ed3, 0x5408, 0xff0c, 0x63d0, 0x9ad8, 0x7530, 0x95f4, 0x8bc6, 0x522b, 0x6548, 0x7387, 0x3002))
    add_paragraph(document, zh(0x5173, 0x952e, 0x8bcd, 0xff1a, 0x56fe, 0x50cf, 0x5206, 0x5272, 0xff1b, 0x75c5, 0x866b, 0x5bb3, 0x68c0, 0x6d4b, 0xff1b, 0x6df1, 0x5ea6, 0x5b66, 0x4e60))
    add_paragraph(document, "Abstract", align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=16, bold=True)
    add_paragraph(document, "This paper studies a detection workflow for tobacco diseases and pests, combining segmentation outputs with a lightweight detector to improve field recognition robustness.")
    add_paragraph(document, "Key words: image segmentation; pest detection; deep learning")

    add_paragraph(document, zh(0x5f15, 0x8a00), style="Heading 1")
    add_paragraph(document, zh(0x70df, 0x53f6, 0x75c5, 0x866b, 0x5bb3, 0x7684, 0x65e9, 0x671f, 0x8bc6, 0x522b, 0x5bf9, 0x751f, 0x4ea7, 0x7ba1, 0x7406, 0x5177, 0x6709, 0x76f4, 0x63a5, 0x4ef7, 0x503c, 0x3002) + zh(0x76f8, 0x5173, 0x7814, 0x7a76) + zh(0xff08, 0x90ed, 0x6c34, 0x826f, 0xff0c) + "1999" + zh(0xff1b, 0x94b1, 0x5b8f, 0xff0c) + "1990" + zh(0xff09, 0x8868, 0x660e, 0xff0c, 0x5408, 0x7406, 0x7684, 0x56fe, 0x50cf, 0x9884, 0x5904, 0x7406, 0x80fd, 0x591f, 0x964d, 0x4f4e, 0x8bef, 0x68c0, 0x7387, 0x3002))
    add_paragraph(document, "1 " + zh(0x6570, 0x636e, 0x4e0e, 0x65b9, 0x6cd5), style="Heading 1")
    add_paragraph(document, zh(0x672c, 0x7814, 0x7a76, 0x91c7, 0x7528) + "YOLOv8" + zh(0x4f5c, 0x4e3a, 0x57fa, 0x7840, 0x6a21, 0x578b, 0xff0c, 0x8bad, 0x7ec3, 0x56fe, 0x50cf, 0x5c3a, 0x5bf8, 0x63a7, 0x5236, 0x5728) + "640px" + zh(0xff0c, 0x5b66, 0x4e60, 0x7387, 0x8303, 0x56f4, 0x4e3a) + "0.001?0.01" + zh(0x3002))
    add_paragraph(document, zh(0x56fe, 0x20) + "1 " + zh(0x70df, 0x53f6, 0x75c5, 0x6591, 0x533a, 0x57df, 0x793a, 0x610f), align=WD_ALIGN_PARAGRAPH.CENTER, bold=True)
    add_paragraph(document, zh(0x8868, 0x20) + "1 " + zh(0x5b9e, 0x9a8c, 0x7ed3, 0x679c, 0x5bf9, 0x6bd4), align=WD_ALIGN_PARAGRAPH.CENTER, bold=True)
    table = document.add_table(rows=3, cols=3)
    table.style = "Table Grid"
    table.cell(0, 0).text = zh(0x6a21, 0x578b)
    table.cell(0, 1).text = "mAP"
    table.cell(0, 2).text = zh(0x901f, 0x5ea6)
    table.cell(1, 0).text = "YOLOv8"
    table.cell(1, 1).text = "87.2%"
    table.cell(1, 2).text = "35 FPS"
    table.cell(2, 0).text = "DeepLabV3+"
    table.cell(2, 1).text = "84.5%"
    table.cell(2, 2).text = "18 FPS"
    add_paragraph(document, zh(0x6ce8, 0xff1a, 0x8868, 0x4e2d, 0x6570, 0x636e, 0x4ec5, 0x7528, 0x4e8e, 0x56de, 0x5f52, 0x9a8c, 0x6536, 0x6837, 0x672c, 0x3002))
    add_paragraph(document, zh(0x53c2, 0x8003, 0x6587, 0x732e), style="Heading 1")
    add_paragraph(document, "[1] " + zh(0x90ed, 0x6c34, 0x826f) + ". " + zh(0x751f, 0x6001, 0x7cfb, 0x7edf, 0x7814, 0x7a76) + ". 1999.")
    add_paragraph(document, zh(0x81f4, 0x20, 0x20, 0x8c22), align=WD_ALIGN_PARAGRAPH.CENTER, size_pt=16, bold=True)
    add_paragraph(document, zh(0x611f, 0x8c22, 0x5bfc, 0x5e08, 0x548c, 0x540c, 0x5b66, 0x5728, 0x8bba, 0x6587, 0x5b8c, 0x6210, 0x8fc7, 0x7a0b, 0x4e2d, 0x63d0, 0x4f9b, 0x7684, 0x5e2e, 0x52a9, 0x3002))

    document.save(str(path))
    return path


def identity_transform(chunk_text: str, prompt_input: str, round_number: int, chunk_id: str) -> str:
    return chunk_text


def _activate_school_spec_for_regression(spec_path: Path | None) -> tuple[bytes | None, dict[str, Any] | None]:
    if spec_path is None or not spec_path.exists():
        return None, None
    previous_bytes = ACTIVE_RULES_PATH.read_bytes() if ACTIVE_RULES_PATH.exists() else None
    instruction_text = spec_path.read_text(encoding="utf-8")
    deterministic_rules = extract_deterministic_format_rules(instruction_text)
    rules = merge_deterministic_rules({}, deterministic_rules)
    rules["schoolName"] = "FYADR regression school spec"
    rules["sourceSummary"] = f"Deterministic rules parsed from {spec_path.name}."
    save_active_format_rules(rules, ACTIVE_RULES_PATH)
    return previous_bytes, rules


def _restore_active_rules(previous_bytes: bytes | None) -> None:
    if previous_bytes is None:
        if ACTIVE_RULES_PATH.exists():
            ACTIVE_RULES_PATH.unlink()
        return
    ACTIVE_RULES_PATH.parent.mkdir(parents=True, exist_ok=True)
    ACTIVE_RULES_PATH.write_bytes(previous_bytes)


def _pt_value(value: Any) -> float | None:
    if value is None:
        return None
    if hasattr(value, "pt"):
        return float(value.pt)
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _first_text_run(paragraph: Any) -> Any | None:
    for run in paragraph.runs:
        if run.text.strip():
            return run
    return paragraph.runs[0] if paragraph.runs else None


def _audit_exported_editable_format(export_path: Path, snapshot_path: Path) -> dict[str, Any]:
    document = Document(str(export_path.resolve()))
    snapshot = _load_docx_snapshot(snapshot_path)
    checks: list[dict[str, Any]] = []
    issues: list[dict[str, Any]] = []
    if snapshot is None:
        return {"ok": False, "checked": 0, "issues": [{"type": "missing_snapshot"}]}

    for unit in snapshot.units:
        if not unit.editable or str(unit.target.get("kind", "")) != "paragraph":
            continue
        try:
            paragraph_index = int(unit.target["paragraph_index"])
            paragraph = document.paragraphs[paragraph_index]
        except (KeyError, TypeError, ValueError, IndexError):
            issues.append({"type": "missing_editable_paragraph", "unitIndex": unit.unit_index})
            continue
        run = _first_text_run(paragraph)
        font_size = _pt_value(run.font.size) if run is not None else None
        line_spacing = _pt_value(paragraph.paragraph_format.line_spacing)
        alignment = int(paragraph.alignment) if paragraph.alignment is not None else None
        paragraph_text = paragraph.text.strip()
        expected_font_size = 12.0 if paragraph_text.startswith("\u611f\u8c22") else 10.5
        check = {
            "unitIndex": unit.unit_index,
            "paragraphIndex": paragraph_index,
            "text": paragraph_text[:80],
            "fontSizePt": font_size,
            "expectedFontSizePt": expected_font_size,
            "lineSpacingPt": line_spacing,
            "alignment": alignment,
        }
        checks.append(check)
        if font_size is None or abs(font_size - expected_font_size) > 0.2:
            issues.append({"type": "editable_font_size", "expected": expected_font_size, **check})
        if line_spacing is None or abs(line_spacing - 20.0) > 0.5:
            issues.append({"type": "editable_line_spacing", "expected": 20.0, **check})

    first_section = document.sections[0]
    margins = {
        "topMarginCm": round(float(first_section.top_margin.cm), 2),
        "bottomMarginCm": round(float(first_section.bottom_margin.cm), 2),
        "leftMarginCm": round(float(first_section.left_margin.cm), 2),
        "rightMarginCm": round(float(first_section.right_margin.cm), 2),
    }
    expected_margins = {"topMarginCm": 2.5, "bottomMarginCm": 2.5, "leftMarginCm": 3.0, "rightMarginCm": 3.0}
    for key, expected in expected_margins.items():
        if abs(margins[key] - expected) > 0.08:
            issues.append({"type": "page_margin", "key": key, "expected": expected, "actual": margins[key]})
    return {"ok": not issues, "checked": len(checks), "issues": issues, "sampleChecks": checks[:8], "margins": margins}


    if not path:
        return {}
    json_path = Path(path)
    if not json_path.exists():
        return {}
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}




def _read_json(path: str | Path | None) -> dict[str, Any]:
    if not path:
        return {}
    json_path = Path(path)
    if not json_path.exists():
        return {}
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}

def run_regression(sample_path: Path, export_path: Path, report_path: Path, *, rebuild_sample: bool, strict_preflight: bool, school_spec_path: Path | None = DEFAULT_SCHOOL_SPEC_PATH) -> dict[str, Any]:
    if rebuild_sample or not sample_path.exists():
        create_regression_sample(sample_path)

    previous_rules_bytes, applied_rules = _activate_school_spec_for_regression(school_spec_path)
    try:
        round_result = run_document_round(sample_path, identity_transform, round_number=1, prompt_profile="cn")
        output_path = Path(str(round_result["output_path"]))
        export_result = export_round_output(str(output_path), str(export_path), "docx")
    finally:
        _restore_active_rules(previous_rules_bytes)

    snapshot_path = get_docx_snapshot_path(sample_path)
    snapshot = _load_docx_snapshot(snapshot_path)
    body_map = load_docx_body_map(Path(str(round_result.get("body_map_path", ""))))
    audit_report = _read_json(export_result.get("auditPath"))
    if not audit_report:
        audit_report = audit_docx_export(
            export_path,
            source_path=sample_path,
            snapshot_path=snapshot_path,
            report_path=get_docx_audit_report_path(export_path),
        )
    preflight_report = _read_json(export_result.get("preflightPath"))
    format_audit = _audit_exported_editable_format(export_path, snapshot_path)

    failures: list[str] = []
    if export_result.get("layoutMode") != "body-map-roundtrip":
        failures.append(f"unexpected layout mode: {export_result.get('layoutMode')}")
    if int(export_result.get("auditIssueCount", 0) or 0) != 0:
        failures.append(f"audit issues: {export_result.get('auditIssueCount')}")
    if snapshot is None:
        failures.append("missing docx snapshot")
    elif snapshot.editable_unit_count <= 0:
        failures.append("snapshot has no editable units")
    if body_map is None:
        failures.append("missing body map")
    elif snapshot is not None and len(body_map.units) != snapshot.editable_unit_count:
        failures.append(f"body map count mismatch: {len(body_map.units)} != {snapshot.editable_unit_count}")
    if strict_preflight and int(export_result.get("preflightIssueCount", 0) or 0) != 0:
        failures.append(f"preflight issues: {export_result.get('preflightIssueCount')}")
    if not bool(format_audit.get("ok")):
        failures.append(f"format audit issues: {len(format_audit.get('issues', []) or [])}")

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "samplePath": str(sample_path.resolve()),
        "outputPath": str(output_path.resolve()),
        "exportPath": str(export_path.resolve()),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "round": {
            "round": round_result.get("round"),
            "chunkCount": round_result.get("chunk_count", round_result.get("chunkCount", round_result.get("input_segment_count"))),
            "bodyMapPath": round_result.get("body_map_path", ""),
            "validationPath": round_result.get("validation_path", ""),
            "comparePath": round_result.get("compare_path", ""),
            "qualityPath": round_result.get("quality_path", ""),
        },
        "snapshot": {
            "path": str(snapshot_path.resolve()),
            "editableUnitCount": snapshot.editable_unit_count if snapshot is not None else 0,
            "totalTextUnitCount": snapshot.total_text_unit_count if snapshot is not None else 0,
            "protectedUnitCount": (snapshot.total_text_unit_count - snapshot.editable_unit_count) if snapshot is not None else 0,
        },
        "schoolRules": {
            "specPath": str(school_spec_path.resolve()) if school_spec_path is not None and school_spec_path.exists() else "",
            "deterministicHits": int((applied_rules or {}).get("quality", {}).get("deterministicHits", 0)) if isinstance(applied_rules, dict) else 0,
            "warningCount": int((applied_rules or {}).get("quality", {}).get("warningCount", 0)) if isinstance(applied_rules, dict) else 0,
        },
        "export": export_result,
        "formatAudit": format_audit,
        "audit": {
            "ok": bool(audit_report.get("ok")),
            "issueCount": int(audit_report.get("issueCount", 0) or 0),
            "protectedChecked": int(audit_report.get("protectedChecked", 0) or 0),
            "tableIssueCount": len(audit_report.get("tableStructureIssues", []) or []),
        },
        "preflight": {
            "issueCount": int(export_result.get("preflightIssueCount", 0) or 0),
            "path": str(export_result.get("preflightPath", "")),
            "sampleIssues": (preflight_report.get("issues", []) or [])[:5] if isinstance(preflight_report.get("issues"), list) else [],
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run FYADR DOCX export regression without calling an LLM.")
    parser.add_argument("--sample", type=Path, default=DEFAULT_SAMPLE_PATH)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--rebuild-sample", action="store_true", help="Recreate the regression sample DOCX before running.")
    parser.add_argument("--strict-preflight", action="store_true", help="Fail when formatting preflight reports any issue.")
    parser.add_argument("--school-spec", type=Path, default=DEFAULT_SCHOOL_SPEC_PATH, help="School formatting instruction text used to activate deterministic rules for this regression.")
    parser.add_argument("--no-school-spec", action="store_true", help="Do not activate any school instruction file before export.")
    args = parser.parse_args(argv)

    report = run_regression(
        args.sample.resolve(),
        args.export.resolve(),
        args.report.resolve(),
        rebuild_sample=args.rebuild_sample,
        strict_preflight=args.strict_preflight,
        school_spec_path=None if args.no_school_spec else args.school_spec,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
