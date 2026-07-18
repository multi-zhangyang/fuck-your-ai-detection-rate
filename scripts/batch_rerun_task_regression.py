from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "batch_rerun_task_regression_report.json"
OUTPUT_PATH = ROOT_DIR / "finish" / "regression" / "batch_rerun_task_output.txt"
TASK_STATE_TEST_DIR = ROOT_DIR / "finish" / "regression" / "batch_rerun_task_states"
ONLINE_TEST_MODEL_CONFIG = {"baseUrl": "http://localhost/v1", "apiKey": "regression", "model": "regression-model"}
PRIVATE_FAILED_BODY = "PRIVATE_FAILED_BODY_BATCH_7F91"
PRIVATE_RAW_ERROR = "<think>PRIVATE_REASONING_BATCH_7F91</think>"

web_app.TASK_STATE_DIR = TASK_STATE_TEST_DIR


def _minimal_compare(output_path: str, chunk_ids: list[str]) -> dict[str, Any]:
    return {
        "round": 1,
        "outputPath": output_path,
        "manifestPath": "",
        "comparePath": "",
        "docId": "batch-rerun-regression",
        "chunkCount": len(chunk_ids),
        "paragraphCount": len(chunk_ids),
        "chunks": [
            {
                "chunkId": chunk_id,
                "inputText": f"input {chunk_id}",
                "outputText": f"output {chunk_id}",
                "quality": {"needsReview": False},
            }
            for chunk_id in chunk_ids
        ],
        "qualitySummary": {},
    }


def _reset_state() -> None:
    web_app.BATCH_RERUN_STATES.clear()
    web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text("seed", encoding="utf-8")
    if TASK_STATE_TEST_DIR.exists():
        shutil.rmtree(TASK_STATE_TEST_DIR)
    TASK_STATE_TEST_DIR.mkdir(parents=True, exist_ok=True)


def _assert(condition: bool, message: str, failures: list[str]) -> None:
    if not condition:
        failures.append(message)


def _assert_text_free_attempt(value: Any, label: str, failures: list[str]) -> None:
    _assert(isinstance(value, dict), f"{label} must be an object.", failures)
    if not isinstance(value, dict):
        return
    _assert(value.get("schema") == "fyadr.failed-attempt-evidence", f"{label} schema mismatch.", failures)
    _assert(value.get("schemaVersion") == 1, f"{label} schema version mismatch.", failures)
    _assert(value.get("textStored") is False, f"{label} must declare textStored=false.", failures)
    _assert(value.get("errorStored") is False, f"{label} must declare errorStored=false.", failures)
    _assert(isinstance(value.get("outputTextSha256"), str), f"{label} must retain a body hash.", failures)
    for forbidden in ("outputText", "preview", "error", "hardValidationError", "providerMessage", "reasoning", "thinking"):
        _assert(forbidden not in value, f"{label} leaked forbidden field {forbidden}.", failures)


