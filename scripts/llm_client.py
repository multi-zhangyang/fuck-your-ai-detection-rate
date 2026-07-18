from __future__ import annotations

import codecs
import json
import os
import random
import re
import socket
import time
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Callable, Iterator
from urllib import error, request


DEFAULT_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "User-Agent": "curl/8.7.1",
}
DEFAULT_STREAM = True
StreamDeltaCallback = Callable[[dict[str, object]], None]
TRANSIENT_HTTP_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}
DEFAULT_MAX_RETRIES = 2
DEFAULT_RETRY_BACKOFF_SECONDS = 2.0
MAX_RETRY_SLEEP_SECONDS = 60.0
RETRY_JITTER_RATIO = 0.35
MAX_ERROR_DETAIL_CHARS = 1200
# Provider-independent local stream budgets.  These are deliberately enforced
# by the client instead of being sent as provider/model-specific token knobs:
# an OpenAI-compatible route may ignore or reject token caps, but it must never
# be able to grow one FYADR process without a bounded wall-clock/wire/text
# budget.  ``timeout`` remains the public input and now also bounds the complete
# streaming operation (all attempts and backoff), not just one socket read.
MAX_STREAM_SSE_EVENTS = 100_000
MAX_STREAM_WIRE_BYTES = 8 * 1024 * 1024
MAX_STREAM_FINAL_CHARS = 2_000_000
RetryCallback = Callable[[dict[str, object]], None]
COOLDOWN_BY_ERROR_CATEGORY = {
    "rate_limit": 60,
    "server": 20,
    "timeout": 12,
    "network": 12,
}
_RESPONSES_TO_CHAT_FALLBACK_BASE_URLS: set[str] = set()
THINKING_PART_TYPES = {
    "analysis",
    "analysis_text",
    "chain_of_thought",
    "reasoning",
    "reasoning_content",
    "reasoning_summary",
    "reasoning_text",
    "summary",
    "thought",
    "thinking",
    "thinking_text",
    "think",
}
FINAL_TEXT_PART_TYPES = {
    "",
    "answer",
    "content",
    "final",
    "json",
    "json_object",
    "json_text",
    "message_text",
    "output_json",
    "output_text",
    "text",
}
_REASONING_TAG_NAME_PATTERN = r"(?:think|thinking|reasoning|analysis|thought)"
REASONING_BLOCK_RE_LIST = (
    re.compile(
        rf"(?is)<\s*(?P<reasoning_tag>{_REASONING_TAG_NAME_PATTERN})\b[^>]*>"
        rf".*?</\s*(?P=reasoning_tag)\s*>"
    ),
    re.compile(r"(?is)<\|begin_of_thought\|>.*?<\|end_of_thought\|>"),
)
REASONING_PREFIX_RE = re.compile(
    rf"(?is)^\s*<\s*{_REASONING_TAG_NAME_PATTERN}\b[^>]*>.*?"
    r"(?=(?:```json|```|\{\s*\"|\[\s*(?:\{|\[|\")))"
)


class LLMRequestError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        category: str = "unknown",
        status_code: int | None = None,
        retryable: bool = False,
        attempts: int = 1,
        endpoint: str = "",
        retry_after_seconds: float | None = None,
        cooldown_seconds: float | None = None,
        provider_message: str = "",
    ) -> None:
        safe_message = _sanitize_error_text(message) or "LLM request failed."
        super().__init__(safe_message)
        self.category = category
        self.status_code = status_code
        self.retryable = retryable
        self.attempts = attempts
        self.endpoint = endpoint
        self.retry_after_seconds = retry_after_seconds
        self.cooldown_seconds = cooldown_seconds
        self.provider_message = _sanitize_error_text(provider_message)

    def to_dict(self) -> dict[str, object]:
        return {
            "message": str(self),
            "category": self.category,
            "statusCode": self.status_code,
            "retryable": self.retryable,
            "attempts": self.attempts,
            "endpoint": self.endpoint,
            "retryAfterSeconds": self.retry_after_seconds,
            "cooldownSeconds": self.cooldown_seconds,
            "providerMessage": self.provider_message,
        }


def normalize_api_type(api_type: str | None, base_url: str) -> str:
    if api_type:
        normalized = api_type.strip().lower()
        if normalized in {"chat", "chat_completions", "chat-completions"}:
            return "chat_completions"
        if normalized in {"responses", "response"}:
            return "responses"

    normalized_base_url = base_url.rstrip("/").lower()
    if normalized_base_url.endswith("/responses"):
        return "responses"
    return "chat_completions"


def build_endpoint(base_url: str, api_type: str) -> str:
    normalized_base_url = base_url.rstrip("/")
    if api_type == "responses":
        if normalized_base_url.endswith("/responses"):
            return normalized_base_url
        return f"{normalized_base_url}/responses"

    if normalized_base_url.endswith("/chat/completions"):
        return normalized_base_url
    return f"{normalized_base_url}/chat/completions"


def build_payload(
    prompt: str,
    *,
    model: str,
    temperature: float,
    api_type: str,
    stream: bool = DEFAULT_STREAM,
) -> dict[str, object]:
    # Intentionally never set max_tokens / max_output_tokens.
    # Some free/proxy routes degrade or error when a token cap is forced.
    if api_type == "responses":
        payload: dict[str, object] = {
            "model": model,
            "input": prompt,
            "temperature": temperature,
        }
        if stream:
            payload["stream"] = True
        return payload

    payload = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }
    if stream:
        payload["stream"] = True
    return payload


def _should_fallback_responses_to_chat(base_url: str, error_message: str) -> bool:
    normalized_base_url = base_url.rstrip("/").lower()
    if normalized_base_url.endswith("/responses"):
        return False

    normalized_message = error_message.lower()
    hard_endpoint_markers = (
        "status 404",
        "status 405",
        "not found",
        "method not allowed",
        "unsupported",
        "unknown endpoint",
        "unknown path",
        "invalid endpoint",
        "no route",
        "cannot post",
        "post /v1/responses",
    )
    chat_payload_markers = (
        "missing required parameter: messages",
        "messages is required",
        "'messages' is required",
        "unknown parameter: input",
        "unrecognized request argument supplied: input",
        "unsupported parameter: input",
        "input is not supported",
    )
    provider_config_markers = (
        "open /app/config.json",
        "config.json: permission denied",
    )
    return any(marker in normalized_message for marker in hard_endpoint_markers + chat_payload_markers + provider_config_markers)


def _fallback_cache_key(base_url: str) -> str:
    return base_url.rstrip("/").lower()


def _get_effective_api_type(resolved_api_type: str, base_url: str) -> str:
    if (
        resolved_api_type == "responses"
        and not base_url.rstrip("/").lower().endswith("/responses")
        and _fallback_cache_key(base_url) in _RESPONSES_TO_CHAT_FALLBACK_BASE_URLS
    ):
        return "chat_completions"
    return resolved_api_type


