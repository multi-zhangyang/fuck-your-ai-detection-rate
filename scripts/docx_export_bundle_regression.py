from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
from docx_export_regression import create_regression_sample, identity_transform  # noqa: E402
from round_helper import run_document_round  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "docx_export_bundle_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_manifest(result: dict[str, object]) -> tuple[Path, dict[str, object]]:
    manifest_path = Path(str(result.get("evidenceManifestPath", "")))
    _assert(manifest_path.exists(), "certified DOCX evidence manifest is missing")
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    _assert(isinstance(payload, dict), "certified DOCX evidence manifest is invalid")
    return manifest_path, payload


def main() -> int:
    checks: list[str] = []
    regression_root = ROOT_DIR / "finish" / "web_exports"
    regression_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="docx-export-bundle-", dir=regression_root) as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / "source.docx"
        create_regression_sample(source_path)
        round_result = run_document_round(source_path, identity_transform, round_number=1, prompt_profile="cn")
        output_path = Path(str(round_result["output_path"]))
        latest_alias = temp_path / "paper.docx"

        first = app_service.export_round_output(str(output_path), str(latest_alias), "docx")
        second = app_service.export_round_output(str(output_path), str(latest_alias), "docx")
        first_path = Path(str(first["path"]))
        second_path = Path(str(second["path"]))
        _assert(first_path != second_path, "repeated exports reused a mutable certified artifact path")
        _assert(first_path.exists() and second_path.exists(), "one immutable certified artifact disappeared after a later export")
        _assert(latest_alias.exists() and latest_alias.read_bytes() == second_path.read_bytes(), "latest compatibility alias does not mirror the newest certified artifact")

        first_manifest_path, first_manifest = _read_manifest(first)
        second_manifest_path, second_manifest = _read_manifest(second)
        for artifact_path, manifest in ((first_path, first_manifest), (second_path, second_manifest)):
            _assert(manifest.get("status") == "passed", "certified manifest status is not passed")
            _assert(manifest.get("artifactPath") == str(artifact_path.resolve()), "manifest points to a mutable or different artifact")
            _assert(manifest.get("artifactSha256") == _sha256(artifact_path), "manifest hash does not match its immutable artifact")
            report_paths = manifest.get("reports") if isinstance(manifest.get("reports"), dict) else {}
            _assert(report_paths, "certified manifest omitted its audit reports")
            for raw_report_path in report_paths.values():
                report_path = Path(str(raw_report_path))
                _assert(report_path.exists(), f"certified report is missing: {report_path}")
                report_text = report_path.read_text(encoding="utf-8")
                _assert(".tmp.docx" not in report_text, "certified report still points to a deleted staging DOCX")
                _assert(str(artifact_path.resolve()) in report_text or report_path.name.endswith("_format_preflight.json"), "certified report is not bound to its immutable artifact")
        checks.append("repeated DOCX exports publish immutable hash-bound artifact bundles")

        protected = app_service._collect_referenced_history_artifacts([str(second_path)])
        second_report_paths = {
            Path(str(path)).resolve()
            for path in (second_manifest.get("reports") or {}).values()
        }
        _assert(second_manifest_path.resolve() in protected, "orphan cleanup did not protect the active evidence manifest")
        missing_protected_reports = sorted(str(path) for path in second_report_paths - protected)
        _assert(not missing_protected_reports, f"orphan cleanup did not protect all reports in the active evidence bundle: {missing_protected_reports}")
        _assert(first_manifest_path.resolve() not in protected, "protecting one export attempt incorrectly pins every historical attempt")
        checks.append("orphan cleanup expands an active artifact into its complete evidence bundle")

        certified_alias_bytes = latest_alias.read_bytes()
        certified_attempts_before = {path.resolve() for path in temp_path.glob("paper.*.docx")}
        certified_sidecars_before = {path.resolve() for path in temp_path.glob("paper.*.json")}
        original_prepare_bundle = app_service._prepare_docx_export_evidence_bundle

        def force_evidence_publish_failure(*_args, **_kwargs):
            raise RuntimeError("forced evidence publication failure")

        try:
            app_service._prepare_docx_export_evidence_bundle = force_evidence_publish_failure
            try:
                app_service.export_round_output(str(output_path), str(latest_alias), "docx")
            except RuntimeError as exc:
                _assert("forced evidence publication failure" in str(exc), "unexpected evidence publication failure")
            else:
                raise AssertionError("DOCX export succeeded without publishing its evidence manifest")
        finally:
            app_service._prepare_docx_export_evidence_bundle = original_prepare_bundle
        certified_attempts_after = {path.resolve() for path in temp_path.glob("paper.*.docx")}
        certified_sidecars_after = {path.resolve() for path in temp_path.glob("paper.*.json")}
        _assert(certified_attempts_after == certified_attempts_before, "failed evidence publication left an uncertified immutable DOCX")
        _assert(certified_sidecars_after == certified_sidecars_before, "failed evidence publication left misleading passed sidecars or a manifest")
        _assert(latest_alias.read_bytes() == certified_alias_bytes, "failed evidence publication replaced the latest certified alias")
        checks.append("evidence publication failure removes the unpublished attempt and preserves the prior certified alias")

        leaked_staging = list(temp_path.glob(".*.tmp.docx")) + list(temp_path.glob(".*.latest.tmp"))
        _assert(not leaked_staging, f"DOCX bundle publication leaked temporary files: {leaked_staging}")
        checks.append("immutable publication leaves no DOCX or latest-alias staging files")

        plain_text_path = temp_path / "plain_source.txt"
        plain_text_path.write_text("这是从纯文本新建 Word 的正文。", encoding="utf-8")
        generated = app_service.export_round_output(
            str(plain_text_path),
            str(temp_path / "generated.docx"),
            "docx",
        )
        _assert(generated.get("sourceKind") == "generated_docx", "plain text Word export did not disclose generated source kind")
        _assert(generated.get("formatMode") == "generated_default", "generated Word incorrectly claimed preserve-original mode")
        _assert(generated.get("contentContractStatus") == "not_applicable", "generated Word incorrectly claimed a DOCX content contract")
        _assert(generated.get("formatLockStatus") == "not_applicable", "generated Word incorrectly claimed an original-format lock")
        _assert(generated.get("contentContractReady") is False, "generated Word used true as a not-applicable contract default")
        _assert(generated.get("modelInputMatchesEditableUnits") is False, "generated Word used true as a not-applicable model-scope default")
        _assert("document_generation" in (generated.get("checksPerformed") or []), "generated Word omitted its real generation check")
        checks.append("generated Word evidence is explicit and never impersonates original-format preservation")

    report = {"ok": True, "checks": checks}
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
