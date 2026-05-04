from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "run_regressions_report.json"


def _all_python_files() -> list[str]:
    return [str(path.relative_to(ROOT_DIR)) for path in sorted((ROOT_DIR / "scripts").glob("*.py"))]


def _run_command(name: str, command: list[str], *, cwd: Path = ROOT_DIR, timeout: int = 600) -> dict[str, Any]:
    started = time.monotonic()
    resolved_command = list(command)
    if resolved_command:
        resolved_command[0] = shutil.which(resolved_command[0]) or resolved_command[0]
    env = os.environ.copy()
    env.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        completed = subprocess.run(
            resolved_command,
            cwd=str(cwd),
            env=env,
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
    duration_ms = round((time.monotonic() - started) * 1000)
    stdout_tail = stdout[-4000:] if stdout else ""
    stderr_tail = stderr[-4000:] if stderr else ""
    return {
        "name": name,
        "command": resolved_command,
        "cwd": str(cwd),
        "returnCode": return_code,
        "durationMs": duration_ms,
        "ok": return_code == 0,
        "stdoutTail": stdout_tail,
        "stderrTail": stderr_tail,
    }


def build_commands(
    *,
    skip_frontend_build: bool,
    include_web_health: bool,
    include_browser_e2e: bool,
    strict_samples: bool,
) -> list[dict[str, Any]]:
    commands: list[dict[str, Any]] = [
        {"name": "format rules regression", "command": [sys.executable, "scripts/format_rules_regression.py"]},
        {"name": "detection report parser regression", "command": [sys.executable, "scripts/detection_report_regression.py", *(("--strict-missing",) if strict_samples else ())]},
        {"name": "detection matching regression", "command": ["node", "scripts/detection_matching_regression.mjs"]},
        {"name": "batch rerun task regression", "command": [sys.executable, "scripts/batch_rerun_task_regression.py"]},
        {"name": "frontend batch rerun regression", "command": ["node", "scripts/frontend_batch_rerun_regression.mjs"]},
        {"name": "frontend state machine regression", "command": ["node", "scripts/frontend_state_machine_regression.mjs"]},
        {"name": "frontend home layout regression", "command": ["node", "scripts/frontend_home_layout_regression.mjs"]},
        {"name": "frontend UI consistency regression", "command": ["node", "scripts/frontend_ui_consistency_regression.mjs"]},
        {"name": "frontend history governance regression", "command": ["node", "scripts/frontend_history_governance_regression.mjs"]},
        {"name": "review decisions regression", "command": [sys.executable, "scripts/review_decisions_regression.py"]},
        {"name": "prompt preview regression", "command": [sys.executable, "scripts/prompt_preview_regression.py"]},
        {"name": "model route regression", "command": [sys.executable, "scripts/model_route_regression.py"]},
        {"name": "factual guards regression", "command": [sys.executable, "scripts/factual_guards_regression.py"]},
        {"name": "validation fallback regression", "command": [sys.executable, "scripts/validation_fallback_regression.py"]},
        {"name": "rewrite candidate regression", "command": [sys.executable, "scripts/rewrite_candidate_regression.py"]},
        {"name": "checkpoint resume regression", "command": [sys.executable, "scripts/checkpoint_resume_regression.py"]},
        {"name": "targeted rerun fallback regression", "command": [sys.executable, "scripts/targeted_rerun_fallback_regression.py"]},
        {"name": "LLM client regression", "command": [sys.executable, "scripts/llm_client_regression.py"]},
        {"name": "history assets regression", "command": [sys.executable, "scripts/history_assets_regression.py"]},
        {"name": "history DB regression", "command": [sys.executable, "scripts/history_db_regression.py"]},
        {"name": "history DB integrity check", "command": [sys.executable, "scripts/fyadr_records.py", "history-db-check"]},
        {"name": "real DOCX smoke", "command": [sys.executable, "scripts/real_docx_smoke.py", *(("--strict-missing",) if strict_samples else ())]},
        {"name": "state machine regression", "command": [sys.executable, "scripts/state_machine_regression.py"]},
        {"name": "DOCX export regression", "command": [sys.executable, "scripts/docx_export_regression.py", "--rebuild-sample"]},
        {"name": "legacy body-map DOCX export regression", "command": [sys.executable, "scripts/docx_legacy_body_map_export_regression.py"]},
        {"name": "Python compile", "command": [sys.executable, "-m", "py_compile", *_all_python_files()]},
        {"name": "open-source audit regression", "command": [sys.executable, "scripts/open_source_audit_regression.py"]},
        {"name": "pre-release check regression", "command": [sys.executable, "scripts/pre_release_check_regression.py"]},
        {"name": "start web regression", "command": [sys.executable, "scripts/start_web_regression.py"]},
        {"name": "web security regression", "command": [sys.executable, "scripts/web_security_regression.py"]},
        {"name": "web health check regression", "command": [sys.executable, "scripts/web_health_check_regression.py"]},
        {"name": "open-source audit", "command": [sys.executable, "scripts/open_source_audit.py"]},
        {"name": "frontend text check", "command": ["npm", "run", "check:text"], "cwd": ROOT_DIR / "app"},
    ]
    if not skip_frontend_build:
        commands.append({"name": "frontend build", "command": ["npm", "run", "build"], "cwd": ROOT_DIR / "app", "timeout": 900})
    if include_web_health:
        commands.append({"name": "web health check", "command": [sys.executable, "scripts/web_health_check.py", "--timeout", "8", "--default-report"]})
    if include_browser_e2e:
        commands.append({"name": "browser E2E smoke", "command": ["node", "scripts/browser_e2e_smoke.mjs"], "timeout": 240})
    return commands


def run_regressions(
    *,
    report_path: Path,
    skip_frontend_build: bool,
    include_web_health: bool,
    include_browser_e2e: bool,
    strict_samples: bool,
    fail_fast: bool,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    failures: list[str] = []
    started = time.monotonic()

    for item in build_commands(
        skip_frontend_build=skip_frontend_build,
        include_web_health=include_web_health,
        include_browser_e2e=include_browser_e2e,
        strict_samples=strict_samples,
    ):
        result = _run_command(
            str(item["name"]),
            list(item["command"]),
            cwd=Path(item.get("cwd", ROOT_DIR)),
            timeout=int(item.get("timeout", 600)),
        )
        results.append(result)
        if not result["ok"]:
            failures.append(str(item["name"]))
            if fail_fast:
                break

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "durationMs": round((time.monotonic() - started) * 1000),
        "reportPath": str(report_path.resolve()),
        "failures": failures,
        "results": results,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Run FYADR regression suite before release or risky refactors.")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--skip-frontend-build", action="store_true", help="Skip npm run build for faster local checks.")
    parser.add_argument("--include-web-health", action="store_true", help="Also check running local backend/frontend endpoints.")
    parser.add_argument("--include-browser-e2e", action="store_true", help="Also run a real Chrome/Edge browser smoke test for critical UI clicks.")
    parser.add_argument("--strict-samples", action="store_true", help="Fail if local PDF/DOCX sample files are missing.")
    parser.add_argument("--fail-fast", action="store_true", help="Stop at the first failed check.")
    args = parser.parse_args(argv)
    report = run_regressions(
        report_path=args.report.resolve(),
        skip_frontend_build=bool(args.skip_frontend_build),
        include_web_health=bool(args.include_web_health),
        include_browser_e2e=bool(args.include_browser_e2e),
        strict_samples=bool(args.strict_samples),
        fail_fast=bool(args.fail_fast),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
