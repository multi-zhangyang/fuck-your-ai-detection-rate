from __future__ import annotations

import asyncio
import io
import os
import tempfile
import time
import unittest
from pathlib import Path

import web_app
from core_runs import RunManager


class ApiRewriteClient:
    async def list_models(self, _profile):
        return ["fixture-model"]

    async def test_connection(self, _profile):
        return "连接成功"

    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        result = source.replace("10", "11")
        midpoint = max(1, len(result) // 2)
        await on_delta(result[:midpoint])
        await asyncio.sleep(0.01)
        await on_delta(result[midpoint:])
        return result


class CoreApiRegression(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.previous_config = os.environ.get("FYADR_CONFIG_DIR")
        self.previous_data = os.environ.get("FYADR_DATA_DIR")
        os.environ["FYADR_CONFIG_DIR"] = str(Path(self.temporary.name) / "config")
        os.environ["FYADR_DATA_DIR"] = str(Path(self.temporary.name) / "data")
        self.previous_manager = web_app.RUN_MANAGER
        self.previous_client = web_app.llm_client
        self.client_impl = ApiRewriteClient()
        web_app.RUN_MANAGER = RunManager(self.client_impl)
        web_app.llm_client = self.client_impl
        web_app.app.config.update(TESTING=True)
        self.client = web_app.app.test_client()

    def tearDown(self) -> None:
        web_app.RUN_MANAGER = self.previous_manager
        web_app.llm_client = self.previous_client
        if self.previous_config is None:
            os.environ.pop("FYADR_CONFIG_DIR", None)
        else:
            os.environ["FYADR_CONFIG_DIR"] = self.previous_config
        if self.previous_data is None:
            os.environ.pop("FYADR_DATA_DIR", None)
        else:
            os.environ["FYADR_DATA_DIR"] = self.previous_data
        self.temporary.cleanup()

    def wait_for_run(self, run_id: str) -> dict:
        deadline = time.monotonic() + 5
        result = web_app.RUN_MANAGER.public_run(run_id)
        while result["status"] not in {"completed", "paused", "cancelled"} and time.monotonic() < deadline:
            time.sleep(0.02)
            result = web_app.RUN_MANAGER.public_run(run_id)
        return result

    def test_complete_txt_api_workflow(self) -> None:
        settings = self.client.get("/api/settings")
        self.assertEqual(settings.status_code, 200)
        builtin_plan_id = settings.get_json()["defaultPromptPlanId"]

        profile_response = self.client.post(
            "/api/model-profiles",
            json={
                "name": "测试连接",
                "baseUrl": "http://127.0.0.1:9999/v1",
                "apiKey": "local-test-secret",
                "model": "fixture-model",
                "protocol": "chat_completions",
                "makeDefault": True,
            },
        )
        self.assertEqual(profile_response.status_code, 201)
        profile = profile_response.get_json()
        self.assertNotEqual(profile["apiKey"], "local-test-secret")

        models = self.client.post("/api/model-profiles/models", json=profile)
        self.assertEqual(models.get_json()["models"], ["fixture-model"])
        tested = self.client.post("/api/model-profiles/test", json=profile)
        self.assertEqual(tested.get_json()["reply"], "连接成功")

        upload = self.client.post(
            "/api/documents",
            data={"file": (io.BytesIO("实验值为 10。".encode()), "论文.txt")},
            content_type="multipart/form-data",
        )
        self.assertEqual(upload.status_code, 201)
        document = upload.get_json()
        paragraph_id = document["paragraphs"][0]["id"]
        scoped = self.client.put(
            f"/api/documents/{document['id']}/scope",
            json={"selectedParagraphIds": [paragraph_id]},
        )
        self.assertTrue(scoped.get_json()["scopeConfirmed"])

        created = self.client.post(
            "/api/runs",
            json={
                "documentId": document["id"],
                "modelProfileId": profile["id"],
                "promptPlanId": builtin_plan_id,
                "concurrency": 1,
                "chunkPreset": "standard",
                "repeatCount": 1,
                "protectedTerms": [],
            },
        )
        self.assertEqual(created.status_code, 201)
        run = self.wait_for_run(created.get_json()["id"])
        self.assertEqual(run["status"], "completed")
        self.assertIn("11", run["paragraphs"][0]["rewrittenText"])
        self.assertNotIn("（改写）", run["paragraphs"][0]["rewrittenText"])
        self.assertTrue(run["paragraphs"][0]["warnings"])

        blocked = self.client.post(f"/api/runs/{run['id']}/export", json={"format": "txt"})
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.get_json()["code"], "export_confirmation_required")
        exported = self.client.post(
            f"/api/runs/{run['id']}/export",
            json={"format": "txt", "acknowledgeWarnings": True},
        )
        self.assertEqual(exported.status_code, 200)
        self.assertIn("11", exported.data.decode("utf-8"))
        exported.close()

        reviewed = self.client.put(
            f"/api/runs/{run['id']}/review/{paragraph_id}",
            json={"decision": "original"},
        )
        self.assertEqual(reviewed.get_json()["paragraphs"][0]["decision"]["decision"], "original")

        recent = self.client.get("/api/recent-documents").get_json()["items"]
        self.assertEqual(len(recent), 1)
        self.assertEqual(recent[0]["latestRunId"], run["id"])
        self.assertEqual(recent[0]["latestRunStatus"], "completed")
        self.assertFalse(recent[0]["canResume"])
        self.assertTrue(recent[0]["canExport"])

        internal = web_app.RUN_MANAGER._load(run["id"])
        with web_app.RUN_MANAGER._lock:
            internal["status"] = "paused"
            internal["chunks"][0]["status"] = "paused"
            web_app.RUN_MANAGER._save(internal)
        manual = self.client.put(
            f"/api/runs/{run['id']}/review/{paragraph_id}",
            json={"decision": "manual", "text": "实验值为 10。"},
        )
        self.assertEqual(manual.status_code, 200)
        paused_recent = self.client.get("/api/recent-documents").get_json()["items"][0]
        self.assertEqual(paused_recent["latestRunStatus"], "paused")
        self.assertTrue(paused_recent["canResume"])
        self.assertTrue(paused_recent["canExport"])
        manual_export = self.client.post(
            f"/api/runs/{run['id']}/export", json={"format": "txt"}
        )
        self.assertEqual(manual_export.status_code, 200)
        self.assertEqual(manual_export.data.decode("utf-8"), "实验值为 10。")
        manual_export.close()

        removed = self.client.delete(f"/api/documents/{document['id']}")
        self.assertEqual(removed.status_code, 200)
        self.assertEqual(self.client.get("/api/recent-documents").get_json()["items"], [])


if __name__ == "__main__":
    unittest.main()
