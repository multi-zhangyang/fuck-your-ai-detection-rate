#!/usr/bin/env python3
"""Regression for fail-closed FYADR provenance and plain export disclosure.

This script deliberately uses temporary files and a monkeypatched in-memory
history registry.  It must never inspect the real history/config store.
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
import web_app  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "plain_export_provenance_regression_report.json"
PLAIN_CERTIFICATION = "plain_uncertified"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _empty_records() -> dict[str, Any]:
    return {}


def _registered_records(output_path: Path) -> dict[str, Any]:
    return {
        "plain-export-provenance/source.txt": {
            "origin_path": "plain-export-provenance/source.txt",
            "rounds": [
                {
                    "round": 1,
                    "input_path": "plain-export-provenance/source.txt",
                    "output_path": str(output_path.resolve()),
                }
            ],
        }
    }


def _expect_snapshot_blocked(
    call: Callable[[], Any],
    target_path: Path,
    *,
    expected_code: str | None = "round_snapshot_compare_missing",
) -> str:
    target_path.unlink(missing_ok=True)
    try:
        call()
    except app_service.RoundArtifactSnapshotError as exc:
        if expected_code is not None:
            _assert(
                exc.code == expected_code,
                f"provenance block returned the wrong code: {exc.code}",
            )
        _assert(not target_path.exists(), "blocked export still created an artifact")
        return exc.code
    raise AssertionError("FYADR provenance was downgraded to an uncertified plain export")


def _test_true_plain_exports(work_dir: Path, checks: list[str]) -> Path:
    app_service.list_records = _empty_records
    source_path = work_dir / "user_created_plain.txt"
    source_path.write_text(
        "本段是用户自行创建的普通文本。\n\n它不属于任何已登记的 FYADR 模型轮次。",
        encoding="utf-8",
    )

    txt_path = work_dir / "user_created_plain_export.txt"
    txt_result = app_service.export_round_output(
        str(source_path),
        str(txt_path),
        "txt",
    )
    _assert(txt_path.read_bytes() == source_path.read_bytes(), "plain TXT export changed source bytes")
    _assert(
        txt_result.get("certification") == PLAIN_CERTIFICATION,
        "plain TXT result omitted its uncertified provenance status",
    )
    _assert(txt_result.get("overallStatus") == "passed", "plain TXT generation did not succeed")

    docx_alias = work_dir / "user_created_plain_export.docx"
    docx_result = app_service.export_round_output(
        str(source_path),
        str(docx_alias),
        "docx",
    )
    published_docx = Path(str(docx_result.get("path", "")))
    evidence_path = Path(str(docx_result.get("evidenceManifestPath", "")))
    _assert(published_docx.exists(), "plain Word export did not publish an artifact")
    _assert(evidence_path.exists(), "plain Word export omitted its evidence manifest")
    _assert(
        docx_result.get("certification") == PLAIN_CERTIFICATION,
        "plain Word result omitted its uncertified provenance status",
    )
    evidence = json.loads(evidence_path.read_text(encoding="utf-8"))
    _assert(isinstance(evidence, dict), "plain Word evidence manifest is not an object")
    _assert(
        evidence.get("certification") == PLAIN_CERTIFICATION,
        "plain Word evidence manifest omitted its uncertified provenance status",
    )
    checks.append("truly unregistered text exports as TXT/Word with explicit plain_uncertified disclosure")
    return source_path


def _test_registered_round_cannot_downgrade(work_dir: Path, checks: list[str]) -> Path:
    output_path = work_dir / "registered_round1.txt"
    output_path.write_text("这是一个已登记模型轮次的结果。", encoding="utf-8")
    app_service.list_records = lambda: _registered_records(output_path)
    blocked_path = work_dir / "registered_round1_export.txt"
    _expect_snapshot_blocked(
        lambda: app_service.export_round_output(
            str(output_path),
            str(blocked_path),
            "txt",
        ),
        blocked_path,
    )
    checks.append("an exact history rounds[].output_path declaration blocks compare-less TXT downgrade")
    return output_path


def _test_canonical_sidecars_cannot_downgrade(work_dir: Path, checks: list[str]) -> None:
    app_service.list_records = _empty_records
    canonical_suffixes = (
        "_compare.json",
        "_manifest.json",
        "_quality.json",
        "_checkpoint.json",
        "_body_map.json",
        "_bodymap.json",
        "_validation.json",
        "_compare_review_decisions.json",
    )
    for case_index, suffix in enumerate(canonical_suffixes):
        output_path = work_dir / f"orphan_{case_index}.txt"
        output_path.write_text("这是一个残留 FYADR 旁证的结果。", encoding="utf-8")
        sidecar_path = output_path.with_name(f"{output_path.stem}{suffix}")
        sidecar_path.write_text("{}", encoding="utf-8")
        blocked_path = output_path.with_name(f"{output_path.stem}_export.txt")
        _expect_snapshot_blocked(
            lambda output_path=output_path, blocked_path=blocked_path: app_service.export_round_output(
                str(output_path),
                str(blocked_path),
                "txt",
            ),
            blocked_path,
            expected_code=None,
        )
    checks.append("every canonical orphan round sidecar blocks compare-less plain downgrade")


def _test_web_protocol(
    work_dir: Path,
    plain_source_path: Path,
    registered_output_path: Path,
    checks: list[str],
) -> None:
    original_export_dir = web_app.EXPORT_DIR
    web_app.EXPORT_DIR = work_dir / "web_exports"
    try:
        app_service.list_records = _empty_records
        with web_app.app.test_client() as client:
            plain_response = client.post(
                "/api/export-round",
                json={
                    "outputPath": str(plain_source_path),
                    "targetFormat": "txt",
                },
            )
            _assert(plain_response.status_code == 200, "Web plain export failed")
            _assert(
                plain_response.headers.get("X-Export-Certification") == PLAIN_CERTIFICATION,
                "Web plain export omitted the certification response header",
            )

            app_service.list_records = lambda: _registered_records(registered_output_path)
            blocked_response = client.post(
                "/api/export-round",
                json={
                    "outputPath": str(registered_output_path),
                    "targetFormat": "txt",
                },
            )
            blocked_payload = blocked_response.get_json(silent=True)
            _assert(blocked_response.status_code == 409, "Web registered-round downgrade was not blocked")
            _assert(
                isinstance(blocked_payload, dict)
                and blocked_payload.get("code") == "round_snapshot_compare_missing",
                "Web provenance block lost its stable snapshot error code",
            )
    finally:
        web_app.EXPORT_DIR = original_export_dir
    checks.append("Web API exposes plain certification and returns 409 for registered compare-less rounds")


def main() -> int:
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    checks: list[str] = []
    original_list_records = app_service.list_records
    try:
        with tempfile.TemporaryDirectory(
            prefix="plain-export-provenance-",
            dir=REPORT_PATH.parent,
        ) as temp_dir:
            work_dir = Path(temp_dir)
            plain_source_path = _test_true_plain_exports(work_dir, checks)
            registered_output_path = _test_registered_round_cannot_downgrade(work_dir, checks)
            _test_canonical_sidecars_cannot_downgrade(work_dir, checks)
            _test_web_protocol(
                work_dir,
                plain_source_path,
                registered_output_path,
                checks,
            )
    finally:
        app_service.list_records = original_list_records

    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }
    REPORT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
