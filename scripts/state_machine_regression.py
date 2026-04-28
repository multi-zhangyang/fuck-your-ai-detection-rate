from __future__ import annotations

import inspect
import time
import unittest
from pathlib import Path

import web_app


ROOT_DIR = Path(__file__).resolve().parents[1]
REGRESSION_DIR = ROOT_DIR / "finish" / "regression"
SAMPLE_PATH = REGRESSION_DIR / "state_machine_sample.txt"


def reset_run_registry() -> None:
    with web_app.RUN_REGISTRY_LOCK:
        web_app.RUN_STATES.clear()
        web_app.ACTIVE_RUNS_BY_SOURCE.clear()


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