def _remember_responses_fallback(base_url: str) -> None:
    if not base_url.rstrip("/").lower().endswith("/responses"):
        _RESPONSES_TO_CHAT_FALLBACK_BASE_URLS.add(_fallback_cache_key(base_url))


def build_headers(api_key: str | None) -> dict[str, str]:
    headers = dict(DEFAULT_HEADERS)
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def build_models_endpoint(base_url: str) -> str:
    normalized_base_url = base_url.rstrip("/")
    normalized_lower = normalized_base_url.lower()

    if normalized_lower.endswith("/models"):
        return normalized_base_url

    for suffix in ("/chat/completions", "/responses", "/completions"):
        if normalized_lower.endswith(suffix):
            normalized_base_url = normalized_base_url[: -len(suffix)]
            normalized_lower = normalized_base_url.lower()
            break

    if normalized_lower.endswith("/models"):
        return normalized_base_url

    return f"{normalized_base_url}/models"


class _SSEProtocolError(ValueError):
    """Body-free parse failure for malformed SSE or invalid UTF-8."""


class _SSELimitError(RuntimeError):
    """Body-free local stream-budget failure.

    Only a stable code crosses into :class:`LLMRequestError`; the provider
    frame/delta that triggered the budget is intentionally never attached.
    """

    def __init__(self, code: str) -> None:
        super().__init__(str(code))
        self.code = str(code)


def _remaining_stream_seconds(deadline: float) -> float:
    return float(deadline) - time.monotonic()


def _assert_stream_deadline(deadline: float) -> None:
    if _remaining_stream_seconds(deadline) <= 0:
        raise _SSELimitError("wall_clock_deadline")


def _set_stream_response_timeout(response: object, timeout_seconds: float) -> None:
    """Best-effortly reduce urllib's socket timeout to the total time left.

    ``urlopen(timeout=...)`` applies a per-blocking-operation timeout.  urllib's
    normal HTTP/HTTPS response exposes its socket through ``fp.raw._sock``;
    lowering that timeout before every read prevents a late read from silently
    receiving a fresh full timeout.  Test doubles and alternate transports may
    not expose a socket, so deadline checks still run before and after reads.
    """

    bounded_timeout = max(0.001, float(timeout_seconds))
    chains = (
        (),
        ("fp",),
        ("fp", "raw"),
        ("fp", "raw", "_sock"),
        ("fp", "_sock"),
        ("raw",),
        ("raw", "_sock"),
        ("_sock",),
    )
    seen: set[int] = set()
    for chain in chains:
        candidate = response
        try:
            for name in chain:
                candidate = getattr(candidate, name)
        except (AttributeError, TypeError):
            continue
        if candidate is None or id(candidate) in seen:
            continue
        seen.add(id(candidate))
        setter = getattr(candidate, "settimeout", None)
        if not callable(setter):
            continue
        try:
            setter(bounded_timeout)
        except (OSError, TypeError, ValueError):
            continue
        return


def _stream_wire_size(value: object) -> int:
    if isinstance(value, bytes):
        return len(value)
    if isinstance(value, str):
        return len(value.encode("utf-8"))
    return len(str(value or "").encode("utf-8"))


def _iter_standard_sse_events(
    response: object,
    *,
    deadline: float | None = None,
    max_wire_bytes: int = MAX_STREAM_WIRE_BYTES,
) -> Iterator[tuple[str, str]]:
    """Yield SSE frames while preserving UTF-8 code points split across reads."""

    decoder = codecs.getincrementaldecoder("utf-8")("strict")
    text_buffer = ""
    event_name = ""
    data_lines: list[str] = []
    saw_data = False
    first_line = True
    wire_bytes = 0
    wire_limit = max(1, int(max_wire_bytes))

    def consume_line(raw_line: str) -> tuple[str, str] | None:
        nonlocal event_name, data_lines, saw_data, first_line
        line = raw_line.lstrip("\ufeff") if first_line else raw_line
        first_line = False
        if line == "":
            if not saw_data:
                event_name = ""
                data_lines = []
                return None
            frame = (event_name, "\n".join(data_lines))
            event_name = ""
            data_lines = []
            saw_data = False
            return frame
        if line.startswith(":"):
            return None
        field, separator, value = line.partition(":")
        if separator and value.startswith(" "):
            value = value[1:]
        if field == "event":
            event_name = value
        elif field == "data":
            saw_data = True
            data_lines.append(value)
        return None

    try:
        while True:
            if deadline is not None:
                _assert_stream_deadline(deadline)
                _set_stream_response_timeout(response, _remaining_stream_seconds(deadline))
            reader = response.readline  # type: ignore[attr-defined]
            remaining_wire_bytes = max(1, wire_limit - wire_bytes + 1)
            try:
                raw_chunk = reader(remaining_wire_bytes)
            except TypeError:
                # Lightweight regression doubles and a few file-like adapters
                # expose ``readline()`` without the optional size argument.
                raw_chunk = reader()
            wire_bytes += _stream_wire_size(raw_chunk)
            if wire_bytes > wire_limit:
                raise _SSELimitError("wire_bytes")
            if deadline is not None:
                _assert_stream_deadline(deadline)
            eof = not raw_chunk
            if isinstance(raw_chunk, bytes):
                text_buffer += decoder.decode(raw_chunk, final=False)
            elif raw_chunk:
                text_buffer += str(raw_chunk)
            if eof:
                text_buffer += decoder.decode(b"", final=True)
            while True:
                line_break = re.search(r"\r\n|\r|\n", text_buffer)
                if line_break is None:
                    break
                line = text_buffer[: line_break.start()]
                text_buffer = text_buffer[line_break.end() :]
                frame = consume_line(line)
                if frame is not None:
                    yield frame
            if not eof:
                continue
            if text_buffer:
                frame = consume_line(text_buffer)
                if frame is not None:
                    yield frame
            frame = consume_line("")
            if frame is not None:
                yield frame
            break
    except _SSELimitError:
        raise
    except (UnicodeDecodeError, AttributeError, TypeError) as exc:
        raise _SSEProtocolError("Invalid SSE transport framing.") from exc


def _stream_text_value(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, (list, dict)):
        return _extract_text_from_content_parts(value)
    return ""


def _primary_stream_choice(payload: dict[str, object]) -> dict[str, object] | None:
    choices = payload.get("choices")
    if not isinstance(choices, list):
        return None
    unindexed: dict[str, object] | None = None
    for item in choices:
        if not isinstance(item, dict):
            continue
        raw_index = item.get("index")
        if raw_index is None and unindexed is None:
            unindexed = item
            continue
        try:
            if int(raw_index) == 0:
                return item
        except (TypeError, ValueError):
            continue
    return unindexed


