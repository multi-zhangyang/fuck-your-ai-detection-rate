#!/usr/bin/env python3
"""Offline regression for stream reasoning/error isolation across all public boundaries.

This test intentionally injects malicious reasoning fields, partial text,
provider messages, and endpoints.  It never performs a network request and
never loads the persisted application configuration.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
import uuid
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
import llm_client  # noqa: E402
import provider_guard  # noqa: E402
import web_app  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    _build_chunk_quality,
    get_round_checkpoint_path,
    get_round_compare_path,
    get_round_quality_path,
)
from llm_client import LLMRequestError, llm_completion  # noqa: E402
from round_helper import build_round_context  # noqa: E402
from runtime_error_safety import safe_exception_details  # noqa: E402


FORBIDDEN_CALLBACK_KEYS = {
    "delta",
    "text",
    "preview",
    "streamPreview",
    "endpoint",
    "providerMessage",
    "provider_message",
    "message",
}
PROVIDER_SINK_FORBIDDEN_KEYS = {
    "analysis",
    "body",
    "content",
    "delta",
    "endpoint",
    "outputText",
    "preview",
    "prompt",
    "providerMessage",
    "reasoning",
    "streamPreview",
    "text",
    "thinking",
}


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _exception_chain_contains(error: BaseException, needle: str) -> bool:
    current: BaseException | None = error
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if needle in str(current) or needle in str(getattr(current, "provider_message", "") or ""):
            return True
        current = current.__cause__ or current.__context__
    return False


class _StreamFakeResponse:
    status = 200

    def __init__(self, chunks: list[str | bytes]) -> None:
        self._chunks = [item.encode("utf-8") if isinstance(item, str) else item for item in chunks]
        self._index = 0

    def __enter__(self) -> "_StreamFakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def readline(self, _size: int = -1) -> bytes:
        if self._index >= len(self._chunks):
            return b""
        chunk = self._chunks[self._index]
        self._index += 1
        return chunk


def _run_stream_fixture(
    frames: list[str | bytes],
    *,
    api_type: str,
    timeout: float = 120,
    events: list[dict[str, object]] | None = None,
) -> tuple[str, list[dict[str, object]]]:
    original_urlopen = llm_client.request.urlopen
    captured_events = events if events is not None else []

    def fake_urlopen(_request: Any, timeout: int = 0) -> _StreamFakeResponse:
        del timeout
        return _StreamFakeResponse(frames)

    llm_client.request.urlopen = fake_urlopen
    try:
        text = llm_completion(
            "offline malicious stream fixture",
            model="fixture/model",
            api_key="offline-placeholder",
            base_url="https://example.com/v1",
            api_type=api_type,
            timeout=timeout,
            max_retries=0,
            stream=True,
            stream_callback=captured_events.append,
        )
    finally:
        llm_client.request.urlopen = original_urlopen
    return text, captured_events


def _assert_metadata_only_callbacks(
    events: list[dict[str, object]],
    *,
    secrets: set[str],
    expected_text: str,
) -> None:
    _assert(bool(events), "stream callback emitted no metadata")
    serialized = json.dumps(events, ensure_ascii=False)
    for secret in {*secrets, expected_text}:
        _assert(secret not in serialized, f"stream callback leaked model content: {secret}")
    for event in events:
        forbidden = FORBIDDEN_CALLBACK_KEYS.intersection(event)
        _assert(not forbidden, f"stream callback exposed forbidden keys: {sorted(forbidden)}")
        _assert(event.get("reasoningSuppressed") is True, "stream callback omitted reasoningSuppressed=true")
    _assert(events[-1].get("done") is True, "stream callback omitted terminal metadata")
    _assert(events[-1].get("finalTextChars") == len(expected_text), "terminal safe character count drifted")


def _sse_progress_payloads(raw_response: str) -> list[dict[str, object]]:
    payloads: list[dict[str, object]] = []
    for block in raw_response.split("\n\n"):
        lines = block.splitlines()
        if "event: progress" not in lines:
            continue
        data_lines = [line[6:] for line in lines if line.startswith("data: ")]
        if not data_lines:
            continue
        payload = json.loads("\n".join(data_lines))
        _assert(isinstance(payload, dict), "SSE progress payload is not an object")
        payloads.append(payload)
    return payloads


def _malicious_provider_event(phase: str, marker: str) -> dict[str, object]:
    forbidden = {key: f"{marker}_{key}" for key in PROVIDER_SINK_FORBIDDEN_KEYS}
    return {
        "phase": phase,
        "round": 3,
        "chunkId": "p3_c7",
        "concurrency": 2,
        "configuredConcurrency": 4,
        **forbidden,
        "payload": {
            **forbidden,
            "nested": [{"reasoning": marker}, {"content": {"text": marker}}],
        },
        "metadata": {
            "streamEventCount": 999999,
            "analysis": marker,
            "provider": {"body": marker, "endpoint": marker},
        },
    }


def _assert_no_provider_sink_content(value: object, marker: str, boundary: str) -> None:
    serialized = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    _assert(marker not in serialized, f"{boundary} leaked injected provider content")
    for key in PROVIDER_SINK_FORBIDDEN_KEYS:
        _assert(f'"{key}"' not in serialized, f"{boundary} retained forbidden key {key}")


def _test_web_progress_sink_boundary(work_root: Path) -> dict[str, object]:
    """Inject hostile provider events directly at the final state/SSE sinks."""

    marker = "PROVIDER_PRIVATE_SINK_EVENT"
    task_state_dir = work_root / "task-states"
    source_path = work_root / "sink-source.txt"
    output_path = work_root / "sink-output.txt"
    source_path.write_text("offline source", encoding="utf-8")
    output_path.write_text("offline output", encoding="utf-8")
    original_task_state_dir = web_app.TASK_STATE_DIR
    web_app.TASK_STATE_DIR = task_state_dir
    web_app.RUN_STATES.clear()
    web_app.ACTIVE_RUNS_BY_SOURCE.clear()
    web_app.BATCH_RERUN_STATES.clear()
    web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()

    stream_keys = {
        "phase",
        "round",
        "chunkId",
        "streamEventCount",
        "streamDone",
        "reasoningSuppressed",
        "providerContentStored",
        "concurrency",
        "configuredConcurrency",
    }
    retry_keys = {
        "phase",
        "round",
        "chunkId",
        "error",
        "errorCategory",
        "statusCode",
        "retryable",
        "attempt",
        "attempts",
        "maxAttempts",
        "nextAttempt",
        "retryDelaySeconds",
        "retryAfterSeconds",
        "cooldownSeconds",
        "reasoningSuppressed",
        "providerContentStored",
        "concurrency",
        "configuredConcurrency",
    }

    def register_sink_run(path: Path) -> tuple[str, web_app.ProgressState]:
        run_id = uuid.uuid4().hex
        normalized_path = str(path.resolve())
        state = web_app.ProgressState(source_path=normalized_path)
        web_app.RUN_STATES[run_id] = state
        web_app.ACTIVE_RUNS_BY_SOURCE[normalized_path] = run_id
        web_app.persist_run_state(run_id)
        return run_id, state

    try:
        stream_run_id, stream_state = register_sink_run(source_path)
        pending_event = _malicious_provider_event("provider-stream", marker)
        pending_event.update({
            "streamEventCount": 9,
            "streamDone": False,
            "finalTextChars": 123456,
            "reasoningSuppressed": False,
            "providerContentStored": True,
        })
        web_app.append_progress_event(stream_run_id, pending_event)
        pending_projected = stream_state.events[-1]
        _assert(set(pending_projected) == stream_keys, "pending stream sink schema is not a strict allowlist")
        _assert("finalTextChars" not in pending_projected, "non-terminal stream persisted finalTextChars")
        _assert(pending_projected.get("streamEventCount") == 9, "stream event count metadata was lost")
        _assert(pending_projected.get("reasoningSuppressed") is True, "stream sink did not enforce reasoning suppression")
        _assert(pending_projected.get("providerContentStored") is False, "stream sink claimed provider content storage")
        pending_disk = json.loads(web_app.run_round_state_path(stream_run_id).read_text(encoding="utf-8"))
        _assert(pending_disk["state"]["lastEvent"] == pending_projected, "pending stream snapshot drifted from safe projection")
        _assert_no_provider_sink_content(pending_disk, marker, "pending run snapshot")

        done_event = _malicious_provider_event("provider-stream", marker)
        done_event.update({
            "streamEventCount": 12,
            "streamDone": True,
            "finalTextChars": 321,
            "reasoningSuppressed": False,
            "providerContentStored": True,
        })
        web_app.append_progress_event(stream_run_id, done_event)
        done_projected = stream_state.events[-1]
        _assert(set(done_projected) == stream_keys | {"finalTextChars"}, "terminal stream sink schema drifted")
        _assert(done_projected.get("finalTextChars") == 321, "terminal final character count metadata was lost")
        stream_disk = json.loads(web_app.run_round_state_path(stream_run_id).read_text(encoding="utf-8"))
        _assert(stream_disk["state"]["lastEvent"] == done_projected, "terminal stream snapshot drifted from safe projection")
        _assert_no_provider_sink_content(stream_disk, marker, "terminal run snapshot")

        with stream_state.condition:
            stream_state.completed = True
            stream_state.status = "completed"
            stream_state.result = {}
            stream_state.condition.notify_all()
        client = web_app.app.test_client()
        stream_response = client.get(f"/api/run-round-events/{stream_run_id}", buffered=True)
        stream_sse = stream_response.get_data(as_text=True)
        _assert(stream_response.status_code == 200, "stream SSE fixture did not return HTTP 200")
        _assert_no_provider_sink_content(stream_sse, marker, "run stream SSE")
        stream_sse_events = _sse_progress_payloads(stream_sse)
        _assert(stream_sse_events == [pending_projected, done_projected], "SSE did not emit the projected stream events")

        retry_source_path = work_root / "retry-source.txt"
        retry_source_path.write_text("offline retry source", encoding="utf-8")
        retry_run_id, retry_state = register_sink_run(retry_source_path)
        retry_event = _malicious_provider_event("provider-retry-wait", marker)
        retry_event.update({
            "error": marker,
            "errorCategory": "server",
            "statusCode": 503,
            "retryable": True,
            "attempt": 1,
            "attempts": 1,
            "maxAttempts": 3,
            "nextAttempt": 2,
            "retryDelaySeconds": 1.25,
            "retryAfterSeconds": 2,
            "cooldownSeconds": 3.5,
            "reasoningSuppressed": False,
            "providerContentStored": True,
        })
        web_app.append_progress_event(retry_run_id, retry_event)
        retry_projected = retry_state.events[-1]
        _assert(set(retry_projected) == retry_keys, "provider retry sink schema is not a strict allowlist")
        _assert(retry_projected.get("errorCategory") == "server", "retry category metadata was lost")
        _assert(retry_projected.get("statusCode") == 503, "retry HTTP status metadata was lost")
        _assert(retry_projected.get("retryDelaySeconds") == 1.25, "retry delay metadata was lost")
        _assert(marker not in str(retry_projected.get("error", "")), "retry sink trusted an injected error message")
        retry_disk = json.loads(web_app.run_round_state_path(retry_run_id).read_text(encoding="utf-8"))
        _assert(retry_disk["state"]["lastEvent"] == retry_projected, "retry snapshot drifted from safe projection")
        _assert_no_provider_sink_content(retry_disk, marker, "retry run snapshot")
        with retry_state.condition:
            retry_state.completed = True
            retry_state.status = "completed"
            retry_state.result = {}
            retry_state.condition.notify_all()
        retry_sse = client.get(f"/api/run-round-events/{retry_run_id}", buffered=True).get_data(as_text=True)
        _assert_no_provider_sink_content(retry_sse, marker, "retry run SSE")
        _assert(_sse_progress_payloads(retry_sse) == [retry_projected], "SSE did not emit the projected retry event")

        batch_stream_id, batch_stream_state = web_app.register_batch_rerun(str(output_path), 1)
        web_app.append_batch_rerun_event(batch_stream_id, done_event)
        batch_stream_projected = batch_stream_state.events[-1]
        _assert(batch_stream_projected == done_projected, "batch stream sink did not share the strict projection")
        batch_stream_disk = json.loads(web_app.batch_rerun_state_path(batch_stream_id).read_text(encoding="utf-8"))
        batch_stream_response = client.get(f"/api/batch-rerun-status/{batch_stream_id}").get_json() or {}
        _assert(batch_stream_disk["state"]["lastEvent"] == batch_stream_projected, "batch stream snapshot drifted")
        _assert(batch_stream_response.get("lastEvent") == batch_stream_projected, "batch stream status response drifted")
        _assert_no_provider_sink_content(batch_stream_disk, marker, "batch stream snapshot")
        _assert_no_provider_sink_content(batch_stream_response, marker, "batch stream status")

        retry_output_path = work_root / "retry-output.txt"
        retry_output_path.write_text("offline retry output", encoding="utf-8")
        batch_retry_id, batch_retry_state = web_app.register_batch_rerun(str(retry_output_path), 1)
        web_app.append_batch_rerun_event(batch_retry_id, retry_event)
        batch_retry_projected = batch_retry_state.events[-1]
        _assert(batch_retry_projected == retry_projected, "batch retry sink did not share the strict projection")
        batch_retry_disk = json.loads(web_app.batch_rerun_state_path(batch_retry_id).read_text(encoding="utf-8"))
        batch_retry_response = client.get(f"/api/batch-rerun-status/{batch_retry_id}").get_json() or {}
        _assert(batch_retry_disk["state"]["lastEvent"] == batch_retry_projected, "batch retry snapshot drifted")
        _assert(batch_retry_response.get("lastEvent") == batch_retry_projected, "batch retry status response drifted")
        _assert_no_provider_sink_content(batch_retry_disk, marker, "batch retry snapshot")
        _assert_no_provider_sink_content(batch_retry_response, marker, "batch retry status")

        ordinary_output_path = work_root / "ordinary-output.txt"
        ordinary_output_path.write_text("offline ordinary output", encoding="utf-8")
        ordinary_id, ordinary_state = web_app.register_batch_rerun(str(ordinary_output_path), 1)
        ordinary_failure = {
            "phase": "chunk-failed",
            "chunkId": "p0_c0",
            "error": "local validation failure",
            "failedAttempts": [{"outputText": "guard-rejected candidate", "attempt": 1}],
            "quality": {"needsReview": True, "flags": ["validation_failed"]},
        }
        web_app.append_batch_rerun_event(ordinary_id, ordinary_failure)
        ordinary_projected = ordinary_state.events[-1]
        _assert(ordinary_projected != ordinary_failure, "ordinary chunk failure retained its raw diagnostic payload")
        ordinary_attempts = ordinary_projected.get("failedAttempts") or []
        _assert(bool(ordinary_attempts), "ordinary chunk failure lost failed-attempt identity evidence")
        _assert(ordinary_attempts[0].get("schema") == "fyadr.failed-attempt-evidence", "ordinary failed attempt lost the text-free schema")
        _assert(ordinary_attempts[0].get("textStored") is False, "ordinary failed attempt claimed body storage")
        _assert(ordinary_attempts[0].get("errorStored") is False, "ordinary failed attempt claimed error storage")
        ordinary_serialized = json.dumps(ordinary_projected, ensure_ascii=False)
        _assert("guard-rejected candidate" not in ordinary_serialized, "ordinary chunk failure leaked the rejected body")
        _assert("local validation failure" not in ordinary_serialized, "ordinary chunk failure leaked raw validation prose")

        for path in task_state_dir.glob("*.json"):
            _assert(marker not in path.read_text(encoding="utf-8"), f"task snapshot {path.name} leaked provider content")
        return {
            "runSseEventCount": len(stream_sse_events) + len(_sse_progress_payloads(retry_sse)),
            "runSnapshotCount": 2,
            "batchSnapshotCount": 2,
            "forbiddenKeyCount": len(PROVIDER_SINK_FORBIDDEN_KEYS),
            "ordinaryChunkFailureProjectedTextFree": True,
        }
    finally:
        web_app.RUN_STATES.clear()
        web_app.ACTIVE_RUNS_BY_SOURCE.clear()
        web_app.BATCH_RERUN_STATES.clear()
        web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT.clear()
        web_app.TASK_STATE_DIR = original_task_state_dir


def _test_transport_streams() -> dict[str, int]:
    chat_secrets = {
        "CHAT_REASONING_SECRET",
        "CHAT_THINKING_SECRET",
        "CHAT_ANALYSIS_SECRET",
        "CHAT_TAGGED_SECRET",
        "CHAT_EVENT_TYPED_SECRET",
        "CHAT_PAYLOAD_TYPED_SECRET",
        "CHAT_CHOICE_TYPED_SECRET",
        "CHAT_DELTA_TYPED_SECRET",
        "CHAT_MESSAGE_TYPED_SECRET",
        "CHAT_PART_KIND_SECRET",
        "CHAT_PART_OBJECT_SECRET",
        "CHAT_ANALYSIS_TAG_SECRET",
        "CHAT_THOUGHT_TAG_SECRET",
    }
    chat_frames = [
        "event: response.reasoning.delta\ndata: "
        + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "CHAT_EVENT_TYPED_SECRET"}}]},
            ensure_ascii=False,
        )
        + "\n\n",
        "data: "
        + json.dumps(
            {
                "type": "analysis_text.delta",
                "choices": [{"index": 0, "delta": {"content": "CHAT_PAYLOAD_TYPED_SECRET"}}],
            },
            ensure_ascii=False,
        )
        + "\n\n",
        "data: "
        + json.dumps(
            {
                "choices": [
                    {
                        "index": 0,
                        "kind": "chain_of_thought",
                        "delta": {"content": "CHAT_CHOICE_TYPED_SECRET"},
                    }
                ]
            },
            ensure_ascii=False,
        )
        + "\n\n",
        "data: "
        + json.dumps(
            {
                "choices": [
                    {
                        "index": 0,
                        "delta": {
                            "type": "reasoning_text",
                            "content": "CHAT_DELTA_TYPED_SECRET",
                        },
                    }
                ]
            },
            ensure_ascii=False,
        )
        + "\n\n",
        "data: "
        + json.dumps(
            {
                "choices": [
                    {
                        "index": 0,
                        "message": {
                            "object": "thinking.message",
                            "content": "CHAT_MESSAGE_TYPED_SECRET",
                        },
                    }
                ]
            },
            ensure_ascii=False,
        )
        + "\n\n",
    ]
    chat_payloads = [
        {"choices": [{"index": 0, "delta": {"reasoning_content": "CHAT_REASONING_SECRET"}}]},
        {"choices": [{"index": 0, "delta": {"thinking": "CHAT_THINKING_SECRET"}}]},
        {"choices": [{"index": 0, "delta": {"analysis": "CHAT_ANALYSIS_SECRET"}}]},
        {
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "content": [
                            {"kind": "analysis_text", "text": "CHAT_PART_KIND_SECRET"},
                            {"type": "text", "text": ""},
                        ]
                    },
                }
            ]
        },
        {
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "content": {
                            "type": "text",
                            "object": "reasoning.content_part",
                            "text": "CHAT_PART_OBJECT_SECRET",
                        }
                    },
                }
            ]
        },
        {"choices": [{"index": 0, "delta": {"content": "<thi"}}]},
        {"choices": [{"index": 0, "delta": {"content": "nk>CHAT_TAGGED_SECRET"}}]},
        {"choices": [{"index": 0, "delta": {"content": "</think>"}}]},
        {"choices": [{"index": 0, "delta": {"content": "<ana"}}]},
        {"choices": [{"index": 0, "delta": {"content": "lysis>CHAT_ANALYSIS_TAG_SECRET"}}]},
        {"choices": [{"index": 0, "delta": {"content": "</analysis>"}}]},
        {"choices": [{"index": 0, "delta": {"content": "<thought>CHAT_THOUGHT_TAG_SECRET</thought>"}}]},
        {"choices": [{"index": 0, "delta": {"content": "安全正文"}}]},
    ]
    chat_frames.extend(f"data: {json.dumps(item, ensure_ascii=False)}\n\n" for item in chat_payloads)
    chat_frames.append("data: [DONE]\n\n")
    chat_text, chat_events = _run_stream_fixture(chat_frames, api_type="chat_completions")
    _assert(chat_text == "安全正文", f"chat stream final text was unsafe: {chat_text!r}")
    _assert_metadata_only_callbacks(chat_events, secrets=chat_secrets, expected_text=chat_text)

    mismatch_marker = "CHAT_MISMATCHED_ANALYSIS_THOUGHT_SECRET"
    mismatch_events: list[dict[str, object]] = []
    try:
        _run_stream_fixture(
            [
                "data: "
                + json.dumps(
                    {
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "content": f"<analysis>{mismatch_marker}</thought>不应发布"
                                },
                            }
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n\n",
                "data: [DONE]\n\n",
            ],
            api_type="chat_completions",
            events=mismatch_events,
        )
    except LLMRequestError as exc:
        mismatch_error = json.dumps(exc.to_dict(), ensure_ascii=False)
        _assert(exc.category == "response_parse", "mismatched analysis/thought tags used the wrong category")
        _assert(mismatch_marker not in mismatch_error, "mismatched reasoning text leaked into its exception")
        _assert(
            not _exception_chain_contains(exc, mismatch_marker),
            "mismatched reasoning text survived in the exception chain",
        )
        _assert(
            mismatch_marker not in json.dumps(mismatch_events, ensure_ascii=False),
            "mismatched reasoning text leaked into stream callbacks",
        )
    else:
        raise AssertionError("mismatched analysis/thought tags must fail closed")

    response_secrets = {
        "RESPONSES_REASONING_SECRET",
        "RESPONSES_SUMMARY_SECRET",
        "RESPONSES_CONTENT_PART_SECRET",
        "RESPONSES_OUTPUT_ITEM_SECRET",
        "RESPONSES_UNTYPED_SECRET",
    }
    response_events = [
        ("response.reasoning_text.delta", {"delta": "RESPONSES_REASONING_SECRET"}),
        ("response.reasoning_summary_text.delta", {"delta": "RESPONSES_SUMMARY_SECRET"}),
        (
            "response.content_part.delta",
            {"delta": {"type": "reasoning", "text": "RESPONSES_CONTENT_PART_SECRET"}},
        ),
        (
            "response.output_item.delta",
            {"delta": {"type": "analysis", "text": "RESPONSES_OUTPUT_ITEM_SECRET"}},
        ),
        ("response.content_part.delta", {"delta": {"text": "RESPONSES_UNTYPED_SECRET"}}),
        ("response.output_text.delta", {"delta": "安全正文"}),
    ]
    response_frames = [
        f"event: {event_name}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
        for event_name, payload in response_events
    ]
    response_frames.append("data: [DONE]\n\n")
    responses_text, responses_callbacks = _run_stream_fixture(response_frames, api_type="responses")
    _assert(responses_text == "安全正文", f"Responses stream final text was unsafe: {responses_text!r}")
    _assert_metadata_only_callbacks(
        responses_callbacks,
        secrets=response_secrets,
        expected_text=responses_text,
    )
    return {
        "chatCallbackCount": len(chat_events),
        "responsesCallbackCount": len(responses_callbacks),
        "mismatchedReasoningRejected": 1,
    }


def _test_stream_local_budgets() -> dict[str, int]:
    original_limits = (
        llm_client.MAX_STREAM_SSE_EVENTS,
        llm_client.MAX_STREAM_WIRE_BYTES,
        llm_client.MAX_STREAM_FINAL_CHARS,
    )
    checked_cases = 0

    def assert_limit(
        *,
        case_name: str,
        marker: str,
        frames: list[str],
        expected_category: str = "response_limit",
    ) -> None:
        nonlocal checked_cases
        events: list[dict[str, object]] = []
        try:
            _run_stream_fixture(
                frames,
                api_type="chat_completions",
                events=events,
            )
        except LLMRequestError as exc:
            public_dump = json.dumps(
                {
                    "exception": exc.to_dict(),
                    "details": safe_exception_details(exc),
                    "callbacks": events,
                },
                ensure_ascii=False,
            )
            _assert(exc.category == expected_category, f"{case_name} used category {exc.category!r}")
            _assert(marker not in public_dump, f"{case_name} leaked its triggering provider body")
            _assert(
                not _exception_chain_contains(exc, marker),
                f"{case_name} retained its triggering body in the exception chain",
            )
            for event in events:
                forbidden = FORBIDDEN_CALLBACK_KEYS.intersection(event)
                _assert(not forbidden, f"{case_name} callback exposed keys: {sorted(forbidden)}")
            checked_cases += 1
        else:
            raise AssertionError(f"{case_name} must fail closed")

    try:
        event_marker = "LOCAL_EVENT_LIMIT_PRIVATE_BODY"
        llm_client.MAX_STREAM_SSE_EVENTS = 1
        assert_limit(
            case_name="SSE event limit",
            marker=event_marker,
            frames=[
                "data: "
                + json.dumps({"choices": [{"index": 0, "delta": {"content": "安全"}}]}, ensure_ascii=False)
                + "\n\n",
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": event_marker}}]},
                    ensure_ascii=False,
                )
                + "\n\n",
            ],
        )

        llm_client.MAX_STREAM_SSE_EVENTS = original_limits[0]
        wire_marker = "LOCAL_WIRE_LIMIT_PRIVATE_BODY"
        llm_client.MAX_STREAM_WIRE_BYTES = 24
        assert_limit(
            case_name="wire-byte limit",
            marker=wire_marker,
            frames=[
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": wire_marker}}]},
                    ensure_ascii=False,
                )
                + "\n\n"
            ],
        )

        llm_client.MAX_STREAM_WIRE_BYTES = original_limits[1]
        final_marker = "LOCAL_FINAL_CHAR_LIMIT_PRIVATE_BODY"
        llm_client.MAX_STREAM_FINAL_CHARS = 4
        assert_limit(
            case_name="final-char limit",
            marker=final_marker,
            frames=[
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": final_marker}}]},
                    ensure_ascii=False,
                )
                + "\n\n"
            ],
        )
    finally:
        (
            llm_client.MAX_STREAM_SSE_EVENTS,
            llm_client.MAX_STREAM_WIRE_BYTES,
            llm_client.MAX_STREAM_FINAL_CHARS,
        ) = original_limits

    deadline_marker = "LOCAL_DEADLINE_PRIVATE_BODY"
    deadline_events: list[dict[str, object]] = []
    original_urlopen = llm_client.request.urlopen
    original_monotonic = llm_client.time.monotonic
    original_sleep = llm_client.time.sleep
    clock = {"now": 0.0}
    sleep_calls: list[float] = []

    def fake_monotonic() -> float:
        return clock["now"]

    def fake_sleep(seconds: float) -> None:
        normalized = max(0.0, float(seconds))
        sleep_calls.append(normalized)
        clock["now"] += normalized

    def retrying_urlopen(_request: Any, timeout: float = 0) -> _StreamFakeResponse:
        del timeout
        return _StreamFakeResponse(
            [
                "event: error\ndata: "
                + json.dumps(
                    {
                        "error": {
                            "status": 503,
                            "code": "temporary_failure",
                            "message": deadline_marker,
                            "analysis": deadline_marker,
                        }
                    },
                    ensure_ascii=False,
                )
                + "\n\n"
            ]
        )

    llm_client.request.urlopen = retrying_urlopen
    llm_client.time.monotonic = fake_monotonic
    llm_client.time.sleep = fake_sleep
    try:
        try:
            llm_completion(
                "offline deadline fixture",
                model="fixture/model",
                api_key="offline-placeholder",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                timeout=1,
                max_retries=2,
                retry_backoff_seconds=0.4,
                stream=True,
                stream_callback=deadline_events.append,
            )
        except LLMRequestError as exc:
            public_dump = json.dumps(
                {
                    "exception": exc.to_dict(),
                    "details": safe_exception_details(exc),
                    "callbacks": deadline_events,
                },
                ensure_ascii=False,
            )
            _assert(exc.category == "timeout", "stream total deadline used the wrong category")
            _assert(deadline_marker not in public_dump, "deadline/backoff error leaked provider body")
            _assert(
                not _exception_chain_contains(exc, deadline_marker),
                "deadline/backoff retained provider body in the exception chain",
            )
            _assert(len(sleep_calls) == 1, "deadline budget did not bound retry backoff deterministically")
            _assert(clock["now"] < 1.0, "deadline regression advanced beyond its total budget")
            for event in deadline_events:
                forbidden = FORBIDDEN_CALLBACK_KEYS.intersection(event)
                _assert(not forbidden, f"deadline callback exposed keys: {sorted(forbidden)}")
            checked_cases += 1
        else:
            raise AssertionError("stream total deadline must bound retry/backoff")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.monotonic = original_monotonic
        llm_client.time.sleep = original_sleep

    return {
        "checkedLimitCount": checked_cases,
        "deadlineSyntheticSleepCount": len(sleep_calls),
    }


def _test_round_progress_checkpoint_boundary(work_root: Path) -> dict[str, object]:
    marker = f"PROVIDER_PRIVATE_{uuid.uuid4().hex}"
    endpoint_marker = f"PRIVATE_ENDPOINT_{uuid.uuid4().hex}"
    source_path = work_root / "university-thesis-stream-safety.txt"
    source_path.write_text(
        "本文围绕高校论文检测场景中的文本处理边界展开研究。实验保持术语、数值、引用与结论不变，"
        "并通过检查点记录每个分块的处理状态，以验证异常恢复过程不会暴露上游思考内容。",
        encoding="utf-8",
    )
    profile = "cn_custom"
    sequence = ["classical"]
    context = build_round_context(source_path, round_number=1, prompt_profile=profile, prompt_sequence=sequence)
    checkpoint_path = get_round_checkpoint_path(context.output_text_path)
    guard_config = {
        "providerId": "offline-stream-safety-provider",
        "providerName": "Offline safety provider",
        "baseUrl": "https://example.com/v1",
        "apiKey": "offline-placeholder",
        "model": "fixture/model",
        "apiType": "chat_completions",
        "promptProfile": profile,
        "promptSequence": sequence,
        "rewriteConcurrency": 1,
        "streaming": True,
        "maxRetries": 0,
    }
    guard_key = provider_guard._provider_guard_key(guard_config)
    with provider_guard._PROVIDER_GUARD_LOCK:
        provider_guard._PROVIDER_GUARD_STATE.pop(guard_key, None)
    progress_events: list[dict[str, Any]] = []
    original_completion = app_service.llm_completion

    def malicious_completion(*_args: object, **kwargs: object) -> str:
        retry_callback = kwargs.get("retry_callback")
        stream_callback = kwargs.get("stream_callback")
        if callable(retry_callback):
            retry_callback(
                {
                    "attempt": 1,
                    "maxAttempts": 2,
                    "category": "server",
                    "statusCode": 503,
                    "retryable": True,
                    "retryDelaySeconds": 0,
                    "message": marker,
                    "providerMessage": marker,
                    "endpoint": f"https://example.com/{endpoint_marker}",
                    "reasoning": marker,
                }
            )
        if callable(stream_callback):
            stream_callback(
                {
                    "event": "stream-progress",
                    "eventCount": 9,
                    "done": False,
                    "text": marker,
                    "delta": marker,
                    "streamPreview": marker,
                    "endpoint": f"https://example.com/{endpoint_marker}",
                    "reasoning": marker,
                }
            )
        raise LLMRequestError(
            marker,
            category="server",
            status_code=503,
            retryable=False,
            endpoint=f"https://example.com/{endpoint_marker}",
            provider_message=marker,
        )

    external_error = ""
    app_service.llm_completion = malicious_completion
    try:
        try:
            app_service.run_round_for_app(
                str(source_path),
                guard_config,
                round_number=1,
                progress_callback=progress_events.append,
            )
        except RuntimeError as exc:
            external_error = str(exc)
        else:
            raise AssertionError("malicious provider failure should leave a safe checkpoint")
    finally:
        app_service.llm_completion = original_completion

    secrets = {marker, endpoint_marker}
    progress_dump = json.dumps(progress_events, ensure_ascii=False)
    _assert(all(secret not in progress_dump for secret in secrets), "progress leaked provider content")
    provider_stream_events = [item for item in progress_events if item.get("phase") == "provider-stream"]
    _assert(bool(provider_stream_events), "app service emitted no provider-stream metadata")
    for event in provider_stream_events:
        forbidden = FORBIDDEN_CALLBACK_KEYS.intersection(event)
        _assert(not forbidden, f"provider-stream progress exposed forbidden keys: {sorted(forbidden)}")
        _assert(event.get("reasoningSuppressed") is True, "provider-stream did not assert reasoning isolation")
        _assert(event.get("providerContentStored") is False, "provider-stream claimed provider content storage")
    retry_events = [item for item in progress_events if item.get("phase") == "provider-retry-wait"]
    _assert(bool(retry_events), "app service emitted no sanitized retry progress")
    for event in retry_events:
        _assert("providerMessage" not in event and "endpoint" not in event, "retry progress exposed provider fields")

    _assert(checkpoint_path.exists(), "provider failure did not create a checkpoint")
    checkpoint_raw = checkpoint_path.read_text(encoding="utf-8")
    _assert(all(secret not in checkpoint_raw for secret in secrets), "checkpoint persisted provider content")
    checkpoint_payload = json.loads(checkpoint_raw)
    last_details = checkpoint_payload.get("last_error_details") or {}
    _assert(isinstance(last_details, dict), "checkpoint error details are not structured")
    _assert(
        not {"providerMessage", "provider_message", "endpoint"}.intersection(last_details),
        "checkpoint persisted forbidden provider error fields",
    )

    status = app_service.get_round_progress_status(
        str(source_path),
        profile,
        round_number=1,
        prompt_sequence=sequence,
    )
    status_dump = json.dumps(status, ensure_ascii=False)
    _assert(all(secret not in status_dump for secret in secrets), "progress status leaked provider content")
    _assert(all(secret not in external_error for secret in secrets), "public exception leaked provider content")

    with provider_guard._PROVIDER_GUARD_LOCK:
        guard_state = dict(provider_guard._PROVIDER_GUARD_STATE.get(guard_key) or {})
        provider_guard._PROVIDER_GUARD_STATE.pop(guard_key, None)
    guard_dump = json.dumps(guard_state, ensure_ascii=False)
    _assert(all(secret not in guard_dump for secret in secrets), "provider guard retained provider content")

    for path in (
        context.output_text_path,
        context.manifest_path,
        checkpoint_path,
        get_round_compare_path(context.output_text_path),
        get_round_quality_path(context.output_text_path),
    ):
        path.unlink(missing_ok=True)
    return {
        "progressEventCount": len(progress_events),
        "providerStreamEventCount": len(provider_stream_events),
        "retryEventCount": len(retry_events),
        "statusCategory": (status.get("lastErrorDetails") or {}).get("errorCategory"),
    }


def _test_targeted_rerun_boundary(work_root: Path) -> dict[str, object]:
    marker = f"TARGETED_PROVIDER_PRIVATE_{uuid.uuid4().hex}"
    output_path = work_root / "targeted-round1.txt"
    compare_path = get_round_compare_path(output_path)
    input_text = (
        "在对 Hybrid Attention-LSTM 模型进行消融实验时，完整模型在准确率、召回率和 F1 值上分别达到"
        "91%、82% 和 86%。该结论仍需保持与原始实验记录一致[1]。"
    )
    previous_output = (
        "消融实验显示，完整 Hybrid Attention-LSTM 的准确率、召回率和 F1 值分别为 91%、82% 和 86%。"
        "该结论仍与原始实验记录一致[1]。"
    )
    output_path.write_text(previous_output, encoding="utf-8")
    compare_payload = {
        "version": 2,
        "docId": "stream-safety-targeted-rerun",
        "round": 1,
        "promptProfile": "cn_custom",
        "promptSequence": ["classical"],
        "outputPath": str(output_path),
        "chunkCount": 1,
        "paragraphCount": 1,
        "chunks": [
            {
                "chunkId": "p0_c0",
                "paragraphIndex": 0,
                "chunkIndex": 0,
                "inputText": input_text,
                "outputText": previous_output,
                "quality": _build_chunk_quality(input_text, previous_output),
            }
        ],
        "validationEvents": [],
        "qualitySummary": {},
    }
    compare_path.write_text(json.dumps(compare_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    original_builder = app_service._build_transform_from_model_config

    def failing_builder(_model_config: dict[str, Any]):
        def transform(*_args: object) -> str:
            raise LLMRequestError(
                marker,
                category="auth",
                status_code=401,
                retryable=False,
                endpoint=f"https://example.com/{marker}",
                provider_message=marker,
            )

        return transform, "online"

    app_service._build_transform_from_model_config = failing_builder
    external_error = ""
    try:
        try:
            app_service.rerun_compare_chunk(
                str(output_path),
                "p0_c0",
                {
                    "baseUrl": "https://example.com/v1",
                    "apiKey": "offline-placeholder",
                    "model": "fixture/model",
                    "apiType": "chat_completions",
                    "promptProfile": "cn_custom",
                    "promptSequence": ["classical"],
                },
            )
        except ValueError as exc:
            external_error = str(exc)
        else:
            raise AssertionError("targeted provider failure should preserve the accepted candidate")
    finally:
        app_service._build_transform_from_model_config = original_builder

    compare_raw = compare_path.read_text(encoding="utf-8")
    _assert(marker not in compare_raw, "targeted compare persisted provider content")
    _assert(marker not in external_error, "targeted public exception leaked provider content")
    compare_after = json.loads(compare_raw)
    chunk_after = compare_after["chunks"][0]
    _assert(chunk_after.get("outputText") == previous_output, "targeted failure replaced the accepted candidate")
    failed_attempts = chunk_after.get("failedAttempts") or []
    _assert(
        marker not in json.dumps(failed_attempts, ensure_ascii=False),
        "targeted failedAttempts leaked provider content",
    )
    return {"failedAttemptCount": len(failed_attempts), "acceptedCandidatePreserved": True}


def _test_frontend_static_boundary() -> dict[str, object]:
    app_src = ROOT_DIR / "app" / "src"
    source_files = sorted([*app_src.rglob("*.ts"), *app_src.rglob("*.tsx")])
    combined = "\n".join(path.read_text(encoding="utf-8") for path in source_files)
    _assert("streamPreview" not in combined, "frontend still exposes the legacy streamPreview channel")
    runtime_source = (app_src / "lib" / "runtimeProgress.ts").read_text(encoding="utf-8")
    status_source = (app_src / "components" / "RoundRunStatusCard.tsx").read_text(encoding="utf-8")
    diff_source = (app_src / "lib" / "rewriteDiffPanelFilterViewModel.ts").read_text(encoding="utf-8")
    _assert("思考内容已隔离" in runtime_source, "runtime progress does not disclose reasoning isolation")
    _assert("思考内容已隔离" in status_source, "run status card does not disclose reasoning isolation")
    _assert("完整回答通过门禁后才会进入 Diff" in diff_source, "Diff boundary copy lost its hard-gate contract")
    return {"sourceFileCount": len(source_files), "legacyPreviewReferences": 0}


def main() -> int:
    regression_root = ROOT_DIR / "finish" / "regression"
    regression_root.mkdir(parents=True, exist_ok=True)
    transport = _test_transport_streams()
    local_budgets = _test_stream_local_budgets()
    with tempfile.TemporaryDirectory(prefix="stream-reasoning-safety-", dir=regression_root) as temp_value:
        work_root = Path(temp_value)
        sink_boundary = _test_web_progress_sink_boundary(work_root)
        round_boundary = _test_round_progress_checkpoint_boundary(work_root)
        targeted = _test_targeted_rerun_boundary(work_root)
        for path in work_root.rglob("*"):
            if path.is_file():
                raw = path.read_bytes()
                _assert(b"PROVIDER_PRIVATE_" not in raw, f"provider marker survived in artifact: {path}")
    frontend = _test_frontend_static_boundary()
    print(
        json.dumps(
            {
                "ok": True,
                "networkCalls": 0,
                "transport": transport,
                "localBudgets": local_budgets,
                "sinkBoundary": sink_boundary,
                "roundBoundary": round_boundary,
                "targetedRerun": targeted,
                "frontend": frontend,
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
