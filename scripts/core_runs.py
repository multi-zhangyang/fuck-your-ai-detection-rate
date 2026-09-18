from __future__ import annotations

import asyncio
import json
import os
import re
import threading
import time
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator

from core_config import find_profile, get_data_dir, load_config
from core_documents import (
    CHUNK_PRESETS,
    DEFAULT_CHUNK_PRESET,
    DocumentError,
    build_chunk_manifest,
    export_docx,
    export_txt,
    load_document,
    save_document,
    set_latest_run,
)
from core_llm import StreamRequestError, StreamingLLMClient
from core_warnings import generate_rewrite_warnings


class RunError(RuntimeError):
    pass


class ExportConfirmationRequired(RunError):
    def __init__(self, summary: dict[str, Any]) -> None:
        super().__init__("导出前需要确认提醒。")
        self.summary = summary


# Kept as an import-compatible alias for integrations using the previous name.
WarningAcknowledgementRequired = ExportConfirmationRequired


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _atomic_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temporary, path)


def runs_dir() -> Path:
    return get_data_dir() / "runs"


def run_path(run_id: str) -> Path:
    if not re.fullmatch(r"run-[0-9a-f]{32}", str(run_id)):
        raise RunError("改写任务标识无效。")
    return runs_dir() / f"{run_id}.json"


