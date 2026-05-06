from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from docx import Document  # type: ignore[import]
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Missing dependency python-docx. Install it with: pip install python-docx") from exc

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
from docx_bodymap import build_docx_body_map, save_docx_body_map, update_docx_body_map_texts  # noqa: E402
from docx_pipeline import get_docx_snapshot_path  # noqa: E402


WORK_DIR = ROOT_DIR / "finish" / "regression" / "legacy_body_map_export"
SOURCE_PATH = WORK_DIR / "legacy_scope_source.docx"
BODY_MAP_PATH = WORK_DIR / "round1_body_map.json"
OUTPUT_PATH = WORK_DIR / "round1.txt"
COMPARE_PATH = WORK_DIR / "round1_compare.json"
EXPORT_PATH = WORK_DIR / "round1_export.docx"
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "docx_legacy_body_map_export_regression_report.json"


def zh(*codes: int) -> str:
    return "".join(chr(code) for code in codes)


def create_source_docx(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    document = Document()
    document.add_paragraph(zh(0x6d4b, 0x8bd5, 0x8bba, 0x6587))
    document.add_paragraph(zh(0x76ee, 0x20, 0x20, 0x5f55))
    document.add_paragraph(zh(0x6458, 0x20, 0x20, 0x8981))
    document.add_paragraph(zh(0x672c, 0x6587, 0x56f4, 0x7ed5, 0x7cfb, 0x7edf, 0x5b9e, 0x73b0, 0x8fdb, 0x884c, 0x8bf4, 0x660e, 0x3002))
    document.add_paragraph("1 " + zh(0x7eea, 0x8bba))
    document.add_paragraph(zh(0x7cfb, 0x7edf, 0x9700, 0x8981, 0x9762, 0x5411, 0x5b9e, 0x9645, 0x4e1a, 0x52a1, 0x573a, 0x666f, 0x4fdd, 0x6301, 0x7a33, 0x5b9a, 0x3002))
    document.add_paragraph(zh(0x81f4, 0x20, 0x20, 0x8c22))
    document.add_paragraph(zh(0x611f, 0x8c22, 0x5bfc, 0x5e08, 0x548c, 0x540c, 0x5b66, 0x7684, 0x5e2e, 0x52a9, 0x3002))
    document.add_paragraph(zh(0x9644, 0x5f55, 0x20, 0x41))
    document.add_paragraph("appendix must stay unchanged")
    document.save(str(path))


def expand_snapshot_scope(snapshot_path: Path) -> str:
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    units = payload.get("units")
    if not isinstance(units, list):
        raise AssertionError("snapshot units missing")
    selected_text = ""
    for unit in units:
        if isinstance(unit, dict) and not bool(unit.get("editable")) and str(unit.get("text", "")).strip():
            unit["editable"] = True
            unit["protect_reason"] = None
            selected_text = str(unit.get("text", ""))
            break
    if not selected_text:
        raise AssertionError("sample must contain at least one protected paragraph to simulate scope expansion")
    payload["editable_unit_count"] = sum(1 for unit in units if isinstance(unit, dict) and bool(unit.get("editable")))
    snapshot_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return selected_text


def main() -> int:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    create_source_docx(SOURCE_PATH)
    body_map = build_docx_body_map(SOURCE_PATH, prompt_profile="cn_custom", round_number=1)
    if len(body_map.units) < 2:
        raise AssertionError(f"expected at least two editable body-map units, got {len(body_map.units)}")
    rewritten = [f"{unit.current_text} legacy rewrite" for unit in body_map.units]
    body_map = update_docx_body_map_texts(body_map, rewritten, round_number=1)
    save_docx_body_map(body_map, BODY_MAP_PATH)
    OUTPUT_PATH.write_text("\n\n".join(rewritten), encoding="utf-8")
    COMPARE_PATH.write_text(
        json.dumps(
            {
                "chunkCount": len(rewritten),
                "paragraphCount": len(rewritten),
                "chunks": [
                    {
                        "chunkId": f"p{index}_c0",
                        "chunkIndex": 0,
                        "paragraphIndex": index,
                        "inputText": body_map.units[index].original_text,
                        "outputText": text,
                    }
                    for index, text in enumerate(rewritten)
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    snapshot_path = get_docx_snapshot_path(SOURCE_PATH)
    expanded_text = expand_snapshot_scope(snapshot_path)

    record_entry = {
        "origin_path": str(SOURCE_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
        "rounds": [
            {
                "round": 1,
                "prompt": "prompts/classical-rewrite.md",
                "prompt_profile": "cn_custom",
                "prompt_sequence": ["classical"],
                "input_path": str(SOURCE_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
                "output_path": str(OUTPUT_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
                "compare_path": str(COMPARE_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
                "body_map_path": str(BODY_MAP_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
                "input_segment_count": len(rewritten),
                "output_segment_count": len(rewritten),
            }
        ],
    }
    original_list_records = app_service.list_records
    app_service.list_records = lambda: {record_entry["origin_path"]: record_entry}
    try:
        export = app_service.export_round_output(
            str(OUTPUT_PATH.relative_to(ROOT_DIR)).replace("\\", "/"),
            str(EXPORT_PATH),
            "docx",
        )
    finally:
        app_service.list_records = original_list_records

    exported = Document(str(EXPORT_PATH))
    exported_texts = [paragraph.text for paragraph in exported.paragraphs]
    failures: list[str] = []
    if not bool(export.get("path")) or not EXPORT_PATH.exists():
        failures.append("legacy body-map export did not create a DOCX")
    if int(export.get("guardIssueCount", 0) or 0) != 0:
        failures.append(f"legacy body-map export should not have blocking guard issues: {export.get('guardIssueCount')}")
    for unit in body_map.units:
        paragraph_index = int(unit.target["paragraph_index"])
        if exported_texts[paragraph_index] != unit.current_text:
            failures.append(f"body-map target {paragraph_index} was not rewritten from frozen mapping")
    if expanded_text and expanded_text not in exported_texts:
        failures.append("newly expanded scope paragraph should remain present during legacy export")

    report = {
        "ok": not failures,
        "failures": failures,
        "export": export,
        "bodyMapUnitCount": len(body_map.units),
        "expandedScopeText": expanded_text,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    if failures:
        print(json.dumps(report, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
