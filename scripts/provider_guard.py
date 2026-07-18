"""Provider rate-limiting and cooldown guard for the FYADR rewrite pipeline.

Extracted from ``app_service.py`` so the rate-limit / cooldown state machine
has a single home. The state (timestamps and cooldown windows) is kept in
process-level dicts guarded by module locks so concurrent rewrite threads
share one view per provider.
"""

from __future__ import annotations

import threading
import time
from typing import Any, Callable

from runtime_error_safety import safe_public_error_message

DEFAULT_REQUEST_TIMEOUT_SECONDS = 600
MIN_REWRITE_REQUEST_TIMEOUT_SECONDS = 600

_RATE_LIMIT_STATE: dict[str, list[float]] = {}
_RATE_LIMIT_LOCK = threading.Lock()
_PROVIDER_GUARD_STATE: dict[str, dict[str, Any]] = {}
_PROVIDER_GUARD_LOCK = threading.Lock()


def _coerce_int_config(value: Any, *, default: int, minimum: int, maximum: int) -> int:
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        normalized = default
    return max(minimum, min(maximum, normalized))


def _coerce_rewrite_timeout_seconds(value: Any) -> int:
    return _coerce_int_config(
        value,
        default=DEFAULT_REQUEST_TIMEOUT_SECONDS,
        minimum=MIN_REWRITE_REQUEST_TIMEOUT_SECONDS,
        maximum=3600,
    )


def _coerce_rate_limit(value: Any) -> int:
    return _coerce_int_config(value, default=0, minimum=0, maximum=10000)


def _coerce_rate_window_minutes(model_config: dict[str, Any]) -> float:
    try:
        value = float(model_config.get("rateLimitWindowMinutes", 0) or 0)
    except (TypeError, ValueError):
        value = 0.0
    if value > 0:
        return min(1440.0, value)
    if _coerce_rate_limit(model_config.get("rateLimitPerFiveMinutes", 0)) > 0:
        return 5.0
    if _coerce_rate_limit(model_config.get("rateLimitPerMinute", 0)) > 0:
        return 1.0
    return 0.0


def _coerce_rate_max_requests(model_config: dict[str, Any]) -> int:
    value = _coerce_rate_limit(model_config.get("rateLimitMaxRequests", 0))
    if value > 0:
        return value
    five_minute_value = _coerce_rate_limit(model_config.get("rateLimitPerFiveMinutes", 0))
    if five_minute_value > 0:
        return five_minute_value
    return _coerce_rate_limit(model_config.get("rateLimitPerMinute", 0))


def _provider_guard_key(model_config: dict[str, Any]) -> str:
    provider_id = str(model_config.get("providerId", "") or "").strip()
    if provider_id:
        return f"id:{provider_id}"
    return "|".join(
        [
            str(model_config.get("providerName", "")).strip(),
            str(model_config.get("baseUrl", "")).strip(),
            str(model_config.get("apiKey", "")).strip()[-12:],
        ]
    )


def _provider_display_name(model_config: dict[str, Any]) -> str:
    return (
        str(model_config.get("providerName", "") or "").strip()
        or str(model_config.get("providerId", "") or "").strip()
        or str(model_config.get("baseUrl", "") or "").strip()
        or "default-provider"
    )


def _build_provider_rate_limiter(model_config: dict[str, Any]) -> Callable[[], float]:
    window_minutes = _coerce_rate_window_minutes(model_config)
    max_requests = _coerce_rate_max_requests(model_config)
    if window_minutes <= 0 or max_requests <= 0:
        return lambda: 0.0

    window_seconds = window_minutes * 60.0
    provider_key = _provider_guard_key(model_config)

    def wait_for_slot() -> float:
        waited = 0.0
        while True:
            with _RATE_LIMIT_LOCK:
                now = time.monotonic()
                timestamps = _RATE_LIMIT_STATE.setdefault(provider_key, [])
                timestamps[:] = [item for item in timestamps if now - item < window_seconds]
                if len(timestamps) < max_requests:
                    timestamps.append(now)
                    return waited
                wait_seconds = max(0.0, window_seconds - (now - timestamps[0]))
            time.sleep(wait_seconds)
            waited += wait_seconds

    return wait_for_slot


def _wait_for_provider_cooldown(
    model_config: dict[str, Any],
    *,
    cancel_check: Callable[[], bool] | None = None,
) -> float:
    provider_key = _provider_guard_key(model_config)
    waited = 0.0
    while True:
        if cancel_check is not None and cancel_check():
            raise RuntimeError("Run was interrupted by user. Completed chunks are kept; click continue to resume this round.")
        with _PROVIDER_GUARD_LOCK:
            state = _PROVIDER_GUARD_STATE.get(provider_key) or {}
            cooldown_until = float(state.get("cooldownUntil", 0.0) or 0.0)
            reason = str(state.get("category", "") or "")
            now = time.monotonic()
            remaining = cooldown_until - now
        if remaining <= 0:
            return waited
        time.sleep(min(remaining, 1.0))
        waited += min(remaining, 1.0)
        if waited >= 1.0 and reason:
            continue


def _register_provider_success(model_config: dict[str, Any]) -> None:
    provider_key = _provider_guard_key(model_config)
    with _PROVIDER_GUARD_LOCK:
        state = _PROVIDER_GUARD_STATE.get(provider_key)
        if not state:
            return
        state["successCount"] = int(state.get("successCount", 0) or 0) + 1
        state["failureCount"] = 0
        if float(state.get("cooldownUntil", 0.0) or 0.0) <= time.monotonic():
            state.pop("cooldownUntil", None)
            state.pop("category", None)
            state.pop("message", None)


def _register_provider_failure(model_config: dict[str, Any], exc: BaseException) -> None:
    provider_key = _provider_guard_key(model_config)
    category = str(getattr(exc, "category", "") or "unknown")
    cooldown_seconds = getattr(exc, "cooldown_seconds", None)
    if cooldown_seconds is None:
        cooldown_seconds = 0
    try:
        cooldown_seconds = float(cooldown_seconds)
    except (TypeError, ValueError):
        cooldown_seconds = 0
    retryable = bool(getattr(exc, "retryable", False))
    should_cooldown = retryable or category in {"rate_limit", "server", "timeout", "network"}
    with _PROVIDER_GUARD_LOCK:
        state = _PROVIDER_GUARD_STATE.setdefault(provider_key, {})
        failure_count = int(state.get("failureCount", 0) or 0) + 1
        state.update(
            {
                "provider": _provider_display_name(model_config),
                "failureCount": failure_count,
                "category": category,
                "message": safe_public_error_message(exc),
                "updatedAt": time.monotonic(),
            }
        )
        if should_cooldown:
            fallback_seconds = min(60.0, max(3.0, 3.0 * failure_count))
            effective_cooldown = max(cooldown_seconds, fallback_seconds)
            state["cooldownUntil"] = max(float(state.get("cooldownUntil", 0.0) or 0.0), time.monotonic() + effective_cooldown)
