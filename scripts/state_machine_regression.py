from __future__ import annotations

import inspect
import json
import os
import shutil
import threading
import time
import unittest
from pathlib import Path

import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]
REGRESSION_DIR = ROOT_DIR / "finish" / "regression"
SAMPLE_PATH = ROOT_DIR / "origin" / "state_machine_sample.txt"
TASK_STATE_TEST_DIR = REGRESSION_DIR / "run_task_states"

web_app.TASK_STATE_DIR = TASK_STATE_TEST_DIR


def clear_run_memory() -> None:
    with web_app.RUN_REGISTRY_LOCK:
        web_app.RUN_STATES.clear()
        web_app.ACTIVE_RUNS_BY_SOURCE.clear()
        web_app.BATCH_RERUN_STATES.clear()
        web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()


def reset_run_registry() -> None:
    clear_run_memory()
    web_app.TASK_STATE_SELF_HEAL_CACHE = None
    web_app.TASK_STATE_SELF_HEAL_CACHE_AT = 0.0
    if TASK_STATE_TEST_DIR.exists():
        shutil.rmtree(TASK_STATE_TEST_DIR)
    TASK_STATE_TEST_DIR.mkdir(parents=True, exist_ok=True)


def write_sample() -> Path:
    SAMPLE_PATH.parent.mkdir(parents=True, exist_ok=True)
    SAMPLE_PATH.write_text(
        "本文用于状态机回归测试。它不会调用模型，也不会参与实际改写。\n\n"
        "第二段用于确认同一文档重复运行时会被拦截。",
        encoding="utf-8",
    )
    return SAMPLE_PATH


