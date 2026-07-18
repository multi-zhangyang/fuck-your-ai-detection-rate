"""Targeted regression for the web_app RunRegistry encapsulation + create_app factory.

Before this change, web_app.py kept four in-flight run/batch-rerun dicts and a
lock as bare module globals, and constructed the Flask app inline at import
time with no factory. This locks the new structure: a single RunRegistry owns
the state, the module-level names are aliases for the *same* underlying dict
objects (so inline call sites and existing tests keep working), the registry
prunes stale runs under its own lock, and create_app() configures the app.
"""

from __future__ import annotations

import json
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import web_app  # noqa: E402

DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "run_registry_regression_report.json"


def main() -> int:
    failures: list[str] = []
    checks: list[str] = []

    # RunRegistry class exists and owns the state.
    if not hasattr(web_app, "RunRegistry"):
        failures.append("web_app.RunRegistry class must exist")
    else:
        checks.append("RunRegistry class is defined")

    registry = web_app.RUN_REGISTRY
    if not isinstance(registry, web_app.RunRegistry):
        failures.append("RUN_REGISTRY must be a RunRegistry instance")
    else:
        checks.append("RUN_REGISTRY is a RunRegistry instance")

    # The four legacy module-level dicts must be the *same objects* the
    # registry owns (backward-compatible aliases, not copies).
    alias_checks = {
        "RUN_STATES": (web_app.RUN_STATES, registry.run_states),
        "ACTIVE_RUNS_BY_SOURCE": (web_app.ACTIVE_RUNS_BY_SOURCE, registry.active_runs_by_source),
        "BATCH_RERUN_STATES": (web_app.BATCH_RERUN_STATES, registry.batch_rerun_states),
        "ACTIVE_BATCH_RERUNS_BY_OUTPUT": (web_app.ACTIVE_BATCH_RERUNS_BY_OUTPUT, registry.active_batch_reruns_by_output),
        "RUN_REGISTRY_LOCK": (web_app.RUN_REGISTRY_LOCK, registry.lock),
    }
    for name, (legacy, owned) in alias_checks.items():
        if legacy is not owned:
            failures.append(f"{name} must alias the registry-owned object (same identity)")
    if all(legacy is owned for legacy, owned in alias_checks.values()):
        checks.append("module-level run-state names alias the registry's owned objects/lock")

    # The lock is a real lock (shared between module and registry).
    if not isinstance(web_app.RUN_REGISTRY_LOCK, type(threading.Lock())):
        failures.append("RUN_REGISTRY_LOCK must be a threading.Lock")
    else:
        checks.append("RUN_REGISTRY_LOCK is a shared threading.Lock instance")

    # prune_stale drops completed runs past the cutoff while keeping active
    # ones, and is safe to call under the registry lock.
    registry.run_states.clear()
    registry.active_runs_by_source.clear()
    registry.batch_rerun_states.clear()
    registry.active_batch_reruns_by_output.clear()

    @dataclass
    class FakeState:
        completed: bool = False
        updated_at: float = field(default_factory=time.time)

    keep_id = "run-keep"
    stale_id = "run-stale"
    registry.run_states[keep_id] = FakeState(completed=False, updated_at=time.time())  # type: ignore[assignment]
    registry.run_states[stale_id] = FakeState(completed=True, updated_at=time.time() - 99999)  # type: ignore[assignment]
    registry.active_runs_by_source["src-keep"] = keep_id
    registry.active_runs_by_source["src-stale"] = stale_id

    with registry.lock:
        registry.prune_stale(time.time() - 1)
    if stale_id in registry.run_states:
        failures.append("prune_stale must drop completed runs past the cutoff")
    else:
        checks.append("prune_stale drops completed runs past the cutoff")
    if keep_id not in registry.run_states:
        failures.append("prune_stale must keep active (incomplete) runs")
    else:
        checks.append("prune_stale keeps active runs")
    if "src-stale" in registry.active_runs_by_source:
        failures.append("prune_stale must drop lookups whose run was pruned")
    else:
        checks.append("prune_stale drops orphaned source/output lookups")

    # prune_run_states (the public helper) must delegate to the registry and
    # use the registry lock, not a separate inline block.
    import inspect

    prune_source = inspect.getsource(web_app.prune_run_states)
    if "RUN_REGISTRY.prune_stale" not in prune_source:
        failures.append("prune_run_states must delegate to RUN_REGISTRY.prune_stale")
    else:
        checks.append("prune_run_states delegates pruning to the registry")

    # create_app() factory exists, returns the module app, and configures it.
    if not callable(getattr(web_app, "create_app", None)):
        failures.append("create_app factory must be defined")
    else:
        checks.append("create_app factory is defined")
    if web_app.create_app() is not web_app.app:
        failures.append("create_app() must return the module-level app")
    else:
        checks.append("create_app() returns the module-level app instance")
    max_content = web_app.app.config.get("MAX_CONTENT_LENGTH")
    if not isinstance(max_content, int) or max_content <= 0:
        failures.append("create_app must set a positive MAX_CONTENT_LENGTH")
    else:
        checks.append("create_app configures a positive request-size cap")

    # Sanity: the app still exposes the /api/ping route (decoration intact).
    rules = {rule.rule for rule in web_app.app.url_map.iter_rules()}
    if "/api/ping" not in rules:
        failures.append("app must still expose /api/ping route after refactor")
    else:
        checks.append("app retains its routes after the factory refactor")

    report = {
        "ok": not failures,
        "createdAt": "2026-07-16T00:00:00Z",
        "failures": failures,
        "checks": checks,
    }
    DEFAULT_REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    DEFAULT_REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