def _is_thinking_stream_type(value: object) -> bool:
    normalized = str(value or "").strip().lower().replace("-", "_")
    return any(marker in normalized for marker in ("reasoning", "thinking", "analysis", "thought"))


def _stream_container_is_thinking(value: object) -> bool:
    if not isinstance(value, dict):
        return False
    return any(
        _is_thinking_stream_type(value.get(key))
        for key in ("type", "object", "kind")
    )


def _extract_safe_chat_stream_event(
    payload: dict[str, object],
    event_name: object = "",
) -> tuple[str, str, bool]:
    """Return final-field ``(delta, snapshot, finished)`` for choice zero only."""

    # Some compatible gateways wrap thinking text in an SSE event/type while
    # still putting the private trace in a generic ``content`` field.  Check
    # every typed container before consulting final-field names; a content
    # whitelist by itself is insufficient for those payloads.
    if _is_thinking_stream_type(event_name) or _stream_container_is_thinking(payload):
        return "", "", False
    choice = _primary_stream_choice(payload)
    if choice is None:
        return "", "", False
    if _stream_container_is_thinking(choice):
        return "", "", False
    delta_text = ""
    snapshot_text = ""
    delta = choice.get("delta")
    if isinstance(delta, dict) and not _stream_container_is_thinking(delta):
        delta_type = str(delta.get("type", "") or "").strip().lower()
        if delta_type not in THINKING_PART_TYPES and not _is_thinking_stream_type(delta_type):
            for key in ("content", "answer", "output_text"):
                delta_text = _stream_text_value(delta.get(key))
                if delta_text:
                    break
    message = choice.get("message")
    if isinstance(message, dict) and not _stream_container_is_thinking(message):
        message_type = str(message.get("type", "") or "").strip().lower()
        if message_type not in THINKING_PART_TYPES and not _is_thinking_stream_type(message_type):
            for key in ("content", "answer", "output_text"):
                snapshot_text = _stream_text_value(message.get(key))
                if snapshot_text:
                    break
    return delta_text, snapshot_text, choice.get("finish_reason") is not None


def _extract_safe_responses_stream_event(payload: dict[str, object]) -> tuple[str, str, bool]:
    """Accept only explicit Responses final-text events; generic deltas fail closed."""

    event_type = str(payload.get("type", "") or "").strip().lower()
    if _is_thinking_stream_type(event_type):
        return "", "", False
    if event_type in {"response.output_text.delta", "response.text.delta"}:
        delta = payload.get("delta")
        return (delta if isinstance(delta, str) else ""), "", False
    if event_type in {"response.output_item.delta", "response.content_part.delta"}:
        delta = payload.get("delta")
        if not isinstance(delta, dict):
            return "", "", False
        delta_type = str(delta.get("type", "") or "").strip().lower()
        if (
            not delta_type
            or delta_type not in FINAL_TEXT_PART_TYPES
            or delta_type in THINKING_PART_TYPES
            or _is_thinking_stream_type(delta_type)
        ):
            return "", "", False
        for key in ("output_text", "answer", "content", "text"):
            text = _stream_text_value(delta.get(key))
            if text:
                return text, "", False
        return "", "", False
    if event_type in {"response.output_text.done", "response.text.done"}:
        for key in ("output_text", "answer", "content", "text"):
            text = _stream_text_value(payload.get(key))
            if text:
                return "", text, False
        return "", "", False
    if event_type == "response.completed":
        response_payload = payload.get("response")
        if isinstance(response_payload, dict):
            try:
                return "", extract_response_text(response_payload, "", "responses"), True
            except RuntimeError:
                return "", "", True
        return "", "", True
    if "choices" in payload:
        return _extract_safe_chat_stream_event(payload)
    return "", "", False


_STREAM_REASONING_TOKEN_RE = re.compile(
    rf"(?is)<\s*(/?)\s*({_REASONING_TAG_NAME_PATTERN})\b[^>]*>"
    r"|(<\|begin_of_thought\|>)|(<\|end_of_thought\|>)"
)
_STREAM_REASONING_RESIDUE_RE = re.compile(
    rf"(?is)<\s*/?\s*{_REASONING_TAG_NAME_PATTERN}\b|<\|(?:begin|end)_of_thought\|>"
)


def _finalize_stream_answer(raw_text: str) -> str:
    """Delete balanced reasoning blocks; reject every unmatched marker."""

    stack: list[str] = []
    for match in _STREAM_REASONING_TOKEN_RE.finditer(str(raw_text or "")):
        if match.group(3):
            stack.append("thought-sentinel")
            continue
        if match.group(4):
            if not stack or stack.pop() != "thought-sentinel":
                raise _SSEProtocolError("Unmatched reasoning marker in final stream output.")
            continue
        tag = str(match.group(2) or "").lower()
        if match.group(1):
            if not stack or stack.pop() != tag:
                raise _SSEProtocolError("Unmatched reasoning marker in final stream output.")
        else:
            stack.append(tag)
    if stack:
        raise _SSEProtocolError("Unmatched reasoning marker in final stream output.")
    cleaned = strip_reasoning_blocks(raw_text).strip()
    if _STREAM_REASONING_RESIDUE_RE.search(cleaned):
        raise _SSEProtocolError("Residual reasoning marker in final stream output.")
    return cleaned


def _emit_safe_stream_progress(
    callback: StreamDeltaCallback | None,
    *,
    attempt: int,
    event_count: int,
    done: bool,
    final_text_chars: int | None = None,
) -> None:
    """Expose metadata only; never expose a partial delta or accumulated text."""

    if callback is None:
        return
    payload: dict[str, object] = {
        "event": "stream-progress",
        "attempt": attempt,
        "eventCount": event_count,
        "reasoningSuppressed": True,
        "done": done,
    }
    if done and final_text_chars is not None:
        payload["finalTextChars"] = max(0, int(final_text_chars))
    try:
        callback(payload)
    except Exception:
        return


def _stream_limit_request_error(
    code: str,
    *,
    attempt: int,
    endpoint: str,
) -> LLMRequestError:
    messages = {
        "wall_clock_deadline": "LLM stream exceeded the local wall-clock deadline.",
        "sse_events": "LLM stream exceeded the local SSE event limit.",
        "wire_bytes": "LLM stream exceeded the local wire-byte limit.",
        "final_chars": "LLM stream exceeded the local final-text limit.",
    }
    normalized_code = str(code or "stream_budget")
    return LLMRequestError(
        messages.get(normalized_code, "LLM stream exceeded a local safety limit."),
        category="timeout" if normalized_code == "wall_clock_deadline" else "response_limit",
        retryable=False,
        attempts=max(1, int(attempt)),
        endpoint=endpoint,
        provider_message="",
    )


