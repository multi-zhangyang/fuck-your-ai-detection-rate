from __future__ import annotations

import copy
import json
import threading
import time
from tempfile import TemporaryDirectory
from pathlib import Path

from chunking import Chunk, build_manifest
import fyadr_round_service as service


DIMENSION = {
    "id": "connector_detail",
    "label": "衔接与终稿",
    "primaryMetric": "connectorDensity",
    "secondaryMetric": "burstConnectorDensity",
}

SOURCE = (
    "首先，系统读取用户提交的论文段落并建立任务记录。"
    "其次，服务按照段落边界生成改写单元并保留原有编号。"
    "此外，校验模块核对术语、数值和引用标记。"
    "因此，只有通过事实与格式检查的文本才会进入结果页，审阅者仍需确认每处修改。"
)
CONVERGED = (
    "系统读取用户提交的论文段落并建立任务记录，服务再按照段落边界生成改写单元，同时保留原有编号。"
    "校验模块负责核对术语、数值和引用标记；文本仅在通过事实与格式检查后进入结果页，"
    "审阅者仍需确认每处修改。"
)
SOURCE_TWO = (
    "首先，研究团队整理访谈材料并记录样本来源。"
    "其次，分析人员按照编码规则标注主题及其出现位置。"
    "此外，复核人员逐项检查原始记录与编码结果。"
    "因此，研究结论只能依据已经完成复核的材料形成，未确认的信息不会写入论文。"
)
CONVERGED_TWO = (
    "研究团队整理访谈材料并记录样本来源，分析人员随后按照编码规则标注主题及其出现位置。"
    "复核人员逐项检查原始记录与编码结果；研究结论只依据已经完成复核的材料形成，"
    "未确认的信息不会写入论文。"
)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _chunk(text: str = SOURCE, chunk_id: str = "p0_c0", paragraph_index: int = 0) -> Chunk:
    return Chunk(chunk_id, paragraph_index, 0, text, len(text), 0)


def _selection_event(result: service.ChunkRewriteResult) -> dict[str, object]:
    events = [event for event in result.validation_events if event.get("event") == "candidate-selection"]
    _assert(len(events) == 1, f"expected exactly one candidate-selection event, got {len(events)}")
    return events[0]


def _run_direct(
    outputs: list[str],
    *,
    text: str = SOURCE,
    round_dimension: dict[str, object] | None = DIMENSION,
) -> tuple[service.ChunkRewriteResult, list[str]]:
    prompts: list[str] = []

    def transform(_input_text: str, prompt: str, _round: int, _chunk_id: str) -> str:
        prompts.append(prompt)
        return outputs[min(len(prompts) - 1, len(outputs) - 1)]

    result = service._rewrite_round_chunk(
        index=1,
        chunk=_chunk(text),
        round_number=2,
        normalized_prompt_profile="cn_custom",
        prompt_text="只修正冗余公式化连接词，保持事实与格式。",
        transform=transform,
        global_style_profile=service.build_global_style_profile_from_texts([text]),
        round_dimension=round_dimension,
    )
    return result, prompts


def _assert_event_honesty(event: dict[str, object]) -> None:
    _assert(event.get("schema") == service.CANDIDATE_SELECTION_SCHEMA, "candidate event schema drifted")
    _assert(event.get("schemaVersion") == service.CANDIDATE_SELECTION_VERSION, "candidate schema version drifted")
    _assert(event.get("isAiDetector") is False, "candidate selector must not claim to be an AI detector")
    _assert(event.get("claimsDetectionRate") is False, "candidate selector must not claim a detection-rate result")
    _assert("semanticAssessment" not in event, "lexical retention was exposed as a semantic assessment")
    retention = event.get("retentionAssessment")
    _assert(isinstance(retention, dict), "candidate event lost lexical-retention disclosure")
    _assert(
        retention.get("name") == "deterministic-lexical-retention-proxy",
        "lexical-retention proxy has a misleading name",
    )
    _assert(retention.get("usesEmbedding") is False, "lexical retention was mislabeled as an embedding")
    _assert(retention.get("usesModel") is False, "lexical retention was mislabeled as a model judgement")
    _assert(retention.get("claimsSemanticEquivalence") is False, "lexical retention claimed semantic equivalence")
    _assert(retention.get("isAiDetector") is False, "lexical retention was mislabeled as an AI detector")
    _assert(retention.get("claimsDetectionRate") is False, "lexical retention claimed a detection-rate result")
    for candidate in event.get("candidates", []):
        _assert(isinstance(candidate, dict), "candidate evidence must be an object")
        for forbidden_key in (
            "_text",
            "text",
            "inputText",
            "outputText",
            "rawText",
            "candidateText",
            "hardValidationError",
        ):
            _assert(forbidden_key not in candidate, f"candidate evidence persisted candidate body via {forbidden_key}")
        proxy = candidate.get("deterministicLexicalRetentionProxy")
        _assert(isinstance(proxy, dict), "candidate evidence lost deterministic lexical-retention proxy")
        _assert(
            proxy.get("name") == "deterministic-lexical-retention-proxy",
            "candidate lexical-retention proxy has a misleading name",
        )
        _assert(proxy.get("claimsSemanticEquivalence") is False, "proxy claimed semantic equivalence")
        _assert(proxy.get("isAiDetector") is False, "proxy was mislabeled as an AI detector")
        _assert(proxy.get("claimsDetectionRate") is False, "proxy claimed a detection-rate result")
        readability = candidate.get("academicReadabilityDelta")
        _assert(isinstance(readability, dict), "candidate evidence lost academic-readability delta")
        _assert(
            readability.get("schema") == "fyadr.academic-readability-delta"
            and readability.get("schemaVersion") == 1,
            "academic-readability evidence schema drifted",
        )
        _assert(
            candidate.get("readabilityGuardPassed") is (readability.get("ok") is True),
            "readability guard disagrees with its delta assessment",
        )
        _assert(
            list(candidate.get("readabilityIssueCodes") or []) == list(readability.get("issueCodes") or []),
            "readability issue-code projection drifted",
        )
        serialized_readability = json.dumps(readability, ensure_ascii=False, sort_keys=True)
        for forbidden_body_key in ("inputText", "outputText", "matchedText", "excerpt", "preview"):
            _assert(forbidden_body_key not in serialized_readability, f"readability evidence leaked {forbidden_body_key}")


