from __future__ import annotations

import asyncio
import io
import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from core_config import BUILTIN_PLAN_ID, upsert_plan, upsert_profile, upsert_template
from core_documents import (
    CHUNK_PRESETS,
    SCOPE_CLASSIFIER_VERSION,
    build_chunk_manifest,
    import_document,
    load_document,
    save_document,
    split_text,
    update_scope,
)
from core_llm import StreamRequestError
from core_docx_regression import fixture_docx, fixture_with_digital_signature
from core_runs import RunError, RunManager, WarningAcknowledgementRequired, run_path


class RewriteClient:
    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        result = source.replace("10", "11").replace("[1]", "[2]") + "（已改写）"
        midpoint = max(1, len(result) // 2)
        await on_delta(result[:midpoint])
        await asyncio.sleep(0.01)
        await on_delta(result[midpoint:])
        return result


class EmptyClient:
    async def stream_completion(self, _profile, _prompt, _on_delta, _on_attempt=None):
        return ""


class DelayedClient:
    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        delay = {"第一段": 0.06, "第二段": 0.03, "第三段": 0.01}.get(source, 0)
        await asyncio.sleep(delay)
        result = f"{source}-完成"
        await on_delta(result)
        return result


class WorkerProbeClient:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0
        self.started = 0

    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        self.started += 1
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            await asyncio.sleep(0.08)
            result = f"{source}-完成"
            await on_delta(result)
            return result
        finally:
            self.active -= 1


class ProfileProbeClient:
    def __init__(self) -> None:
        self.profiles: list[dict] = []

    async def stream_completion(self, profile, prompt, on_delta, _on_attempt=None):
        self.profiles.append(dict(profile))
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        await on_delta(source)
        return source


class QueueCancelClient:
    def __init__(self) -> None:
        self.started = 0
        self.cancelled = 0

    async def stream_completion(self, _profile, _prompt, _on_delta, _on_attempt=None):
        self.started += 1
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            self.cancelled += 1
            raise
        return "never"


class CancellableClient:
    def __init__(self) -> None:
        self.started = False
        self.cancelled = False

    async def stream_completion(self, _profile, _prompt, _on_delta, _on_attempt=None):
        self.started = True
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            self.cancelled = True
            raise
        return "never"


class PromptSequenceClient:
    def __init__(self) -> None:
        self.prompts: list[str] = []

    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        self.prompts.append(prompt)
        marker, source = prompt.split("\n", 1)
        result = f"{source}-{'一' if marker == 'STEP1' else '二'}"
        await on_delta(result)
        return result


class ContinueConfigurationClient:
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def stream_completion(self, profile, prompt, on_delta, _on_attempt=None):
        self.calls.append({"profile": dict(profile), "prompt": prompt})
        if prompt.startswith("NEXT-B\n"):
            source = prompt.split("\n", 1)[1]
            result = f"{source}-B"
        else:
            source = prompt.rsplit("待改写内容：\n", 1)[-1]
            result = f"{source}-A"
        await on_delta(result)
        return result


class FailOnceClient:
    def __init__(self) -> None:
        self.calls: dict[str, int] = {}

    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        self.calls[source] = self.calls.get(source, 0) + 1
        if source == "第二段" and self.calls[source] == 1:
            await on_delta("部分输出")
            raise StreamRequestError("正文开始后连接中断", received_text=True, category="network")
        result = f"{source}-完成"
        await on_delta(result)
        return result


class FailOneDocxParagraphClient:
    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        source = prompt.rsplit("待改写内容：\n", 1)[-1]
        if "跨页前正文" in source:
            raise StreamRequestError("此段暂时无法完成", category="provider")
        result = f"{source}（已改写）"
        await on_delta(result)
        return result


class LongMultiStepFailOnceClient:
    def __init__(self) -> None:
        self.calls: dict[tuple[str, str], int] = {}

    async def stream_completion(self, _profile, prompt, on_delta, _on_attempt=None):
        marker, source = prompt.split("\n", 1)
        key = (marker, source)
        self.calls[key] = self.calls.get(key, 0) + 1
        if marker == "STEP2" and "FAILONCE" in source and self.calls[key] == 1:
            await on_delta("部分输出")
            raise StreamRequestError("正文开始后连接中断", received_text=True, category="network")
        result = source.strip().upper() if marker == "STEP1" else source.replace("ALPHA", "OMEGA")
        await on_delta(result)
        return result


class CoreRunRegression(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.old_config = os.environ.get("FYADR_CONFIG_DIR")
        self.old_data = os.environ.get("FYADR_DATA_DIR")
        os.environ["FYADR_CONFIG_DIR"] = str(Path(self.temporary.name) / "config")
        os.environ["FYADR_DATA_DIR"] = str(Path(self.temporary.name) / "data")
        self.profile = upsert_profile(
            {
                "name": "测试连接",
                "baseUrl": "http://127.0.0.1:9999/v1",
                "apiKey": "test-key",
                "model": "test-model",
                "protocol": "chat_completions",
            }
        )

    def tearDown(self) -> None:
        if self.old_config is None:
            os.environ.pop("FYADR_CONFIG_DIR", None)
        else:
            os.environ["FYADR_CONFIG_DIR"] = self.old_config
        if self.old_data is None:
            os.environ.pop("FYADR_DATA_DIR", None)
        else:
            os.environ["FYADR_DATA_DIR"] = self.old_data
        self.temporary.cleanup()

    def document(self, text: str):
        document = import_document(io.BytesIO(text.encode()), "test.txt")
        selected = [item["id"] for item in document["paragraphs"]]
        return update_scope(document["id"], selected)

    @staticmethod
    def wait(manager: RunManager, run_id: str, terminal=("completed", "paused", "cancelled")):
        deadline = time.monotonic() + 5
        latest = manager.public_run(run_id)
        while latest["status"] not in terminal and time.monotonic() < deadline:
            time.sleep(0.02)
            latest = manager.public_run(run_id)
        return latest

    def test_nonempty_result_is_kept_and_fact_change_only_warns(self) -> None:
        document = self.document("第一段有数字10。\n\n第二段引用[1]。")
        manager = RunManager(RewriteClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual([item["order"] for item in result["paragraphs"]], [0, 1])
        self.assertIn("11", result["paragraphs"][0]["rewrittenText"])
        self.assertNotEqual(result["paragraphs"][0]["rewrittenText"], result["paragraphs"][0]["originalText"])
        self.assertTrue(result["paragraphs"][0]["warnings"])
        self.assertEqual(result["paragraphs"][0]["decision"]["decision"], "rewrite")

    def test_empty_output_pauses_and_never_writes_original_as_result(self) -> None:
        document = self.document("不能静默回退的原文。")
        manager = RunManager(EmptyClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "paused")
        paragraph = result["paragraphs"][0]
        self.assertFalse(paragraph["complete"])
        self.assertEqual(paragraph["rewrittenText"], "")
        self.assertNotEqual(paragraph["rewrittenText"], paragraph["originalText"])

    def test_serial_and_parallel_completion_keep_original_paragraph_order(self) -> None:
        for concurrency in (1, 2, 4, 8, 16):
            with self.subTest(concurrency=concurrency):
                document = self.document("第一段\n\n第二段\n\n第三段")
                manager = RunManager(DelayedClient())
                created = manager.create_run(
                    document["id"],
                    self.profile["id"],
                    BUILTIN_PLAN_ID,
                    concurrency=concurrency,
                    repeat_count=1,
                )
                result = self.wait(manager, created["id"])
                self.assertEqual(result["status"], "completed")
                self.assertEqual(result["snapshot"]["concurrency"], concurrency)
                self.assertEqual(
                    [item["rewrittenText"] for item in result["paragraphs"]],
                    ["第一段-完成", "第二段-完成", "第三段-完成"],
                )

    def test_chunk_manifest_preserves_exact_boundaries(self) -> None:
        text = "alpha beta gamma delta epsilon。下一句继续测试\n最后一行也要保留。"
        for sample in (
            text,
            "没有空格的连续中文" * 8,
            "first  second\r\nthird    fourth",
            "句号后保留空白。   下一句末尾也保留   ",
        ):
            with self.subTest(sample=sample[:20]):
                self.assertEqual("".join(split_text(sample, limit=18)), sample)
        document = self.document(text)
        manifest = build_chunk_manifest(document, limit=18)
        rebuilt = "".join(
            f"{item['joinerBefore'] if index else ''}{item['originalText']}"
            for index, item in enumerate(manifest)
        )
        self.assertEqual(rebuilt, text)
        self.assertTrue(any(item["boundaryBefore"] == "whitespace" for item in manifest[1:]))

    def test_three_chunk_presets_are_stable_and_never_merge_paragraphs(self) -> None:
        self.assertEqual(CHUNK_PRESETS["standard"]["default"], (280, 260, 420, 90))
        self.assertEqual(CHUNK_PRESETS["standard"]["en"], (420, 360, 560, 140))
        document = self.document(("第一句。第二句；第三句？" * 80) + "\n\n" + ("English sentence. " * 80))
        manifests = {
            preset: build_chunk_manifest(document, preset=preset)
            for preset in ("fine", "standard", "long")
        }
        self.assertGreaterEqual(len(manifests["fine"]), len(manifests["standard"]))
        self.assertGreaterEqual(len(manifests["standard"]), len(manifests["long"]))
        for preset, manifest in manifests.items():
            self.assertEqual(
                [item["id"] for item in manifest],
                [item["id"] for item in build_chunk_manifest(document, preset=preset)],
            )
            by_paragraph: dict[str, list[dict]] = {}
            for chunk in manifest:
                by_paragraph.setdefault(chunk["paragraphId"], []).append(chunk)
                self.assertEqual(chunk["chunkPreset"], preset)
            self.assertEqual(len(by_paragraph), 2)
            for paragraph in document["paragraphs"]:
                rebuilt = "".join(
                    f"{item['joinerBefore'] if index else ''}{item['originalText']}"
                    for index, item in enumerate(by_paragraph[paragraph["id"]])
                )
                self.assertEqual(rebuilt, paragraph["text"])

    def test_standard_long_sentence_uses_practiced_boundary_before_target(self) -> None:
        text = ("甲" * 120 + "，") * 4
        document = self.document(text)
        manifest = build_chunk_manifest(document, preset="standard")
        self.assertEqual([len(item["originalText"]) for item in manifest], [242, 242])
        self.assertEqual(
            "".join(
                f"{item['joinerBefore'] if index else ''}{item['originalText']}"
                for index, item in enumerate(manifest)
            ),
            text,
        )

    def test_parallel_long_paragraph_multistep_resume_keeps_completed_parts_and_word_boundaries(self) -> None:
        first = upsert_template({"name": "长段第一步", "content": "STEP1\n{{text}}"})
        second = upsert_template({"name": "长段第二步", "content": "STEP2\n{{text}}"})
        plan = upsert_plan({"name": "长段两步方案", "templateIds": [first["id"], second["id"]]})
        words = [f"alpha{index:04d}" for index in range(520)]
        words[245] = "FAILONCE"
        original = " ".join(words)
        document = self.document(original)
        manifest = build_chunk_manifest(document)
        client = LongMultiStepFailOnceClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], plan["id"], concurrency=3
        )
        self.assertGreater(len(manifest), 2)
        self.assertNotIn("chunkManifest", created["snapshot"])

        paused = self.wait(manager, created["id"])
        self.assertEqual(paused["status"], "paused")
        self.assertEqual(sum(1 for item in paused["chunks"] if item["status"] == "paused"), 1)
        failed_source = next(
            item["originalText"]
            for item in manifest
            if "FAILONCE" in item["originalText"]
        )
        self.assertEqual(client.calls[("STEP1", failed_source)], 1)
        completed_before_resume = {
            item["id"] for item in paused["chunks"] if item["status"] == "completed"
        }
        self.assertTrue(all(
            item["streamText"] for item in paused["chunks"] if item["id"] in completed_before_resume
        ))

        resumed = manager.resume(created["id"])
        completed = self.wait(manager, resumed["id"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(client.calls[("STEP1", failed_source)], 1)
        self.assertEqual(client.calls[("STEP2", failed_source.strip().upper())], 2)
        self.assertTrue(completed_before_resume)
        for item in manifest:
            self.assertEqual(client.calls[("STEP1", item["originalText"])], 1)
        expected = original.upper().replace("ALPHA", "OMEGA")
        self.assertEqual(completed["paragraphs"][0]["rewrittenText"], expected)
        self.assertTrue(all(not item["streamText"] for item in completed["chunks"]))

    def test_parallel_scheduler_uses_only_fixed_worker_count(self) -> None:
        document = self.document("\n\n".join(f"第{index}段" for index in range(20)))
        client = WorkerProbeClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=16, repeat_count=1
        )
        deadline = time.monotonic() + 2
        worker_task_count = 0
        while time.monotonic() < deadline:
            with manager._lock:
                runtime = manager._runtimes.get(created["id"])
                worker_task_count = len(runtime[1]) if runtime else 0
            if client.started >= 16 and worker_task_count:
                break
            time.sleep(0.01)
        self.assertEqual(worker_task_count, 16)
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(client.max_active, 16)
        self.assertEqual(result["execution"]["configuredConcurrency"], 16)
        self.assertEqual(result["execution"]["peakActiveRequests"], 16)
        self.assertEqual(result["progress"]["completed"], 20)
        self.assertEqual(result["progress"]["total"], 20)

    def test_progress_reports_paragraphs_and_exposes_chunk_manifest_for_review(self) -> None:
        document = self.document("甲" * 2200)
        manager = RunManager(DelayedClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["progress"]["completed"], 1)
        self.assertEqual(result["progress"]["total"], 1)
        self.assertGreater(result["progress"]["completedChunks"], 2)
        self.assertEqual(
            result["progress"]["completedChunks"], result["progress"]["totalChunks"]
        )
        self.assertEqual(result["snapshot"]["chunking"]["preset"], "standard")

    def test_multistep_plan_reuses_manifest_and_feeds_previous_output_forward(self) -> None:
        first = upsert_template({"name": "第一步", "content": "STEP1\n{{text}}"})
        second = upsert_template({"name": "第二步", "content": "STEP2\n{{text}}"})
        plan = upsert_plan(
            {"name": "两步方案", "templateIds": [first["id"], second["id"]]}
        )
        document = self.document("同一个分块")
        client = PromptSequenceClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], plan["id"], repeat_count=3
        )
        manifest_ids = [item["id"] for item in created["chunks"]]
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual([item["id"] for item in result["chunks"]], manifest_ids)
        self.assertEqual(client.prompts, ["STEP1\n同一个分块", "STEP2\n同一个分块-一"])
        self.assertEqual(result["paragraphs"][0]["rewrittenText"], "同一个分块-一-二")
        self.assertEqual(result["snapshot"]["repeatCount"], 1)

    def test_single_template_defaults_to_two_rounds_with_fixed_chunk_ids(self) -> None:
        document = self.document("默认执行两轮")
        client = DelayedClient()
        manager = RunManager(client)
        created = manager.create_run(document["id"], self.profile["id"], BUILTIN_PLAN_ID)
        chunk_ids = [item["id"] for item in created["chunks"]]
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "completed")
        self.assertEqual(result["snapshot"]["repeatCount"], 2)
        self.assertEqual(len(result["snapshot"]["promptPlan"]["steps"]), 2)
        self.assertEqual([item["id"] for item in result["chunks"]], chunk_ids)
        self.assertEqual(result["chunks"][0]["originalText"], "默认执行两轮")
        self.assertEqual(result["chunks"][0]["finalText"], "默认执行两轮-完成-完成")
        self.assertEqual(result["chunks"][0]["partIndex"], 0)
        self.assertEqual(result["chunks"][0]["partCount"], 1)
        self.assertEqual(result["paragraphs"][0]["rewrittenText"], "默认执行两轮-完成-完成")

    def test_warning_failure_never_changes_completed_result_or_export(self) -> None:
        document = self.document("实验值为10。")
        manager = RunManager(RewriteClient())
        with patch("core_runs.generate_rewrite_warnings", side_effect=RuntimeError("检查器异常")):
            created = manager.create_run(
                document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
            )
            result = self.wait(manager, created["id"])
            self.assertEqual(result["status"], "completed")
            paragraph = result["paragraphs"][0]
            self.assertTrue(paragraph["complete"])
            self.assertIn("11", paragraph["rewrittenText"])
            self.assertIn("提醒检查暂时不可用", paragraph["warningCheckError"])
            output, _audit = manager.export(created["id"], output_format="txt")
        self.assertIn("11", output.read_text(encoding="utf-8"))

    def test_resume_only_reruns_unfinished_chunks(self) -> None:
        document = self.document("第一段\n\n第二段")
        client = FailOnceClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        paused = self.wait(manager, created["id"])
        self.assertEqual(paused["status"], "paused")
        self.assertTrue(paused["paragraphs"][0]["complete"])
        self.assertFalse(paused["paragraphs"][1]["complete"])
        self.assertEqual(paused["paragraphs"][1]["rewrittenText"], "")

        resumed = manager.resume(created["id"], concurrency=8)
        self.assertEqual(resumed["snapshot"]["concurrency"], 8)
        self.assertEqual(resumed["execution"]["configuredConcurrency"], 8)
        completed = self.wait(manager, resumed["id"])
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(client.calls, {"第一段": 1, "第二段": 2})
        self.assertEqual(
            [item["rewrittenText"] for item in completed["paragraphs"]],
            ["第一段-完成", "第二段-完成"],
        )

    def test_english_source_uses_protocol_level_english_rewrite_instruction(self) -> None:
        english = (
            "Facility agriculture supports stable vegetable production, while intelligent control "
            "improves water use efficiency and reduces repetitive manual work in greenhouses."
        )
        chinese = "设施农业能够保障蔬菜稳定生产，并提高温室水分利用效率。"
        client = ProfileProbeClient()
        manager = RunManager(client)
        english_run = manager.create_run(
            self.document(english)["id"],
            self.profile["id"],
            BUILTIN_PLAN_ID,
            repeat_count=1,
        )
        self.assertEqual(self.wait(manager, english_run["id"])["status"], "completed")
        self.assertIn("_requestInstructions", client.profiles[-1])
        self.assertIn("entire response in fluent academic English", client.profiles[-1]["_requestInstructions"])

        chinese_run = manager.create_run(
            self.document(chinese)["id"],
            self.profile["id"],
            BUILTIN_PLAN_ID,
            repeat_count=1,
        )
        self.assertEqual(self.wait(manager, chinese_run["id"])["status"], "completed")
        self.assertNotIn("_requestInstructions", client.profiles[-1])

    def test_application_restart_recovers_active_run_as_paused_without_filling_original(self) -> None:
        document = self.document("重启时不能拿原文冒充结果。")
        manager = RunManager(EmptyClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        paused = self.wait(manager, created["id"])
        self.assertEqual(paused["status"], "paused")

        path = run_path(created["id"])
        persisted = json.loads(path.read_text(encoding="utf-8"))
        persisted["status"] = "running"
        persisted["message"] = "正在改写。"
        persisted["chunks"][0]["status"] = "running"
        persisted["chunks"][0]["error"] = ""
        path.write_text(json.dumps(persisted, ensure_ascii=False), encoding="utf-8")

        restarted = RunManager(EmptyClient())
        recovered = restarted.public_run(created["id"])
        self.assertEqual(recovered["status"], "paused")
        self.assertEqual(recovered["chunks"][0]["status"], "paused")
        self.assertEqual(recovered["paragraphs"][0]["rewrittenText"], "")
        self.assertIn("可以继续改写", recovered["message"])

    def test_export_warning_is_one_time_confirmation_and_respects_review_choice(self) -> None:
        document = self.document("实验值为 10，引用见[1]。")
        manager = RunManager(RewriteClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        completed = self.wait(manager, created["id"])
        paragraph_id = completed["paragraphs"][0]["paragraphId"]

        with self.assertRaises(WarningAcknowledgementRequired) as confirmation:
            manager.export(created["id"], output_format="txt")
        self.assertTrue(confirmation.exception.summary["warnings"])
        self.assertEqual(
            {item["paragraphNumber"] for item in confirmation.exception.summary["warnings"]},
            {1},
        )
        self.assertTrue(
            all(item["paragraphPreview"] for item in confirmation.exception.summary["warnings"])
        )
        output, _audit = manager.export(
            created["id"], output_format="txt", acknowledge_warnings=True
        )
        self.assertIn("11", output.read_text(encoding="utf-8"))

        original_review = manager.save_review(created["id"], paragraph_id, "original")
        self.assertEqual(original_review["paragraphs"][0]["warnings"], [])
        original_output, _audit = manager.export(created["id"], output_format="txt")
        self.assertEqual(original_output.read_text(encoding="utf-8"), "实验值为 10，引用见[1]。")

        manual_review = manager.save_review(
            created["id"], paragraph_id, "manual", "实验值仍为 10，引用见[1]，已人工调整。"
        )
        self.assertEqual(manual_review["paragraphs"][0]["warnings"], [])
        changed_manual = manager.save_review(
            created["id"], paragraph_id, "manual", "实验值改为 12，引用见[3]。"
        )
        self.assertEqual(
            {item["category"] for item in changed_manual["paragraphs"][0]["warnings"]},
            {"number", "citation"},
        )

    def test_completed_run_can_continue_from_current_review_choices(self) -> None:
        document = self.document("第一段\n\n第二段")
        manager = RunManager(DelayedClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        completed = self.wait(manager, created["id"])
        self.assertEqual(completed["status"], "completed")
        first, second = completed["paragraphs"]
        manager.save_review(created["id"], first["paragraphId"], "manual", "第一段手动稿")
        manager.save_review(created["id"], second["paragraphId"], "original")

        continued = manager.continue_run(created["id"], concurrency=8)
        self.assertNotEqual(continued["id"], created["id"])
        self.assertEqual(continued["snapshot"]["iteration"], 2)
        self.assertEqual(continued["snapshot"]["parentRunId"], created["id"])
        self.assertEqual(continued["snapshot"]["rootRunId"], created["id"])
        self.assertEqual(continued["snapshot"]["concurrency"], 8)
        next_completed = self.wait(manager, continued["id"])
        self.assertEqual(next_completed["status"], "completed")
        self.assertEqual(
            [item["rewrittenText"] for item in next_completed["paragraphs"]],
            ["第一段手动稿-完成", "第二段-完成"],
        )
        preserved = manager.public_run(created["id"])
        self.assertEqual(preserved["paragraphs"][0]["decision"]["decision"], "manual")
        self.assertEqual(preserved["paragraphs"][1]["decision"]["decision"], "original")
        self.assertEqual(load_document(document["id"])["latestRunId"], continued["id"])

    def test_completed_run_applies_new_model_plan_chunking_rounds_and_terms(self) -> None:
        second_profile = upsert_profile(
            {
                "name": "第二连接",
                "baseUrl": "http://127.0.0.1:9998/v1",
                "apiKey": "second-key",
                "model": "second-model",
                "protocol": "chat_completions",
            }
        )
        next_template = upsert_template(
            {"name": "下一轮提示词", "content": "NEXT-B\n{{text}}"}
        )
        next_plan = upsert_plan(
            {"name": "下一轮方案", "templateIds": [next_template["id"]]}
        )
        document = self.document("第一段\n\n第二段")
        client = ContinueConfigurationClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        completed = self.wait(manager, created["id"])
        first, second = completed["paragraphs"]
        manager.save_review(created["id"], first["paragraphId"], "manual", "第一段手动稿")
        manager.save_review(created["id"], second["paragraphId"], "original")
        client.calls.clear()

        continued = manager.continue_run(
            created["id"],
            model_profile_id=second_profile["id"],
            prompt_plan_id=next_plan["id"],
            concurrency=4,
            protected_terms=["保护词B"],
            chunk_preset="long",
            repeat_count=2,
        )
        snapshot = continued["snapshot"]
        self.assertEqual(snapshot["credentialProfileId"], second_profile["id"])
        self.assertEqual(snapshot["modelProfile"]["model"], "second-model")
        self.assertEqual(snapshot["promptPlan"]["id"], next_plan["id"])
        self.assertEqual(snapshot["chunking"]["preset"], "long")
        self.assertEqual(snapshot["repeatCount"], 2)
        self.assertEqual(snapshot["concurrency"], 4)
        self.assertEqual(snapshot["protectedTerms"], ["保护词B"])

        next_completed = self.wait(manager, continued["id"])
        self.assertEqual(next_completed["status"], "completed")
        self.assertTrue(client.calls)
        self.assertTrue(
            all(call["profile"]["model"] == "second-model" for call in client.calls)
        )
        self.assertTrue(
            all(call["profile"]["apiKey"] == "second-key" for call in client.calls)
        )
        self.assertTrue(all(call["prompt"].startswith("NEXT-B\n") for call in client.calls))
        self.assertIn("NEXT-B\n第一段手动稿", [call["prompt"] for call in client.calls])
        self.assertIn("NEXT-B\n第二段", [call["prompt"] for call in client.calls])
        self.assertEqual(
            [item["rewrittenText"] for item in next_completed["paragraphs"]],
            ["第一段手动稿-B-B", "第二段-B-B"],
        )

    def test_classifier_upgrade_does_not_mutate_an_existing_runs_snapshot(self) -> None:
        document = self.document("第一段\n\n第二段")
        manager = RunManager(DelayedClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        completed = self.wait(manager, created["id"])
        self.assertEqual(completed["status"], "completed")

        stored = load_document(document["id"])
        stored["scopeConfirmed"] = True
        stored["scopeClassifierVersion"] = SCOPE_CLASSIFIER_VERSION - 1
        stored["paragraphs"][1]["selected"] = False
        stored["paragraphs"][1]["suggestedSelected"] = False
        save_document(stored)

        reopened = manager.public_run(created["id"])
        self.assertEqual(len(reopened["paragraphs"]), 2)
        self.assertEqual(
            {item["paragraphId"] for item in reopened["paragraphs"]},
            set(created["snapshot"]["document"]["selectedParagraphIds"]),
        )
        output, _audit = manager.export(created["id"], output_format="txt")
        self.assertEqual(output.read_text(encoding="utf-8"), "第一段-完成\n\n第二段-完成")

    def test_incomplete_docx_can_export_after_user_keeps_failed_paragraph_original(self) -> None:
        document = import_document(io.BytesIO(fixture_docx()), "保留失败段.docx")
        selected = [item["id"] for item in document["paragraphs"] if item["selected"]][:2]
        update_scope(document["id"], selected)
        manager = RunManager(FailOneDocxParagraphClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        paused = self.wait(manager, created["id"])
        self.assertEqual(paused["status"], "paused")
        failed = next(item for item in paused["paragraphs"] if not item["complete"])

        with self.assertRaises(WarningAcknowledgementRequired) as confirmation:
            manager.export(created["id"], output_format="docx")
        self.assertTrue(
            confirmation.exception.summary["requires"]["useOriginalForIncomplete"]
        )
        bulk_output, bulk_audit = manager.export(
            created["id"],
            output_format="docx",
            acknowledge_warnings=True,
            use_original_for_incomplete=True,
        )
        self.assertTrue(bulk_output.exists())
        self.assertEqual(bulk_audit["status"], "passed")

        reviewed = manager.save_review(created["id"], failed["paragraphId"], "original")
        self.assertEqual(
            next(item for item in reviewed["paragraphs"] if item["paragraphId"] == failed["paragraphId"])["decision"]["decision"],
            "original",
        )
        output, audit = manager.export(created["id"], output_format="docx")
        self.assertTrue(output.exists())
        self.assertTrue(audit["passed"], audit)

        manual = manager.save_review(
            created["id"], failed["paragraphId"], "manual", "这一段由用户手动补写。"
        )
        manual_result = next(
            item for item in manual["paragraphs"] if item["paragraphId"] == failed["paragraphId"]
        )
        self.assertEqual(manual_result["decision"]["decision"], "manual")
        manual_output, manual_audit = manager.export(created["id"], output_format="docx")
        self.assertTrue(manual_output.exists())
        self.assertTrue(manual_audit["passed"], manual_audit)

    def test_format_warning_can_be_force_exported_without_deleting_file(self) -> None:
        document = import_document(io.BytesIO(fixture_with_digital_signature()), "签名论文.docx")
        body = document["paragraphs"][1]
        update_scope(document["id"], [body["id"]])
        manager = RunManager(DelayedClient())
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        completed = self.wait(manager, created["id"])
        self.assertEqual(completed["status"], "completed")
        with self.assertRaises(WarningAcknowledgementRequired) as confirmation:
            manager.export(created["id"], output_format="docx")
        self.assertTrue(confirmation.exception.summary["requires"]["forceFormatRisk"])
        generated = list((Path(os.environ["FYADR_DATA_DIR"]) / "exports").glob("*.docx"))
        self.assertEqual(len(generated), 1)
        self.assertTrue(generated[0].exists())

        output, audit = manager.export(
            created["id"], output_format="docx", force_format_risk=True
        )
        self.assertTrue(output.exists())
        self.assertEqual(audit["status"], "warning")
        self.assertTrue(audit["forceExported"])

    def test_cancel_reaches_active_upstream_task(self) -> None:
        document = self.document("等待取消")
        client = CancellableClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, repeat_count=1
        )
        deadline = time.monotonic() + 2
        while not client.started and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertTrue(client.started)
        manager.cancel(created["id"])
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "cancelled")
        self.assertTrue(client.cancelled)

    def test_cancel_keeps_unstarted_queue_items_pending(self) -> None:
        document = self.document("\n\n".join(f"等待取消{index}" for index in range(8)))
        client = QueueCancelClient()
        manager = RunManager(client)
        created = manager.create_run(
            document["id"], self.profile["id"], BUILTIN_PLAN_ID, concurrency=2, repeat_count=1
        )
        deadline = time.monotonic() + 2
        while client.started < 2 and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertEqual(client.started, 2)
        manager.cancel(created["id"])
        result = self.wait(manager, created["id"])
        self.assertEqual(result["status"], "cancelled")
        self.assertEqual(client.cancelled, 2)
        statuses = [chunk["status"] for chunk in result["chunks"]]
        self.assertEqual(statuses.count("cancelled"), 2)
        self.assertEqual(statuses.count("pending"), 6)


if __name__ == "__main__":
    unittest.main()
