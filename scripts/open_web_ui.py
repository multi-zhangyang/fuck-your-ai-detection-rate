from __future__ import annotations

import argparse
import json
import os
import sys
import webbrowser
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "open_web_ui_report.json"


def open_web_ui(url: str, *, report_path: Path | None = None) -> dict[str, Any]:
    attempts: list[dict[str, Any]] = []

    if hasattr(os, "startfile"):
        try:
            os.startfile(url)  # type: ignore[attr-defined]
            attempts.append({"method": "os.startfile", "ok": True, "error": ""})
            report = _build_report(url, attempts)
            _write_report(report_path, report)
            return report
        except OSError as exc:
            attempts.append({"method": "os.startfile", "ok": False, "error": str(exc)})

    try:
        opened = webbrowser.open_new_tab(url)
        attempts.append({"method": "webbrowser.open_new_tab", "ok": bool(opened), "error": "" if opened else "browser returned false"})
    except Exception as exc:  # pragma: no cover - defensive fallback for local machines
        attempts.append({"method": "webbrowser.open_new_tab", "ok": False, "error": str(exc)})

    report = _build_report(url, attempts)
    _write_report(report_path, report)
    return report


def _build_report(url: str, attempts: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "ok": any(bool(item.get("ok")) for item in attempts),
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "url": url,
        "attempts": attempts,
        "manualOpenHint": f"如果浏览器没有自动打开，请手动访问：{url}",
    }


def _write_report(report_path: Path | None, report: dict[str, Any]) -> None:
    if report_path is None:
        return
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    report["reportPath"] = str(report_path.resolve())


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Open the FYADR local web UI in the default browser.")
    parser.add_argument("--url", default="http://127.0.0.1:1420")
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--default-report", action="store_true", help="Write report to finish/regression/open_web_ui_report.json.")
    args = parser.parse_args(argv)
    report_path = DEFAULT_REPORT_PATH if args.default_report else args.report
    report = open_web_ui(str(args.url), report_path=report_path.resolve() if report_path else None)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
