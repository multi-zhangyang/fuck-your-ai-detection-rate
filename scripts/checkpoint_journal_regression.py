from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as service  # noqa: E402


REPORT_PATH = ROOT_DIR / "finish" / "regression" / "checkpoint_journal_regression_report.json"
SOURCE_PARAGRAPHS = (
    "Firstly, Alpha records the calibration boundary before the first controlled trial begins.",
    "Firstly, Bravo compares two sampling schedules while preserving every declared constraint.",
    "Firstly, Charlie traces the observed variance to a documented change in the input distribution.",
    "Firstly, Delta reports memory pressure separately from request latency and model throughput.",
    "Firstly, Echo checks each label against the frozen annotation guide used by the reviewers.",
    "Firstly, Foxtrot evaluates the fallback path under a deliberately interrupted worker process.",
    "Firstly, Golf keeps the citation identifiers stable while revising the surrounding explanation.",
    "Firstly, Hotel measures the deployment result on hardware that matches the stated baseline.",
    "Firstly, India distinguishes a provider timeout from a local structural validation failure.",
    "Firstly, Juliet closes the experiment by listing the unresolved limitations and follow-up work.",
)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _rewrite(text: str, chunk_id: str) -> str:
    return f"[{chunk_id}] {text.removeprefix('Firstly, ')}"


def run_regression() -> dict[str, object]:
    checks: list[str] = []
    original_write_json = service._write_json_atomically
    checkpoint_snapshot_writes = 0

    with tempfile.TemporaryDirectory(prefix="fyadr-checkpoint-journal-") as temporary_directory:
        work_root = Path(temporary_directory)
        input_path = work_root / "input.txt"
        output_path = work_root / "output.txt"
        manifest_path = work_root / "manifest.json"
        input_path.write_text("\n\n".join(SOURCE_PARAGRAPHS), encoding="utf-8")
        checkpoint_path = service.get_round_checkpoint_path(output_path)
        journal_path = service.get_round_checkpoint_journal_path(checkpoint_path)

        def counted_write(path: Path, payload: dict[str, object]) -> None:
            nonlocal checkpoint_snapshot_writes
            if path == checkpoint_path:
                checkpoint_snapshot_writes += 1
            original_write_json(path, payload)

        service._write_json_atomically = counted_write
        first_calls: list[str] = []

        def interrupted_transform(text: str, _prompt: str, _round: int, chunk_id: str) -> str:
            first_calls.append(chunk_id)
            if chunk_id == "p8_c0":
                raise KeyboardInterrupt("synthetic abrupt stop")
            return _rewrite(text, chunk_id)

        try:
            service.run_round(
                "checkpoint-journal",
                1,
                input_path,
                output_path,
                manifest_path,
                interrupted_transform,
                chunk_limit=1800,
                max_concurrency=1,
            )
        except KeyboardInterrupt:
            pass
        else:
            raise AssertionError("abrupt-stop fixture unexpectedly completed")
        finally:
            service._write_json_atomically = original_write_json

        _assert(checkpoint_snapshot_writes == 1, "completed chunks rewrote the compact checkpoint snapshot")
        _assert(checkpoint_path.exists() and journal_path.exists(), "abrupt stop did not leave both checkpoint layers")
        base_payload = json.loads(checkpoint_path.read_text(encoding="utf-8"))
        _assert(base_payload.get("chunk_outputs") == {}, "base snapshot grew with every completed chunk")
        journal_lines = [line for line in journal_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        _assert(len(journal_lines) == 8, f"expected eight linear journal records, got {len(journal_lines)}")
        _assert(journal_path.stat().st_size < 2 * sum(len(item.encode("utf-8")) for item in journal_lines), "journal storage expanded beyond a linear representation")
        checks.append("eight completed chunks required one compact snapshot plus eight append records")

        resume_calls: list[str] = []
        progress_events: list[dict[str, object]] = []

        def resume_transform(text: str, _prompt: str, _round: int, chunk_id: str) -> str:
            resume_calls.append(chunk_id)
            return _rewrite(text, chunk_id)

        result = service.run_round(
            "checkpoint-journal",
            1,
            input_path,
            output_path,
            manifest_path,
            resume_transform,
            chunk_limit=1800,
            max_concurrency=1,
            progress_callback=progress_events.append,
        )
        _assert(all(f"p{index}_c0" not in resume_calls for index in range(8)), "resume repeated a journaled provider chunk")
        _assert(set(resume_calls) == {"p8_c0", "p9_c0"}, f"resume called unexpected chunks: {resume_calls}")
        _assert(any(event.get("phase") == "resuming-from-checkpoint" for event in progress_events), "resume did not expose checkpoint recovery")
        _assert(result.get("output_segment_count") == len(SOURCE_PARAGRAPHS), "resumed round did not restore every manifest chunk")
        _assert(not checkpoint_path.exists() and not journal_path.exists(), "successful finalization left stale checkpoint layers")
        checks.append("journal-only chunks survive abrupt interruption and are not sent to the model again")

    return {"ok": True, "checks": checks}


def main() -> int:
    report = run_regression()
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
