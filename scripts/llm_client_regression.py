from __future__ import annotations

import json
import sys
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import llm_client  # noqa: E402
from llm_client import extract_response_text, llm_completion, strip_reasoning_blocks, test_llm_connection  # noqa: E402

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
    ]

    for name, payload, api_type, expected in cases:
        actual = extract_response_text(payload, json.dumps(payload), api_type)
        checks.append({"name": name, "actual": actual, "expected": expected})
        _assert_equal(name, actual, expected, failures)

    stripped = strip_reasoning_blocks("<|begin_of_thought|>secret<|end_of_thought|>\nanswer")
    checks.append({"name": "thought_tokens", "actual": stripped, "expected": "answer"})
    _assert_equal("thought_tokens", stripped, "answer", failures)

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
            base_url="http://provider.example/v1",
            api_type="responses",
            max_retries=0,
        )
        checks.append({"name": "responses_config_error_falls_back_to_chat", "calls": calls, "actual": fallback_text})
        _assert_equal("responses_config_error_falls_back_to_chat_text", fallback_text, "fallback ok", failures)
        _assert_equal("responses_config_error_first_endpoint", calls[0], "http://provider.example/v1/responses", failures)
        _assert_equal("responses_config_error_second_endpoint", calls[1], "http://provider.example/v1/chat/completions", failures)

        cached_calls_start = len(calls)
        cached_text = llm_completion(
            "ping again",
            model="deepseek-v4-pro",
            api_key="redacted",
            base_url="http://provider.example/v1",
            api_type="responses",
            max_retries=0,
        )
        cached_calls = calls[cached_calls_start:]
        checks.append({"name": "responses_fallback_cache_uses_chat_first", "calls": cached_calls, "actual": cached_text})
        _assert_equal("responses_fallback_cache_text", cached_text, "fallback ok", failures)
        _assert_equal("responses_fallback_cache_endpoint_count", str(len(cached_calls)), "1", failures)
        _assert_equal("responses_fallback_cache_endpoint", cached_calls[0], "http://provider.example/v1/chat/completions", failures)
    finally:
        llm_client.request.urlopen = original_urlopen
        llm_client._RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.clear()

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
            base_url="http://provider.example/v1",
            api_type="responses",
            max_retries=0,
        )
        checks.append({"name": "test_connection_reports_fallback_endpoint", "calls": calls, "connection": connection})
        _assert_equal("test_connection_fallback_api_type", str(connection.get("apiType")), "chat_completions", failures)
        _assert_equal("test_connection_fallback_endpoint", str(connection.get("endpoint")), "http://provider.example/v1/chat/completions", failures)
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
