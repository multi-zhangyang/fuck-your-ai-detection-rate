#!/usr/bin/env python3
"""Regression for delta-based academic-register protection."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
import fyadr_round_service as f  # noqa: E402


FORMAL_SOURCE = (
    "随着传感器精度的提高，控制系统的响应能力同步增强，相关方法在工业场景中的应用范围持续扩大。"
    "实验部分围绕控制器参数、采样周期和噪声水平展开分析，并保持各项条件均与原设定一致。"
)
COLLOQUIAL_REWRITE = (
    "随着传感器精度的提高，控制系统的响应能力也跟着增强，相关方法在工业场景中用得越来越广。"
    "实验部分围绕控制器参数、采样周期和噪声水平展开分析，并保持各项条件均与原设定一致。"
)
FORMAL_REWRITE = (
    "传感器精度提高后，控制系统的响应能力相应增强，相关方法在工业场景中的应用范围也持续扩大。"
    "实验分析仍围绕控制器参数、采样周期和噪声水平展开，各项条件均与原设定保持一致。"
)


def _issue_codes(source: str, output: str) -> list[str]:
    return [
        str(item.get("code", ""))
        for item in f._collect_machine_style_validation_issues(source, output)
    ]


def main() -> int:
    # Preserving colloquial wording already present in a source is not a delta.
    preexisting = (
        "在访谈材料中，受访者使用了“用得越来越广”这一口语表述。"
        "本文保留该引语以维持原始语料，不将其改写为研究者自身的论断。"
    )
    if "academic_register_drift" in _issue_codes(preexisting, preexisting):
        raise AssertionError("an unchanged source colloquialism was falsely reported as newly introduced")
    f.validate_chunk_output(preexisting, preexisting, "preexisting-colloquial")

    count, phrases = f._find_introduced_colloquial_phrases(FORMAL_SOURCE, COLLOQUIAL_REWRITE)
    if count != 2 or phrases != ["也跟着增强", "用得越来越广"]:
        raise AssertionError(f"colloquial delta evidence is wrong: count={count}, phrases={phrases}")
    issues = f._collect_machine_style_validation_issues(FORMAL_SOURCE, COLLOQUIAL_REWRITE)
    register_issue = next((item for item in issues if item.get("code") == "academic_register_drift"), None)
    if not register_issue or register_issue.get("level") != "high":
        raise AssertionError(f"academic register drift was not emitted as a high issue: {issues}")
    try:
        f.validate_chunk_output(FORMAL_SOURCE, COLLOQUIAL_REWRITE, "new-colloquial")
    except ValueError as exc:
        if "academic_register_drift" not in str(exc):
            raise AssertionError(f"academic register hard gate raised the wrong error: {exc}") from exc
    else:
        raise AssertionError("new colloquial wording passed the hard validator")

    # The precise detector must protect short chunks too and avoid broad terms
    # that can be legitimate formal prose.
    short_source = "模型性能同步增强，应用范围持续扩大。"
    short_output = "模型性能也跟着增强，应用范围持续扩大。"
    if "academic_register_drift" not in _issue_codes(short_source, short_output):
        raise AssertionError("short academic chunk bypassed register validation")
    if f._find_introduced_colloquial_phrases("实际工程中采用该方法。", "实际工程里采用该方法。")[0] != 0:
        raise AssertionError("a deliberately unlisted natural expression was caught by an over-broad rule")
    f.validate_chunk_output(FORMAL_SOURCE, FORMAL_REWRITE, "formal-rewrite")

    quality = f._build_chunk_quality(FORMAL_SOURCE, COLLOQUIAL_REWRITE)
    if quality.get("introducedColloquialPhraseCount") != 2:
        raise AssertionError("chunk quality did not expose introduced colloquial count")
    if quality.get("introducedColloquialPhrases") != ["也跟着增强", "用得越来越广"]:
        raise AssertionError("chunk quality did not expose exact colloquial evidence")
    if quality.get("academicRegisterDrift") is not True:
        raise AssertionError("chunk quality did not expose academic-register drift state")
    if "academic_register_drift" not in (quality.get("flags") or []):
        raise AssertionError("academic-register drift remained advisory instead of review-blocking")
    if not any(
        isinstance(reason, dict) and reason.get("code") == "academic_register_drift"
        for reason in (quality.get("reviewReasons") or [])
    ):
        raise AssertionError("UI review reasons have no academic-register diagnosis")
    if app_service._default_export_decision_for_chunk({"quality": quality}) != "source":
        raise AssertionError("backend export default did not fail closed for academic-register drift")

    # A full-round first candidate is rejected and receives a precise repair
    # note.  The clean second candidate is eligible, but because this neutral
    # fixture does not improve the baseline's combined style score, bounded
    # selection explicitly preserves the already-formal baseline.
    work_dir = ROOT_DIR / "finish" / "regression" / "academic_register_drift"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)
    source_path = work_dir / "source.txt"
    output_path = work_dir / "round1.txt"
    manifest_path = work_dir / "round1_manifest.json"
    source_path.write_text(FORMAL_SOURCE, encoding="utf-8")
    prompts: list[str] = []

    def transform(_text: str, prompt: str, _round: int, _chunk_id: str) -> str:
        prompts.append(prompt)
        return COLLOQUIAL_REWRITE if len(prompts) == 1 else FORMAL_REWRITE

    result = f.run_round(
        doc_id="academic-register-drift-regression",
        round_number=1,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    if len(prompts) != 2:
        raise AssertionError(f"register drift should trigger one bounded retry, got {len(prompts)} calls")
    if "academic_register_drift" not in prompts[-1] or "precise academic written language" not in prompts[-1]:
        raise AssertionError("validation retry did not tell the model how to repair academic register")
    if output_path.read_text(encoding="utf-8") != FORMAL_SOURCE:
        raise AssertionError("bounded selection did not preserve the already-formal baseline")
    compare = json.loads(f.get_round_compare_path(output_path).read_text(encoding="utf-8"))
    retry_events = [
        event
        for event in (compare.get("validationEvents") or [])
        if event.get("event") == "validation-retry"
        and event.get("guardCategory") == "readability"
        and event.get("issueCodes") == ["academic_register_stability"]
        and event.get("textStored") is False
        and event.get("errorStored") is False
    ]
    if len(retry_events) != 1:
        raise AssertionError("compare evidence did not retain the rejected register-drift attempt")
    selection_events = [
        event
        for event in (compare.get("validationEvents") or [])
        if event.get("event") == "candidate-selection"
    ]
    if len(selection_events) != 1 or selection_events[0].get("decision") != "preserved_baseline":
        raise AssertionError("clean retry versus baseline decision was not preserved explicitly")
    if selection_events[0].get("publishedRewrite") is not False:
        raise AssertionError("preserved baseline was counted as a newly published rewrite")
    rejected_candidate = next(
        (
            candidate
            for candidate in (selection_events[0].get("candidates") or [])
            if isinstance(candidate, dict) and candidate.get("candidateId") == "model-attempt-1"
        ),
        None,
    )
    if not isinstance(rejected_candidate, dict) or rejected_candidate.get("hardValidationIssueCodes") != [
        "academic_register_drift"
    ]:
        raise AssertionError("candidate evidence lost the structured academic-register hard-gate reason")
    compare_selection = (compare.get("chunks") or [{}])[0].get("candidateSelection") or {}
    compare_rejected = next(
        (
            candidate
            for candidate in (compare_selection.get("candidates") or [])
            if isinstance(candidate, dict) and candidate.get("candidateId") == "model-attempt-1"
        ),
        None,
    )
    if not isinstance(compare_rejected, dict) or compare_rejected.get("hardValidationIssueCodes") != [
        "academic_register_drift"
    ]:
        raise AssertionError("compare chunk lost the structured academic-register hard-gate reason")
    summary = result.get("quality_summary") or {}
    if summary.get("introducedColloquialPhraseCount") != 0:
        raise AssertionError("accepted-round summary still reports rejected colloquial wording")

    # Exhausting the bounded academic-register retries completes with an
    # explicit source fallback. The run itself succeeds, while the compare
    # artifact keeps the text-free failures and requires manual review.
    resume_output_path = work_dir / "resume_round1.txt"
    resume_manifest_path = work_dir / "resume_round1_manifest.json"
    failed_resume_calls: list[str] = []

    def always_colloquial(_text: str, _prompt: str, _round: int, chunk_id: str) -> str:
        failed_resume_calls.append(chunk_id)
        return COLLOQUIAL_REWRITE

    fallback_result = f.run_round(
        doc_id="academic-register-drift-checkpoint-regression",
        round_number=1,
        input_path=source_path,
        output_path=resume_output_path,
        manifest_path=resume_manifest_path,
        transform=always_colloquial,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    if len(failed_resume_calls) != f.MAX_TOTAL_MODEL_ATTEMPTS:
        raise AssertionError("academic-register fallback did not use the bounded attempt budget")
    if resume_output_path.read_text(encoding="utf-8") != FORMAL_SOURCE:
        raise AssertionError("academic-register fallback did not preserve the exact source")
    resume_checkpoint_path = f.get_round_checkpoint_path(resume_output_path)
    if resume_checkpoint_path.exists():
        raise AssertionError("completed academic-register fallback left a stale checkpoint")
    resumed_compare = json.loads(Path(fallback_result["compare_path"]).read_text(encoding="utf-8"))
    checkpoint_register_retries = [
        event
        for event in (resumed_compare.get("validationEvents") or [])
        if event.get("event") == "validation-retry"
        and event.get("guardCategory") == "readability"
        and event.get("issueCodes") == ["academic_register_stability"]
        and event.get("textStored") is False
        and event.get("errorStored") is False
    ]
    if len(checkpoint_register_retries) != f.MAX_TOTAL_MODEL_ATTEMPTS:
        raise AssertionError("compare omitted rejected academic-register attempts")
    source_fallback_events = [
        event
        for event in (resumed_compare.get("validationEvents") or [])
        if event.get("event") == "source-fallback"
    ]
    if len(source_fallback_events) != 1 or source_fallback_events[0].get("reasonCode") != f.HARD_VALIDATION_EXHAUSTED_SOURCE_PRESERVED:
        raise AssertionError("compare omitted the explicit academic-register source fallback")
    selection_events = [
        event
        for event in (resumed_compare.get("validationEvents") or [])
        if event.get("event") == "candidate-selection"
    ]
    if len(selection_events) != 1 or selection_events[0].get("decision") != "preserved_baseline" or selection_events[0].get("runFailed") is not False:
        raise AssertionError("academic-register fallback selection was not an explicit completed baseline decision")
    resumed_failed_attempts = (resumed_compare.get("chunks") or [{}])[0].get("failedAttempts") or []
    if len(resumed_failed_attempts) != f.MAX_TOTAL_MODEL_ATTEMPTS or not all(
        attempt.get("guardCategory") == "readability"
        and attempt.get("issueCodes") == ["academic_register_stability"]
        and attempt.get("textStored") is False
        and attempt.get("errorStored") is False
        and "outputText" not in attempt
        and "error" not in attempt
        for attempt in resumed_failed_attempts
    ):
        raise AssertionError("final compare did not materialize academic-register failures")
    if (resumed_compare.get("chunks") or [{}])[0].get("fallbackMode") != "source":
        raise AssertionError("final compare did not expose source fallback mode")
    if (fallback_result.get("quality_summary") or {}).get("sourceFallbackCount") != 1:
        raise AssertionError("quality summary did not count the academic-register source fallback")

    print("academic register drift regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
