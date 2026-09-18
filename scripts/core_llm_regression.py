from __future__ import annotations

import asyncio
import json
import unittest
from typing import AsyncIterator
from unittest.mock import patch

import httpx

from core_llm import SSEDecoder, StreamRequestError, StreamingLLMClient, build_payload, resolve_system_proxy


class ChunkStream(httpx.AsyncByteStream):
    def __init__(self, chunks: list[bytes], *, delay: float = 0, failure: Exception | None = None) -> None:
        self.chunks = chunks
        self.delay = delay
        self.failure = failure

    async def __aiter__(self) -> AsyncIterator[bytes]:
        for chunk in self.chunks:
            if self.delay:
                await asyncio.sleep(self.delay)
            yield chunk
        if self.failure:
            raise self.failure

    async def aclose(self) -> None:
        return None


def profile(**values: object) -> dict[str, object]:
    result: dict[str, object] = {
        "baseUrl": "https://example.test/v1",
        "apiKey": "secret",
        "model": "test-model",
        "provider": "custom",
        "protocol": "chat_completions",
        "reasoningEffort": "auto",
        "temperature": None,
        "connectTimeoutSeconds": 1,
        "firstEventTimeoutSeconds": 1,
        "idleTimeoutSeconds": 1,
        "maxRetries": 0,
    }
    result.update(values)
    return result


def client_for(handler):
    transport = httpx.MockTransport(handler)
    return StreamingLLMClient(
        lambda **kwargs: httpx.AsyncClient(transport=transport, **kwargs),
        proxy_resolver=lambda _url: None,
    )


