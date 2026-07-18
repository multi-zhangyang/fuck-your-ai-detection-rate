from __future__ import annotations

import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
import document_release_gate_regression as release_fixture  # noqa: E402
from fyadr_round_service import get_round_compare_path  # noqa: E402


REPORT_PATH = (
    ROOT_DIR
    / "finish"
    / "regression"
    / "review_materialized_delta_freshness_regression_report.json"
)
REVISION = "2026-07-18T00:00:00.000000Z"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _assert_safe_review_save_removes_stale_evidence(
    root: Path,
    checks: list[str],
) -> None:
    fixture = release_fixture._fixture(
        root,
        "safe-source-review",
        release_fixture._chunk(
            release_fixture.REWRITE,
            selection=release_fixture._selection(
                release_fixture.REWRITE,
                published=True,
            ),
        ),
    )
    compare_payload = json.loads(fixture["compare"].read_text(encoding="utf-8"))
    stale_evidence = app_service.assess_source_relative_document_delta(
        [release_fixture.SOURCE],
        [release_fixture.REWRITE],
    )
    _assert(stale_evidence.get("passed") is True, "safe stale fixture must start passed")
    stale_result_binding = str(
        stale_evidence.get("binding", {}).get("resultChunksSha256", "")
    )
    _assert(bool(stale_result_binding), "stale fixture lost its result chunk binding")
    compare_payload["materializedSourceRelativeDocumentDelta"] = stale_evidence
    fixture["compare"].write_text(
        json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )

    saved = app_service.save_review_decisions(
        str(fixture["output"]),
        {"p0_c0": "source_confirmed"},
        expected_compare_revision=REVISION,
        require_compare_revision=True,
    )
    persisted_compare = json.loads(fixture["compare"].read_text(encoding="utf-8"))
    _assert(
        "materializedSourceRelativeDocumentDelta" not in persisted_compare,
        "review save carried stale materialized document-delta evidence into the new revision",
    )
    _assert(
        persisted_compare.get("updatedAt") == saved.get("compareRevision"),
        "freshness cleanup was not published in the linked compare revision",
    )
    reports = app_service._assert_document_release_payload(
        persisted_compare,
        {"p0_c0": "source_confirmed"},
    )
    _assert(
        reports[0].get("mode") == "source",
        "fresh release assessment did not use the newly materialized source decision",
    )
    fresh_evidence = reports[-1].get("materializedDocumentDelta", {})
    fresh_result_binding = str(
        fresh_evidence.get("binding", {}).get("resultChunksSha256", "")
    )
    _assert(
        fresh_evidence.get("passed") is True
        and fresh_result_binding
        and fresh_result_binding != stale_result_binding,
        "fresh release assessment was not rebound to the source-selected materialization",
    )
    checks.append("safe review save drops stale passed evidence and release recomputes current text")


def _write_unsafe_custom_fixture(root: Path) -> dict[str, Path]:
    source = "该部分说明样本处理流程保持稳定。"
    output_path = (root / "unsafe-custom-review" / "round1.txt").resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n\n".join([source] * 4), encoding="utf-8")
    compare_path = get_round_compare_path(output_path).resolve()
    review_path = compare_path.with_name(f"{compare_path.stem}_review_decisions.json")
    chunks = [
        {
            "chunkId": f"p{index}_c0",
            "paragraphIndex": index,
            "chunkIndex": 0,
            "inputText": source,
            "outputText": source,
            "quality": {"needsReview": False, "flags": []},
        }
        for index in range(4)
    ]
    stale_passed = app_service.assess_source_relative_document_delta(
        [source] * 4,
        [source] * 4,
    )
    _assert(stale_passed.get("passed") is True, "unsafe fixture stale evidence must be passed")
    compare_path.write_text(
        json.dumps(
            {
                "version": 2,
                "docId": "review-materialized-delta-freshness",
                "round": 1,
                "outputPath": str(output_path),
                "paragraphCount": 4,
                "chunkCount": 4,
                "updatedAt": REVISION,
                "chunks": chunks,
                "sourceRelativeDocumentDelta": stale_passed,
                "materializedSourceRelativeDocumentDelta": stale_passed,
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )
    review_path.unlink(missing_ok=True)
    return {
        "output": output_path,
        "compare": compare_path,
        "review": review_path,
    }


def _assert_stale_passed_cannot_bypass_fresh_release(
    root: Path,
    checks: list[str],
) -> None:
    fixture = _write_unsafe_custom_fixture(root)
    source = "该部分说明样本处理流程保持稳定。"
    repeated_custom = "基于现有材料，该部分说明样本处理流程保持稳定。"
    decisions = {
        f"p{index}_c0": {
            "mode": "custom",
            "text": repeated_custom,
            "source": "manual",
            "confirmed": True,
        }
        for index in range(4)
    }
    before_compare = fixture["compare"].read_bytes()
    try:
        app_service.save_review_decisions(
            str(fixture["output"]),
            decisions,
            expected_compare_revision=REVISION,
            require_compare_revision=True,
        )
    except app_service.DocumentReleaseGateError as exc:
        _assert(
            "materialized_source_relative_document_delta_failed" in exc.issue_codes,
            f"fresh release failure lost the materialized document issue: {exc.issue_codes}",
        )
        _assert(
            "repeated_opening_family_introduced" in exc.issue_codes,
            f"fresh release failure lost its concrete pattern issue: {exc.issue_codes}",
        )
        serialized = json.dumps(exc.details, ensure_ascii=False, sort_keys=True)
        _assert(
            source not in serialized and repeated_custom not in serialized,
            "fresh release failure leaked document text",
        )
    else:
        raise AssertionError("stale passed evidence bypassed the fresh materialized release gate")
    _assert(
        fixture["compare"].read_bytes() == before_compare,
        "rejected review save mutated compare evidence",
    )
    _assert(
        not fixture["review"].exists(),
        "rejected review save published a decision sidecar",
    )
    checks.append("stale passed evidence cannot bypass fresh cumulative materialization checks")


def run_regression() -> dict[str, Any]:
    checks: list[str] = []
    finish_root = ROOT_DIR / "finish"
    finish_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(
        prefix="review_materialized_delta_freshness_",
        dir=finish_root,
    ) as temp_dir:
        root = Path(temp_dir).resolve()
        _assert_safe_review_save_removes_stale_evidence(root, checks)
        _assert_stale_passed_cannot_bypass_fresh_release(root, checks)
    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return report


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
