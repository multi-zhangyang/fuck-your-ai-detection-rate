from __future__ import annotations

import copy
import hashlib
import json
import sys
import tempfile
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

import app_service  # noqa: E402
from chunking import Chunk, ChunkManifest, ParagraphManifest  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    _build_candidate_selection_event,
    _evaluate_rewrite_candidate,
    get_round_compare_path,
)
from web_app import app  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "round_artifact_snapshot_regression_report.json"
REVISION_0 = "2026-07-18T00:00:00.000000Z"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _assert_hex_digest(value: Any, message: str) -> None:
    text = str(value or "")
    _assert(len(text) == 64 and all(character in "0123456789abcdef" for character in text), message)


def _expect_snapshot_error(call: Callable[[], Any], code: str) -> app_service.RoundArtifactSnapshotError:
    try:
        call()
    except app_service.RoundArtifactSnapshotError as exc:
        _assert(exc.code == code, f"expected {code}, got {exc.code}: {exc}")
        return exc
    raise AssertionError(f"snapshot unexpectedly succeeded; expected {code}")


def _published_selection(
    input_text: str,
    output_text: str,
    chunk_id: str,
    *,
    global_style_profile: dict[str, object],
) -> dict[str, object]:
    neutral = {"id": "neutral", "primaryMetric": ""}
    baseline = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=input_text,
        candidate_id="baseline",
        origin="baseline",
        attempt=0,
        hard_valid=True,
        round_dimension=neutral,
        global_style_profile=global_style_profile,
    )
    candidate = _evaluate_rewrite_candidate(
        input_text=input_text,
        output_text=output_text,
        candidate_id="model-attempt-1",
        origin="model",
        attempt=1,
        hard_valid=True,
        round_dimension=neutral,
        global_style_profile=global_style_profile,
    )
    _assert(candidate.get("safetyEligible") is True, f"fixture {chunk_id} rewrite is not release eligible")
    return _build_candidate_selection_event(
        chunk_id=chunk_id,
        round_number=1,
        candidates=[baseline, candidate],
        selected=candidate,
        reason_codes=["fixture_production_selected"],
        conditional_retry_count=0,
    )


def _manifest(source_paragraphs: list[str]) -> ChunkManifest:
    paragraphs: list[ParagraphManifest] = []
    chunks: list[Chunk] = []
    for index, text in enumerate(source_paragraphs):
        chunk_id = f"p{index}_c0"
        paragraphs.append(
            ParagraphManifest(
                paragraph_index=index,
                original_text=text,
                chunk_ids=[chunk_id],
                split_reason="paragraph-kept",
                original_metric_count=len(text),
            )
        )
        chunks.append(
            Chunk(
                chunk_id=chunk_id,
                paragraph_index=index,
                chunk_index=0,
                text=text,
                char_count=len(text),
                word_count=len(text.split()),
            )
        )
    return ChunkManifest(
        chunk_limit=1800,
        chunk_metric="char",
        paragraph_count=len(paragraphs),
        chunk_count=len(chunks),
        paragraphs=paragraphs,
        chunks=chunks,
    )


