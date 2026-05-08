from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from app_service import _normalize_review_decision_value, _select_review_text, export_round_output, save_review_decisions  # noqa: E402
from fyadr_round_service import get_round_compare_path  # noqa: E402

REPORT_PATH = ROOT_DIR / "finish" / "regression" / "review_decisions_regression_report.json"
APP_SOURCE_PATH = ROOT_DIR / "app" / "src" / "App.tsx"


def _assert(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def run_regression() -> dict[str, Any]:
    failures: list[str] = []
    _assert(_normalize_review_decision_value("rewrite") == "rewrite", "Plain rewrite must remain an unresolved default.", failures)
    _assert(_normalize_review_decision_value("rewrite_confirmed") == "rewrite_confirmed", "Confirmed rewrite must survive backend normalization.", failures)
    _assert(_normalize_review_decision_value("source") == "source", "Legacy source must remain source for export selection.", failures)
    _assert(_normalize_review_decision_value("source_confirmed") == "source_confirmed", "Confirmed source must survive backend normalization.", failures)
    _assert(_select_review_text("original", "rewrite", "source_confirmed") == "original", "Confirmed source must export the original text.", failures)
    _assert(_select_review_text("original", "rewrite", "rewrite_confirmed") == "rewrite", "Confirmed rewrite must export the rewrite text.", failures)
    _assert(_select_review_text("original", "rewrite", "rewrite") == "rewrite", "Default rewrite must export the rewrite text.", failures)
    legacy_failed_output = _normalize_review_decision_value({"mode": "custom", "source": "rejected_candidate", "text": "candidate"})
    confirmed_failed_output = _normalize_review_decision_value({"mode": "custom", "source": "failed_output", "text": "candidate", "confirmed": True})
    _assert(
        isinstance(legacy_failed_output, dict)
        and legacy_failed_output.get("source") == "failed_output"
        and legacy_failed_output.get("confirmed") is False,
        "Legacy failed-output decisions must migrate and remain unconfirmed.",
        failures,
    )
    _assert(
        isinstance(confirmed_failed_output, dict)
        and confirmed_failed_output.get("source") == "failed_output"
        and confirmed_failed_output.get("confirmed") is True,
        "Confirmed failed-output choices must preserve confirmation.",
        failures,
    )
    _assert(_select_review_text("original", "rewrite", legacy_failed_output) == "original", "Unconfirmed failed-output decisions must export safe source text.", failures)
    _assert(_select_review_text("original", "rewrite", confirmed_failed_output) == "candidate", "Confirmed failed-output decisions must export the selected AI text.", failures)

    app_source = APP_SOURCE_PATH.read_text(encoding="utf-8") if APP_SOURCE_PATH.exists() else ""
    _assert("function normalizeReviewDecisionsForSave" in app_source, "Frontend must save review decisions with explicit-state semantics.", failures)
    _assert("return [chunkId, \"rewrite\" as ReviewDecision];" in app_source, "Saved plain rewrite must reload as unresolved.", failures)
    _assert("return [chunkId, \"source\" as ReviewDecision];" in app_source, "Unconfirmed failed-output choices must reload as unresolved safe-source decisions.", failures)
    _assert("isFailedOutputDecision(decision) && decision.confirmed !== true" in app_source, "Failed-output decisions must reload as unresolved until confirmed.", failures)
    _assert("if (decision === \"source_confirmed\")" in app_source, "Only explicit source confirmations should be persisted.", failures)
    _assert("if (decision === \"source\" || decision === \"source_confirmed\")" not in app_source, "Default source choices must not be saved as confirmed.", failures)
    _assert("function normalizeSavedReviewDecisionsForCompare" in app_source, "Saved decisions must be normalized against compare data.", failures)
    _assert("highRiskChunkIds.has(chunkId) && decision === \"source_confirmed\" ? \"source\"" not in app_source, "Confirmed source choices must not re-open handled high-risk failed outputs.", failures)
    _assert("const validChunkIds = new Set(data.chunks.map((chunk) => chunk.chunkId));" in app_source, "Saved decisions should still be scoped to the loaded compare data.", failures)
    _assert(
        "if (decision === \"rewrite\") return [chunkId, \"rewrite_confirmed\" as ReviewDecision];" not in app_source,
        "Frontend must not promote default rewrite to confirmed on reload.",
        failures,
    )
    _assert(
        "return [[chunkId, \"rewrite_confirmed\" as ReviewDecision] as const];" in app_source,
        "Frontend must persist explicit rewrite confirmations.",
        failures,
    )
    _assert("buildRejectedCandidateReviewDecision" not in app_source, "Frontend must not keep removed candidate adoption decisions.", failures)
    _assert("handleAdoptAllRejectedCandidates" not in app_source, "Frontend must not keep removed bulk candidate adoption.", failures)

    work_dir = ROOT_DIR / "finish" / "regression" / "review_decisions_recovery"
    work_dir.mkdir(parents=True, exist_ok=True)
    output_path = work_dir / "failed_output_choice.txt"
    export_path = work_dir / "failed_output_safe_export.txt"
    adopted_export_path = work_dir / "failed_output_adopted_export.txt"
    source_text = (
        "（2）发送请求：通过OkHttpClient向文心一言API端点"
        "`https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions`"
        "发送POST请求，请求头中包含`Content-Type: application/json`及认证Token，请求体为JSON格式的消息数组。"
    )
    recovered_text = (
        "(2) 发送请求：运用OkHttpClient来向文心一言API端点"
        "`https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions`"
        "去发送一个POST请求，请求头当中包含了`Content-Type: application/json`以及认证Token，请求体的格式是JSON消息数组。"
    )
    output_path.write_text(source_text, encoding="utf-8")
    blocked_export_path = ROOT_DIR / "blocked_export_regression.txt"
    blocked_export_path.unlink(missing_ok=True)
    try:
        export_round_output(str(output_path), str(blocked_export_path), "txt")
        failures.append("Export path outside finish must be rejected.")
    except ValueError as exc:
        _assert("Export path must stay under allowed workspace directories" in str(exc), "Blocked export path should return a clear error.", failures)
    _assert(not blocked_export_path.exists(), "Rejected export path must not be written.", failures)

    invalid_format_parent = work_dir / "invalid_format_parent"
    if invalid_format_parent.exists():
        for child in invalid_format_parent.glob("*"):
            child.unlink()
        invalid_format_parent.rmdir()
    try:
        export_round_output(str(output_path), str(invalid_format_parent / "bad.invalid"), "pdf")
        failures.append("Unsupported export format must be rejected before creating export directories.")
    except ValueError as exc:
        _assert("Unsupported export format" in str(exc), "Unsupported export format should return a clear error.", failures)
    _assert(not invalid_format_parent.exists(), "Invalid export format must not create directories.", failures)

    compare_path = get_round_compare_path(output_path)
    compare_path.with_name(f"{compare_path.stem}_review_decisions.json").unlink(missing_ok=True)
    compare_path.write_text(
        json.dumps(
            {
                "version": 2,
                "docId": "review-decisions-recovery",
                "round": 1,
                "chunkCount": 1,
                "qualitySummary": {"sourceFallbackCount": 1, "sourceFallbackChunkIds": ["p0_c0"]},
                "chunks": [
                    {
                        "chunkId": "p0_c0",
                        "paragraphIndex": 0,
                        "chunkIndex": 0,
                        "inputText": source_text,
                        "outputText": source_text,
                        "fallbackMode": "source",
                        "quality": {"needsReview": True, "flags": ["source_fallback"]},
                        "failedAttempts": [{"attempt": 2, "outputText": recovered_text, "error": "old false positive"}],
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    export_round_output(str(output_path), str(export_path), "txt")
    _assert(export_path.read_text(encoding="utf-8") == source_text, "TXT export must keep source fallback until the user explicitly adopts failed output.", failures)
    save_review_decisions(
        str(output_path),
        {"p0_c0": {"mode": "custom", "source": "failed_output", "text": recovered_text, "confirmed": True}},
    )
    export_round_output(str(output_path), str(adopted_export_path), "txt")
    _assert(adopted_export_path.read_text(encoding="utf-8") == recovered_text, "Confirmed failed-output decision must export the selected AI text.", failures)

    targeted_output_path = work_dir / "targeted_failed_output_choice.txt"
    targeted_export_path = work_dir / "targeted_safe_export.txt"
    targeted_adopted_export_path = work_dir / "targeted_adopted_export.txt"
    targeted_source = "登录注册模块围绕账号创建、身份校验和会话保持展开，保证用户能够稳定访问平台功能。"
    targeted_recovered = "登录注册模块主要承接账号创建、身份核验与会话维持等流程，使用户可以持续、稳定地进入平台功能。"
    targeted_output_path.write_text(targeted_source, encoding="utf-8")
    targeted_compare_path = get_round_compare_path(targeted_output_path)
    targeted_compare_path.with_name(f"{targeted_compare_path.stem}_review_decisions.json").unlink(missing_ok=True)
    targeted_compare_path.write_text(
        json.dumps(
            {
                "version": 2,
                "docId": "targeted-review-decisions-recovery",
                "round": 1,
                "chunkCount": 1,
                "qualitySummary": {"targetedRerunFallbackCount": 1, "targetedRerunFallbackChunkIds": ["p0_c0"]},
                "chunks": [
                    {
                        "chunkId": "p0_c0",
                        "paragraphIndex": 0,
                        "chunkIndex": 0,
                        "inputText": targeted_source,
                        "outputText": targeted_source,
                        "rerunStatus": "fallback",
                        "rerunFallbackMode": "previous",
                        "quality": {"needsReview": True, "flags": ["targeted_rerun_fallback"]},
                        "failedAttempts": [{"attempt": 1, "outputText": targeted_recovered, "error": "old false positive"}],
                    }
                ],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    export_round_output(str(targeted_output_path), str(targeted_export_path), "txt")
    targeted_compare_after = json.loads(targeted_compare_path.read_text(encoding="utf-8"))
    _assert(targeted_export_path.read_text(encoding="utf-8") == targeted_source, "Targeted fallback export must keep safe text until explicit failed-output adoption.", failures)
    _assert(targeted_compare_after.get("qualitySummary", {}).get("targetedRerunFallbackCount") == 1, "Reading/exporting compare must not clear targeted fallback summary by itself.", failures)
    save_review_decisions(
        str(targeted_output_path),
        {"p0_c0": {"mode": "custom", "source": "failed_output", "text": targeted_recovered, "confirmed": True}},
    )
    export_round_output(str(targeted_output_path), str(targeted_adopted_export_path), "txt")
    _assert(targeted_adopted_export_path.read_text(encoding="utf-8") == targeted_recovered, "Confirmed targeted failed-output decision must export the selected AI text.", failures)

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "failures": failures,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
