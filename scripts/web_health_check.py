from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "web_health_check_report.json"


def _parse_partial_health_payload(body: str) -> dict[str, Any] | None:
    compact = body[:500].replace(" ", "").replace("\n", "").replace("\r", "")
    if '"ok":true' in compact:
        return {"ok": True, "partial": True}
    if '"ok":false' in compact:
        return {"ok": False, "partial": True}
    return None


def _fetch_json(url: str, timeout: float) -> tuple[int, dict[str, Any] | None, str]:
    request = Request(url, headers={"User-Agent": "FYADR-health-check/1.0"})
    try:
        with urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            body = response.read(1024 * 1024).decode("utf-8", errors="replace")
    except HTTPError as exc:
        status = int(exc.code)
        body = exc.read(1024 * 64).decode("utf-8", errors="replace")
    except URLError as exc:
        return 0, None, str(exc.reason)
    except TimeoutError:
        return 0, None, "request timed out"
    except OSError as exc:
        return 0, None, str(exc)

    parsed: dict[str, Any] | None = None
    try:
        data = json.loads(body)
        if isinstance(data, dict):
            parsed = data
    except json.JSONDecodeError:
        parsed = _parse_partial_health_payload(body)
    return status, parsed, body[:300]


def _wait_for_endpoint(url: str, timeout_seconds: float, *, expect_health_json: bool) -> dict[str, Any]:
    deadline = time.monotonic() + max(0.1, timeout_seconds)
    attempts = 0
    last_status = 0
    last_error = ""
    payload: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        attempts += 1
        status, payload, error = _fetch_json(url, timeout=min(3.0, max(0.5, timeout_seconds)))
        last_status = status
        last_error = error
        if 200 <= status < 500:
            if not expect_health_json or 200 <= status < 400 or (isinstance(payload, dict) and payload.get("ok") is True):
                return {
                    "ok": True,
                    "url": url,
                    "status": status,
                    "attempts": attempts,
                    "payload": payload or {},
                    "lastError": "",
                }
        time.sleep(0.8)
    return {
        "ok": False,
        "url": url,
        "status": last_status,
        "attempts": attempts,
        "payload": payload or {},
        "lastError": last_error,
    }


def run_health_check(
    *,
    backend_url: str,
    frontend_url: str,
    timeout_seconds: float,
    backend_only: bool,
    frontend_only: bool,
    report_path: Path | None,
) -> dict[str, Any]:
    checks: dict[str, Any] = {}
    if not frontend_only:
        checks["backend"] = _wait_for_endpoint(backend_url, timeout_seconds, expect_health_json=True)
    if not backend_only:
        checks["frontend"] = _wait_for_endpoint(frontend_url, timeout_seconds, expect_health_json=False)

    failures = [name for name, result in checks.items() if not bool(result.get("ok"))]
    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "failures": failures,
        "checks": checks,
    }
    if report_path is not None:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        report["reportPath"] = str(report_path.resolve())
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Wait for local FYADR backend/frontend health endpoints.")
    parser.add_argument("--backend-url", default="http://127.0.0.1:8765/api/ping")
    parser.add_argument("--frontend-url", default="http://127.0.0.1:1420")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--backend-only", action="store_true")
    parser.add_argument("--frontend-only", action="store_true")
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--default-report", action="store_true", help="Write report to finish/regression/web_health_check_report.json.")
    args = parser.parse_args(argv)
    if args.backend_only and args.frontend_only:
        parser.error("--backend-only and --frontend-only cannot be used together.")

    report_path = DEFAULT_REPORT_PATH if args.default_report else args.report
    report = run_health_check(
        backend_url=str(args.backend_url),
        frontend_url=str(args.frontend_url),
        timeout_seconds=float(args.timeout),
        backend_only=bool(args.backend_only),
        frontend_only=bool(args.frontend_only),
        report_path=report_path.resolve() if report_path else None,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