def _build_fixture(root: Path, name: str = "round") -> dict[str, Any]:
    fixture_dir = root / name
    fixture_dir.mkdir(parents=True, exist_ok=True)
    output_path = (fixture_dir / "round1.txt").resolve()
    compare_path = get_round_compare_path(output_path).resolve()
    review_path = compare_path.with_name(f"{compare_path.stem}_review_decisions.json")
    manifest_path = output_path.with_name(f"{output_path.stem}_manifest.json")
    body_map_path = output_path.with_name(f"{output_path.stem}_body_map.json")
    source_paragraphs = [
        "第一段冻结原文包含研究背景与实验边界。",
        "第二段冻结原文保留引用 [1] 与数值 42。",
    ]
    candidate_paragraphs = [
        "第一段冻结原文保留研究背景与实验边界，并调整句法节奏。",
        "第二段候选改写仍保留引用 [1] 与数值 42。",
    ]
    global_style_profile = app_service.build_global_style_profile_from_texts(source_paragraphs)
    source_pattern_profile = global_style_profile["documentPatternBaseline"]
    manifest = _manifest(source_paragraphs)
    manifest_path.write_text(
        json.dumps(manifest.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    output_path.write_text("\n\n".join(candidate_paragraphs), encoding="utf-8")
    compare_payload = {
        "version": 2,
        "docId": f"snapshot-regression/{name}.txt",
        "round": 1,
        "promptProfile": "default",
        "promptSequence": ["round1", "round2"],
        "inputPath": str(output_path.with_name("round1_input.txt")),
        "outputPath": str(output_path),
        "manifestPath": str(manifest_path),
        "paragraphCount": len(source_paragraphs),
        "chunkCount": len(source_paragraphs),
        "updatedAt": REVISION_0,
        "chunks": [
            {
                "chunkId": chunk.chunk_id,
                "paragraphIndex": chunk.paragraph_index,
                "chunkIndex": chunk.chunk_index,
                "inputText": chunk.text,
                "outputText": candidate_paragraphs[index],
                "candidateBaselineText": chunk.text,
                "candidateSelection": _published_selection(
                    chunk.text,
                    candidate_paragraphs[index],
                    chunk.chunk_id,
                    global_style_profile=global_style_profile,
                ),
                "quality": {"needsReview": False, "flags": []},
            }
            for index, chunk in enumerate(manifest.chunks)
        ],
        "sourcePatternProfiles": {
            str(source_pattern_profile["profileSha256"]): source_pattern_profile,
        },
        "sourceRelativeDocumentDelta": app_service.assess_source_relative_document_delta(
            source_paragraphs,
            candidate_paragraphs,
        ),
    }
    compare_path.write_text(
        json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    review_path.unlink(missing_ok=True)
    body_map_path.unlink(missing_ok=True)
    return {
        "output": output_path,
        "compare": compare_path,
        "review": review_path,
        "manifest": manifest_path,
        "bodyMap": body_map_path,
        "sourceParagraphs": source_paragraphs,
        "candidateParagraphs": candidate_paragraphs,
    }


def _read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    _assert(isinstance(value, dict), f"expected object at {path}")
    return value


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def _write_linked_review(
    fixture: dict[str, Any],
    decisions: dict[str, Any],
    *,
    review_revision: str = "2026-07-18T00:00:01.000000Z",
    base_revision: str | None = None,
) -> None:
    compare_payload = _read_json(fixture["compare"])
    compare_payload["reviewUpdatedAt"] = review_revision
    _write_json(fixture["compare"], compare_payload)
    _write_json(
        fixture["review"],
        {
            "outputPath": str(fixture["output"]),
            "updatedAt": review_revision,
            "compareRevision": base_revision or str(compare_payload.get("updatedAt", "")),
            "reviewBaseCompareRevision": base_revision or str(compare_payload.get("updatedAt", "")),
            "decisions": decisions,
        },
    )


def _test_base_snapshot_and_api(root: Path, checks: list[str]) -> None:
    fixture = _build_fixture(root, "base")
    full = app_service.read_round_artifact_snapshot(
        fixture["output"],
        include_internal=True,
    )
    expected_effective = "\n\n".join(fixture["candidateParagraphs"])
    _assert(full["version"] == 1, "snapshot version drifted")
    _assert(full["outputPath"] == str(fixture["output"]), "snapshot did not canonicalize outputPath")
    _assert(full["compare"]["outputPath"] == full["outputPath"], "compare response identity is not canonical")
    _assert(full["review"]["outputPath"] == full["outputPath"], "review response identity is not canonical")
    _assert(full["review"]["docId"] == full["docId"], "review doc identity is missing")
    _assert(full["review"]["round"] == full["round"], "review round identity is missing")
    _assert(full["review"]["reviewLinkStatus"] == "none", "empty review state has the wrong link status")
    _assert(full["review"]["reviewLinkReady"] is True, "empty review state must be coherent")
    _assert(full["review"]["updatedAt"] == "", "empty review state invented an updatedAt")
    _assert(full["review"]["reviewBaseCompareRevision"] == "", "empty review state invented a base revision")
    _assert(full["compareRevision"] == REVISION_0, "snapshot lost the compare revision")
    _assert(full["compare"]["compareRevision"] == full["compareRevision"], "compare CAS token diverged")
    _assert(full["review"]["currentCompareRevision"] == full["compareRevision"], "review current CAS token diverged")
    _assert(full["effectivePreview"]["text"] == expected_effective, "base effective preview is not compare materialized")
    _assert(full["rawOutputMatchesEffective"] is True, "matching raw output was marked stale")
    _assert(full["bodyMapMatchesEffective"] is None, "TXT snapshot invented body-map evidence")
    _assert(full["materializationSource"] == "review_materialized_compare", "materialization source drifted")
    for key in (
        "reviewRevision",
        "contentRevision",
        "artifactSnapshotDigest",
        "compareSha256",
        "effectiveTextSha256",
        "outputSha256",
        "manifestSha256",
    ):
        _assert_hex_digest(full.get(key), f"{key} is not a bare SHA-256 digest")
    _assert(full["reviewSha256"] is None, "missing sidecar exposed a fake file hash")
    _assert(full["bodyMapSha256"] is None, "TXT snapshot exposed a body-map hash")
    _assert(full["_internal"]["effectiveText"] == expected_effective, "internal full text is incomplete")
    _assert(full["_internal"]["effectiveParagraphs"] == fixture["candidateParagraphs"], "internal paragraphs drifted")
    _assert(full["_internal"]["compareBytes"] == fixture["compare"].read_bytes(), "compare bytes were not captured exactly")
    _assert(full["_internal"]["manifestBytes"] == fixture["manifest"].read_bytes(), "manifest bytes were not captured exactly")

    original_output_bytes = fixture["output"].read_bytes()
    crlf_effective = expected_effective.replace("\n", "\r\n")
    fixture["output"].write_bytes(crlf_effective.encode("utf-8"))
    crlf_snapshot = app_service.read_round_artifact_snapshot(
        fixture["output"],
        include_internal=True,
    )
    _assert(
        crlf_snapshot["rawOutputMatchesEffective"] is True,
        "platform CRLF output was incorrectly marked stale",
    )
    _assert(
        crlf_snapshot["_internal"]["rawOutputText"] == crlf_effective,
        "snapshot stopped retaining exact decoded CRLF output evidence",
    )
    _assert(
        crlf_snapshot["outputSha256"] == hashlib.sha256(crlf_effective.encode("utf-8")).hexdigest(),
        "newline normalization changed the exact output-byte hash",
    )
    _assert(
        crlf_snapshot["outputSha256"] != crlf_snapshot["effectiveTextSha256"],
        "CRLF fixture did not prove byte-level and semantic equality remain distinct",
    )
    fixture["output"].write_bytes(original_output_bytes)

    limited = app_service.read_round_artifact_snapshot(fixture["output"], max_preview_chars=12)
    _assert(limited["effectivePreview"]["truncated"] is True, "maxChars did not truncate the preview")
    _assert(limited["effectivePreview"]["totalChars"] == len(expected_effective), "preview truncation changed totalChars")
    for key in (
        "reviewRevision",
        "contentRevision",
        "artifactSnapshotDigest",
        "effectiveTextSha256",
        "outputSha256",
        "manifestSha256",
    ):
        _assert(limited[key] == full[key], f"maxChars changed {key}")

    client = app.test_client()
    response = client.get(
        "/api/round-snapshot",
        query_string={"outputPath": str(fixture["output"]), "maxChars": "12"},
    )
    _assert(response.status_code == 200, f"round snapshot API failed: {response.get_data(as_text=True)}")
    api_payload = response.get_json()
    _assert(isinstance(api_payload, dict), "round snapshot API did not return an object")
    _assert("_internal" not in api_payload, "round snapshot API leaked internal artifact bytes")
    _assert(api_payload.get("contentRevision") == full["contentRevision"], "API revision differs from helper")
    _assert(api_payload.get("effectivePreview", {}).get("truncated") is True, "API maxChars was ignored")

    legacy_compare = _read_json(fixture["compare"])
    legacy_compare.pop("updatedAt", None)
    _write_json(fixture["compare"], legacy_compare)
    legacy_revision = app_service.read_round_artifact_snapshot(fixture["output"])
    _assert(
        legacy_revision["compareRevision"] == f"sha256:{legacy_revision['compareSha256']}",
        "legacy compare did not receive an exact-byte SHA CAS token",
    )
    checks.append(
        "base snapshot captures exact artifacts, normalizes platform newlines for semantic cache equality, "
        "exposes identity/revision chain, and limits preview only"
    )


def _test_review_materialization_and_base_lag(root: Path, checks: list[str]) -> None:
    fixture = _build_fixture(root, "review-save")
    before = app_service.read_round_artifact_snapshot(fixture["output"])
    saved = app_service.save_review_decisions(
        str(fixture["output"]),
        {"p0_c0": "source_confirmed"},
        expected_compare_revision=before["compareRevision"],
        require_compare_revision=True,
    )
    after = app_service.read_round_artifact_snapshot(fixture["output"], include_internal=True)
    expected_paragraphs = [fixture["sourceParagraphs"][0], fixture["candidateParagraphs"][1]]
    _assert(after["_internal"]["effectiveParagraphs"] == expected_paragraphs, "saved source decision was not materialized")
    _assert(after["rawOutputMatchesEffective"] is False, "review-only save did not mark raw cache stale")
    _assert(after["outputSha256"] == before["outputSha256"], "review-only save rewrote raw output evidence")
    _assert(after["contentRevision"] != before["contentRevision"], "review-only save did not advance content revision")
    _assert(after["review"]["reviewLinkStatus"] == "linked", "fresh review save is not linked")
    _assert(after["compareRevision"] == saved["compareRevision"], "snapshot missed fresh review compare revision")
    _assert(after["review"]["reviewBaseCompareRevision"] == saved["compareRevision"], "fresh review base revision drifted")

    compare_payload = _read_json(fixture["compare"])
    compare_payload["updatedAt"] = "2026-07-18T00:00:02.000000Z"
    _write_json(fixture["compare"], compare_payload)
    strategy_like = app_service.read_round_artifact_snapshot(fixture["output"])
    _assert(strategy_like["review"]["reviewLinkStatus"] == "linked", "valid retained review sidecar was rejected")
    _assert(
        strategy_like["review"]["reviewBaseCompareRevision"] == saved["compareRevision"],
        "review provenance did not retain its base generation",
    )
    _assert(
        strategy_like["review"]["reviewBaseCompareRevision"] != strategy_like["compareRevision"],
        "test did not exercise a legal lagging review base",
    )
    checks.append("compare+review remain canonical when raw caches lag and review base legally trails current compare")


def _test_strict_review_fail_closed(root: Path, checks: list[str]) -> None:
    fixture = _build_fixture(root, "strict-review")
    _write_linked_review(fixture, {"p0_c0": "source_confirmed"})
    linked_compare = fixture["compare"].read_bytes()
    linked_review = fixture["review"].read_bytes()

    mismatch_compare = _read_json(fixture["compare"])
    mismatch_compare["reviewUpdatedAt"] = "1999-01-01T00:00:00Z"
    _write_json(fixture["compare"], mismatch_compare)
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_link_mismatch",
    )
    fixture["compare"].write_bytes(linked_compare)

    fixture["review"].write_bytes(b"{broken")
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_corrupt",
    )
    client = app.test_client()
    corrupt_response = client.get(
        "/api/round-snapshot",
        query_string={"outputPath": str(fixture["output"])},
    )
    _assert(corrupt_response.status_code == 409, "corrupt sidecar API response must be HTTP 409")
    _assert(corrupt_response.get_json().get("code") == "round_snapshot_review_corrupt", "corrupt sidecar API code drifted")
    fixture["review"].write_bytes(linked_review)

    invalid_decision = _read_json(fixture["review"])
    invalid_decision["decisions"] = {
        "p0_c0": {"mode": "custom", "text": "人工文本", "confirmed": "false"}
    }
    _write_json(fixture["review"], invalid_decision)
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_decision_invalid",
    )

    unknown_chunk = copy.deepcopy(invalid_decision)
    unknown_chunk["decisions"] = {"not-in-compare": "source_confirmed"}
    _write_json(fixture["review"], unknown_chunk)
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_chunk_mismatch",
    )

    wrong_output = copy.deepcopy(unknown_chunk)
    wrong_output["decisions"] = {}
    wrong_output["outputPath"] = str((root / "another-output.txt").resolve())
    _write_json(fixture["review"], wrong_output)
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_output_mismatch",
    )

    fixture["review"].unlink()
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_review_missing",
    )

    fixture["review"].write_bytes(linked_review)
    legacy_compare = _read_json(fixture["compare"])
    legacy_compare.pop("reviewUpdatedAt", None)
    _write_json(fixture["compare"], legacy_compare)
    legacy = app_service.read_round_artifact_snapshot(fixture["output"])
    _assert(legacy["review"]["reviewLinkStatus"] == "legacy_unversioned", "valid legacy sidecar was not identified")
    _assert(legacy["review"]["decisions"] == {"p0_c0": "source_confirmed"}, "legacy decisions were discarded")
    checks.append("declared review corruption/mismatch fails closed while strictly valid legacy sidecars remain explicit")