def _assert_direct_selection_behaviour() -> None:
    # Readability is a shared hard eligibility gate. A candidate that improves
    # a style metric still cannot win after introducing colloquial register;
    # the second bounded attempt may recover with a formal candidate.
    readability_source = "该方法在工程场景中的应用范围持续扩大。"
    readability_bad = "该方法在工程场景中用得越来越广。"
    readability_good = "该方法已逐步扩展至更多工程应用场景。"
    readability_dimension = {"id": "neutral", "primaryMetric": ""}
    readability_baseline = service._evaluate_rewrite_candidate(
        input_text=readability_source,
        output_text=readability_source,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=readability_dimension,
    )
    unreadable_candidate = service._evaluate_rewrite_candidate(
        input_text=readability_source,
        output_text=readability_bad,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=readability_dimension,
    )
    readable_candidate = service._evaluate_rewrite_candidate(
        input_text=readability_source,
        output_text=readability_good,
        candidate_id="model-attempt-2",
        origin="model",
        attempt=2,
        hard_valid=True,
        round_dimension=readability_dimension,
    )
    _assert(unreadable_candidate.get("readabilityGuardPassed") is False, "colloquial delta passed readability guard")
    _assert(unreadable_candidate.get("safetyEligible") is False, "readability regression remained safety eligible")
    _assert(
        "colloquial_register_introduced" in list(unreadable_candidate.get("readabilityIssueCodes") or []),
        "readability regression lost its stable issue code",
    )
    _assert(
        "academic_readability_delta_failed" in list(unreadable_candidate.get("rejectionReasonCodes") or []),
        "readability regression lost its selector rejection reason",
    )
    _assert(
        service._candidate_requires_conditional_retry(
            unreadable_candidate,
            readability_baseline,
            round_dimension=readability_dimension,
        ),
        "readability regression did not trigger the bounded repair attempt",
    )
    unreadable_retry_note = service._build_candidate_selection_retry_note(
        unreadable_candidate,
        readability_baseline,
        round_dimension=readability_dimension,
    )
    _assert(
        "formal academic written register" in unreadable_retry_note,
        "readability retry note did not translate the issue code into a concrete repair constraint",
    )
    _assert(
        readability_source not in unreadable_retry_note and readability_bad not in unreadable_retry_note,
        "readability retry note leaked source or candidate body text",
    )
    readability_selected, _ = service._select_rewrite_candidate(
        [readability_baseline, unreadable_candidate, readable_candidate],
        round_dimension=readability_dimension,
    )
    _assert(
        readability_selected.get("candidateId") != unreadable_candidate.get("candidateId"),
        "readability regression displaced a safe baseline/candidate",
    )

    # A newly clipped one-character state reaches the same production
    # candidate selector even when the older structural validator accepts it.
    # It must consume only the one bounded repair attempt and preserve the safe
    # baseline when both model attempts repeat the readability regression.
    contracted_source = "链路控制策略使数据传输更加稳定。"
    contracted_bad = "链路控制策略使数据传输更稳。"
    contracted_result, contracted_prompts = _run_direct(
        [contracted_bad, contracted_bad],
        text=contracted_source,
        round_dimension=readability_dimension,
    )
    contracted_event = _selection_event(contracted_result)
    _assert(contracted_result.output_text == contracted_source, "clipped state displaced the safe baseline")
    _assert(len(contracted_prompts) == 2, "clipped state did not trigger exactly one bounded repair attempt")
    _assert(contracted_event.get("decision") == "preserved_baseline", "clipped-state decision drifted")
    _assert(contracted_event.get("publishedRewrite") is False, "clipped state was reported as published")
    contracted_candidates = [
        candidate
        for candidate in contracted_event.get("candidates", [])
        if isinstance(candidate, dict) and candidate.get("origin") == "model"
    ]
    _assert(len(contracted_candidates) == 2, "clipped-state selector evidence lost a bounded attempt")
    _assert(
        all(candidate.get("hardValid") is True for candidate in contracted_candidates),
        "clipped-state fixture unexpectedly failed an unrelated structural hard gate",
    )
    _assert(
        all(candidate.get("readabilityGuardPassed") is False for candidate in contracted_candidates),
        "clipped-state candidate passed the academic-readability guard",
    )
    _assert(
        all(
            "colloquial_register_introduced" in list(candidate.get("readabilityIssueCodes") or [])
            and "academic_readability_delta_failed" in list(candidate.get("rejectionReasonCodes") or [])
            for candidate in contracted_candidates
        ),
        "clipped-state candidate lost stable selector rejection evidence",
    )

    # A neutral/custom pass cannot publish an arbitrary changed candidate merely
    # because its aggregate style penalty ties the baseline at zero. The public
    # protocol requires a measurable net gain when no active same-dimension
    # evaluator justifies the change.
    neutral_source = "研究采用问卷收集数据。"
    neutral_changed = "研究运用问卷收集数据。"
    neutral_dimension = {"id": "neutral", "primaryMetric": ""}
    neutral_baseline = service._evaluate_rewrite_candidate(
        input_text=neutral_source,
        output_text=neutral_source,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=neutral_dimension,
    )
    neutral_candidate = service._evaluate_rewrite_candidate(
        input_text=neutral_source,
        output_text=neutral_changed,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=neutral_dimension,
    )
    neutral_selected, neutral_reasons = service._select_rewrite_candidate(
        [neutral_baseline, neutral_candidate],
        round_dimension=neutral_dimension,
    )
    _assert(neutral_baseline.get("stylePenalty") == 0, "neutral baseline fixture is not zero-risk")
    _assert(neutral_candidate.get("stylePenalty") == 0, "neutral changed fixture is not a zero-risk tie")
    _assert(neutral_selected.get("origin") == "baseline", "zero-to-zero neutral rewrite displaced the baseline")
    _assert("no_measurable_combined_style_gain" in neutral_reasons, "zero-risk tie lost its explicit no-gain reason")
    _assert(
        service._candidate_requires_conditional_retry(
            neutral_candidate,
            neutral_baseline,
            round_dimension=neutral_dimension,
        ),
        "zero-to-zero neutral candidate skipped its bounded repair attempt",
    )
    neutral_retry_note = service._build_candidate_selection_retry_note(
        neutral_candidate,
        neutral_baseline,
        round_dimension=neutral_dimension,
    )
    _assert(
        "no_measurable_combined_style_gain" in neutral_retry_note,
        "neutral retry note lost the final-selector no-gain reason",
    )
    _assert(
        "minimum necessary, source-grounded changes" in neutral_retry_note,
        "neutral retry note did not give a minimum-change repair constraint",
    )
    neutral_retry_result, neutral_retry_prompts = _run_direct(
        [neutral_changed, neutral_changed],
        text=neutral_source,
        round_dimension=neutral_dimension,
    )
    neutral_retry_events = [
        event
        for event in neutral_retry_result.validation_events
        if event.get("event") == "candidate-selection-retry"
    ]
    _assert(len(neutral_retry_prompts) == 2, "neutral no-gain path did not execute exactly one bounded retry")
    _assert(len(neutral_retry_events) == 1, "neutral no-gain retry event was not recorded exactly once")
    _assert(
        "no_measurable_combined_style_gain" in list(neutral_retry_events[0].get("reasonCodes") or []),
        "neutral retry event lost the final-selector no-gain reason",
    )

    neutral_regressed = service._evaluate_rewrite_candidate(
        input_text=neutral_source,
        output_text="研究采用问卷收集数据，这一做法具有重要意义。",
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=neutral_dimension,
    )
    _assert(neutral_regressed.get("safetyEligible") is True, "neutral micro-regression fixture became a hard failure")
    _assert(
        float(neutral_regressed.get("stylePenalty", 0.0) or 0.0)
        > float(neutral_baseline.get("stylePenalty", 0.0) or 0.0),
        "neutral micro-regression fixture did not increase style penalty",
    )
    _assert(
        service._candidate_requires_conditional_retry(
            neutral_regressed,
            neutral_baseline,
            round_dimension=neutral_dimension,
        ),
        "neutral style regression skipped its bounded repair attempt",
    )

    # A first candidate that is hard-safe and converges on the active dimension
    # must remain the one-call path.
    first_pass, first_prompts = _run_direct([CONVERGED])
    first_event = _selection_event(first_pass)
    _assert(first_pass.output_text == CONVERGED, "first converged candidate was not published")
    _assert(len(first_prompts) == 1, "first converged candidate must not trigger an unconditional second call")
    _assert(first_event.get("decision") == "generated_selected", "first converged candidate decision is wrong")
    _assert(first_event.get("publishedRewrite") is True, "generated candidate was not counted as a published rewrite")
    _assert(first_event.get("modelAttemptCount") == 1, "one-call decision reported the wrong attempt count")
    selected_first = next(
        candidate
        for candidate in first_event.get("candidates", [])
        if candidate.get("candidateId") == first_event.get("selectedCandidateId")
    )
    _assert(
        selected_first.get("sameDimensionDirection", {}).get("ok") is True,
        "active-dimension selector published a non-converged candidate",
    )
    _assert_event_honesty(first_event)

    # A hard-valid candidate that does not move the bound dimension receives
    # one bounded retry; both valid candidates and the baseline are compared.
    repaired, repaired_prompts = _run_direct([SOURCE, CONVERGED])
    repaired_event = _selection_event(repaired)
    _assert(repaired.output_text == CONVERGED, "second converged candidate did not beat the unchanged first candidate")
    _assert(len(repaired_prompts) == service.MAX_VALIDATION_ATTEMPTS, "same-dimension retry exceeded or missed its bound")
    _assert("[CANDIDATE SELECTION RETRY]" in repaired_prompts[-1], "conditional retry lacked decision feedback")
    _assert(repaired_event.get("selectedCandidateId") == "model-attempt-2", "selector did not choose the best valid attempt")
    _assert(repaired_event.get("conditionalRetryCount") == 1, "conditional retry was not counted")
    _assert(len(repaired_event.get("candidates", [])) == 3, "baseline plus two attempts were not compared")

    # Two hard-valid but unchanged/non-converged candidates must preserve the
    # baseline explicitly and must not be counted as a successful new rewrite.
    preserved, preserved_prompts = _run_direct([SOURCE, SOURCE])
    preserved_event = _selection_event(preserved)
    _assert(preserved.output_text == SOURCE, "baseline preservation changed the text")
    _assert(len(preserved_prompts) == service.MAX_VALIDATION_ATTEMPTS, "preservation path did not stay bounded")
    _assert(preserved_event.get("decision") == "preserved_baseline", "baseline preservation decision is not explicit")
    _assert(preserved_event.get("selectedOrigin") == "baseline", "preservation selected a generated identity candidate")
    _assert(preserved_event.get("publishedRewrite") is False, "preserved baseline was counted as a successful rewrite")
    _assert("publishedTextSha256" not in preserved_event, "preserved baseline exposed a misleading published-text field")
    _assert_event_honesty(preserved_event)

    preserved_manifest = build_manifest(SOURCE, chunk_limit=1000, chunk_metric="char")
    preserved_summary = service._build_quality_summary(
        preserved_manifest,
        {"p0_c0": SOURCE},
        preserved.validation_events,
        prompt_profile="cn_custom",
        round_number=1,
        prompt_sequence=["round2"],
    )
    _assert(preserved_summary.get("boundedCandidateDecisionCount") == 1, "preserved decision aggregate is wrong")
    _assert(preserved_summary.get("boundedCandidatePublishedRewriteCount") == 0, "baseline was aggregated as published rewrite")
    _assert(preserved_summary.get("boundedCandidatePreservedBaselineCount") == 1, "preserved baseline aggregate is wrong")

    # A hard-invalid first attempt remains visible but can never beat a later
    # safe candidate.
    recovered, recovered_prompts = _run_direct(["错误输出", CONVERGED])
    recovered_event = _selection_event(recovered)
    _assert(recovered.output_text == CONVERGED, "hard-invalid attempt displaced the valid candidate")
    _assert("[RETRY NOTE]" in recovered_prompts[-1], "hard-validation retry lost its repair note")
    candidates = recovered_event.get("candidates", [])
    invalid = next(item for item in candidates if item.get("candidateId") == "model-attempt-1")
    _assert(invalid.get("hardValid") is False, "failed attempt evidence was mislabeled as valid")
    _assert(recovered_event.get("selectedCandidateId") == "model-attempt-2", "failed candidate was selected")

    # A valid but non-converged attempt followed by a hard-invalid bounded
    # repair may preserve the baseline, but it must remain an explicit
    # non-rewrite decision rather than silently claiming success.
    mixed, mixed_prompts = _run_direct([SOURCE, "错误输出"])
    mixed_event = _selection_event(mixed)
    _assert(mixed.output_text == SOURCE, "mixed valid/invalid path did not preserve the baseline")
    _assert(len(mixed_prompts) == service.MAX_VALIDATION_ATTEMPTS, "mixed path exceeded its attempt bound")
    _assert(mixed_event.get("decision") == "preserved_baseline", "mixed path hid baseline preservation")
    _assert(mixed_event.get("publishedRewrite") is False, "mixed path was counted as a published rewrite")
    _assert(
        any(event.get("event") == "validation-retry" for event in mixed.validation_events),
        "hard-invalid repair was not recorded",
    )
    _assert_event_honesty(mixed_event)

    # If every model candidate fails the hard contract, the chunk completes with
    # an explicit source fallback. It is not published as a rewrite, and the
    # validation evidence remains available for manual review.
    failed_prompts: list[str] = []

    def invalid_transform(_input_text: str, prompt: str, _round: int, _chunk_id: str) -> str:
        failed_prompts.append(prompt)
        return "错误输出"

    fallback = service._rewrite_round_chunk(
        index=1,
        chunk=_chunk(),
        round_number=2,
        normalized_prompt_profile="cn_custom",
        prompt_text="只做保守改写。",
        transform=invalid_transform,
        global_style_profile=service.build_global_style_profile_from_texts([SOURCE]),
        round_dimension=DIMENSION,
    )
    fallback_events = fallback.validation_events
    decision = next(event for event in fallback_events if event.get("event") == "candidate-selection")
    fallback_event = next(event for event in fallback_events if event.get("event") == "source-fallback")
    _assert(fallback.output_text == SOURCE, "hard-validation exhaustion did not preserve exact source text")
    _assert(decision.get("decision") == "preserved_baseline", "source fallback lost baseline decision evidence")
    _assert(decision.get("publishedRewrite") is False, "source fallback was counted as a published rewrite")
    _assert(decision.get("runFailed") is False, "source fallback incorrectly marked the completed chunk as failed")
    _assert(
        service.HARD_VALIDATION_EXHAUSTED_SOURCE_PRESERVED in (decision.get("reasonCodes") or [])
        and fallback_event.get("reasonCode") == service.HARD_VALIDATION_EXHAUSTED_SOURCE_PRESERVED,
        "source fallback reason code was not bound to the candidate decision",
    )
    _assert_event_honesty(decision)
    _assert(len(failed_prompts) == service.MAX_TOTAL_MODEL_ATTEMPTS, "hard-failure path exceeded its attempt bound")