def _extract_stream_api_error(
    payload: dict[str, object],
    *,
    event_name: str,
    response_status: int,
    attempt: int,
    endpoint: str,
) -> LLMRequestError | None:
    event_type = str(payload.get("type", event_name) or event_name).strip().lower()
    error_payload = payload.get("error")
    if error_payload is None and event_type not in {"error", "response.error", "response.failed"}:
        return None
    error_container = error_payload if isinstance(error_payload, dict) else payload
    raw_status = error_container.get("status_code") if isinstance(error_container, dict) else None
    if raw_status is None and isinstance(error_container, dict):
        raw_status = error_container.get("status")
    try:
        status_code = int(raw_status) if raw_status is not None else int(response_status)
    except (TypeError, ValueError):
        status_code = int(response_status)
    category = _classify_http_status(status_code) if status_code >= 400 else "provider"
    code = str(error_container.get("code", "") or "").lower() if isinstance(error_container, dict) else ""
    if "rate" in code and "limit" in code:
        category = "rate_limit"
        status_code = 429
    provider_message = _extract_provider_message(json.dumps({"error": error_container}, ensure_ascii=False))
    suffix = f": {provider_message}" if provider_message else ""
    return LLMRequestError(
        f"LLM stream reported an upstream error{suffix}",
        category=category,
        status_code=status_code if status_code >= 400 else None,
        retryable=_is_transient_http_status(status_code) if status_code >= 400 else False,
        attempts=attempt,
        endpoint=endpoint,
        provider_message=provider_message,
    )


def _read_stream_completion(
    http_request: request.Request,
    *,
    api_type: str,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
    retry_callback: RetryCallback | None = None,
    stream_callback: StreamDeltaCallback | None = None,
) -> tuple[str, str]:
    """Backward-compatible private entry point for the hardened reader."""

    return _read_stream_completion_secure(
        http_request,
        api_type=api_type,
        timeout=timeout,
        max_retries=max_retries,
        retry_backoff_seconds=retry_backoff_seconds,
        retry_callback=retry_callback,
        stream_callback=stream_callback,
    )


def _read_stream_completion_secure(
    http_request: request.Request,
    *,
    api_type: str,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
    retry_callback: RetryCallback | None = None,
    stream_callback: StreamDeltaCallback | None = None,
) -> tuple[str, str]:
    """Consume a provider stream without exposing or persisting partial text."""

    attempts = max(1, max_retries + 1)
    endpoint = str(http_request.full_url)
    try:
        total_timeout_seconds = max(0.001, float(timeout))
    except (TypeError, ValueError):
        total_timeout_seconds = 0.001
    stream_deadline = time.monotonic() + total_timeout_seconds
    max_sse_events = max(1, int(MAX_STREAM_SSE_EVENTS))
    max_final_chars = max(1, int(MAX_STREAM_FINAL_CHARS))
    for attempt in range(1, attempts + 1):
        fragments: list[str] = []
        fragment_char_count = 0
        final_snapshot = ""
        event_count = 0
        sse_event_count = 0
        stream_failure: LLMRequestError | None = None
        try:
            _assert_stream_deadline(stream_deadline)
            request_timeout = max(0.001, min(total_timeout_seconds, _remaining_stream_seconds(stream_deadline)))
            with request.urlopen(http_request, timeout=request_timeout) as response:
                status_code = int(getattr(response, "status", 200) or 200)
                if status_code >= 400:
                    stream_failure = LLMRequestError(
                        f"LLM stream failed with status {status_code}.",
                        category=_classify_http_status(status_code),
                        status_code=status_code,
                        retryable=_is_transient_http_status(status_code),
                        attempts=attempt,
                        endpoint=endpoint,
                    )
                else:
                    for event_name, data_value in _iter_standard_sse_events(
                        response,
                        deadline=stream_deadline,
                        max_wire_bytes=MAX_STREAM_WIRE_BYTES,
                    ):
                        sse_event_count += 1
                        if sse_event_count > max_sse_events:
                            raise _SSELimitError("sse_events")
                        stripped_data = data_value.strip()
                        if not stripped_data:
                            continue
                        if stripped_data == "[DONE]":
                            break
                        try:
                            payload = json.loads(data_value)
                        except json.JSONDecodeError:
                            stream_failure = LLMRequestError(
                                "LLM stream returned a non-JSON SSE data frame.",
                                category="response_parse",
                                retryable=False,
                                attempts=attempt,
                                endpoint=endpoint,
                            )
                            break
                        if not isinstance(payload, dict):
                            stream_failure = LLMRequestError(
                                "LLM stream returned a non-object SSE data frame.",
                                category="response_parse",
                                retryable=False,
                                attempts=attempt,
                                endpoint=endpoint,
                            )
                            break
                        if event_name and not payload.get("type"):
                            payload = {**payload, "type": event_name}
                        event_count += 1
                        stream_failure = _extract_stream_api_error(
                            payload,
                            event_name=event_name,
                            response_status=status_code,
                            attempt=attempt,
                            endpoint=endpoint,
                        )
                        if stream_failure is not None:
                            break
                        if api_type == "responses":
                            delta, snapshot, finished = _extract_safe_responses_stream_event(payload)
                        else:
                            delta, snapshot, finished = _extract_safe_chat_stream_event(
                                payload,
                                event_name=event_name,
                            )
                        if delta:
                            fragment_char_count += len(delta)
                            if fragment_char_count > max_final_chars:
                                raise _SSELimitError("final_chars")
                            fragments.append(delta)
                        if snapshot:
                            if len(snapshot) > max_final_chars:
                                raise _SSELimitError("final_chars")
                            final_snapshot = snapshot
                        _emit_safe_stream_progress(
                            stream_callback,
                            attempt=attempt,
                            event_count=event_count,
                            done=False,
                        )
                        if finished:
                            break
                    _assert_stream_deadline(stream_deadline)
        except _SSELimitError as exc:
            raise _stream_limit_request_error(
                exc.code,
                attempt=attempt,
                endpoint=endpoint,
            ) from exc
        except error.HTTPError as exc:
            if _remaining_stream_seconds(stream_deadline) <= 0:
                raise _stream_limit_request_error(
                    "wall_clock_deadline",
                    attempt=attempt,
                    endpoint=endpoint,
                ) from exc
            detail = exc.read().decode("utf-8", errors="replace")
            status_code = int(exc.code)
            category = _classify_http_status(status_code)
            provider_message = _extract_provider_message(detail)
            retry_after_seconds = _parse_retry_after_seconds(exc.headers.get("Retry-After") if exc.headers else None)
            message = f"LLM stream failed with status {status_code}"
            if provider_message:
                message = f"{message}: {provider_message}"
            if _handle_request_failure(
                exc=exc,
                message=message,
                category=category,
                retryable=_is_transient_http_status(status_code),
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                status_code=status_code,
                retry_after_seconds=retry_after_seconds,
                provider_message=provider_message,
                total_deadline=stream_deadline,
            ):
                continue
        except error.URLError as exc:
            if _remaining_stream_seconds(stream_deadline) <= 0:
                raise _stream_limit_request_error(
                    "wall_clock_deadline",
                    attempt=attempt,
                    endpoint=endpoint,
                ) from exc
            category = _classify_url_reason(exc.reason)
            if _handle_request_failure(
                exc=exc,
                message=f"LLM stream transport failed ({category}).",
                category=category,
                retryable=_is_transient_url_reason(exc.reason),
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                total_deadline=stream_deadline,
            ):
                continue
        except OSError as exc:
            if _remaining_stream_seconds(stream_deadline) <= 0:
                raise _stream_limit_request_error(
                    "wall_clock_deadline",
                    attempt=attempt,
                    endpoint=endpoint,
                ) from exc
            category = _classify_url_reason(exc)
            if _handle_request_failure(
                exc=exc,
                message=f"LLM stream transport failed ({category}).",
                category=category,
                retryable=_is_transient_url_reason(exc),
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                total_deadline=stream_deadline,
            ):
                continue
        except _SSEProtocolError as exc:
            raise LLMRequestError(
                "LLM stream used invalid UTF-8 or SSE framing.",
                category="response_parse",
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
            ) from exc

        if stream_failure is not None:
            if stream_failure.retryable and attempt < attempts:
                if _handle_request_failure(
                    exc=stream_failure,
                    message=str(stream_failure),
                    category=stream_failure.category,
                    retryable=True,
                    attempt=attempt,
                    attempts=attempts,
                    endpoint=endpoint,
                    retry_backoff_seconds=retry_backoff_seconds,
                    retry_callback=retry_callback,
                    status_code=stream_failure.status_code,
                    provider_message=stream_failure.provider_message,
                    total_deadline=stream_deadline,
                ):
                    continue
            raise stream_failure

        try:
            text = _finalize_stream_answer("".join(fragments) if fragments else final_snapshot)
        except _SSEProtocolError as exc:
            raise LLMRequestError(
                "LLM stream contained unmatched or residual reasoning markers.",
                category="response_parse",
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
            ) from exc
        if _remaining_stream_seconds(stream_deadline) <= 0:
            raise _stream_limit_request_error(
                "wall_clock_deadline",
                attempt=attempt,
                endpoint=endpoint,
            )
        if len(text) > max_final_chars:
            raise _stream_limit_request_error(
                "final_chars",
                attempt=attempt,
                endpoint=endpoint,
            )
        if not text:
            raise LLMRequestError(
                "LLM stream completed without usable final answer text.",
                category="response_parse",
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
            )
        _emit_safe_stream_progress(
            stream_callback,
            attempt=attempt,
            event_count=event_count,
            done=True,
            final_text_chars=len(text),
        )
        return text, endpoint

    raise LLMRequestError("LLM stream request failed.", attempts=attempts, endpoint=endpoint)