def _test_body_map_and_manifest_evidence(root: Path, checks: list[str]) -> None:
    fixture = _build_fixture(root, "body-map")
    body_payload = {
        "version": 4,
        "editable_unit_count": 2,
        "units": [
            {"unit_id": "u0", "unit_index": 0, "current_text": fixture["candidateParagraphs"][0]},
            {"unit_id": "u1", "unit_index": 1, "current_text": fixture["candidateParagraphs"][1]},
        ],
    }
    _write_json(fixture["bodyMap"], body_payload)
    matching = app_service.read_round_artifact_snapshot(fixture["output"], include_internal=True)
    _assert(matching["bodyMapMatchesEffective"] is True, "matching body-map cache was marked stale")
    _assert_hex_digest(matching["bodyMapSha256"], "body-map SHA is missing")
    _assert(matching["_internal"]["bodyMapPayload"] == _read_json(fixture["bodyMap"]), "body-map payload was not captured")

    stale_payload = _read_json(fixture["bodyMap"])
    stale_payload["units"][0]["current_text"] = fixture["sourceParagraphs"][0]
    _write_json(fixture["bodyMap"], stale_payload)
    stale = app_service.read_round_artifact_snapshot(fixture["output"])
    _assert(stale["bodyMapMatchesEffective"] is False, "stale body-map cache was not exposed")
    _assert(stale["contentRevision"] == matching["contentRevision"], "cache-only drift changed canonical content revision")
    _assert(stale["artifactSnapshotDigest"] != matching["artifactSnapshotDigest"], "cache-only drift did not change artifact digest")

    fixture["bodyMap"].write_bytes(b"[]")
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_body_map_corrupt",
    )
    fixture["bodyMap"].unlink()

    manifest_bytes = fixture["manifest"].read_bytes()
    fixture["manifest"].write_bytes(b"{bad")
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_manifest_corrupt",
    )
    fixture["manifest"].write_bytes(manifest_bytes)
    fixture["manifest"].unlink()
    _expect_snapshot_error(
        lambda: app_service.read_round_artifact_snapshot(fixture["output"]),
        "round_snapshot_manifest_missing",
    )
    checks.append("body-map/manifest exact evidence distinguishes legal cache staleness from corrupt artifacts")


