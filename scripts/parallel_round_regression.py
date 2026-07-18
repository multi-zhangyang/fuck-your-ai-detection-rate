from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as service  # noqa: E402
from llm_client import LLMRequestError  # noqa: E402


# Keep the four bodies structurally distinct: the ordering probe must not
# manufacture a repeated sentence skeleton that the document-level release
# gate would correctly arbitrate back to its baseline before restoration.
SOURCE_TEXT = "\n\n".join(
    [
        "Firstly, Alpha waits for the first worker.",
        "Firstly, Bravo completes after a short delay, preserving its assigned slot.",
        "Firstly, Charlie verifies that concurrent work can finish early and still return safely.",
        "Firstly, Delta closes the manifest sequence; therefore, restoration remains deterministic.",
    ]
)


def _marked_rewrite(text: str, marker: str) -> str:
    # Keep the order marker while also removing a real mechanical connector so
    # the candidate genuinely beats the baseline under bounded selection.
    return f"[{marker}] {text.removeprefix('Firstly, ')}"


def _read_checkpoint(output_path: Path) -> dict[str, object]:
    checkpoint_path = service.get_round_checkpoint_path(output_path)
    return json.loads(checkpoint_path.read_text(encoding="utf-8"))


def _run_order_regression() -> None:
    lock = threading.Lock()
    completed_order: list[str] = []
    events: list[dict[str, object]] = []
    sleep_by_chunk = {"p0_c0": 0.16, "p1_c0": 0.02, "p2_c0": 0.04, "p3_c0": 0.01}

    def transform(text: str, _prompt_input: str, _round: int, chunk_id: str) -> str:
        time.sleep(sleep_by_chunk.get(chunk_id, 0.01))
        with lock:
            completed_order.append(chunk_id)
        return _marked_rewrite(text, chunk_id)

    with tempfile.TemporaryDirectory(prefix="fyadr_parallel_order_") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.txt"
        output_path = temp_path / "output.txt"
        manifest_path = temp_path / "manifest.json"
        input_path.write_text(SOURCE_TEXT, encoding="utf-8")

        result = service.run_round(
            "parallel-order",
            1,
            input_path,
            output_path,
            manifest_path,
            transform,
            chunk_limit=1800,
            progress_callback=events.append,
            max_concurrency=16,
        )

        expected_output = "\n\n".join(
            [
                "[p0_c0] Alpha waits for the first worker.",
                "[p1_c0] Bravo completes after a short delay, preserving its assigned slot.",
                "[p2_c0] Charlie verifies that concurrent work can finish early and still return safely.",
                "[p3_c0] Delta closes the manifest sequence; therefore, restoration remains deterministic.",
            ]
        )
        if output_path.read_text(encoding="utf-8") != expected_output:
            raise AssertionError("parallel round output was not restored in manifest order")
        if completed_order and completed_order[0] == "p0_c0":
            raise AssertionError(f"regression did not exercise out-of-order completion: {completed_order}")
        run_audit = result.get("run_audit")
        if not isinstance(run_audit, dict) or int(run_audit.get("rewriteConcurrency", 0) or 0) != 16:
            raise AssertionError("run audit did not record effective rewrite concurrency")
        if not any(int(event.get("configuredConcurrency", 0) or 0) == 16 for event in events):
            raise AssertionError("progress did not report configured rewrite concurrency")
        if not any(int(event.get("concurrency", 0) or 0) == 4 for event in events):
            raise AssertionError("progress did not report effective worker concurrency")
        if not any(event.get("activeChunks") and int(event.get("activeChunks", 0) or 0) > 1 for event in events):
            raise AssertionError("progress never reported concurrent active chunks")
        if not any(event.get("phase") == "chunk-complete" and event.get("completedChunks") for event in events):
            raise AssertionError("chunk-complete progress did not include completedChunks")


