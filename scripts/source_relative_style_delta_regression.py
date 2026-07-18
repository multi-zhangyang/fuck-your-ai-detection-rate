#!/usr/bin/env python3
"""Focused offline regression for source-relative v4.1 admission evidence."""

from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
import fyadr_round_service as round_service  # noqa: E402
import source_relative_style_delta as delta  # noqa: E402
from chunking import build_manifest, save_manifest  # noqa: E402


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _global_profile(texts: list[str]) -> dict[str, object]:
    profile = round_service.build_global_style_profile_from_texts(texts)
    document_profile = profile.get("documentPatternBaseline")
    _assert(delta.source_pattern_profile_valid(document_profile), "fixture profile is invalid")
    return profile


def _selection(
    *,
    chunk_id: str,
    baseline_text: str,
    candidate_text: str,
    document_texts: list[str],
) -> tuple[dict[str, object], dict[str, object]]:
    global_style_profile = _global_profile(document_texts)
    baseline = round_service._evaluate_rewrite_candidate(
        input_text=baseline_text,
        output_text=baseline_text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        global_style_profile=global_style_profile,
    )
    candidate = round_service._evaluate_rewrite_candidate(
        input_text=baseline_text,
        output_text=candidate_text,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        global_style_profile=global_style_profile,
    )
    _assert(candidate.get("safetyEligible") is True, f"{chunk_id} fixture candidate is ineligible")
    event = round_service._build_candidate_selection_event(
        chunk_id=chunk_id,
        round_number=1,
        candidates=[baseline, candidate],
        selected=candidate,
        reason_codes=["source-relative-regression"],
        conditional_retry_count=0,
    )
    _assert(event.get("publishedRewrite") is True, f"{chunk_id} fixture was not published")
    return event, global_style_profile


