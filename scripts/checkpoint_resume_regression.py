from __future__ import annotations

import json
import shutil
from pathlib import Path

from app_service import get_round_progress_status
from fyadr_records import ROOT_DIR
from fyadr_round_service import get_round_checkpoint_path, run_round
from round_helper import build_round_context


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
        if len(first_calls) == 2:
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
    if len(completed_before) != 1:
        raise AssertionError(f"expected 1 checkpointed chunk, got {len(completed_before)}")

    status_context = build_round_context(
        source_path,
        round_number=1,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
    )
    status_checkpoint_path = get_round_checkpoint_path(status_context.output_text_path)
    status_checkpoint_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(checkpoint_path, status_checkpoint_path)
    progress_status = get_round_progress_status(
        str(source_path),
        "cn_custom",
        round_number=1,
        prompt_sequence=["classical"],
    )
    if not progress_status.get("checkpointExists") or not progress_status.get("canResume"):
        raise AssertionError("checkpoint status must expose resumable progress")
    if progress_status.get("completedChunks") != 1:
        raise AssertionError(f"expected 1 completed chunk in progress status, got {progress_status.get('completedChunks')}")
    if int(progress_status.get("totalChunks", 0) or 0) <= 1:
        raise AssertionError("progress status must expose total chunk count")
    if "simulated provider timeout" not in str(progress_status.get("lastError", "")):
        raise AssertionError("progress status must preserve the last checkpoint error")
    if progress_status.get("resumeStage") != "continue_chunks":
        raise AssertionError(f"expected continue_chunks resume stage, got {progress_status.get('resumeStage')}")
    if int(progress_status.get("nextChunkIndex", 0) or 0) != 2:
        raise AssertionError(f"expected resume to point at chunk 2, got {progress_status.get('nextChunkIndex')}")
    if not str(progress_status.get("nextChunkId", "")).strip():
        raise AssertionError("progress status must expose the next chunk id")
    if int(progress_status.get("remainingChunks", 0) or 0) <= 0:
        raise AssertionError("progress status must expose remaining chunks")
    if "不会从第一块重跑" not in str(progress_status.get("resumeExplanation", "")):
        raise AssertionError("progress status must explain non-destructive checkpoint resume")

    all_done_payload = dict(checkpoint_payload)
    chunk_ids = all_done_payload.get("chunk_ids", [])
    if not isinstance(chunk_ids, list) or not chunk_ids:
        raise AssertionError("checkpoint payload must expose chunk ids")
    all_done_payload["chunk_outputs"] = {str(chunk_id): str(chunk_id) for chunk_id in chunk_ids}
    all_done_payload["completed_chunk_count"] = len(chunk_ids)
    status_checkpoint_path.write_text(json.dumps(all_done_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    finalizing_status = get_round_progress_status(
        str(source_path),
        "cn_custom",
        round_number=1,
        prompt_sequence=["classical"],
    )
    if finalizing_status.get("resumeStage") != "finalize_output":
        raise AssertionError(f"expected finalize_output resume stage, got {finalizing_status.get('resumeStage')}")
    if "不会重跑 100%" not in str(finalizing_status.get("resumeExplanation", "")):
        raise AssertionError("100% checkpoint status must explain that only finalization is pending")
    try:
        status_checkpoint_path.unlink(missing_ok=True)
    except PermissionError:
        pass

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
        completed_marker = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        if completed_marker.get("completed") is not True:
            raise AssertionError("checkpoint must be removed or marked completed after successful completion")
    compare = json.loads(Path(result["compare_path"]).read_text(encoding="utf-8"))
    if compare.get("chunkCount") != len(compare.get("chunks", [])):
        raise AssertionError("completed compare payload must include every output segment")

    print("checkpoint resume regression passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
