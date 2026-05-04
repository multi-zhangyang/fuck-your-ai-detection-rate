from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import format_rules  # noqa: E402
from format_rules import extract_deterministic_format_rules, merge_deterministic_rules, parse_format_rules_from_text  # noqa: E402

DEFAULT_SPEC_PATH = ROOT_DIR / "references" / "school_format_instruction.md"
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "format_rules_regression_report.json"


def _actual_value(style: dict[str, Any], key: str) -> Any:
    return style.get(key)


def _values_equal(actual: Any, expected: Any) -> bool:
    if isinstance(expected, float):
        return isinstance(actual, (int, float)) and math.isclose(float(actual), expected, abs_tol=0.05)
    return actual == expected


def _expect_style(
    rules: dict[str, Any],
    role: str,
    expected: dict[str, Any],
    failures: list[str],
    checks: list[dict[str, Any]],
) -> None:
    style = rules.get("styles", {}).get(role)
    if not isinstance(style, dict):
        failures.append(f"missing style role: {role}")
        return
    for key, expected_value in expected.items():
        actual = _actual_value(style, key)
        checks.append({"role": role, "key": key, "actual": actual, "expected": expected_value})
        if not _values_equal(actual, expected_value):
            failures.append(f"{role}.{key}: expected {expected_value!r}, got {actual!r}")