def _assert_algorithm_matrix(checks: list[str]) -> None:
    sequence_openers = ("首先", "其次", "再次", "最后", "第一", "第二", "第三", "其一")
    source = "".join(
        f"{opener}，第{index}项分析说明样本处理过程保持稳定。"
        for index, opener in enumerate(sequence_openers, start=1)
    )
    repeated = "".join(
        f"基于第{index}项材料，分析说明样本处理过程保持稳定。"
        for index in range(1, 9)
    )
    profile = delta.build_source_pattern_profile([source])
    evidence = delta.assess_source_relative_style_delta(
        source,
        repeated,
        source_pattern_profile=profile,
    )
    _assert(evidence.get("passed") is False, "8-sentence replacement escaped the gate")
    blocking = set(evidence.get("blockingIssueCodes") or [])
    _assert(
        {
            delta.REPEATED_OPENING_FAMILY_INTRODUCED,
            delta.REPEATED_SENTENCE_SKELETON_INTRODUCED,
        }
        <= blocking,
        "opening/skeleton positive deltas were not independently blocked",
    )

    retained_profile = delta.build_source_pattern_profile([repeated])
    retained = delta.assess_source_relative_style_delta(
        repeated,
        repeated,
        source_pattern_profile=retained_profile,
    )
    _assert(delta.source_relative_style_delta_passed(retained), "retained source pattern was misclassified")
    _assert(
        retained["openingFamilyDelta"]["introducedPatternCount"] == 0,
        "retained source family was reported as introduced",
    )

    switched = repeated.replace("基于", "通过")
    switched_evidence = delta.assess_source_relative_style_delta(
        repeated,
        switched,
        source_pattern_profile=retained_profile,
    )
    _assert(
        delta.REPEATED_OPENING_FAMILY_INTRODUCED
        in set(switched_evidence.get("blockingIssueCodes") or []),
        "removing one repeated family cancelled a newly introduced family",
    )

    two_sentence = "基于样本记录，系统完成核验。基于审阅意见，研究团队修正表述。"
    two_evidence = delta.assess_source_relative_style_delta(
        "系统完成样本记录核验。研究团队依据审阅意见修正表述。",
        two_sentence,
    )
    _assert(delta.source_relative_style_delta_passed(two_evidence), "two natural openings were over-blocked")

    collapse_source = (
        "研究团队整理样本并记录来源。分析人员依据规则标注主题。"
        "复核人员逐项检查原始记录。最终结论仅依据已经复核的材料形成。"
    )
    collapse_output = (
        "研究团队整理样本并记录来源，分析人员依据规则标注主题，"
        "复核人员逐项检查原始记录，最终结论仅依据已经复核的材料形成。"
    )
    collapse = delta.assess_source_relative_style_delta(collapse_source, collapse_output)
    _assert(
        delta.SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED
        in set(collapse.get("blockingIssueCodes") or []),
        "Chinese 4-to-1 boundary collapse escaped",
    )

    english_source = (
        '"The first claim remains fully supported." '
        "The second claim records the sampling boundary. "
        "The third claim reports the validation result. "
        "The fourth claim states the remaining limitation."
    )
    english_output = (
        "The first claim remains fully supported, the second claim records the sampling boundary, "
        "the third claim reports the validation result, and the fourth claim states the remaining limitation."
    )
    english_collapse = delta.assess_source_relative_style_delta(english_source, english_output)
    _assert(
        english_collapse["sentenceBoundaryDelta"]["inputSentenceCount"] == 4
        and delta.SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED
        in set(english_collapse.get("blockingIssueCodes") or []),
        "English full stops/closing quote did not participate in collapse detection",
    )

    fragmented = delta.assess_source_relative_style_delta(
        "研究结论建立在完整样本核验之上。方法边界由复核记录共同确定。数据解释保持完整。",
        "结论明确。方法可行。数据可靠。边界清楚。结果稳定。",
    )
    _assert(
        delta.SENTENCE_FRAGMENTATION_INTRODUCED
        in set(fragmented.get("blockingIssueCodes") or []),
        "short-fragment inflation escaped",
    )

    corrupt_profile = copy.deepcopy(profile)
    corrupt_profile["sentenceCount"] = int(corrupt_profile["sentenceCount"]) + 1
    corrupted = delta.assess_source_relative_style_delta(
        source,
        source,
        source_pattern_profile=corrupt_profile,
    )
    _assert(
        corrupted.get("contextScope") == "invalid"
        and corrupted.get("ready") is False
        and delta.SOURCE_PATTERN_PROFILE_INVALID
        in set(corrupted.get("blockingIssueCodes") or []),
        "supplied corrupt profile silently downgraded to local context",
    )

    serialized = json.dumps(evidence, ensure_ascii=False, sort_keys=True)
    _assert(source not in serialized and repeated not in serialized, "evidence leaked a document body")
    for private_key in ("inputText", "outputText", "matchedText", "excerpt", "preview"):
        _assert(f'"{private_key}"' not in serialized, f"evidence leaked {private_key}")
    _assert(evidence["claims"]["isAiDetector"] is False, "evidence claimed AI detection")
    _assert(evidence["claims"]["claimsDetectionRate"] is False, "evidence claimed a detection rate")
    checks.append("per-pattern, boundary, profile-integrity, English and text-free matrix")


