#!/usr/bin/env python3
"""Dimension-targeted rerun CONVERGENCE closure regression (core-algorithm moat, real).

Closes the detector-in-the-loop end-to-end: when a chunk is flagged
dimension_direction_not_effective, the targeted rerun now not only carries a
dimension-targeted instruction — after the rerun passes hard validation it
RE-SCORES the failed dimension and, if it still hasn't moved toward lower-AI,
retries with a strengthened convergence note until it actually converges (or the
attempt cap is hit). This proves the loop is closed: diagnose -> rerun ->
re-score -> converge, not diagnose -> rerun -> (assume fixed).

Real, not ok=true: drives the real rerun_compare_chunk with a deterministic fake
transform (no real API), quality scored by the real _build_chunk_quality with
the real round dimension, convergence decided by the real _assess_dimension_direction.

Cases:
  A) burstiness dimension, first rerun stays uniform (not converged) -> second
     rerun (with converge-retry note) produces varied cadence -> converges.
     Assert rerunDimensionConverged=True and rerunDimensionConvergeDirections
     records the pre/post directions.
  B) burstiness dimension, rerun never converges (stays uniform every attempt,
     uniform cadence is advisory not hard-validated) -> after the attempt cap,
     returned attempt evidence is explicit preserved_baseline and the accepted
     output/compare/review generation remains byte-for-byte unchanged.
  C) chunk NOT flagged dimension_direction_not_effective still uses the shared
     selector; an unchanged candidate is an evidence-bearing zero-write soft
     no-op rather than bypassing candidate evidence.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service as a  # noqa: E402
import fyadr_round_service as f  # noqa: E402
from fyadr_records import ROOT_DIR  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    _build_candidate_selection_event,
    _build_chunk_quality,
    _evaluate_rewrite_candidate,
    _select_rewrite_candidate,
    build_global_style_profile_from_texts,
    get_round_compare_path,
)
from source_relative_style_delta import (  # noqa: E402
    assess_source_relative_document_delta,
    source_relative_document_delta_passed,
)

PROFILE = "cn_custom"
SEQ = ["prewrite", "round1", "round2"]

# round2 in cn_custom -> round1 prompt -> sentence_structure / burstiness.
UNIFORM_INPUT = (
    "首先，该方法用于解决复杂环境下的目标识别问题。其次，该方法使用多个公开数据集完成验证。"
    "再次，该方法在测试任务中取得了稳定的预测结果。此外，该方法在不同负载下保持正常响应。"
    "因此，该方法的部署成本处于可接受范围之内。最后，该方法仍需核对小样本条件下的误差。"
)
# An ineffective rewrite that stays uniform -> dimension_direction_not_effective.
INEFFECTIVE_STRUCTURE = (
    "首先，该方法用于处理复杂环境中的目标识别问题。其次，该方法在多个公开数据集上进行验证。"
    "该方法在测试任务中获得稳定的预测结果。同时，该方法在不同负载下维持正常响应。"
    "因此，该方法的部署成本仍处于可接受范围。最后，该方法还需核对小样本条件下的误差。"
)
# A converged rewrite: real long/short contrast raises burstiness.
CONVERGED_STRUCTURE = (
    "针对复杂环境中的目标识别问题，本研究采用该方法开展分析。"
    "多个公开数据集用于完成方法验证，测试任务中的预测结果总体保持稳定。"
    "在不同负载下，系统能够维持正常响应。"
    "系统的部署成本仍处于可接受范围。"
    "本研究仍需核对小样本条件下的误差，这是当前结果的主要限制。"
    "相关误差仍待进一步核对。"
)

# (Connector-dimension non-convergence overlaps the connector_density_increased
# HARD validation gate, so the honest "never converges" case is exercised on the
# burstiness dimension below, Uniform cadence is advisory, not hard-validated.)

CERTIFICATION_DIMENSION: dict[str, object] = {
    "id": "neutral",
    "primaryMetric": "",
}


def _certify_existing_output(
    input_text: str,
    output_text: str,
    round_number: int,
    *,
    global_style_profile: dict[str, object],
) -> dict[str, object]:
    """Build the same release evidence a successful production round emits.

    The fixture's current output is intentionally still ineffective for the
    *next* sentence-structure convergence pass.  It can nevertheless be a
    legitimate previously published result: removing the source's mechanical
    connector scaffolding wins the neutral production selector without
    pretending that the later burstiness dimension has already converged.
    """

    chunk_id = "p0_c0"
    a.validate_chunk_output(input_text, input_text, chunk_id)
    a.validate_chunk_output(input_text, output_text, chunk_id)
    baseline = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=input_text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=CERTIFICATION_DIMENSION,
        global_style_profile=global_style_profile,
    )
    generated = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=output_text,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=CERTIFICATION_DIMENSION,
        global_style_profile=global_style_profile,
    )
    selected, reason_codes = _select_rewrite_candidate(
        [baseline, generated],
        round_dimension=CERTIFICATION_DIMENSION,
    )
    if selected is not generated:
        raise AssertionError(
            f"fixture output did not win the production selector: {reason_codes}"
        )
    if generated.get("safetyEligible") is not True:
        raise AssertionError("fixture output is not safety eligible")
    if generated.get("readabilityGuardPassed") is not True:
        raise AssertionError(
            f"fixture output failed academic readability: {generated.get('readabilityIssueCodes')}"
        )
    return _build_candidate_selection_event(
        chunk_id=chunk_id,
        round_number=round_number,
        candidates=[baseline, generated],
        selected=selected,
        reason_codes=reason_codes,
        conditional_retry_count=0,
    )


def _make_compare(work_dir: Path, round_number: int, input_text: str,
                  output_text: str, quality: dict, tag: str) -> tuple[Path, Path]:
    work_dir = work_dir / tag
    work_dir.mkdir(parents=True, exist_ok=True)
    output_path = work_dir / f"round{round_number}.txt"
    compare_path = get_round_compare_path(output_path)
    output_path.write_text(output_text, encoding="utf-8")
    global_style_profile = build_global_style_profile_from_texts([input_text])
    source_pattern_profile = global_style_profile.get("documentPatternBaseline")
    if not isinstance(source_pattern_profile, dict):
        raise AssertionError("fixture source-pattern profile is missing")
    source_profile_sha256 = str(source_pattern_profile.get("profileSha256", "") or "")
    if not source_profile_sha256:
        raise AssertionError("fixture source-pattern profile is not content-addressed")
    candidate_selection = _certify_existing_output(
        input_text,
        output_text,
        round_number,
        global_style_profile=global_style_profile,
    )
    if (
        candidate_selection.get("schemaVersion") != 2
        or candidate_selection.get("decision") != "generated_selected"
        or candidate_selection.get("publishedRewrite") is not True
        or candidate_selection.get("selectedOrigin") != "model"
    ):
        raise AssertionError(
            f"fixture certification is not a published v2 model selection: {candidate_selection}"
        )
    source_relative_document_delta = assess_source_relative_document_delta(
        [input_text.strip()],
        [output_text.strip()],
    )
    if not source_relative_document_delta_passed(source_relative_document_delta):
        raise AssertionError(
            "fixture output failed the source-relative document delta: "
            f"{source_relative_document_delta.get('blockingIssueCodes')}"
        )
    payload = {
        "version": 2,
        "docId": "dimension-convergence-regression",
        "round": round_number,
        "promptProfile": PROFILE,
        "promptSequence": SEQ,
        "outputPath": str(output_path),
        "chunkCount": 1,
        "paragraphCount": 1,
        "sourcePatternProfiles": {
            source_profile_sha256: source_pattern_profile,
        },
        "sourceRelativeDocumentDelta": source_relative_document_delta,
        "chunks": [{
            "chunkId": "p0_c0",
            "paragraphIndex": 0,
            "chunkIndex": 0,
            "inputText": input_text,
            "outputText": output_text,
            "outputCharCount": len(output_text),
            "candidateBaselineText": input_text.strip(),
            "quality": quality,
            "candidateSelection": candidate_selection,
        }],
        "validationEvents": [candidate_selection],
        "qualitySummary": {},
    }
    compare_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    # Persist a real, hash-bound review choice. Targeted rerun must consume
    # exactly this review-materialized candidate as its new baseline.
    review = a.save_review_decisions(str(output_path), {"p0_c0": "rewrite_confirmed"})
    if review.get("decisions", {}).get("p0_c0") != "rewrite_confirmed":
        raise AssertionError("fixture review decision was not persisted")
    return output_path, compare_path


def _install_transform(builder):
    original = a._build_transform_from_model_config
    a._build_transform_from_model_config = builder
    return original


def run_regression() -> dict[str, object]:
    failures: list[str] = []
    work_dir = ROOT_DIR / "finish" / "regression" / "dimension_convergence"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    # --- A) burstiness dimension: uniform first, then converged ---
    rd2 = f.resolve_round_dimension(PROFILE, 2)
    q_bad = _build_chunk_quality(UNIFORM_INPUT, INEFFECTIVE_STRUCTURE, round_dimension=rd2)
    if "dimension_direction_not_effective" not in (q_bad.get("advisoryFlags") or []):
        return {"ok": False, "failures": [f"fixture A not flagged ineffective: {q_bad.get('advisoryFlags')}"]}
    out2, cmp2 = _make_compare(work_dir, 2, UNIFORM_INPUT, INEFFECTIVE_STRUCTURE, q_bad, "A")

    def builder_a(_model_config):
        def transform(chunk_text: str, prompt_input: str, round_number: int, chunk_id: str) -> str:
            # First convergence attempt: still uniform (not converged). After a
            # candidate-selection retry note appears, produce the varied output.
            if "[CANDIDATE SELECTION RETRY]" in prompt_input:
                return CONVERGED_STRUCTURE
            return INEFFECTIVE_STRUCTURE
        return transform, "online"

    original = _install_transform(builder_a)
    try:
        result = a.rerun_compare_chunk(
            str(out2), "p0_c0",
            {"baseUrl": "http://127.0.0.1:9", "apiKey": "test", "model": "m",
             "apiType": "chat_completions", "promptProfile": PROFILE, "promptSequence": SEQ},
        )
    finally:
        a._build_transform_from_model_config = original

    chunk = result["chunk"]
    if chunk.get("rerunDimensionConverged") is not True:
        failures.append(f"A: expected rerunDimensionConverged=True, got {chunk.get('rerunDimensionConverged')}")
    directions = chunk.get("rerunDimensionConvergeDirections") or []
    if not isinstance(directions, list) or not directions:
        failures.append(f"A: rerunDimensionConvergeDirections not recorded, got {directions}")
    # the final recorded quality must show the dimension now ok/satisfied.
    final_dir = chunk.get("quality", {}).get("dimensionDirection", {})
    if not (bool(final_dir.get("ok", False)) or bool(final_dir.get("satisfied", False))):
        failures.append(f"A: final quality.dimensionDirection not ok/satisfied: {final_dir}")
    if chunk.get("outputText", "").strip() != CONVERGED_STRUCTURE.strip():
        failures.append("A: accepted output is not the converged rewrite")

    # --- B) burstiness dimension: NEVER converges (stays uniform every attempt) ---
    # Uniform cadence is advisory, not hard-validated, so this passes hard
    # validation but honestly stays non-converged. Production keeps this soft
    # no-op out of the authoritative compare while returning its attempt evidence.
    out3, cmp3 = _make_compare(work_dir, 2, UNIFORM_INPUT, INEFFECTIVE_STRUCTURE, q_bad, "B")
    review3 = a._find_review_decisions_path_for_output(out3)
    before_out3 = out3.read_bytes()
    before_cmp3 = cmp3.read_bytes()
    before_review3 = review3.read_bytes()

    calls_b = 0

    def builder_b(_model_config):
        def transform(chunk_text: str, prompt_input: str, round_number: int, chunk_id: str) -> str:
            nonlocal calls_b
            calls_b += 1
            # Always re-emit the uniform (ineffective) rewrite -> never converges,
            # even with the [DIMENSION-CONVERGE RETRY] note. This must not be
            # written as a successful replacement.
            return INEFFECTIVE_STRUCTURE
        return transform, "online"

    original = _install_transform(builder_b)
    try:
        result_b = a.rerun_compare_chunk(
            str(out3), "p0_c0",
            {"baseUrl": "http://127.0.0.1:9", "apiKey": "test", "model": "m",
             "apiType": "chat_completions", "promptProfile": PROFILE, "promptSequence": SEQ},
        )
    finally:
        a._build_transform_from_model_config = original

    if result_b.get("preservedExisting") is not True:
        failures.append(f"B: non-converged soft no-op was not marked preservedExisting: {result_b}")
    selection_b = result_b.get("candidateSelectionAttempt") or {}
    if selection_b.get("decision") != "preserved_baseline" or selection_b.get("publishedRewrite") is not False:
        failures.append(f"B: non-convergence lost returned baseline-preservation evidence: {selection_b}")
    if selection_b.get("selectedOrigin") != "baseline":
        failures.append(f"B: non-converged attempt did not select its review-materialized baseline: {selection_b}")
    if result_b["chunk"].get("outputText") != INEFFECTIVE_STRUCTURE:
        failures.append("B: returned result did not preserve the review-materialized baseline")
    if calls_b != a.DIMENSION_RERUN_CONVERGE_ATTEMPTS:
        failures.append(f"B: expected {a.DIMENSION_RERUN_CONVERGE_ATTEMPTS} convergence attempts, got {calls_b}")
    if out3.read_bytes() != before_out3:
        failures.append("B: non-converged rerun changed the accepted output file")
    if cmp3.read_bytes() != before_cmp3:
        failures.append("B: non-converged rerun changed the authoritative compare")
    if review3.read_bytes() != before_review3:
        failures.append("B: non-converged rerun changed the saved review generation")

    # --- C) NOT flagged dimension_direction_not_effective -> closure disabled ---
    good_structure = CONVERGED_STRUCTURE  # effective, no dimension flag
    q_ok = _build_chunk_quality(UNIFORM_INPUT, good_structure, round_dimension=rd2)
    if "dimension_direction_not_effective" in (q_ok.get("advisoryFlags") or []):
        return {"ok": False, "failures": ["fixture C should NOT be flagged ineffective"]}
    out_c, cmp_c = _make_compare(work_dir, 2, UNIFORM_INPUT, good_structure, q_ok, "C")
    review_c = a._find_review_decisions_path_for_output(out_c)
    before_out_c = out_c.read_bytes()
    before_cmp_c = cmp_c.read_bytes()
    before_review_c = review_c.read_bytes()

    def builder_c(_model_config):
        def transform(chunk_text: str, prompt_input: str, round_number: int, chunk_id: str) -> str:
            return good_structure
        return transform, "online"

    original = _install_transform(builder_c)
    try:
        result = a.rerun_compare_chunk(
            str(out_c), "p0_c0",
            {"baseUrl": "http://127.0.0.1:9", "apiKey": "test", "model": "m",
             "apiType": "chat_completions", "promptProfile": PROFILE, "promptSequence": SEQ},
        )
    finally:
        a._build_transform_from_model_config = original

    if result.get("preservedExisting") is not True:
        failures.append(f"C: unchanged candidate was not a preservedExisting soft no-op: {result}")
    selection_c = result.get("candidateSelectionAttempt") or {}
    if selection_c.get("decision") != "preserved_baseline" or selection_c.get("publishedRewrite") is not False:
        failures.append(f"C: unchanged candidate lost returned selector evidence: {selection_c}")
    if selection_c.get("selectedOrigin") != "baseline":
        failures.append(f"C: unchanged attempt did not select its baseline: {selection_c}")
    if out_c.read_bytes() != before_out_c:
        failures.append("C: unchanged candidate modified the accepted output file")
    if cmp_c.read_bytes() != before_cmp_c:
        failures.append("C: unchanged candidate modified the authoritative compare")
    if review_c.read_bytes() != before_review_c:
        failures.append("C: unchanged candidate modified the saved review generation")

    shutil.rmtree(work_dir, ignore_errors=True)
    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("dimension_convergence_regression: PASS (real closure: diagnose->rerun->re-score->converge)")
        return 0
    print("dimension_convergence_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
