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

DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "llm_client_regression_report.json"


def _assert_equal(name: str, actual: str, expected: str, failures: list[str]) -> None:
    if actual != expected:
        failures.append(f"{name}: expected {expected!r}, got {actual!r}")


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
            "chat_unclosed_think_prefix",
            {
                "choices": [
                    {
                        "message": {
                            "content": "<think>private chain with braces { bad }\n{\"version\": 1}",
                        }
                    }
                ]
            },
            "chat_completions",
            "{\"version\": 1}",
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