def _assert_selector_and_postprocess(checks: list[str]) -> None:
    source = "".join(
        f"{opener}，第{index}项分析说明样本处理过程保持稳定。"
        for index, opener in enumerate(("首先", "其次", "再次", "最后", "第一", "第二", "第三", "其一"), start=1)
    )
    bad = "".join(
        f"基于第{index}项材料，分析说明样本处理过程保持稳定。"
        for index in range(1, 9)
    )
    retry_notes: list[str] = []
    result = app_service._run_bounded_app_candidate_selection(
        input_text=source,
        chunk_id="p0_c0",
        round_number=1,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=_global_profile([source]),
        generate=lambda attempt, note: retry_notes.append(str(note or "")) or bad,
        validate=lambda text: text,
        record_hard_failure=lambda *_args: None,
    )
    _assert(result.get("attemptCount") == 2, "source-relative rejection skipped its bounded retry")
    _assert(result.get("text") == source, "blocked repeated candidate displaced the baseline")
    model_candidates = [
        item
        for item in result["selectionEvent"].get("candidates", [])
        if isinstance(item, dict) and item.get("origin") == "model"
    ]
    _assert(
        all(
            "source_relative_style_delta_failed" in set(item.get("rejectionReasonCodes") or [])
            for item in model_candidates
        ),
        "selector did not persist stable source-relative rejection reasons",
    )
    _assert(
        len(retry_notes) == 2 and "Source-relative style repair" in retry_notes[1],
        "bounded retry did not receive concrete source-relative guidance",
    )

    post_source = (
        "研究团队整理样本并记录来源。分析人员依据规则标注主题。"
        "复核人员逐项检查原始记录。最终结论仅依据已经复核的材料形成。"
    )
    safe_candidate = post_source.replace("整理样本", "汇总样本", 1)
    collapsed_postprocess = safe_candidate.replace("。", "，", 3)
    original_select = round_service._select_rewrite_candidate
    original_postprocess = round_service._apply_deterministic_burstiness_pass
    try:
        round_service._select_rewrite_candidate = (
            lambda candidates, **_kwargs: (
                next(item for item in candidates if item.get("origin") == "model"),
                ["forced-safe-fixture"],
            )
        )
        round_service._apply_deterministic_burstiness_pass = (
            lambda *_args, **_kwargs: collapsed_postprocess
        )
        rewritten = round_service._rewrite_round_chunk(
            index=1,
            chunk=build_manifest(post_source, chunk_limit=1000, chunk_metric="char").chunks[0],
            round_number=1,
            normalized_prompt_profile="cn_custom",
            prompt_text="仅做保守改写。",
            transform=lambda *_args: safe_candidate,
            global_style_profile=_global_profile([post_source]),
            round_dimension={"id": "burst", "primaryMetric": "burstinessRatio"},
        )
    finally:
        round_service._select_rewrite_candidate = original_select
        round_service._apply_deterministic_burstiness_pass = original_postprocess
    _assert(rewritten.output_text == safe_candidate, "postprocess bypassed source-relative admission")
    terminal = next(
        event for event in rewritten.validation_events if event.get("event") == "candidate-selection"
    )
    _assert(terminal.get("postprocessApplied") is False, "rejected postprocess was marked applied")
    _assert(
        any(
            event.get("event") == "deterministic-burstiness-postprocess-skipped"
            and delta.SENTENCE_BOUNDARY_COLLAPSE_INTRODUCED
            in set(event.get("reasonCodes") or [])
            for event in rewritten.validation_events
        ),
        "postprocess rejection lost its sentence-boundary reason",
    )
    checks.append("bounded selector retry/fallback and postprocess non-bypass")


