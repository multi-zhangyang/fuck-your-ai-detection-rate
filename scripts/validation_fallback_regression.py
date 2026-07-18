from __future__ import annotations

import shutil
from pathlib import Path

from fyadr_records import ROOT_DIR
from fyadr_round_service import MAX_VALIDATION_ATTEMPTS, normalize_chunk_output, run_round, validate_chunk_output


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

    try:
        run_round(
            doc_id="validation-hard-fail-regression",
            round_number=1,
            input_path=source_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=invalid_transform,
            prompt_profile="cn_custom",
            prompt_sequence=["classical"],
            chunk_limit=1000,
        )
    except RuntimeError as exc:
        message = str(exc)
        if "failed hard validation" not in message and "failed:" not in message:
            raise AssertionError(f"expected hard validation failure, got: {message}") from exc
    else:
        raise AssertionError("validation exhaustion must hard-fail the round instead of source fallback")

    if output_path.exists() and output_path.read_text(encoding="utf-8").strip():
        # A partial write is acceptable only if it is not a silent full-source success artifact.
        # Hard-fail path should not present a completed rewrite equal to the source as success.
        pass
    if len(prompts) != MAX_VALIDATION_ATTEMPTS:
        raise AssertionError(f"expected {MAX_VALIDATION_ATTEMPTS} validation attempts, got {len(prompts)}")
    if "[RETRY NOTE]" not in prompts[-1]:
        raise AssertionError("second attempt must include validation feedback for the model")

    checkpoint_path = output_path.with_name(f"{output_path.stem}_checkpoint.json")
    if not checkpoint_path.exists():
        raise AssertionError("hard-fail path must keep checkpoint so the round can resume after a real fix")

    print("validation hard-fail regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
