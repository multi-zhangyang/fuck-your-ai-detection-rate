#!/usr/bin/env python3
"""Offline regression for the shared ordinary/RateAudit candidate selector."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import app_service
from academic_readability_regression import (
    P0_FORMAL,
    P0_SOURCE,
    P0_V7,
    P7_SOURCE,
    P7_V7,
    P69_SOURCE,
    P69_V7,
)


NEUTRAL_DIMENSION = {"id": "neutral", "primaryMetric": ""}


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _run(source: str, outputs: list[str]) -> tuple[dict[str, Any], list[str], list[dict[str, Any]]]:
    retry_notes: list[str] = []
    hard_failures: list[dict[str, Any]] = []

    def generate(attempt: int, retry_note: str | None) -> str:
        retry_notes.append(str(retry_note or ""))
        return outputs[min(attempt - 1, len(outputs) - 1)]

    def validate(candidate: str) -> str:
        app_service.validate_chunk_output(source, candidate, "shared-selector-regression")
        return candidate

    def record_hard_failure(attempt: int, error_text: str, output_text: str) -> None:
        hard_failures.append(
            {
                "attempt": attempt,
                "error": error_text,
                "outputSha256": hashlib.sha256(output_text.encode("utf-8")).hexdigest(),
            }
        )

    result = app_service._run_bounded_app_candidate_selection(
        input_text=source,
        chunk_id="p0_c0",
        round_number=2,
        round_dimension=NEUTRAL_DIMENSION,
        global_style_profile=app_service.build_global_style_profile_from_texts([source]),
        generate=generate,
        validate=validate,
        record_hard_failure=record_hard_failure,
    )
    return result, retry_notes, hard_failures


def _assert_text_free(event: dict[str, Any], source: str, candidate: str) -> None:
    serialized = json.dumps(event, ensure_ascii=False, sort_keys=True)
    _assert(source not in serialized, "candidate-selection event leaked its baseline body")
    _assert(candidate not in serialized, "candidate-selection event leaked its model body")
    for private_key in ('"_text"', '"inputText"', '"outputText"', '"matchedText"', '"excerpt"'):
        _assert(private_key not in serialized, f"candidate-selection event leaked private field {private_key}")


def run_regression() -> dict[str, Any]:
    checks: list[str] = []
    original_score = app_service._score_rewrite_output
    try:
        # Give every changed model candidate an overwhelming synthetic style
        # gain. This proves readability is a hard eligibility gate and cannot
        # be hidden by the aggregate style scorer.
        app_service._score_rewrite_output = lambda source, output: 10.0 if source == output else 0.0

        negative_cases = (
            ("v7-p0", P0_SOURCE, P0_V7, "formal academic written register"),
            ("v7-p7", P7_SOURCE, P7_V7, "academic verb-object or collocation conflict"),
            ("v7-p69", P69_SOURCE, P69_V7, "complete predicate"),
        )
        for label, source, candidate, expected_guidance in negative_cases:
            result, retry_notes, hard_failures = _run(source, [candidate, candidate])
            event = result.get("selectionEvent") or {}
            _assert(result.get("ok") is True, f"{label}: readability rejection became a hard run failure")
            _assert(not hard_failures, f"{label}: fixture unexpectedly failed an older hard gate: {hard_failures}")
            _assert(result.get("attemptCount") == 2, f"{label}: bounded readability repair attempt was skipped")
            _assert(result.get("text") == source, f"{label}: rejected candidate replaced the baseline")
            _assert(event.get("decision") == "preserved_baseline", f"{label}: preservation decision drifted")
            _assert(event.get("publishedRewrite") is False, f"{label}: rejected candidate was reported as published")
            _assert(event.get("selectedOrigin") == "baseline", f"{label}: selector did not select the baseline")
            model_candidates = [
                item
                for item in event.get("candidates", [])
                if isinstance(item, dict) and item.get("origin") == "model"
            ]
            _assert(len(model_candidates) == 2, f"{label}: event lost bounded model evidence")
            for model_candidate in model_candidates:
                _assert(model_candidate.get("hardValid") is True, f"{label}: readability case was mislabeled hard-invalid")
                _assert(model_candidate.get("readabilityGuardPassed") is False, f"{label}: readability regression passed")
                _assert(model_candidate.get("safetyEligible") is False, f"{label}: unreadable candidate stayed eligible")
                _assert(
                    "academic_readability_delta_failed" in list(model_candidate.get("rejectionReasonCodes") or []),
                    f"{label}: stable readability rejection reason is missing",
                )
                delta = model_candidate.get("academicReadabilityDelta") or {}
                _assert(delta.get("schema") == "fyadr.academic-readability-delta", f"{label}: delta schema drifted")
                _assert(delta.get("schemaVersion") == 1, f"{label}: delta version drifted")
                _assert(delta.get("ok") is False, f"{label}: delta result disagrees with the guard")
            _assert(
                len(retry_notes) == 2
                and "[CANDIDATE SELECTION RETRY]" in retry_notes[1]
                and "academic_readability_delta_failed" in retry_notes[1],
                f"{label}: second attempt did not receive readability repair evidence",
            )
            _assert(
                expected_guidance in retry_notes[1],
                f"{label}: retry note did not translate issue codes into concrete guidance",
            )
            _assert(
                source not in retry_notes[1] and candidate not in retry_notes[1],
                f"{label}: retry guidance leaked source or candidate body",
            )
            _assert_text_free(event, source, candidate)
        checks.append("v7 p0/p7/p69 remain hard-ineligible in the shared bounded app selector even with dominant style gain")

        positive_result, positive_notes, positive_failures = _run(P0_SOURCE, [P0_FORMAL])
        positive_event = positive_result.get("selectionEvent") or {}
        _assert(not positive_failures, f"formal candidate unexpectedly failed a hard gate: {positive_failures}")
        _assert(positive_result.get("attemptCount") == 1, "formal winning candidate lost the one-call fast path")
        _assert(positive_result.get("text") == P0_FORMAL, "formal candidate was not selected")
        _assert(positive_event.get("decision") == "generated_selected", "formal selection decision drifted")
        _assert(positive_event.get("publishedRewrite") is True, "formal candidate was not reported as published")
        _assert(positive_event.get("selectedOrigin") == "model", "formal candidate did not beat the baseline")
        _assert(positive_notes == [""], "formal one-call path unexpectedly received retry feedback")
        selected_id = positive_event.get("selectedCandidateId")
        selected = next(
            item
            for item in positive_event.get("candidates", [])
            if isinstance(item, dict) and item.get("candidateId") == selected_id
        )
        _assert(selected.get("readabilityGuardPassed") is True, "formal candidate failed readability guard")
        _assert(selected.get("safetyEligible") is True, "formal candidate remained ineligible")
        _assert_text_free(positive_event, P0_SOURCE, P0_FORMAL)
        checks.append("formal academic improvement remains eligible and keeps the one-call generated-selected path")

        for function_name in ("_rerun_compare_chunk_unlocked", "_rerun_rate_audit_strategy_chunk_unlocked"):
            code_names = set(getattr(app_service, function_name).__code__.co_names)
            _assert(
                "_run_bounded_app_candidate_selection" in code_names,
                f"{function_name} bypassed the shared selector",
            )
        checks.append("ordinary targeted rerun and RateAudit strategy both call the same bounded selector")
    finally:
        app_service._score_rewrite_output = original_score

    return {"ok": True, "checks": checks, "checkCount": len(checks)}


def main() -> int:
    print(json.dumps(run_regression(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