def _assert_document_accumulation(checks: list[str]) -> None:
    sources = [f"第{index}项说明研究流程与数据处理保持稳定。" for index in range(1, 7)]
    outputs = [
        f"基于第{index}项材料，研究流程与数据处理保持稳定。"
        for index in range(1, 7)
    ]
    profile = delta.build_source_pattern_profile(sources)
    for source, output in zip(sources, outputs):
        local_candidate = delta.assess_source_relative_style_delta(
            source,
            output,
            source_pattern_profile=profile,
        )
        _assert(
            delta.source_relative_style_delta_passed(local_candidate),
            "individually-small cross-chunk fixture stopped being a bypass sentinel",
        )
    whole = delta.assess_source_relative_document_delta(sources, outputs)
    _assert(
        whole.get("passed") is False
        and delta.REPEATED_OPENING_FAMILY_INTRODUCED
        in set(whole.get("blockingIssueCodes") or []),
        "six individually-small openings escaped cumulative document evidence",
    )

    manifest = build_manifest("\n\n".join(sources), chunk_limit=1000, chunk_metric="char")
    global_style_profile = _global_profile(sources)
    events: list[dict[str, object]] = []
    chunk_outputs: dict[str, str] = {}
    for chunk, output in zip(manifest.chunks, outputs):
        baseline = round_service._evaluate_rewrite_candidate(
            input_text=chunk.text,
            output_text=chunk.text,
            candidate_id="baseline",
            origin="baseline",
            attempt=0,
            hard_valid=True,
            global_style_profile=global_style_profile,
        )
        candidate = round_service._evaluate_rewrite_candidate(
            input_text=chunk.text,
            output_text=output,
            candidate_id="model-attempt-1",
            origin="model",
            attempt=1,
            hard_valid=True,
            global_style_profile=global_style_profile,
        )
        events.append(
            round_service._build_candidate_selection_event(
                chunk_id=chunk.chunk_id,
                round_number=1,
                candidates=[baseline, candidate],
                selected=candidate,
                reason_codes=["cross-chunk-fixture"],
                conditional_retry_count=0,
            )
        )
        chunk_outputs[chunk.chunk_id] = output
    final_document, rejected = round_service._arbitrate_document_pattern_accumulation(
        manifest,
        chunk_outputs,
        events,
    )
    _assert(delta.source_relative_document_delta_passed(final_document), "main arbitration stayed unsafe")
    _assert(len(rejected) == 3, f"main arbitration rejected an unexpected set: {rejected}")
    for rejected_id in rejected:
        event = next(item for item in events if item.get("chunkId") == rejected_id and item.get("event") == "candidate-selection")
        _assert(
            event.get("publishedRewrite") is False
            and round_service.DOCUMENT_PATTERN_ACCUMULATION_BLOCKED
            in set(event.get("reasonCodes") or [])
            and event.get("postprocessApplied") is False,
            "arbitration fallback did not synchronize candidate publication evidence",
        )

    baseline_round = [
        "基于甲项材料，系统记录处理结果。",
        "基于乙项材料，系统记录核验结果。",
        "基于丙项材料，系统记录复核结果。",
        "系统记录最终审阅结果。",
    ]
    next_round = [*baseline_round[:3], "基于最终审阅材料，系统记录最终审阅结果。"]
    first_round = delta.assess_source_relative_document_delta(
        ["系统记录甲项处理结果。", "系统记录乙项核验结果。", "系统记录丙项复核结果。", baseline_round[3]],
        baseline_round,
    )
    second_round = delta.assess_source_relative_document_delta(baseline_round, next_round)
    _assert(delta.source_relative_document_delta_passed(first_round), "0-to-3 round was over-blocked")
    _assert(
        second_round.get("passed") is False,
        "cross-round 3-to-4 single addition escaped cumulative threshold",
    )

    net_zero_before = [
        "基于甲项材料，系统记录处理结果。基于乙项材料，系统记录核验结果。",
        "基于丙项材料，系统记录复核结果。",
        "系统记录最终审阅结果。",
    ]
    net_zero_after = [
        "系统记录甲项处理结果。基于乙项材料，系统记录核验结果。",
        "基于丙项材料，系统记录复核结果。",
        "基于最终审阅材料，系统记录最终审阅结果。",
    ]
    net_zero = delta.assess_source_relative_document_delta(net_zero_before, net_zero_after)
    _assert(delta.source_relative_document_delta_passed(net_zero), "net-zero family redistribution was blocked")
    net_manifest = build_manifest("\n\n".join(net_zero_before), chunk_limit=1000, chunk_metric="char")
    net_outputs = {
        chunk.chunk_id: output
        for chunk, output in zip(net_manifest.chunks, net_zero_after)
    }
    net_final, net_rejected = round_service._arbitrate_document_pattern_accumulation(
        net_manifest,
        net_outputs,
        [],
    )
    _assert(
        delta.source_relative_document_delta_passed(net_final) and not net_rejected,
        "full-document fast path rejected a safe net-zero redistribution",
    )

    original_limit = delta.MAX_SOURCE_PATTERN_PROFILE_CHUNKS
    try:
        delta.MAX_SOURCE_PATTERN_PROFILE_CHUNKS = 3
        try:
            delta.assess_source_relative_document_delta(
                ("文本。" for _ in range(4)),
                ("文本。" for _ in range(4)),
            )
        except ValueError:
            pass
        else:
            raise AssertionError("document assessor did not fail before an over-limit profile build")
    finally:
        delta.MAX_SOURCE_PATTERN_PROFILE_CHUNKS = original_limit
    checks.append("cross-chunk, cross-round, net-zero and bounded document arbitration")


