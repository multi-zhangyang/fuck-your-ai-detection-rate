from __future__ import annotations

import json
import shutil

import app_service
from chunking import build_manifest
from fyadr_records import ROOT_DIR
from fyadr_round_service import (
    _build_candidate_selection_event,
    _build_chunk_quality,
    _evaluate_rewrite_candidate,
    get_round_compare_path,
    run_round,
    validate_chunk_output,
)


def _published_selection(
    input_text: str,
    output_text: str,
    chunk_id: str,
    global_style_profile: dict[str, object],
) -> dict[str, object]:
    baseline = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=input_text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=global_style_profile,
    )
    candidate = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=output_text,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension={"id": "neutral", "primaryMetric": ""},
        global_style_profile=global_style_profile,
    )
    if candidate.get("safetyEligible") is not True or candidate.get("changedFromBaseline") is not True:
        raise AssertionError(f"fixture {chunk_id} is not a release-eligible changed candidate")
    return _build_candidate_selection_event(
        chunk_id=chunk_id,
        round_number=1,
        candidates=[baseline, candidate],
        selected=candidate,
        reason_codes=["fixture_production_selected"],
        conditional_retry_count=0,
    )


def _assert_default_chunk_manifest_contract() -> None:
    paragraph_text = (
        "Alpha paragraph keeps its own rewrite boundary for checkpoint recovery.\n\n"
        "Beta paragraph keeps its own rewrite boundary for targeted repair.\n\n"
        "Gamma paragraph keeps its own rewrite boundary for export restore."
    )
    paragraph_manifest = build_manifest(paragraph_text, chunk_limit=1000, chunk_metric="char")
    expected_ids = ["p0_c0", "p1_c0", "p2_c0"]
    actual_ids = [chunk.chunk_id for chunk in paragraph_manifest.chunks]
    if actual_ids != expected_ids:
        raise AssertionError(f"default manifest must keep one chunk per short paragraph, got {actual_ids}")
    if paragraph_manifest.paragraph_count != 3 or paragraph_manifest.chunk_count != 3:
        raise AssertionError("default manifest must not merge short paragraphs into fewer chunks")
    for index, paragraph in enumerate(paragraph_manifest.paragraphs):
        if paragraph.chunk_ids != [expected_ids[index]]:
            raise AssertionError(f"paragraph {index} should map only to {expected_ids[index]}")
        if paragraph.split_reason != "paragraph-kept":
            raise AssertionError(f"short paragraph {index} should stay paragraph-kept, got {paragraph.split_reason}")
    for index, chunk in enumerate(paragraph_manifest.chunks):
        if chunk.paragraph_index != index or chunk.chunk_index != 0:
            raise AssertionError(f"chunk {chunk.chunk_id} should keep its original paragraph index")
        if chunk.paragraph_indices is not None:
            raise AssertionError("default manifest must not use merged paragraph_indices")

    long_sentence = "The rewrite pipeline keeps one paragraph boundary during long text processing."
    long_manifest = build_manifest(" ".join([long_sentence] * 5), chunk_limit=120, chunk_metric="char")
    long_ids = [chunk.chunk_id for chunk in long_manifest.chunks]
    if long_manifest.paragraph_count != 1 or long_manifest.chunk_count <= 1:
        raise AssertionError("long paragraph should split only inside the same paragraph")
    if long_ids != [f"p0_c{index}" for index in range(len(long_ids))]:
        raise AssertionError(f"long paragraph chunk ids should remain p0_c*, got {long_ids}")
    if long_manifest.paragraphs[0].chunk_ids != long_ids:
        raise AssertionError("long paragraph manifest should map all split chunks back to paragraph 0")
    for chunk in long_manifest.chunks:
        if chunk.paragraph_index != 0:
            raise AssertionError("long paragraph split must not cross into another paragraph")
        if chunk.paragraph_indices is not None:
            raise AssertionError("long paragraph split must not use merged paragraph_indices")


