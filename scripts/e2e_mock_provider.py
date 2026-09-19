from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator
from threading import Lock

from flask import Flask, Response, jsonify, request


app = Flask(__name__)
API_KEY_LABELS = {
    "e2e-local-key": "primary",
    "e2e-second-key": "secondary",
}
REQUEST_LOG: list[dict[str, str]] = []
REQUEST_LOG_LOCK = Lock()


def unauthorized() -> tuple[Response, int] | None:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if token in API_KEY_LABELS:
        return None
    return jsonify({"error": {"message": "missing or invalid test key"}}), 401


def credential_label() -> str:
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    return API_KEY_LABELS.get(token, "unknown")


@app.get("/health")
def health() -> Response:
    return jsonify({"ok": True})


@app.get("/stats")
def stats() -> Response:
    with REQUEST_LOG_LOCK:
        return jsonify({"requests": list(REQUEST_LOG)})


@app.get("/v1/models")
def models() -> Response:
    denied = unauthorized()
    if denied:
        return denied
    time.sleep(0.6)
    return jsonify({"data": [{"id": "example-chat"}]})


def requested_text() -> str:
    payload = request.get_json(silent=True) or {}
    messages = payload.get("messages", [])
    if isinstance(messages, list) and messages and isinstance(messages[-1], dict):
        return str(messages[-1].get("content") or "")
    return str(payload.get("input") or "")


def rewrite_fixture(source: str) -> str:
    result = source.replace("10", "11")
    if "本文使用" in result:
        return result.replace("本文使用", "本文采用")
    if "本文采用" in result:
        return result.replace("本文采用", "本研究采用")
    return result


@app.post("/v1/chat/completions")
def chat_completions() -> Response:
    denied = unauthorized()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    prompt = requested_text()
    with REQUEST_LOG_LOCK:
        REQUEST_LOG.append(
            {
                "credential": credential_label(),
                "model": str(payload.get("model") or ""),
                "prompt": prompt,
            }
        )
    source = prompt.rsplit("待改写内容：\n", 1)[-1]
    result = "连接成功" if prompt.strip() == "请只回复：连接成功" else rewrite_fixture(source)

    def generate() -> Iterator[str]:
        for index in range(0, len(result), 2):
            delta = result[index : index + 2]
            payload = {"choices": [{"delta": {"content": delta}}]}
            yield f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"
            time.sleep(0.12)
        yield "data: [DONE]\n\n"

    return Response(generate(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache"})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.getenv("FYADR_MOCK_PORT", "18999")),
        threaded=True,
        use_reloader=False,
    )