def _modern_compare(
    *,
    source: str,
    baseline: str,
    output: str,
) -> dict[str, Any]:
    event, global_style_profile = _selection(
        chunk_id="p0_c0",
        baseline_text=baseline,
        candidate_text=output,
        document_texts=[baseline],
    )
    profile = global_style_profile["documentPatternBaseline"]
    return {
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": source,
                "outputText": output,
                "candidateBaselineText": baseline,
                "candidateSelection": event,
                "quality": {"needsReview": False, "flags": []},
            }
        ],
        "sourcePatternProfiles": {str(profile["profileSha256"]): profile},
        "sourceRelativeDocumentDelta": delta.assess_source_relative_document_delta(
            [source],
            [output],
        ),
    }


def _expect_release_issue(compare: dict[str, Any], decisions: dict[str, Any], issue: str) -> None:
    try:
        app_service._assert_document_release_payload(compare, decisions)
    except app_service.DocumentReleaseGateError as exc:
        _assert(issue in exc.issue_codes, f"missing release issue {issue}: {exc.issue_codes}")
        serialized = json.dumps(exc.details, ensure_ascii=False, sort_keys=True)
        for chunk in compare.get("chunks", []):
            if not isinstance(chunk, dict):
                continue
            for key in ("inputText", "outputText", "candidateBaselineText"):
                text = chunk.get(key)
                _assert(not isinstance(text, str) or text not in serialized, "release error leaked body text")
        return
    raise AssertionError(f"release unexpectedly accepted {issue}")


