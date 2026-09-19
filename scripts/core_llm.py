from __future__ import annotations

import asyncio
import codecs
import ipaddress
import inspect
import json
import threading
from dataclasses import dataclass
from typing import Any, AsyncIterator, Awaitable, Callable
from urllib.parse import urlparse
from urllib.request import getproxies, proxy_bypass

import httpx


TRANSIENT_STATUS_CODES = {408, 409, 425, 429, 500, 502, 503, 504}
DeltaCallback = Callable[[str], Awaitable[None] | None]
EventCallback = Callable[[dict[str, Any]], Awaitable[None] | None]
ProxyResolver = Callable[[str], str | None]


class StreamRequestError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        retryable: bool = False,
        received_text: bool = False,
        status_code: int | None = None,
        category: str = "request",
    ) -> None:
        super().__init__(message)
        self.retryable = retryable
        self.received_text = received_text
        self.status_code = status_code
        self.category = category


@dataclass(frozen=True)
class SSEEvent:
    event: str
    data: str


class SSEDecoder:
    """Incremental UTF-8 SSE decoder that accepts arbitrary byte boundaries."""

    def __init__(self) -> None:
        self._decoder = codecs.getincrementaldecoder("utf-8")("replace")
        self._buffer = ""

    def feed(self, data: bytes, *, final: bool = False) -> list[SSEEvent]:
        self._buffer += self._decoder.decode(data, final=final)
        events: list[SSEEvent] = []
        while True:
            boundary = self._event_boundary(self._buffer)
            if boundary is None:
                break
            start, length = boundary
            block = self._buffer[:start]
            self._buffer = self._buffer[start + length :]
            events.append(self._parse_block(block))
        if final and self._buffer:
            events.append(self._parse_block(self._buffer))
            self._buffer = ""
        return events

    @staticmethod
    def _event_boundary(value: str) -> tuple[int, int] | None:
        positions = [(value.find("\n\n"), 2), (value.find("\r\n\r\n"), 4), (value.find("\r\r"), 2)]
        valid = [(position, length) for position, length in positions if position >= 0]
        return min(valid, key=lambda item: item[0]) if valid else None

    @staticmethod
    def _parse_block(block: str) -> SSEEvent:
        event_name = ""
        data_lines: list[str] = []
        for raw_line in block.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
            if not raw_line or raw_line.startswith(":"):
                continue
            field, separator, value = raw_line.partition(":")
            if separator and value.startswith(" "):
                value = value[1:]
            if field == "event":
                event_name = value
            elif field == "data":
                data_lines.append(value)
        return SSEEvent(event=event_name, data="\n".join(data_lines))


async def _invoke(callback: DeltaCallback | EventCallback | None, value: Any) -> None:
    if callback is None:
        return
    result = callback(value)
    if inspect.isawaitable(result):
        await result


def normalize_protocol(value: Any) -> str:
    return "responses" if str(value or "").strip().lower() == "responses" else "chat_completions"


def normalize_reasoning_effort(value: Any) -> str:
    normalized = str(value or "auto").strip().lower()
    allowed = {"auto", "none", "minimal", "low", "medium", "high", "xhigh", "max"}
    return normalized if normalized in allowed else "auto"


