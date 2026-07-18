from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
from academic_readability import assess_academic_readability_delta  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    CANDIDATE_SELECTION_SCHEMA,
    CANDIDATE_SELECTION_VERSION,
    get_round_compare_path,
)


REVISION = "2026-07-18T00:00:00.000000Z"
SOURCE = "本研究采用控制实验评估所提出方法的稳定性，并在统一条件下比较不同参数设置的结果。"
REWRITE = "本研究通过控制实验评估所提出方法的稳定性，并在统一条件下比较不同参数设置所得结果。"
CUSTOM = "本研究采用受控实验检验所提出方法的稳定性，并在统一条件下分析不同参数设置的结果。"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _candidate(
    candidate_id: str,
    origin: str,
    text: str,
    *,
    baseline_text: str,
) -> dict[str, Any]:
    global_style_profile = app_service.build_global_style_profile_from_texts([baseline_text])
    candidate = app_service._evaluate_rewrite_candidate(
        input_text=baseline_text,
        output_text=text,
        candidate_id=candidate_id,
        origin=origin,
        attempt=0 if origin == "baseline" else 1,
        hard_valid=True,
        global_style_profile=global_style_profile,
    )
    _assert(candidate.get("readabilityGuardPassed") is True, "regression fixture introduced a readability failure")
    return {key: value for key, value in candidate.items() if not key.startswith("_")}


def _selection(
    text: str,
    *,
    published: bool,
    baseline_text: str | None = None,
    decision: str | None = None,
    run_failed: bool = False,
) -> dict[str, Any]:
    authoritative_baseline = baseline_text or (SOURCE if published else text)
    baseline = _candidate(
        "baseline",
        "baseline",
        authoritative_baseline,
        baseline_text=authoritative_baseline,
    )
    candidates = [baseline]
    selected = baseline
    if published:
        selected = _candidate(
            "model-attempt-1",
            "model",
            text,
            baseline_text=authoritative_baseline,
        )
        candidates.append(selected)
    return app_service._build_candidate_selection_event(
        chunk_id="p0_c0",
        round_number=1,
        candidates=candidates,
        selected=selected,
        reason_codes=["release-regression"],
        conditional_retry_count=0,
        decision=decision,
        run_failed=run_failed,
    )


