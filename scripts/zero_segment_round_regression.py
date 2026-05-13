from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from app_service import get_document_status, read_round_compare
from fyadr_records import ROOT_DIR, delete_document, update_round
from fyadr_round_service import relative_to_root, run_round
from round_helper import get_document_round_state


REGRESSION_DIR = ROOT_DIR / "finish" / "regression"
INTERMEDIATE_DIR = ROOT_DIR / "finish" / "intermediate"
REPORT_PATH = REGRESSION_DIR / "zero_segment_round_regression_report.json"
TEST_STEM = "__zero_segment_round_regression__"
TEST_DOC_ID = f"origin/{TEST_STEM}.txt"


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _cleanup() -> None:
    try:
        delete_document(TEST_DOC_ID, mode="records_artifacts_and_source")
    except Exception:
        pass
    for path in [
        REGRESSION_DIR / f"{TEST_STEM}_empty_input.txt",
        REGRESSION_DIR / f"{TEST_STEM}_empty_round1.txt",
        REGRESSION_DIR / f"{TEST_STEM}_empty_round1_manifest.json",
        ROOT_DIR / TEST_DOC_ID,
        INTERMEDIATE_DIR / f"{TEST_STEM}_round1_input.txt",
        INTERMEDIATE_DIR / f"{TEST_STEM}_round1.txt",
        INTERMEDIATE_DIR / f"{TEST_STEM}_round1_manifest.json",
        INTERMEDIATE_DIR / f"{TEST_STEM}_round1_compare.json",
        INTERMEDIATE_DIR / f"{TEST_STEM}_round1_quality.json",
    ]:
        try:
            if path.exists() and path.is_file():
                path.unlink()
        except OSError:
            pass


def _run_empty_input_guard(failures: list[str]) -> None:
    input_path = REGRESSION_DIR / f"{TEST_STEM}_empty_input.txt"
    output_path = REGRESSION_DIR / f"{TEST_STEM}_empty_round1.txt"
    manifest_path = REGRESSION_DIR / f"{TEST_STEM}_empty_round1_manifest.json"
    input_path.parent.mkdir(parents=True, exist_ok=True)
    input_path.write_text("", encoding="utf-8")
    calls: list[str] = []

    def transform(_: str, prompt_input: str, __: int, chunk_id: str) -> str:
        calls.append(chunk_id)
        return prompt_input

    try:
        run_round(
            doc_id=relative_to_root(input_path),
            round_number=1,
            input_path=input_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=transform,
        )
        failures.append("empty input round must fail before completion")
    except ValueError as exc:
        if "未提取到可改写正文内容" not in str(exc):
            failures.append(f"empty input error should explain zero segments: {exc}")

    if calls:
        failures.append("empty input round must not call transform/API")
    if output_path.exists():
        failures.append("empty input round must not write output")
    if manifest_path.exists():
        failures.append("empty input round must not write manifest")


def _run_stale_artifact_guard(failures: list[str]) -> None:
    source_path = ROOT_DIR / TEST_DOC_ID
    input_path = INTERMEDIATE_DIR / f"{TEST_STEM}_round1_input.txt"
    output_path = INTERMEDIATE_DIR / f"{TEST_STEM}_round1.txt"
    manifest_path = INTERMEDIATE_DIR / f"{TEST_STEM}_round1_manifest.json"
    compare_path = INTERMEDIATE_DIR / f"{TEST_STEM}_round1_compare.json"
    quality_path = INTERMEDIATE_DIR / f"{TEST_STEM}_round1_quality.json"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    input_path.parent.mkdir(parents=True, exist_ok=True)
    source_path.write_text("正文内容用于状态识别。", encoding="utf-8")
    input_path.write_text("", encoding="utf-8")
    output_path.write_text("", encoding="utf-8")
    _write_json(manifest_path, {"chunk_limit": 1800, "chunk_metric": "char", "paragraph_count": 0, "chunk_count": 0, "paragraphs": [], "chunks": []})
    _write_json(compare_path, {
        "version": 2,
        "docId": TEST_DOC_ID,
        "round": 1,
        "promptProfile": "cn_custom",
        "promptSequence": ["classical"],
        "inputPath": relative_to_root(input_path),
        "outputPath": relative_to_root(output_path),
        "manifestPath": relative_to_root(manifest_path),
        "paragraphCount": 0,
        "chunkCount": 0,
        "chunks": [],
    })
    _write_json(quality_path, {"estimatedApiCalls": 0})
    update_round(
        doc_id=TEST_DOC_ID,
        round_number=1,
        prompt="prompts/classical.txt",
        prompt_profile="cn_custom",
        prompt_sequence=["classical"],
        input_path=relative_to_root(input_path),
        output_path=relative_to_root(output_path),
        chunk_limit=1800,
        input_segment_count=0,
        output_segment_count=0,
        manifest_path=relative_to_root(manifest_path),
        compare_path=relative_to_root(compare_path),
        quality_path=relative_to_root(quality_path),
    )

    state = get_document_round_state(TEST_DOC_ID, prompt_profile="cn_custom", prompt_sequence=["classical"])
    if state.completed_rounds:
        failures.append(f"zero-segment stale record must not be completed: {state.completed_rounds}")
    if state.next_round != 1:
        failures.append(f"zero-segment stale record should leave next round at 1, got {state.next_round}")

    status = get_document_status(str(source_path), prompt_profile="cn_custom", prompt_sequence=["classical"])
    if status.get("completedRounds"):
        failures.append(f"document status must hide zero-segment stale rounds: {status.get('completedRounds')}")
    if status.get("latestOutputPath"):
        failures.append(f"document status must not expose zero-byte output: {status.get('latestOutputPath')}")

    try:
        read_round_compare(str(output_path))
        failures.append("read_round_compare must reject empty compare payloads")
    except ValueError as exc:
        if "结果不完整" not in str(exc):
            failures.append(f"empty compare error should explain incomplete result: {exc}")


def main() -> int:
    failures: list[str] = []
    _cleanup()
    try:
        _run_empty_input_guard(failures)
        _run_stale_artifact_guard(failures)
    finally:
        _cleanup()

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "failures": failures,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
