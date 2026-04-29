from __future__ import annotations

import argparse
import fnmatch
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "pre_release_check_report.json"

TRACKED_ARTIFACT_PATTERNS = (
    "finish/*",
    "origin/*",
    "logs/*",
    "app/dist/*",
    "app/node_modules/*",
    "app/ui-check*.png",
    "*.doc",
    "*.docm",
    "*.docx",
    "*.pdf",
    "*.zip",
    "*.7z",
    "*.rar",
    "*.tar",
    "*.tar.gz",
    "*.tgz",
    "*.db",
    "*.sqlite",
    "*.sqlite3",
    "*.jsonl",
)


def _run_command(name: str, command: list[str], *, timeout: int = 900) -> dict[str, Any]:
    started = time.monotonic()
    resolved_command = list(command)
    if resolved_command:
        resolved_command[0] = shutil.which(resolved_command[0]) or resolved_command[0]
    try:
        completed = subprocess.run(
            resolved_command,
            cwd=str(ROOT_DIR),
            text=True,
            encoding="utf-8",
            errors="replace",
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout,
        )
        return_code = completed.returncode
        stdout = completed.stdout
        stderr = completed.stderr
    except FileNotFoundError as exc:
        return_code = 127
        stdout = ""
        stderr = str(exc)
    except subprocess.TimeoutExpired as exc:
        return_code = 124
        stdout = exc.stdout if isinstance(exc.stdout, str) else ""
        stderr = exc.stderr if isinstance(exc.stderr, str) else f"Timed out after {timeout}s"
    return {
        "name": name,
        "command": resolved_command,
        "returnCode": return_code,
        "durationMs": round((time.monotonic() - started) * 1000),
        "stdout": stdout,
        "stderr": stderr,
        "stdoutTail": stdout[-4000:] if stdout else "",
        "stderrTail": stderr[-4000:] if stderr else "",
        "ok": return_code == 0,
    }


def _parse_json_output(result: dict[str, Any]) -> dict[str, Any] | None:
    for stream_name in ("stdout", "stderr"):
        text = str(result.get(stream_name) or "").strip()
        if not text:
            continue
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            start = text.find("{")
            end = text.rfind("}")
            if start >= 0 and end > start:
                try:
                    return json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    pass
    return None


def _git_status() -> dict[str, Any]:
    result = _run_command("git status", ["git", "status", "--porcelain"], timeout=120)
    lines = [line for line in str(result.get("stdout") or "").splitlines() if line.strip()]
    return {
        "ok": bool(result["ok"]),
        "dirty": bool(lines),
        "entries": lines,
        "error": "" if result["ok"] else str(result.get("stderrTail") or result.get("stdoutTail") or "git status failed"),
    }


def _tracked_artifacts() -> list[str]:
    result = _run_command("git ls-files", ["git", "ls-files"], timeout=120)
    if not result["ok"]:
        return ["<git ls-files failed>"]
    tracked: list[str] = []
    for raw_path in str(result.get("stdout") or "").splitlines():
        path = raw_path.strip().replace("\\", "/")
        if not path:
            continue
        if any(fnmatch.fnmatch(path, pattern) for pattern in TRACKED_ARTIFACT_PATTERNS):
            tracked.append(path)
    return tracked


def _open_source_audit(*, strict_local_artifacts: bool) -> dict[str, Any]:
    result = _run_command("open-source audit", [sys.executable, "scripts/open_source_audit.py"], timeout=300)
    report = _parse_json_output(result) or {}
    warning_count = int(report.get("warningCount") or 0)
    error_count = int(report.get("errorCount") or 0)
    warning_codes = {str(item.get("code") or "") for item in report.get("warnings") or [] if isinstance(item, dict)}
    strict_warning_failure = strict_local_artifacts and bool(warning_codes & {"local.artifact", "local.runtime_dir"})
    next_actions = report.get("nextActions") if isinstance(report.get("nextActions"), list) else []
    summary = report.get("summary") if isinstance(report.get("summary"), dict) else {}
    return {
        "ok": bool(result["ok"]) and error_count == 0 and not strict_warning_failure,
        "commandOk": bool(result["ok"]),
        "errorCount": error_count,
        "warningCount": warning_count,
        "strictLocalArtifactFailure": strict_warning_failure,
        "reportPath": report.get("reportPath"),
        "statusText": summary.get("statusText", ""),
        "nextActions": next_actions[:8],
        "stdoutTail": result.get("stdoutTail"),
        "stderrTail": result.get("stderrTail"),
    }