def _send_completion_once(
    prompt: str,
    *,
    model: str,
    api_key: str,
    base_url: str,
    api_type: str,
    temperature: float,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
    retry_callback: RetryCallback | None = None,
    stream: bool = DEFAULT_STREAM,
    stream_callback: StreamDeltaCallback | None = None,
) -> tuple[str, str]:
    endpoint = build_endpoint(base_url, api_type)
    payload = build_payload(
        prompt,
        model=model,
        temperature=temperature,
        api_type=api_type,
        stream=stream,
    )
    body = json.dumps(payload).encode("utf-8")
    headers = build_headers(api_key)
    if stream:
        headers = {
            **headers,
            "Accept": "text/event-stream, application/json",
        }

    http_request = request.Request(
        endpoint,
        data=body,
        headers=headers,
        method="POST",
    )
    if stream:
        return _read_stream_completion_secure(
            http_request,
            api_type=api_type,
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff_seconds=retry_backoff_seconds,
            retry_callback=retry_callback,
            stream_callback=stream_callback,
        )

    data, _, response_body = _send_json_request(
        http_request,
        timeout=timeout,
        max_retries=max_retries,
        retry_backoff_seconds=retry_backoff_seconds,
        retry_callback=retry_callback,
    )
    try:
        return extract_response_text(data, response_body, api_type), endpoint
    except RuntimeError as exc:
        raise LLMRequestError(
            str(exc),
            category="response_parse",
            retryable=False,
            attempts=max(1, max_retries + 1),
            endpoint=endpoint,
            provider_message=_extract_provider_message(response_body),
        ) from exc


def _send_test_connection_once(
    *,
    model: str,
    api_key: str,
    base_url: str,
    api_type: str,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
) -> dict[str, object]:
    endpoint = build_endpoint(base_url, api_type)
    payload = build_payload("ping", model=model, temperature=0, api_type=api_type, stream=False)
    body = json.dumps(payload).encode("utf-8")
    http_request = request.Request(
        endpoint,
        data=body,
        headers=build_headers(api_key),
        method="POST",
    )
    data, status_code, response_body = _send_json_request(
        http_request,
        timeout=timeout,
        max_retries=max_retries,
        retry_backoff_seconds=retry_backoff_seconds,
    )
    try:
        extract_response_text(data, response_body, api_type)
    except RuntimeError as exc:
        raise LLMRequestError(
            str(exc),
            category="response_parse",
            status_code=int(status_code),
            retryable=False,
            attempts=max(1, max_retries + 1),
            endpoint=endpoint,
            provider_message=_extract_provider_message(response_body),
        ) from exc

    return {
        "ok": True,
        "endpoint": endpoint,
        "model": model,
        "apiType": api_type,
        "status": int(status_code),
    }


def _is_transient_http_status(status_code: int) -> bool:
    if status_code in TRANSIENT_HTTP_STATUS_CODES:
        return True
    return 520 <= status_code < 600


def _classify_http_status(status_code: int) -> str:
    if status_code == 429:
        return "rate_limit"
    if status_code in {408, 409} or status_code >= 500:
        return "server"
    if status_code in {401, 403}:
        return "auth"
    if status_code in {404, 405}:
        return "endpoint"
    if 400 <= status_code < 500:
        return "bad_request"
    return "unknown"


def _classify_url_reason(reason: object) -> str:
    if isinstance(reason, (TimeoutError, socket.timeout)):
        return "timeout"
    message = str(reason).strip().lower()
    if any(marker in message for marker in ("timed out", "timeout")):
        return "timeout"
    return "network"


def _is_transient_url_reason(reason: object) -> bool:
    if isinstance(reason, (TimeoutError, ConnectionError, socket.timeout)):
        return True
    if isinstance(reason, OSError):
        return True
    message = str(reason).strip().lower()
    transient_markers = (
        "timed out",
        "temporarily unavailable",
        "connection reset",
        "connection aborted",
        "connection refused",
        "remote end closed connection",
        "bad gateway",
        "service unavailable",
    )
    return any(marker in message for marker in transient_markers)


