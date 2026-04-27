from __future__ import annotations

import json
import os
import re
import socket
import time
from urllib import error, request


DEFAULT_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "User-Agent": "curl/8.7.1",
}
TRANSIENT_HTTP_STATUS_CODES = {408, 409, 429, 500, 502, 503, 504}
DEFAULT_MAX_RETRIES = 2
DEFAULT_RETRY_BACKOFF_SECONDS = 1.5
THINKING_PART_TYPES = {
    "analysis",
    "reasoning",
    "reasoning_content",
    "reasoning_summary",
    "summary",
    "thinking",
    "thinking_text",
    "think",
}
FINAL_TEXT_PART_TYPES = {
    "",
    "answer",
    "content",
    "final",
    "message_text",
    "output_text",
    "text",
}
REASONING_BLOCK_RE_LIST = (
    re.compile(r"(?is)<think(?:ing)?\b[^>]*>.*?</think(?:ing)?>"),
    re.compile(r"(?is)<reasoning\b[^>]*>.*?</reasoning>"),
    re.compile(r"(?is)<\|begin_of_thought\|>.*?<\|end_of_thought\|>"),
)
REASONING_PREFIX_RE = re.compile(r"(?is)^\s*<(?:think|thinking|reasoning)\b[^>]*>.*?(?=(?:```json|```|\{\s*\"|\[\s*(?:\{|\[|\")))")


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


def build_payload(prompt: str, *, model: str, temperature: float, api_type: str) -> dict[str, object]:
    if api_type == "responses":
        return {
            "model": model,
            "input": prompt,
            "temperature": temperature,
        }

    return {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": temperature,
    }


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


def _is_transient_http_status(status_code: int) -> bool:
    if status_code in TRANSIENT_HTTP_STATUS_CODES:
        return True
    return 520 <= status_code < 600


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


def _format_final_error(message: str, attempt: int, retried: bool) -> str:
    if not retried:
        return message
    return f"{message} (after {attempt} attempts)"


def _sleep_before_retry(attempt: int, retry_backoff_seconds: float) -> None:
    delay = retry_backoff_seconds * (2 ** max(attempt - 1, 0))
    time.sleep(delay)


def _send_json_request(
    http_request: request.Request,
    *,
    timeout: int,
    max_retries: int,
    retry_backoff_seconds: float,
) -> tuple[dict[str, object], int, str]:
    last_message = "LLM request failed."
    attempts = max(1, max_retries + 1)

    for attempt in range(1, attempts + 1):
        try:
            with request.urlopen(http_request, timeout=timeout) as response:
                response_body = response.read().decode("utf-8")
                status_code = getattr(response, "status", 200)
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_message = f"LLM request failed with status {exc.code}: {detail}"
            if attempt >= attempts or not _is_transient_http_status(exc.code):
                raise RuntimeError(_format_final_error(last_message, attempt, attempt > 1)) from exc
            _sleep_before_retry(attempt, retry_backoff_seconds)
            continue
        except error.URLError as exc:
            last_message = f"LLM request failed: {exc.reason}"
            if attempt >= attempts or not _is_transient_url_reason(exc.reason):
                raise RuntimeError(_format_final_error(last_message, attempt, attempt > 1)) from exc
            _sleep_before_retry(attempt, retry_backoff_seconds)
            continue
        except OSError as exc:
            last_message = f"LLM request failed: {exc}"
            if attempt >= attempts or not _is_transient_url_reason(exc):
                raise RuntimeError(_format_final_error(last_message, attempt, attempt > 1)) from exc
            _sleep_before_retry(attempt, retry_backoff_seconds)
            continue

        data = json.loads(response_body)
        if not isinstance(data, dict):
            raise RuntimeError(f"Unexpected LLM response payload: {response_body}")
        return data, int(status_code), response_body

    raise RuntimeError(_format_final_error(last_message, attempts, attempts > 1))


def _normalize_text_fragment(value: object) -> str:
    if not isinstance(value, str):
        return ""
    return strip_reasoning_blocks(value).strip()


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
            normalized = _normalize_text_fragment(node)
            if normalized:
                fragments.append(normalized)
            return

        if isinstance(node, list):
            for item in node:
                visit(item)
            return

        if not isinstance(node, dict):
            return

        node_type = str(node.get("type", "") or "").strip().lower()
        if node_type in THINKING_PART_TYPES:
            return

        text_value = node.get("text")
        normalized_text = _normalize_text_fragment(text_value)
        if normalized_text and node_type in FINAL_TEXT_PART_TYPES:
            fragments.append(normalized_text)
            return

        value_field = _normalize_text_fragment(node.get("value"))
        if value_field and node_type in FINAL_TEXT_PART_TYPES:
            fragments.append(value_field)
            return

        content_field = node.get("content")
        if node_type in FINAL_TEXT_PART_TYPES and isinstance(content_field, (list, dict, str)):
            visit(content_field)

    visit(parts)
    return "".join(fragments).strip()


def extract_response_text(data: dict[str, object], response_body: str, api_type: str) -> str:
    if api_type == "responses":
        output = data.get("output")
        if isinstance(output, list):
            collected_fragments: list[str] = []
            for item in output:
                if not isinstance(item, dict) or item.get("type") != "message":
                    continue
                extracted = _extract_text_from_content_parts(item.get("content"))
                if extracted:
                    collected_fragments.append(extracted)
            if collected_fragments:
                return "".join(collected_fragments).strip()

        output_text = _normalize_text_fragment(data.get("output_text"))
        if output_text:
            return output_text

        raise RuntimeError(f"Unexpected LLM response payload: {response_body}")

    try:
        choices = data["choices"]
        if not isinstance(choices, list) or not choices:
            raise KeyError("choices")
        message = choices[0]["message"]
        if not isinstance(message, dict):
            raise KeyError("message")
        content = message.get("content")
        if isinstance(content, str) and content.strip():
            cleaned_content = strip_reasoning_blocks(content)
            if cleaned_content:
                return cleaned_content

        extracted = _extract_text_from_content_parts(content)
        if extracted:
            return extracted

        if any(_normalize_text_fragment(message.get(field)) for field in THINKING_PART_TYPES):
            raise RuntimeError(
                "Model returned reasoning text but no final answer content. "
                f"Raw payload: {response_body}"
            )

        raise TypeError("content")
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"Unexpected LLM response payload: {response_body}") from exc


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
) -> str:
    resolved_api_type = normalize_api_type(api_type, base_url)
    endpoint = build_endpoint(base_url, resolved_api_type)
    payload = build_payload(prompt, model=model, temperature=temperature, api_type=resolved_api_type)
    body = json.dumps(payload).encode("utf-8")

    http_request = request.Request(
        endpoint,
        data=body,
        headers=build_headers(api_key),
        method="POST",
    )
    data, _, response_body = _send_json_request(
        http_request,
        timeout=timeout,
        max_retries=max_retries,
        retry_backoff_seconds=retry_backoff_seconds,
    )
    return extract_response_text(data, response_body, resolved_api_type)


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
    endpoint = build_endpoint(base_url, resolved_api_type)
    payload = build_payload("ping", model=model, temperature=0, api_type=resolved_api_type)
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
    extract_response_text(data, response_body, resolved_api_type)

    return {
        "ok": True,
        "endpoint": endpoint,
        "model": model,
        "apiType": resolved_api_type,
        "status": int(status_code),
    }


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
        raise RuntimeError(f"Unexpected model list payload: {response_body}")

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