def _assert_compare_and_checkpoint_contract(work_dir: Path) -> None:
    source_path = work_dir / "source.txt"
    output_path = work_dir / "round2.txt"
    manifest_path = work_dir / "round2_manifest.json"
    source_path.write_text(f"{SOURCE}\n\n{SOURCE_TWO}", encoding="utf-8")

    first_calls: list[str] = []
    calls_lock = threading.Lock()
    first_attempt_barrier = threading.Barrier(2)
    first_attempt_seen: set[str] = set()

    def partial_transform(_input_text: str, _prompt: str, _round: int, chunk_id: str) -> str:
        with calls_lock:
            first_calls.append(chunk_id)
            first_for_chunk = chunk_id not in first_attempt_seen
            first_attempt_seen.add(chunk_id)
        if first_for_chunk:
            first_attempt_barrier.wait(timeout=3)
        if chunk_id == "p0_c0":
            # Force the fallback chunk's first provider call to return first.
            # Checkpoint state must still be mutated only by run_round's owner
            # thread, never by these two workers.
            time.sleep(0.05)
        return CONVERGED if chunk_id == "p0_c0" else "错误输出"

    result = service.run_round(
        doc_id="candidate-selection-checkpoint-regression",
        round_number=2,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=partial_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["round1", "round2"],
        chunk_limit=1000,
        max_concurrency=2,
    )
    _assert(first_calls.count("p0_c0") == 1, "converged concurrent chunk received an unconditional second call")
    _assert(
        first_calls.count("p1_c0") == service.MAX_TOTAL_MODEL_ATTEMPTS,
        "hard-invalid concurrent chunk exceeded or missed its bounded attempts",
    )

    checkpoint_path = service.get_round_checkpoint_path(output_path)
    _assert(not checkpoint_path.exists(), "completed source fallback left a stale checkpoint")

    compare_path = service.get_round_compare_path(output_path)
    compare = json.loads(compare_path.read_text(encoding="utf-8"))
    _assert(compare.get("version") == service.ROUND_COMPARE_VERSION, "compare version was not bumped for candidate evidence")
    decisions = [event for event in compare.get("validationEvents", []) if event.get("event") == "candidate-selection"]
    _assert(len(decisions) == 2, f"completed run duplicated or lost candidate events: {len(decisions)}")
    _assert(len({event.get("chunkId") for event in decisions}) == 2, "candidate decisions are not one-per-completed-chunk")
    _assert(not any(event.get("runFailed") for event in decisions), "completed compare retained failed candidate evidence")
    _assert(
        sum(1 for event in compare.get("validationEvents", []) if event.get("event") == "source-fallback") == 1,
        "completed compare lost the source-fallback event",
    )
    summary = result.get("quality_summary", {})
    _assert(summary.get("boundedCandidateDecisionCount") == len(decisions), "quality aggregate disagrees with compare events")
    actual_attempts = sum(int(event.get("modelAttemptCount", 0) or 0) for event in decisions)
    actual_conditional_retries = sum(int(event.get("conditionalRetryCount", 0) or 0) for event in decisions)
    actual_published = sum(1 for event in decisions if event.get("publishedRewrite") is True)
    actual_preserved = sum(1 for event in decisions if event.get("decision") == "preserved_baseline")
    _assert(summary.get("boundedCandidateModelAttemptCount") == actual_attempts, "attempt aggregate disagrees with evidence")
    _assert(
        summary.get("boundedCandidateConditionalRetryCount") == actual_conditional_retries,
        "conditional-retry aggregate disagrees with evidence",
    )
    _assert(
        summary.get("boundedCandidatePublishedRewriteCount") == actual_published,
        "published-rewrite aggregate disagrees with evidence",
    )
    _assert(
        summary.get("boundedCandidatePreservedBaselineCount") == actual_preserved,
        "preserved-baseline aggregate disagrees with evidence",
    )
    _assert(summary.get("sourceFallbackCount") == 1, "source-fallback aggregate disagrees with evidence")
    _assert(actual_attempts <= 2 * service.MAX_TOTAL_MODEL_ATTEMPTS, "actual model attempts exceeded the per-chunk bound")
    _assert(summary.get("estimatedApiCalls") == 2, "compatible nominal call estimate changed")
    _assert(summary.get("estimatedMaxApiCalls") == 2 * service.MAX_TOTAL_MODEL_ATTEMPTS, "maximum call estimate is wrong")
    _assert(summary.get("maxApiCallsPerEditableChunk") == service.MAX_TOTAL_MODEL_ATTEMPTS, "per-chunk call bound is missing")

    decisions_by_chunk = {str(event.get("chunkId")): event for event in decisions}
    for chunk_payload in compare.get("chunks", []):
        chunk_id = str(chunk_payload.get("chunkId"))
        _assert(chunk_payload.get("candidateSelection") == decisions_by_chunk.get(chunk_id), "compare chunk disagrees with authoritative event")
        _assert_event_honesty(chunk_payload["candidateSelection"])
        if chunk_id == "p1_c0":
            _assert(chunk_payload.get("fallbackMode") == "source", "fallback chunk lost its explicit mode")
            _assert(chunk_payload.get("outputText") == SOURCE_TWO, "fallback chunk did not preserve its source")
            _assert(
                chunk_payload.get("fallbackReason") == service.HARD_VALIDATION_EXHAUSTED_SOURCE_PRESERVED,
                "fallback chunk lost its stable reason code",
            )
            _assert(
                len(chunk_payload.get("failedAttempts") or []) == service.MAX_TOTAL_MODEL_ATTEMPTS,
                "fallback chunk lost text-free failed-attempt evidence",
            )
            _assert(
                (chunk_payload.get("quality") or {}).get("needsReview") is True,
                "fallback chunk was not marked for manual review",
            )

    # Legacy/old compare material without a candidate event remains evidence-
    # free; the backend must not fabricate a selection decision retroactively.
    manifest = build_manifest(SOURCE, chunk_limit=1000, chunk_metric="char")
    legacy_summary = service._build_quality_summary(
        manifest,
        {"p0_c0": SOURCE},
        [],
        prompt_profile="cn_custom",
        round_number=1,
        prompt_sequence=["round2"],
    )
    legacy_payload = service._build_round_compare_payload(
        doc_id="legacy-no-candidate-evidence",
        round_number=1,
        prompt_profile="cn_custom",
        prompt_sequence=["round2"],
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        manifest=manifest,
        chunk_outputs={"p0_c0": SOURCE},
        validation_events=[],
        quality_summary=legacy_summary,
    )
    _assert("candidateSelection" not in legacy_payload["chunks"][0], "legacy compare was given fabricated candidate evidence")
    _assert(legacy_payload["qualitySummary"].get("boundedCandidateDecisionCount") == 0, "legacy aggregate fabricated a decision")


