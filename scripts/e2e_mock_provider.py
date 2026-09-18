from __future__ import annotations

import json
import os
import time
from collections.abc import Iterator

from flask import Flask, Response, jsonify, request


app = Flask(__name__)
EXPECTED_API_KEY = "e2e-local-key"


def unauthorized() -> tuple[Response, int] | None:
    if request.headers.get("Authorization") == f"Bearer {EXPECTED_API_KEY}":
        return None
    return jsonify({"error": {"message": "missing or invalid test key"}}), 401


@app.get("/health")
def health() -> Response:
    return jsonify({"ok": True})


@app.get("/v1/models")
def models() -> Response:
    denied = unauthorized()
    if denied:
        return denied
    time.sleep(0.6)
    return jsonify({"data": [{"id": "fixture-model"}]})


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
    prompt = requested_text()
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
