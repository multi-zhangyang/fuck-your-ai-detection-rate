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
        {"name": "batch rerun task regression", "command": [sys.executable, "scripts/batch_rerun_task_regression.py"]},
        {"name": "frontend batch rerun regression", "command": ["node", "scripts/frontend_batch_rerun_regression.mjs"]},
        {"name": "frontend state machine regression", "command": ["node", "scripts/frontend_state_machine_regression.mjs"]},
        {"name": "frontend home layout regression", "command": ["node", "scripts/frontend_home_layout_regression.mjs"]},
        {"name": "frontend UI consistency regression", "command": ["node", "scripts/frontend_ui_consistency_regression.mjs"]},
        {"name": "frontend model-streaming regression", "command": ["node", "scripts/frontend_model_streaming_regression.mjs"]},
        {"name": "frontend rate-audit regression", "command": ["node", "scripts/frontend_rate_audit_regression.mjs"]},
        {"name": "frontend evidence-chain regression", "command": ["node", "scripts/frontend_evidence_chain_regression.mjs"]},
        {"name": "frontend source-relative style delta regression", "command": ["node", "scripts/frontend_source_relative_style_delta_regression.mjs"]},
        {"name": "frontend export-evidence regression", "command": ["node", "scripts/frontend_export_evidence_regression.mjs"]},
        {"name": "frontend state consistency regression", "command": ["node", "scripts/frontend_state_consistency_regression.mjs"]},
        {"name": "frontend review-save queue regression", "command": ["node", "scripts/frontend_review_save_queue_regression.mjs"]},
        {"name": "frontend round-snapshot regression", "command": ["node", "scripts/frontend_round_snapshot_regression.mjs"]},
        {"name": "frontend history governance regression", "command": ["node", "scripts/frontend_history_governance_regression.mjs"]},
        {"name": "frontend history-db maintenance regression", "command": ["node", "scripts/frontend_history_db_maintenance_regression.mjs"]},
        {"name": "run registry regression", "command": [sys.executable, "scripts/run_registry_regression.py"]},
        {"name": "review decisions regression", "command": [sys.executable, "scripts/review_decisions_regression.py"]},
        {"name": "document release gate regression", "command": [sys.executable, "scripts/document_release_gate_regression.py"]},
        {"name": "review materialized-delta freshness regression", "command": [sys.executable, "scripts/review_materialized_delta_freshness_regression.py"]},
        {"name": "review decisions CAS regression", "command": [sys.executable, "scripts/review_decisions_cas_regression.py"]},
        {"name": "round artifact snapshot regression", "command": [sys.executable, "scripts/round_artifact_snapshot_regression.py"]},
        {"name": "round snapshot backend-consumer regression", "command": [sys.executable, "scripts/round_snapshot_backend_consumer_regression.py"]},
        {"name": "export revision-binding regression", "command": [sys.executable, "scripts/export_revision_binding_regression.py"]},
        {"name": "plain export provenance regression", "command": [sys.executable, "scripts/plain_export_provenance_regression.py"]},
        {"name": "prompt preview regression", "command": [sys.executable, "scripts/prompt_preview_regression.py"]},
        {"name": "model route regression", "command": [sys.executable, "scripts/model_route_regression.py"]},
        {"name": "provider guard regression", "command": [sys.executable, "scripts/provider_guard_regression.py"]},
        {"name": "chunking regression", "command": [sys.executable, "scripts/chunking_regression.py"]},
        {"name": "freeze-chunk regression", "command": [sys.executable, "scripts/freeze_chunk_regression.py"]},
        {"name": "factual guards regression", "command": [sys.executable, "scripts/factual_guards_regression.py"]},
        {"name": "factual scope qualifier regression", "command": [sys.executable, "scripts/factual_scope_qualifier_regression.py"]},
        {"name": "rewrite quality regression", "command": [sys.executable, "scripts/rewrite_quality_regression.py"]},
        {"name": "academic readability delta regression", "command": [sys.executable, "scripts/academic_readability_regression.py"]},
        {"name": "candidate selection regression", "command": [sys.executable, "scripts/candidate_selection_regression.py"]},
        {"name": "source-relative style delta regression", "command": [sys.executable, "scripts/source_relative_style_delta_regression.py"]},
        {"name": "academic register drift regression", "command": [sys.executable, "scripts/academic_register_drift_regression.py"]},
        {"name": "real-provider quality contract offline regression", "command": [sys.executable, "scripts/real_quality_contract_regression.py"]},
        {"name": "real-thesis model E2E offline regression", "command": [sys.executable, "scripts/real_thesis_model_e2e_regression.py"], "timeout": 240},
        {"name": "validation fallback regression", "command": [sys.executable, "scripts/validation_fallback_regression.py"]},
        {"name": "single output retry regression", "command": [sys.executable, "scripts/single_output_retry_regression.py"]},
        {"name": "checkpoint resume regression", "command": [sys.executable, "scripts/checkpoint_resume_regression.py"]},
        {"name": "zero segment round regression", "command": [sys.executable, "scripts/zero_segment_round_regression.py"]},
        {"name": "parallel round regression", "command": [sys.executable, "scripts/parallel_round_regression.py"]},
        {"name": "round concurrency benchmark", "command": [sys.executable, "scripts/round_concurrency_benchmark.py"]},
        {"name": "targeted rerun fallback regression", "command": [sys.executable, "scripts/targeted_rerun_fallback_regression.py"]},
        {"name": "unified targeted candidate-selection regression", "command": [sys.executable, "scripts/unified_targeted_candidate_selection_regression.py"]},
        {"name": "legacy rerun review-contract regression", "command": [sys.executable, "scripts/legacy_rerun_review_contract_regression.py"]},
        {"name": "next-round review-materialization regression", "command": [sys.executable, "scripts/next_round_review_materialization_regression.py"]},
        {"name": "LLM client regression", "command": [sys.executable, "scripts/llm_client_regression.py"]},
        {"name": "stream reasoning-safety regression", "command": [sys.executable, "scripts/stream_reasoning_safety_regression.py"]},
        {"name": "history assets regression", "command": [sys.executable, "scripts/history_assets_regression.py"]},
        {"name": "document artifact isolation regression", "command": [sys.executable, "scripts/document_artifact_isolation_regression.py"]},
        {"name": "history DB regression", "command": [sys.executable, "scripts/history_db_regression.py"]},
        {"name": "history recovery reconciliation regression", "command": [sys.executable, "scripts/history_recovery_reconciliation_regression.py"]},
        {"name": "history DB integrity check", "command": [sys.executable, "scripts/fyadr_records.py", "history-db-check"]},
        {"name": "real DOCX smoke", "command": [sys.executable, "scripts/real_docx_smoke.py", *(("--strict-missing",) if strict_samples else ())]},
        {"name": "state machine regression", "command": [sys.executable, "scripts/state_machine_regression.py"]},
        {"name": "DOCX export regression", "command": [sys.executable, "scripts/docx_export_regression.py", "--rebuild-sample"]},
        {"name": "DOCX export bundle regression", "command": [sys.executable, "scripts/docx_export_bundle_regression.py"]},
        {"name": "DOCX source-anchor generation regression", "command": [sys.executable, "scripts/docx_source_anchor_generation_regression.py"]},
        {"name": "DOCX orphan provenance regression", "command": [sys.executable, "scripts/docx_orphan_provenance_regression.py"]},
        {"name": "DOCX fidelity-lock regression", "command": [sys.executable, "scripts/docx_fidelity_lock_regression.py"]},
        {"name": "document edit-contract regression", "command": [sys.executable, "scripts/document_edit_contract_regression.py"]},
        {"name": "DOCX structural-role contract regression", "command": [sys.executable, "scripts/docx_structural_role_contract_regression.py"]},
        {"name": "DOCX template-instruction scope regression", "command": [sys.executable, "scripts/docx_template_instruction_scope_regression.py"], "timeout": 240},
        {"name": "DOCX complex-fidelity regression", "command": [sys.executable, "scripts/docx_complex_fidelity_regression.py"]},
        {"name": "DOCX semantic-boundary regression", "command": [sys.executable, "scripts/docx_semantic_boundary_regression.py"]},
        {"name": "DOCX model format-anchor regression", "command": [sys.executable, "scripts/docx_model_format_anchor_regression.py"]},
        {"name": "DOCX targeted format-anchor regression", "command": [sys.executable, "scripts/docx_targeted_format_anchor_regression.py"]},
        {"name": "DOCX TOC boundary regression", "command": [sys.executable, "scripts/docx_toc_boundary_regression.py"]},
        {"name": "DOCX numbered structure boundary regression", "command": [sys.executable, "scripts/docx_numbered_structure_boundary_regression.py"]},
        {"name": "DOCX fidelity real verification", "command": [sys.executable, "scripts/fidelity_real_verification.py"]},
        {"name": "DOCX fidelity multi-round verification", "command": [sys.executable, "scripts/fidelity_multiround_verification.py"]},
        {"name": "style-dimensions regression", "command": [sys.executable, "scripts/style_dimensions_regression.py"]},
        {"name": "rate-audit regression", "command": [sys.executable, "scripts/rate_audit_regression.py"]},
        {"name": "rate-audit strategy execution regression", "command": [sys.executable, "scripts/rate_audit_strategy_execution_regression.py"]},
        {"name": "structure OOD regression", "command": [sys.executable, "scripts/structure_ood_regression.py"]},
        {"name": "structure subdimension regression", "command": [sys.executable, "scripts/structure_subdimension_regression.py"]},
        {"name": "round dimension rotation regression", "command": [sys.executable, "scripts/round_dimension_rotation_regression.py"]},
        {"name": "dimension rerun loop regression", "command": [sys.executable, "scripts/dimension_rerun_loop_regression.py"]},
        {"name": "dimension convergence regression", "command": [sys.executable, "scripts/dimension_convergence_regression.py"]},
        {"name": "style blacklist drift regression", "command": [sys.executable, "scripts/style_blacklist_drift_regression.py"]},
        {"name": "deterministic postprocess regression", "command": [sys.executable, "scripts/deterministic_postprocess_regression.py"]},
        {"name": "deterministic postprocess integration regression", "command": [sys.executable, "scripts/deterministic_postprocess_integration_regression.py"]},
        {"name": "legacy body-map DOCX export regression", "command": [sys.executable, "scripts/docx_legacy_body_map_export_regression.py"]},
        {"name": "Python compile", "command": [sys.executable, "-m", "py_compile", *_all_python_files()]},
        {"name": "open-source audit regression", "command": [sys.executable, "scripts/open_source_audit_regression.py"]},
        {"name": "pre-release check regression", "command": [sys.executable, "scripts/pre_release_check_regression.py"]},
        {"name": "start web regression", "command": [sys.executable, "scripts/start_web_regression.py"]},
        {"name": "web security regression", "command": [sys.executable, "scripts/web_security_regression.py"]},
        {"name": "production deployment regression", "command": [sys.executable, "scripts/production_deployment_regression.py"]},
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
    # Real-LLM end-to-end rewrite test: costs real API calls, gated by env var so
    # default CI runs skip it. Set FYADR_RUN_REAL_LLM=1 to exercise it. Skips
    # (green, not fail) when no provider is configured or the LLM is unreachable.
    if os.environ.get("FYADR_RUN_REAL_LLM") == "1":
        commands.append({"name": "real rewrite E2E (real LLM)", "command": [sys.executable, "scripts/real_rewrite_e2e_regression.py"], "timeout": 540})
        commands.append({"name": "real dimension gain (real LLM)", "command": [sys.executable, "scripts/real_dimension_gain_regression.py"], "timeout": 540})
        commands.append({"name": "real structure OOD (real LLM)", "command": [sys.executable, "scripts/real_structure_ood_regression.py"], "timeout": 540})
    return commands


