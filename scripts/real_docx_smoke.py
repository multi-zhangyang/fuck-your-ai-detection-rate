from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
from docx_export_regression import DEFAULT_SCHOOL_SPEC_PATH, _audit_exported_editable_format, run_regression  # noqa: E402

SMOKE_OUTPUT_DIRS = (
    ROOT_DIR / "finish" / "intermediate",
    ROOT_DIR / "finish" / "regression",
)


def _workspace_doc_id(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(ROOT_DIR.resolve()).as_posix()
    except ValueError:
        return resolved.as_posix()


def _delete_smoke_history(doc_id: str) -> dict[str, Any]:
    try:
        result = app_service.delete_document_history(doc_id, mode="records_artifacts_and_source")
    except ValueError as exc:
        if "Document record not found" not in str(exc):
            raise
        return {
            "ok": True,
            "skipped": True,
            "reason": "record_not_found",
            "docId": doc_id,
        }
    return result if isinstance(result, dict) else {"ok": True, "docId": doc_id}


def _is_under(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root.resolve())
        return True
    except ValueError:
        return False


def _unlink_smoke_file(path: Path, prefixes: set[str], removed: list[str], failed: list[dict[str, str]]) -> None:
    resolved = path.resolve()
    if not resolved.exists() or not resolved.is_file():
        return
    if not any(_is_under(resolved, root) for root in SMOKE_OUTPUT_DIRS):
        return
    if not any(resolved.name.startswith(prefix) for prefix in prefixes if prefix):
        return
    try:
        resolved.unlink()
    except OSError as exc:
        failed.append({"path": str(resolved), "message": str(exc)})
        return
    removed.append(str(resolved))


def _cleanup_previous_smoke_run(work_sample_path: Path, export_path: Path, report_path: Path) -> dict[str, Any]:
    doc_id = _workspace_doc_id(work_sample_path)
    history_result = _delete_smoke_history(doc_id)

    export_stems = {
        export_path.stem,
        f"{export_path.stem}_post_rerun",
        f"{export_path.stem}_auto_numbered_post_rerun",
    }
    prefixes = {work_sample_path.stem, report_path.stem, *export_stems}
    removed: list[str] = []
    failed: list[dict[str, str]] = []

    direct_candidates = {
        work_sample_path,
        report_path,
        export_path,
        export_path.with_suffix(".audit.json"),
        export_path.with_suffix(".guard.json"),
    }
    for stem in export_stems:
        direct_candidates.update({
            export_path.with_name(f"{stem}{export_path.suffix}"),
            export_path.with_name(f"{stem}.audit.json"),
            export_path.with_name(f"{stem}.guard.json"),
        })

    for candidate in direct_candidates:
        _unlink_smoke_file(candidate, prefixes, removed, failed)

    for root in SMOKE_OUTPUT_DIRS:
        if not root.exists():
            continue
        for candidate in root.glob("*"):
            _unlink_smoke_file(candidate, prefixes, removed, failed)

    return {
        "docId": doc_id,
        "history": history_result,
        "removedFileCount": len(removed),
        "removedFiles": removed[:40],
        "failedFiles": failed,
    }

DEFAULT_SAMPLE_PATH = ROOT_DIR / "基于图像分割的典型烟叶病虫害目标检测算法(1).docx"
DEFAULT_EXPORT_PATH = ROOT_DIR / "finish" / "regression" / "real_docx_smoke_export.docx"
DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "real_docx_smoke_report.json"
AUTO_NUMBERED_BODY_RE = re.compile(r"^\s*(?:\d+(?:\.\d+)*|[一二三四五六七八九十]+)[\.．、)]\s*\S")


def _read_json(path: str | Path | None) -> dict[str, Any]:
    if not path:
        return {}
    json_path = Path(path)
    if not json_path.exists():
        return {}
    try:
        payload = json.loads(json_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return payload if isinstance(payload, dict) else {}


def _chunk_text(chunk: dict[str, Any]) -> str:
    return str(chunk.get("outputText") or chunk.get("inputText") or "").strip()


def _select_targeted_rerun_smoke_target(compare_payload: dict[str, Any]) -> dict[str, Any] | None:
    chunks = compare_payload.get("chunks")
    if not isinstance(chunks, list):
        return None
    candidates = [chunk for chunk in chunks if isinstance(chunk, dict) and len(_chunk_text(chunk)) >= 40]
    if not candidates:
        return None

    def score(chunk: dict[str, Any]) -> tuple[int, int, int]:
        text = _chunk_text(chunk)
        auto_numbered = 1 if AUTO_NUMBERED_BODY_RE.search(text) else 0
        technical_terms = ("YOLO", "CNN", "R-CNN", "mAP", "IoU", "LSTM", "Transformer", "XGBoost", "LightGBM")
        technical = 1 if any(term.lower() in text.lower() for term in technical_terms) else 0
        return (auto_numbered, technical, min(len(text), 600))

    return max(candidates, key=score)


def _build_smoke_rerun_feedback(target_chunk: dict[str, Any]) -> str:
    excerpt = " ".join(_chunk_text(target_chunk).split())[:420]
    return (
        "TARGETED_RERUN_USER_FEEDBACK: keep the Diff review visible.\n"
        f"Excerpt: {excerpt}\n"
        "Preserve factual claims, numbering, citations, and English spacing."
    )


def _run_targeted_rerun_chain_smoke(report: dict[str, Any], export_path: Path) -> dict[str, Any]:
    failures: list[str] = []
    output_path = Path(str(report.get("outputPath", "")))
    compare_path = Path(str((report.get("round") or {}).get("comparePath", "")))
    snapshot_path = Path(str((report.get("snapshot") or {}).get("path", "")))
    compare_payload = _read_json(compare_path)
    if not output_path.exists():
        return {"ok": False, "failures": [f"round output is missing: {output_path}"]}
    if not compare_payload:
        return {"ok": False, "failures": [f"round compare is missing or invalid: {compare_path}"]}

    target_chunk = _select_targeted_rerun_smoke_target(compare_payload)
    if target_chunk is None:
        return {"ok": False, "failures": ["no suitable compare chunk for targeted rerun smoke"]}
    target_chunk_id = str(target_chunk.get("chunkId", ""))
    user_feedback = _build_smoke_rerun_feedback(target_chunk)

    prompts: list[str] = []
    original_builder = app_service._build_transform_from_model_config

    def fake_builder(_model_config: dict[str, Any]):
        def smoke_transform(chunk_text: str, prompt_input: str, _round: int, _chunk_id: str) -> str:
            prompts.append(prompt_input)
            return chunk_text

        return smoke_transform, "online"

    try:
        app_service._build_transform_from_model_config = fake_builder
        rerun_result = app_service.rerun_compare_chunk(
            str(output_path),
            target_chunk_id,
            {"baseUrl": "http://localhost", "apiKey": "smoke", "model": "smoke-model"},
            user_feedback,
        )
    finally:
        app_service._build_transform_from_model_config = original_builder

    rerun_chunk = rerun_result.get("chunk") if isinstance(rerun_result, dict) else {}
    if not prompts or "TARGETED_RERUN_USER_FEEDBACK" not in prompts[0]:
        failures.append("targeted rerun prompt did not include user feedback")
    if prompts and "[DETECTOR MICRO-REPAIR MODE]" in prompts[0]:
        failures.append("targeted rerun should not enter removed detection-report mode")
    if isinstance(rerun_chunk, dict) and ("rerunCandidateCount" in rerun_chunk or "rerunSelectedCandidate" in rerun_chunk):
        failures.append("targeted rerun should not emit legacy candidate metadata")
    if isinstance(rerun_chunk, dict) and "rerunDetectorProfile" in rerun_chunk:
        failures.append("targeted rerun should not persist removed detection-report metadata")

    post_rerun_export_path = export_path.with_name(f"{export_path.stem}_post_rerun{export_path.suffix}")
    post_export_result = app_service.export_round_output(str(output_path), str(post_rerun_export_path), "docx", "school_rules")
    post_format_audit = _audit_exported_editable_format(post_rerun_export_path, snapshot_path)
    if int(post_export_result.get("auditIssueCount", 0) or 0) != 0:
        failures.append(f"post-rerun export audit issues: {post_export_result.get('auditIssueCount')}")
    if int(post_export_result.get("preflightIssueCount", 0) or 0) != 0:
        failures.append(f"post-rerun export preflight issues: {post_export_result.get('preflightIssueCount')}")

    return {
        "ok": not failures,
        "failures": failures,
        "targetChunkId": target_chunk_id,
        "targetPreview": _chunk_text(target_chunk)[:180],
        "targetWasAutoNumberedBody": bool(AUTO_NUMBERED_BODY_RE.search(_chunk_text(target_chunk))),
        "promptContainsUserFeedback": bool(prompts and "TARGETED_RERUN_USER_FEEDBACK" in prompts[0]),
        "postRerunExport": post_export_result,
        "postRerunFormatAudit": post_format_audit,
    }


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
    cleanup = _cleanup_previous_smoke_run(work_sample_path, export_path, report_path)
    shutil.copy2(sample_path, work_sample_path)

    report = run_regression(
        work_sample_path.resolve(),
        export_path.resolve(),
        report_path.resolve(),
        rebuild_sample=False,
        strict_preflight=strict_preflight,
        school_spec_path=school_spec_path,
        strict_sample_scope=False,
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
    chain_smoke = _run_targeted_rerun_chain_smoke(report, export_path.resolve())
    smoke_failures.extend(str(failure) for failure in chain_smoke.get("failures", []) or [])
    report["ok"] = not smoke_failures
    report["baseFailures"] = original_failures
    report["failures"] = smoke_failures
    report["smokeFailures"] = smoke_failures
    report["chainSmoke"] = chain_smoke
    report["formatAuditWarnings"] = format_audit_warnings
    report["originalSamplePath"] = str(sample_path.resolve())
    report["workSamplePath"] = str(work_sample_path.resolve())
    report["cleanup"] = cleanup
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
