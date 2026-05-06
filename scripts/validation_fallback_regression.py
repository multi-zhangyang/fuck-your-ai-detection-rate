from __future__ import annotations

import json
import shutil
from pathlib import Path

from fyadr_records import ROOT_DIR
from fyadr_round_service import MAX_VALIDATION_ATTEMPTS, run_round


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "validation_fallback"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

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
        doc_id="validation-fallback-regression",
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
        raise AssertionError("validation fallback must keep source text when all attempts fail")
    if len(prompts) != MAX_VALIDATION_ATTEMPTS:
        raise AssertionError(f"expected {MAX_VALIDATION_ATTEMPTS} validation attempts, got {len(prompts)}")
    if "[RETRY NOTE]" not in prompts[-1]:
        raise AssertionError("second attempt must include validation feedback for the model")

    compare = json.loads(Path(result["compare_path"]).read_text(encoding="utf-8"))
    fallback_events = [event for event in compare.get("validationEvents", []) if event.get("event") == "source-fallback"]
    if len(fallback_events) != 1:
        raise AssertionError("compare payload must record exactly one source fallback event")

    chunk = compare["chunks"][0]
    quality = chunk.get("quality") or {}
    if chunk.get("fallbackMode") != "source":
        raise AssertionError("fallback chunk must expose fallbackMode=source")
    if "source_fallback" not in (quality.get("flags") or []):
        raise AssertionError("fallback chunk must be marked with source_fallback flag")
    failed_attempts = chunk.get("failedAttempts") or []
    if not failed_attempts or failed_attempts[-1].get("outputText") != "错误输出":
        raise AssertionError("fallback chunk must expose failed model outputs for manual review")
    if not quality.get("needsReview"):
        raise AssertionError("fallback chunk must require review")
    if compare.get("qualitySummary", {}).get("sourceFallbackCount") != 1:
        raise AssertionError("quality summary must count source fallback chunks")

    print("validation fallback regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
