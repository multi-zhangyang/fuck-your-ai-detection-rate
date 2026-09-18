from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Check:
    name: str
    command: tuple[str, ...]


def checks(*, skip_frontend_build: bool, include_browser_e2e: bool) -> list[Check]:
    npm = shutil.which("npm") or shutil.which("npm.cmd") or "npm"
    values = [
        Check(
            "Python 核心回归",
            (
                sys.executable,
                "-m",
                "unittest",
                "discover",
                "-s",
                "scripts",
                "-p",
                "core_*_regression.py",
                "-v",
            ),
        ),
        Check("Python 编译", (sys.executable, "-m", "compileall", "-q", "scripts")),
        Check("前端差异对照", (npm, "--prefix", "app", "run", "test:diff")),
        Check("正文范围统计", (npm, "--prefix", "app", "run", "test:scope")),
        Check("前端文案检查", (npm, "--prefix", "app", "run", "check:text")),
    ]
    if not skip_frontend_build:
        values.append(Check("前端生产构建", (npm, "--prefix", "app", "run", "build")))
    if include_browser_e2e:
        values.append(Check("浏览器端到端", (npm, "--prefix", "app", "run", "test:e2e:smoke")))
    return values


def run_check(check: Check) -> int:
    started = time.monotonic()
    print(f"\n==> {check.name}", flush=True)
    completed = subprocess.run(check.command, cwd=ROOT_DIR, check=False)
    elapsed = time.monotonic() - started
    state = "通过" if completed.returncode == 0 else f"失败（{completed.returncode}）"
    print(f"<== {check.name}：{state}，{elapsed:.1f}s", flush=True)
    return completed.returncode


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="运行 FYADR 核心回归。")
    parser.add_argument("--skip-frontend-build", action="store_true", help="跳过前端生产构建。")
    parser.add_argument("--include-browser-e2e", action="store_true", help="额外运行真实浏览器流程。")
    parser.add_argument("--fail-fast", action="store_true", help="首项失败后立即停止。")
    args = parser.parse_args()

    failures: list[str] = []
    for check in checks(
        skip_frontend_build=args.skip_frontend_build,
        include_browser_e2e=args.include_browser_e2e,
    ):
        if run_check(check) != 0:
            failures.append(check.name)
            if args.fail_fast:
                break
    if failures:
        print(f"\n回归失败：{'、'.join(failures)}", file=sys.stderr)
        return 1
    print("\n全部核心回归通过。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
