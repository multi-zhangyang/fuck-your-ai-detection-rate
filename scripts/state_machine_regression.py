from __future__ import annotations

import inspect
import json
import os
import shutil
import time
import unittest
from pathlib import Path

import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]
REGRESSION_DIR = ROOT_DIR / "finish" / "regression"
SAMPLE_PATH = REGRESSION_DIR / "state_machine_sample.txt"
TASK_STATE_TEST_DIR = REGRESSION_DIR / "run_task_states"

web_app.TASK_STATE_DIR = TASK_STATE_TEST_DIR


def clear_run_memory() -> None:
    with web_app.RUN_REGISTRY_LOCK:
        web_app.RUN_STATES.clear()
        web_app.ACTIVE_RUNS_BY_SOURCE.clear()


def reset_run_registry() -> None:
    clear_run_memory()
    if TASK_STATE_TEST_DIR.exists():
        shutil.rmtree(TASK_STATE_TEST_DIR)
    TASK_STATE_TEST_DIR.mkdir(parents=True, exist_ok=True)


def write_sample() -> Path:
    REGRESSION_DIR.mkdir(parents=True, exist_ok=True)
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
                "offlineMode": False,
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
        self.assertEqual(payload["state"]["lastEvent"]["roundModel"]["baseUrl"], "")
        self.assertEqual(payload["state"]["lastEvent"]["roundModel"]["model"], "<configured>")
        self.assertEqual(payload["state"]["result"]["roundModel"]["model"], "<configured>")

    def test_health_reports_interrupted_persisted_run_after_memory_loss(self) -> None:
        run_id, _ = web_app.register_run(str(self.sample_path))
        web_app.append_progress_event(run_id, {"phase": "chunk-complete", "round": 1, "chunkId": "p1_c0"})

        clear_run_memory()
        diagnostics = web_app.build_environment_diagnostics()
        recent_runs = diagnostics.get("recentRuns") or []
        matching = [item for item in recent_runs if item.get("runId") == run_id]

        self.assertEqual(diagnostics.get("activeRunCount"), 0)
        self.assertGreaterEqual(diagnostics.get("recentRunCount", 0), 1)
        self.assertTrue(matching)
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

    def test_post_run_round_reuses_active_document_run(self) -> None:
        active_run_id, _ = web_app.register_run(str(self.sample_path))

        response = self.client.post(
            "/api/run-round",
            json={"sourcePath": str(self.sample_path), "modelConfig": {"offlineMode": True}},
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
