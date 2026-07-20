from __future__ import annotations

import json
import re
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "dependency_governance_regression_report.json"
PACKAGE_LINE = re.compile(r"^([A-Za-z0-9][A-Za-z0-9_.-]*)==([^\s;\\]+)", flags=re.MULTILINE)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _locked_packages(text: str) -> dict[str, str]:
    return {
        name.lower().replace("_", "-"): version
        for name, version in PACKAGE_LINE.findall(text)
    }


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    pyproject = (ROOT_DIR / "pyproject.toml").read_text(encoding="utf-8")
    runtime_lock = (ROOT_DIR / "requirements.lock").read_text(encoding="utf-8")
    dev_lock = (ROOT_DIR / "requirements-dev.lock").read_text(encoding="utf-8")
    compatibility_requirements = (ROOT_DIR / "requirements.txt").read_text(encoding="utf-8")
    gitignore = (ROOT_DIR / ".gitignore").read_text(encoding="utf-8")
    dockerfile = (ROOT_DIR / "Dockerfile").read_text(encoding="utf-8")
    workflow = (ROOT_DIR / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
    posix_launcher = (ROOT_DIR / "start_web.sh").read_text(encoding="utf-8")
    windows_launcher = (ROOT_DIR / "start_web.ps1").read_text(encoding="utf-8")

    for direct_dependency in ("Flask>=3.0,<4", "flask-compress>=1.14,<2", "python-docx>=0.8.11,<2"):
        _assert(direct_dependency in pyproject, f"pyproject lost direct dependency: {direct_dependency}")
    _assert("gunicorn>=21.2,<26; platform_system != 'Windows'" in pyproject, "Gunicorn must remain excluded from native Windows installs")
    _assert("pypdf" not in pyproject.lower(), "unused pypdf dependency must not return")
    checks.append("pyproject owns bounded cross-platform direct dependencies")

    compatibility_lines = [
        line.strip()
        for line in compatibility_requirements.splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    _assert(compatibility_lines == ["-r requirements.lock"], "requirements.txt must remain a compatibility alias to the runtime lock")
    _assert("/uv.lock" in gitignore, "the redundant uv project lock must stay ignored")

    runtime_packages = _locked_packages(runtime_lock)
    dev_packages = _locked_packages(dev_lock)
    for package in ("flask", "flask-compress", "python-docx", "gunicorn"):
        _assert(package in runtime_packages, f"runtime lock is missing {package}")
        _assert(dev_packages.get(package) == runtime_packages[package], f"development lock drifted from runtime {package}")
    _assert(dev_packages.get("ruff") == "0.15.22", "development lock must pin the configured Ruff release")
    _assert("pypdf" not in runtime_packages and "pypdf" not in dev_packages, "unused pypdf dependency must stay out of locks")
    _assert(runtime_lock.count("--hash=sha256:") >= len(runtime_packages), "runtime lock must hash every resolved package")
    _assert(dev_lock.count("--hash=sha256:") >= len(dev_packages), "development lock must hash every resolved package")
    checks.append("runtime and development locks are exact, hashed, and mutually consistent")

    _assert("COPY requirements.lock ./" in dockerfile, "Docker must copy the runtime lock")
    _assert("--require-hashes -r requirements.lock" in dockerfile, "Docker must enforce dependency hashes")
    _assert("requirements.txt" not in dockerfile, "Docker must not resolve the compatibility requirements file")
    _assert("requirements-dev.lock" in workflow and "python -m ruff check ." in workflow, "CI must install the development lock and run Ruff")
    _assert(workflow.count("--require-hashes -r requirements.lock") >= 1, "platform CI must install the hashed runtime lock")
    _assert("pip install --upgrade pip" not in workflow, "CI must not mutate pip before installing the reviewed lock")
    checks.append("Docker and CI consume reviewed locks without fresh dependency resolution")

    _assert("requirements.lock" in posix_launcher and "--require-hashes" in posix_launcher, "POSIX launcher must install the hashed runtime lock")
    _assert("requirements.lock" in windows_launcher and '"--require-hashes"' in windows_launcher, "Windows launcher must install the hashed runtime lock")
    _assert("pypdf" not in posix_launcher.lower() and "pypdf" not in windows_launcher.lower(), "launchers must not require removed pypdf")
    checks.append("native launchers use the same runtime lock and import only real dependencies")

    return {"ok": True, "checks": checks, "runtimePackages": runtime_packages, "developmentPackages": dev_packages}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