def _truncate_error_detail(value: str) -> str:
    normalized = str(value or "").strip()
    if len(normalized) <= MAX_ERROR_DETAIL_CHARS:
        return normalized
    return f"{normalized[:MAX_ERROR_DETAIL_CHARS]}... [truncated]"


_ERROR_REASONING_LABEL_RE = re.compile(
    r"(?is)\b(?:reasoning_content|reasoning_details|reasoning_summary|reasoning_text|"
    r"thinking_text|thinking|analysis_text|analysis|chain_of_thought|thoughts?)\b"
    r"\s*[:=]\s*(?:\"(?:\\.|[^\"])*\"|'(?:\\.|[^'])*'|[^\r\n,;}]+)"
)
_ERROR_UNCLOSED_REASONING_RE = re.compile(
    rf"(?is)<\s*{_REASONING_TAG_NAME_PATTERN}\b[^>]*>.*$|<\|begin_of_thought\|>.*$"
)


def _sanitize_error_text(value: object) -> str:
    """Remove reasoning material before it can enter errors or callbacks."""

    cleaned = str(value or "")
    for pattern in REASONING_BLOCK_RE_LIST:
        cleaned = pattern.sub("[reasoning suppressed]", cleaned)
    cleaned = _ERROR_UNCLOSED_REASONING_RE.sub("[reasoning suppressed]", cleaned)
    cleaned = _ERROR_REASONING_LABEL_RE.sub("[reasoning suppressed]", cleaned)
    if _STREAM_REASONING_RESIDUE_RE.search(cleaned):
        return "[reasoning suppressed]"
    return _truncate_error_detail(cleaned.strip())