def run_regression(spec_path: Path, report_path: Path) -> dict[str, Any]:
    failures: list[str] = []
    checks: list[dict[str, Any]] = []
    if not spec_path.exists():
        failures.append(f"missing school spec: {spec_path}")
        report = _build_report(spec_path, report_path, {}, checks, failures)
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return report

    instruction_text = spec_path.read_text(encoding="utf-8")
    deterministic = extract_deterministic_format_rules(instruction_text)
    rules = merge_deterministic_rules({}, deterministic)

    expected_styles = {
        "toc_heading": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center", "lineSpacingMultiple": 1.5},
        "cn_abstract_lead": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center", "lineSpacingMultiple": 1.5},
        "cn_abstract_body": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 20.0},
        "cn_keywords": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 20.0},
        "en_abstract_lead": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 16.0, "bold": True, "alignment": "center"},
        "en_abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 10.5, "lineSpacingPt": 20.0},
        "heading_1": {"cnFont": "黑体", "fontSizePt": 14.0, "alignment": "left"},
        "heading_2": {"cnFont": "黑体", "fontSizePt": 12.0, "alignment": "left"},
        "heading_3": {"cnFont": "黑体", "fontSizePt": 10.5, "alignment": "left"},
        "heading_4": {"cnFont": "黑体", "fontSizePt": 10.5, "alignment": "left"},
        "body_text": {"cnFont": "宋体", "fontSizePt": 10.5, "alignment": "justify", "firstLineIndentPt": 21.0, "lineSpacingPt": 20.0},
        "caption": {"cnFont": "黑体", "fontSizePt": 9.0, "alignment": "center"},
        "note": {"cnFont": "楷体", "fontSizePt": 9.0, "firstLineIndentPt": 21.0},
        "table_text": {"cnFont": "宋体", "fontSizePt": 9.0},
        "references_heading": {"cnFont": "黑体", "fontSizePt": 14.0, "alignment": "center", "lineSpacingMultiple": 1.5},
        "references_body": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 20.0},
        "ack_heading": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center", "lineSpacingMultiple": 1.5},
        "ack_body": {"cnFont": "宋体", "fontSizePt": 12.0, "lineSpacingPt": 20.0},
    }
    for role, expected in expected_styles.items():
        _expect_style(rules, role, expected, failures, checks)

    for role in ("toc_heading", "cn_abstract_lead", "en_abstract_lead", "ack_heading"):
        style = rules.get("styles", {}).get(role, {})
        actual_indent = style.get("firstLineIndentPt")
        checks.append({"role": role, "key": "firstLineIndentPt", "actual": actual_indent, "expected": "unset-or-zero"})
        if actual_indent not in (None, 0, 0.0):
            failures.append(f"{role}.firstLineIndentPt should not be parsed from title character spacing: {actual_indent!r}")

    page = rules.get("page", {})
    expected_page = {"paper": "A4", "topMarginCm": 2.5, "bottomMarginCm": 2.5, "leftMarginCm": 3.0, "rightMarginCm": 3.0}
    for key, expected in expected_page.items():
        actual = page.get(key)
        checks.append({"role": "page", "key": key, "actual": actual, "expected": expected})
        if not _values_equal(actual, expected):
            failures.append(f"page.{key}: expected {expected!r}, got {actual!r}")

    quality = rules.get("quality", {})
    if int(quality.get("explicitCoveragePercent", 0) or 0) < 90:
        failures.append(f"explicit coverage too low: {quality.get('explicitCoveragePercent')}")
    if quality.get("missingSourceRoles"):
        failures.append(f"missing source roles: {quality.get('missingSourceRoles')}")

    fallback_rules = parse_format_rules_from_text(
        instruction_text,
        model_config={"baseUrl": "", "apiKey": "", "model": ""},
    )
    fallback_quality = fallback_rules.get("quality", {})
    fallback_warnings = fallback_quality.get("warnings", [])
    if not isinstance(fallback_warnings, list) or not any("AI 结构化解析未完成" in str(item) for item in fallback_warnings):
        failures.append("format parser fallback warning missing when model config is incomplete")
    fallback_body = fallback_rules.get("styles", {}).get("body_text", {})
    checks.append({"role": "fallback", "key": "body_text.fontSizePt", "actual": fallback_body.get("fontSizePt"), "expected": 10.5})
    if not _values_equal(fallback_body.get("fontSizePt"), 10.5):
        failures.append(f"fallback body_text.fontSizePt: expected 10.5, got {fallback_body.get('fontSizePt')!r}")

    direct_json_rules = parse_format_rules_from_text(
        json.dumps(
            {
                "version": 1,
                "schoolName": "json-sample",
                "page": {"paper": "A4", "topMarginCm": 2.6},
                "styles": {"body_text": {"cnFont": "仿宋", "fontSizePt": 12, "lineSpacingPt": 22}},
                "styleMeta": {"body_text": {"sourceText": "JSON direct input", "confidence": 0.9, "isInferred": False}},
                "notes": [],
            },
            ensure_ascii=False,
        ),
        model_config={"baseUrl": "", "apiKey": "", "model": ""},
    )
    direct_body = direct_json_rules.get("styles", {}).get("body_text", {})
    checks.append({"role": "direct_json", "key": "body_text.cnFont", "actual": direct_body.get("cnFont"), "expected": "仿宋"})
    if direct_body.get("cnFont") != "仿宋":
        failures.append(f"direct json body_text.cnFont: expected 仿宋, got {direct_body.get('cnFont')!r}")

    original_llm_completion = format_rules.llm_completion

    def fake_messy_llm_completion(*_args: Any, **_kwargs: Any) -> str:
        return """
        好的，下面只保留 JSON：
        ```json
        {
          "formatRules": {
            "schoolName": "ai-json-wrapper",
            "pageSetup": {"margins": {"top": "25mm", "bottom": "25mm", "left": "30mm", "right": "30mm"}},
            "styleRules": [
              {"role": "normal_text", "font": "宋体 / Times New Roman", "fontSize": "小四号", "lineSpacing": "固定值22磅", "firstLineIndent": "2字符", "align": "两端对齐"},
              {"role": "chapter_title", "font": "黑体", "fontSize": "三号", "align": "居中"}
            ],
            "styleMeta": [
              {"role": "normal_text", "sourceText": "正文：宋体小四，固定22磅。", "confidence": "91%", "isInferred": false}
            ]
          }
        }
        ```
        """

    try:
        format_rules.llm_completion = fake_messy_llm_completion
        ai_wrapped_rules = parse_format_rules_from_text(
            "学校要求正文小四号宋体，一级标题三号黑体。",
        model_config={"baseUrl": "http://localhost/v1", "apiKey": "x", "model": "local"},
        )
    finally:
        format_rules.llm_completion = original_llm_completion

    ai_wrapped_expectations = {
        "body_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 12.0, "lineSpacingPt": 22.0, "firstLineIndentPt": 21.0, "alignment": "justify"},
        "heading_1": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center"},
    }
    for role, expected in ai_wrapped_expectations.items():
        _expect_style(ai_wrapped_rules, role, expected, failures, checks)

    ai_candidate_rules = merge_deterministic_rules(
        {
            "version": 1,
            "schoolName": "ai-candidate",
            "sourceSummary": "Simulated AI candidate with common role aliases.",
            "page": {"paper": "A4", "topMarginCm": 2.5},
            "styles": {
                "正文": {"cnFont": "仿宋", "fontSizePt": 12, "lineSpacingPt": 22, "alignment": "justify"},
                "chapter_title": {"cnFont": "黑体", "fontSizePt": 16, "alignment": "center"},
                "level2_heading": {"cnFont": "黑体", "fontSizePt": 14, "alignment": "left"},
                "abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 12, "lineSpacingPt": 20},
                "keyword_content_cn": {"cnFont": "宋体", "fontSizePt": 12},
                "reference_items": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 18},
                "ack_content": {"cnFont": "宋体", "fontSizePt": 12},
                "unknown_school_role": {"cnFont": "黑体", "fontSizePt": 22},
            },
            "styleMeta": {
                "正文": {"sourceText": "正文段落：仿宋小四，固定行距22磅。", "confidence": 0.88, "isInferred": False},
                "chapter_title": {"sourceText": "章标题：三号黑体居中。", "confidence": 0.92, "isInferred": False},
                "abstract_body": {"sourceText": "Abstract body: small four Times New Roman.", "confidence": 0.91, "isInferred": False},
                "unknown_school_role": {"sourceText": "Should be ignored.", "confidence": 0.99, "isInferred": False},
            },
            "notes": [],
        },
        {},
    )
    ai_expectations = {
        "body_text": {"cnFont": "仿宋", "fontSizePt": 12.0, "lineSpacingPt": 22.0, "alignment": "justify"},
        "heading_1": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center"},
        "heading_2": {"cnFont": "黑体", "fontSizePt": 14.0, "alignment": "left"},
        "en_abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 12.0, "lineSpacingPt": 20.0},
        "cn_keywords": {"cnFont": "宋体", "fontSizePt": 12.0},
        "references_body": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 18.0},
        "ack_body": {"cnFont": "宋体", "fontSizePt": 12.0},
    }
    for role, expected in ai_expectations.items():
        _expect_style(ai_candidate_rules, role, expected, failures, checks)
    if "unknown_school_role" in ai_candidate_rules.get("styles", {}):
        failures.append("AI alias normalization should ignore unknown style roles")
    ai_meta = ai_candidate_rules.get("styleMeta", {})
    if "chapter_title" in ai_meta or "正文" in ai_meta:
        failures.append("AI alias normalization should canonicalize styleMeta role keys")
    if ai_meta.get("heading_1", {}).get("sourceText") != "章标题：三号黑体居中。":
        failures.append("AI alias normalization lost heading_1 styleMeta sourceText")

    messy_ai_rules = merge_deterministic_rules(
        {
            "version": 1,
            "schoolName": "messy-ai-candidate",
            "sourceSummary": "Simulated AI candidate with loose schema and Chinese units.",
            "pageSetup": {
                "paperSize": "a4",
                "margins": {"top": "25mm", "bottom": "2.5厘米", "left": "30毫米", "right": "3cm"},
            },
            "styles": [
                {
                    "role": "normal_text",
                    "style": {
                        "font": "宋体 / Times New Roman",
                        "fontSize": "小四号",
                        "lineSpacing": "固定值22磅",
                        "firstLineIndent": "2字符",
                        "align": "两端对齐",
                    },
                },
                {"role": "first_level_heading", "font": "黑体", "fontSize": "三号", "align": "居中", "spaceBefore": "0.5行", "spaceAfter": "6磅"},
                {"role": "reference_items", "font": "宋体", "fontSize": "五号", "lineSpacing": "1.25倍行距"},
            ],
            "styleMeta": [
                {"role": "normal_text", "sourceText": "正文：宋体小四，固定值22磅。", "confidence": "92%", "isInferred": False},
                {"role": "first_level_heading", "sourceText": "一级标题：三号黑体居中。", "confidence": 0.91, "isInferred": False},
                {"role": "reference_items", "sourceText": "参考文献条目：五号宋体，1.25倍行距。", "confidence": 0.87, "isInferred": False},
            ],
            "notes": [],
        },
        {},
    )
    messy_expectations = {
        "body_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 12.0, "lineSpacingPt": 22.0, "firstLineIndentPt": 21.0, "alignment": "justify"},
        "heading_1": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center", "spaceBeforePt": 6.0, "spaceAfterPt": 6.0},
        "references_body": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingMultiple": 1.25},
    }
    for role, expected in messy_expectations.items():
        _expect_style(messy_ai_rules, role, expected, failures, checks)
    for key, expected_value in {"topMarginCm": 2.5, "bottomMarginCm": 2.5, "leftMarginCm": 3.0, "rightMarginCm": 3.0}.items():
        actual = messy_ai_rules.get("page", {}).get(key)
        checks.append({"role": "messy_ai_page", "key": key, "actual": actual, "expected": expected_value})
        if not _values_equal(actual, expected_value):
            failures.append(f"messy AI page.{key}: expected {expected_value!r}, got {actual!r}")
    messy_quality = messy_ai_rules.get("quality", {})
    if int(messy_quality.get("validationIssueCount", 0) or 0) != 0:
        failures.append(f"messy AI candidate should normalize without validation issues: {messy_quality.get('validationIssues')}")
    if "body_text" not in messy_ai_rules.get("styleMeta", {}) or "normal_text" in messy_ai_rules.get("styleMeta", {}):
        failures.append("messy AI styleMeta should canonicalize loose role names")
    if "cn_abstract_body" not in messy_quality.get("inheritedRoles", []):
        failures.append("messy AI candidate should infer missing abstract body from explicit body_text")

    variant_instruction_text = """
    页面设置：A4纸，上下页边距25mm，左右页边距30mm。
    正文段落：中文采用宋体，西文与数字采用Times New Roman，小四号，固定行距22磅，首行缩进2字符，两端对齐。
    章标题（一级标题）：三号黑体，居中，段前12磅，段后6磅。
    节标题（二级标题）：四号黑体，左对齐。三级标题：小四号黑体，左齐。
    中文摘要标题：小二号黑体居中；摘要正文：小四号宋体，固定行距20磅。
    英文摘要标题：Times New Roman，小二号，加粗，居中；英文摘要正文：小四号 Times New Roman，固定行距20磅。
    关键词：小四号黑体；关键词内容：小四号宋体。Key words：小四号 Times New Roman。
    图题、表题：五号黑体居中；表内文字为五号宋体；图表注释采用小五号楷体。
    参考文献标题：三号黑体居中；文献条目：五号宋体，固定行距18磅。
    致谢标题：三号黑体居中；致谢内容：小四号宋体。
    """
    variant_rules = merge_deterministic_rules({}, extract_deterministic_format_rules(variant_instruction_text))
    variant_expectations = {
        "page": {"topMarginCm": 2.5, "bottomMarginCm": 2.5, "leftMarginCm": 3.0, "rightMarginCm": 3.0},
        "body_text": {"cnFont": "宋体", "enFont": "Times New Roman", "fontSizePt": 12.0, "lineSpacingPt": 22.0, "firstLineIndentPt": 21.0, "alignment": "justify"},
        "heading_1": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center", "spaceBeforePt": 12.0, "spaceAfterPt": 6.0},
        "heading_2": {"cnFont": "黑体", "fontSizePt": 14.0, "alignment": "left"},
        "heading_3": {"cnFont": "黑体", "fontSizePt": 12.0, "alignment": "left"},
        "cn_abstract_lead": {"cnFont": "黑体", "fontSizePt": 18.0, "alignment": "center"},
        "cn_abstract_body": {"cnFont": "宋体", "fontSizePt": 12.0, "lineSpacingPt": 20.0},
        "en_abstract_lead": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 18.0, "bold": True, "alignment": "center"},
        "en_abstract_body": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 12.0, "lineSpacingPt": 20.0},
        "cn_keywords": {"cnFont": "宋体", "fontSizePt": 12.0},
        "en_keywords": {"cnFont": "Times New Roman", "enFont": "Times New Roman", "fontSizePt": 12.0},
        "caption": {"cnFont": "黑体", "fontSizePt": 10.5, "alignment": "center"},
        "table_text": {"cnFont": "宋体", "fontSizePt": 10.5},
        "note": {"cnFont": "楷体", "fontSizePt": 9.0},
        "references_heading": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center"},
        "references_body": {"cnFont": "宋体", "fontSizePt": 10.5, "lineSpacingPt": 18.0},
        "ack_heading": {"cnFont": "黑体", "fontSizePt": 16.0, "alignment": "center"},
        "ack_body": {"cnFont": "宋体", "fontSizePt": 12.0},
    }
    for role, expected in variant_expectations.items():
        if role == "page":
            for key, expected_value in expected.items():
                actual = variant_rules.get("page", {}).get(key)
                checks.append({"role": "variant_page", "key": key, "actual": actual, "expected": expected_value})
                if not _values_equal(actual, expected_value):
                    failures.append(f"variant page.{key}: expected {expected_value!r}, got {actual!r}")
            continue
        _expect_style(variant_rules, role, expected, failures, checks)
    variant_quality = variant_rules.get("quality", {})
    if int(variant_quality.get("explicitCoveragePercent", 0) or 0) < 90:
        failures.append(f"variant explicit coverage too low: {variant_quality.get('explicitCoveragePercent')}")

    report = _build_report(spec_path, report_path, rules, checks, failures)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def _build_report(
    spec_path: Path,
    report_path: Path,
    rules: dict[str, Any],
    checks: list[dict[str, Any]],
    failures: list[str],
) -> dict[str, Any]:
    quality = rules.get("quality", {}) if isinstance(rules, dict) else {}
    return {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "specPath": str(spec_path.resolve()),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "checkCount": len(checks),
        "sampleChecks": checks[:20],
        "quality": {
            "deterministicHits": int(quality.get("deterministicHits", 0) or 0),
            "explicitCoveragePercent": int(quality.get("explicitCoveragePercent", 0) or 0),
            "usableCoveragePercent": int(quality.get("usableCoveragePercent", 0) or 0),
            "warningCount": int(quality.get("warningCount", 0) or 0),
            "missingSourceRoles": quality.get("missingSourceRoles", []),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run deterministic school-format parsing regression.")
    parser.add_argument("--spec", type=Path, default=DEFAULT_SPEC_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args(argv)
    report = run_regression(args.spec.resolve(), args.report.resolve())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