def _checkpoint_event(
    *,
    source: str,
    output: str,
    selected: dict[str, object],
    candidates: list[dict[str, object]],
) -> dict[str, object]:
    event = service._build_candidate_selection_event(
        chunk_id="p0_c0",
        round_number=2,
        candidates=candidates,
        selected=selected,
        reason_codes=["checkpoint-regression"],
        conditional_retry_count=0,
    )
    event["postprocessApplied"] = False
    event["resultTextSha256"] = service._sha256_text(output)
    event["resultCharCount"] = len(output)
    if event.get("publishedRewrite") is True:
        event["publishedTextSha256"] = service._sha256_text(output)
        event["publishedCharCount"] = len(output)
    return event


def _assert_checkpoint_candidate_admission() -> None:
    _assert(service.ROUND_CHECKPOINT_VERSION >= 5, "pre-readability checkpoint version remained resumable")
    chunk = _chunk()
    chunks = {chunk.chunk_id: chunk}
    source_global_style_profile = service.build_global_style_profile_from_texts([SOURCE])
    baseline = service._evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=SOURCE,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=DIMENSION,
        global_style_profile=source_global_style_profile,
    )
    generated = service._evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=CONVERGED,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=DIMENSION,
        global_style_profile=source_global_style_profile,
    )
    _assert(generated.get("safetyEligible") is True, "checkpoint generated fixture is not eligible")
    generated_event = _checkpoint_event(
        source=SOURCE,
        output=CONVERGED,
        selected=generated,
        candidates=[baseline, generated],
    )
    accepted_generated = service._normalize_checkpoint_outputs(
        {chunk.chunk_id: CONVERGED},
        manifest_chunks_by_id=chunks,
        raw_events=[generated_event],
    )
    _assert(accepted_generated == {chunk.chunk_id: CONVERGED}, "valid generated checkpoint candidate was rejected")

    preserved_event = _checkpoint_event(
        source=SOURCE,
        output=SOURCE,
        selected=baseline,
        candidates=[baseline],
    )
    accepted_preserved = service._normalize_checkpoint_outputs(
        {chunk.chunk_id: SOURCE},
        manifest_chunks_by_id=chunks,
        raw_events=[preserved_event],
    )
    _assert(accepted_preserved == {chunk.chunk_id: SOURCE}, "valid preserved checkpoint baseline was rejected")

    stale_preserved = service._normalize_checkpoint_outputs(
        {chunk.chunk_id: CONVERGED},
        manifest_chunks_by_id=chunks,
        raw_events=[preserved_event],
    )
    _assert(not stale_preserved, "preserved-baseline checkpoint admitted changed output")

    readability_source = "该接口能够满足部署要求。"
    readability_output = "该接口能够适配部署要求。"
    readability_chunk = _chunk(readability_source)
    readability_global_style_profile = service.build_global_style_profile_from_texts(
        [readability_source]
    )
    service.validate_chunk_output(readability_source, readability_output, readability_chunk.chunk_id)
    readability_baseline = service._evaluate_rewrite_candidate(
        input_text=readability_source,
        output_text=readability_source,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=readability_global_style_profile,
    )
    unreadable = service._evaluate_rewrite_candidate(
        input_text=readability_source,
        output_text=readability_output,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=readability_global_style_profile,
    )
    unreadable_event = _checkpoint_event(
        source=readability_source,
        output=readability_output,
        selected=unreadable,
        candidates=[readability_baseline, unreadable],
    )
    # Simulate a stale/forged pre-gate terminal event that claimed publication.
    unreadable_event["decision"] = "generated_selected"
    unreadable_event["publishedRewrite"] = True
    unreadable_event["publishedTextSha256"] = service._sha256_text(readability_output)
    unreadable_event["publishedCharCount"] = len(readability_output)
    rejected_readability = service._normalize_checkpoint_outputs(
        {readability_chunk.chunk_id: readability_output},
        manifest_chunks_by_id={readability_chunk.chunk_id: readability_chunk},
        raw_events=[unreadable_event],
    )
    _assert(not rejected_readability, "checkpoint admitted selected candidate with readability ok=false")

    hash_mismatch_event = copy.deepcopy(generated_event)
    hash_mismatch_event["resultTextSha256"] = "0" * 64
    rejected_hash = service._normalize_checkpoint_outputs(
        {chunk.chunk_id: CONVERGED},
        manifest_chunks_by_id=chunks,
        raw_events=[hash_mismatch_event],
    )
    _assert(not rejected_hash, "checkpoint admitted result/output hash mismatch")

    hard_failure_event = copy.deepcopy(preserved_event)
    hard_failure_event["decision"] = "hard_failure_preserved_baseline"
    hard_failure_event["runFailed"] = True
    rejected_hard_failure = service._normalize_checkpoint_outputs(
        {chunk.chunk_id: SOURCE},
        manifest_chunks_by_id=chunks,
        raw_events=[hard_failure_event],
    )
    _assert(not rejected_hard_failure, "hard-failure candidate was admitted as a completed checkpoint chunk")


