from __future__ import annotations

import json
import shutil
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


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "docx_orphan_provenance_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> int:
    checks: list[str] = []
    regression_root = ROOT_DIR / "finish" / "regression"
    regression_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="docx-orphan-provenance-", dir=regression_root) as temp_dir:
        temp_path = Path(temp_dir)
        source_path = temp_path / "source.docx"
        create_regression_sample(source_path)
        round_result = run_document_round(
            source_path,
            identity_transform,
            round_number=1,
            prompt_profile="cn",
        )
        original_output = Path(str(round_result["output_path"]))
        original_body_map = Path(str(round_result["body_map_path"]))
        original_compare = Path(str(round_result["compare_path"]))
        original_manifest = Path(str(round_result["manifest_path"]))

        orphan_output = temp_path / "orphan_round1.txt"
        orphan_body_map = orphan_output.with_name(f"{orphan_output.stem}_body_map.json")
        orphan_compare = app_service._find_compare_path_for_output(orphan_output)
        orphan_manifest = orphan_output.with_name(f"{orphan_output.stem}_manifest.json")
        shutil.copyfile(original_output, orphan_output)
        shutil.copyfile(original_body_map, orphan_body_map)
        shutil.copyfile(original_compare, orphan_compare)
        shutil.copyfile(original_manifest, orphan_manifest)

        _assert(app_service._find_origin_docx_for_output(orphan_output) is None, "fixture unexpectedly retained usable history provenance")
        _assert(app_service._load_body_map_for_output(orphan_output) is not None, "fixture lost its valid versioned body map")

        export_path = temp_path / "orphan_export.docx"
        result = app_service.export_round_output(str(orphan_output), str(export_path), "docx")
        _assert(result.get("sourceKind") == "original_docx", "valid orphan DOCX body map was downgraded to generated_docx")
        _assert(result.get("contentContractStatus") == "passed", "recovered orphan DOCX did not run the content contract")
        _assert(result.get("formatLockStatus") == "passed", "recovered orphan DOCX did not run the format lock")
        _assert(int(result.get("formatLockIssueCount", -1) or 0) == 0, "recovered orphan DOCX drifted from its source format")
        _assert(export_path.exists(), "recovered orphan DOCX was not published")
        checks.append("valid body-map authority recovers original-DOCX provenance without history records")

        original_body_map_bytes = orphan_body_map.read_bytes()
        orphan_body_map.write_text("{broken-json", encoding="utf-8")
        blocked_export = temp_path / "corrupt_body_map_export.docx"
        blocked_stage = ""
        try:
            app_service.export_round_output(str(orphan_output), str(blocked_export), "docx")
        except app_service.ExportRoundError as exc:
            failure = exc.export_failure if isinstance(exc.export_failure, dict) else {}
            blocked_stage = str(failure.get("stage", "") or "")
        else:
            raise AssertionError("corrupt orphan DOCX body map was silently exported as generated_docx")
        finally:
            orphan_body_map.write_bytes(original_body_map_bytes)
        _assert(blocked_stage == "provenance", f"corrupt orphan body map blocked at unexpected stage: {blocked_stage}")
        _assert(not blocked_export.exists(), "blocked orphan DOCX provenance left a downloadable Word file")
        checks.append("corrupt DOCX provenance cannot fail open into a newly generated Word")

    report = {"ok": True, "checks": checks}
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
