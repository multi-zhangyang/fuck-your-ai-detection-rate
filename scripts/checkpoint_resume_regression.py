from __future__ import annotations

import json
import shutil
from pathlib import Path

from app_service import get_round_progress_status
from fyadr_records import ROOT_DIR
from fyadr_round_service import get_round_checkpoint_path, run_round
from llm_client import LLMRequestError
from round_helper import build_round_context


def main() -> int:
    work_dir = ROOT_DIR / "finish" / "regression" / "checkpoint_resume"
    shutil.rmtree(work_dir, ignore_errors=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    source_path = work_dir / "source.txt"
    sentence_bank = [
        "断点续跑测试会记录已经完成的正文分块，并在异常恢复时优先复用这些稳定结果。",
        "本段材料刻意使用自然叙述，避免把测试文本写成高度重复的机械句式。",
        "前端历史切换之后，后端需要确认断点确实属于当前文档和当前改写流程。",
        "如果分块清单、Prompt 或正文摘要发生变化，状态接口应提前阻止假续跑提示。",
        "真实运行时仍然由轮次服务负责合并文本、生成 Diff，并清理完成后的断点文件。",
        "这些约束共同保证用户点击继续时，不会看到已经完成的部分被无故重跑。",
        "为了覆盖多分块场景，回归样例保留了足够长的正文，同时不依赖任何外部模型。",
        "每个片段都保持原文信息密度，便于校验长度、术语和语言稳定性。",
    ]

    def build_paragraph(offset: int) -> str:
        sentences: list[str] = []
        for index in range(34):
            first = sentence_bank[(index + offset) % len(sentence_bank)]
            second = sentence_bank[(index * 3 + offset + 1) % len(sentence_bank)]
            if index % 3 == 0:
                sentences.append(f"{first}同时，{second}")
            elif index % 3 == 1:
                sentences.append(f"{first}这能帮助系统在第 {index + 1} 个检查点保持判断一致。")
            else:
                sentences.append(f"{first}{second}")
        return "".join(sentences)

    source_path.write_text(
        "\n\n".join(build_paragraph(offset) for offset in range(4)),
        encoding="utf-8",
    )
    status_context = build_round_context(
        source_path,
        round_number=1,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
    )
    output_path = status_context.output_text_path
    manifest_path = status_context.manifest_path
    for stale_path in (
        output_path,
        manifest_path,
        get_round_checkpoint_path(output_path),
        output_path.with_name(f"{output_path.stem}_compare.json"),
        output_path.with_name(f"{output_path.stem}_quality.json"),
    ):
        try:
            stale_path.unlink(missing_ok=True)
        except PermissionError:
            pass

    first_calls: list[str] = []

    provider_private_message = "CHECKPOINT_PROVIDER_PRIVATE_MESSAGE"

    def failing_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        first_calls.append(chunk_id)
        # An unchanged, hard-valid first candidate now receives its one
        # selector-driven net-gain retry. Fail on the following chunk's first
        # provider call so exactly one completed chunk remains resumable.
        if len(first_calls) == 3:
            raise LLMRequestError(
                provider_private_message,
                category="timeout",
                retryable=False,
                endpoint="https://example.com/private-endpoint",
                provider_message=provider_private_message,
            )
        return chunk_text

    try:
        run_round(
            doc_id=status_context.doc_id,
            round_number=1,
            input_path=source_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=failing_transform,
            prompt_profile="cn_custom",
            prompt_sequence=["classical"],
            checkpoint_metadata={"model": "provider-a/model-1"},
        )
    except RuntimeError as exc:
        if "category=timeout" not in str(exc) or provider_private_message in str(exc):
            raise
    else:
        raise AssertionError("first run must fail to leave a checkpoint")

    checkpoint_path = get_round_checkpoint_path(output_path)
    checkpoint_payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
    if provider_private_message in checkpoint_path.read_text(encoding="utf-8"):
        raise AssertionError("checkpoint persisted the provider-private failure message")
    completed_before = set(checkpoint_payload.get("chunk_outputs", {}))
    if len(completed_before) != 1:
        raise AssertionError(f"expected 1 checkpointed chunk, got {len(completed_before)}")

    status_checkpoint_path = get_round_checkpoint_path(status_context.output_text_path)
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
    if "category=timeout" not in str(progress_status.get("lastError", "")):
        raise AssertionError("progress status must preserve the stable provider error category")
    if provider_private_message in json.dumps(progress_status, ensure_ascii=False):
        raise AssertionError("progress status leaked the provider-private failure message")
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

    prompt_changed_payload = dict(checkpoint_payload)
    prompt_changed_payload["prompt_sha256"] = "changed-prompt-file"
    status_checkpoint_path.write_text(json.dumps(prompt_changed_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    prompt_changed_status = get_round_progress_status(
        str(source_path),
        "cn_custom",
        round_number=1,
        prompt_sequence=["classical"],
    )
    if prompt_changed_status.get("canResume"):
        raise AssertionError("prompt file edits must block stale checkpoint reuse")
    prompt_changed_calls: list[str] = []

    def prompt_changed_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        prompt_changed_calls.append(chunk_id)
        return chunk_text

    try:
        run_round(
            doc_id=status_context.doc_id,
            round_number=1,
            input_path=source_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=prompt_changed_transform,
            prompt_profile="cn_custom",
            prompt_sequence=["classical"],
        )
    except RuntimeError as exc:
        if "Existing checkpoint does not match" not in str(exc) or "prompt_sha256" not in str(exc):
            raise
    else:
        raise AssertionError("prompt-changed checkpoint with saved chunks must block a fresh run")
    if prompt_changed_calls:
        raise AssertionError(f"prompt-changed checkpoint must fail before model calls, got {prompt_changed_calls}")
    status_checkpoint_path.write_text(json.dumps(checkpoint_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    mismatched_payload = dict(checkpoint_payload)
    mismatched_payload["input_sha256"] = "mismatched-input"
    status_checkpoint_path.write_text(json.dumps(mismatched_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    mismatched_status = get_round_progress_status(
        str(source_path),
        "cn_custom",
        round_number=1,
        prompt_sequence=["classical"],
    )
    if mismatched_status.get("canResume"):
        raise AssertionError("incompatible checkpoint status must not be advertised as resumable")
    if "假续跑" not in str(mismatched_status.get("message", "")):
        raise AssertionError("incompatible checkpoint status must explain that false resume was blocked")
    blocked_calls: list[str] = []
    manifest_sentinel = {"sentinel": "blocked checkpoint must not overwrite manifest"}
    manifest_path.write_text(json.dumps(manifest_sentinel, ensure_ascii=False, indent=2), encoding="utf-8")

    def blocked_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        blocked_calls.append(chunk_id)
        return chunk_text

    try:
        run_round(
            doc_id=status_context.doc_id,
            round_number=1,
            input_path=source_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=blocked_transform,
            prompt_profile="cn_custom",
            prompt_sequence=["classical"],
        )
    except RuntimeError as exc:
        if "Existing checkpoint does not match" not in str(exc):
            raise
    else:
        raise AssertionError("incompatible checkpoint with saved chunks must block a fresh rerun")
    if blocked_calls:
        raise AssertionError(f"incompatible checkpoint must fail before model calls, got {blocked_calls}")
    if not status_checkpoint_path.exists():
        raise AssertionError("incompatible checkpoint must not be deleted implicitly")
    still_mismatched = json.loads(status_checkpoint_path.read_text(encoding="utf-8"))
    if still_mismatched.get("input_sha256") != "mismatched-input":
        raise AssertionError("blocked incompatible checkpoint should remain intact until explicit reset")
    manifest_after_block = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest_after_block != manifest_sentinel:
        raise AssertionError("blocked incompatible checkpoint must not overwrite the previous manifest")
    status_checkpoint_path.write_text(json.dumps(checkpoint_payload, ensure_ascii=False, indent=2), encoding="utf-8")

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
    status_checkpoint_path.write_text(json.dumps(checkpoint_payload, ensure_ascii=False, indent=2), encoding="utf-8")

    resumed_calls: list[str] = []

    def resumed_transform(chunk_text: str, _prompt: str, _round_number: int, chunk_id: str) -> str:
        resumed_calls.append(chunk_id)
        return chunk_text

    result = run_round(
        doc_id=status_context.doc_id,
        round_number=1,
        input_path=source_path,
        output_path=output_path,
        manifest_path=manifest_path,
        transform=resumed_transform,
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
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
