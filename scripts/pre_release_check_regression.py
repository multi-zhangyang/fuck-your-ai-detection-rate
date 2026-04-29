from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

import pre_release_check


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "pre_release_check_regression_report.json"


CommandStub = Callable[[str, list[str]], dict[str, Any]]


def _result(stdout: str = "", stderr: str = "", return_code: int = 0) -> dict[str, Any]:
    return {
        "name": "stub",
        "command": [],
        "returnCode": return_code,
        "durationMs": 0,
        "stdout": stdout,
        "stderr": stderr,
        "stdoutTail": stdout[-4000:] if stdout else "",
        "stderrTail": stderr[-4000:] if stderr else "",
        "ok": return_code == 0,
    }


def _audit_stdout(*, error_count: int = 0, warnings: list[dict[str, Any]] | None = None) -> str:
    report = {
        "ok": error_count == 0,
        "errorCount": error_count,
        "warningCount": len(warnings or []),
        "errors": [],
        "warnings": warnings or [],
        "summary": {
            "readyForPublicRelease": error_count == 0,
            "statusText": "stub audit status",
        },
        "nextActions": [
            {
                "code": "local.artifact" if warnings else "release.ready",
                "severity": "warning" if warnings else "info",
                "count": len(warnings or []),
                "action": "stub next action",
            }
        ],
        "reportPath": "finish/regression/open_source_audit_report.json",
    }
    return json.dumps(report, ensure_ascii=False)


def _patch_runner(stub: CommandStub) -> Callable[..., dict[str, Any]]:
    original = pre_release_check._run_command

    def fake_run_command(name: str, command: list[str], *, timeout: int = 900) -> dict[str, Any]:
        return stub(name, command)

    pre_release_check._run_command = fake_run_command
    return original


def _run_with_stub(stub: CommandStub, **kwargs: Any) -> dict[str, Any]:
    original = _patch_runner(stub)
    try:
        return pre_release_check.run_pre_release_check(
            report_path=REPORT_PATH,
            allow_dirty=bool(kwargs.get("allow_dirty", False)),
            skip_regressions=True,
            skip_frontend_build=True,
            include_browser_e2e=False,
            strict_local_artifacts=bool(kwargs.get("strict_local_artifacts", False)),
        )
    finally:
        pre_release_check._run_command = original


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _make_stub(*, status: str = "", tracked: str = "README.md\napp/public/brand-logo.png\n", audit_stdout: str | None = None) -> CommandStub:
    def stub(name: str, command: list[str]) -> dict[str, Any]:
        joined = " ".join(command)
        if joined.startswith("git status"):
            return _result(status)
        if joined.startswith("git ls-files"):
            return _result(tracked)
        if "open_source_audit.py" in joined:
            return _result(audit_stdout if audit_stdout is not None else _audit_stdout())
        raise AssertionError(f"unexpected command: {joined}")

    return stub


def run_regression() -> dict[str, Any]:
    checks: list[str] = []

    clean = _run_with_stub(_make_stub())
    _assert(clean["ok"], "clean tree, clean audit, and no tracked artifacts should pass")
    _assert(clean["checks"]["trackedArtifacts"] == [], "brand logo must not be treated as a forbidden local artifact")
    checks.append("clean repository gate passes")

    dirty = _run_with_stub(_make_stub(status=" M README.md\n"))
    _assert(not dirty["ok"], "dirty tree should fail without --allow-dirty")
    _assert(any("working tree is dirty" in failure for failure in dirty["failures"]), "dirty failure should explain the working tree state")
    checks.append("dirty tree is blocked by default")

    dirty_allowed = _run_with_stub(_make_stub(status=" M README.md\n"), allow_dirty=True)
    _assert(dirty_allowed["ok"], "dirty tree should pass when --allow-dirty is explicit")
    _assert(any("allow-dirty" in warning for warning in dirty_allowed["warnings"]), "allow-dirty run should leave a warning")
    checks.append("explicit dirty override is visible")

    tracked = _run_with_stub(_make_stub(tracked="README.md\nfinish/leak.txt\npaper.pdf\napp/public/brand-logo.png\n"))
    _assert(not tracked["ok"], "tracked runtime artifacts and local documents should fail")
    _assert("finish/leak.txt" in tracked["checks"]["trackedArtifacts"], "tracked finish artifact should be reported")
    _assert("paper.pdf" in tracked["checks"]["trackedArtifacts"], "tracked local PDF should be reported")
    _assert("app/public/brand-logo.png" not in tracked["checks"]["trackedArtifacts"], "tracked brand logo should remain allowed")
    checks.append("tracked artifacts are blocked without blocking brand assets")

    strict_warning = _run_with_stub(
        _make_stub(audit_stdout=_audit_stdout(warnings=[{"code": "local.artifact", "path": "paper.pdf"}])),
        strict_local_artifacts=True,
    )
    _assert(not strict_warning["ok"], "strict local artifact mode should fail on local artifact warnings")
    _assert(strict_warning["checks"]["openSourceAudit"]["strictLocalArtifactFailure"], "strict warning failure should be explicit")
    _assert(strict_warning["nextActions"], "pre-release report should carry open-source audit next actions")
    _assert(strict_warning["checks"]["openSourceAudit"]["nextActions"], "open-source audit check should expose next actions")
    checks.append("strict local artifact mode escalates warnings")
    checks.append("open-source audit next actions are surfaced")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
