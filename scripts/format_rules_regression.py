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
        model_config={"baseUrl": "", "apiKey": "", "model": "", "offlineMode": False},
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
        model_config={"baseUrl": "", "apiKey": "", "model": "", "offlineMode": False},
    )
    direct_body = direct_json_rules.get("styles", {}).get("body_text", {})
    checks.append({"role": "direct_json", "key": "body_text.cnFont", "actual": direct_body.get("cnFont"), "expected": "仿宋"})
    if direct_body.get("cnFont") != "仿宋":
        failures.append(f"direct json body_text.cnFont: expected 仿宋, got {direct_body.get('cnFont')!r}")

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
