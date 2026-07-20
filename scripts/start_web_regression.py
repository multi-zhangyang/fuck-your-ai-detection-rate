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
    posix_text = (ROOT_DIR / "start_web.sh").read_text(encoding="utf-8", errors="replace")

    _assert(
        "-ExecutionPolicy Bypass" in batch_text
        and '-File "%~dp0start_web.ps1" %*' in batch_text,
        "start_web.bat must remain a non-persistent-policy PowerShell wrapper",
    )
    _assert('start "" "http://127.0.0.1:1420"' not in batch_text, "start_web.bat must not rely on raw cmd URL opening")
    _assert(
        "Get-NetTCPConnection" not in batch_text
        and "Get-CimInstance" not in batch_text
        and "Stop-Process" not in batch_text,
        "start_web.bat must never enumerate or stop unknown processes",
    )
    checks.append("start_web.bat delegates safely without owning process policy")

    for switch in ("[switch]$NoBrowser", "[switch]$Install", "[switch]$Help"):
        _assert(switch in ps_text, f"Windows launcher lost {switch}")
    _assert(
        'Join-Path $RepoRoot "scripts\\open_web_ui.py"' in ps_text
        and "if (-not $NoBrowser)" in ps_text,
        "PowerShell launcher must use the robust browser opener and honor NoBrowser",
    )
    _assert(
        'SetEnvironmentVariable("WEB_HOST", "127.0.0.1", "Process")' in ps_text
        and 'SetEnvironmentVariable("WEB_PORT", "8765", "Process")' in ps_text,
        "PowerShell backend must remain loopback-only",
    )
    _assert(
        "function Test-PortInUse" in ps_text
        and "function Stop-OwnedProcess" in ps_text
        and "$script:StartedBackend" in ps_text
        and "$script:StartedFrontend" in ps_text,
        "PowerShell launcher lost safe port refusal or owned-process cleanup",
    )
    _assert(
        "Get-NetTCPConnection" not in ps_text and "Get-CimInstance" not in ps_text,
        "PowerShell launcher must not discover and terminate arbitrary listeners",
    )
    _assert(
        "requirements.txt" in ps_text and '"--require-hashes"' in ps_text and "pypdf" not in ps_text,
        "PowerShell launcher must install the reviewed runtime lock without unused dependencies",
    )
    _assert(
        "$Label:" not in ps_text,
        "PowerShell interpolations followed by a colon must use an explicit braced variable",
    )
    checks.append("Windows launcher keeps install, browser, loopback, and process-ownership contracts")

    _assert("--no-browser" in posix_text and "--install" in posix_text, "POSIX launcher switches drifted")
    _assert(
        "WEB_HOST=127.0.0.1 WEB_PORT=8765" in posix_text
        and 'scripts/open_web_ui.py" --url "$FRONTEND_URL"' in posix_text,
        "POSIX launcher lost loopback binding or robust browser opening",
    )
    _assert(
        "stop_started_pid" in posix_text
        and "STARTED_BACKEND" in posix_text
        and "STARTED_FRONTEND" in posix_text,
        "POSIX launcher lost launcher-owned PID cleanup",
    )
    _assert(
        "requirements.txt" in posix_text and "--require-hashes" in posix_text and "pypdf" not in posix_text,
        "POSIX launcher must install the reviewed runtime lock without unused dependencies",
    )
    checks.append("macOS/Linux launcher keeps install, browser, loopback, and owned-PID contracts")
    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
