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


def check_partial_failure_continues(failures: list[str]) -> None:
    _reset_state()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    calls: list[str] = []
    rejected_candidate = {
        "attempt": 1,
        "candidate": 1,
        "outputText": "model output rejected by guard",
        "outputCharCount": 30,
        "truncated": False,
        "error": "synthetic validation guard",
    }

    def compare_with_rejected_candidate(output_path: str) -> dict[str, Any]:
        compare = _minimal_compare(output_path, ["p1", "p2", "p3"])
        compare["chunks"][1]["rejectedCandidates"] = [rejected_candidate]
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
        web_app.read_round_compare = compare_with_rejected_candidate
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
        _assert(state.failures and state.failures[0].get("rejectedCandidates") == [rejected_candidate], "Batch rerun failure should preserve rejected model candidates.", failures)
        _assert(state.result and state.result["failures"][0].get("rejectedCandidates") == [rejected_candidate], "Final batch result should expose rejected model candidates.", failures)
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
        _assert(item.get("failures") == [{"chunkId": "p2", "error": "synthetic failure"}], "Persisted summary should retain failures.", failures)


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


def check_single_rerun_error_exposes_failure_candidates(failures: list[str]) -> None:
    _reset_state()
    client = web_app.app.test_client()
    original_rerun = web_app.rerun_compare_chunk
    original_read_compare = web_app.read_round_compare
    rejected_candidate = {
        "attempt": 1,
        "candidate": 2,
        "outputText": "single rerun rejected output",
        "outputCharCount": 28,
        "truncated": False,
        "error": "single guard failure",
    }

    def compare_with_rejected_candidate(output_path: str) -> dict[str, Any]:
        compare = _minimal_compare(output_path, ["p1", "p2"])
        compare["chunks"][0]["rejectedCandidates"] = [rejected_candidate]
        compare["chunks"][0]["quality"] = {"needsReview": True, "flags": ["validation_failed"]}
        return compare

    def fake_rerun(output_path: str, chunk_id: str, model_config: dict[str, Any], user_feedback: str = "") -> dict[str, Any]:
        raise RuntimeError("single rerun synthetic failure")

    try:
        web_app.rerun_compare_chunk = fake_rerun
        web_app.read_round_compare = compare_with_rejected_candidate
        response = client.post(
            "/api/rerun-chunk",
            json={"outputPath": str(OUTPUT_PATH), "chunkId": "p1", "modelConfig": ONLINE_TEST_MODEL_CONFIG},
        )
        payload = response.get_json() or {}
        _assert(response.status_code == 400, f"Single rerun failure should return 400, got {response.status_code}.", failures)
        _assert(payload.get("failure", {}).get("rejectedCandidates") == [rejected_candidate], "Single rerun error payload should expose rejected candidates.", failures)
    finally:
        web_app.rerun_compare_chunk = original_rerun
        web_app.read_round_compare = original_read_compare


def main() -> int:
    failures: list[str] = []
    check_partial_failure_continues(failures)
    check_cancel_stops_before_next_chunk(failures)
    check_health_reports_active_batch_reruns(failures)
    check_persisted_batch_summary_survives_memory_loss(failures)
    check_status_and_cancel_routes_fall_back_to_persisted_batch(failures)
    check_single_rerun_error_exposes_failure_candidates(failures)
    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(REPORT_PATH),
        "failures": failures,
        "checks": [
            "batch rerun isolates per-chunk failures",
            "batch rerun failures expose rejected model output",
            "batch rerun cancel stops before next chunk",
            "terminal states release active output locks",
            "health diagnostics exposes active batch reruns",
            "persisted batch summaries survive backend memory loss",
            "persisted batch status and cancel routes survive memory loss",
            "single rerun errors expose rejected model output",
        ],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