def _chunk(
    output_text: str,
    *,
    selection: dict[str, Any] | None,
    candidate_baseline_text: str = SOURCE,
    failed_attempts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    chunk: dict[str, Any] = {
        "chunkId": "p0_c0",
        "paragraphIndex": 0,
        "chunkIndex": 0,
        "inputText": SOURCE,
        "outputText": output_text,
        "quality": {"needsReview": False, "flags": []},
    }
    if selection is not None:
        chunk["candidateSelection"] = selection
        chunk["candidateBaselineText"] = candidate_baseline_text
    if failed_attempts:
        chunk["failedAttempts"] = failed_attempts
    return chunk


def _fixture(root: Path, name: str, chunk: dict[str, Any]) -> dict[str, Path]:
    fixture_dir = root / name
    fixture_dir.mkdir(parents=True, exist_ok=True)
    output_path = (fixture_dir / "round1.txt").resolve()
    compare_path = get_round_compare_path(output_path).resolve()
    review_path = compare_path.with_name(f"{compare_path.stem}_review_decisions.json")
    output_path.write_text(str(chunk["outputText"]), encoding="utf-8")
    compare_payload = {
        "version": 2,
        "docId": f"document-release-gate/{name}.txt",
        "round": 1,
        "outputPath": str(output_path),
        "paragraphCount": 1,
        "chunkCount": 1,
        "updatedAt": REVISION,
        "chunks": [chunk],
    }
    candidate_baseline_text = str(chunk.get("candidateBaselineText", chunk["inputText"]) or "")
    document_profile = app_service.build_global_style_profile_from_texts(
        [candidate_baseline_text]
    )["documentPatternBaseline"]
    compare_payload["sourcePatternProfiles"] = {
        str(document_profile["profileSha256"]): document_profile
    }
    compare_payload["sourceRelativeDocumentDelta"] = (
        app_service.assess_source_relative_document_delta(
            [str(chunk["inputText"])],
            [str(chunk["outputText"])],
        )
    )
    compare_path.write_text(
        json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    review_path.unlink(missing_ok=True)
    return {"output": output_path, "compare": compare_path, "review": review_path}


def _assert_chunk_release(chunk: dict[str, Any], decision: Any) -> dict[str, Any]:
    baseline_text = str(chunk.get("candidateBaselineText", chunk.get("inputText", "")) or "")
    profile = app_service.build_global_style_profile_from_texts(
        [baseline_text]
    )["documentPatternBaseline"]
    return app_service._assert_document_release_chunk(
        chunk,
        decision,
        source_pattern_profile=profile,
    )


def _expect_release_error(
    call: Callable[[], Any],
    expected_issue: str,
) -> app_service.DocumentReleaseGateError:
    try:
        call()
    except app_service.DocumentReleaseGateError as exc:
        _assert(exc.code == "document_release_gate_failed", "release error code drifted")
        _assert(expected_issue in exc.issue_codes, f"missing release issue {expected_issue}: {exc.issue_codes}")
        serialized = json.dumps(exc.details, ensure_ascii=False, sort_keys=True)
        for body in (SOURCE, REWRITE, CUSTOM):
            _assert(body not in serialized and body not in str(exc), "release error leaked document text")
        return exc
    raise AssertionError(f"release gate unexpectedly accepted {expected_issue}")


def _assert_failed_save_is_atomic(
    fixture: dict[str, Path],
    decision: Any,
    expected_issue: str,
) -> app_service.DocumentReleaseGateError:
    before_compare = fixture["compare"].read_bytes()
    before_review = fixture["review"].read_bytes() if fixture["review"].exists() else None
    error = _expect_release_error(
        lambda: app_service.save_review_decisions(
            str(fixture["output"]),
            {"p0_c0": decision},
            expected_compare_revision=REVISION,
            require_compare_revision=True,
        ),
        expected_issue,
    )
    _assert(fixture["compare"].read_bytes() == before_compare, "failed review save mutated compare bytes")
    after_review = fixture["review"].read_bytes() if fixture["review"].exists() else None
    _assert(after_review == before_review, "failed review save mutated review-sidecar bytes/state")
    return error


def _test_assessor_positive_modes(checks: list[str]) -> None:
    source_report = _assert_chunk_release(
        _chunk(REWRITE, selection=_selection(SOURCE, published=False)),
        "source_confirmed",
    )
    _assert(source_report["mode"] == "source", "source_confirmed did not select source")

    frozen_report = _assert_chunk_release(
        _chunk(SOURCE, selection=None),
        "rewrite",
    )
    _assert(frozen_report["mode"] == "frozen_identity", "identity chunk was not admitted as frozen")

    model_report = _assert_chunk_release(
        _chunk(REWRITE, selection=_selection(REWRITE, published=True)),
        "rewrite_confirmed",
    )
    _assert(model_report["mode"] == "published_rewrite", "certified model rewrite was rejected")

    # A targeted selector baseline may already be an accepted review text and
    # therefore need not equal this round chunk's original input.
    baseline_report = _assert_chunk_release(
        _chunk(
            REWRITE,
            selection=_selection(REWRITE, published=False),
            candidate_baseline_text=REWRITE,
        ),
        "rewrite",
    )
    _assert(baseline_report["mode"] == "preserved_baseline", "certified baseline was rejected")

    custom_chunk = _chunk(REWRITE, selection=_selection(REWRITE, published=True))
    custom_report = _assert_chunk_release(
        custom_chunk,
        {"mode": "custom", "text": CUSTOM, "source": "manual", "confirmed": True},
    )
    _assert(custom_report["mode"] == "manual_custom", "independent manual custom was rejected")
    checks.append("source, frozen identity, published model, preserved baseline, and independent custom pass")


def _test_review_save_and_snapshot_defense(root: Path, checks: list[str]) -> None:
    stale_selection = _selection(SOURCE, published=False)
    fixture = _fixture(root, "stale-preserved", _chunk(REWRITE, selection=stale_selection))
    _assert_failed_save_is_atomic(fixture, "rewrite_confirmed", "result_output_hash_mismatch")

    linked_revision = "2026-07-18T00:00:01.000000Z"
    compare_payload = json.loads(fixture["compare"].read_text(encoding="utf-8"))
    compare_payload["reviewUpdatedAt"] = linked_revision
    fixture["compare"].write_text(
        json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    fixture["review"].write_text(
        json.dumps(
            {
                "outputPath": str(fixture["output"]),
                "updatedAt": linked_revision,
                "compareRevision": REVISION,
                "reviewBaseCompareRevision": REVISION,
                "decisions": {"p0_c0": "rewrite_confirmed"},
            },
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    _expect_release_error(
        lambda: app_service._materialize_rate_audit_output(
            fixture["output"],
            compare_payload=compare_payload,
        ),
        "result_output_hash_mismatch",
    )

    try:
        app_service.read_round_artifact_snapshot(fixture["output"])
    except app_service.RoundArtifactSnapshotError as exc:
        _assert(exc.code == "round_snapshot_release_gate_failed", f"snapshot returned {exc.code}")
        details_text = json.dumps(exc.details, ensure_ascii=False, sort_keys=True)
        _assert(SOURCE not in details_text and REWRITE not in details_text, "snapshot details leaked text")
    else:
        raise AssertionError("snapshot admitted stale preserved-baseline output")

    context = SimpleNamespace(round_number=2, parent_output_path=fixture["output"])
    try:
        app_service._capture_downstream_parent_snapshot(
            context,
            expected_previous_compare_revision=None,
            expected_parent_input_binding=None,
            require_revision=False,
            include_internal=False,
        )
    except app_service.StaleRoundInputError as exc:
        _assert(
            "round_snapshot_release_gate_failed" in exc.mismatch_codes,
            f"downstream stale codes lost release failure: {exc.mismatch_codes}",
        )
    else:
        raise AssertionError("downstream parent capture admitted stale output")

    export_path = fixture["output"].with_name("forbidden-export.txt")
    export_path.unlink(missing_ok=True)
    try:
        app_service.export_round_output(str(fixture["output"]), str(export_path), "txt")
    except app_service.RoundArtifactSnapshotError as exc:
        _assert(exc.code == "round_snapshot_release_gate_failed", f"export returned {exc.code}")
    else:
        raise AssertionError("TXT export admitted stale output")
    _assert(not export_path.exists(), "failed release gate created an export file")
    checks.append(
        "stale v7-form selection is atomic at save and blocked at direct materialization/snapshot/downstream/export"
    )


def _test_custom_anti_disguise(root: Path, checks: list[str]) -> None:
    base_chunk = _chunk(
        REWRITE,
        selection=_selection(REWRITE, published=True),
        failed_attempts=[{"attempt": 1, "outputText": CUSTOM, "outputCharCount": len(CUSTOM)}],
    )
    fixture = _fixture(root, "custom-anti-disguise", base_chunk)
    _assert_failed_save_is_atomic(
        fixture,
        {"mode": "custom", "text": CUSTOM, "source": "failed_output", "confirmed": True},
        "failed_output_custom_forbidden",
    )
    _assert_failed_save_is_atomic(
        fixture,
        {"mode": "custom", "text": CUSTOM, "source": "rejected_candidate", "confirmed": True},
        "failed_output_custom_forbidden",
    )
    _assert_failed_save_is_atomic(
        fixture,
        {"mode": "custom", "text": CUSTOM, "source": "manual", "confirmed": True},
        "custom_matches_failed_attempt",
    )

    candidate_hash_chunk = copy.deepcopy(base_chunk)
    candidate_hash_chunk.pop("failedAttempts", None)
    candidate_hash_chunk["candidateSelection"]["candidates"].append(
        _candidate(
            "model-attempt-2",
            "model",
            CUSTOM,
            baseline_text=SOURCE,
        )
    )
    candidate_fixture = _fixture(root, "custom-candidate-hash", candidate_hash_chunk)
    _assert_failed_save_is_atomic(
        candidate_fixture,
        {"mode": "custom", "text": CUSTOM, "source": "manual", "confirmed": True},
        "custom_matches_model_candidate",
    )
    checks.append("failed-output provenance, legacy alias, failed body, and model-candidate hash are rejected")


def _test_failed_selection_cannot_masquerade_as_rewrite(checks: list[str]) -> None:
    failed = _selection(
        REWRITE,
        published=False,
        decision="hard_failure_preserved_baseline",
        run_failed=True,
    )
    _expect_release_error(
        lambda: _assert_chunk_release(
            _chunk(REWRITE, selection=failed, candidate_baseline_text=REWRITE),
            "rewrite_confirmed",
        ),
        "candidate_selection_preservation_invalid",
    )
    source = _assert_chunk_release(
        _chunk(REWRITE, selection=failed, candidate_baseline_text=REWRITE),
        "source_confirmed",
    )
    _assert(source["mode"] == "source", "failed selection lost safe source escape hatch")
    checks.append("runFailed/hard-failure baseline cannot masquerade as rewrite but source remains available")


def main() -> None:
    checks: list[str] = []
    finish_root = ROOT_DIR / "finish"
    finish_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="document_release_gate_", dir=finish_root) as temp_dir:
        root = Path(temp_dir).resolve()
        _test_assessor_positive_modes(checks)
        _test_review_save_and_snapshot_defense(root, checks)
        _test_custom_anti_disguise(root, checks)
        _test_failed_selection_cannot_masquerade_as_rewrite(checks)
    print(json.dumps({"ok": True, "checks": checks}, ensure_ascii=False, indent=2))
    print("document_release_gate_regression: PASS")


if __name__ == "__main__":
    main()