def _extract_provider_message(response_body: str) -> str:
    normalized_body = str(response_body or "").strip()
    if not normalized_body:
        return ""
    try:
        payload = json.loads(normalized_body)
    except json.JSONDecodeError:
        # An unstructured body cannot be proven to exclude a provider's
        # reasoning trace, so HTTP/SSE error handling fails closed.
        return ""
    if isinstance(payload, dict):
        error_payload = payload.get("error")
        if isinstance(error_payload, dict):
            for key in ("message", "detail", "code", "type"):
                value = error_payload.get(key)
                if isinstance(value, str) and value.strip():
                    return _sanitize_error_text(value)
        elif isinstance(error_payload, str) and error_payload.strip():
            return _sanitize_error_text(error_payload)
        for key in ("message", "detail", "error"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return _sanitize_error_text(value)
    return ""


def _parse_retry_after_seconds(value: object) -> float | None:
    if value is None:
        return None
    raw_value = str(value).strip()
    if not raw_value:
        return None
    try:
        seconds = float(raw_value)
        if seconds >= 0:
            return min(MAX_RETRY_SLEEP_SECONDS, seconds)
    except ValueError:
        pass
    try:
        retry_at = parsedate_to_datetime(raw_value)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        seconds = (retry_at - datetime.now(timezone.utc)).total_seconds()
        if seconds > 0:
            return min(MAX_RETRY_SLEEP_SECONDS, seconds)
    except (TypeError, ValueError, OverflowError):
        return None
    return None


def _cooldown_seconds_for(category: str, retry_after_seconds: float | None) -> float | None:
    base_seconds = COOLDOWN_BY_ERROR_CATEGORY.get(category)
    if base_seconds is None and retry_after_seconds is None:
        return None
    return max(float(base_seconds or 0), float(retry_after_seconds or 0))


def _format_final_error(message: str, attempt: int, retried: bool) -> str:
    if not retried:
        return message
    return f"{message} (after {attempt} attempts)"


def _calculate_retry_delay(attempt: int, retry_backoff_seconds: float, retry_after_seconds: float | None = None) -> float:
    delay = retry_backoff_seconds * (2 ** max(attempt - 1, 0))
    if retry_after_seconds is not None:
        delay = max(delay, retry_after_seconds)
    delay = min(MAX_RETRY_SLEEP_SECONDS, max(0.0, delay))
    jitter_ceiling = min(MAX_RETRY_SLEEP_SECONDS, delay * (1 + RETRY_JITTER_RATIO))
    if jitter_ceiling > delay:
        delay = random.uniform(delay, jitter_ceiling)
    return min(MAX_RETRY_SLEEP_SECONDS, max(0.0, delay))


def _emit_retry_callback(retry_callback: RetryCallback | None, payload: dict[str, object]) -> None:
    if retry_callback is None:
        return
    try:
        retry_callback(payload)
    except Exception:
        return


def _handle_request_failure(
    *,
    exc: BaseException,
    message: str,
    category: str,
    retryable: bool,
    attempt: int,
    attempts: int,
    endpoint: str,
    retry_backoff_seconds: float,
    retry_callback: RetryCallback | None,
    status_code: int | None = None,
    retry_after_seconds: float | None = None,
    provider_message: str = "",
    total_deadline: float | None = None,
) -> bool:
    """Common retry-or-raise for the three transport exception branches.

    Raises the final :class:`LLMRequestError` when the attempt is exhausted or
    the error is not retryable. Otherwise emits a retry-callback payload,
    sleeps the computed backoff, and returns True so the caller can ``continue``
    the retry loop. Keeping this logic in one place eliminates three near-identical
    60-line blocks in :func:`_send_json_request`.
    """

    cooldown_seconds = _cooldown_seconds_for(category, retry_after_seconds)
    if attempt >= attempts or not retryable:
        raise LLMRequestError(
            _format_final_error(message, attempt, attempt > 1),
            category=category,
            status_code=status_code if status_code is not None else None,
            retryable=retryable,
            attempts=attempt,
            endpoint=endpoint,
            retry_after_seconds=retry_after_seconds,
            cooldown_seconds=cooldown_seconds,
            provider_message=provider_message,
        ) from exc
    retry_delay_seconds = _calculate_retry_delay(attempt, retry_backoff_seconds, retry_after_seconds)
    if total_deadline is not None:
        remaining_seconds = _remaining_stream_seconds(total_deadline)
        if remaining_seconds <= 0 or retry_delay_seconds >= remaining_seconds:
            raise LLMRequestError(
                "LLM stream exceeded the local wall-clock deadline.",
                category="timeout",
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
                provider_message="",
            )
    payload: dict[str, object] = {
        "attempt": attempt,
        "maxAttempts": attempts,
        "nextAttempt": attempt + 1,
        "category": category,
        "retryable": retryable,
        "retryDelaySeconds": retry_delay_seconds,
        "cooldownSeconds": cooldown_seconds,
        "endpoint": endpoint,
        # Retry progress is deliberately metadata-only. The final exception may
        # carry a sanitized provider message, but callbacks are commonly logged
        # or persisted by callers and therefore never receive provider text.
        "providerMessage": "",
        "message": f"LLM request retry scheduled ({category}).",
    }
    if status_code is not None:
        payload["statusCode"] = status_code
    if retry_after_seconds is not None:
        payload["retryAfterSeconds"] = retry_after_seconds
    _emit_retry_callback(retry_callback, payload)
    time.sleep(retry_delay_seconds)
    return True


def _send_json_request(
    http_request: request.Request,
    *,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
    retry_callback: RetryCallback | None = None,
) -> tuple[dict[str, object], int, str]:
    last_message = "LLM request failed."
    attempts = max(1, max_retries + 1)
    endpoint = str(http_request.full_url)

    for attempt in range(1, attempts + 1):
        try:
            with request.urlopen(http_request, timeout=timeout) as response:
                response_body = response.read().decode("utf-8")
                status_code = getattr(response, "status", 200)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            status_code = int(exc.code)
            category = _classify_http_status(status_code)
            provider_message = _extract_provider_message(detail)
            retry_after_seconds = _parse_retry_after_seconds(exc.headers.get("Retry-After") if exc.headers else None)
            retryable = _is_transient_http_status(status_code)
            detail_text = provider_message or "upstream HTTP error"
            last_message = f"LLM request failed with status {status_code}: {detail_text}"
            if _handle_request_failure(
                exc=exc,
                message=last_message,
                category=category,
                retryable=retryable,
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                status_code=status_code,
                retry_after_seconds=retry_after_seconds,
                provider_message=provider_message,
            ):
                continue
        except error.URLError as exc:
            category = _classify_url_reason(exc.reason)
            retryable = _is_transient_url_reason(exc.reason)
            last_message = f"LLM request failed: {exc.reason}"
            if _handle_request_failure(
                exc=exc,
                message=last_message,
                category=category,
                retryable=retryable,
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                provider_message=str(exc.reason),
            ):
                continue
        except OSError as exc:
            category = _classify_url_reason(exc)
            retryable = _is_transient_url_reason(exc)
            last_message = f"LLM request failed: {exc}"
            if _handle_request_failure(
                exc=exc,
                message=last_message,
                category=category,
                retryable=retryable,
                attempt=attempt,
                attempts=attempts,
                endpoint=endpoint,
                retry_backoff_seconds=retry_backoff_seconds,
                retry_callback=retry_callback,
                provider_message=str(exc),
            ):
                continue

        try:
            data = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise LLMRequestError(
                "Unexpected LLM response payload.",
                category="response_parse",
                status_code=int(status_code),
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
                provider_message=_extract_provider_message(response_body),
            ) from exc
        if not isinstance(data, dict):
            raise LLMRequestError(
                "Unexpected LLM response payload.",
                category="response_parse",
                status_code=int(status_code),
                retryable=False,
                attempts=attempt,
                endpoint=endpoint,
                provider_message=_extract_provider_message(response_body),
            )
        return data, int(status_code), response_body

    raise LLMRequestError(_format_final_error(last_message, attempts, attempts > 1), attempts=attempts, endpoint=endpoint)


def _normalize_text_fragment(value: object) -> str:
    if not isinstance(value, str):
        return ""
    try:
        return _finalize_stream_answer(value)
    except _SSEProtocolError as exc:
        raise RuntimeError("LLM response contained unmatched or residual reasoning markers.") from exc


def _needs_output_fragment_space(left: str, right: str) -> bool:
    if not left or not right:
        return False
    if left.isspace() or right.isspace():
        return False
    if not (left.isascii() and right.isascii()):
        return False
    if left.isalnum() and right.isalnum():
        return True
    if left in ",;:" and right.isalnum():
        return True
    if left in ".!?" and right.isalpha():
        return True
    if left.isalnum() and right in "([{":
        return True
    return False


def _join_output_fragments(fragments: list[str]) -> str:
    text = ""
    for fragment in fragments:
        normalized = str(fragment or "").strip()
        if not normalized:
            continue
        if not text:
            text = normalized
            continue
        if _needs_output_fragment_space(text[-1], normalized[0]):
            text = f"{text} {normalized}"
        else:
            text = f"{text}{normalized}"
    return text.strip()


def strip_reasoning_blocks(text: str) -> str:
    cleaned = str(text or "")
    for pattern in REASONING_BLOCK_RE_LIST:
        cleaned = pattern.sub("", cleaned)
    cleaned = REASONING_PREFIX_RE.sub("", cleaned)
    return cleaned.strip()


def _extract_text_from_content_parts(parts: object) -> str:
    fragments: list[str] = []

    def visit(node: object) -> None:
        if isinstance(node, str):
            if node.strip():
                fragments.append(node)
            return

        if isinstance(node, list):
            for item in node:
                visit(item)
            return

        if not isinstance(node, dict):
            return

        # Content-part dialects vary between compatible providers.  A private
        # part may advertise its role through ``kind`` or ``object`` while
        # leaving ``type`` empty/text; reject any reasoning-like typed layer
        # before the empty-type final-text compatibility path below.
        if _stream_container_is_thinking(node):
            return
        node_type = str(node.get("type", "") or "").strip().lower()
        if node_type in THINKING_PART_TYPES:
            return

        text_value = node.get("text")
        if isinstance(text_value, str) and text_value.strip() and node_type in FINAL_TEXT_PART_TYPES:
            fragments.append(text_value)
            return

        value_field = node.get("value")
        if isinstance(value_field, str) and value_field.strip() and node_type in FINAL_TEXT_PART_TYPES:
            fragments.append(value_field)
            return

        json_field = node.get("json")
        if json_field is not None and node_type in FINAL_TEXT_PART_TYPES:
            fragments.append(json.dumps(json_field, ensure_ascii=False) if not isinstance(json_field, str) else json_field)
            return

        content_field = node.get("content")
        if node_type in FINAL_TEXT_PART_TYPES and isinstance(content_field, (list, dict, str)):
            visit(content_field)

    visit(parts)
    return _normalize_text_fragment(_join_output_fragments(fragments))


def _extract_text_from_tool_payload(value: object) -> str:
    fragments: list[str] = []

    def add(fragment: object) -> None:
        if isinstance(fragment, str):
            if fragment.strip():
                fragments.append(fragment)
        elif isinstance(fragment, (dict, list)):
            fragments.append(json.dumps(fragment, ensure_ascii=False))

    def visit(node: object) -> None:
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if not isinstance(node, dict):
            return
        function_payload = node.get("function")
        if isinstance(function_payload, dict):
            add(function_payload.get("arguments"))
            return
        add(node.get("arguments"))
        add(node.get("input"))

    visit(value)
    return _normalize_text_fragment(_join_output_fragments(fragments))


def extract_response_text(data: dict[str, object], response_body: str, api_type: str) -> str:
    if api_type == "responses":
        output = data.get("output")
        if isinstance(output, list):
            collected_fragments: list[str] = []
            for item in output:
                if not isinstance(item, dict):
                    continue
                item_type = str(item.get("type", "") or "").strip().lower()
                if item_type in {"function_call", "tool_call"}:
                    extracted = _extract_text_from_tool_payload(item)
                elif item_type == "message":
                    extracted = _extract_text_from_content_parts(item.get("content"))
                elif item_type in FINAL_TEXT_PART_TYPES:
                    extracted = _extract_text_from_content_parts(item)
                else:
                    continue
                if extracted:
                    collected_fragments.append(extracted)
            if collected_fragments:
                return _join_output_fragments(collected_fragments)

        output_text = _normalize_text_fragment(data.get("output_text"))
        if output_text:
            return output_text

        raise RuntimeError("Unexpected LLM response payload.")

    try:
        choices = data["choices"]
        if not isinstance(choices, list) or not choices:
            raise KeyError("choices")
        message = choices[0]["message"]
        if not isinstance(message, dict):
            raise KeyError("message")
        if _stream_container_is_thinking(choices[0]) or _stream_container_is_thinking(message):
            raise RuntimeError("Model returned reasoning text but no final answer content.")
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            cleaned_content = _normalize_text_fragment(content)
            if cleaned_content:
                return cleaned_content

        extracted = _extract_text_from_content_parts(content)
        if extracted:
            return extracted

        tool_text = _extract_text_from_tool_payload(message.get("tool_calls"))
        if tool_text:
            return tool_text
        function_text = _extract_text_from_tool_payload(message.get("function_call"))
        if function_text:
            return function_text

        choice_text = _normalize_text_fragment(choices[0].get("text") if isinstance(choices[0], dict) else None)
        if choice_text:
            return choice_text

        if any(isinstance(message.get(field), str) and str(message.get(field)).strip() for field in THINKING_PART_TYPES):
            raise RuntimeError("Model returned reasoning text but no final answer content.")

        raise TypeError("content")
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("Unexpected LLM response payload.") from exc


def llm_completion(
    prompt: str,
    *,
    model: str,
    api_key: str,
    base_url: str,
    api_type: str | None = None,
    temperature: float = 0.7,
    timeout: int = 120,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_backoff_seconds: float = DEFAULT_RETRY_BACKOFF_SECONDS,
    retry_callback: RetryCallback | None = None,
    stream: bool = DEFAULT_STREAM,
    stream_callback: StreamDeltaCallback | None = None,
) -> str:
    resolved_api_type = normalize_api_type(api_type, base_url)
    effective_api_type = _get_effective_api_type(resolved_api_type, base_url)
    try:
        text, _ = _send_completion_once(
            prompt,
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type=effective_api_type,
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff_seconds=retry_backoff_seconds,
            retry_callback=retry_callback,
            stream=stream,
            stream_callback=stream_callback,
        )
        return text
    except RuntimeError as exc:
        if effective_api_type != "responses" or not _should_fallback_responses_to_chat(base_url, str(exc)):
            raise
        text, _ = _send_completion_once(
            prompt,
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type="chat_completions",
            temperature=temperature,
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff_seconds=retry_backoff_seconds,
            retry_callback=retry_callback,
            stream=stream,
            stream_callback=stream_callback,
        )
        _remember_responses_fallback(base_url)
        return text


def test_llm_connection(
    *,
    model: str,
    api_key: str,
    base_url: str,
    api_type: str | None = None,
    timeout: int = 20,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_backoff_seconds: float = DEFAULT_RETRY_BACKOFF_SECONDS,
) -> dict[str, object]:
    resolved_api_type = normalize_api_type(api_type, base_url)
    effective_api_type = _get_effective_api_type(resolved_api_type, base_url)
    try:
        return _send_test_connection_once(
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type=effective_api_type,
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff_seconds=retry_backoff_seconds,
        )
    except RuntimeError as exc:
        if effective_api_type != "responses" or not _should_fallback_responses_to_chat(base_url, str(exc)):
            raise
        result = _send_test_connection_once(
            model=model,
            api_key=api_key,
            base_url=base_url,
            api_type="chat_completions",
            timeout=timeout,
            max_retries=max_retries,
            retry_backoff_seconds=retry_backoff_seconds,
        )
        _remember_responses_fallback(base_url)
        return result


def list_llm_models(
    *,
    api_key: str,
    base_url: str,
    timeout: int = 20,
    max_retries: int = DEFAULT_MAX_RETRIES,
    retry_backoff_seconds: float = DEFAULT_RETRY_BACKOFF_SECONDS,
) -> dict[str, object]:
    endpoint = build_models_endpoint(base_url)
    http_request = request.Request(
        endpoint,
        headers=build_headers(api_key),
        method="GET",
    )
    data, status_code, response_body = _send_json_request(
        http_request,
        timeout=timeout,
        max_retries=max_retries,
        retry_backoff_seconds=retry_backoff_seconds,
    )

    raw_models = data.get("data")
    if not isinstance(raw_models, list):
        raise LLMRequestError(
            "Unexpected model list payload.",
            category="response_parse",
            status_code=int(status_code),
            retryable=False,
            attempts=max(1, max_retries + 1),
            endpoint=endpoint,
            provider_message=_extract_provider_message(response_body),
        )

    models: list[dict[str, object]] = []
    seen_ids: set[str] = set()
    for item in raw_models:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id", "")).strip()
        if not model_id or model_id in seen_ids:
            continue
        seen_ids.add(model_id)
        created_value = item.get("created")
        created = None
        try:
            if created_value is not None:
                created = int(created_value)
        except (TypeError, ValueError):
            created = None
        models.append(
            {
                "id": model_id,
                "ownedBy": str(item.get("owned_by", "") or ""),
                "created": created,
            }
        )

    models.sort(key=lambda item: str(item.get("id", "")).lower())
    return {
        "ok": True,
        "endpoint": endpoint,
        "status": int(status_code),
        "models": models,
        "total": len(models),
    }


def read_api_config(
    api_key: str | None,
    model: str | None,
    base_url: str | None,
    api_type: str | None = None,
) -> tuple[str | None, str | None, str | None, str | None]:
    resolved_api_key = api_key or os.getenv("FYADR_API_KEY") or os.getenv("OPENAI_API_KEY")
    resolved_model = model or os.getenv("FYADR_MODEL")
    resolved_base_url = (
        base_url
        or os.getenv("FYADR_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
    )
    resolved_api_type = api_type or os.getenv("FYADR_API_TYPE")
    return resolved_api_key, resolved_model, resolved_base_url, resolved_api_type


def chat_completion(
    prompt: str,
    *,
    model: str,
    api_key: str,
    base_url: str,
    temperature: float = 0.7,
    timeout: int = 120,
) -> str:
    return llm_completion(
        prompt,
        model=model,
        api_key=api_key,
        base_url=base_url,
        api_type="chat_completions",
        temperature=temperature,
        timeout=timeout,
    )
