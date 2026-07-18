from __future__ import annotations

import json
import sys
from io import BytesIO
from datetime import datetime, timezone
from email.message import Message
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import llm_client  # noqa: E402
from ai_json import extract_json_object  # noqa: E402
from llm_client import LLMRequestError, extract_response_text, llm_completion, strip_reasoning_blocks, test_llm_connection  # noqa: E402
from runtime_error_safety import safe_exception_details  # noqa: E402

DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "llm_client_regression_report.json"


def _assert_equal(name: str, actual: str, expected: str, failures: list[str]) -> None:
    if actual != expected:
        failures.append(f"{name}: expected {expected!r}, got {actual!r}")


def _exception_chain_contains(error: BaseException, needle: str) -> bool:
    current: BaseException | None = error
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if needle in str(current) or needle in str(getattr(current, "provider_message", "") or ""):
            return True
        current = current.__cause__ or current.__context__
    return False


def run_regression(report_path: Path) -> dict[str, Any]:
    failures: list[str] = []
    checks: list[dict[str, Any]] = []

    cases = [
        (
            "chat_think_tag",
            {
                "choices": [
                    {
                        "message": {
                            "content": "<think>private chain {\"fake\": true}</think>\n{\"ok\": true}",
                        }
                    }
                ]
            },
            "chat_completions",
            "{\"ok\": true}",
        ),
        (
            "responses_reasoning_part",
            {
                "output": [
                    {"type": "reasoning", "content": [{"type": "text", "text": "private reasoning"}]},
                    {"type": "message", "content": [{"type": "output_text", "text": "{\"styles\": {}}"}]},
                ]
            },
            "responses",
            "{\"styles\": {}}",
        ),
        (
            "responses_output_text_think",
            {
                "output_text": "<think>private</think>\nfinal",
            },
            "responses",
            "final",
        ),
        (
            "chat_tool_call_arguments",
            {
                "choices": [
                    {
                        "message": {
                            "content": None,
                            "tool_calls": [
                                {"type": "function", "function": {"name": "return_json", "arguments": "{\"styles\": {}}"}}
                            ],
                        }
                    }
                ]
            },
            "chat_completions",
            "{\"styles\": {}}",
        ),
        (
            "responses_function_call_arguments",
            {
                "output": [
                    {"type": "reasoning", "content": [{"type": "text", "text": "private reasoning"}]},
                    {"type": "function_call", "name": "return_json", "arguments": "{\"styles\": {\"body_text\": {}}}"},
                ]
            },
            "responses",
            "{\"styles\": {\"body_text\": {}}}",
        ),
        (
            "responses_output_json_part",
            {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_json", "json": {"styles": {"body_text": {"fontSizePt": 12}}}}],
                    }
                ]
            },
            "responses",
            "{\"styles\": {\"body_text\": {\"fontSizePt\": 12}}}",
        ),
        (
            "responses_text_parts_preserve_english_spacing",
            {
                "output": [
                    {
                        "type": "message",
                        "content": [
                            {"type": "output_text", "text": "Using"},
                            {"type": "output_text", "text": "Qwen2.5-1.5B-Instruct"},
                            {"type": "output_text", "text": "as"},
                            {"type": "output_text", "text": "the base model, a LoRA adapter is"},
                            {"type": "output_text", "text": "then constructed with approach,"},
                            {"type": "output_text", "text": "500 samples employing"},
                            {"type": "output_text", "text": "4-bit QLoRA."},
                            {"type": "output_text", "text": "In addition, Key words: LoRA; QLoRA"},
                        ],
                    }
                ],
            },
            "responses",
            "Using Qwen2.5-1.5B-Instruct as the base model, a LoRA adapter is then constructed with approach, 500 samples employing 4-bit QLoRA. In addition, Key words: LoRA; QLoRA",
        ),
        (
            "chat_content_parts_preserve_english_spacing",
            {
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"type": "text", "text": "Using"},
                                {"type": "text", "text": "Qwen2.5-1.5B-Instruct"},
                                {"type": "text", "text": "as the base model."},
                            ],
                        }
                    }
                ]
            },
            "chat_completions",
            "Using Qwen2.5-1.5B-Instruct as the base model.",
        ),
        (
            "chat_analysis_and_thought_tags_are_stripped",
            {
                "choices": [
                    {
                        "message": {
                            "content": (
                                "<analysis>private analysis</analysis>"
                                "<thought>private thought</thought>安全正文"
                            )
                        }
                    }
                ]
            },
            "chat_completions",
            "安全正文",
        ),
        (
            "chat_content_part_kind_object_thinking_are_ignored",
            {
                "choices": [
                    {
                        "message": {
                            "content": [
                                {"kind": "analysis_text", "text": "private analysis"},
                                {
                                    "type": "text",
                                    "object": "reasoning.content_part",
                                    "text": "private reasoning",
                                },
                                {"type": "text", "text": "安全正文"},
                            ]
                        }
                    }
                ]
            },
            "chat_completions",
            "安全正文",
        ),
    ]

    for name, payload, api_type, expected in cases:
        actual = extract_response_text(payload, json.dumps(payload), api_type)
        checks.append({"name": name, "actual": actual, "expected": expected})
        _assert_equal(name, actual, expected, failures)

    stripped = strip_reasoning_blocks("<|begin_of_thought|>secret<|end_of_thought|>\nanswer")
    checks.append({"name": "thought_tokens", "actual": stripped, "expected": "answer"})
    _assert_equal("thought_tokens", stripped, "answer", failures)

    json_cases = [
        (
            "ai_json_markdown_wrapped",
            "下面是结构化结果：\n```json\n{\"formatRules\":{\"styles\":{\"body_text\":{\"fontSizePt\":\"小四\"}}}}\n```",
            12.0,
        ),
        (
            "ai_json_array_styles",
            "[{\"role\":\"normal_text\",\"fontSize\":\"小四\"}]",
            12.0,
        ),
        (
            "ai_json_tool_arguments_wrapper",
            "{\"arguments\":\"{\\\"styles\\\":{\\\"body_text\\\":{\\\"fontSizePt\\\":\\\"小四\\\"}}}\"}",
            12.0,
        ),
        (
            "ai_json_comment_trailing_comma",
            "```json\n{\n// comment from model\n\"styles\":{\"body_text\":{\"fontSizePt\":\"小四\",},},\n}\n```",
            12.0,
        ),
    ]
    for name, raw_text, expected_font_size in json_cases:
        parsed = extract_json_object(raw_text)
        styles = parsed.get("styles")
        if isinstance(styles, list):
            actual_font_size = styles[0].get("fontSize") if styles and isinstance(styles[0], dict) else None
        elif isinstance(styles, dict):
            body = styles.get("body_text")
            actual_font_size = body.get("fontSizePt") if isinstance(body, dict) else None
        else:
            actual_font_size = None
        checks.append({"name": name, "actual": actual_font_size, "expected": "小四"})
        _assert_equal(name, str(actual_font_size), "小四", failures)

    class FakeResponse:
        status = 200

        def __init__(self, payload: dict[str, Any]) -> None:
            self.payload = payload

        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def read(self) -> bytes:
            return json.dumps(self.payload).encode("utf-8")

    original_urlopen = llm_client.request.urlopen
    calls: list[str] = []
    llm_client._RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.clear()

    def fake_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        calls.append(str(http_request.full_url))
        if len(calls) == 1:
            error_payload = {
                "error": {
                    "code": "authentication_failed",
                    "message": "open /app/config.json: permission denied",
                }
            }
            raise HTTPError(
                str(http_request.full_url),
                401,
                "Unauthorized",
                hdrs=None,
                fp=BytesIO(json.dumps(error_payload).encode("utf-8")),
            )
        return FakeResponse({"choices": [{"message": {"content": "fallback ok"}}]})

    try:
        llm_client.request.urlopen = fake_urlopen
        fallback_text = llm_completion(
            "ping",
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="responses",
            max_retries=0,
            stream=False,
        )
        checks.append({"name": "responses_config_error_falls_back_to_chat", "calls": calls, "actual": fallback_text})
        _assert_equal("responses_config_error_falls_back_to_chat_text", fallback_text, "fallback ok", failures)
        _assert_equal("responses_config_error_first_endpoint", calls[0], "https://example.com/v1/responses", failures)
        _assert_equal("responses_config_error_second_endpoint", calls[1], "https://example.com/v1/chat/completions", failures)

        cached_calls_start = len(calls)
        cached_text = llm_completion(
            "ping again",
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="responses",
            max_retries=0,
            stream=False,
        )
        cached_calls = calls[cached_calls_start:]
        checks.append({"name": "responses_fallback_cache_uses_chat_first", "calls": cached_calls, "actual": cached_text})
        _assert_equal("responses_fallback_cache_text", cached_text, "fallback ok", failures)
        _assert_equal("responses_fallback_cache_endpoint_count", str(len(cached_calls)), "1", failures)
        _assert_equal("responses_fallback_cache_endpoint", cached_calls[0], "https://example.com/v1/chat/completions", failures)
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client._RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.clear()

    sleep_calls: list[float] = []
    calls = []

    retry_after_headers = Message()
    retry_after_headers["Retry-After"] = "7"

    def fake_rate_limit_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        calls.append(str(http_request.full_url))
        raise HTTPError(
            str(http_request.full_url),
            429,
            "Too Many Requests",
            hdrs=retry_after_headers,
            fp=BytesIO(b'{"error":{"message":"slow down"}}'),
        )

    original_sleep = llm_client.time.sleep
    try:
        llm_client.request.urlopen = fake_rate_limit_urlopen
        llm_client.time.sleep = lambda value: sleep_calls.append(float(value))
        try:
            llm_completion(
                "ping",
                model="deepseek-v4-pro",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                max_retries=1,
                stream=False,
            )
        except LLMRequestError as exc:
            checks.append({"name": "rate_limit_error_is_structured", "error": exc.to_dict(), "sleepCalls": sleep_calls})
            _assert_equal("rate_limit_category", exc.category, "rate_limit", failures)
            _assert_equal("rate_limit_status", str(exc.status_code), "429", failures)
            _assert_equal("rate_limit_attempts", str(exc.attempts), "2", failures)
            _assert_equal("rate_limit_retryable", str(exc.retryable), "True", failures)
            if not sleep_calls or sleep_calls[0] < 7:
                failures.append(f"rate_limit should honor Retry-After sleep, got {sleep_calls}")
            if not exc.cooldown_seconds or exc.cooldown_seconds < 7:
                failures.append(f"rate_limit should expose cooldown seconds, got {exc.cooldown_seconds}")
        else:
            failures.append("rate_limit request should raise LLMRequestError")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.sleep = original_sleep

    calls = []
    sleep_calls = []
    retry_events: list[dict[str, object]] = []
    original_sleep = llm_client.time.sleep
    original_uniform = llm_client.random.uniform

    def fake_retryable_server_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        calls.append(str(http_request.full_url))
        if len(calls) == 1:
            raise HTTPError(
                str(http_request.full_url),
                500,
                "Internal Server Error",
                hdrs=None,
                fp=BytesIO(b'{"error":{"message":"empty upstream response"}}'),
            )
        return FakeResponse({"choices": [{"message": {"content": "retry ok"}}]})

    try:
        llm_client.request.urlopen = fake_retryable_server_urlopen
        llm_client.time.sleep = lambda value: sleep_calls.append(float(value))
        llm_client.random.uniform = lambda low, high: high
        retry_text = llm_completion(
            "ping",
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="chat_completions",
            max_retries=1,
            retry_backoff_seconds=2,
            retry_callback=retry_events.append,
            stream=False,
        )
        checks.append({"name": "server_retry_uses_jittered_backoff", "calls": calls, "sleepCalls": sleep_calls, "retryEvents": retry_events, "actual": retry_text})
        _assert_equal("server_retry_text", retry_text, "retry ok", failures)
        _assert_equal("server_retry_call_count", str(len(calls)), "2", failures)
        _assert_equal("server_retry_event_count", str(len(retry_events)), "1", failures)
        if retry_events and retry_events[0].get("statusCode") != 500:
            failures.append(f"server retry event should include statusCode, got {retry_events}")
        if not sleep_calls or sleep_calls[0] <= 2:
            failures.append(f"server retry should add jitter above base backoff, got {sleep_calls}")
        if sleep_calls and sleep_calls[0] > 2.7:
            failures.append(f"server retry jitter should stay bounded, got {sleep_calls}")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.sleep = original_sleep
        llm_client.random.uniform = original_uniform

    calls = []
    sleep_calls = []
    original_sleep = llm_client.time.sleep
    original_uniform = llm_client.random.uniform

    def fake_many_502_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        calls.append(str(http_request.full_url))
        if len(calls) <= 5:
            raise HTTPError(
                str(http_request.full_url),
                502,
                "Bad Gateway",
                hdrs=None,
                fp=BytesIO(b'{"error":{"message":"upstream empty"}}'),
            )
        return FakeResponse({"choices": [{"message": {"content": "late retry ok"}}]})

    try:
        llm_client.request.urlopen = fake_many_502_urlopen
        llm_client.time.sleep = lambda value: sleep_calls.append(float(value))
        llm_client.random.uniform = lambda low, high: low
        late_retry_text = llm_completion(
            "ping",
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="chat_completions",
            max_retries=6,
            retry_backoff_seconds=5,
            stream=False,
        )
        checks.append({"name": "server_retry_recovers_after_repeated_502", "calls": calls, "sleepCalls": sleep_calls, "actual": late_retry_text})
        _assert_equal("server_late_retry_text", late_retry_text, "late retry ok", failures)
        _assert_equal("server_late_retry_call_count", str(len(calls)), "6", failures)
        if sleep_calls[:5] != [5.0, 10.0, 20.0, 40.0, 60.0]:
            failures.append(f"server late retry should use bounded exponential backoff, got {sleep_calls}")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.sleep = original_sleep
        llm_client.random.uniform = original_uniform

    def fake_timeout_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        raise URLError(TimeoutError("timed out"))

    try:
        llm_client.request.urlopen = fake_timeout_urlopen
        llm_client.time.sleep = lambda value: None
        try:
            llm_completion(
                "ping",
                model="deepseek-v4-pro",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                max_retries=0,
                stream=False,
            )
        except LLMRequestError as exc:
            checks.append({"name": "timeout_error_is_structured", "error": exc.to_dict()})
            _assert_equal("timeout_category", exc.category, "timeout", failures)
            _assert_equal("timeout_retryable", str(exc.retryable), "True", failures)
        else:
            failures.append("timeout request should raise LLMRequestError")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.sleep = original_sleep


    calls = []
    llm_client._RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.clear()

    def fake_connection_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        calls.append(str(http_request.full_url))
        if len(calls) == 1:
            raise HTTPError(
                str(http_request.full_url),
                405,
                "Method Not Allowed",
                hdrs=None,
                fp=BytesIO(b'{"error":{"message":"responses endpoint unsupported"}}'),
            )
        return FakeResponse({"choices": [{"message": {"content": "pong"}}]})

    try:
        llm_client.request.urlopen = fake_connection_urlopen
        connection = test_llm_connection(
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="responses",
            max_retries=0,
        )
        checks.append({"name": "test_connection_reports_fallback_endpoint", "calls": calls, "connection": connection})
        _assert_equal("test_connection_fallback_api_type", str(connection.get("apiType")), "chat_completions", failures)
        _assert_equal("test_connection_fallback_endpoint", str(connection.get("endpoint")), "https://example.com/v1/chat/completions", failures)
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client._RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.clear()

    payload = llm_client.build_payload("hi", model="m", temperature=0.2, api_type="chat_completions", stream=True)
    checks.append({"name": "build_payload_stream_chat", "payload": payload})
    _assert_equal("build_payload_stream_flag", str(payload.get("stream")), "True", failures)
    if "max_tokens" in payload or "max_output_tokens" in payload:
        failures.append("build_payload must never set max_tokens / max_output_tokens")

    class StreamFakeResponse:
        status = 200

        def __init__(self, chunks: list[str | bytes], *, fail_after: BaseException | None = None) -> None:
            self._lines = [chunk.encode("utf-8") if isinstance(chunk, str) else chunk for chunk in chunks]
            self._index = 0
            self._fail_after = fail_after

        def __enter__(self) -> "StreamFakeResponse":
            return self

        def __exit__(self, *_: object) -> None:
            return None

        def readline(self) -> bytes:
            if self._index >= len(self._lines):
                if self._fail_after is not None:
                    failure = self._fail_after
                    self._fail_after = None
                    raise failure
                return b""
            line = self._lines[self._index]
            self._index += 1
            return line

        def read(self) -> bytes:
            return b"".join(self._lines)

    stream_calls: list[str] = []
    stream_events: list[dict[str, object]] = []

    def fake_stream_urlopen(http_request: Any, timeout: int = 0) -> StreamFakeResponse:
        stream_calls.append(str(http_request.full_url))
        body = http_request.data.decode("utf-8") if isinstance(http_request.data, bytes) else str(http_request.data)
        if '"stream": true' not in body:
            raise AssertionError("stream completion request body must include stream=true")
        if "max_tokens" in body or "max_output_tokens" in body:
            raise AssertionError("stream completion request must not include max token caps")
        return StreamFakeResponse(
            [
                "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"流式\"}}]}\n\n",
                "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"输出\"}}]}\n\n",
                "data: [DONE]\n\n",
            ]
        )

    try:
        llm_client.request.urlopen = fake_stream_urlopen
        stream_text = llm_completion(
            "rewrite this",
            model="fixture/streaming-model",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="chat_completions",
            max_retries=0,
            stream=True,
            stream_callback=stream_events.append,
        )
        checks.append({"name": "stream_completion_aggregates_deltas", "text": stream_text, "events": stream_events, "calls": stream_calls})
        _assert_equal("stream_completion_text", stream_text, "流式输出", failures)
        _assert_equal("stream_completion_endpoint", stream_calls[0], "https://example.com/v1/chat/completions", failures)
        if any(any(key in event for key in ("delta", "text", "preview", "endpoint")) for event in stream_events):
            failures.append(f"stream callback exposed provider text fields: {stream_events}")
        if not stream_events or stream_events[-1].get("done") is not True:
            failures.append(f"stream callback did not emit safe completion metadata: {stream_events}")
        if stream_events and stream_events[-1].get("finalTextChars") != len("流式输出"):
            failures.append(f"stream callback finalTextChars mismatch: {stream_events}")
    finally:
        llm_client.request.urlopen = original_urlopen

    def run_stream_fixture(
        chunks: list[str | bytes],
        *,
        api_type: str = "chat_completions",
        events: list[dict[str, object]] | None = None,
        fail_after: BaseException | None = None,
        timeout: float = 120,
        max_retries: int = 0,
        retry_backoff_seconds: float = 2.0,
    ) -> str:
        captured_events = events if events is not None else []

        def fake_urlopen(_http_request: Any, timeout: int = 0) -> StreamFakeResponse:
            return StreamFakeResponse(chunks, fail_after=fail_after)

        llm_client.request.urlopen = fake_urlopen
        try:
            return llm_completion(
                "stream fixture",
                model="fixture/model",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type=api_type,
                timeout=timeout,
                max_retries=max_retries,
                retry_backoff_seconds=retry_backoff_seconds,
                stream=True,
                stream_callback=captured_events.append,
            )
        finally:
            llm_client.request.urlopen = original_urlopen

    private_markers = {
        "PRIVATE_REASONING_FIELD",
        "PRIVATE_TAG_TRACE",
        "PRIVATE_OTHER_CHOICE",
        "PRIVATE_GENERIC_REASONING",
        "PRIVATE_API_REASONING",
        "PRIVATE_PLAIN_FRAME",
        "PRIVATE_UNMATCHED_TRACE",
        "PRIVATE_CHAT_EVENT_REASONING",
        "PRIVATE_CHAT_PAYLOAD_ANALYSIS",
        "PRIVATE_CHAT_CHOICE_THOUGHT",
        "PRIVATE_CHAT_DELTA_REASONING",
        "PRIVATE_CHAT_MESSAGE_THINKING",
        "PRIVATE_CHAT_PART_KIND",
        "PRIVATE_CHAT_PART_OBJECT",
        "PRIVATE_ANALYSIS_TAG_TRACE",
        "PRIVATE_THOUGHT_TAG_TRACE",
    }

    # Chat SSE: choice zero only, reasoning fields ignored, balanced reasoning
    # tags removed after full aggregation, and UTF-8 may split across reads.
    chat_frames = [
        ": keepalive\n\n",
        "\n",
        "event: response.reasoning.delta\ndata: "
        + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "PRIVATE_CHAT_EVENT_REASONING"}}]},
            ensure_ascii=False,
        )
        + "\n\n",
        "data: "
        + json.dumps(
            {
                "object": "analysis_text.delta",
                "choices": [{"index": 0, "delta": {"content": "PRIVATE_CHAT_PAYLOAD_ANALYSIS"}}],
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
                        "delta": {"content": "PRIVATE_CHAT_CHOICE_THOUGHT"},
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
                            "content": "PRIVATE_CHAT_DELTA_REASONING",
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
                            "type": "thinking.message",
                            "content": "PRIVATE_CHAT_MESSAGE_THINKING",
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
                        "delta": {
                            "content": [
                                {"kind": "analysis_text", "text": "PRIVATE_CHAT_PART_KIND"},
                                {
                                    "type": "text",
                                    "object": "reasoning.content_part",
                                    "text": "PRIVATE_CHAT_PART_OBJECT",
                                },
                            ]
                        },
                    }
                ]
            },
            ensure_ascii=False,
        )
        + "\n\n",
        "data: " + json.dumps(
            {
                "choices": [
                    {"index": 1, "delta": {"content": "PRIVATE_OTHER_CHOICE"}},
                    {"index": 0, "delta": {"reasoning_content": "PRIVATE_REASONING_FIELD"}},
                ]
            },
            ensure_ascii=False,
        ) + "\n\n",
        "data: " + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "<think>PRIVATE_TAG_TRACE"}}]},
            ensure_ascii=False,
        ) + "\n\n",
        "data: " + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "</think>流式"}}]},
            ensure_ascii=False,
        ) + "\n\n",
        "data: " + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "<analysis>PRIVATE_ANALYSIS_TAG_TRACE</analysis>"}}]},
            ensure_ascii=False,
        ) + "\n\n",
        "data: " + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "<thought>PRIVATE_THOUGHT_TAG_TRACE</thought>"}}]},
            ensure_ascii=False,
        ) + "\n\n",
        "data: " + json.dumps(
            {"choices": [{"index": 0, "delta": {"content": "输出"}}]},
            ensure_ascii=False,
        ) + "\n\n",
        "data: [DONE]\n\n",
    ]
    chat_wire = "".join(chat_frames).encode("utf-8")
    split_at = chat_wire.index("流".encode("utf-8")) + 1
    chat_events: list[dict[str, object]] = []
    chat_text = run_stream_fixture([chat_wire[:split_at], chat_wire[split_at:]], events=chat_events)
    checks.append({"name": "chat_stream_private_fields_are_isolated", "actual": chat_text, "events": chat_events})
    _assert_equal("chat_stream_private_fields_are_isolated", chat_text, "流式输出", failures)
    callback_dump = json.dumps(chat_events, ensure_ascii=False)
    if any(marker in callback_dump for marker in private_markers):
        failures.append("chat stream callback leaked private reasoning or non-primary choice text")
    if any(any(key in event for key in ("delta", "text", "preview", "endpoint")) for event in chat_events):
        failures.append(f"chat stream callback was not metadata-only: {chat_events}")

    # Responses SSE: reasoning event families and untyped generic deltas are
    # ignored; only explicit output_text events are aggregated.
    responses_frames = [
        "event: response.reasoning.delta\ndata: "
        + json.dumps({"delta": "PRIVATE_GENERIC_REASONING"}, ensure_ascii=False)
        + "\n\n",
        "event: response.content_part.delta\ndata: "
        + json.dumps({"delta": {"type": "reasoning_content", "text": "PRIVATE_GENERIC_REASONING"}}, ensure_ascii=False)
        + "\n\n",
        "event: response.content_part.delta\ndata: "
        + json.dumps({"delta": {"content": "PRIVATE_GENERIC_REASONING"}}, ensure_ascii=False)
        + "\n\n",
        "event: response.output_text.delta\ndata: "
        + json.dumps({"delta": "最终"}, ensure_ascii=False)
        + "\n\n",
        "event: response.output_item.delta\ndata: "
        + json.dumps({"delta": {"type": "output_text", "text": "答案"}}, ensure_ascii=False)
        + "\n\n",
        "data: [DONE]\n\n",
    ]
    responses_events: list[dict[str, object]] = []
    responses_text = run_stream_fixture(responses_frames, api_type="responses", events=responses_events)
    checks.append({"name": "responses_stream_final_fields_only", "actual": responses_text, "events": responses_events})
    _assert_equal("responses_stream_final_fields_only", responses_text, "最终答案", failures)
    if "PRIVATE_GENERIC_REASONING" in json.dumps(responses_events, ensure_ascii=False):
        failures.append("responses stream callback leaked reasoning content")

    # A non-JSON data frame must fail closed and must not trigger an implicit
    # non-stream request. Non-stream operation remains an explicit stream=False choice.
    plain_calls: list[dict[str, Any]] = []

    def fake_plain_urlopen(http_request: Any, timeout: int = 0) -> StreamFakeResponse:
        body = json.loads(http_request.data.decode("utf-8"))
        plain_calls.append(body)
        return StreamFakeResponse(["data: PRIVATE_PLAIN_FRAME\n\n"])

    try:
        llm_client.request.urlopen = fake_plain_urlopen
        try:
            llm_completion(
                "plain frame",
                model="fixture/model",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                max_retries=0,
                stream=True,
            )
        except LLMRequestError as exc:
            checks.append({"name": "plain_sse_fails_closed", "category": exc.category, "calls": len(plain_calls)})
            _assert_equal("plain_sse_category", exc.category, "response_parse", failures)
            if "PRIVATE_PLAIN_FRAME" in json.dumps(exc.to_dict(), ensure_ascii=False):
                failures.append("plain SSE content leaked into structured error")
        else:
            failures.append("plain SSE frame should fail closed")
    finally:
        llm_client.request.urlopen = original_urlopen
    if len(plain_calls) != 1 or plain_calls[0].get("stream") is not True:
        failures.append(f"stream parse failure implicitly changed transport mode: {plain_calls}")

    # Stream API errors keep status/category while dropping all reasoning fields.
    api_error_events: list[dict[str, object]] = []
    try:
        run_stream_fixture(
            [
                "event: error\ndata: "
                + json.dumps(
                    {
                        "error": {
                            "code": "invalid_request",
                            "message": "safe provider message",
                            "reasoning": "PRIVATE_API_REASONING",
                        }
                    },
                    ensure_ascii=False,
                )
                + "\n\n"
            ],
            events=api_error_events,
        )
    except LLMRequestError as exc:
        serialized_error = json.dumps(exc.to_dict(), ensure_ascii=False)
        checks.append({"name": "stream_api_error_is_sanitized", "error": exc.to_dict(), "events": api_error_events})
        if "PRIVATE_API_REASONING" in serialized_error or "PRIVATE_API_REASONING" in json.dumps(api_error_events):
            failures.append("stream API error leaked reasoning content")
    else:
        failures.append("stream API error frame should raise LLMRequestError")

    # Unmatched reasoning markers are never guessed away or published.
    unmatched_events: list[dict[str, object]] = []
    try:
        run_stream_fixture(
            [
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": "<think>PRIVATE_UNMATCHED_TRACE"}}]},
                    ensure_ascii=False,
                )
                + "\n\n",
                "data: [DONE]\n\n",
            ],
            events=unmatched_events,
        )
    except LLMRequestError as exc:
        _assert_equal("unmatched_reasoning_category", exc.category, "response_parse", failures)
        if "PRIVATE_UNMATCHED_TRACE" in json.dumps(exc.to_dict(), ensure_ascii=False):
            failures.append("unmatched reasoning body leaked into error")
        checks.append({"name": "unmatched_reasoning_fails_closed", "error": exc.to_dict(), "events": unmatched_events})
    else:
        failures.append("unmatched reasoning marker should fail closed")

    mismatched_marker = "PRIVATE_MISMATCHED_ANALYSIS_THOUGHT"
    mismatched_events: list[dict[str, object]] = []
    try:
        run_stream_fixture(
            [
                "data: "
                + json.dumps(
                    {
                        "choices": [
                            {
                                "index": 0,
                                "delta": {
                                    "content": f"<analysis>{mismatched_marker}</thought>最终正文"
                                },
                            }
                        ]
                    },
                    ensure_ascii=False,
                )
                + "\n\n",
                "data: [DONE]\n\n",
            ],
            events=mismatched_events,
        )
    except LLMRequestError as exc:
        serialized = json.dumps({"error": exc.to_dict(), "events": mismatched_events}, ensure_ascii=False)
        _assert_equal("mismatched_analysis_thought_category", exc.category, "response_parse", failures)
        if mismatched_marker in serialized:
            failures.append("mismatched analysis/thought trace leaked into an error or callback")
        checks.append(
            {
                "name": "mismatched_analysis_thought_fails_closed",
                "error": exc.to_dict(),
                "events": mismatched_events,
            }
        )
    else:
        failures.append("mismatched analysis/thought tags should fail closed")

    # Explicit non-stream mode is still supported, but is never selected by a
    # stream parser error or provider/model special case.
    nonstream_bodies: list[dict[str, Any]] = []

    def fake_nonstream_urlopen(http_request: Any, timeout: int = 0) -> FakeResponse:
        nonstream_bodies.append(json.loads(http_request.data.decode("utf-8")))
        return FakeResponse({"choices": [{"message": {"content": "显式非流"}}]})

    try:
        llm_client.request.urlopen = fake_nonstream_urlopen
        nonstream_text = llm_completion(
            "explicit nonstream",
            model="fixture/model",
            api_key="redacted",
            base_url="https://example.com/v1",
            api_type="chat_completions",
            max_retries=0,
            stream=False,
        )
    finally:
        llm_client.request.urlopen = original_urlopen
    _assert_equal("explicit_nonstream_text", nonstream_text, "显式非流", failures)
    if not nonstream_bodies or "stream" in nonstream_bodies[0]:
        failures.append(f"explicit non-stream payload unexpectedly enabled streaming: {nonstream_bodies}")
    checks.append({"name": "nonstream_requires_explicit_flag", "actual": nonstream_text})

    for case_name, response_payload, private_marker in (
        (
            "nonstream_unmatched_reasoning_fails_closed",
            {"choices": [{"message": {"content": "<think>PRIVATE_NONSTREAM_UNMATCHED"}}]},
            "PRIVATE_NONSTREAM_UNMATCHED",
        ),
        (
            "nonstream_mismatched_analysis_thought_fails_closed",
            {
                "choices": [
                    {
                        "message": {
                            "content": "<analysis>PRIVATE_NONSTREAM_MISMATCHED</thought>安全正文"
                        }
                    }
                ]
            },
            "PRIVATE_NONSTREAM_MISMATCHED",
        ),
        (
            "nonstream_typed_thinking_message_fails_closed",
            {
                "choices": [
                    {
                        "message": {
                            "kind": "analysis_text",
                            "content": "PRIVATE_NONSTREAM_TYPED_THINKING",
                        }
                    }
                ]
            },
            "PRIVATE_NONSTREAM_TYPED_THINKING",
        ),
        (
            "nonstream_reasoning_only_fails_closed",
            {
                "choices": [
                    {"message": {"content": None, "reasoning_content": "PRIVATE_NONSTREAM_REASONING_ONLY"}}
                ]
            },
            "PRIVATE_NONSTREAM_REASONING_ONLY",
        ),
    ):
        def fake_private_nonstream(_http_request: Any, timeout: int = 0, payload: dict[str, Any] = response_payload) -> FakeResponse:
            return FakeResponse(payload)

        try:
            llm_client.request.urlopen = fake_private_nonstream
            try:
                llm_completion(
                    "private nonstream fixture",
                    model="fixture/model",
                    api_key="redacted",
                    base_url="https://example.com/v1",
                    api_type="chat_completions",
                    max_retries=0,
                    stream=False,
                )
            except LLMRequestError as exc:
                serialized = json.dumps(exc.to_dict(), ensure_ascii=False)
                checks.append({"name": case_name, "error": exc.to_dict()})
                _assert_equal(f"{case_name}_category", exc.category, "response_parse", failures)
                if private_marker in serialized:
                    failures.append(f"{case_name} leaked non-stream reasoning content")
            else:
                failures.append(f"{case_name} should raise LLMRequestError")
        finally:
            llm_client.request.urlopen = original_urlopen

    # Stream transport failures retain structured categories without exposing
    # HTTP reasoning fields, and no network timeout is mistaken for a parse error.
    def fake_stream_http_error(http_request: Any, timeout: int = 0) -> StreamFakeResponse:
        raise HTTPError(
            str(http_request.full_url),
            503,
            "Service Unavailable",
            hdrs=None,
            fp=BytesIO(
                json.dumps(
                    {"error": {"message": "temporary upstream failure", "analysis": "PRIVATE_HTTP_REASONING"}}
                ).encode("utf-8")
            ),
        )

    try:
        llm_client.request.urlopen = fake_stream_http_error
        try:
            llm_completion(
                "stream http failure",
                model="fixture/model",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                max_retries=0,
                stream=True,
            )
        except LLMRequestError as exc:
            checks.append({"name": "stream_http_error_is_sanitized", "error": exc.to_dict()})
            _assert_equal("stream_http_error_category", exc.category, "server", failures)
            if "PRIVATE_HTTP_REASONING" in json.dumps(exc.to_dict(), ensure_ascii=False):
                failures.append("stream HTTP error leaked analysis field")
        else:
            failures.append("stream HTTP 503 should raise LLMRequestError")
    finally:
        llm_client.request.urlopen = original_urlopen

    def fake_stream_timeout(_http_request: Any, timeout: int = 0) -> StreamFakeResponse:
        raise URLError(TimeoutError("PRIVATE_TIMEOUT_DETAIL"))

    try:
        llm_client.request.urlopen = fake_stream_timeout
        try:
            llm_completion(
                "stream timeout",
                model="fixture/model",
                api_key="redacted",
                base_url="https://example.com/v1",
                api_type="chat_completions",
                max_retries=0,
                stream=True,
            )
        except LLMRequestError as exc:
            checks.append({"name": "stream_timeout_is_structured", "error": exc.to_dict()})
            _assert_equal("stream_timeout_category", exc.category, "timeout", failures)
            if "PRIVATE_TIMEOUT_DETAIL" in json.dumps(exc.to_dict(), ensure_ascii=False):
                failures.append("stream timeout exposed raw transport detail")
        else:
            failures.append("stream timeout should raise LLMRequestError")
    finally:
        llm_client.request.urlopen = original_urlopen

    # Provider-independent local stream budgets must fail before any triggering
    # body reaches exceptions, structured details, or callbacks.
    original_stream_limits = (
        llm_client.MAX_STREAM_SSE_EVENTS,
        llm_client.MAX_STREAM_WIRE_BYTES,
        llm_client.MAX_STREAM_FINAL_CHARS,
    )
    forbidden_callback_keys = {
        "delta",
        "text",
        "preview",
        "streamPreview",
        "endpoint",
        "providerMessage",
        "message",
    }

    def assert_stream_budget_failure(
        case_name: str,
        marker: str,
        frames: list[str],
        expected_category: str = "response_limit",
    ) -> None:
        budget_events: list[dict[str, object]] = []
        try:
            run_stream_fixture(frames, events=budget_events)
        except LLMRequestError as exc:
            public_dump = json.dumps(
                {
                    "exception": exc.to_dict(),
                    "details": safe_exception_details(exc),
                    "callbacks": budget_events,
                },
                ensure_ascii=False,
            )
            _assert_equal(f"{case_name}_category", exc.category, expected_category, failures)
            if marker in public_dump:
                failures.append(f"{case_name} leaked its triggering provider body")
            if _exception_chain_contains(exc, marker):
                failures.append(f"{case_name} retained its triggering body in the exception chain")
            if any(forbidden_callback_keys.intersection(event) for event in budget_events):
                failures.append(f"{case_name} callback was not metadata-only: {budget_events}")
            checks.append(
                {
                    "name": case_name,
                    "error": exc.to_dict(),
                    "details": safe_exception_details(exc),
                    "events": budget_events,
                }
            )
        else:
            failures.append(f"{case_name} should fail closed")

    try:
        event_limit_marker = "PRIVATE_LOCAL_EVENT_LIMIT_BODY"
        llm_client.MAX_STREAM_SSE_EVENTS = 1
        assert_stream_budget_failure(
            "stream_sse_event_limit",
            event_limit_marker,
            [
                "data: "
                + json.dumps({"choices": [{"index": 0, "delta": {"content": "安全"}}]}, ensure_ascii=False)
                + "\n\n",
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": event_limit_marker}}]},
                    ensure_ascii=False,
                )
                + "\n\n",
            ],
        )

        llm_client.MAX_STREAM_SSE_EVENTS = original_stream_limits[0]
        wire_limit_marker = "PRIVATE_LOCAL_WIRE_LIMIT_BODY"
        llm_client.MAX_STREAM_WIRE_BYTES = 24
        assert_stream_budget_failure(
            "stream_wire_byte_limit",
            wire_limit_marker,
            [
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": wire_limit_marker}}]},
                    ensure_ascii=False,
                )
                + "\n\n"
            ],
        )

        llm_client.MAX_STREAM_WIRE_BYTES = original_stream_limits[1]
        final_limit_marker = "PRIVATE_LOCAL_FINAL_LIMIT_BODY"
        llm_client.MAX_STREAM_FINAL_CHARS = 4
        assert_stream_budget_failure(
            "stream_final_char_limit",
            final_limit_marker,
            [
                "data: "
                + json.dumps(
                    {"choices": [{"index": 0, "delta": {"content": final_limit_marker}}]},
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
        ) = original_stream_limits

    deadline_marker = "PRIVATE_LOCAL_DEADLINE_BODY"
    deadline_events: list[dict[str, object]] = []
    original_monotonic = llm_client.time.monotonic
    original_sleep = llm_client.time.sleep
    original_retry_delay = llm_client._calculate_retry_delay
    clock = {"now": 0.0}
    synthetic_sleeps: list[float] = []
    deadline_open_calls = 0

    def fake_monotonic() -> float:
        return clock["now"]

    def fake_sleep(seconds: float) -> None:
        normalized = max(0.0, float(seconds))
        synthetic_sleeps.append(normalized)
        clock["now"] += normalized

    def fixed_retry_delay(
        attempt: int,
        _retry_backoff_seconds: float,
        _retry_after_seconds: float | None = None,
    ) -> float:
        return 0.4 if attempt == 1 else 0.8

    def deadline_urlopen(_request: Any, timeout: float = 0) -> StreamFakeResponse:
        nonlocal deadline_open_calls
        del timeout
        deadline_open_calls += 1
        return StreamFakeResponse(
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

    llm_client.request.urlopen = deadline_urlopen
    llm_client.time.monotonic = fake_monotonic
    llm_client.time.sleep = fake_sleep
    llm_client._calculate_retry_delay = fixed_retry_delay
    try:
        try:
            llm_completion(
                "deadline/backoff fixture",
                model="fixture/model",
                api_key="redacted",
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
            _assert_equal("stream_total_deadline_category", exc.category, "timeout", failures)
            if deadline_marker in public_dump:
                failures.append("stream total deadline leaked its provider body")
            if _exception_chain_contains(exc, deadline_marker):
                failures.append("stream total deadline retained provider body in its exception chain")
            if synthetic_sleeps != [0.4] or deadline_open_calls != 2 or clock["now"] >= 1.0:
                failures.append(
                    "stream total deadline did not include retry/backoff "
                    f"(sleeps={synthetic_sleeps}, calls={deadline_open_calls}, clock={clock['now']})"
                )
            if any(forbidden_callback_keys.intersection(event) for event in deadline_events):
                failures.append(f"stream deadline callback was not metadata-only: {deadline_events}")
            checks.append(
                {
                    "name": "stream_total_deadline_includes_retry_backoff",
                    "error": exc.to_dict(),
                    "details": safe_exception_details(exc),
                    "events": deadline_events,
                    "syntheticSleeps": synthetic_sleeps,
                    "openCalls": deadline_open_calls,
                }
            )
        else:
            failures.append("stream total deadline should bound retry/backoff")
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client.time.monotonic = original_monotonic
        llm_client.time.sleep = original_sleep
        llm_client._calculate_retry_delay = original_retry_delay

    # KeyboardInterrupt is an interruption signal, not a provider failure; it
    # must propagate immediately while callback data remains metadata-only.
    interrupt_events: list[dict[str, object]] = []
    try:
        run_stream_fixture(
            [
                "data: "
                + json.dumps({"choices": [{"index": 0, "delta": {"reasoning_content": "PRIVATE_REASONING_FIELD"}}]})
                + "\n\n"
            ],
            events=interrupt_events,
            fail_after=KeyboardInterrupt(),
        )
    except KeyboardInterrupt:
        checks.append({"name": "stream_interrupt_propagates", "events": interrupt_events})
    else:
        failures.append("KeyboardInterrupt during SSE consumption should propagate")
    if any(marker in json.dumps(interrupt_events, ensure_ascii=False) for marker in private_markers):
        failures.append("stream interruption callback leaked reasoning content")

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "checks": checks,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = run_regression(DEFAULT_REPORT_PATH)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