def _test_review_commit_barrier(root: Path, checks: list[str]) -> None:
    fixture = _build_fixture(root, "review-barrier")
    before = app_service.read_round_artifact_snapshot(fixture["output"])
    original_replace = app_service._replace_file_bytes_atomically
    sidecar_published = threading.Event()
    release_writer = threading.Event()
    writer_errors: list[BaseException] = []

    def blocked_replace(path: Path, payload: bytes) -> None:
        original_replace(path, payload)
        if path.resolve() == fixture["review"].resolve() and not sidecar_published.is_set():
            sidecar_published.set()
            release_writer.wait(timeout=5)

    def save_worker() -> None:
        try:
            app_service.save_review_decisions(
                str(fixture["output"]),
                {"p0_c0": "source_confirmed"},
                expected_compare_revision=before["compareRevision"],
                require_compare_revision=True,
            )
        except BaseException as exc:  # pragma: no cover - asserted below
            writer_errors.append(exc)

    app_service._replace_file_bytes_atomically = blocked_replace
    worker = threading.Thread(target=save_worker, daemon=True)
    try:
        worker.start()
        _assert(sidecar_published.wait(timeout=3), "review writer did not reach sidecar/compare barrier")
        busy = _expect_snapshot_error(
            lambda: app_service.read_round_artifact_snapshot(
                fixture["output"],
                lock_timeout_seconds=0.03,
            ),
            "round_snapshot_busy",
        )
        _assert(busy.retryable is True, "busy snapshot is not marked retryable")
    finally:
        release_writer.set()
        worker.join(timeout=5)
        app_service._replace_file_bytes_atomically = original_replace
    _assert(not worker.is_alive(), "review writer remained blocked")
    _assert(not writer_errors, f"review writer failed: {writer_errors}")
    after = app_service.read_round_artifact_snapshot(fixture["output"], include_internal=True)
    _assert(after["review"]["reviewLinkStatus"] == "linked", "post-barrier review state is unlinked")
    _assert(after["_internal"]["effectiveParagraphs"][0] == fixture["sourceParagraphs"][0], "post-barrier decision was lost")
    _assert(after["contentRevision"] != before["contentRevision"], "post-barrier snapshot did not advance")
    checks.append("review sidecar/compare publication barrier yields busy or one complete generation, never a mixed snapshot")