def main() -> int:
    _assert_default_chunk_manifest_contract()

    manifest = build_manifest(
        "First paragraph has enough local content for one chunk.\n\nSecond paragraph has enough local content for another chunk.",
        chunk_limit=48,
        chunk_metric="char",
    )
    if manifest.chunk_count < 1:
        raise AssertionError("regression manifest should contain at least one chunk")

    work_dir = ROOT_DIR / "finish" / "regression" / "single_output_retry"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    source_path = work_dir / "source.txt"
    output_path = work_dir / "round1.txt"
    manifest_path = work_dir / "round1_manifest.json"
    source_text = (
        "The local rewrite service keeps citations [1], metric names, and API identifiers stable while changing only sentence rhythm. "
        "This paragraph is intentionally long enough to cover the old two-candidate quality mode trigger."
    )
    source_path.write_text(source_text, encoding="utf-8")
    prompts: list[str] = []

    def identity_transform(chunk_text: str, prompt: str, _round_number: int, _chunk_id: str) -> str:
        prompts.append(prompt)
        return chunk_text

    result = run_round(
        doc_id="single-output-retry-regression",
        round_number=1,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=identity_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    quality_summary = result.get("quality_summary") or {}
    if len(prompts) != 2:
        raise AssertionError(
            f"an unchanged valid candidate should receive one bounded net-gain repair attempt, got {len(prompts)} calls"
        )
    if "[CANDIDATE DIRECTION]" in prompts[0]:
        raise AssertionError("full-round prompt must not include legacy candidate direction text")
    for legacy_key in ("rewriteCandidateMode", "candidateMaxPerChunk", "twoCandidateChunkCount", "candidateSelectionCount"):
        if legacy_key in quality_summary:
            raise AssertionError(f"quality summary should not expose removed candidate field {legacy_key}")
    if "[CANDIDATE SELECTION RETRY]" not in prompts[-1]:
        raise AssertionError("unchanged valid candidate retry lost selector feedback")
    if quality_summary.get("estimatedApiCalls") != 1:
        raise AssertionError("quality summary nominal one-call estimate drifted")
    if quality_summary.get("estimatedMaxApiCalls") != 2:
        raise AssertionError("quality summary lost the bounded two-call maximum")
    if quality_summary.get("boundedCandidateModelAttemptCount") != 2:
        raise AssertionError("quality summary did not expose both actual bounded attempts")

    structured_output_path = work_dir / "structured_round1.txt"
    structured_manifest_path = work_dir / "structured_round1_manifest.json"
    structured_prompts: list[str] = []

    def structured_transform(chunk_text: str, prompt: str, _round_number: int, _chunk_id: str) -> str:
        structured_prompts.append(prompt)
        return "```json\n" + json.dumps({"rewrittenText": chunk_text}, ensure_ascii=False) + "\n```"

    structured_result = run_round(
        doc_id="rewrite-structured-output-regression",
        round_number=1,
        input_path=source_path,
        output_path=structured_output_path,
        manifest_path=structured_manifest_path,
        transform=structured_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    if structured_output_path.read_text(encoding="utf-8") != source_text:
        raise AssertionError("structured rewrite JSON output should be unwrapped before validation and restore")
    structured_compare = json.loads(get_round_compare_path(structured_output_path).read_text(encoding="utf-8"))
    if any(chunk.get("fallbackMode") == "source" for chunk in structured_compare.get("chunks", [])):
        raise AssertionError("structured rewrite JSON output should not fall back to source after unwrapping")
    if structured_result.get("quality_summary", {}).get("sourceFallbackCount") != 0:
        raise AssertionError("structured rewrite JSON output should report zero source fallbacks")

    style_source_path = work_dir / "style_source.txt"
    style_output_path = work_dir / "style_round1.txt"
    style_manifest_path = work_dir / "style_round1_manifest.json"
    style_source_text = (
        "The service reads local drafts before rewriting each paragraph. "
        "It keeps the original claim boundaries while changing sentence rhythm. "
        "Reviewers can inspect the compare file after a run. "
        "The final export should stay close to the source document."
    )
    style_bad_output = (
        "Firstly, the service reads local drafts before rewriting each paragraph. "
        "Secondly, it keeps original claim boundaries while changing sentence rhythm. "
        "In addition, reviewers can inspect the compare file after a run. "
        "Therefore, the final export stays close to the source document. "
        "In conclusion, this process has important significance."
    )
    style_source_path.write_text(style_source_text, encoding="utf-8")
    style_prompts: list[str] = []

    def style_transform(_chunk_text: str, prompt: str, _round_number: int, _chunk_id: str) -> str:
        style_prompts.append(prompt)
        return style_bad_output if len(style_prompts) == 1 else style_source_text

    style_result = run_round(
        doc_id="rewrite-style-validation-regression",
        round_number=1,
        input_path=style_source_path,
        output_path=style_output_path,
        manifest_path=style_manifest_path,
        transform=style_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    if len(style_prompts) != 2:
        raise AssertionError(f"machine-style drift should trigger exactly one validation retry, got {len(style_prompts)} calls")
    if "machine-like writing style" not in style_prompts[-1]:
        raise AssertionError("style retry prompt should explain the machine-like writing style failure")
    if "Reduce newly introduced stock phrases" not in style_prompts[-1]:
        raise AssertionError("style retry prompt should include concrete style repair steps")
    if style_output_path.read_text(encoding="utf-8") != style_source_text:
        raise AssertionError("style retry should accept the second clean candidate")
    style_compare = json.loads(get_round_compare_path(style_output_path).read_text(encoding="utf-8"))
    style_retry_events = [
        event
        for event in style_compare.get("validationEvents", [])
        if event.get("event") == "validation-retry"
        and event.get("guardCategory") == "style"
        and event.get("issueCodes") == ["machine_style_drift"]
        and event.get("textStored") is False
        and event.get("errorStored") is False
    ]
    if len(style_retry_events) != 1:
        raise AssertionError("compare payload should record the machine-style validation retry")
    if style_result.get("quality_summary", {}).get("validationRetryCount") != 1:
        raise AssertionError("quality summary should count the machine-style validation retry")

    repeated_sentence_source = (
        "The management platform coordinates farm users, task records, equipment status, environmental readings, and harvest reports through the backend service. "
        "The export pipeline keeps the wording close to the source while changing sentence rhythm."
    )
    repeated_sentence_output = (
        repeated_sentence_source
        + " The management platform coordinates farm users, task records, equipment status, environmental readings, and harvest reports through the backend service."
    )
    try:
        validate_chunk_output(repeated_sentence_source, repeated_sentence_output, "repetition-hard-guard")
    except ValueError as exc:
        if "repeated content" not in str(exc):
            raise AssertionError(f"repetition guard raised the wrong validation error: {exc}") from exc
    else:
        raise AssertionError("chunk validation must reject newly repeated output content")

    overlap_source_path = work_dir / "adjacent_overlap_source.txt"
    overlap_output_path = work_dir / "adjacent_overlap_round1.txt"
    overlap_manifest_path = work_dir / "adjacent_overlap_round1_manifest.json"
    overlap_first = (
        "The platform supports ordinary users, administrators, and farm workers. Administrators manage users, data, tasks, and equipment, "
        "while farm workers receive tasks and record environmental and harvest data. The system aggregates farm information and monitors environmental data."
    )
    overlap_second = (
        "Administrators manage users, data, tasks, and equipment, while farm workers receive work tasks and record environmental and harvest data. "
        "The system aggregates farm information, assigns production tasks, and monitors environmental data for farm management."
    )
    overlap_source_path.write_text(f"{overlap_first}\n\n{overlap_second}", encoding="utf-8")

    def overlap_transform(chunk_text: str, _prompt: str, _round_number: int, _chunk_id: str) -> str:
        return chunk_text

    overlap_result = run_round(
        doc_id="adjacent-overlap-regression",
        round_number=1,
        input_path=overlap_source_path,
        output_path=overlap_output_path,
        manifest_path=overlap_manifest_path,
        transform=overlap_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    overlap_compare = json.loads(get_round_compare_path(overlap_output_path).read_text(encoding="utf-8"))
    overlap_summary = overlap_compare.get("qualitySummary", {})
    if int(overlap_summary.get("adjacentOverlapCount", 0) or 0) < 1:
        raise AssertionError("adjacent semantic overlap must be reported in the compare quality summary")
    overlap_flags = [
        chunk.get("quality", {}).get("flags", [])
        for chunk in overlap_compare.get("chunks", [])
        if isinstance(chunk, dict)
    ]
    if not any("adjacent_semantic_overlap" in flags for flags in overlap_flags):
        raise AssertionError("adjacent semantic overlap must mark affected chunks for review")
    if int((overlap_result.get("quality_summary") or {}).get("adjacentOverlapCount", 0) or 0) < 1:
        raise AssertionError("run result quality summary must expose adjacent semantic overlap")

    targeted_output_path = work_dir / "targeted.txt"
    targeted_compare_path = get_round_compare_path(targeted_output_path)
    targeted_compare_path.with_name(f"{targeted_compare_path.stem}_review_decisions.json").unlink(missing_ok=True)
    previous_output = source_text.replace("changing only sentence rhythm", "making only local wording repairs")
    untouched_source = (
        "The second paragraph already passed review and stays outside the selected rerun target."
    )
    untouched_output = untouched_source.replace("passed review", "passed manual review")
    targeted_output_path.write_text("\n\n".join([previous_output, untouched_output]), encoding="utf-8")
    targeted_global_style_profile = app_service.build_global_style_profile_from_texts(
        [source_text, untouched_source]
    )
    targeted_source_profile = targeted_global_style_profile.get("documentPatternBaseline")
    if not isinstance(targeted_source_profile, dict):
        raise AssertionError("targeted fixture lost its document source-pattern profile")
    compare_payload = {
        "version": 2,
        "docId": "single-output-targeted-regression",
        "round": 1,
        "promptProfile": "cn_custom",
        "promptSequence": ["classical"],
        "inputPath": str(targeted_output_path),
        "outputPath": str(targeted_output_path),
        "manifestPath": "",
        "paragraphCount": 2,
        "chunkCount": 2,
        "qualitySummary": {},
        "validationEvents": [],
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": source_text,
                "outputText": previous_output,
                "candidateBaselineText": source_text,
                "inputCharCount": len(source_text),
                "outputCharCount": len(previous_output),
                "candidateSelection": _published_selection(
                    source_text,
                    previous_output,
                    "p0_c0",
                    targeted_global_style_profile,
                ),
                "quality": _build_chunk_quality(source_text, previous_output),
            },
            {
                "chunkId": "p1_c0",
                "paragraphIndex": 1,
                "chunkIndex": 0,
                "inputText": untouched_source,
                "outputText": untouched_output,
                "candidateBaselineText": untouched_source,
                "inputCharCount": len(untouched_source),
                "outputCharCount": len(untouched_output),
                "candidateSelection": _published_selection(
                    untouched_source,
                    untouched_output,
                    "p1_c0",
                    targeted_global_style_profile,
                ),
                "quality": _build_chunk_quality(untouched_source, untouched_output),
            },
        ],
        "sourcePatternProfiles": {
            str(targeted_source_profile.get("profileSha256", "")): targeted_source_profile,
        },
        "sourceRelativeDocumentDelta": app_service.assess_source_relative_document_delta(
            [source_text, untouched_source],
            [previous_output, untouched_output],
        ),
    }
    targeted_compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    compare_before_soft_noop = targeted_compare_path.read_bytes()

    targeted_prompts: list[str] = []
    targeted_model_inputs: list[str] = []
    original_builder = app_service._build_transform_from_model_config

    def fake_builder(_model_config):
        def valid_transform(chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
            targeted_prompts.append(prompt_input)
            targeted_model_inputs.append(chunk_text)
            return chunk_text

        return valid_transform, "online"

    app_service._build_transform_from_model_config = fake_builder
    try:
        targeted_result = app_service.rerun_compare_chunk(
            str(targeted_output_path),
            "p0_c0",
            {"baseUrl": "http://localhost", "apiKey": "x", "model": "local"},
            (
                "定向重跑反馈：当前 Diff 块需要局部表达优化。\n"
                "摘录：Firstly, the local rewrite service keeps citations [1], "
                "metric names, and API identifiers stable. In conclusion, this process has important significance.\n"
                "重写要求：保留原文事实、术语、数值、引用、编号和段落角色，只调整句式入口和连接方式。"
            ),
        )
    finally:
        app_service._build_transform_from_model_config = original_builder

    if len(targeted_prompts) != 2:
        raise AssertionError(f"targeted zero-gain rerun should use its one bounded repair attempt, got {len(targeted_prompts)} calls")
    if targeted_model_inputs != [app_service.protect_structure_tokens(previous_output).text] * 2:
        raise AssertionError("targeted rerun must send the fresh review-materialized candidate instead of frozen inputText")
    if "[CANDIDATE DIRECTION]" in targeted_prompts[0]:
        raise AssertionError("targeted rerun prompt must not include legacy multi-output direction text")
    if "[TARGETED REPAIR DIRECTION]" not in targeted_prompts[0]:
        raise AssertionError("targeted rerun prompt should keep a single repair direction")
    if "[CANDIDATE SELECTION RETRY]" not in targeted_prompts[-1]:
        raise AssertionError("targeted zero-gain retry lost selector feedback")
    if "定向重跑反馈" not in targeted_prompts[0]:
        raise AssertionError("targeted rerun prompt should include user feedback")
    for marker in ["[DETECTOR MICRO-REPAIR MODE]", "detector-high-risk-segment", "detector-anchor-preservation"]:
        if marker in targeted_prompts[0]:
            raise AssertionError(f"targeted rerun prompt must not include removed detection-report marker {marker!r}")
    chunk = targeted_result["chunk"]
    candidate_selection = chunk.get("candidateSelection") or {}
    attempt_selection = targeted_result.get("candidateSelectionAttempt") or {}
    if targeted_result.get("preservedExisting") is not True:
        raise AssertionError("targeted zero-gain rerun was not returned as a soft no-op")
    if attempt_selection.get("decision") != "preserved_baseline" or attempt_selection.get("publishedRewrite") is not False:
        raise AssertionError("targeted zero-gain attempt lost its explicit preserved-baseline evidence")
    if candidate_selection.get("decision") != "generated_selected" or candidate_selection.get("publishedRewrite") is not True:
        raise AssertionError("soft no-op replaced the prior authoritative candidate selection")
    if chunk.get("outputText") != previous_output:
        raise AssertionError("targeted preserved baseline changed compare outputText")
    if targeted_compare_path.read_bytes() != compare_before_soft_noop:
        raise AssertionError("soft no-op rewrote authoritative compare bytes")
    updated_compare = json.loads(targeted_compare_path.read_text(encoding="utf-8"))
    updated_chunks = updated_compare.get("chunks", [])
    if updated_compare.get("paragraphCount") != 2 or updated_compare.get("chunkCount") != 2:
        raise AssertionError("targeted rerun must keep compare paragraph and chunk counts unchanged")
    if [item.get("chunkId") for item in updated_chunks] != ["p0_c0", "p1_c0"]:
        raise AssertionError("targeted rerun must not add, remove, reorder, or merge chunks")
    untouched_chunk = updated_chunks[1]
    if untouched_chunk.get("outputText") != untouched_output:
        raise AssertionError("targeted rerun must not modify non-target chunk output")
    if any(str(key).startswith("rerun") for key in untouched_chunk):
        raise AssertionError("targeted rerun metadata must stay on the selected chunk only")
    output_paragraphs = targeted_output_path.read_text(encoding="utf-8").split("\n\n")
    if output_paragraphs != [previous_output, untouched_output]:
        raise AssertionError("targeted rerun should preserve fresh effective text without changing segmentation")
    if "rerunCandidateCount" in chunk or "rerunSelectedCandidate" in chunk:
        raise AssertionError("targeted rerun metadata should not expose legacy candidate fields")
    if "rerunDetectorProfile" in chunk:
        raise AssertionError("targeted rerun metadata should not expose removed detection-report profile")

    print("single output retry regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