def check_partial_failure_continues(failures: list[str]) -> None:
    _reset_state()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    calls: list[str] = []
    failed_attempt = {
        "attempt": 1,
        "outputText": PRIVATE_FAILED_BODY,
        "outputCharCount": len(PRIVATE_FAILED_BODY),
        "truncated": False,
        "error": PRIVATE_RAW_ERROR,
    }

    def compare_with_failed_attempt(output_path: str) -> dict[str, Any]:
        compare = _minimal_compare(output_path, ["p1", "p2", "p3"])
        compare["chunks"][1]["failedAttempts"] = [failed_attempt]
        compare["chunks"][1]["quality"] = {"needsReview": True, "flags": ["validation_failed"]}
        return compare

    def fake_rerun(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
        calls.append(chunk_id)
        if chunk_id == "p2":
            raise RuntimeError("synthetic failure")
        return {
            "outputPath": output_path,
            "comparePath": str(OUTPUT_PATH.with_suffix(".compare.json")),
            "compare": _minimal_compare(output_path, ["p1", "p2", "p3"]),
            "chunk": {"chunkId": chunk_id},
        }

    try:
        web_app.rerun_compare_chunk = fake_rerun
        web_app.read_round_compare = compare_with_failed_attempt
        run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 3)
        web_app.batch_rerun_async(
            run_id,
            str(OUTPUT_PATH),
            [{"chunkId": "p1"}, {"chunkId": "p2"}, {"chunkId": "p3"}],
            ONLINE_TEST_MODEL_CONFIG,
        )
        _assert(state.completed, "Batch rerun should complete after isolated per-chunk failures.", failures)
        _assert(state.status == "completed", f"Expected completed status, got {state.status!r}.", failures)
        _assert(calls == ["p1", "p2", "p3"], f"Expected all chunks to be attempted, got {calls!r}.", failures)
        _assert(state.success_count == 2, f"Expected 2 successes, got {state.success_count}.", failures)
        _assert(state.failure_count == 1, f"Expected 1 failure, got {state.failure_count}.", failures)
        _assert(state.result and state.result["failureCount"] == 1, "Final result should preserve failure count.", failures)
        _assert(state.result and state.result["successChunkIds"] == ["p1", "p3"], "Final result should preserve successful chunk ids.", failures)
        state_attempts = state.failures[0].get("failedAttempts") if state.failures else []
        result_attempts = state.result["failures"][0].get("failedAttempts") if state.result and state.result.get("failures") else []
        _assert(bool(state_attempts), "Batch rerun failure should retain text-free failed-attempt evidence.", failures)
        _assert(bool(result_attempts), "Final batch result should retain text-free failed-attempt evidence.", failures)
        if state_attempts:
            _assert_text_free_attempt(state_attempts[0], "batch state failed attempt", failures)
        if result_attempts:
            _assert_text_free_attempt(result_attempts[0], "batch result failed attempt", failures)
        public_state = web_app.serialize_batch_rerun_state(run_id, state)
        serialized_state = json.dumps(public_state, ensure_ascii=False)
        _assert(PRIVATE_FAILED_BODY not in serialized_state, "Batch status leaked the failed candidate body.", failures)
        _assert("PRIVATE_REASONING_BATCH_7F91" not in serialized_state, "Batch status leaked reasoning/error prose.", failures)
        _assert(not web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT, "Completed batch rerun should release active output lock.", failures)
    finally:
        web_app.rerun_compare_chunk = original_rerun
        web_app.read_round_compare = original_read_compare


