from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    _build_candidate_selection_event,
    _evaluate_rewrite_candidate,
    _select_rewrite_candidate,
    get_round_compare_path,
)
from web_app import app  # noqa: E402


WORK_DIR = ROOT_DIR / "finish" / "regression" / "review_decisions_cas"
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "review_decisions_cas_regression_report.json"

SOURCE = (
    "首先，系统读取用户提交的论文段落并建立任务记录。"
    "其次，服务按照段落边界生成改写单元并保留原有编号。"
    "此外，校验模块核对术语、数值和引用标记。"
    "因此，只有通过事实与格式检查的文本才会进入结果页，审阅者仍需确认每处修改。"
)
CANDIDATE_V1 = (
    "系统读取用户提交的论文段落并建立任务记录，服务再按照段落边界生成改写单元，同时保留原有编号。"
    "校验模块负责核对术语、数值和引用标记；文本仅在通过事实与格式检查后进入结果页，"
    "审阅者仍需确认每处修改。"
)
CANDIDATE_V2 = (
    "系统读取用户提交的论文段落并建立任务记录，随后按照段落边界生成改写单元，并保留原有编号。"
    "校验模块核对术语、数值和引用标记；文本仅在通过事实与格式检查后进入结果页，"
    "审阅者仍需确认每处修改。"
)
CONNECTOR_DIMENSION: dict[str, object] = {
    "id": "connector_detail",
    "label": "衔接与终稿",
    "primaryMetric": "connectorDensity",
    "secondaryMetric": "burstConnectorDensity",
}


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _published_selection(
    candidate: str,
    *,
    global_style_profile: dict[str, object],
) -> dict[str, object]:
    chunk_id = "p0001-c00"
    app_service.validate_chunk_output(SOURCE, SOURCE, chunk_id)
    app_service.validate_chunk_output(SOURCE, candidate, chunk_id)
    baseline = _evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=SOURCE,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=CONNECTOR_DIMENSION,
        global_style_profile=global_style_profile,
    )
    generated = _evaluate_rewrite_candidate(
        input_text=SOURCE,
        output_text=candidate,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=CONNECTOR_DIMENSION,
        global_style_profile=global_style_profile,
    )
    selected, reason_codes = _select_rewrite_candidate(
        [baseline, generated],
        round_dimension=CONNECTOR_DIMENSION,
    )
    _assert(selected is generated, "CAS fixture candidate did not win the production selector")
    _assert(generated.get("safetyEligible") is True, "CAS fixture candidate is not release eligible")
    _assert(generated.get("readabilityGuardPassed") is True, "CAS fixture candidate failed readability delta")
    return _build_candidate_selection_event(
        chunk_id=chunk_id,
        round_number=1,
        candidates=[baseline, generated],
        selected=selected,
        reason_codes=reason_codes,
        conditional_retry_count=0,
    )


