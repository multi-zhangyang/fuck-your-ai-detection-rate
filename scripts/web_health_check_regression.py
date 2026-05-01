from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import web_health_check

ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "web_health_check_regression_report.json"


FetchStub = Callable[..., tuple[int, dict[str, Any] | None, str]]


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _run_with_fetch_stub(stub: FetchStub, *, expect_health_json: bool = True) -> dict[str, Any]:
    original = web_health_check._fetch_json
    web_health_check._fetch_json = stub
    try:
        return web_health_check._wait_for_endpoint(
            "http://127.0.0.1:8765/api/ping",
            0.2,
            expect_health_json=expect_health_json,
        )
    finally:
        web_health_check._fetch_json = original


def run_regression() -> dict[str, Any]:
    checks: list[str] = []

    partial_payload = web_health_check._parse_partial_health_payload('{"ok": true, "checks": {"large": "')
    _assert(partial_payload == {"ok": True, "partial": True}, "partial health parser should detect ok=true")
    checks.append("partial health JSON can still expose ok=true")

    ready_without_json = _run_with_fetch_stub(lambda _url, **_kwargs: (200, None, '{"ok": true, "huge": "...'))
    _assert(ready_without_json["ok"], "startup health check should accept HTTP 200 even if diagnostics JSON is too large to parse")
    _assert(ready_without_json["status"] == 200, "startup health check should keep the HTTP status")
    checks.append("HTTP 200 readiness does not block on full diagnostics JSON")

    not_ready = _run_with_fetch_stub(lambda _url, **_kwargs: (0, None, "connection refused"))
    _assert(not not_ready["ok"], "connection failures should still fail readiness")
    checks.append("connection failures still fail readiness")

    frontend_ready = _run_with_fetch_stub(lambda _url, **_kwargs: (200, None, "<html></html>"), expect_health_json=False)
    _assert(frontend_ready["ok"], "frontend readiness should accept HTML HTTP 200")
    checks.append("frontend HTML readiness still works")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
