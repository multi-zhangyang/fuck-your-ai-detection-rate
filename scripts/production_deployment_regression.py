from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
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
    env_example = (ROOT_DIR / ".env.example").read_text(encoding="utf-8")
    deploy_doc = (ROOT_DIR / "DEPLOY.md").read_text(encoding="utf-8")
    ci_workflow = (ROOT_DIR / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    entrypoint_path = ROOT_DIR / "docker-entrypoint.sh"
    entrypoint = entrypoint_path.read_text(encoding="utf-8")

    _assert(
        all(
            marker in ci_workflow
            for marker in (
                "if: runner.os != 'Windows'",
                "ubuntu-latest",
                "macos-latest",
                "bash -n docker-entrypoint.sh",
            )
        ),
        "native POSIX platform jobs must validate the Docker entrypoint with bash -n",
    )
    checks.append("native POSIX CI jobs own Docker entrypoint bash syntax validation")

    if os.name == "nt":
        # Docker runs this script in a Linux container. Hosted Windows images
        # expose several incompatible `bash` shims, so native POSIX matrix jobs
        # own the executable syntax check while this job keeps the deployment
        # and initialization contracts below.
        checks.append("Windows deployment regression delegates executable shell syntax to native POSIX CI")
    else:
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
    _assert("sync_prompt_seed('/app/prompt-seed'" in entrypoint, "entrypoint must merge the image prompt seed into the writable volume")
    _assert("cp -a -n /app/prompt-seed" not in entrypoint, "prompt seed upgrades must not rely on copy-if-missing semantics")
    _assert('VOLUME ["/app/origin", "/app/finish", "/app/config", "/app/prompts"]' in dockerfile, "the complete mutable prompt library must be persistent")
    _assert("./data/prompts:/app/prompts" in compose, "Compose must persist prompt edits, workflow settings, and custom prompts together")
    _assert(
        "./data/prompts-custom:/app/legacy-prompts-custom:ro" in compose,
        "Compose must expose the legacy custom-prompt directory as a read-only migration source",
    )
    _assert("legacy_custom_dir='/app/legacy-prompts-custom'" in entrypoint, "entrypoint must migrate legacy custom prompts through the guarded seed merge")
    _assert("cp -a -n /app/legacy-prompts-custom" not in entrypoint, "legacy prompt migration must not copy symlinks or arbitrary files as root")
    _assert("--forwarded-allow-ips='*'" not in entrypoint, "entrypoint must not blindly trust forwarded headers from every peer")
    _assert(
        all(
            marker in compose
            for marker in (
                "FYADR_AUTH_USERNAME",
                "FYADR_AUTH_PASSWORD",
                "FYADR_AUTH_PASSWORD_HASH",
                "FYADR_AUTH_PASSWORD_FILE",
                "FYADR_AUTH_SECRET_FILE",
                "FYADR_AUTH_COOKIE_SECURE",
            )
        ),
        "Compose must expose optional auth settings without baking in credentials",
    )
    _assert("FYADR_AUTH_PASSWORD: \"${FYADR_AUTH_PASSWORD:-}\"" in compose, "Compose auth must remain disabled until an operator supplies a password")
    _assert("FYADR_AUTH_PASSWORD_FILE=" in env_example, "the environment template must document password-file authentication")
    _assert("FYADR_AUTH_SECRET_FILE=" in env_example, "the environment template must document signing-key files")
    _assert("GET /api/ping" in deploy_doc and "X-FYADR-CSRF" in deploy_doc, "deployment docs must explain the public probe and CSRF contract")
    checks.append("container loopback publishing, resource and log ceilings, initialization, privilege drop, and single-worker contract are guarded")
    checks.append("Compose and deployment docs expose opt-in authentication without default credentials")

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

    immutable_root_paths = [
        {"key": "workspace", "exists": True, "writable": False},
        {"key": "origin", "exists": True, "writable": True},
        {"key": "intermediate", "exists": True, "writable": True},
        {"key": "exports", "exists": True, "writable": True},
        {"key": "config", "exists": False, "writable": True},
    ]
    _assert(
        web_app.workspace_paths_are_ready(immutable_root_paths),
        "a read-only application root must remain healthy when every runtime data directory is writable",
    )
    for runtime_key in ("origin", "intermediate", "exports", "config"):
        unavailable_runtime_paths = [dict(item) for item in immutable_root_paths]
        unavailable_item = next(item for item in unavailable_runtime_paths if item["key"] == runtime_key)
        unavailable_item["writable"] = False
        _assert(
            not web_app.workspace_paths_are_ready(unavailable_runtime_paths),
            f"an unwritable {runtime_key} runtime path must fail environment readiness",
        )
    missing_workspace_paths = [dict(item) for item in immutable_root_paths]
    missing_workspace_paths[0]["exists"] = False
    _assert(
        not web_app.workspace_paths_are_ready(missing_workspace_paths),
        "a missing application root must fail environment readiness",
    )
    with tempfile.TemporaryDirectory(prefix="fyadr-config-readiness-") as temporary_directory:
        unmaterialized_config = Path(temporary_directory) / "config" / "config.json"
        config_summary = web_app.summarize_workspace_path(
            unmaterialized_config,
            label="config",
            kind="config",
        )
        _assert(config_summary["exists"] is False, "readiness fixture config must start absent")
        _assert(
            config_summary["writable"] is True,
            "an optional config beneath a writable ancestor must be considered creatable",
        )
    checks.append("read-only image root is allowed while every mutable runtime path remains mandatory")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