class WebRunStateRegressionTest(unittest.TestCase):
    def setUp(self) -> None:
        reset_run_registry()
        self.sample_path = write_sample()
        self.client = web_app.app.test_client()

    def tearDown(self) -> None:
        reset_run_registry()

    def test_register_run_blocks_duplicate_until_finalized(self) -> None:
        first_run_id, _ = web_app.register_run(str(self.sample_path))

        with self.assertRaisesRegex(ValueError, "already has a running task"):
            web_app.register_run(str(self.sample_path))

        web_app.finalize_progress(first_run_id, result={"ok": True})
        second_run_id, _ = web_app.register_run(str(self.sample_path))

        self.assertNotEqual(first_run_id, second_run_id)
        self.assertIn(second_run_id, web_app.RUN_STATES)

    def test_cancel_route_marks_state_and_emits_event(self) -> None:
        run_id, state = web_app.register_run(str(self.sample_path))

        response = self.client.post(f"/api/run-round/{run_id}/cancel")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(state.cancel_requested)
        self.assertEqual(state.status, "canceling")
        self.assertTrue(any(event.get("phase") == "cancel-requested" for event in state.events))

    def test_run_status_reports_lifecycle(self) -> None:
        run_id, state = web_app.register_run(str(self.sample_path))

        initial = self.client.get(f"/api/run-round-status/{run_id}")
        self.assertEqual(initial.status_code, 200)
        initial_payload = initial.get_json()
        self.assertEqual(initial_payload["status"], "running")
        self.assertFalse(initial_payload["completed"])

        self.client.post(f"/api/run-round/{run_id}/cancel")
        canceling = self.client.get(f"/api/run-round-status/{run_id}").get_json()
        self.assertEqual(canceling["status"], "canceling")
        self.assertTrue(canceling["cancelRequested"])

        web_app.finalize_progress(run_id, error="Run interrupted by user.")
        completed = self.client.get(f"/api/run-round-status/{run_id}").get_json()
        self.assertEqual(completed["status"], "canceled")
        self.assertTrue(completed["completed"])
        self.assertEqual(completed["error"], "Run interrupted by user.")
        self.assertEqual(completed["lastEvent"]["phase"], "run-interrupted")
        self.assertFalse(completed["lastEvent"]["autoRetryEligible"])

    def test_forced_interruption_reports_auto_retry_hint(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.append_progress_event(run_id, {"phase": "chunk-start", "round": 2, "chunkId": "p2_c0"})

        web_app.finalize_progress(run_id, error="Worker interrupted by process signal.")

        completed = self.client.get(f"/api/run-round-status/{run_id}").get_json()
        self.assertEqual(completed["status"], "canceled")
        self.assertEqual(completed["lastEvent"]["phase"], "run-interrupted")
        self.assertEqual(completed["lastEvent"]["round"], 2)
        self.assertTrue(completed["lastEvent"]["autoRetryEligible"])
        self.assertEqual(completed["lastEvent"]["retryDelaySeconds"], 10)
        self.assertEqual(completed["lastEvent"]["maxAutoRetries"], 3)
        self.assertEqual(completed["automation"]["kind"], "retry")
        self.assertTrue(completed["automation"]["eligible"])

    def test_completed_round_reports_next_round_delay_hint(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))

        web_app.finalize_progress(run_id, result={"round": 1, "outputPath": str(self.sample_path)})

        completed = self.client.get(f"/api/run-round-status/{run_id}").get_json()
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["lastEvent"]["phase"], "round-complete")
        self.assertEqual(completed["lastEvent"]["round"], 1)
        self.assertEqual(completed["lastEvent"]["nextRoundDelaySeconds"], 60)
        self.assertEqual(completed["automation"]["kind"], "next-round")
        self.assertTrue(completed["automation"]["eligible"])

    def test_run_task_snapshot_is_persisted_without_model_secrets(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.append_progress_event(
            run_id,
            {
                "phase": "model-selected",
                "round": 1,
                "roundModel": {
                    "providerName": "private-provider",
                    "baseUrl": "https://private.example/v1",
                    "apiKey": "sk-private",
                    "model": "private-model",
                },
            },
        )
        web_app.finalize_progress(
            run_id,
            result={
                "round": 1,
                "outputPath": str(self.sample_path),
                "manifestPath": "",
                "comparePath": "",
                "chunkLimit": 1,
                "inputSegmentCount": 1,
                "outputSegmentCount": 1,
                "paragraphCount": 1,
                "roundModel": {
                    "providerName": "private-provider",
                    "baseUrl": "https://private.example/v1",
                    "apiKey": "sk-private",
                    "model": "private-model",
                    "apiType": "chat_completions",
                },
            },
        )

        payload = json.loads(web_app.run_round_state_path(run_id).read_text(encoding="utf-8"))
        serialized = json.dumps(payload, ensure_ascii=False)

        self.assertEqual(payload["kind"], "runRound")
        self.assertNotIn("https://private.example", serialized)
        self.assertNotIn("sk-private", serialized)
        self.assertNotIn("private-provider", serialized)
        self.assertNotIn("private-model", serialized)
        self.assertEqual(payload["state"]["lastEvent"]["phase"], "round-complete")
        self.assertNotIn("roundModel", payload["state"]["lastEvent"])
        self.assertEqual(payload["state"]["result"]["roundModel"]["model"], "<configured>")

    def test_task_state_atomic_write_handles_concurrent_writers(self) -> None:
        output_path = TASK_STATE_TEST_DIR / "run_round_concurrent.json"
        errors: list[BaseException] = []

        def write_snapshot(index: int) -> None:
            try:
                web_app.write_json_atomic(output_path, {"index": index, "ok": True})
            except BaseException as exc:
                errors.append(exc)

        threads = [threading.Thread(target=write_snapshot, args=(index,)) for index in range(16)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        payload = json.loads(output_path.read_text(encoding="utf-8"))
        temp_paths = list(TASK_STATE_TEST_DIR.glob("run_round_concurrent*.json.tmp"))

        self.assertFalse(errors)
        self.assertTrue(payload["ok"])
        self.assertFalse(temp_paths)

    def test_health_reports_interrupted_persisted_run_after_memory_loss(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.append_progress_event(run_id, {"phase": "chunk-complete", "round": 1, "chunkId": "p1_c0"})

        clear_run_memory()
        diagnostics = web_app.build_environment_diagnostics()
        recent_runs = diagnostics.get("recentRuns") or []
        recent_tasks = diagnostics.get("recentTasks") or []
        matching = [item for item in recent_runs if item.get("runId") == run_id]
        matching_tasks = [item for item in recent_tasks if item.get("runId") == run_id]

        self.assertEqual(diagnostics.get("activeRunCount"), 0)
        self.assertGreaterEqual(diagnostics.get("recentRunCount", 0), 1)
        self.assertGreaterEqual(diagnostics.get("recentTaskCount", 0), 1)
        self.assertTrue(matching)
        self.assertTrue(matching_tasks)
        self.assertEqual(matching_tasks[0].get("taskType"), "run-round")
        self.assertEqual(matching_tasks[0].get("targetPath"), str(self.sample_path))
        self.assertEqual(matching[0].get("status"), "interrupted")
        self.assertTrue(matching[0].get("completed"))
        self.assertEqual(matching[0].get("lastEvent", {}).get("chunkId"), "p1_c0")
        self.assertTrue(matching[0].get("restoredFromDisk"))

    def test_status_and_cancel_routes_fall_back_to_persisted_run(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.append_progress_event(run_id, {"phase": "chunk-complete", "round": 1, "chunkId": "p1_c0"})
        clear_run_memory()

        status_response = self.client.get(f"/api/run-round-status/{run_id}")
        cancel_response = self.client.post(f"/api/run-round/{run_id}/cancel")
        events_response = self.client.get(f"/api/run-round-events/{run_id}")

        self.assertEqual(status_response.status_code, 200)
        status_payload = status_response.get_json()
        self.assertEqual(status_payload["status"], "interrupted")
        self.assertTrue(status_payload["completed"])
        self.assertTrue(status_payload["restoredFromDisk"])
        self.assertEqual(cancel_response.status_code, 200)
        self.assertTrue(cancel_response.get_json()["restoredFromDisk"])
        self.assertEqual(events_response.status_code, 200)
        self.assertIn("event: run-error", events_response.get_data(as_text=True))

    def test_task_state_cleanup_deletes_only_expired_inactive_snapshots(self) -> None:
        completed_run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.finalize_progress(completed_run_id, result={"ok": True})
        active_run_id, _ = web_app.register_run(str(self.sample_path))

        old_timestamp = time.time() - 9 * 24 * 3600
        os.utime(web_app.run_round_state_path(completed_run_id), (old_timestamp, old_timestamp))
        os.utime(web_app.run_round_state_path(active_run_id), (old_timestamp, old_timestamp))

        before = web_app.summarize_task_state_store(retention_hours=168)
        response = self.client.post(
            "/api/task-state-snapshots/cleanup",
            json={"mode": "expired", "maxAgeHours": 168},
        )
        after = web_app.summarize_task_state_store(retention_hours=168)

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(before["fileCount"], 2)
        self.assertEqual(before["activeSnapshotCount"], 1)
        self.assertEqual(before["staleCount"], 1)
        self.assertEqual(payload["deletedCount"], 1)
        self.assertEqual(payload["skippedActiveCount"], 1)
        self.assertFalse(web_app.run_round_state_path(completed_run_id).exists())
        self.assertTrue(web_app.run_round_state_path(active_run_id).exists())
        self.assertEqual(after["fileCount"], 1)

    def test_task_state_cleanup_removes_corrupt_snapshots_and_stale_temp_files(self) -> None:
        active_run_id, _ = web_app.register_run(str(self.sample_path))
        corrupt_path = TASK_STATE_TEST_DIR / "run_round_corrupt.json"
        stale_tmp_path = TASK_STATE_TEST_DIR / "batch_rerun_orphan.json.tmp"
        active_tmp_path = TASK_STATE_TEST_DIR / f"run_round_{active_run_id}.active-writer.json.tmp"
        corrupt_path.write_text("{not-json", encoding="utf-8")
        stale_tmp_path.write_text("{partial", encoding="utf-8")
        active_tmp_path.write_text("{partial-active", encoding="utf-8")
        old_timestamp = time.time() - 2 * 3600
        os.utime(stale_tmp_path, (old_timestamp, old_timestamp))
        os.utime(active_tmp_path, (old_timestamp, old_timestamp))

        before = web_app.summarize_task_state_store(retention_hours=168)
        payload = web_app.cleanup_task_state_snapshots(mode="expired", max_age_hours=168)
        after = web_app.summarize_task_state_store(retention_hours=168)

        self.assertEqual(before["invalidCount"], 1)
        self.assertEqual(before["tempFileCount"], 2)
        self.assertGreaterEqual(before["staleTempCount"], 2)
        self.assertEqual(payload["deletedInvalidCount"], 1)
        self.assertEqual(payload["deletedTempCount"], 1)
        self.assertEqual(payload["skippedActiveTempCount"], 1)
        self.assertFalse(corrupt_path.exists())
        self.assertFalse(stale_tmp_path.exists())
        self.assertTrue(active_tmp_path.exists())
        self.assertEqual(after["invalidCount"], 0)
        self.assertEqual(after["tempFileCount"], 1)

    def test_task_state_self_heal_removes_corrupt_snapshots_and_stale_temp_files(self) -> None:
        active_run_id, _ = web_app.register_run(str(self.sample_path))
        corrupt_path = TASK_STATE_TEST_DIR / "run_round_corrupt.json"
        stale_tmp_path = TASK_STATE_TEST_DIR / "batch_rerun_orphan.json.tmp"
        active_tmp_path = TASK_STATE_TEST_DIR / f"run_round_{active_run_id}.active-writer.json.tmp"
        corrupt_path.write_text("{not-json", encoding="utf-8")
        stale_tmp_path.write_text("{partial", encoding="utf-8")
        active_tmp_path.write_text("{partial-active", encoding="utf-8")
        old_timestamp = time.time() - 2 * 3600
        os.utime(stale_tmp_path, (old_timestamp, old_timestamp))
        os.utime(active_tmp_path, (old_timestamp, old_timestamp))

        payload = web_app.ensure_task_state_store_ready(reason="regression", max_age_seconds=0)
        after = web_app.summarize_task_state_store(retention_hours=168)
        diagnostics = web_app.build_environment_diagnostics()
        task_state_store = diagnostics.get("taskStateStore") or {}
        readiness = task_state_store.get("readiness") or {}

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["action"], "cleaned")
        self.assertEqual(payload["deletedInvalidCount"], 1)
        self.assertEqual(payload["deletedTempCount"], 1)
        self.assertEqual(payload["skippedActiveTempCount"], 1)
        self.assertFalse(corrupt_path.exists())
        self.assertFalse(stale_tmp_path.exists())
        self.assertTrue(active_tmp_path.exists())
        self.assertEqual(after["invalidCount"], 0)
        self.assertEqual(after["staleCount"], 0)
        self.assertEqual(after["staleTempCount"], 1)
        self.assertEqual(after["staleActiveTempCount"], 1)
        self.assertTrue(readiness.get("ok"))
        self.assertEqual(task_state_store.get("invalidCount"), 0)

    def test_task_state_self_heal_cache_throttles_repeated_health_checks(self) -> None:
        first_path = TASK_STATE_TEST_DIR / "run_round_first_corrupt.json"
        second_path = TASK_STATE_TEST_DIR / "run_round_second_corrupt.json"
        first_path.write_text("{not-json", encoding="utf-8")

        first = web_app.ensure_task_state_store_ready(reason="regression-first", max_age_seconds=0)
        second_path.write_text("{not-json", encoding="utf-8")
        cached = web_app.ensure_task_state_store_ready(reason="regression-cached", max_age_seconds=3600)

        self.assertTrue(first["ok"])
        self.assertEqual(first["action"], "cleaned")
        self.assertFalse(first_path.exists())
        self.assertTrue(cached["cached"])
        self.assertEqual(cached["action"], "cached")
        self.assertTrue(second_path.exists())
        fresh = web_app.ensure_task_state_store_ready(reason="regression-fresh", max_age_seconds=0)
        self.assertTrue(fresh["ok"])
        self.assertEqual(fresh["action"], "cleaned")
        self.assertFalse(second_path.exists())

    def test_cancel_completed_run_is_idempotent(self) -> None:
        run_id, state = web_app.register_run(str(self.sample_path))
        web_app.finalize_progress(run_id, result={"ok": True})

        response = self.client.post(f"/api/run-round/{run_id}/cancel")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["completed"])
        self.assertEqual(payload["status"], "completed")
        self.assertFalse(state.cancel_requested)
        self.assertFalse(state.events)

    def test_cancel_unknown_run_returns_404(self) -> None:
        response = self.client.post("/api/run-round/not-a-real-run/cancel")

        self.assertEqual(response.status_code, 404)
        self.assertIn("Unknown run id", response.get_data(as_text=True))

    def test_reviewed_export_route_is_removed(self) -> None:
        routes = {str(rule) for rule in web_app.app.url_map.iter_rules()}
        response = self.client.post(
            "/api/export-reviewed-round",
            json={"outputPath": str(self.sample_path), "targetFormat": "txt", "decisions": {}},
        )

        self.assertNotIn("/api/export-reviewed-round", routes)
        self.assertIn(response.status_code, {404, 405})

    def test_post_run_round_reuses_active_document_run(self) -> None:
        active_run_id, _ = web_app.register_run(str(self.sample_path))

        response = self.client.post(
            "/api/run-round",
            json={"sourcePath": str(self.sample_path), "modelConfig": {"baseUrl": "http://localhost/v1", "apiKey": "regression", "model": "regression-model"}},
        )

        self.assertEqual(response.status_code, 202)
        payload = response.get_json()
        self.assertEqual(payload["runId"], active_run_id)
        self.assertTrue(payload["alreadyActive"])

    def test_prune_completed_run_releases_active_source(self) -> None:
        run_id, state = web_app.register_run(str(self.sample_path))
        web_app.finalize_progress(run_id, result={"ok": True})
        state.updated_at = time.time() - web_app.RUN_STATE_TTL_SECONDS - 5

        web_app.prune_run_states()

        self.assertNotIn(run_id, web_app.RUN_STATES)
        self.assertFalse(web_app.ACTIVE_RUNS_BY_SOURCE)

    def test_reset_round_progress_blocks_active_run(self) -> None:
        web_app.register_run(str(self.sample_path))

        response = self.client.delete(
            "/api/round-progress",
            json={"sourcePath": str(self.sample_path), "promptProfile": "cn_prewrite", "roundNumber": 1},
        )

        self.assertEqual(response.status_code, 409)
        self.assertIn("active", response.get_data(as_text=True))

    def test_app_service_run_round_accepts_cancel_check(self) -> None:
        signature = inspect.signature(web_app.run_round_for_app)

        self.assertIn("cancel_check", signature.parameters)


if __name__ == "__main__":
    unittest.main(verbosity=2)
