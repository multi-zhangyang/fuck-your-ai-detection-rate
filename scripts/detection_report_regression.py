from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from detection_report_parser import (  # noqa: E402
    PAPERPASS_PROVIDER,
    SPEEDAI_PROVIDER,
    _build_match_text,
    _normalize_segment_content,
    parse_detection_report_pdf,
)

DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "detection_report_regression_report.json"
DEFAULT_CASES = [
    {
        "name": "speedai",
        "path": ROOT_DIR / "检测结果-基于用户序列的电商购买意图预测模型_ro.pdf",
        "provider": SPEEDAI_PROVIDER,
        "wrongHint": PAPERPASS_PROVIDER,
        "minSegments": 8,
        "minPages": 1,
        "requireOverall": True,
    },
    {
        "name": "paperpass",
        "path": ROOT_DIR / "免费_PDF打印版_AIGC检测报告_[基于用户序列的电商购买意图预测模型_cu].pdf",
        "provider": PAPERPASS_PROVIDER,
        "wrongHint": SPEEDAI_PROVIDER,
        "minSegments": 10,
        "minPages": 1,
        "requireOverall": True,
        "requireScopeNote": True,
    },
]


def _validate_payload(payload: dict[str, Any], case: dict[str, Any]) -> list[str]:
    failures: list[str] = []
    expected_provider = str(case["provider"])
    if payload.get("provider") != expected_provider:
        failures.append(f"{case['name']}: expected provider {expected_provider}, got {payload.get('provider')}")
    if int(payload.get("pageCount", 0) or 0) < int(case.get("minPages", 1)):
        failures.append(f"{case['name']}: page count is too low: {payload.get('pageCount')}")
    segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
    if len(segments) < int(case.get("minSegments", 1)):
        failures.append(f"{case['name']}: parsed too few report segments: {len(segments)}")
    summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
    if case.get("requireOverall") and summary.get("overallRiskProbability") is None:
        failures.append(f"{case['name']}: missing overall risk probability")
    if case.get("requireScopeNote") and not summary.get("checkedScopeNotes"):
        failures.append(f"{case['name']}: missing checked-scope note")
    for segment in segments[: min(len(segments), 8)]:
        index = segment.get("index")
        content = str(segment.get("content") or "")
        match_text = str(segment.get("matchText") or "")
        probability = segment.get("probability")
        if not content or len(content) < 20:
            failures.append(f"{case['name']}: segment {index} content too short")
        if not match_text or len(match_text) < 12:
            failures.append(f"{case['name']}: segment {index} matchText too short")
        if not isinstance(probability, (int, float)) or not 0 <= float(probability) <= 100:
            failures.append(f"{case['name']}: segment {index} invalid probability {probability!r}")
    return failures


def _validate_normalization_helpers() -> list[str]:
    failures: list[str] = []
    normalized = _normalize_segment_content(
        "XG Boost uses SH AP explanations, F1 - Score metrics, Random Forest baselines, and AI System labels."
    )
    expected_fragments = ["XGBoost", "SHAP", "F1-Score", "Random Forest", "AI System"]
    for fragment in expected_fragments:
        if fragment not in normalized:
            failures.append(f"normalizer should preserve or repair {fragment!r}; got {normalized!r}")
    match_text = _build_match_text("Str eamlit and Stream lit are still compacted for matching")
    if "streamlit" not in match_text:
        failures.append(f"matchText should remain compact across report OCR spaces; got {match_text!r}")
    return failures


def run_regression(report_path: Path, *, strict_missing: bool = False) -> dict[str, Any]:
    failures: list[str] = []
    cases: list[dict[str, Any]] = []
    skipped: list[str] = []
    failures.extend(_validate_normalization_helpers())

    for case in DEFAULT_CASES:
        pdf_path = Path(case["path"])
        if not pdf_path.exists():
            message = f"{case['name']}: sample PDF not found: {pdf_path}"
            if strict_missing:
                failures.append(message)
            else:
                skipped.append(message)
            continue

        payload = parse_detection_report_pdf(pdf_path)
        hinted_payload = parse_detection_report_pdf(pdf_path, provider_hint=str(case.get("wrongHint", "")))
        case_failures = _validate_payload(payload, case)
        if hinted_payload.get("provider") != case["provider"]:
            case_failures.append(
                f"{case['name']}: provider auto-correction failed with wrong hint {case.get('wrongHint')!r}; got {hinted_payload.get('provider')}"
            )
        failures.extend(case_failures)
        segments = payload.get("segments") if isinstance(payload.get("segments"), list) else []
        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        cases.append(
            {
                "name": case["name"],
                "path": str(pdf_path.resolve()),
                "provider": payload.get("provider"),
                "providerLabel": payload.get("providerLabel"),
                "pageCount": payload.get("pageCount"),
                "segmentCount": len(segments),
                "overallRiskProbability": summary.get("overallRiskProbability"),
                "weightedOverallRiskProbability": summary.get("weightedOverallRiskProbability"),
                "checkedScopeNotes": summary.get("checkedScopeNotes", []),
                "sampleSegments": [
                    {
                        "index": segment.get("index"),
                        "probability": segment.get("probability"),
                        "riskLevel": segment.get("riskLevel"),
                        "contentPreview": str(segment.get("content") or "")[:120],
                    }
                    for segment in segments[:3]
                ],
                "failures": case_failures,
            }
        )

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "skipped": skipped,
        "cases": cases,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run external detection-report parser regression.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--strict-missing", action="store_true", help="Fail when bundled/local sample PDFs are missing.")
    args = parser.parse_args(argv)
    report = run_regression(args.report.resolve(), strict_missing=args.strict_missing)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