def check_cancel_stops_before_next_chunk(failures: list[str]) -> None:
    _reset_state()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    calls: list[str] = []
    run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 3)

    def fake_rerun(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
        calls.append(chunk_id)
        with state.condition:
            state.cancel_requested = True
            state.condition.notify_all()
        return {
            "outputPath": output_path,
            "comparePath": str(OUTPUT_PATH.with_suffix(".compare.json")),
            "compare": _minimal_compare(output_path, ["p1", "p2", "p3"]),
            "chunk": {"chunkId": chunk_id},
        }

    try:
        web_app.rerun_compare_chunk = fake_rerun
        web_app.read_round_compare = lambda output_path: _minimal_compare(output_path, ["p1", "p2", "p3"])
        web_app.batch_rerun_async(
            run_id,
            str(OUTPUT_PATH),
            [{"chunkId": "p1"}, {"chunkId": "p2"}, {"chunkId": "p3"}],
            ONLINE_TEST_MODEL_CONFIG,
        )
        _assert(calls == ["p1"], f"Cancel should stop before the next chunk, got calls {calls!r}.", failures)
        _assert(state.completed, "Canceled batch rerun should still reach a terminal state.", failures)
        _assert(state.status == "canceled", f"Expected canceled status, got {state.status!r}.", failures)
        _assert(state.result and state.result["canceled"] is True, "Final result should mark canceled=true.", failures)
    finally:
        web_app.rerun_compare_chunk = original_rerun
        web_app.read_round_compare = original_read_compare


def check_batch_holds_output_mutation_lock(failures: list[str]) -> None:
    _reset_state()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    original_get_lock = web_app.get_output_rerun_lock
    observations: list[bool] = []

    class TrackingLock:
        def __init__(self) -> None:
            self.held = False
            self.acquire_count = 0
            self.release_count = 0

        def acquire(self) -> None:
            self.acquire_count += 1
            self.held = True

        def release(self) -> None:
            self.release_count += 1
            self.held = False

    tracking_lock = TrackingLock()

    def fake_rerun(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
        observations.append(tracking_lock.held)
        return {
            "outputPath": output_path,
            "comparePath": str(OUTPUT_PATH.with_suffix(".compare.json")),
            "compare": _minimal_compare(output_path, ["p1", "p2"]),
            "chunk": {"chunkId": chunk_id},
        }

    try:
        web_app.get_output_rerun_lock = lambda _output_path: tracking_lock
        web_app.rerun_compare_chunk = fake_rerun
        web_app.read_round_compare = lambda output_path: _minimal_compare(output_path, ["p1", "p2"])
        run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 2)
        web_app.batch_rerun_async(
            run_id,
            str(OUTPUT_PATH),
            [{"chunkId": "p1"}, {"chunkId": "p2"}],
            ONLINE_TEST_MODEL_CONFIG,
        )
        _assert(state.completed, "Mutation-lock batch fixture should complete.", failures)
        _assert(observations == [True, True], f"Every batch target must execute while the output lock is held: {observations!r}.", failures)
        _assert(tracking_lock.acquire_count == 1, "A batch should acquire its output mutation lock once.", failures)
        _assert(tracking_lock.release_count == 1 and not tracking_lock.held, "A terminal batch must release its output mutation lock.", failures)
    finally:
        web_app.get_output_rerun_lock = original_get_lock
        web_app.rerun_compare_chunk = original_rerun
        web_app.read_round_compare = original_read_compare


def check_health_reports_active_batch_reruns(failures: list[str]) -> None:
    _reset_state()
    run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 2)
    state.completed_count = 1
    state.success_count = 1
    state.current_index = 2
    state.current_chunk_id = "p2"
    try:
        diagnostics = web_app.build_environment_diagnostics()
        active_batches = diagnostics.get("activeBatchReruns") or []
        tasks = diagnostics.get("tasks") or []
        _assert(diagnostics.get("activeBatchRerunCount") == 1, "Health diagnostics should count active batch reruns.", failures)
        _assert(any(item.get("runId") == run_id for item in active_batches), "Health diagnostics should expose active batch rerun status.", failures)
        _assert(any(item.get("runId") == run_id and item.get("taskType") == "batch-rerun" and item.get("taskGroup") == "active" for item in tasks), "Unified task diagnostics should expose active batch reruns.", failures)
        _assert(any(item.get("key") == "runs" and item.get("level") == "warning" for item in diagnostics.get("checks", [])), "Health diagnostics should warn when any task is active.", failures)
    finally:
        web_app.BATCH_RERUN_STATES.pop(run_id, None)
        web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.pop(state.output_path, None)


def check_persisted_batch_summary_survives_memory_loss(failures: list[str]) -> None:
    _reset_state()
    run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 3)
    state.completed_count = 2
    state.success_count = 1
    state.failure_count = 1
    state.current_index = 3
    state.current_chunk_id = "p3"
    state.success_chunk_ids = ["p1"]
    state.failures = [{"chunkId": "p2", "error": "synthetic failure"}]
    web_app.persist_batch_rerun_state(run_id)
    web_app.BATCH_RERUN_STATES.clear()
    web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()
    diagnostics = web_app.build_environment_diagnostics()
    recent_batches = diagnostics.get("recentBatchReruns") or []
    recent_tasks = diagnostics.get("recentTasks") or []
    matching = [item for item in recent_batches if item.get("runId") == run_id]
    matching_tasks = [item for item in recent_tasks if item.get("runId") == run_id]
    _assert(diagnostics.get("activeBatchRerunCount") == 0, "Persisted summaries should not be treated as live tasks after memory loss.", failures)
    _assert(diagnostics.get("recentBatchRerunCount", 0) >= 1, "Diagnostics should count recent persisted batch summaries.", failures)
    _assert(diagnostics.get("recentTaskCount", 0) >= 1, "Diagnostics should count unified recent task summaries.", failures)
    _assert(bool(matching), "Persisted batch summary should survive in diagnostics after memory loss.", failures)
    _assert(bool(matching_tasks), "Persisted batch summary should appear in unified recent task diagnostics.", failures)
    if matching_tasks:
        _assert(matching_tasks[0].get("taskType") == "batch-rerun", "Unified recent task should identify batch rerun type.", failures)
        _assert(matching_tasks[0].get("targetPath") == str(OUTPUT_PATH), "Unified recent task should preserve target output path.", failures)
    if matching:
        item = matching[0]
        _assert(item.get("status") == "interrupted", f"Unfinished persisted task should be marked interrupted, got {item.get('status')!r}.", failures)
        _assert(item.get("completed") is True, "Interrupted persisted summary should be terminal for polling safety.", failures)
        _assert(item.get("successChunkIds") == ["p1"], "Persisted summary should retain successful chunk ids.", failures)
        persisted_failures = item.get("failures") or []
        _assert(bool(persisted_failures), "Persisted summary should retain text-free failure evidence.", failures)
        if persisted_failures:
            _assert(persisted_failures[0].get("errorStored") is False, "Persisted summary must not retain raw errors.", failures)
            _assert(persisted_failures[0].get("error") != "synthetic failure", "Persisted summary exposed the raw failure string.", failures)


