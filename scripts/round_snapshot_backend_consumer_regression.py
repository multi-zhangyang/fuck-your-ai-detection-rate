#!/usr/bin/env python3
"""Concurrency regression for RateAudit/export snapshot consumers."""

from __future__ import annotations

import copy
import json
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service  # noqa: E402
import web_app  # noqa: E402
from rate_audit_strategy_execution_regression import _docx_fixture  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "round_snapshot_backend_consumer_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _run_in_thread(call: Callable[[], Any]) -> tuple[threading.Thread, dict[str, Any]]:
    state: dict[str, Any] = {}

    def runner() -> None:
        try:
            state["result"] = call()
        except Exception as exc:  # regression captures the exact fail-closed type
            state["error"] = exc

    thread = threading.Thread(target=runner, daemon=True)
    thread.start()
    return thread, state


def _commit_generation_b(snapshot: dict[str, Any], *, output_path: Path) -> None:
    internal = snapshot.get("_internal")
    _assert(isinstance(internal, dict), "fixture snapshot lost internal payload")
    compare_payload = copy.deepcopy(internal.get("comparePayload"))
    body_map_payload = copy.deepcopy(internal.get("bodyMapPayload"))
    paragraphs = copy.deepcopy(internal.get("effectiveParagraphs"))
    _assert(isinstance(compare_payload, dict), "fixture compare capture is missing")
    _assert(isinstance(body_map_payload, dict), "fixture body-map capture is missing")
    _assert(isinstance(paragraphs, list) and paragraphs, "fixture effective paragraphs are missing")

    revision = "2026-07-18T07:30:00.000000Z"
    compare_payload["outputPath"] = str(output_path)
    compare_payload["updatedAt"] = revision
    compare_payload["reviewUpdatedAt"] = revision
    body_map_payload["updatedAt"] = revision
    units = body_map_payload.get("units")
    _assert(isinstance(units, list) and len(units) == len(paragraphs), "body-map generation size drifted")
    for unit, text in zip(units, paragraphs):
        _assert(isinstance(unit, dict), "body-map unit is invalid")
        unit["current_text"] = str(text)

    compare_path = Path(str(internal.get("comparePath", "")))
    review_path = Path(str(internal.get("reviewPath", "")))
    body_map_path = Path(str(internal.get("bodyMapPath", "")))
    review_payload = {
        "outputPath": str(output_path),
        "updatedAt": revision,
        "compareRevision": revision,
        "reviewBaseCompareRevision": revision,
        "decisions": {},
    }
    # Compare is the commit marker. All files are published under the output
    # mutation lock, with compare deliberately written last.
    app_service._replace_file_bytes_atomically(
        body_map_path,
        json.dumps(body_map_payload, ensure_ascii=False, indent=2).encode("utf-8"),
    )
    app_service._replace_file_bytes_atomically(
        output_path,
        "\n\n".join(str(item) for item in paragraphs).encode("utf-8"),
    )
    app_service._replace_file_bytes_atomically(
        review_path,
        json.dumps(review_payload, ensure_ascii=False, indent=2).encode("utf-8"),
    )
    app_service._replace_file_bytes_atomically(
        compare_path,
        json.dumps(compare_payload, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8"),
    )


def main() -> int:
    checks: list[str] = []
    with _docx_fixture() as fixture:
        output_path = fixture.output_path.resolve()
        snapshot_a = app_service.read_round_artifact_snapshot(output_path, include_internal=True)
        internal_a = snapshot_a["_internal"]
        body_map_path = Path(str(internal_a["bodyMapPath"]))
        export_path = output_path.with_name("consumer_barrier_export.docx")
        export_path.unlink(missing_ok=True)

        original_snapshot_reader = app_service.read_round_artifact_snapshot

        def short_snapshot_reader(path: str | Path, **kwargs: Any) -> dict[str, Any]:
            kwargs["lock_timeout_seconds"] = 0.05
            return original_snapshot_reader(path, **kwargs)

        lock = app_service.get_output_rerun_lock(output_path)
        app_service.read_round_artifact_snapshot = short_snapshot_reader
        try:
            with lock:
                # Expose an intentionally invalid intermediate artifact while
                # the writer owns the lock. Consumers must return busy without
                # reading or exporting this partial generation.
                app_service._replace_file_bytes_atomically(body_map_path, b"{partial-generation")
                audit_thread, audit_state = _run_in_thread(
                    lambda: app_service.get_document_rate_audit(
                        str(fixture.source_path),
                        str(output_path),
                    )
                )
                export_thread, export_state = _run_in_thread(
                    lambda: app_service.export_round_output(
                        str(output_path),
                        str(export_path),
                        "docx",
                    )
                )
                audit_thread.join(timeout=2.0)
                export_thread.join(timeout=2.0)
                _assert(not audit_thread.is_alive() and not export_thread.is_alive(), "busy consumers did not return promptly")
                for label, state in (("RateAudit", audit_state), ("export", export_state)):
                    error = state.get("error")
                    _assert(
                        isinstance(error, app_service.RoundArtifactSnapshotError)
                        and error.code == "round_snapshot_busy",
                        f"{label} observed a partial generation instead of round_snapshot_busy: {error}",
                    )
                _assert(not export_path.exists(), "busy export published a partial DOCX")
                _commit_generation_b(snapshot_a, output_path=output_path)
        finally:
            app_service.read_round_artifact_snapshot = original_snapshot_reader

        snapshot_b = app_service.read_round_artifact_snapshot(output_path, include_internal=True)
        _assert(
            snapshot_b["artifactSnapshotDigest"] != snapshot_a["artifactSnapshotDigest"],
            "complete generation B did not advance the artifact snapshot digest",
        )
        report = app_service.get_document_rate_audit(str(fixture.source_path), str(output_path))
        binding = report.get("strategyBinding")
        _assert(isinstance(binding, dict), "RateAudit omitted its strategy binding")
        for binding_key, snapshot_key in (
            ("compareRevision", "compareRevision"),
            ("reviewRevision", "reviewRevision"),
            ("contentRevision", "contentRevision"),
            ("artifactSnapshotDigest", "artifactSnapshotDigest"),
            ("effectiveTextSha256", "effectiveTextSha256"),
            ("outputSha256", "outputSha256"),
            ("bodyMapSha256", "bodyMapSha256"),
            ("manifestSha256", "manifestSha256"),
        ):
            _assert(
                str(binding.get(binding_key, "") or "") == str(snapshot_b.get(snapshot_key, "") or ""),
                f"RateAudit binding mixed generation at {binding_key}",
            )
        checks.append("RateAudit returns busy during publication and binds every plan hash to one captured generation")

        export = app_service.export_round_output(str(output_path), str(export_path), "docx")
        _assert(export.get("artifactSnapshotDigest") == snapshot_b["artifactSnapshotDigest"], "DOCX export evidence mixed artifact generations")
        _assert(export.get("contentRevision") == snapshot_b["contentRevision"], "DOCX export evidence mixed content generations")
        _assert(export.get("effectiveTextSha256") == snapshot_b["effectiveTextSha256"], "DOCX export used the wrong effective text")
        _assert(Path(str(export.get("path", ""))).exists(), "complete generation B did not export")
        checks.append("DOCX export releases the short lock and builds only from the captured in-memory generation")

        original_route_audit = web_app.get_document_rate_audit
        try:
            def busy_route(*_args: Any, **_kwargs: Any) -> dict[str, Any]:
                raise app_service.RoundArtifactSnapshotError(
                    "round_snapshot_busy",
                    "busy",
                    retryable=True,
                )

            web_app.get_document_rate_audit = busy_route
            with web_app.app.test_client() as client:
                response = client.get(
                    "/api/rate-audit",
                    query_string={"sourcePath": str(fixture.source_path), "outputPath": str(output_path)},
                )
            _assert(response.status_code == 423, "RateAudit busy snapshot was not mapped to HTTP 423")
            payload = response.get_json()
            _assert(isinstance(payload, dict) and payload.get("code") == "round_snapshot_busy", "HTTP 423 lost its structured code")
        finally:
            web_app.get_document_rate_audit = original_route_audit
        checks.append("RateAudit API exposes snapshot lock contention as structured HTTP 423")

    report_payload = {
        "ok": True,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "checks": checks,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report_payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