def build_endpoint(base_url: str, protocol: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    if not base:
        raise StreamRequestError("接口地址不能为空。")
    if protocol == "responses":
        if base.endswith("/responses"):
            return base
        if base.endswith("/chat/completions"):
            base = base[: -len("/chat/completions")]
        return f"{base}/responses"
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/responses"):
        base = base[: -len("/responses")]
    return f"{base}/chat/completions"


def build_models_endpoint(base_url: str) -> str:
    base = str(base_url or "").strip().rstrip("/")
    for suffix in ("/chat/completions", "/responses"):
        if base.endswith(suffix):
            base = base[: -len(suffix)]
            break
    return f"{base}/models"


def build_payload(profile: dict[str, Any], prompt: str) -> dict[str, Any]:
    protocol = normalize_protocol(profile.get("protocol"))
    provider = str(profile.get("provider") or "custom").strip().lower()
    reasoning_effort = normalize_reasoning_effort(profile.get("reasoningEffort"))
    instructions = str(profile.get("_requestInstructions") or "").strip()
    if protocol == "responses":
        payload: dict[str, Any] = {"model": profile.get("model", ""), "input": prompt, "stream": True}
        if instructions:
            payload["instructions"] = instructions
        if reasoning_effort != "auto":
            payload["reasoning"] = {"effort": reasoning_effort}
    else:
        messages = []
        if instructions:
            messages.append({"role": "system", "content": instructions})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": profile.get("model", ""),
            "messages": messages,
            "stream": True,
        }
        if provider == "deepseek":
            payload["thinking"] = {"type": "disabled" if reasoning_effort == "none" else "enabled"}
            if reasoning_effort not in {"auto", "none"}:
                payload["reasoning_effort"] = reasoning_effort
        elif reasoning_effort != "auto":
            payload["reasoning_effort"] = reasoning_effort
    reasoning_enabled = reasoning_effort not in {"auto", "none"}
    if profile.get("temperature") is not None and not reasoning_enabled:
        payload["temperature"] = float(profile["temperature"])
    return payload