def run_regressions(
    *,
    report_path: Path,
    skip_frontend_build: bool,
    include_web_health: bool,
    include_browser_e2e: bool,
    strict_samples: bool,
    fail_fast: bool,
    start_at: str | None = None,
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    failures: list[str] = []
    started = time.monotonic()

    commands = build_commands(
        skip_frontend_build=skip_frontend_build,
        include_web_health=include_web_health,
        include_browser_e2e=include_browser_e2e,
        strict_samples=strict_samples,
    )
    normalized_start = str(start_at or "").strip()
    if normalized_start:
        start_indexes = [
            index
            for index, item in enumerate(commands)
            if str(item.get("name", "")) == normalized_start
        ]
        if len(start_indexes) != 1:
            available = ", ".join(str(item.get("name", "")) for item in commands)
            raise ValueError(f"Unknown --start-at regression {normalized_start!r}. Available names: {available}")
        commands = commands[start_indexes[0]:]

    for item in commands:
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
        "startAt": normalized_start or None,
        "partial": bool(normalized_start),
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
    parser.add_argument(
        "--start-at",
        default="",
        metavar="REGRESSION_NAME",
        help="Start at one exact regression name for diagnosis. A partial run is never a full release result.",
    )
    args = parser.parse_args(argv)
    try:
        report = run_regressions(
            report_path=args.report.resolve(),
            skip_frontend_build=bool(args.skip_frontend_build),
            include_web_health=bool(args.include_web_health),
            include_browser_e2e=bool(args.include_browser_e2e),
            strict_samples=bool(args.strict_samples),
            fail_fast=bool(args.fail_fast),
            start_at=str(args.start_at or ""),
        )
    except ValueError as exc:
        parser.error(str(exc))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