def check_status_and_cancel_routes_fall_back_to_persisted_batch(failures: list[str]) -> None:
    _reset_state()
    client = web_app.app.test_client()
    run_id, state = web_app.register_batch_rerun(str(OUTPUT_PATH), 2)
    state.completed_count = 1
    state.success_count = 1
    state.current_index = 2
    state.current_chunk_id = "p2"
    web_app.persist_batch_rerun_state(run_id)
    web_app.BATCH_RERUN_STATES.clear()
    web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()

    status_response = client.get(f"/api/batch-rerun-status/{run_id}")
    cancel_response = client.post(f"/api/batch-rerun/{run_id}/cancel")

    _assert(status_response.status_code == 200, f"Persisted batch status should return 200, got {status_response.status_code}.", failures)
    status_payload = status_response.get_json() or {}
    _assert(status_payload.get("status") == "interrupted", f"Persisted batch status should be interrupted, got {status_payload.get('status')!r}.", failures)
    _assert(status_payload.get("completed") is True, "Persisted batch status should be terminal for polling safety.", failures)
    _assert(status_payload.get("restoredFromDisk") is True, "Persisted batch status should mark restoredFromDisk.", failures)
    _assert(cancel_response.status_code == 200, f"Persisted batch cancel should be idempotent, got {cancel_response.status_code}.", failures)
    _assert((cancel_response.get_json() or {}).get("restoredFromDisk") is True, "Persisted batch cancel should not 404 after restart.", failures)