def _run_failure_resume_regression() -> None:
    original_should_freeze = service.should_freeze_chunk
    service.should_freeze_chunk = lambda *_args, **_kwargs: False
    try:
        first_calls: list[str] = []
        resume_calls: list[str] = []

        def failing_transform(text: str, _prompt_input: str, _round: int, chunk_id: str) -> str:
            first_calls.append(chunk_id)
            if chunk_id == "p0_c0":
                time.sleep(0.12)
                return _marked_rewrite(text, f"first:{chunk_id}")
            if chunk_id == "p1_c0":
                time.sleep(0.02)
                raise LLMRequestError(
                    "synthetic provider failure",
                    category="server",
                    status_code=503,
                    retryable=True,
                    attempts=3,
                    cooldown_seconds=20,
                    provider_message="busy",
                )
            return _marked_rewrite(text, f"unexpected:{chunk_id}")

        def resume_transform(text: str, _prompt_input: str, _round: int, chunk_id: str) -> str:
            resume_calls.append(chunk_id)
            return _marked_rewrite(text, f"resume:{chunk_id}")

        with tempfile.TemporaryDirectory(prefix="fyadr_parallel_resume_") as temp_dir:
            temp_path = Path(temp_dir)
            input_path = temp_path / "input.txt"
            output_path = temp_path / "output.txt"
            manifest_path = temp_path / "manifest.json"
            input_path.write_text(SOURCE_TEXT, encoding="utf-8")

            try:
                service.run_round(
                    "parallel-resume",
                    1,
                    input_path,
                    output_path,
                    manifest_path,
                    failing_transform,
                    chunk_limit=1800,
                    max_concurrency=2,
                )
            except RuntimeError:
                pass
            else:
                raise AssertionError("parallel failure regression did not raise")

            checkpoint = _read_checkpoint(output_path)
            checkpoint_outputs = checkpoint.get("chunk_outputs")
            if not isinstance(checkpoint_outputs, dict) or checkpoint_outputs.get("p0_c0") is None:
                raise AssertionError("in-flight successful chunk was not checkpointed after sibling failure")
            checkpoint_error_details = checkpoint.get("last_error_details")
            if not isinstance(checkpoint_error_details, dict) or checkpoint_error_details.get("errorCategory") != "server":
                raise AssertionError("provider failure details were not checkpointed")
            if "p2_c0" in first_calls or "p3_c0" in first_calls:
                raise AssertionError(f"new chunks were submitted after failure: {first_calls}")

            service.run_round(
                "parallel-resume",
                1,
                input_path,
                output_path,
                manifest_path,
                resume_transform,
                chunk_limit=1800,
                max_concurrency=2,
            )

            if "p0_c0" in resume_calls:
                raise AssertionError("resume reran a checkpointed chunk")
            expected_output = "\n\n".join(
                [
                    "[first:p0_c0] Alpha waits for the first worker.",
                    "[resume:p1_c0] Bravo completes after a short delay, preserving its assigned slot.",
                    "[resume:p2_c0] Charlie verifies that concurrent work can finish early and still return safely.",
                    "[resume:p3_c0] Delta closes the manifest sequence; therefore, restoration remains deterministic.",
                ]
            )
            if output_path.read_text(encoding="utf-8") != expected_output:
                raise AssertionError("parallel resume output was not restored in manifest order")
    finally:
        service.should_freeze_chunk = original_should_freeze


def _run_cancel_regression() -> None:
    cancel_state = {"requested": False}
    calls: list[str] = []
    events: list[dict[str, object]] = []

    def cancel_check() -> bool:
        return cancel_state["requested"]

    def transform(text: str, _prompt_input: str, _round: int, chunk_id: str) -> str:
        calls.append(chunk_id)
        if chunk_id == "p0_c0":
            time.sleep(0.02)
            cancel_state["requested"] = True
            return _marked_rewrite(text, f"kept:{chunk_id}")
        time.sleep(0.08)
        if cancel_state["requested"]:
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")
        return _marked_rewrite(text, f"unexpected:{chunk_id}")

    with tempfile.TemporaryDirectory(prefix="fyadr_parallel_cancel_") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.txt"
        output_path = temp_path / "output.txt"
        manifest_path = temp_path / "manifest.json"
        input_path.write_text(SOURCE_TEXT, encoding="utf-8")

        try:
            service.run_round(
                "parallel-cancel",
                1,
                input_path,
                output_path,
                manifest_path,
                transform,
                chunk_limit=1800,
                progress_callback=events.append,
                cancel_check=cancel_check,
                max_concurrency=2,
            )
        except RuntimeError as exc:
            if "interrupted by user" not in str(exc):
                raise AssertionError(f"cancel should raise the user interruption message, got: {exc}") from exc
        else:
            raise AssertionError("parallel cancel regression did not raise")

        checkpoint = _read_checkpoint(output_path)
        checkpoint_outputs = checkpoint.get("chunk_outputs")
        if not isinstance(checkpoint_outputs, dict) or checkpoint_outputs.get("p0_c0") is None:
            raise AssertionError("completed chunk was not checkpointed during cancel")
        if "p2_c0" in calls or "p3_c0" in calls:
            raise AssertionError(f"new chunks were submitted after cancel: {calls}")
        if any(event.get("phase") == "chunk-failed" for event in events):
            raise AssertionError("cancelled in-flight work was reported as a chunk failure")
        if not any(event.get("phase") == "cancel-requested" for event in events):
            raise AssertionError("parallel cancel did not emit cancel-requested progress")


def main() -> int:
    original_validate = service.validate_chunk_output
    original_should_freeze = service.should_freeze_chunk
    service.validate_chunk_output = lambda *_args, **_kwargs: None
    service.should_freeze_chunk = lambda *_args, **_kwargs: False
    try:
        _run_order_regression()
        _run_failure_resume_regression()
        _run_cancel_regression()
    finally:
        service.validate_chunk_output = original_validate
        service.should_freeze_chunk = original_should_freeze
    print("parallel_round_regression: ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