class RunManager:
    def __init__(self, llm_client: StreamingLLMClient | None = None) -> None:
        self.llm = llm_client or StreamingLLMClient()
        self._lock = threading.RLock()
        self._runs: dict[str, dict[str, Any]] = {}
        self._conditions: dict[str, threading.Condition] = {}
        self._runtimes: dict[str, tuple[asyncio.AbstractEventLoop, set[asyncio.Task[Any]]]] = {}

    def _condition(self, run_id: str) -> threading.Condition:
        with self._lock:
            return self._conditions.setdefault(run_id, threading.Condition(self._lock))

    def _save(self, run: dict[str, Any]) -> None:
        run["updatedAt"] = _now()
        persisted = deepcopy(run)
        persisted["events"] = [
            event for event in persisted.get("events", []) if event.get("type") != "chunk-stream"
        ][-100:]
        _atomic_json(run_path(str(run["id"])), persisted)

    def _load(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            if run_id in self._runs:
                return self._runs[run_id]
            path = run_path(run_id)
            if not path.exists():
                raise RunError("改写任务不存在。")
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise RunError("改写任务记录已损坏。") from exc
            if not isinstance(value, dict):
                raise RunError("改写任务记录无效。")
            if value.get("status") in {"running", "queued", "cancelling"}:
                value["status"] = "paused"
                value["message"] = "应用上次退出时任务尚未完成，可以继续改写。"
                for chunk in value.get("chunks", []):
                    if chunk.get("status") == "running":
                        chunk["status"] = "paused"
                        chunk["error"] = "上次运行已中断"
                self._save(value)
            self._runs[run_id] = value
            return value

    def _emit(self, run: dict[str, Any], event_type: str, data: dict[str, Any], *, persist: bool = False) -> None:
        with self._lock:
            run["eventSequence"] = int(run.get("eventSequence", 0)) + 1
            event = {
                "id": run["eventSequence"],
                "type": event_type,
                "at": _now(),
                **data,
            }
            events = run.setdefault("events", [])
            events.append(event)
            del events[:-300]
            run["updatedAt"] = event["at"]
            if persist:
                self._save(run)
            self._condition(str(run["id"])).notify_all()

    def create_run(
        self,
        document_id: str,
        model_profile_id: str,
        prompt_plan_id: str,
        *,
        concurrency: int = 1,
        protected_terms: list[str] | None = None,
        chunk_preset: str | None = None,
        repeat_count: int | None = None,
    ) -> dict[str, Any]:
        document = load_document(document_id)
        if not document.get("scopeConfirmed"):
            raise RunError("请先确认需要改写的正文范围。")
        config = load_config()
        profile = find_profile(model_profile_id, config)
        if not profile:
            raise RunError("所选模型连接不存在。")
        plan = next((item for item in config.get("promptPlans", []) if item.get("id") == prompt_plan_id), None)
        if not plan:
            raise RunError("所选提示词方案不存在。")
        templates_by_id = {item.get("id"): item for item in config.get("promptTemplates", [])}
        template_steps = []
        for template_id in plan.get("templateIds", []):
            template = templates_by_id.get(template_id)
            if not template:
                raise RunError("提示词方案包含不存在的步骤。")
            template_steps.append(
                {
                    "templateId": template["id"],
                    "name": template["name"],
                    "content": template["content"],
                }
            )
        if not 1 <= len(template_steps) <= 3:
            raise RunError("提示词方案必须包含 1–3 个步骤。")
        preferences = config.get("preferences", {})
        normalized_preset = str(chunk_preset or preferences.get("chunkPreset") or DEFAULT_CHUNK_PRESET)
        if normalized_preset not in CHUNK_PRESETS:
            normalized_preset = DEFAULT_CHUNK_PRESET
        requested_repeat = repeat_count if repeat_count is not None else preferences.get("singleTemplateRounds", 2)
        try:
            requested_repeat = int(requested_repeat)
        except (TypeError, ValueError):
            requested_repeat = 2
        effective_repeat = max(1, min(3, requested_repeat)) if len(template_steps) == 1 else 1
        if len(template_steps) == 1:
            steps = [
                {
                    **template_steps[0],
                    "executionId": f"{template_steps[0]['templateId']}:round-{round_index + 1}",
                    "roundIndex": round_index,
                    "roundNumber": round_index + 1,
                }
                for round_index in range(effective_repeat)
            ]
        else:
            steps = [
                {
                    **step,
                    "executionId": f"{step['templateId']}:step-{step_index + 1}",
                    "roundIndex": 0,
                    "roundNumber": 1,
                }
                for step_index, step in enumerate(template_steps)
            ]
        chunk_manifest = build_chunk_manifest(document, preset=normalized_preset)
        if not chunk_manifest:
            raise RunError("当前范围内没有可改写的正文。")
        profile_snapshot = {key: value for key, value in profile.items() if key not in {"apiKey", "knownModels"}}
        run_id = f"run-{uuid.uuid4().hex}"
        terms = protected_terms if protected_terms is not None else config.get("preferences", {}).get("protectedTerms", [])
        run = {
            "id": run_id,
            "documentId": document_id,
            "status": "queued",
            "message": "任务已创建。",
            "cancelRequested": False,
            "snapshot": {
                "document": {
                    "id": document["id"],
                    "name": document["name"],
                    "kind": document["kind"],
                    "sourceHash": document["sourceHash"],
                    "selectedParagraphIds": [
                        item["id"] for item in document["paragraphs"] if item.get("selected")
                    ],
                },
                "modelProfile": profile_snapshot,
                "credentialProfileId": profile["id"],
                "promptPlan": {
                    "id": plan["id"],
                    "name": plan["name"],
                    "steps": steps,
                },
                "chunking": {
                    "preset": normalized_preset,
                    "limits": {
                        language: {
                            "keep": values[0],
                            "target": values[1],
                            "hard": values[2],
                            "minTail": values[3],
                        }
                        for language, values in CHUNK_PRESETS[normalized_preset].items()
                    },
                },
                "repeatCount": effective_repeat,
                "concurrency": max(1, min(16, int(concurrency))),
                "protectedTerms": list(dict.fromkeys(str(item).strip() for item in terms if str(item).strip()))[:200],
                "chunkManifest": deepcopy(chunk_manifest),
            },
            "chunks": [
                {
                    **item,
                    "status": "pending",
                    "stepIndex": 0,
                    "stepOutputs": [],
                    "streamText": "",
                    "revision": 0,
                    "finalText": "",
                    "warnings": [],
                    "error": "",
                }
                for item in chunk_manifest
            ],
            "reviewDecisions": {},
            "paragraphWarnings": {},
            "warningCheckErrors": {},
            "eventSequence": 0,
            "events": [],
            "formatAudit": None,
            "createdAt": _now(),
            "updatedAt": _now(),
            "completedAt": "",
        }
        with self._lock:
            self._runs[run_id] = run
            self._save(run)
        set_latest_run(document_id, run_id)
        self._start_worker(run_id)
        return self.public_run(run_id)

    def _start_worker(self, run_id: str) -> None:
        thread = threading.Thread(target=self._worker_entry, args=(run_id,), name=f"fyadr-{run_id[-8:]}", daemon=True)
        thread.start()

    def _worker_entry(self, run_id: str) -> None:
        try:
            asyncio.run(self._run_async(run_id))
        except Exception as exc:  # worker boundary; individual request failures are handled below
            with self._lock:
                try:
                    run = self._load(run_id)
                    run["status"] = "paused"
                    run["message"] = f"任务暂停：{exc}"
                    self._emit(run, "run-status", {"status": "paused", "message": run["message"]}, persist=True)
                except RunError:
                    return

    def _resolved_profile(self, run: dict[str, Any]) -> dict[str, Any]:
        snapshot = deepcopy(run["snapshot"]["modelProfile"])
        credential_id = str(run["snapshot"].get("credentialProfileId") or "")
        current = find_profile(credential_id)
        if not current:
            raise RunError("模型连接已被删除，无法继续任务。")
        snapshot["apiKey"] = current.get("apiKey", "")
        return snapshot

    async def _run_async(self, run_id: str) -> None:
        run = self._load(run_id)
        profile = self._resolved_profile(run)
        with self._lock:
            if run.get("cancelRequested"):
                run["status"] = "cancelled"
                run["message"] = "任务已停止，尚未开始的内容不会执行。"
                self._emit(run, "run-status", {"status": "cancelled", "message": run["message"]}, persist=True)
                return
            run["status"] = "running"
            run["message"] = "正在改写。"
            self._emit(run, "run-status", {"status": "running", "message": run["message"]}, persist=True)
        loop = asyncio.get_running_loop()
        concurrency = int(run["snapshot"].get("concurrency", 1))
        pending_chunks = [chunk for chunk in run.get("chunks", []) if chunk.get("status") == "pending"]
        worker_count = min(max(1, min(16, concurrency)), len(pending_chunks)) if pending_chunks else 0
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        for chunk in pending_chunks:
            queue.put_nowait(chunk)
        tasks: set[asyncio.Task[Any]] = set()

        async def worker() -> None:
            while not run.get("cancelRequested"):
                try:
                    chunk = queue.get_nowait()
                except asyncio.QueueEmpty:
                    return
                try:
                    if run.get("cancelRequested"):
                        return
                    await self._process_chunk(run, chunk, profile)
                finally:
                    queue.task_done()
                if run.get("cancelRequested"):
                    return

        for worker_index in range(worker_count):
            task = asyncio.create_task(worker(), name=f"{run_id}:worker-{worker_index + 1}")
            tasks.add(task)
        with self._lock:
            self._runtimes[run_id] = (loop, tasks)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        with self._lock:
            self._runtimes.pop(run_id, None)
            statuses = {str(item.get("status")) for item in run.get("chunks", [])}
            if run.get("cancelRequested"):
                run["status"] = "cancelled"
                run["message"] = "任务已停止，已完成内容已保存。"
            elif statuses == {"completed"}:
                run["status"] = "completed"
                run["message"] = "改写完成，可以审阅和导出。"
                run["completedAt"] = _now()
            else:
                run["status"] = "paused"
                run["message"] = "部分内容未完成，请检查后继续。"
            self._emit(
                run,
                "run-status",
                {"status": run["status"], "message": run["message"], "progress": self._progress(run)},
                persist=True,
            )

    @staticmethod
    def _safe_warnings(
        original: str, rewritten: str, protected_terms: list[str]
    ) -> tuple[list[dict[str, Any]], str]:
        try:
            return generate_rewrite_warnings(original, rewritten, protected_terms), ""
        except Exception as exc:
            return [], f"提醒检查暂时不可用：{exc}"

    @staticmethod
    def _joined_chunk_value(
        chunks: list[dict[str, Any]], field: str, *, require_complete: bool
    ) -> str:
        value = ""
        for index, chunk in enumerate(sorted(chunks, key=lambda item: int(item["partIndex"]))):
            if require_complete and chunk.get("status") != "completed":
                return ""
            part = str(chunk.get(field) or "")
            if index:
                value += str(chunk.get("joinerBefore") or "")
            value += part
        return value

    def _refresh_paragraph_warnings(self, run: dict[str, Any], paragraph_id: str) -> None:
        with self._lock:
            chunks = [
                item for item in run.get("chunks", []) if item.get("paragraphId") == paragraph_id
            ]
            if not chunks or any(item.get("status") != "completed" for item in chunks):
                return
            original = self._joined_chunk_value(chunks, "originalText", require_complete=False)
            rewritten = self._joined_chunk_value(chunks, "finalText", require_complete=True)
            protected_terms = list(run.get("snapshot", {}).get("protectedTerms", []))
        warnings, warning_error = self._safe_warnings(original, rewritten, protected_terms)
        with self._lock:
            run.setdefault("paragraphWarnings", {})[paragraph_id] = warnings
            errors = run.setdefault("warningCheckErrors", {})
            if warning_error:
                errors[paragraph_id] = warning_error
            else:
                errors.pop(paragraph_id, None)
            self._emit(
                run,
                "paragraph-warnings",
                {
                    "paragraphId": paragraph_id,
                    "warnings": warnings,
                    "warningCheckError": warning_error,
                },
                persist=True,
            )

    async def _process_chunk(
        self, run: dict[str, Any], chunk: dict[str, Any], profile: dict[str, Any]
    ) -> None:
        if run.get("cancelRequested"):
            return
        with self._lock:
            chunk["status"] = "running"
            chunk["error"] = ""
            chunk["streamText"] = ""
            self._emit(
                run,
                "chunk-status",
                {"chunkId": chunk["id"], "status": "running", "stepIndex": chunk["stepIndex"]},
            )
        steps = run["snapshot"]["promptPlan"]["steps"]
        current_input = chunk["stepOutputs"][-1] if chunk.get("stepOutputs") else chunk["originalText"]
        start_index = int(chunk.get("stepIndex", 0))
        try:
            for step_index in range(start_index, len(steps)):
                if run.get("cancelRequested"):
                    raise asyncio.CancelledError
                step = steps[step_index]
                prompt = str(step["content"]).replace("{{text}}", current_input)
                streamed: list[str] = []
                last_emit = 0.0

                async def on_delta(delta: str) -> None:
                    nonlocal last_emit
                    streamed.append(delta)
                    now = time.monotonic()
                    if last_emit == 0.0 or now - last_emit >= 0.1:
                        with self._lock:
                            chunk["streamText"] = "".join(streamed)
                            chunk["revision"] = int(chunk.get("revision", 0)) + 1
                            self._emit(
                                run,
                                "chunk-stream",
                                {
                                    "chunkId": chunk["id"],
                                    "stepIndex": step_index,
                                    "revision": chunk["revision"],
                                    "text": chunk["streamText"],
                                },
                            )
                        last_emit = now

                result = await self.llm.stream_completion(profile, prompt, on_delta)
                if not result.strip():
                    raise StreamRequestError("模型返回了空内容。", category="empty")
                with self._lock:
                    chunk["streamText"] = result
                    chunk["revision"] = int(chunk.get("revision", 0)) + 1
                    self._emit(
                        run,
                        "chunk-stream",
                        {
                            "chunkId": chunk["id"],
                            "stepIndex": step_index,
                            "revision": chunk["revision"],
                            "text": result,
                        },
                    )
                    outputs = list(chunk.get("stepOutputs", []))
                    if len(outputs) > step_index:
                        outputs[step_index] = result
                        del outputs[step_index + 1 :]
                    else:
                        outputs.append(result)
                    chunk["stepOutputs"] = outputs
                    chunk["stepIndex"] = step_index + 1
                    current_input = result
                    self._save(run)
            with self._lock:
                chunk["finalText"] = current_input
                chunk["warnings"] = []
                chunk["status"] = "completed"
                chunk["error"] = ""
                self._emit(
                    run,
                    "chunk-complete",
                    {
                        "chunkId": chunk["id"],
                        "status": "completed",
                        "warnings": [],
                        "progress": self._progress(run),
                    },
                    persist=True,
                )
            try:
                self._refresh_paragraph_warnings(run, str(chunk["paragraphId"]))
            except Exception:
                # The completed model result is already durable. Reminder generation
                # is deliberately best-effort and must never roll it back or pause it.
                pass
        except asyncio.CancelledError:
            with self._lock:
                if chunk.get("status") == "running":
                    chunk["status"] = "cancelled"
                    chunk["error"] = "任务已停止"
                    self._save(run)
            return
        except (StreamRequestError, RunError) as exc:
            with self._lock:
                chunk["status"] = "paused"
                chunk["error"] = str(exc)
                self._emit(
                    run,
                    "chunk-paused",
                    {
                        "chunkId": chunk["id"],
                        "status": "paused",
                        "message": str(exc),
                        "hasPartialPreview": bool(chunk.get("streamText")),
                    },
                    persist=True,
                )
        except Exception as exc:
            with self._lock:
                chunk["status"] = "paused"
                chunk["error"] = f"处理失败：{exc}"
                self._emit(
                    run,
                    "chunk-paused",
                    {"chunkId": chunk["id"], "status": "paused", "message": chunk["error"]},
                    persist=True,
                )

    @staticmethod
    def _progress(run: dict[str, Any]) -> dict[str, int]:
        chunks = list(run.get("chunks", []))
        by_paragraph: dict[str, list[dict[str, Any]]] = {}
        for chunk in chunks:
            by_paragraph.setdefault(str(chunk.get("paragraphId") or ""), []).append(chunk)
        paragraph_total = len(by_paragraph)
        paragraph_completed = sum(
            1 for paragraph_chunks in by_paragraph.values()
            if paragraph_chunks and all(chunk.get("status") == "completed" for chunk in paragraph_chunks)
        )
        chunk_total = len(chunks)
        chunk_completed = sum(1 for chunk in chunks if chunk.get("status") == "completed")
        return {
            "completed": paragraph_completed,
            "total": paragraph_total,
            "percent": round(chunk_completed * 100 / chunk_total) if chunk_total else 0,
            "completedChunks": chunk_completed,
            "totalChunks": chunk_total,
        }

    def cancel(self, run_id: str) -> dict[str, Any]:
        run = self._load(run_id)
        with self._lock:
            if run.get("status") not in {"running", "queued", "cancelling"}:
                return self.public_run(run_id)
            run["cancelRequested"] = True
            run["status"] = "cancelling"
            run["message"] = "正在停止当前连接…"
            runtime = self._runtimes.get(run_id)
            self._emit(run, "run-status", {"status": "cancelling", "message": run["message"]}, persist=True)
        if runtime:
            loop, tasks = runtime
            for task in list(tasks):
                loop.call_soon_threadsafe(task.cancel)
        return self.public_run(run_id)

    def resume(self, run_id: str) -> dict[str, Any]:
        run = self._load(run_id)
        with self._lock:
            if run.get("status") in {"running", "queued", "cancelling"}:
                return self.public_run(run_id)
            unfinished = False
            for chunk in run.get("chunks", []):
                if chunk.get("status") != "completed":
                    chunk["status"] = "pending"
                    chunk["error"] = ""
                    chunk["streamText"] = ""
                    unfinished = True
            if not unfinished:
                raise RunError("任务已经完成，无需继续。")
            run["status"] = "queued"
            run["cancelRequested"] = False
            run["message"] = "准备继续未完成的内容。"
            self._save(run)
        self._start_worker(run_id)
        return self.public_run(run_id)

    def retry_paragraph(self, run_id: str, paragraph_id: str) -> dict[str, Any]:
        run = self._load(run_id)
        with self._lock:
            if run.get("status") in {"running", "queued", "cancelling"}:
                raise RunError("请先停止当前任务，再重新改写该段。")
            targets = [chunk for chunk in run.get("chunks", []) if chunk.get("paragraphId") == paragraph_id]
            if not targets:
                raise RunError("未找到对应段落。")
            for chunk in targets:
                chunk.update(
                    {
                        "status": "pending",
                        "stepIndex": 0,
                        "stepOutputs": [],
                        "streamText": "",
                        "finalText": "",
                        "warnings": [],
                        "error": "",
                    }
                )
            run.get("reviewDecisions", {}).pop(paragraph_id, None)
            run.get("paragraphWarnings", {}).pop(paragraph_id, None)
            run.get("warningCheckErrors", {}).pop(paragraph_id, None)
            run["status"] = "queued"
            run["cancelRequested"] = False
            run["message"] = "准备重新改写所选段落。"
            self._save(run)
        self._start_worker(run_id)
        return self.public_run(run_id)

    def save_review(self, run_id: str, paragraph_id: str, decision: str, text: str = "") -> dict[str, Any]:
        run = self._load(run_id)
        if decision not in {"rewrite", "original", "manual"}:
            raise RunError("审阅决定无效。")
        document = load_document(str(run["documentId"]))
        paragraph = next((item for item in document["paragraphs"] if item["id"] == paragraph_id), None)
        if not paragraph or not paragraph.get("selected"):
            raise RunError("未找到对应正文段落。")
        if decision == "manual" and not text.strip():
            raise RunError("手动编辑内容不能为空。")
        with self._lock:
            run.setdefault("reviewDecisions", {})[paragraph_id] = {
                "decision": decision,
                "text": text if decision == "manual" else "",
                "updatedAt": _now(),
            }
            self._save(run)
        return self.public_run(run_id)

    def _paragraph_results(self, run: dict[str, Any], document: dict[str, Any]) -> list[dict[str, Any]]:
        by_paragraph: dict[str, list[dict[str, Any]]] = {}
        for chunk in run.get("chunks", []):
            by_paragraph.setdefault(str(chunk["paragraphId"]), []).append(chunk)
        results: list[dict[str, Any]] = []
        decisions = run.get("reviewDecisions", {})
        for paragraph in document.get("paragraphs", []):
            if not paragraph.get("selected"):
                continue
            chunks = sorted(by_paragraph.get(paragraph["id"], []), key=lambda item: int(item["partIndex"]))
            complete = bool(chunks) and all(item.get("status") == "completed" for item in chunks)
            rewritten = self._joined_chunk_value(chunks, "finalText", require_complete=True) if complete else ""
            partial = ""
            for chunk_index, item in enumerate(chunks):
                value = (
                    str(item.get("finalText") or "")
                    if item.get("status") == "completed"
                    else str(item.get("streamText") or "")
                )
                if not value:
                    break
                if chunk_index:
                    partial += str(item.get("joinerBefore") or "")
                partial += value
            decision = decisions.get(paragraph["id"], {"decision": "rewrite", "text": ""})
            decision_name = str(decision.get("decision") or "rewrite")
            warning_error = ""
            if decision_name == "original":
                warning_items = []
            elif decision_name == "manual" and str(decision.get("text") or "").strip():
                warning_items, warning_error = self._safe_warnings(
                    str(paragraph.get("text") or ""),
                    str(decision.get("text") or ""),
                    run["snapshot"].get("protectedTerms", []),
                )
            elif complete:
                stored = run.get("paragraphWarnings", {})
                if paragraph["id"] in stored:
                    warning_items = deepcopy(stored.get(paragraph["id"], []))
                    warning_error = str(run.get("warningCheckErrors", {}).get(paragraph["id"], ""))
                else:
                    warning_items, warning_error = self._safe_warnings(
                        str(paragraph.get("text") or ""),
                        rewritten,
                        run["snapshot"].get("protectedTerms", []),
                    )
            else:
                warning_items = []
            result = {
                "paragraphId": paragraph["id"],
                "order": paragraph["order"],
                "originalText": paragraph["text"],
                "rewrittenText": rewritten,
                "partialText": partial,
                "complete": complete,
                "status": "completed" if complete else next((x.get("status") for x in chunks if x.get("status") != "completed"), "pending"),
                "error": next((str(x.get("error")) for x in chunks if x.get("error")), ""),
                "warnings": warning_items,
                "warningCheckError": warning_error,
                "decision": decision,
                "chunkIds": [item["id"] for item in chunks],
            }
            results.append(result)
        return results

    def public_run(self, run_id: str) -> dict[str, Any]:
        run = self._load(run_id)
        document = load_document(str(run["documentId"]))
        with self._lock:
            snapshot = deepcopy(run["snapshot"])
            snapshot.pop("chunkManifest", None)
            for step in snapshot.get("promptPlan", {}).get("steps", []):
                step.pop("content", None)
            paragraphs = self._paragraph_results(run, document)
            complete_paragraph_ids = {
                item["paragraphId"] for item in paragraphs if item.get("complete")
            }
            chunks = []
            for item in run.get("chunks", []):
                chunks.append(
                    {
                        "id": item["id"],
                        "paragraphId": item["paragraphId"],
                        "partIndex": item["partIndex"],
                        "partCount": item["partCount"],
                        "status": item["status"],
                        "stepIndex": item["stepIndex"],
                        "originalText": item.get("originalText", ""),
                        "finalText": item.get("finalText", ""),
                        "joinerBefore": item.get("joinerBefore", ""),
                        "boundaryBefore": item.get("boundaryBefore", "direct"),
                        "streamText": "" if item["paragraphId"] in complete_paragraph_ids else item.get("streamText", ""),
                        "revision": item.get("revision", 0),
                        "error": item.get("error", ""),
                    }
                )
            return {
                "id": run["id"],
                "documentId": run["documentId"],
                "status": run["status"],
                "message": run.get("message", ""),
                "progress": self._progress(run),
                "snapshot": snapshot,
                "chunks": chunks,
                "paragraphs": paragraphs,
                "formatAudit": run.get("formatAudit"),
                "createdAt": run["createdAt"],
                "updatedAt": run["updatedAt"],
                "completedAt": run.get("completedAt", ""),
            }

    def events(self, run_id: str, after: int = 0, heartbeat_seconds: float = 15) -> Iterator[dict[str, Any] | None]:
        run = self._load(run_id)
        condition = self._condition(run_id)
        cursor = max(0, int(after))
        while True:
            with condition:
                pending = [event for event in run.get("events", []) if int(event.get("id", 0)) > cursor]
                if not pending:
                    condition.wait(timeout=heartbeat_seconds)
                    pending = [event for event in run.get("events", []) if int(event.get("id", 0)) > cursor]
                copied = [deepcopy(event) for event in pending]
            if not copied:
                yield None
                continue
            for event in copied:
                cursor = int(event["id"])
                yield event

    def _effective_replacements(
        self,
        run: dict[str, Any],
        document: dict[str, Any],
        *,
        use_original_for_incomplete: bool,
    ) -> tuple[dict[str, str], list[dict[str, Any]], list[str]]:
        results = self._paragraph_results(run, document)
        replacements: dict[str, str] = {}
        warnings: list[dict[str, Any]] = []
        incomplete: list[str] = []
        for result in results:
            decision = result["decision"].get("decision", "rewrite")
            if decision == "original":
                final = result["originalText"]
            elif decision == "manual":
                final = str(result["decision"].get("text") or "")
                if not final.strip():
                    raise RunError("手动编辑内容不能为空。")
            elif result["complete"]:
                final = result["rewrittenText"]
            else:
                final = result["originalText"]
                incomplete.append(result["paragraphId"])
            replacements[result["paragraphId"]] = final
            if final != result["originalText"]:
                warning_items, _warning_error = self._safe_warnings(
                    result["originalText"], final, run["snapshot"].get("protectedTerms", [])
                )
                for warning in warning_items:
                    warnings.append({"paragraphId": result["paragraphId"], **warning})
        if incomplete and not use_original_for_incomplete:
            # The caller still receives one unified confirmation response. Original
            # text is only used in the generated file after explicit confirmation.
            pass
        return replacements, warnings, incomplete

    def export(
        self,
        run_id: str,
        *,
        output_format: str,
        acknowledge_warnings: bool = False,
        force_format_risk: bool = False,
        use_original_for_incomplete: bool = False,
    ) -> tuple[Path, dict[str, Any]]:
        run = self._load(run_id)
        document = load_document(str(run["documentId"]))
        snapshot_document = run.get("snapshot", {}).get("document", {})
        current_selected = [item["id"] for item in document.get("paragraphs", []) if item.get("selected")]
        if document.get("sourceHash") != snapshot_document.get("sourceHash") or current_selected != snapshot_document.get(
            "selectedParagraphIds", []
        ):
            raise RunError("文档或正文范围已在任务创建后变化，请重新创建改写任务。")
        normalized_format = output_format.lower()
        if normalized_format not in {"docx", "txt"}:
            raise RunError("导出格式无效。")
        if normalized_format == "docx" and document.get("kind") != "docx":
            raise RunError("TXT 文档不包含 Word 排版，不能导出为 DOCX。")
        replacements, warnings, incomplete = self._effective_replacements(
            run,
            document,
            use_original_for_incomplete=use_original_for_incomplete,
        )
        if normalized_format == "docx":
            output, audit = export_docx(document, replacements, run_id)
        else:
            output, audit = export_txt(document, replacements, run_id)
        audit["forceExported"] = bool(audit.get("status") == "warning" and force_format_risk)
        with self._lock:
            run["formatAudit"] = audit
            self._save(run)
        categories: dict[str, int] = {}
        for warning in warnings:
            categories[warning["label"]] = categories.get(warning["label"], 0) + 1
        needs_warning_confirmation = bool(warnings and not acknowledge_warnings)
        needs_format_confirmation = bool(
            normalized_format == "docx"
            and audit.get("status") == "warning"
            and not force_format_risk
        )
        needs_incomplete_confirmation = bool(incomplete and not use_original_for_incomplete)
        if needs_warning_confirmation or needs_format_confirmation or needs_incomplete_confirmation:
            messages = []
            if needs_warning_confirmation:
                messages.append("部分受保护信息发生变化")
            if needs_format_confirmation:
                messages.append("Word 格式检查发现风险")
            if needs_incomplete_confirmation:
                messages.append("存在未完成段落")
            raise ExportConfirmationRequired(
                {
                    "count": len(warnings),
                    "categories": categories,
                    "warnings": warnings[:100],
                    "formatAudit": audit,
                    "incompleteParagraphIds": incomplete,
                    "requires": {
                        "acknowledgeWarnings": needs_warning_confirmation,
                        "forceFormatRisk": needs_format_confirmation,
                        "useOriginalForIncomplete": needs_incomplete_confirmation,
                    },
                    "message": "、".join(messages) + "。确认后会按当前审阅选择生成文件。",
                }
            )
        document["lastExportAt"] = _now()
        document["lastExportPath"] = str(output)
        save_document(document)
        return output, audit


RUN_MANAGER = RunManager()