def _write_compare(path: Path, *, revision: str, candidate: str, review_required: bool = True) -> None:
    global_style_profile = app_service.build_global_style_profile_from_texts([SOURCE])
    source_pattern_profile = global_style_profile["documentPatternBaseline"]
    chunk: dict[str, Any] = {
        "chunkId": "p0001-c00",
        "paragraphIndex": 0,
        "chunkIndex": 0,
        "inputText": SOURCE,
        "outputText": candidate,
        "candidateBaselineText": SOURCE,
        "quality": {"needsReview": False, "flags": []},
        "candidateSelection": _published_selection(
            candidate,
            global_style_profile=global_style_profile,
        ),
    }
    if review_required:
        chunk["rateAuditStrategyReviewRequired"] = True
    path.write_text(
        json.dumps(
            {
                "version": 2,
                "docId": "review-decisions-cas",
                "round": 1,
                "updatedAt": revision,
                "chunkCount": 1,
                "paragraphCount": 1,
                "chunks": [chunk],
                "sourcePatternProfiles": {
                    str(source_pattern_profile["profileSha256"]): source_pattern_profile,
                },
                "sourceRelativeDocumentDelta": app_service.assess_source_relative_document_delta(
                    [SOURCE],
                    [candidate],
                ),
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def run_regression() -> dict[str, Any]:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    output_path = WORK_DIR / "round1.txt"
    output_path.write_text(CANDIDATE_V1, encoding="utf-8")
    compare_path = get_round_compare_path(output_path)
    decisions_path = compare_path.with_name(f"{compare_path.stem}_review_decisions.json")
    decisions_path.unlink(missing_ok=True)
    revision_0 = "2026-07-18T00:00:00.000000Z"
    _write_compare(compare_path, revision=revision_0, candidate=CANDIDATE_V1)

    checks: list[str] = []
    client = app.test_client()

    missing_response = client.post(
        "/api/review-decisions",
        json={"outputPath": str(output_path), "decisions": {"p0001-c00": "rewrite_confirmed"}},
    )
    _assert(missing_response.status_code == 428, "review POST without a revision must return HTTP 428")
    _assert(missing_response.get_json().get("code") == "review_revision_required", "missing revision must expose a stable error code")
    _assert(not decisions_path.exists(), "a precondition-free request must not create a review sidecar")
    checks.append("external review writes require expectedCompareRevision")

    loaded = client.get("/api/review-decisions", query_string={"outputPath": str(output_path)})
    _assert(loaded.status_code == 200, "review GET failed")
    _assert(loaded.get_json().get("compareRevision") == revision_0, "review GET did not bind decisions to the current compare")

    accepted = client.post(
        "/api/review-decisions",
        json={
            "outputPath": str(output_path),
            "expectedCompareRevision": revision_0,
            "decisions": {"p0001-c00": "rewrite_confirmed"},
        },
    )
    _assert(accepted.status_code == 200, "fresh review confirmation was rejected")
    revision_1 = str(accepted.get_json().get("compareRevision", ""))
    _assert(revision_1 and revision_1 != revision_0, "successful review save did not advance its revision")
    accepted_compare = json.loads(compare_path.read_text(encoding="utf-8"))
    accepted_review = json.loads(decisions_path.read_text(encoding="utf-8"))
    _assert(accepted_compare.get("updatedAt") == revision_1, "compare did not publish the returned revision")
    _assert(accepted_review.get("compareRevision") == revision_1, "review sidecar did not bind to the returned revision")
    _assert("rateAuditStrategyReviewRequired" not in accepted_compare["chunks"][0], "fresh confirmation did not resolve strategy review")
    checks.append("fresh confirmation advances and links compare/review revisions")

    # A delayed symbolic confirmation for v1 must never approve replacement v2.
    revision_2 = "2026-07-18T00:00:02.000000Z"
    output_path.write_text(CANDIDATE_V2, encoding="utf-8")
    _write_compare(compare_path, revision=revision_2, candidate=CANDIDATE_V2)
    decisions_path.write_text(
        json.dumps(
            {
                "outputPath": str(output_path),
                "updatedAt": revision_2,
                "compareRevision": revision_2,
                "decisions": {},
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    before_stale_compare = compare_path.read_bytes()
    before_stale_review = decisions_path.read_bytes()
    stale = client.post(
        "/api/review-decisions",
        json={
            "outputPath": str(output_path),
            "expectedCompareRevision": revision_1,
            "decisions": {"p0001-c00": "rewrite_confirmed"},
        },
    )
    _assert(stale.status_code == 409, "stale candidate confirmation must return HTTP 409")
    stale_payload = stale.get_json()
    _assert(stale_payload.get("code") == "stale_review_decisions", "stale save must expose a stable error code")
    _assert(stale_payload.get("currentCompareRevision") == revision_2, "stale response omitted the current revision")
    _assert(compare_path.read_bytes() == before_stale_compare, "stale save changed compare data")
    _assert(decisions_path.read_bytes() == before_stale_review, "stale save changed review decisions")
    current_compare = json.loads(compare_path.read_text(encoding="utf-8"))
    _assert(current_compare["chunks"][0].get("rateAuditStrategyReviewRequired") is True, "stale save cleared the new candidate review gate")
    checks.append("old rewrite_confirmed cannot approve a replacement candidate")

    tab_a = client.post(
        "/api/review-decisions",
        json={
            "outputPath": str(output_path),
            "expectedCompareRevision": revision_2,
            "decisions": {"p0001-c00": "source_confirmed"},
        },
    )
    _assert(tab_a.status_code == 200, "first cross-tab save failed")
    tab_a_revision = str(tab_a.get_json().get("compareRevision", ""))
    tab_b = client.post(
        "/api/review-decisions",
        json={
            "outputPath": str(output_path),
            "expectedCompareRevision": revision_2,
            "decisions": {"p0001-c00": "rewrite_confirmed"},
        },
    )
    _assert(tab_b.status_code == 409, "second tab's stale whole snapshot was accepted")
    final_review = app_service.load_review_decisions(str(output_path))
    _assert(final_review["decisions"] == {"p0001-c00": "source_confirmed"}, "stale whole snapshot erased the winning decision")
    _assert(final_review.get("compareRevision") == tab_a_revision, "loaded review state is not linked to the winning compare")
    checks.append("whole-snapshot CAS prevents cross-tab lost updates")

    linked_compare_bytes = compare_path.read_bytes()
    inconsistent_compare = json.loads(linked_compare_bytes.decode("utf-8"))
    inconsistent_compare["reviewUpdatedAt"] = "1999-01-01T00:00:00Z"
    compare_path.write_text(json.dumps(inconsistent_compare, ensure_ascii=False, indent=2), encoding="utf-8")
    inconsistent_review_before = decisions_path.read_bytes()
    inconsistent = client.post(
        "/api/review-decisions",
        json={
            "outputPath": str(output_path),
            "expectedCompareRevision": tab_a_revision,
            "decisions": {"p0001-c00": "rewrite_confirmed"},
        },
    )
    _assert(inconsistent.status_code == 409, "unlinked review sidecar must fail closed")
    _assert(inconsistent.get_json().get("code") == "review_state_inconsistent", "unlinked sidecar returned the wrong conflict code")
    _assert(decisions_path.read_bytes() == inconsistent_review_before, "inconsistent state was overwritten by a full snapshot")
    compare_path.write_bytes(linked_compare_bytes)
    checks.append("explicit compare/sidecar linkage drift blocks review replacement")

    rollback_compare_before = compare_path.read_bytes()
    rollback_review_before = decisions_path.read_bytes()
    original_replace = app_service._replace_file_bytes_atomically
    replace_count = 0

    def fail_compare_commit(path: Path, payload: bytes) -> None:
        nonlocal replace_count
        replace_count += 1
        if replace_count == 2:
            raise OSError("injected compare publication failure")
        original_replace(path, payload)

    app_service._replace_file_bytes_atomically = fail_compare_commit
    try:
        try:
            app_service.save_review_decisions(
                str(output_path),
                {"p0001-c00": "rewrite_confirmed"},
                expected_compare_revision=tab_a_revision,
                require_compare_revision=True,
            )
            raise AssertionError("injected review transaction failure did not propagate")
        except OSError as exc:
            _assert("injected" in str(exc), "unexpected injected failure")
    finally:
        app_service._replace_file_bytes_atomically = original_replace
    _assert(compare_path.read_bytes() == rollback_compare_before, "failed review transaction changed compare bytes")
    _assert(decisions_path.read_bytes() == rollback_review_before, "failed review transaction changed sidecar bytes")
    checks.append("review sidecar and compare roll back together on publication failure")

    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
