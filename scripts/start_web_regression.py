from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import open_web_ui

ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "start_web_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _run_open_web_ui_probe() -> list[str]:
    checks: list[str] = []
    calls: list[str] = []
    original_startfile = getattr(open_web_ui.os, "startfile", None)
    original_webbrowser_open = open_web_ui.webbrowser.open_new_tab

    def fake_startfile(url: str) -> None:
        calls.append(f"startfile:{url}")

    def fake_webbrowser_open(url: str) -> bool:
        calls.append(f"webbrowser:{url}")
        return True

    try:
        setattr(open_web_ui.os, "startfile", fake_startfile)
        open_web_ui.webbrowser.open_new_tab = fake_webbrowser_open
        report = open_web_ui.open_web_ui("http://127.0.0.1:1420")
        _assert(report["ok"], "open_web_ui should report success when native opener succeeds")
        _assert(calls == ["startfile:http://127.0.0.1:1420"], "open_web_ui should prefer the native Windows opener")
        checks.append("native browser opener is preferred")

        calls.clear()

        def failing_startfile(url: str) -> None:
            calls.append(f"startfile:{url}")
            raise OSError("stub open failed")

        setattr(open_web_ui.os, "startfile", failing_startfile)
        report = open_web_ui.open_web_ui("http://127.0.0.1:1420")
        _assert(report["ok"], "open_web_ui should fall back to webbrowser when native opener fails")
        _assert(calls == ["startfile:http://127.0.0.1:1420", "webbrowser:http://127.0.0.1:1420"], "open_web_ui fallback order is wrong")
        checks.append("browser opener fallback is available")
    finally:
        if original_startfile is None:
            try:
                delattr(open_web_ui.os, "startfile")
            except AttributeError:
                pass
        else:
            setattr(open_web_ui.os, "startfile", original_startfile)
        open_web_ui.webbrowser.open_new_tab = original_webbrowser_open
    return checks


def run_regression() -> dict[str, Any]:
    checks = _run_open_web_ui_probe()
    batch_text = (ROOT_DIR / "start_web.bat").read_text(encoding="utf-8", errors="replace")
    ps_text = (ROOT_DIR / "start_web.ps1").read_text(encoding="utf-8", errors="replace")
    _assert("scripts\\open_web_ui.py" in batch_text, "start_web.bat must use the robust browser opener")
    _assert('start "" "http://127.0.0.1:1420"' not in batch_text, "start_web.bat must not rely on raw cmd URL opening")
    _assert("FYADR_NO_BROWSER" in batch_text and "FYADR_NO_BROWSER" in ps_text, "NoBrowser switch must remain wired through the startup scripts")
    checks.append("start_web.bat uses robust browser opener")
    checks.append("NoBrowser switch remains wired")
    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