def _assert_text_free_projection_resists_joint_tampering() -> None:
    private_body = "PRIVATE_FAILED_BODY_CANDIDATE_7F91"
    private_reasoning = "PRIVATE_REASONING_CANDIDATE_7F91"
    profile = service.build_global_style_profile_from_texts([SOURCE])
    baseline = service._evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=SOURCE,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=DIMENSION,
        global_style_profile=profile,
    )
    event = service._build_candidate_selection_event(
        chunk_id="p0_c0",
        round_number=2,
        candidates=[baseline],
        selected=baseline,
        reason_codes=["no_safe_changed_generated_candidate"],
        conditional_retry_count=0,
    )
    event["foo"] = private_body
    event["message"] = private_body
    event["hardValidationError"] = private_body
    candidate = event["candidates"][0]
    candidate["attempt"] = {"body": private_body}
    candidate["foo"] = private_body
    candidate["hardValidationError"] = private_body
    candidate["sameDimensionDirection"]["note"] = private_body
    candidate["academicReadabilityDelta"]["message"] = private_body
    candidate["sourceRelativeStyleDelta"]["unknownPayload"] = private_body
    retry = {
        "event": "validation-retry",
        "round": 2,
        "chunkId": "p0_c0",
        "attempt": {"body": private_body},
        "outputText": private_body,
        "preview": private_body,
        "error": f"<think>{private_reasoning}</think>",
        "providerMessage": private_body,
        "foo": private_body,
    }
    unknown = {
        "event": "future-private-event",
        "round": 2,
        "chunkId": "p0_c0",
        "message": private_body,
        "detail": {"thinking": private_reasoning},
        "body": private_body,
        "foo": private_body,
    }
    projected = service._public_validation_events([event, retry, unknown])
    serialized = json.dumps(projected, ensure_ascii=False, sort_keys=True)
    _assert(private_body not in serialized, "public event projection leaked a body through an unknown key")
    _assert(private_reasoning not in serialized, "public event projection leaked reasoning material")
    retry_projection = next(item for item in projected if item.get("event") == "validation-retry")
    _assert(retry_projection.get("attempt") is None, "failed-attempt projection accepted a structured attempt payload")
    _assert(retry_projection.get("textStored") is False, "failed-attempt projection did not declare textStored=false")
    _assert(retry_projection.get("errorStored") is False, "failed-attempt projection did not declare errorStored=false")
    _assert(retry_projection.get("outputTextSha256") == service._sha256_text(private_body), "failed-attempt hash lost body identity")
    unknown_projection = next(item for item in projected if item.get("event") == "future-private-event")
    _assert(unknown_projection.get("payloadStored") is False, "unknown event did not fail closed")
    _assert(set(unknown_projection).issubset({"event", "round", "chunkId", "paragraphIndex", "chunkIndex", "payloadStored"}), "unknown event retained an unallowlisted field")
    checkpoint_projection = service._normalize_checkpoint_validation_events(
        [event, retry, unknown],
        valid_chunk_ids={"p0_c0"},
        completed_chunk_ids={"p0_c0"},
    )
    checkpoint_serialized = json.dumps(checkpoint_projection, ensure_ascii=False, sort_keys=True)
    _assert(private_body not in checkpoint_serialized, "checkpoint event migration leaked a body")
    _assert(private_reasoning not in checkpoint_serialized, "checkpoint event migration leaked reasoning")


def main() -> int:
    service.validate_chunk_output(SOURCE, CONVERGED, "candidate-selection-converged")
    service.validate_chunk_output(SOURCE_TWO, CONVERGED_TWO, "candidate-selection-converged-two")
    _assert_direct_selection_behaviour()
    _assert_checkpoint_candidate_admission()
    _assert_text_free_projection_resists_joint_tampering()

    original_update_round = service.update_round
    service.update_round = lambda **kwargs: {"doc_id": kwargs.get("doc_id"), "rounds": []}
    try:
        with TemporaryDirectory(prefix="fyadr-candidate-selection-") as temp_dir:
            _assert_compare_and_checkpoint_contract(Path(temp_dir))
    finally:
        service.update_round = original_update_round

    print("candidate selection regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
