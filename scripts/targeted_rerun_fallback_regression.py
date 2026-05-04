from __future__ import annotations

import json
import shutil
from pathlib import Path

import app_service
from fyadr_records import ROOT_DIR
from fyadr_round_service import _build_chunk_quality, get_round_compare_path


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "targeted_rerun_fallback"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    output_path = work_dir / "round1.txt"
    compare_path = get_round_compare_path(output_path)
    input_text = (
        "本文以 Hybrid Attention-LSTM 为基础模型，并使用 recon_only 作为消融配置。"
        "实验结果表明，完整模型在准确率、召回率和 F1 值上分别达到 91%、82% 和 86%，"
        "而 recon_only 仅用于说明重构分支独立工作时的性能边界[1]。"
    )
    previous_output = (
        "本文将 Hybrid Attention-LSTM 作为基础模型，同时把 recon_only 作为消融配置。"
        "实验结果显示，完整模型在准确率、召回率以及 F1 值上分别达到 91%、82% 和 86%，"
        "recon_only 则主要用于说明重构分支独立运行时的性能边界[1]。"
    )
    output_path.write_text(previous_output, encoding="utf-8")
    compare_payload = {
        "version": 2,
        "docId": "targeted-rerun-fallback-regression",
        "round": 1,
        "promptProfile": "cn_custom",
        "promptSequence": ["classical"],
        "inputPath": str(output_path),
        "outputPath": str(output_path),
        "manifestPath": "",
        "paragraphCount": 1,
        "chunkCount": 1,
        "qualitySummary": {},
        "validationEvents": [],
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": input_text,
                "outputText": previous_output,
                "inputCharCount": len(input_text),
                "outputCharCount": len(previous_output),
                "quality": _build_chunk_quality(input_text, previous_output),
            }
        ],
    }
    compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    prompts: list[str] = []
    original_builder = app_service._build_transform_from_model_config

    def fake_builder(_model_config):
        def invalid_transform(_chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
            prompts.append(prompt_input)
            return "错误输出"

        return invalid_transform, "online"

    app_service._build_transform_from_model_config = fake_builder
    try:
        result = app_service.rerun_compare_chunk(
            str(output_path),
            "p0_c0",
            {"baseUrl": "http://localhost/v1", "apiKey": "regression", "model": "regression-model"},
            "人工反馈：请保留事实、数值和引用，只做必要的局部修复。",
        )
    finally:
        app_service._build_transform_from_model_config = original_builder

    if len(prompts) != app_service.TARGETED_RERUN_VALIDATION_ATTEMPTS:
        raise AssertionError("targeted rerun must retry once with validation feedback before fallback")
    if "[TARGETED VALIDATION RETRY]" not in prompts[-1]:
        raise AssertionError("targeted rerun retry must include validation error feedback")
    if output_path.read_text(encoding="utf-8") != previous_output:
        raise AssertionError("targeted rerun fallback must keep the previous safe output")

    chunk = result["chunk"]
    quality = chunk.get("quality") or {}
    if chunk.get("rerunStatus") != "fallback":
        raise AssertionError("targeted rerun must return fallback status instead of raising")
    if chunk.get("rerunFallbackMode") != "previous":
        raise AssertionError("targeted rerun should prefer previous valid output as fallback")
    if "targeted_rerun_fallback" not in (quality.get("flags") or []):
        raise AssertionError("fallback chunk must expose targeted_rerun_fallback flag")
    rejected_candidates = chunk.get("rejectedCandidates") or []
    if not rejected_candidates or rejected_candidates[-1].get("outputText") != "错误输出":
        raise AssertionError("targeted rerun fallback must expose rejected model output for manual review")
    events = result["compare"].get("validationEvents") or []
    if not any(event.get("event") == "targeted-rerun-fallback" for event in events):
        raise AssertionError("compare payload must record targeted-rerun-fallback event")
    if not any(event.get("event") == "validation-retry" and event.get("outputText") == "错误输出" for event in events):
        raise AssertionError("compare payload must record targeted rejected candidates")

    print("targeted rerun fallback regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
