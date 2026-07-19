from __future__ import annotations

import shutil
from pathlib import Path

from fyadr_records import ROOT_DIR
from fyadr_round_service import MAX_TOTAL_MODEL_ATTEMPTS, normalize_chunk_output, run_round, validate_chunk_output


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "validation_hard_fail"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    english_source = (
        "Using Qwen2.5-1.5B-Instruct as the base model, a LoRA adapter is then constructed "
        "with approach, 500 samples employing 4-bit QLoRA. In addition, Key words: LoRA; QLoRA"
    )
    multiline_english_output = (
        "Using Qwen2.5-1.5B-Instruct as the base model, a LoRA adapter is then constructed "
        "with approach,\n500 samples employing\n4-bit QLoRA.\nIn addition, Key words: LoRA; QLoRA"
    )
    normalized_english_output = normalize_chunk_output(english_source, multiline_english_output)
    if "approach, 500" not in normalized_english_output or "approach,500" in normalized_english_output:
        raise AssertionError(f"English line joiner corrupted comma spacing: {normalized_english_output}")
    validate_chunk_output(english_source, normalized_english_output, "english-line-joiner")

    source_path = work_dir / "source.txt"
    output_path = work_dir / "round1.txt"
    manifest_path = work_dir / "round1_manifest.json"
    source_text = (
        "在对 Hybrid Attention-LSTM 模型进行消融实验时，本文分别记录了 recon_only 配置与完整模型的表现。"
        "其中，完整模型在准确率、召回率以及 F1 值上分别达到 91%、82% 和 86%，而 recon_only 配置主要用于"
        "说明重构分支独立工作时的性能边界。上述指标只用于对比模型结构变化带来的影响，不能被改写为新的实验结论[1]。"
    )
    source_path.write_text(source_text, encoding="utf-8")

    prompts: list[str] = []

    def invalid_transform(_chunk_text: str, prompt: str, _round_number: int, _chunk_id: str) -> str:
        prompts.append(prompt)
        return "错误输出"

    result = run_round(
        doc_id="validation-source-fallback-regression",
        round_number=1,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=invalid_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=1000,
    )
    if output_path.read_text(encoding="utf-8") != source_text:
        raise AssertionError("validation exhaustion did not preserve the source text exactly")
    if len(prompts) != MAX_TOTAL_MODEL_ATTEMPTS:
        raise AssertionError(f"expected {MAX_TOTAL_MODEL_ATTEMPTS} validation attempts, got {len(prompts)}")
    if "[RETRY NOTE]" not in prompts[-1]:
        raise AssertionError("final recovery attempt must include validation feedback for the model")

    quality = result.get("quality_summary") or {}
    if quality.get("sourceFallbackCount") != 1:
        raise AssertionError("validation exhaustion did not expose one source fallback")
    compare_path = Path(str(result.get("compare_path", "")))
    compare_text = compare_path.read_text(encoding="utf-8")
    if (
        '"fallbackMode": "source"' not in compare_text
        or '"fallbackReason": "hard_validation_exhausted_source_preserved"' not in compare_text
        or '"publishedRewrite": false' not in compare_text
        or '"runFailed": false' not in compare_text
    ):
        raise AssertionError("source fallback evidence did not remain explicit and non-published")
    if result.get("quality_summary", {}).get("boundedCandidatePublishedRewriteCount") != 0:
        raise AssertionError("source fallback was counted as a published rewrite")

    print("validation source-fallback regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