def _test_legacy_commit_barriers(root: Path, checks: list[str]) -> None:
    for barrier_name in ("output", "review", "compare"):
        fixture = _build_fixture(root, f"legacy-barrier-{barrier_name}")
        before = app_service.read_round_artifact_snapshot(fixture["output"])
        staged_compare = _read_json(fixture["compare"])
        staged_text = f"第一段冻结原文保留研究背景与实验边界（{barrier_name}）。"
        staged_chunk = staged_compare["chunks"][0]
        staged_chunk["outputText"] = staged_text
        staged_chunk["outputCharCount"] = len(staged_text)
        staged_chunk["candidateSelection"] = _published_selection(
            str(staged_chunk["inputText"]),
            staged_text,
            str(staged_chunk["chunkId"]),
            global_style_profile=app_service.build_global_style_profile_from_texts(
                fixture["sourceParagraphs"]
            ),
        )
        staged_compare["sourceRelativeDocumentDelta"] = app_service.assess_source_relative_document_delta(
            [str(chunk["inputText"]) for chunk in staged_compare["chunks"]],
            [str(chunk["outputText"]) for chunk in staged_compare["chunks"]],
        )
        updated_at = f"2026-07-18T00:00:1{len(barrier_name)}.000000Z"
        barrier_path = fixture[barrier_name]
        original_replace = app_service._replace_file_bytes_atomically
        published = threading.Event()
        release_writer = threading.Event()
        writer_errors: list[BaseException] = []

        def blocked_replace(path: Path, payload: bytes) -> None:
            original_replace(path, payload)
            if path.resolve() == barrier_path.resolve() and not published.is_set():
                published.set()
                release_writer.wait(timeout=5)

        def commit_worker() -> None:
            try:
                with app_service.get_output_rerun_lock(fixture["output"]):
                    app_service._commit_legacy_rerun_stage(
                        output_path=fixture["output"],
                        staged_compare=copy.deepcopy(staged_compare),
                        review_decisions={},
                        updated_at=updated_at,
                        expected_docx_contract=None,
                    )
            except BaseException as exc:  # pragma: no cover - asserted below
                writer_errors.append(exc)

        app_service._replace_file_bytes_atomically = blocked_replace
        worker = threading.Thread(target=commit_worker, daemon=True)
        try:
            worker.start()
            _assert(published.wait(timeout=3), f"legacy writer did not reach {barrier_name} barrier")
            _expect_snapshot_error(
                lambda: app_service.read_round_artifact_snapshot(
                    fixture["output"],
                    lock_timeout_seconds=0.03,
                ),
                "round_snapshot_busy",
            )
        finally:
            release_writer.set()
            worker.join(timeout=5)
            app_service._replace_file_bytes_atomically = original_replace
        _assert(not worker.is_alive(), f"legacy {barrier_name} writer remained blocked")
        _assert(not writer_errors, f"legacy {barrier_name} writer failed: {writer_errors}")
        after = app_service.read_round_artifact_snapshot(fixture["output"], include_internal=True)
        _assert(after["compareRevision"] == updated_at, f"legacy {barrier_name} revision was not committed")
        _assert(after["review"]["reviewLinkStatus"] == "linked", f"legacy {barrier_name} review is unlinked")
        _assert(after["rawOutputMatchesEffective"] is True, f"legacy {barrier_name} raw output is mixed")
        _assert(after["contentRevision"] != before["contentRevision"], f"legacy {barrier_name} content did not advance")
    checks.append("legacy output/review/compare barriers cannot expose an intermediate generation")


def run_regression() -> dict[str, Any]:
    checks: list[str] = []
    regression_root = ROOT_DIR / "finish" / "regression"
    regression_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="round-artifact-snapshot-", dir=regression_root) as temporary_dir:
        root = Path(temporary_dir)
        _test_base_snapshot_and_api(root, checks)
        _test_review_materialization_and_base_lag(root, checks)
        _test_strict_review_fail_closed(root, checks)
        _test_body_map_and_manifest_evidence(root, checks)
        _test_review_commit_barrier(root, checks)
        _test_legacy_commit_barriers(root, checks)

    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checkCount": len(checks),
        "checks": checks,
        "contract": {
            "version": app_service.ROUND_ARTIFACT_SNAPSHOT_VERSION,
            "noReviewRevision": hashlib.sha256(
                app_service.ROUND_ARTIFACT_SNAPSHOT_NO_REVIEW_SENTINEL
            ).hexdigest(),
        },
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