class CoreLLMRegression(unittest.IsolatedAsyncioTestCase):
    async def test_deepseek_models_are_loaded_from_the_official_models_endpoint(self) -> None:
        captured: list[tuple[str, str]] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append((str(request.url), request.headers.get("authorization", "")))
            return httpx.Response(
                200,
                json={"data": [{"id": "deepseek-current"}, {"id": "deepseek-next"}]},
            )

        client = client_for(handler)
        models = await client.list_models(
            profile(
                provider="deepseek",
                baseUrl="https://api.deepseek.com",
                apiKey="deepseek-secret",
                model="",
            )
        )
        self.assertEqual(models, ["deepseek-current", "deepseek-next"])
        self.assertEqual(captured, [("https://api.deepseek.com/models", "Bearer deepseek-secret")])

    def test_proxy_resolver_reads_system_settings_and_respects_bypass(self) -> None:
        with (
            patch("core_llm.getproxies", return_value={"https": "proxy.test:8080"}),
            patch("core_llm.proxy_bypass", return_value=False),
        ):
            self.assertEqual(resolve_system_proxy("https://api.example.test/v1"), "http://proxy.test:8080")
            self.assertIsNone(resolve_system_proxy("http://127.0.0.1:9000/v1"))

        with (
            patch("core_llm.getproxies", return_value={"https": "http://proxy.test:8080"}),
            patch("core_llm.proxy_bypass", return_value=True),
        ):
            self.assertIsNone(resolve_system_proxy("https://bypass.example.test/v1"))

    def test_sse_decoder_accepts_multiline_and_arbitrary_utf8_splits(self) -> None:
        raw = "event: message\r\ndata: {\"a\":\r\ndata: \"你\"}\r\n\r\n".encode()
        decoder = SSEDecoder()
        events = []
        for byte in raw:
            events.extend(decoder.feed(bytes([byte])))
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0].event, "message")
        self.assertEqual(json.loads(events[0].data), {"a": "你"})

    async def test_chat_stream_and_payload_has_no_output_limit(self) -> None:
        captured: list[dict[str, object]] = []
        body = (
            'data: {"choices":[\n'
            'data: {"delta":{"content":"你"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"好"}}]}\n\n'
            "data: [DONE]\n\n"
        ).encode()

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(json.loads(request.content))
            chunks = [body[index : index + 3] for index in range(0, len(body), 3)]
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream(chunks))

        deltas: list[str] = []
        result = await client_for(handler).stream_completion(profile(), "改写", deltas.append)
        self.assertEqual(result, "你好")
        self.assertEqual(deltas, ["你", "好"])
        self.assertNotIn("max_tokens", captured[0])
        self.assertNotIn("max_output_tokens", captured[0])

    async def test_responses_stream_is_explicit(self) -> None:
        requested_urls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            requested_urls.append(str(request.url))
            data = (
                'event: response.output_text.delta\n'
                'data: {"type":"response.output_text.delta","delta":"结果"}\n\n'
                'event: response.completed\n'
                'data: {"type":"response.completed","response":{"status":"completed"}}\n\n'
            ).encode()
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        pieces: list[str] = []
        result = await client_for(handler).stream_completion(profile(protocol="responses"), "改写", pieces.append)
        self.assertEqual(result, "结果")
        self.assertTrue(requested_urls[0].endswith("/v1/responses"))

    async def test_plain_json_fallback(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"choices": [{"message": {"content": "普通结果"}}]})

        pieces: list[str] = []
        result = await client_for(handler).stream_completion(profile(), "改写", pieces.append)
        self.assertEqual(result, "普通结果")
        self.assertEqual(pieces, ["普通结果"])

    async def test_done_event_finishes_without_waiting_for_connection_close(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            first = (
                b'data: {"choices":[{"delta":{"content":"done"}}]}\n\n'
                b"data: [DONE]\n\n"
            )
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                stream=ChunkStream([first, b": still-open\n\n"], delay=0.2),
            )

        started = asyncio.get_running_loop().time()
        result = await client_for(handler).stream_completion(
            profile(idleTimeoutSeconds=0.05), "test", lambda _delta: None
        )
        elapsed = asyncio.get_running_loop().time() - started
        self.assertEqual(result, "done")
        self.assertLess(elapsed, 0.35)

    async def test_provider_error_after_text_pauses_without_retry(self) -> None:
        calls = 0

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            data = (
                b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
                b'data: {"error":{"message":"provider failed"}}\n\n'
            )
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(
                profile(maxRetries=3), "test", lambda _delta: None
            )
        self.assertTrue(caught.exception.received_text)
        self.assertEqual(caught.exception.category, "provider")
        self.assertEqual(calls, 1)

    async def test_transient_failure_retries_only_before_text(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise httpx.ConnectError("offline", request=request)
            data = (
                b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
                b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            )
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        result = await client_for(handler).stream_completion(profile(maxRetries=1), "test", lambda _delta: None)
        self.assertEqual(result, "ok")
        self.assertEqual(calls, 2)

    async def test_interruption_after_text_does_not_retry(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            data = b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
            failure = httpx.ReadError("broken", request=request)
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data], failure=failure))

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(profile(maxRetries=3), "test", lambda _delta: None)
        self.assertTrue(caught.exception.received_text)
        self.assertEqual(calls, 1)

    async def test_remote_protocol_error_before_text_retries(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            if calls == 1:
                raise httpx.RemoteProtocolError("peer closed connection", request=request)
            data = (
                b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n'
                b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n'
            )
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        result = await client_for(handler).stream_completion(profile(maxRetries=1), "test", lambda _delta: None)
        self.assertEqual(result, "ok")
        self.assertEqual(calls, 2)

    async def test_remote_protocol_error_after_text_pauses_with_user_message(self) -> None:
        calls = 0

        def handler(request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            data = b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
            failure = httpx.RemoteProtocolError("peer closed connection without complete body", request=request)
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                stream=ChunkStream([data], failure=failure),
            )

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(profile(maxRetries=3), "test", lambda _delta: None)
        self.assertEqual(caught.exception.category, "network")
        self.assertTrue(caught.exception.received_text)
        self.assertEqual(
            str(caught.exception),
            "模型连接在生成过程中中断，已保留预览，请继续未完成内容。",
        )
        self.assertEqual(calls, 1)

    async def test_first_event_timeout_and_cancellation(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                stream=ChunkStream([b": keepalive"], delay=0.2),
            )

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(
                profile(firstEventTimeoutSeconds=0.02), "test", lambda _delta: None
            )
        self.assertEqual(caught.exception.category, "timeout")

        task = asyncio.create_task(
            client_for(handler).stream_completion(profile(firstEventTimeoutSeconds=10), "test", lambda _delta: None)
        )
        await asyncio.sleep(0.01)
        task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await task

    async def test_system_proxy_is_used_externally_and_bypassed_locally(self) -> None:
        client_options: list[tuple[bool, str | None]] = []

        def handler(_request: httpx.Request) -> httpx.Response:
            data = b'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n'
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        transport = httpx.MockTransport(handler)

        def factory(**kwargs):
            client_options.append((bool(kwargs.get("trust_env")), kwargs.pop("proxy", None)))
            return httpx.AsyncClient(transport=transport, **kwargs)

        client = StreamingLLMClient(
            factory,
            proxy_resolver=lambda url: "http://proxy.test:8080" if "example.test" in url else None,
        )
        await client.stream_completion(profile(baseUrl="https://example.test/v1"), "test", lambda _delta: None)
        await client.stream_completion(profile(baseUrl="http://127.0.0.1:9000/v1"), "test", lambda _delta: None)
        await client.stream_completion(profile(baseUrl="http://192.168.1.50:9000/v1"), "test", lambda _delta: None)
        await client.stream_completion(profile(baseUrl="http://model-server.local:9000/v1"), "test", lambda _delta: None)
        self.assertEqual(
            client_options,
            [
                (False, "http://proxy.test:8080"),
                (False, None),
                (False, None),
                (False, None),
            ],
        )

    async def test_responses_incomplete_is_never_accepted(self) -> None:
        calls = 0

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            data = (
                b'event: response.output_text.delta\n'
                b'data: {"type":"response.output_text.delta","delta":"partial"}\n\n'
                b'event: response.incomplete\n'
                b'data: {"type":"response.incomplete","response":{"incomplete_details":{"reason":"max_output_tokens"}}}\n\n'
            )
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(
                profile(protocol="responses", maxRetries=3), "test", lambda _delta: None
            )
        self.assertTrue(caught.exception.received_text)
        self.assertEqual(caught.exception.category, "provider")
        self.assertIn("未完整结束", str(caught.exception))
        self.assertEqual(calls, 1)

    async def test_chat_length_finish_reason_is_never_accepted(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            data = (
                b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
                b'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n'
            )
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(profile(), "test", lambda _delta: None)
        self.assertTrue(caught.exception.received_text)
        self.assertIn("长度限制", str(caught.exception))

    async def test_connection_close_without_terminal_marker_is_incomplete(self) -> None:
        calls = 0

        def handler(_request: httpx.Request) -> httpx.Response:
            nonlocal calls
            calls += 1
            data = b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'
            return httpx.Response(200, headers={"content-type": "text/event-stream"}, stream=ChunkStream([data]))

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(profile(maxRetries=3), "test", lambda _delta: None)
        self.assertEqual(caught.exception.category, "incomplete")
        self.assertTrue(caught.exception.received_text)
        self.assertEqual(calls, 1)

    async def test_plain_json_incomplete_finish_reason_is_rejected(self) -> None:
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "partial"}, "finish_reason": "length"}]},
            )

        with self.assertRaises(StreamRequestError) as caught:
            await client_for(handler).stream_completion(profile(), "test", lambda _delta: None)
        self.assertEqual(caught.exception.category, "provider")
        self.assertIn("长度限制", str(caught.exception))

    def test_payload_builder_never_adds_token_limit(self) -> None:
        for protocol in ("chat_completions", "responses"):
            payload = build_payload(profile(protocol=protocol), "hello")
            self.assertNotIn("max_tokens", payload)
            self.assertNotIn("max_output_tokens", payload)

    def test_openai_compatible_reasoning_uses_each_protocol_shape(self) -> None:
        chat = build_payload(profile(reasoningEffort="medium", temperature=0.8), "hello")
        self.assertEqual(chat["reasoning_effort"], "medium")
        self.assertNotIn("reasoning", chat)
        self.assertNotIn("temperature", chat)

        responses = build_payload(
            profile(protocol="responses", reasoningEffort="high", temperature=0.8), "hello"
        )
        self.assertEqual(responses["reasoning"], {"effort": "high"})
        self.assertNotIn("reasoning_effort", responses)
        self.assertNotIn("temperature", responses)

    def test_deepseek_payload_follows_official_thinking_controls(self) -> None:
        thinking = build_payload(
            profile(provider="deepseek", reasoningEffort="high", temperature=0.7), "hello"
        )
        self.assertEqual(thinking["thinking"], {"type": "enabled"})
        self.assertEqual(thinking["reasoning_effort"], "high")
        self.assertNotIn("temperature", thinking)

        direct = build_payload(
            profile(provider="deepseek", reasoningEffort="none", temperature=0.7), "hello"
        )
        self.assertEqual(direct["thinking"], {"type": "disabled"})
        self.assertNotIn("reasoning_effort", direct)
        self.assertEqual(direct["temperature"], 0.7)

        responses = build_payload(
            profile(provider="deepseek", protocol="responses", reasoningEffort="max"), "hello"
        )
        self.assertEqual(responses["reasoning"], {"effort": "max"})
        self.assertNotIn("thinking", responses)


if __name__ == "__main__":
    unittest.main()