def check_single_rerun_error_exposes_failed_attempts(failures: list[str]) -> None:
    _reset_state()
    client = web_app.app.test_client()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    legacy_failed_attempt = {
        "attempt": 1,
        "candidate": 2,
        "outputText": PRIVATE_FAILED_BODY,
        "outputCharCount": len(PRIVATE_FAILED_BODY),
        "truncated": False,
        "error": PRIVATE_RAW_ERROR,
    }

    def compare_with_failed_attempt(output_path: str) -> dict[str, Any]:
        compare = _minimal_compare(output_path, ["p1", "p2"])
        compare["chunks"][0]["rejectedCandidates"] = [legacy_failed_attempt]
        compare["chunks"][0]["quality"] = {"needsReview": True, "flags": ["validation_failed"]}
        return compare

    def fake_rerun(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
        raise RuntimeError("single rerun synthetic failure")

    try:
        web_app.rerun_compare_chunk = fake_rerun
        web_app.read_round_compare = compare_with_failed_attempt
        response = client.post(
            "/api/rerun-chunk",
            json={"outputPath": str(OUTPUT_PATH), "chunkId": "p1", "modelConfig": ONLINE_TEST_MODEL_CONFIG},
        )
        payload = response.get_json() or {}
        _assert(response.status_code == 400, f"Single rerun failure should return 400, got {response.status_code}.", failures)
        returned_attempts = payload.get("failure", {}).get("failedAttempts") or []
        _assert(bool(returned_attempts), "Single rerun error payload should expose text-free failed-attempt evidence.", failures)
        if returned_attempts:
            _assert_text_free_attempt(returned_attempts[0], "single rerun failed attempt", failures)
        serialized_payload = json.dumps(payload, ensure_ascii=False)
        _assert(PRIVATE_FAILED_BODY not in serialized_payload, "Single rerun API leaked the failed body.", failures)
        _assert("PRIVATE_REASONING_BATCH_7F91" not in serialized_payload, "Single rerun API leaked reasoning/error prose.", failures)
    finally:
        web_app.rerun_compare_chunk = original_rerun
        web_app.read_round_compare = original_read_compare


def check_legacy_compare_read_is_private_and_non_mutating(failures: list[str]) -> None:
    _reset_state()
    compare_path = OUTPUT_PATH.with_name(f"{OUTPUT_PATH.stem}_compare.json")
    legacy_compare = _minimal_compare(str(OUTPUT_PATH), ["p1"])
    legacy_compare["chunks"][0]["failedAttempts"] = [
        {
            "attempt": {"body": PRIVATE_FAILED_BODY},
            "outputText": PRIVATE_FAILED_BODY,
            "preview": PRIVATE_FAILED_BODY,
            "error": PRIVATE_RAW_ERROR,
            "providerMessage": PRIVATE_FAILED_BODY,
        }
    ]
    legacy_compare["validationEvents"] = [
        {
            "event": "future-private-event",
            "chunkId": "p1",
            "message": PRIVATE_FAILED_BODY,
            "body": PRIVATE_FAILED_BODY,
            "detail": {"thinking": PRIVATE_RAW_ERROR},
        }
    ]
    compare_path.write_text(json.dumps(legacy_compare, ensure_ascii=False, indent=2), encoding="utf-8")
    before_bytes = compare_path.read_bytes()
    before_mtime = compare_path.stat().st_mtime_ns
    projected = web_app.read_round_compare(str(OUTPUT_PATH))
    after_bytes = compare_path.read_bytes()
    after_mtime = compare_path.stat().st_mtime_ns
    projected_attempts = projected.get("chunks", [{}])[0].get("failedAttempts") or []
    _assert(bool(projected_attempts), "Legacy compare read lost failed-attempt identity evidence.", failures)
    if projected_attempts:
        _assert_text_free_attempt(projected_attempts[0], "legacy compare projected attempt", failures)
    serialized = json.dumps(projected, ensure_ascii=False)
    _assert(PRIVATE_FAILED_BODY not in serialized, "Legacy compare API projection leaked a failed body.", failures)
    _assert("PRIVATE_REASONING_BATCH_7F91" not in serialized, "Legacy compare API projection leaked reasoning/error prose.", failures)
    _assert(before_bytes == after_bytes, "Legacy compare read silently rewrote authoritative bytes without a revision transaction.", failures)
    _assert(before_mtime == after_mtime, "Legacy compare read changed mtime without a revision transaction.", failures)


def main() -> int:
    failures: list[str] = []
    check_partial_failure_continues(failures)
    check_cancel_stops_before_next_chunk(failures)
    check_batch_holds_output_mutation_lock(failures)
    check_health_reports_active_batch_reruns(failures)
    check_persisted_batch_summary_survives_memory_loss(failures)
    check_status_and_cancel_routes_fall_back_to_persisted_batch(failures)
    check_single_rerun_error_exposes_failed_attempts(failures)
    check_legacy_compare_read_is_private_and_non_mutating(failures)
    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(REPORT_PATH),
        "failures": failures,
        "checks": [
            "batch rerun isolates per-chunk failures",
            "batch rerun failures retain text-free failed-attempt evidence",
            "batch rerun cancel stops before next chunk",
            "ordinary batch reruns hold one output mutation lock across all targets",
            "terminal states release active output locks",
            "health diagnostics exposes active batch reruns",
            "persisted batch summaries survive backend memory loss",
            "persisted batch status and cancel routes survive memory loss",
            "single rerun errors expose only text-free failed-attempt evidence",
            "legacy compare reads project privacy without mutating authoritative bytes",
        ],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
