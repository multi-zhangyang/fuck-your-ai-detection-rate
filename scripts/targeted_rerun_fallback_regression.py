from __future__ import annotations

import json
import hashlib
import shutil
from pathlib import Path

import app_service
from fyadr_records import ROOT_DIR
from fyadr_round_service import (
    _build_candidate_selection_event,
    _build_chunk_quality,
    _evaluate_rewrite_candidate,
    get_round_compare_path,
)


def _published_selection(
    input_text: str,
    output_text: str,
) -> tuple[dict[str, object], dict[str, object]]:
    neutral = {"id": "neutral", "primaryMetric": ""}
    global_style_profile = app_service.build_global_style_profile_from_texts([input_text])
    source_pattern_profile = global_style_profile.get("documentPatternBaseline")
    if not isinstance(source_pattern_profile, dict):
        raise AssertionError("previous-output fixture must expose a document source-pattern profile")
    baseline = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=input_text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=neutral,
        global_style_profile=global_style_profile,
    )
    candidate = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=output_text,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=neutral,
        global_style_profile=global_style_profile,
    )
    if candidate.get("safetyEligible") is not True:
        raise AssertionError("previous-output fixture must be release eligible")
    return (
        _build_candidate_selection_event(
            chunk_id="p0_c0",
            round_number=1,
            candidates=[baseline, candidate],
            selected=candidate,
            reason_codes=["fixture_production_selected"],
            conditional_retry_count=0,
        ),
        source_pattern_profile,
    )


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "targeted_rerun_hard_fail"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    output_path = work_dir / "round1.txt"
    compare_path = get_round_compare_path(output_path)
    input_text = (
        "在对 Hybrid Attention-LSTM 模型进行消融实验时，完整模型在准确率、召回率以及 F1 值上分别达到 91%、82% 和 86%。"
        "recon_only 配置主要用于说明重构分支独立工作时的性能边界，相关结论仍需保持与原文一致[1]。"
        "传感器精度提高后，系统响应能力同步增强，应用范围持续扩大。"
    )
    previous_output = (
        "消融实验显示，完整 Hybrid Attention-LSTM 在准确率、召回率和 F1 上分别达到 91%、82% 和 86%。"
        "recon_only 配置主要用于界定重构分支单独工作时的性能边界，结论仍需与原文保持一致[1]。"
        "传感器精度提高后，系统响应能力同步增强，应用范围持续扩大。"
    )
    output_path.write_text(previous_output, encoding="utf-8")
    previous_selection, source_pattern_profile = _published_selection(input_text, previous_output)
    compare_payload = {
        "version": 2,
        "docId": "targeted-rerun-hard-fail-regression",
        "round": 1,
        "promptProfile": "cn_custom",
        "promptSequence": ["classical"],
        "outputPath": str(output_path),
        "chunkCount": 1,
        "paragraphCount": 1,
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": input_text,
                "outputText": previous_output,
                "candidateBaselineText": input_text,
                "candidateSelection": previous_selection,
                "quality": _build_chunk_quality(input_text, previous_output),
            }
        ],
        "validationEvents": [previous_selection],
        "qualitySummary": {},
        "sourcePatternProfiles": {
            str(source_pattern_profile["profileSha256"]): source_pattern_profile,
        },
        "sourceRelativeDocumentDelta": app_service.assess_source_relative_document_delta(
            [input_text],
            [previous_output],
        ),
    }
    compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    prompts: list[str] = []
    original_builder = app_service._build_transform_from_model_config
    failed_output = previous_output.replace("同步增强", "也跟着增强").replace("应用范围持续扩大", "用得越来越广")

    def fake_builder(_model_config):
        def invalid_transform(chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
            prompts.append(prompt_input)
            return chunk_text.replace("同步增强", "也跟着增强").replace("应用范围持续扩大", "用得越来越广")

        return invalid_transform, "online"

    app_service._build_transform_from_model_config = fake_builder
    try:
        try:
            app_service.rerun_compare_chunk(
                str(output_path),
                "p0_c0",
                {
                    "baseUrl": "http://127.0.0.1:9",
                    "apiKey": "test",
                    "model": "test-model",
                    "apiType": "chat_completions",
                    "promptProfile": "cn_custom",
                    "promptSequence": ["classical"],
                },
            )
        except ValueError as exc:
            message = str(exc)
            if "failed hard validation" not in message:
                raise AssertionError(f"expected hard validation failure, got: {message}") from exc
            if "academic_register_stability" not in message:
                raise AssertionError(f"targeted rerun failed for the wrong reason: {message}") from exc
        else:
            raise AssertionError("targeted rerun must hard-fail instead of silent fallback")
    finally:
        app_service._build_transform_from_model_config = original_builder

    if len(prompts) != app_service.TARGETED_RERUN_VALIDATION_ATTEMPTS:
        raise AssertionError("targeted rerun must retry before hard-fail")
    if "[TARGETED VALIDATION RETRY]" not in prompts[-1]:
        raise AssertionError("targeted rerun retry must include validation error feedback")
    if "academic_register_drift" not in prompts[-1] or "precise academic written language" not in prompts[-1]:
        raise AssertionError("targeted retry did not include the specific academic-register repair")
    if output_path.read_text(encoding="utf-8") != previous_output:
        raise AssertionError("hard-fail must not rewrite the saved output with silent fallback text")

    compare = json.loads(compare_path.read_text(encoding="utf-8"))
    chunk = compare["chunks"][0]
    if chunk.get("outputText") != previous_output:
        raise AssertionError("hard-fail must leave the previous accepted chunk output untouched")
    if chunk.get("rerunStatus") == "fallback":
        raise AssertionError("hard-fail path must not mark rerunStatus=fallback")
    events = compare.get("validationEvents") or []
    if any(event.get("event") == "targeted-rerun-fallback" for event in events):
        raise AssertionError("hard-fail path must not emit targeted-rerun-fallback success theater")
    failed_output_sha256 = hashlib.sha256(failed_output.strip().encode("utf-8")).hexdigest()
    failed_events = [event for event in events if event.get("event") == "validation-retry"]
    if not any(
        event.get("schema") == "fyadr.failed-attempt-evidence"
        and event.get("outputTextSha256") == failed_output_sha256
        and event.get("outputCharCount") == len(failed_output.strip())
        and event.get("guardCategory") == "readability"
        and event.get("issueCodes") == ["academic_register_stability"]
        and event.get("textStored") is False
        and event.get("errorStored") is False
        for event in failed_events
    ):
        raise AssertionError("hard-fail path must retain text-free failed-attempt identity and stable reasons")
    serialized_compare = json.dumps(compare, ensure_ascii=False)
    for forbidden_key in ("outputText", "preview", "error", "hardValidationError", "providerMessage", "reasoning", "thinking"):
        if any(forbidden_key in event for event in failed_events):
            raise AssertionError(f"failed-attempt evidence leaked forbidden key: {forbidden_key}")
    if failed_output in serialized_compare:
        raise AssertionError("hard-fail compare persisted the rejected model body")

    print("targeted rerun hard-fail regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
