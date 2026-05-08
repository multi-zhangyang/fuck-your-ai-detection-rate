from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
from llm_client import LLMRequestError  # noqa: E402


DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "provider_guard_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, Any]:
    checks: list[str] = []
    config = {
        "providerId": "regression-provider",
        "providerName": "Regression Provider",
        "baseUrl": "https://provider.example/v1",
        "apiKey": "secret",
    }
    app_service._PROVIDER_GUARD_STATE.clear()

    fake_now = {"value": 100.0}
    sleep_calls: list[float] = []
    original_monotonic = app_service.time.monotonic
    original_sleep = app_service.time.sleep
    app_service.time.monotonic = lambda: fake_now["value"]

    def fake_sleep(seconds: float) -> None:
        sleep_calls.append(float(seconds))
        fake_now["value"] += float(seconds)

    app_service.time.sleep = fake_sleep
    try:
        error = LLMRequestError(
            "LLM request failed with status 429: slow down",
            category="rate_limit",
            status_code=429,
            retryable=True,
            attempts=3,
            cooldown_seconds=4,
            provider_message="slow down",
        )
        app_service._register_provider_failure(config, error)
        state = app_service._PROVIDER_GUARD_STATE.get("id:regression-provider") or {}
        _assert(state.get("category") == "rate_limit", "provider guard must record failure category")
        _assert(float(state.get("cooldownUntil", 0)) >= 104.0, "provider guard must create a cooldown window")
        waited = app_service._wait_for_provider_cooldown(config)
        _assert(waited >= 4.0, f"provider guard must wait through cooldown, got {waited}")
        _assert(sleep_calls, "provider guard cooldown must sleep instead of busy looping")
        checks.append("provider guard applies shared cooldown after retryable provider failure")

        app_service._register_provider_success(config)
        state_after_success = app_service._PROVIDER_GUARD_STATE.get("id:regression-provider") or {}
        _assert(int(state_after_success.get("failureCount", 0) or 0) == 0, "provider success must reset failure count")
        _assert("cooldownUntil" not in state_after_success, "provider success after cooldown must clear cooldown state")
        checks.append("provider guard clears cooldown state after a successful request")
    finally:
        app_service.time.monotonic = original_monotonic
        app_service.time.sleep = original_sleep
        app_service._PROVIDER_GUARD_STATE.clear()

    captured_request: dict[str, Any] = {}
    original_llm_completion = app_service.llm_completion

    def fake_llm_completion(*_args: Any, **kwargs: Any) -> str:
        captured_request["timeout"] = int(kwargs.get("timeout", 0) or 0)
        captured_request["maxRetries"] = int(kwargs.get("max_retries", 0) or 0)
        captured_request["retryBackoffSeconds"] = float(kwargs.get("retry_backoff_seconds", 0) or 0)
        return "rewritten"

    app_service.llm_completion = fake_llm_completion
    try:
        transform, _ = app_service._build_transform_from_model_config({
            "baseUrl": "https://provider.example/v1",
            "apiKey": "secret",
            "model": "slow-thinking-model",
            "requestTimeoutSeconds": 180,
            "maxRetries": 3,
        })
        transform("source", "prompt", 1, "p0_c0")
        _assert(
            captured_request.get("timeout") == app_service.MIN_REWRITE_REQUEST_TIMEOUT_SECONDS,
            "rewrite transforms must lift short saved timeouts to the long-thinking floor",
        )
        _assert(
            captured_request.get("maxRetries") == app_service.MIN_REWRITE_TRANSIENT_RETRIES,
            "rewrite transforms must apply the transient retry floor",
        )
        _assert(
            captured_request.get("retryBackoffSeconds") == app_service.REWRITE_RETRY_BACKOFF_SECONDS,
            "rewrite transforms must use the slow-provider retry backoff",
        )
        checks.append("rewrite requests enforce a long-thinking timeout floor")
        checks.append("rewrite requests enforce a stronger transient retry policy")
    finally:
        app_service.llm_completion = original_llm_completion

    _assert(app_service.MAX_REWRITE_CONCURRENCY == 16, "rewrite concurrency ceiling must expose the 16-way tier")
    checks.append("rewrite concurrency ceiling exposes the 16-way tier")

    return {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    report = run_regression()
    DEFAULT_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
