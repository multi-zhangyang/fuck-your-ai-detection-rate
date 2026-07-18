"""Safe public/checkpoint diagnostics for model-provider failures.

Provider response bodies and reasoning fields are untrusted content.  They may
be useful inside the transport exception while unwinding, but must never cross
the progress, checkpoint, compare, report, or UI boundary.  This module keeps
only stable metadata and deliberately has no provider/model-specific rules.
"""

from __future__ import annotations

import re
from typing import Any


MAX_LOCAL_ERROR_CHARS = 800
_REASONING_MATERIAL_RE = re.compile(
    r"(?is)(?:"
    r"<\s*/?\s*(?:think|thinking|reasoning|analysis|thought)\b"
    r"|<\|\s*(?:begin|end)_of_thought\s*\|>"
    r"|[\"']?(?:reasoning_content|reasoning_details|reasoning_summary|reasoning_text|"
    r"thinking_text|analysis_text|chain_of_thought)[\"']?\s*[:=]"
    r"|[\"'](?:reasoning|thinking|analysis|thought)[\"']\s*:"
    r")"
)


def _exception_chain(error: BaseException):
    current: BaseException | None = error
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        yield current
        current = current.__cause__ or current.__context__


def provider_error_metadata(error: BaseException) -> dict[str, object]:
    """Extract stable provider metadata without endpoint/body/message text."""

    for current in _exception_chain(error):
        category = str(getattr(current, "category", "") or "").strip().lower()
        raw_status = getattr(current, "status_code", None)
        has_provider_shape = bool(
            category
            or raw_status is not None
            or hasattr(current, "provider_message")
            or hasattr(current, "endpoint")
        )
        if not has_provider_shape:
            continue
        metadata: dict[str, object] = {
            "errorCategory": category or "provider",
            "reasoningSuppressed": True,
            "providerContentStored": False,
        }
        if raw_status is not None:
            try:
                metadata["statusCode"] = int(raw_status)
            except (TypeError, ValueError):
                pass
        for attr_name, public_name in (
            ("retryable", "retryable"),
            ("attempts", "attempts"),
            ("cooldown_seconds", "cooldownSeconds"),
            ("retry_after_seconds", "retryAfterSeconds"),
        ):
            value = getattr(current, attr_name, None)
            if value is None:
                continue
            if public_name == "retryable":
                metadata[public_name] = bool(value)
                continue
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            metadata[public_name] = int(number) if number.is_integer() else round(number, 1)
        return metadata
    return {}


def public_provider_error_message(
    *,
    category: object = "",
    status_code: object = None,
) -> str:
    normalized_category = str(category or "provider").strip().lower() or "provider"
    try:
        normalized_status = int(status_code) if status_code is not None else None
    except (TypeError, ValueError):
        normalized_status = None
    status_text = f", HTTP {normalized_status}" if normalized_status is not None else ""
    return (
        f"Provider request failed (category={normalized_category}{status_text}); "
        "upstream response and reasoning content were suppressed."
    )


def safe_public_error_message(error: BaseException) -> str:
    """Return a bounded public message without provider or reasoning content."""

    metadata = provider_error_metadata(error)
    if metadata:
        return public_provider_error_message(
            category=metadata.get("errorCategory"),
            status_code=metadata.get("statusCode"),
        )
    if isinstance(error, ValueError):
        message = str(error).strip()
        if not message or _REASONING_MATERIAL_RE.search(message):
            return "Local validation failed; reasoning content was suppressed."
        return message[:MAX_LOCAL_ERROR_CHARS]
    return f"{type(error).__name__}: operation failed; raw error details were suppressed."


def safe_exception_details(error: BaseException) -> dict[str, object]:
    metadata = provider_error_metadata(error)
    if metadata:
        return metadata
    return {
        "errorCategory": "local",
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }


def sanitize_persisted_error(
    raw_message: object,
    raw_details: object = None,
) -> tuple[str, dict[str, object]]:
    """Normalize old/new checkpoint diagnostics at the read/rewrite boundary."""

    details = raw_details if isinstance(raw_details, dict) else {}
    if not str(raw_message or "").strip() and not details:
        return "", {}
    category = str(details.get("errorCategory", "") or "").strip().lower()
    status_code = details.get("statusCode")
    provider_shaped = bool(category and category != "local") or any(
        key in details for key in ("providerMessage", "endpoint", "provider_message")
    )
    if provider_shaped:
        safe_details = {
            key: details[key]
            for key in (
                "errorCategory",
                "statusCode",
                "retryable",
                "attempts",
                "cooldownSeconds",
                "retryAfterSeconds",
            )
            if key in details
        }
        safe_details.update({"reasoningSuppressed": True, "providerContentStored": False})
        return (
            public_provider_error_message(category=category or "provider", status_code=status_code),
            safe_details,
        )
    message = str(raw_message or "").strip()
    if _REASONING_MATERIAL_RE.search(message):
        message = "Operation failed; reasoning content was suppressed."
    elif len(message) > MAX_LOCAL_ERROR_CHARS:
        message = message[:MAX_LOCAL_ERROR_CHARS]
    safe_details = {
        key: details[key]
        for key in ("errorCategory", "statusCode", "retryable", "attempts", "cooldownSeconds", "retryAfterSeconds")
        if key in details
    }
    safe_details.update({"reasoningSuppressed": True, "providerContentStored": False})
    return message, safe_details


def safe_retry_progress(event: dict[str, Any]) -> dict[str, object]:
    """Project a transport retry event onto the public metadata-only schema."""

    category = str(event.get("category", "") or "provider").strip().lower() or "provider"
    status_code = event.get("statusCode")
    payload: dict[str, object] = {
        "error": public_provider_error_message(category=category, status_code=status_code),
        "errorCategory": category,
        "reasoningSuppressed": True,
        "providerContentStored": False,
    }
    for key in (
        "statusCode",
        "retryable",
        "attempt",
        "maxAttempts",
        "nextAttempt",
        "retryDelaySeconds",
        "retryAfterSeconds",
        "cooldownSeconds",
    ):
        if key in event:
            payload[key] = event[key]
    return payload
