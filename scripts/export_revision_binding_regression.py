#!/usr/bin/env python3
"""Regression for revision-bound Web/TXT/DOCX export preconditions."""

from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import unquote


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
import web_app  # noqa: E402
from rate_audit_strategy_execution_regression import _docx_fixture  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "export_revision_binding_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _binding(snapshot: dict[str, object]) -> dict[str, object]:
    return {
        "expected_doc_id": snapshot["docId"],
        "expected_round": snapshot["round"],
        "expected_compare_revision": snapshot["compareRevision"],
        "expected_content_revision": snapshot["contentRevision"],
        "expected_artifact_snapshot_digest": snapshot["artifactSnapshotDigest"],
    }


def _web_binding(snapshot: dict[str, object]) -> dict[str, object]:
    return {
        "expectedDocId": snapshot["docId"],
        "expectedRound": snapshot["round"],
        "expectedCompareRevision": snapshot["compareRevision"],
        "expectedContentRevision": snapshot["contentRevision"],
        "expectedArtifactSnapshotDigest": snapshot["artifactSnapshotDigest"],
    }


def main() -> int:
    checks: list[str] = []
    with _docx_fixture() as fixture:
        snapshot = app_service.read_round_artifact_snapshot(fixture.output_path, include_internal=True)
        direct_export = fixture.output_path.with_name("revision_bound_direct.txt")
        direct_result = app_service.export_round_output(
            str(fixture.output_path),
            str(direct_export),
            "txt",
            **_binding(snapshot),
        )
        for key in (
            "outputPath",
            "docId",
            "round",
            "compareRevision",
            "contentRevision",
            "artifactSnapshotDigest",
        ):
            _assert(direct_result.get(key) == snapshot.get(key), f"direct export lost bound identity: {key}")
        _assert(direct_export.exists(), "matching preconditions did not create the TXT export")
        checks.append("matching revision preconditions export exactly the captured round generation")

        stale_export = fixture.output_path.with_name("revision_bound_stale.txt")
        stale_export.unlink(missing_ok=True)
        stale_binding = _binding(snapshot)
        stale_binding["expected_artifact_snapshot_digest"] = "0" * 64
        try:
            app_service.export_round_output(
                str(fixture.output_path),
                str(stale_export),
                "txt",
                **stale_binding,
            )
        except app_service.RoundArtifactSnapshotError as exc:
            _assert(exc.code == "round_snapshot_precondition_failed", "stale direct export returned the wrong code")
        else:
            raise AssertionError("stale direct export was not blocked")
        _assert(not stale_export.exists(), "stale preconditions created an export artifact")
        checks.append("stale generation preconditions fail before any export artifact is written")

        with web_app.app.test_client() as client:
            response = client.post(
                "/api/export-round",
                json={
                    "outputPath": str(fixture.output_path),
                    "targetFormat": "txt",
                    **_web_binding(snapshot),
                },
            )
            _assert(response.status_code == 200, f"revision-bound Web export failed: {response.status_code}")
            expected_headers = {
                "X-Export-Doc-Id": str(snapshot["docId"]),
                "X-Export-Round": str(snapshot["round"]),
                "X-Export-Content-Revision": str(snapshot["contentRevision"]),
                "X-Export-Artifact-Snapshot-Digest": str(snapshot["artifactSnapshotDigest"]),
            }
            for header, expected in expected_headers.items():
                actual = response.headers.get(header)
                if header == "X-Export-Doc-Id" and actual is not None:
                    actual = unquote(actual)
                _assert(actual == expected, f"Web export identity header drifted: {header}")
            _assert(response.headers.get("X-Export-Output-Path"), "Web export omitted output identity")
            _assert(response.headers.get("X-Export-Compare-Revision"), "Web export omitted compare revision")

            stale_web_binding = _web_binding(snapshot)
            stale_web_binding["expectedContentRevision"] = "f" * 64
            stale_response = client.post(
                "/api/export-round",
                json={
                    "outputPath": str(fixture.output_path),
                    "targetFormat": "txt",
                    **stale_web_binding,
                },
            )
            stale_payload = stale_response.get_json()
            _assert(stale_response.status_code == 409, "stale Web export must return HTTP 409")
            _assert(
                isinstance(stale_payload, dict)
                and stale_payload.get("code") == "round_snapshot_precondition_failed",
                "stale Web export lost its structured code",
            )
        checks.append("Web export returns and enforces output/document/round/revision identity")

    report = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