def _headers(profile: dict[str, Any]) -> dict[str, str]:
    headers = {"Accept": "text/event-stream, application/json", "Content-Type": "application/json"}
    api_key = str(profile.get("apiKey") or "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _is_local_url(url: str) -> bool:
    host = (urlparse(url).hostname or "").casefold()
    if host == "localhost" or host.endswith((".localhost", ".local")):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_loopback or address.is_private or address.is_link_local


def resolve_system_proxy(url: str) -> str | None:
    """Resolve environment or Windows system proxy settings for one endpoint."""

    if _is_local_url(url):
        return None
    parsed = urlparse(url)
    host = parsed.hostname or ""
    try:
        if host and proxy_bypass(host):
            return None
    except OSError:
        pass
    proxies = getproxies()
    value = str(proxies.get(parsed.scheme.casefold()) or proxies.get("all") or "").strip()
    if not value:
        return None
    return value if "://" in value else f"http://{value}"


def _extract_content_part(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, list):
        return ""
    pieces: list[str] = []
    for item in value:
        if isinstance(item, str):
            pieces.append(item)
        elif isinstance(item, dict):
            part_type = str(item.get("type") or "")
            if part_type in {"text", "output_text", "message_text", ""}:
                text = item.get("text", item.get("content", ""))
                if isinstance(text, dict):
                    text = text.get("value", "")
                if isinstance(text, str):
                    pieces.append(text)
    return "".join(pieces)


def extract_stream_delta(event: SSEEvent, protocol: str) -> str:
    if not event.data or event.data.strip() == "[DONE]":
        return ""
    try:
        payload = json.loads(event.data)
    except json.JSONDecodeError:
        return ""
    if protocol == "responses":
        event_type = str(payload.get("type") or event.event or "")
        if event_type == "response.output_text.delta":
            delta = payload.get("delta", "")
            return delta if isinstance(delta, str) else ""
        return ""
    choices = payload.get("choices", [])
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        return ""
    delta = choices[0].get("delta", {})
    if not isinstance(delta, dict):
        return ""
    return _extract_content_part(delta.get("content"))


def extract_json_text(payload: Any, protocol: str) -> str:
    if not isinstance(payload, dict):
        return ""
    if protocol == "chat_completions":
        choices = payload.get("choices", [])
        if isinstance(choices, list) and choices and isinstance(choices[0], dict):
            message = choices[0].get("message", {})
            if isinstance(message, dict):
                return _extract_content_part(message.get("content"))
        return ""
    output_text = payload.get("output_text")
    if isinstance(output_text, str):
        return output_text
    pieces: list[str] = []
    output = payload.get("output", [])
    if isinstance(output, list):
        for item in output:
            if not isinstance(item, dict):
                continue
            content = item.get("content", [])
            pieces.append(_extract_content_part(content))
    return "".join(pieces)


def stream_event_terminal_state(event: SSEEvent, protocol: str) -> tuple[bool, str]:
    """Return whether an SSE event ends the response and any explicit provider error."""

    if event.data.strip() == "[DONE]":
        return True, ""
    try:
        payload = json.loads(event.data)
    except (TypeError, json.JSONDecodeError):
        return False, ""
    if not isinstance(payload, dict):
        return False, ""

    raw_error = payload.get("error")
    if isinstance(raw_error, dict):
        message = str(raw_error.get("message") or raw_error.get("code") or "模型服务返回流式错误。")
        return True, message
    if isinstance(raw_error, str) and raw_error.strip():
        return True, raw_error.strip()

    if protocol == "responses":
        event_type = str(payload.get("type") or event.event or "")
        if event_type in {"response.failed", "error"}:
            response = payload.get("response", {})
            response_error = response.get("error", {}) if isinstance(response, dict) else {}
            message = (
                str(response_error.get("message") or response_error.get("code") or "")
                if isinstance(response_error, dict)
                else str(response_error or "")
            )
            return True, message or "模型服务未能完成响应。"
        if event_type == "response.incomplete":
            response = payload.get("response", {})
            details = response.get("incomplete_details", {}) if isinstance(response, dict) else {}
            reason = str(details.get("reason") or "") if isinstance(details, dict) else ""
            suffix = f"（{reason}）" if reason else ""
            return True, f"模型响应未完整结束{suffix}。"
        return event_type == "response.completed", ""

    choices = payload.get("choices", [])
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        finish_reason = choices[0].get("finish_reason")
        if finish_reason is None:
            return False, ""
        normalized = str(finish_reason).strip().lower()
        if normalized in {"stop", "completed"}:
            return True, ""
        labels = {
            "length": "模型输出因长度限制而提前结束。",
            "content_filter": "模型输出被内容过滤器提前终止。",
            "tool_calls": "模型返回了工具调用，而不是完整正文。",
            "function_call": "模型返回了函数调用，而不是完整正文。",
        }
        return True, labels.get(normalized, f"模型响应未完整结束（{finish_reason}）。")
    return False, ""


def json_response_error(payload: Any, protocol: str) -> str:
    """Return an explicit incomplete/error state for a non-streaming fallback response."""

    if not isinstance(payload, dict):
        return ""
    raw_error = payload.get("error")
    if isinstance(raw_error, dict):
        return str(raw_error.get("message") or raw_error.get("code") or "模型服务返回错误。")
    if isinstance(raw_error, str) and raw_error.strip():
        return raw_error.strip()
    if protocol == "responses":
        status = str(payload.get("status") or "").strip().lower()
        if status in {"failed", "cancelled", "incomplete"}:
            details = payload.get("incomplete_details", {})
            reason = str(details.get("reason") or "") if isinstance(details, dict) else ""
            return f"模型响应未完整结束{f'（{reason}）' if reason else ''}。"
        return ""
    choices = payload.get("choices", [])
    if isinstance(choices, list) and choices and isinstance(choices[0], dict):
        finish_reason = choices[0].get("finish_reason")
        if finish_reason is not None and str(finish_reason).strip().lower() not in {"stop", "completed"}:
            _done, message = stream_event_terminal_state(
                SSEEvent(event="", data=json.dumps({"choices": [{"finish_reason": finish_reason}]})),
                protocol,
            )
            return message
    return ""


async def _next_with_timeout(iterator: AsyncIterator[bytes], timeout: float, label: str) -> bytes:
    try:
        return await asyncio.wait_for(anext(iterator), timeout=timeout)
    except asyncio.TimeoutError as exc:
        raise StreamRequestError(f"等待{label}超时。", retryable=True, category="timeout") from exc


class StreamingLLMClient:
    def __init__(
        self,
        client_factory: Callable[..., httpx.AsyncClient] | None = None,
        proxy_resolver: ProxyResolver | None = None,
    ) -> None:
        self._client_factory = client_factory or httpx.AsyncClient
        self._proxy_resolver = proxy_resolver or resolve_system_proxy
        self._proxy_cache: dict[str, str | None] = {}
        self._proxy_cache_lock = threading.Lock()
        self._proxy_resolve_locks: dict[str, threading.Lock] = {}

    @staticmethod
    def _proxy_cache_key(endpoint: str) -> str:
        parsed = urlparse(endpoint)
        host = (parsed.hostname or "").casefold()
        port = f":{parsed.port}" if parsed.port is not None else ""
        return f"{parsed.scheme.casefold()}://{host}{port}"

    def _resolve_proxy_once(self, endpoint: str) -> str | None:
        key = self._proxy_cache_key(endpoint)
        with self._proxy_cache_lock:
            if key in self._proxy_cache:
                return self._proxy_cache[key]
            resolve_lock = self._proxy_resolve_locks.setdefault(key, threading.Lock())

        with resolve_lock:
            with self._proxy_cache_lock:
                if key in self._proxy_cache:
                    return self._proxy_cache[key]
            proxy = self._proxy_resolver(endpoint)
            with self._proxy_cache_lock:
                self._proxy_cache[key] = proxy
                self._proxy_resolve_locks.pop(key, None)
            return proxy

    async def _resolve_proxy(self, endpoint: str) -> str | None:
        if _is_local_url(endpoint):
            return None
        return await asyncio.to_thread(self._resolve_proxy_once, endpoint)

    async def _make_client(self, endpoint: str, profile: dict[str, Any]) -> httpx.AsyncClient:
        timeout = httpx.Timeout(
            connect=float(profile.get("connectTimeoutSeconds", 15)),
            read=None,
            write=float(profile.get("connectTimeoutSeconds", 15)),
            pool=float(profile.get("connectTimeoutSeconds", 15)),
        )
        if _is_local_url(endpoint):
            return self._client_factory(timeout=timeout, trust_env=False, follow_redirects=True)
        proxy = await self._resolve_proxy(endpoint)
        if proxy:
            return self._client_factory(timeout=timeout, proxy=proxy, trust_env=False, follow_redirects=True)
        return self._client_factory(timeout=timeout, trust_env=True, follow_redirects=True)

    async def stream_completion(
        self,
        profile: dict[str, Any],
        prompt: str,
        on_delta: DeltaCallback,
        on_attempt: EventCallback | None = None,
    ) -> str:
        retries = max(0, int(profile.get("maxRetries", 2)))
        last_error: StreamRequestError | None = None
        for attempt in range(retries + 1):
            if attempt:
                await _invoke(on_attempt, {"attempt": attempt + 1, "retry": True})
                await asyncio.sleep(min(2 ** (attempt - 1), 4))
            try:
                return await self._stream_once(profile, prompt, on_delta)
            except asyncio.CancelledError:
                raise
            except StreamRequestError as exc:
                last_error = exc
                if exc.received_text or not exc.retryable or attempt >= retries:
                    raise
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last_error = StreamRequestError("网络连接失败。", retryable=True, category="network")
                if attempt >= retries:
                    raise last_error from exc
        raise last_error or StreamRequestError("请求失败。")

    async def _stream_once(self, profile: dict[str, Any], prompt: str, on_delta: DeltaCallback) -> str:
        protocol = normalize_protocol(profile.get("protocol"))
        endpoint = build_endpoint(str(profile.get("baseUrl") or ""), protocol)
        first_timeout = float(profile.get("firstEventTimeoutSeconds", 300))
        idle_timeout = float(profile.get("idleTimeoutSeconds", 180))
        received_text = False
        pieces: list[str] = []
        try:
            async with await self._make_client(endpoint, profile) as client:
                async with client.stream(
                    "POST", endpoint, headers=_headers(profile), json=build_payload(profile, prompt)
                ) as response:
                    if response.status_code >= 400:
                        detail = (await response.aread()).decode("utf-8", errors="replace")[:500]
                        raise StreamRequestError(
                            f"模型服务返回 {response.status_code}：{detail or '请求未成功'}",
                            retryable=response.status_code in TRANSIENT_STATUS_CODES,
                            status_code=response.status_code,
                            category="http",
                        )
                    content_type = response.headers.get("content-type", "").lower()
                    iterator = response.aiter_bytes()
                    if "text/event-stream" not in content_type:
                        raw = await self._read_json_bytes(iterator, first_timeout, idle_timeout)
                        try:
                            value = json.loads(raw.decode("utf-8"))
                        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                            raise StreamRequestError("模型返回了无法识别的内容。") from exc
                        response_error = json_response_error(value, protocol)
                        if response_error:
                            raise StreamRequestError(response_error, category="provider")
                        text = extract_json_text(value, protocol)
                        if not text.strip():
                            raise StreamRequestError("模型返回了空内容。", category="empty")
                        await _invoke(on_delta, text)
                        return text

                    decoder = SSEDecoder()
                    first_event = True
                    stream_done = False
                    deadline = asyncio.get_running_loop().time() + first_timeout
                    while not stream_done:
                        timeout = max(0.001, deadline - asyncio.get_running_loop().time())
                        try:
                            block = await _next_with_timeout(iterator, timeout, "首个响应" if first_event else "后续响应")
                        except StopAsyncIteration:
                            break
                        events = decoder.feed(block)
                        for event in events:
                            first_event = False
                            deadline = asyncio.get_running_loop().time() + idle_timeout
                            delta = extract_stream_delta(event, protocol)
                            if delta:
                                received_text = True
                                pieces.append(delta)
                                await _invoke(on_delta, delta)
                            stream_done, provider_error = stream_event_terminal_state(event, protocol)
                            if provider_error:
                                raise StreamRequestError(
                                    provider_error,
                                    retryable=not received_text,
                                    received_text=received_text,
                                    category="provider",
                                )
                            if stream_done:
                                break
                    if not stream_done:
                        for event in decoder.feed(b"", final=True):
                            delta = extract_stream_delta(event, protocol)
                            if delta:
                                received_text = True
                                pieces.append(delta)
                                await _invoke(on_delta, delta)
                            stream_done, provider_error = stream_event_terminal_state(event, protocol)
                            if provider_error:
                                raise StreamRequestError(
                                    provider_error,
                                    retryable=not received_text,
                                    received_text=received_text,
                                    category="provider",
                                )
                            if stream_done:
                                break
                    if not stream_done:
                        raise StreamRequestError(
                            "模型流在完整结束标记到达前中断。",
                            retryable=not received_text,
                            received_text=received_text,
                            category="incomplete",
                        )
        except asyncio.CancelledError:
            raise
        except StreamRequestError as exc:
            exc.received_text = exc.received_text or received_text
            raise
        except httpx.TimeoutException as exc:
            raise StreamRequestError(
                "连接模型服务超时。", retryable=not received_text, received_text=received_text, category="timeout"
            ) from exc
        except httpx.TransportError as exc:
            message = (
                "模型连接在生成过程中中断，已保留预览，请继续未完成内容。"
                if received_text
                else "模型连接中断，请检查网络后重试。"
            )
            raise StreamRequestError(
                message, retryable=not received_text, received_text=received_text, category="network"
            ) from exc
        result = "".join(pieces)
        if not result.strip():
            raise StreamRequestError("模型返回了空内容。", category="empty")
        return result

    @staticmethod
    async def _read_json_bytes(iterator: AsyncIterator[bytes], first_timeout: float, idle_timeout: float) -> bytes:
        blocks: list[bytes] = []
        first = True
        while True:
            try:
                block = await _next_with_timeout(iterator, first_timeout if first else idle_timeout, "模型响应")
            except StopAsyncIteration:
                break
            blocks.append(block)
            first = False
        return b"".join(blocks)

    async def list_models(self, profile: dict[str, Any]) -> list[str]:
        endpoint = build_models_endpoint(str(profile.get("baseUrl") or ""))
        async with await self._make_client(endpoint, profile) as client:
            try:
                response = await client.get(endpoint, headers=_headers(profile))
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                raise StreamRequestError("无法连接模型服务。", retryable=True, category="network") from exc
        if response.status_code >= 400:
            raise StreamRequestError(f"获取模型列表失败（{response.status_code}）。", status_code=response.status_code)
        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            raise StreamRequestError("模型列表响应不是有效 JSON。") from exc
        values = payload.get("data", payload.get("models", [])) if isinstance(payload, dict) else []
        models: list[str] = []
        if isinstance(values, list):
            for item in values:
                model_id = item.get("id", item.get("name", "")) if isinstance(item, dict) else item
                if str(model_id or "").strip():
                    models.append(str(model_id).strip())
        return list(dict.fromkeys(models))

    async def test_connection(self, profile: dict[str, Any]) -> str:
        pieces: list[str] = []

        async def collect(delta: str) -> None:
            pieces.append(delta)

        result = await self.stream_completion(profile, "请只回复：连接成功", collect)
        return result.strip()