def _assert_release_and_effective_context(checks: list[str]) -> None:
    source = "本研究采用控制实验评估所提出方法的稳定性，并在统一条件下比较不同参数设置的结果。"
    baseline = "本研究通过控制实验评估所提出方法的稳定性，并在统一条件下比较不同参数设置所得结果。"
    output = "本研究通过控制实验检验所提出方法的稳定性，并在统一条件下比较不同参数设置所得结果。"
    app_service.validate_chunk_output(baseline, output, "p0_c0")
    compare = _modern_compare(source=source, baseline=baseline, output=output)
    reports = app_service._assert_document_release_payload(
        compare,
        {"p0_c0": "rewrite_confirmed"},
    )
    _assert(reports[0]["mode"] == "published_rewrite", "B-to-C targeted release was rejected")

    missing_baseline = copy.deepcopy(compare)
    missing_baseline["chunks"][0].pop("candidateBaselineText")
    _expect_release_issue(
        missing_baseline,
        {"p0_c0": "rewrite_confirmed"},
        "candidate_baseline_text_missing_or_invalid",
    )
    missing_profile = copy.deepcopy(compare)
    missing_profile["sourcePatternProfiles"] = {}
    _expect_release_issue(
        missing_profile,
        {"p0_c0": "rewrite_confirmed"},
        "result_source_pattern_profile_missing_or_invalid",
    )

    four_source = (
        "研究团队整理样本并记录来源。分析人员依据规则标注主题。"
        "复核人员逐项检查原始记录。最终结论仅依据已经复核的材料形成。"
    )
    safe_four = four_source.replace("整理样本", "汇总样本", 1)
    collapsed = safe_four.replace("。", "，", 3)
    tampered = _modern_compare(source=four_source, baseline=four_source, output=safe_four)
    event = tampered["chunks"][0]["candidateSelection"]
    selected = next(
        item
        for item in event["candidates"]
        if isinstance(item, dict) and item.get("candidateId") == event.get("selectedCandidateId")
    )
    profile = next(iter(tampered["sourcePatternProfiles"].values()))
    forged = delta.assess_source_relative_style_delta(
        four_source,
        collapsed,
        source_pattern_profile=profile,
    )
    forged["passed"] = True
    forged["blockingIssueCodes"] = []
    forged["sentenceBoundaryDelta"]["collapsed"] = False
    forged["sentenceBoundaryDelta"]["issueCodes"] = []
    collapsed_hash = _sha256(collapsed)
    selected["textSha256"] = collapsed_hash
    selected["charCount"] = len(collapsed)
    selected["sourceRelativeStyleDelta"] = forged
    selected["sourceRelativeStyleGuardPassed"] = True
    event["selectedTextSha256"] = collapsed_hash
    event["resultTextSha256"] = collapsed_hash
    event["publishedTextSha256"] = collapsed_hash
    event["selectedCharCount"] = len(collapsed)
    event["resultCharCount"] = len(collapsed)
    event["publishedCharCount"] = len(collapsed)
    event["resultSourceRelativeStyleDelta"] = forged
    tampered["chunks"][0]["outputText"] = collapsed
    tampered["sourceRelativeDocumentDelta"] = delta.assess_source_relative_document_delta(
        [four_source],
        [collapsed],
    )
    _assert(delta.source_relative_style_delta_passed(forged), "forged fixture was not superficially passed")
    _expect_release_issue(
        tampered,
        {"p0_c0": "rewrite_confirmed"},
        "result_source_relative_style_fresh_assessment_mismatch",
    )

    unsafe_source = "".join(
        f"第{index}项说明样本处理流程保持稳定。" for index in range(1, 5)
    )
    unsafe_raw = "".join(
        f"基于第{index}项材料，样本处理流程保持稳定。" for index in range(1, 5)
    )
    safe_source = "研究团队记录复核结果并说明方法边界。"
    safe_output = "研究团队汇总复核结果并说明方法边界。"
    safe_event, safe_global = _selection(
        chunk_id="p1_c0",
        baseline_text=safe_source,
        candidate_text=safe_output,
        document_texts=[unsafe_source, safe_source],
    )
    safe_profile = safe_global["documentPatternBaseline"]
    mixed_compare = {
        "chunks": [
            {
                "chunkId": "p0_c0",
                "inputText": unsafe_source,
                "outputText": unsafe_raw,
                "quality": {"needsReview": False, "flags": []},
            },
            {
                "chunkId": "p1_c0",
                "inputText": safe_source,
                "outputText": safe_output,
                "candidateBaselineText": safe_source,
                "candidateSelection": safe_event,
                "quality": {"needsReview": False, "flags": []},
            },
        ],
        "sourcePatternProfiles": {str(safe_profile["profileSha256"]): safe_profile},
        "sourceRelativeDocumentDelta": delta.assess_source_relative_document_delta(
            [unsafe_source, safe_source],
            [unsafe_raw, safe_output],
        ),
    }
    _assert(
        mixed_compare["sourceRelativeDocumentDelta"]["passed"] is False,
        "mixed source-escape fixture lost its unsafe discarded raw output",
    )
    mixed_reports = app_service._assert_document_release_payload(
        mixed_compare,
        {"p0_c0": "source_confirmed", "p1_c0": "rewrite_confirmed"},
    )
    _assert(
        [item["mode"] for item in mixed_reports[:2]] == ["source", "published_rewrite"],
        "safe source override was blocked by a discarded raw candidate",
    )

    custom_source = "该部分说明样本处理流程保持稳定。"
    custom_text = "基于现有材料，该部分说明样本处理流程保持稳定。"
    custom_compare = {
        "chunks": [
            {
                "chunkId": f"p{index}_c0",
                "inputText": custom_source,
                "outputText": custom_source,
                "quality": {"needsReview": False, "flags": []},
            }
            for index in range(4)
        ]
    }
    custom_decisions = {
        f"p{index}_c0": {
            "mode": "custom",
            "text": custom_text,
            "source": "manual",
            "confirmed": True,
        }
        for index in range(4)
    }
    _expect_release_issue(
        custom_compare,
        custom_decisions,
        "materialized_source_relative_document_delta_failed",
    )
    checks.append("B-to-C authority, profile/hash tamper, source escape and custom cumulative release")


