from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "production_deployment_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    dockerfile = (ROOT_DIR / "Dockerfile").read_text(encoding="utf-8")
    compose = (ROOT_DIR / "docker-compose.yml").read_text(encoding="utf-8")
    entrypoint_path = ROOT_DIR / "docker-entrypoint.sh"
    entrypoint = entrypoint_path.read_text(encoding="utf-8")

    syntax_check = subprocess.run(
        ["bash", "-n", entrypoint_path.name],
        cwd=str(ROOT_DIR),
        capture_output=True,
        text=True,
        check=False,
        timeout=30,
    )
    _assert(
        syntax_check.returncode == 0,
        f"docker entrypoint shell syntax failed (exit={syntax_check.returncode}): {syntax_check.stderr}",
    )
    checks.append("docker entrypoint passes bash syntax validation")

    _assert("--chdir /app/scripts" in entrypoint, "Gunicorn must import web_app from /app/scripts")
    _assert("initialize_runtime(reason='container-startup')" in entrypoint, "container must run production initialization before Gunicorn")
    _assert('${GUNICORN_WORKERS:-1}' in entrypoint, "entrypoint must default to one Gunicorn worker")
    _assert("--workers 1" in entrypoint, "entrypoint must enforce one process-local task worker")
    _assert("--no-control-socket" in entrypoint, "Gunicorn control socket must not target the read-only application directory")
    _assert("GUNICORN_WORKERS=1" in dockerfile, "Docker image must default to one Gunicorn worker")
    _assert('GUNICORN_WORKERS: "1"' in compose, "Compose must default to one Gunicorn worker")
    _assert('- "127.0.0.1:8765:8765"' in compose, "Compose must publish FYADR on loopback only")
    _assert(re.search(r"^\s+cpus:\s*[\"']1\.0[\"']\s*$", compose, flags=re.MULTILINE) is not None, "Compose must cap FYADR at one CPU")
    _assert(re.search(r"^\s+mem_limit:\s*[\"']2g[\"']\s*$", compose, flags=re.MULTILINE) is not None, "Compose must cap FYADR memory")
    _assert(re.search(r"^\s+memswap_limit:\s*[\"']2g[\"']\s*$", compose, flags=re.MULTILINE) is not None, "Compose must not extend FYADR beyond its memory cap via swap")
    _assert(re.search(r"^\s+pids_limit:\s*256\s*$", compose, flags=re.MULTILINE) is not None, "Compose must cap FYADR process count")
    _assert(
        re.search(r'^\s+driver:\s*["\']json-file["\']\s*$', compose, flags=re.MULTILINE) is not None,
        "Compose must use an explicitly bounded local JSON log driver",
    )
    _assert(
        re.search(r'^\s+max-size:\s*["\']10m["\']\s*$', compose, flags=re.MULTILINE) is not None,
        "Compose must cap each FYADR log segment",
    )
    _assert(
        re.search(r'^\s+max-file:\s*["\']3["\']\s*$', compose, flags=re.MULTILINE) is not None,
        "Compose must cap retained FYADR log segments",
    )
    _assert(not re.search(r"^\s+user\s*:", compose, flags=re.MULTILINE), "Compose must not pre-drop privileges before volume initialization")
    _assert("run_as_fyadr" in entrypoint, "entrypoint must support root initialization followed by non-root execution")
    _assert("--forwarded-allow-ips='*'" not in entrypoint, "entrypoint must not blindly trust forwarded headers from every peer")
    checks.append("container loopback publishing, resource and log ceilings, initialization, privilege drop, and single-worker contract are guarded")

    import web_app

    original_workspace = web_app.ensure_workspace_dirs
    original_task_state = web_app.ensure_task_state_store_ready
    original_history = web_app.ensure_history_database_ready
    calls: list[object] = []
    try:
        web_app.ensure_workspace_dirs = lambda: calls.append("workspace")
        web_app.ensure_task_state_store_ready = lambda **kwargs: calls.append(("task", kwargs)) or {"ok": True, "action": "none"}
        web_app.ensure_history_database_ready = lambda **kwargs: calls.append(("history", kwargs)) or {"ok": True, "action": "none"}
        result = web_app.initialize_runtime(reason="production-regression")
    finally:
        web_app.ensure_workspace_dirs = original_workspace
        web_app.ensure_task_state_store_ready = original_task_state
        web_app.ensure_history_database_ready = original_history

    _assert(result["ok"] is True, "runtime initialization should report successful stores")
    _assert(calls[0] == "workspace", "runtime initialization must create workspace directories first")
    _assert(calls[1] == ("task", {"reason": "production-regression", "max_age_seconds": 0}), "task-state readiness must run at startup")
    _assert(
        calls[2] == ("history", {"reason": "production-regression", "max_age_seconds": 0, "compact": True}),
        "history readiness must run at startup",
    )
    checks.append("production runtime initialization executes both writable-store readiness checks")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
