from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path
from typing import Any


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import web_app  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "progress_transport_regression_report.json"


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _progress_frames(body: str) -> list[tuple[int, dict[str, Any]]]:
    frames: list[tuple[int, dict[str, Any]]] = []
    for raw_frame in body.split("\n\n"):
        lines = raw_frame.splitlines()
        if "event: progress" not in lines:
            continue
        event_id_line = next((line for line in lines if line.startswith("id: ")), "")
        data_line = next((line for line in lines if line.startswith("data: ")), "")
        _assert(bool(event_id_line and data_line), "progress frame lost its absolute id or JSON payload")
        frames.append((int(event_id_line[4:]), json.loads(data_line[6:])))
    return frames


def _cache_control_directives(value: str | None) -> set[str]:
    return {directive.strip().lower() for directive in (value or "").split(",") if directive.strip()}


def _register_state(run_id: str, source_path: str) -> web_app.ProgressState:
    state = web_app.ProgressState(source_path=source_path)
    web_app.RUN_STATES[run_id] = state
    web_app.ACTIVE_RUNS_BY_SOURCE[source_path] = run_id
    return state


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    original_task_state_dir = web_app.TASK_STATE_DIR
    original_max_events = web_app.MAX_RUN_PROGRESS_EVENTS
    original_write_json_atomic = web_app.write_json_atomic
    write_count = 0

    with tempfile.TemporaryDirectory(prefix="fyadr-progress-transport-") as temporary_directory:
        work_root = Path(temporary_directory)
        web_app.TASK_STATE_DIR = work_root / "task_states"
        web_app.MAX_RUN_PROGRESS_EVENTS = 4

        def counted_write(path: Path, payload: dict[str, Any]) -> None:
            nonlocal write_count
            write_count += 1
            original_write_json_atomic(path, payload)

        web_app.write_json_atomic = counted_write
        web_app.RUN_STATES.clear()
        web_app.ACTIVE_RUNS_BY_SOURCE.clear()
        try:
            empty_state = web_app.ProgressState(source_path=str(work_root / "empty.txt"))
            empty_events, empty_cursor, empty_truncated = web_app.collect_run_events_after_locked(empty_state, 999)
            _assert(not empty_events and empty_cursor == 0 and not empty_truncated, "future cursor was not clamped for an empty stream")
            with empty_state.condition:
                first_id = web_app._append_bounded_run_event_locked(empty_state, {"phase": "starting"})
                first_events, first_cursor, _ = web_app.collect_run_events_after_locked(empty_state, empty_cursor)
            _assert(
                first_id == 1 and first_cursor == 1 and [item[0] for item in first_events] == [1],
                "future empty-stream cursor caused the first real event to be skipped",
            )
            checks.append("future cursors on empty streams cannot suppress the first event")

            run_id = "progress-transport"
            state = _register_state(run_id, str(work_root / "source.txt"))
            _assert(web_app.persist_run_state(run_id, force=True), "initial recovery snapshot was not written")
            initial_write_count = write_count

            web_app.append_progress_event(
                run_id,
                {"phase": "provider-stream", "round": 1, "chunkId": "p1_c0", "streamEventCount": 1, "streamDone": False},
            )
            web_app.append_progress_event(
                run_id,
                {"phase": "provider-stream", "round": 1, "chunkId": "p1_c0", "streamEventCount": 8, "streamDone": False},
            )
            _assert(write_count == initial_write_count, "high-frequency stream metadata bypassed persistence throttling")
            _assert(len(state.events) == 1, "pending stream metadata was not coalesced per chunk")
            _assert(state.events[-1].get("streamEventCount") == 8, "coalescing did not retain the freshest stream snapshot")

            web_app.append_progress_event(run_id, {"phase": "chunk-complete", "round": 1, "chunkId": "p1_c0"})
            _assert(write_count == initial_write_count + 1, "chunk completion did not force a recovery snapshot")
            snapshot = json.loads(web_app.run_round_state_path(run_id).read_text(encoding="utf-8"))
            _assert(snapshot.get("version") == 2, "task-state snapshot schema version was not advanced")
            _assert(snapshot.get("state", {}).get("lastEvent", {}).get("phase") == "chunk-complete", "forced snapshot lost its milestone")
            checks.append("stream events coalesce while milestone persistence remains immediate")

            for index in range(12):
                web_app.append_progress_event(
                    run_id,
                    {"phase": "processing-chunk", "round": 1, "chunkId": f"p1_c{index + 1}"},
                )
            summary = web_app.serialize_run_state(run_id, state)
            _assert(len(state.events) == 4 and len(state.event_ids) == 4, "run progress buffer exceeded its configured bound")
            _assert(state.event_ids == sorted(state.event_ids), "retained absolute event ids are not ordered")
            _assert(summary.get("eventCount", 0) > summary.get("retainedEventCount", 0), "total event count collapsed to retained buffer size")
            _assert(summary.get("oldestEventId") == state.event_ids[0], "status lost the oldest resumable event id")
            _assert(summary.get("latestEventId") == state.event_ids[-1], "status lost the latest resumable event id")
            checks.append("progress history is bounded without losing absolute event accounting")

            with state.condition:
                state.completed = True
                state.status = "completed"
                state.result = {"round": 1, "outputPath": "offline.txt"}
                state.condition.notify_all()
            client = web_app.app.test_client()
            retained_ids = list(state.event_ids)
            full_body = client.get(f"/api/run-round-events/{run_id}", buffered=True).get_data(as_text=True)
            _assert([event_id for event_id, _ in _progress_frames(full_body)] == retained_ids, "fresh SSE connection did not replay the retained window")

            resume_from = retained_ids[-2]
            resumed_body = client.get(
                f"/api/run-round-events/{run_id}",
                headers={"Last-Event-ID": str(resume_from)},
                buffered=True,
            ).get_data(as_text=True)
            _assert(
                [event_id for event_id, _ in _progress_frames(resumed_body)] == [retained_ids[-1]],
                "SSE reconnect replayed events at or before Last-Event-ID",
            )

            truncated_response = client.get(
                f"/api/run-round-events/{run_id}",
                headers={"Last-Event-ID": str(retained_ids[0] - 2)},
                buffered=True,
            )
            truncated_body = truncated_response.get_data(as_text=True)
            truncated_frames = _progress_frames(truncated_body)
            _assert(len(truncated_frames) == 1 and truncated_frames[0][0] == retained_ids[-1], "expired SSE cursor did not receive only the latest snapshot")
            cache_directives = _cache_control_directives(truncated_response.headers.get("Cache-Control"))
            _assert(
                {"no-store", "no-cache", "no-transform"}.issubset(cache_directives),
                "SSE response allows storage, revalidation, or proxy transformation",
            )
            checks.append("SSE emits ids, resumes after Last-Event-ID, and snapshots expired cursors")
        finally:
            web_app.write_json_atomic = original_write_json_atomic
            web_app.TASK_STATE_DIR = original_task_state_dir
            web_app.MAX_RUN_PROGRESS_EVENTS = original_max_events
            web_app.RUN_STATES.clear()
            web_app.ACTIVE_RUNS_BY_SOURCE.clear()

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