def _assert_confirmed_custom_soft_noop(checks: list[str]) -> None:
    source = "研究团队整理样本并记录来源，复核人员依据记录确认方法边界。"
    previous_output = "研究团队汇总样本并记录来源，复核人员依据记录确认方法边界。"
    confirmed_custom = "研究团队核对样本并记录来源，复核人员依据记录确认方法边界。"
    finish_root = ROOT_DIR / "finish"
    finish_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="source_relative_custom_noop_", dir=finish_root) as temp_dir:
        root = Path(temp_dir)
        output_path = root / "round1.txt"
        manifest_path = root / "round1_manifest.json"
        compare_path = round_service.get_round_compare_path(output_path)
        review_path = compare_path.with_name(f"{compare_path.stem}_review_decisions.json")
        manifest = build_manifest(source, chunk_limit=1000, chunk_metric="char")
        save_manifest(manifest, manifest_path)
        event, global_style_profile = _selection(
            chunk_id="p0_c0",
            baseline_text=source,
            candidate_text=previous_output,
            document_texts=[source],
        )
        profile = global_style_profile["documentPatternBaseline"]
        revision = "2026-07-18T00:00:00Z"
        compare = {
            "version": 3,
            "docId": "source-relative-custom-noop",
            "round": 1,
            "promptProfile": "cn_custom",
            "promptSequence": ["classical"],
            "outputPath": str(output_path),
            "manifestPath": str(manifest_path),
            "chunkCount": 1,
            "paragraphCount": 1,
            "updatedAt": revision,
            "reviewUpdatedAt": revision,
            "chunks": [
                {
                    "chunkId": "p0_c0",
                    "paragraphIndex": 0,
                    "chunkIndex": 0,
                    "inputText": source,
                    "outputText": previous_output,
                    "candidateBaselineText": source,
                    "candidateSelection": event,
                    "quality": {"needsReview": False, "flags": []},
                }
            ],
            "validationEvents": [event],
            "qualitySummary": {},
            "sourcePatternProfiles": {str(profile["profileSha256"]): profile},
            "sourceRelativeDocumentDelta": delta.assess_source_relative_document_delta(
                [source],
                [previous_output],
            ),
        }
        output_path.write_text(previous_output, encoding="utf-8")
        compare_path.write_text(json.dumps(compare, ensure_ascii=False, indent=2), encoding="utf-8")
        review = {
            "outputPath": str(output_path),
            "updatedAt": revision,
            "compareRevision": revision,
            "reviewBaseCompareRevision": revision,
            "decisions": {
                "p0_c0": {
                    "mode": "custom",
                    "text": confirmed_custom,
                    "source": "manual",
                    "confirmed": True,
                }
            },
        }
        review_path.write_text(json.dumps(review, ensure_ascii=False, indent=2), encoding="utf-8")
        before_compare = compare_path.read_bytes()
        before_review = review_path.read_bytes()
        before_output = output_path.read_bytes()
        original_builder = app_service._build_transform_from_model_config
        try:
            app_service._build_transform_from_model_config = (
                lambda _config: (lambda chunk_text, *_args: chunk_text, "offline-fixture")
            )
            response = app_service.rerun_compare_chunk(
                str(output_path),
                "p0_c0",
                {
                    "baseUrl": "http://127.0.0.1:9",
                    "apiKey": "fixture",
                    "model": "fixture",
                    "promptProfile": "cn_custom",
                    "promptSequence": ["classical"],
                },
            )
        finally:
            app_service._build_transform_from_model_config = original_builder
        _assert(response.get("preservedExisting") is True, "preserved custom baseline was not a soft no-op")
        _assert(
            isinstance(response.get("candidateSelectionAttempt"), dict)
            and response["candidateSelectionAttempt"].get("publishedRewrite") is False,
            "soft no-op response lost text-free attempt evidence",
        )
        _assert(compare_path.read_bytes() == before_compare, "soft no-op mutated compare authority")
        _assert(review_path.read_bytes() == before_review, "soft no-op mutated confirmed custom review")
        _assert(output_path.read_bytes() == before_output, "soft no-op mutated the output cache")
    checks.append("confirmed custom + preserved baseline is a zero-mutation soft no-op")


def main() -> int:
    checks: list[str] = []
    _assert_algorithm_matrix(checks)
    _assert_selector_and_postprocess(checks)
    _assert_document_accumulation(checks)
    _assert_release_and_effective_context(checks)
    _assert_confirmed_custom_soft_noop(checks)
    print(json.dumps({"ok": True, "checkCount": len(checks), "checks": checks}, ensure_ascii=False, indent=2))
    print("source_relative_style_delta_regression: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
