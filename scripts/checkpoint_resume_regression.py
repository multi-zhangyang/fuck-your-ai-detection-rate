from __future__ import annotations

import json
import shutil
from pathlib import Path

from fyadr_records import ROOT_DIR
from fyadr_round_service import get_round_checkpoint_path, run_round


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "checkpoint_resume"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    source_path = work_dir / "source.txt"
    output_path = work_dir / "round1.txt"
    manifest_path = work_dir / "round1_manifest.json"
    source_path.write_text(
        "\n\n".join(
            [
                "第一段用于断点续跑测试，内容保持稳定，避免模型调用和外部服务参与。",
                "第二段用于确认已经完成的分块不会因为后续报错而丢失。",
                "第三段用于模拟网络或模型异常后重新点击继续执行。",
                "第四段用于确认更换模型配置后仍然复用已完成分块。",
            ]
        ),
        encoding="utf-8",
    )

    first_calls: list[str] = []

    def failing_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        first_calls.append(chunk_id)
        if len(first_calls) == 3:
            raise RuntimeError("simulated provider timeout")
        return chunk_text

    try:
        run_round(
            doc_id="checkpoint-resume-regression",
            round_number=1,
            input_path=source_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=failing_transform,
            prompt_profile="cn_custom",
            prompt_sequence=["classical"],
            chunk_limit=38,
            checkpoint_metadata={"model": "provider-a/model-1"},
        )
    except RuntimeError as exc:
        if "simulated provider timeout" not in str(exc):
            raise
    else:
        raise AssertionError("first run must fail to leave a checkpoint")

    checkpoint_path = get_round_checkpoint_path(output_path)
    checkpoint_payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    completed_before = set(checkpoint_payload.get("chunk_outputs", {}))
    if len(completed_before) != 2:
        raise AssertionError(f"expected 2 checkpointed chunks, got {len(completed_before)}")

    resumed_calls: list[str] = []

    def resumed_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        resumed_calls.append(chunk_id)
        return chunk_text

    result = run_round(
        doc_id="checkpoint-resume-regression",
        round_number=1,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=resumed_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        chunk_limit=38,
        checkpoint_metadata={"model": "provider-b/model-2"},
    )

    if any(chunk_id in completed_before for chunk_id in resumed_calls):
        raise AssertionError("resume must not call transform for already checkpointed chunks")
    if checkpoint_path.exists():
        raise AssertionError("checkpoint must be removed after successful completion")
    compare = json.loads(Path(result["compare_path"]).read_text(encoding="utf-8"))
    if compare.get("chunkCount") != len(compare.get("chunks", [])):
        raise AssertionError("completed compare payload must include every output segment")

    print("checkpoint resume regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
