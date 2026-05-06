from __future__ import annotations

import json
import shutil

import app_service
from chunking import build_manifest
from fyadr_records import ROOT_DIR
from fyadr_round_service import (
    _build_chunk_quality,
    get_round_compare_path,
    run_round,
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
    if len(prompts) != 1:
        raise AssertionError(f"full-round rewrite should call the model once per valid chunk, got {len(prompts)} calls")
    if "[CANDIDATE DIRECTION]" in prompts[0]:
        raise AssertionError("full-round prompt must not include legacy candidate direction text")
    for legacy_key in ("rewriteCandidateMode", "candidateMaxPerChunk", "twoCandidateChunkCount", "candidateSelectionCount"):
        if legacy_key in quality_summary:
            raise AssertionError(f"quality summary should not expose removed candidate field {legacy_key}")
    if quality_summary.get("estimatedApiCalls") != 1:
        raise AssertionError("quality summary should estimate one API call for one chunk")

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
        if event.get("event") == "validation-retry" and "machine-like writing style" in str(event.get("error", ""))
    ]
    if len(style_retry_events) != 1:
        raise AssertionError("compare payload should record the machine-style validation retry")
    if style_result.get("quality_summary", {}).get("validationRetryCount") != 1:
        raise AssertionError("quality summary should count the machine-style validation retry")

    targeted_output_path = work_dir / "targeted.txt"
    targeted_compare_path = get_round_compare_path(targeted_output_path)
    previous_output = source_text.replace("changing only sentence rhythm", "making only local wording repairs")
    untouched_source = (
        "The second paragraph already passed review and stays outside the selected detector match."
    )
    untouched_output = untouched_source.replace("passed review", "passed manual review")
    targeted_output_path.write_text("\n\n".join([previous_output, untouched_output]), encoding="utf-8")
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
                "inputCharCount": len(source_text),
                "outputCharCount": len(previous_output),
                "quality": _build_chunk_quality(source_text, previous_output),
            },
            {
                "chunkId": "p1_c0",
                "paragraphIndex": 1,
                "chunkIndex": 0,
                "inputText": untouched_source,
                "outputText": untouched_output,
                "inputCharCount": len(untouched_source),
                "outputCharCount": len(untouched_output),
                "quality": _build_chunk_quality(untouched_source, untouched_output),
            },
        ],
    }
    targeted_compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    targeted_prompts: list[str] = []
    original_builder = app_service._build_transform_from_model_config

    def fake_builder(_model_config):
        def valid_transform(chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
            targeted_prompts.append(prompt_input)
            return chunk_text

        return valid_transform, "online"

    app_service._build_transform_from_model_config = fake_builder
    try:
        targeted_result = app_service.rerun_compare_chunk(
            str(targeted_output_path),
            "p0_c0",
            {"baseUrl": "http://localhost", "apiKey": "x", "model": "local"},
            (
                "外部检测报告反馈：来源 PaperPass，当前 Diff 块 p0_c0 被强命中。\n"
                "#2，70% 高风险，匹配度 91%，摘录：Firstly, the local rewrite service keeps citations [1], "
                "metric names, and API identifiers stable. In conclusion, this process has important significance.\n"
                "重写要求：保留原文事实、术语、数值、引用、编号和段落角色，只改写报告命中的句式。"
            ),
        )
    finally:
        app_service._build_transform_from_model_config = original_builder

    if len(targeted_prompts) != 1:
        raise AssertionError(f"targeted rerun should generate one output per attempt, got {len(targeted_prompts)} calls")
    if "[CANDIDATE DIRECTION]" in targeted_prompts[0]:
        raise AssertionError("targeted rerun prompt must not include legacy multi-output direction text")
    if "[TARGETED REPAIR DIRECTION]" not in targeted_prompts[0]:
        raise AssertionError("targeted rerun prompt should keep a single repair direction")
    detector_prompt_markers = [
        "[DETECTOR MICRO-REPAIR MODE]",
        "detector-high-risk-segment",
        "detector-anchor-preservation",
        "detector-rhythm-repair",
        "detector-template-repair",
        "[1]",
    ]
    for marker in detector_prompt_markers:
        if marker not in targeted_prompts[0]:
            raise AssertionError(f"targeted detector rerun prompt should include {marker!r}")
    chunk = targeted_result["chunk"]
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
    if output_paragraphs != [source_text, untouched_output]:
        raise AssertionError("targeted rerun should restore output from existing chunks without changing segmentation")
    if "rerunCandidateCount" in chunk or "rerunSelectedCandidate" in chunk:
        raise AssertionError("targeted rerun metadata should not expose legacy candidate fields")
    detector_profile = chunk.get("rerunDetectorProfile")
    if not isinstance(detector_profile, dict):
        raise AssertionError("targeted detector rerun should store a parsed detector profile")
    if detector_profile.get("segmentCount") != 1:
        raise AssertionError(f"detector profile should record one report segment, got {detector_profile}")
    if detector_profile.get("maxProbability") != 70 or detector_profile.get("maxMatchScore") != 91:
        raise AssertionError(f"detector profile should keep parsed probability and match score, got {detector_profile}")
    if "[1]" not in detector_profile.get("matchedAnchors", []):
        raise AssertionError(f"detector profile should preserve local report anchors, got {detector_profile}")
    for tag in ["detector-surgery", "detector-high-risk-segment", "detector-anchor-preservation"]:
        if tag not in chunk.get("rerunStrategy", []):
            raise AssertionError(f"targeted detector rerun should expose strategy tag {tag!r}")

    print("single output retry regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