def _run_regressions(*, skip_frontend_build: bool, include_browser_e2e: bool) -> dict[str, Any]:
    command = [sys.executable, "scripts/run_regressions.py", "--fail-fast"]
    if skip_frontend_build:
        command.append("--skip-frontend-build")
    if include_browser_e2e:
        command.append("--include-browser-e2e")
    result = _run_command("regression suite", command, timeout=1200)
    report = _parse_json_output(result) or {}
    return {
        "ok": bool(result["ok"]) and bool(report.get("ok", False)),
        "commandOk": bool(result["ok"]),
        "failures": report.get("failures") or ([] if result["ok"] else ["run_regressions.py"]),
        "reportPath": report.get("reportPath"),
        "stdoutTail": result.get("stdoutTail"),
        "stderrTail": result.get("stderrTail"),
    }


def run_pre_release_check(
    *,
    report_path: Path,
    allow_dirty: bool,
    skip_regressions: bool,
    skip_frontend_build: bool,
    include_browser_e2e: bool,
    strict_local_artifacts: bool,
) -> dict[str, Any]:
    started = time.monotonic()
    failures: list[str] = []
    warnings: list[str] = []

    git_status = _git_status()
    if not git_status["ok"]:
        failures.append(f"git status failed: {git_status['error']}")
    elif git_status["dirty"] and not allow_dirty:
        failures.append("working tree is dirty; commit, stash, or rerun with --allow-dirty")
    elif git_status["dirty"]:
        warnings.append("working tree is dirty because --allow-dirty was used")

    tracked_artifacts = _tracked_artifacts()
    if tracked_artifacts:
        failures.append(f"tracked local artifacts: {', '.join(tracked_artifacts[:8])}")

    audit = _open_source_audit(strict_local_artifacts=strict_local_artifacts)
    if not audit["ok"]:
        failures.append("open-source audit failed")
    elif audit["warningCount"]:
        warnings.append(f"open-source audit warnings: {audit['warningCount']}")

    regressions = None
    if skip_regressions:
        warnings.append("regression suite skipped")
    else:
        regressions = _run_regressions(skip_frontend_build=skip_frontend_build, include_browser_e2e=include_browser_e2e)
        if not regressions["ok"]:
            failures.append("regression suite failed")

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "durationMs": round((time.monotonic() - started) * 1000),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "warnings": warnings,
        "nextActions": audit.get("nextActions", []),
        "checks": {
            "gitStatus": git_status,
            "trackedArtifacts": tracked_artifacts,
            "openSourceAudit": audit,
            "regressions": regressions,
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Run the FYADR pre-release safety gate.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--allow-dirty", action="store_true", help="Allow a dirty working tree while developing this gate.")
    parser.add_argument("--skip-regressions", action="store_true", help="Only run git/artifact checks and the open-source audit.")
    parser.add_argument("--skip-frontend-build", action="store_true", help="Pass through to run_regressions.py for a faster local gate.")
    parser.add_argument("--include-browser-e2e", action="store_true", help="Also run the real browser UI smoke test through run_regressions.py.")
    parser.add_argument("--strict-local-artifacts", action="store_true", help="Fail on local artifact/runtime warnings from open_source_audit.py.")
    args = parser.parse_args(argv)
    report = run_pre_release_check(
        report_path=args.report.resolve(),
        allow_dirty=bool(args.allow_dirty),
        skip_regressions=bool(args.skip_regressions),
        skip_frontend_build=bool(args.skip_frontend_build),
        include_browser_e2e=bool(args.include_browser_e2e),
        strict_local_artifacts=bool(args.strict_local_artifacts),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
