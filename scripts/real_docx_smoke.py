from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from docx_export_regression import DEFAULT_SCHOOL_SPEC_PATH, run_regression  # noqa: E402

DEFAULT_SAMPLE_PATH = ROOT_DIR / "基于图像分割的典型烟叶病虫害目标检测算法(1).docx"
DEFAULT_EXPORT_PATH = ROOT_DIR / "finish" / "regression" / "real_docx_smoke_export.docx"
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "real_docx_smoke_report.json"


def run_smoke(
    sample_path: Path,
    export_path: Path,
    report_path: Path,
    *,
    strict_missing: bool,
    strict_preflight: bool,
    strict_format_audit: bool,
    school_spec_path: Path | None,
) -> dict[str, Any]:
    if not sample_path.exists():
        report = {
            "ok": not strict_missing,
            "skipped": True,
            "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "samplePath": str(sample_path.resolve()),
            "exportPath": str(export_path.resolve()),
            "reportPath": str(report_path.resolve()),
            "failures": [f"sample DOCX not found: {sample_path}"] if strict_missing else [],
            "message": "Local real-document smoke sample is missing; use --sample to point at a DOCX.",
        }
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        return report

    work_sample_path = report_path.with_name(f"{report_path.stem}_input.docx")
    work_sample_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(sample_path, work_sample_path)

    report = run_regression(
        work_sample_path.resolve(),
        export_path.resolve(),
        report_path.resolve(),
        rebuild_sample=False,
        strict_preflight=strict_preflight,
        school_spec_path=school_spec_path,
    )
    original_failures = list(report.get("failures", []) or [])
    format_audit_warnings = [failure for failure in original_failures if str(failure).startswith("format audit issues:")]
    smoke_failures: list[str] = [
        failure
        for failure in original_failures
        if strict_format_audit or not str(failure).startswith("format audit issues:")
    ]
    snapshot = report.get("snapshot", {}) if isinstance(report.get("snapshot"), dict) else {}
    audit = report.get("audit", {}) if isinstance(report.get("audit"), dict) else {}
    export = report.get("export", {}) if isinstance(report.get("export"), dict) else {}
    if int(snapshot.get("editableUnitCount", 0) or 0) <= 0:
        smoke_failures.append("real DOCX produced no editable units")
    if int(snapshot.get("protectedUnitCount", 0) or 0) <= 0:
        smoke_failures.append("real DOCX produced no protected units")
    if not Path(str(export.get("exportPath") or export_path)).exists():
        smoke_failures.append("exported DOCX was not created")
    if not bool(audit.get("ok", True)):
        smoke_failures.append(f"export audit failed: {audit.get('issueCount')}")
    report["ok"] = not smoke_failures
    report["baseFailures"] = original_failures
    report["failures"] = smoke_failures
    report["smokeFailures"] = smoke_failures
    report["formatAuditWarnings"] = format_audit_warnings
    report["originalSamplePath"] = str(sample_path.resolve())
    report["workSamplePath"] = str(work_sample_path.resolve())
    report["smokeCheckedAt"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run a real DOCX export smoke test without calling an LLM.")
    parser.add_argument("--sample", type=Path, default=DEFAULT_SAMPLE_PATH)
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT_PATH)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    parser.add_argument("--strict-missing", action="store_true", help="Fail when the real DOCX sample is missing.")
    parser.add_argument("--strict-preflight", action="store_true", help="Fail when formatting preflight reports any issue.")
    parser.add_argument("--strict-format-audit", action="store_true", help="Fail on sample-specific editable font/line-spacing audit issues.")
    parser.add_argument("--school-spec", type=Path, default=DEFAULT_SCHOOL_SPEC_PATH)
    parser.add_argument("--no-school-spec", action="store_true", help="Do not activate school rules for this smoke run.")
    args = parser.parse_args(argv)
    report = run_smoke(
        args.sample.resolve(),
        args.export.resolve(),
        args.report.resolve(),
        strict_missing=args.strict_missing,
        strict_preflight=args.strict_preflight,
        strict_format_audit=args.strict_format_audit,
        school_spec_path=None if args.no_school_spec else args.school_spec.resolve(),
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
