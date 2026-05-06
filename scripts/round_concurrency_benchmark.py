from __future__ import annotations

import argparse
import json
import sys
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as service  # noqa: E402
from fyadr_history_db import DB_PATH  # noqa: E402
from fyadr_records import RECORDS_PATH  # noqa: E402


DEFAULT_REPORT_PATH = ROOT_DIR / "finish" / "regression" / "round_concurrency_benchmark_report.json"
DEFAULT_CONCURRENCY_LEVELS = [1, 2, 4, 8]


def _backup(path: Path) -> bytes | None:
    try:
        return path.read_bytes() if path.exists() else None
    except OSError:
        return None


def _restore(path: Path, payload: bytes | None) -> None:
    if payload is None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            pass
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def _build_source_text(chunk_count: int) -> tuple[str, list[str]]:
    paragraphs = [
        f"并发压测段落 {index + 1:02d}：用于模拟慢模型请求，并验证最终输出仍按原文顺序合并。"
        for index in range(chunk_count)
    ]
    return "\n\n".join(paragraphs), paragraphs


def _event_max(events: list[dict[str, Any]], key: str) -> int:
    values: list[int] = []
    for event in events:
        try:
            values.append(int(event.get(key, 0) or 0))
        except (TypeError, ValueError):
            continue
    return max(values) if values else 0


def _run_case(*, concurrency: int, chunk_count: int, delay_ms: int) -> dict[str, Any]:
    source_text, paragraphs = _build_source_text(chunk_count)
    lock = threading.Lock()
    active_count = 0
    max_active = 0
    completion_order: list[str] = []
    started_order: list[str] = []
    started_at: list[float] = []
    finished_at: list[float] = []
    events: list[dict[str, Any]] = []

    def transform(text: str, _prompt_input: str, _round: int, chunk_id: str) -> str:
        nonlocal active_count, max_active
        with lock:
            started_order.append(chunk_id)
            started_at.append(time.perf_counter())
            active_count += 1
            max_active = max(max_active, active_count)
        try:
            chunk_number = int(chunk_id.split("_", 1)[0].removeprefix("p")) if chunk_id.startswith("p") else 0
            jitter = (chunk_number % 4) * 0.012
            time.sleep(max(0.0, delay_ms / 1000.0 + jitter))
            with lock:
                completion_order.append(chunk_id)
                finished_at.append(time.perf_counter())
            return f"[{chunk_id}] {text}"
        finally:
            with lock:
                active_count -= 1

    with tempfile.TemporaryDirectory(prefix=f"fyadr_concurrency_{concurrency}_") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.txt"
        output_path = temp_path / "output.txt"
        manifest_path = temp_path / "manifest.json"
        input_path.write_text(source_text, encoding="utf-8")

        started = time.perf_counter()
        result = service.run_round(
            f"benchmark/concurrency-{concurrency}",
            1,
            input_path,
            output_path,
            manifest_path,
            transform,
            chunk_limit=1800,
            progress_callback=events.append,
            max_concurrency=concurrency,
        )
        duration_ms = round((time.perf_counter() - started) * 1000)

        expected_output = "\n\n".join(
            f"[p{index}_c0] {paragraph}"
            for index, paragraph in enumerate(paragraphs)
        )
        output_text = output_path.read_text(encoding="utf-8")
        run_audit = result.get("run_audit") if isinstance(result, dict) else {}

    api_window_ms = round((max(finished_at) - min(started_at)) * 1000) if started_at and finished_at else 0
    return {
        "concurrency": concurrency,
        "durationMs": duration_ms,
        "apiWindowMs": api_window_ms,
        "chunkCount": chunk_count,
        "delayMs": delay_ms,
        "startedOrder": started_order,
        "completionOrder": completion_order,
        "maxObservedActive": max_active,
        "maxProgressActive": _event_max(events, "activeChunks"),
        "completedProgressEvents": sum(1 for event in events if event.get("phase") == "chunk-complete"),
        "outputOrdered": output_text == expected_output,
        "auditConcurrency": run_audit.get("rewriteConcurrency") if isinstance(run_audit, dict) else None,
    }


def run_benchmark(*, chunk_count: int, delay_ms: int, concurrency_levels: list[int]) -> dict[str, Any]:
    normalized_levels = sorted({max(1, min(service.MAX_ROUND_CONCURRENCY, int(item))) for item in concurrency_levels})
    if 1 not in normalized_levels:
        normalized_levels.insert(0, 1)

    records_backup = _backup(RECORDS_PATH)
    db_backup = _backup(DB_PATH)
    original_validate = service.validate_chunk_output
    original_should_freeze = service.should_freeze_chunk
    original_update_round = service.update_round
    original_build_quality_summary = service._build_quality_summary
    service.validate_chunk_output = lambda *_args, **_kwargs: None
    service.should_freeze_chunk = lambda *_args, **_kwargs: False
    service.update_round = lambda **kwargs: {"doc_id": kwargs.get("doc_id"), "rounds": []}
    service._build_quality_summary = lambda manifest, *_args, **_kwargs: {
        "paragraphSplitSummary": {
            "paragraphCount": manifest.paragraph_count,
            "chunkCount": manifest.chunk_count,
            "splitParagraphCount": 0,
        },
        "validationEventCount": 0,
        "sourceFallbackCount": 0,
        "protectedTokenCount": 0,
    }
    try:
        cases = [
            _run_case(concurrency=concurrency, chunk_count=chunk_count, delay_ms=delay_ms)
            for concurrency in normalized_levels
        ]
    finally:
        service.validate_chunk_output = original_validate
        service.should_freeze_chunk = original_should_freeze
        service.update_round = original_update_round
        service._build_quality_summary = original_build_quality_summary
        _restore(RECORDS_PATH, records_backup)
        _restore(DB_PATH, db_backup)

    baseline = next((case for case in cases if case["concurrency"] == 1), cases[0])
    baseline_duration = max(1, int(baseline["durationMs"]))
    baseline_api_window = max(1, int(baseline["apiWindowMs"]))
    for case in cases:
        case["speedupVsSerial"] = round(baseline_duration / max(1, int(case["durationMs"])), 2)
        case["apiSpeedupVsSerial"] = round(baseline_api_window / max(1, int(case["apiWindowMs"])), 2)

    failures: list[str] = []
    for case in cases:
        concurrency = int(case["concurrency"])
        if not case["outputOrdered"]:
            failures.append(f"concurrency {concurrency} restored output out of order")
        if int(case.get("auditConcurrency") or 0) != concurrency:
            failures.append(f"concurrency {concurrency} was not recorded in run audit")
        if concurrency > 1 and int(case.get("maxObservedActive") or 0) < 2:
            failures.append(f"concurrency {concurrency} did not run more than one chunk at a time")

    by_concurrency = {int(case["concurrency"]): case for case in cases}
    if 2 in by_concurrency and int(by_concurrency[2]["apiWindowMs"]) >= baseline_api_window * 0.8:
        failures.append("concurrency 2 did not improve the mock API window enough over serial")
    if 4 in by_concurrency and int(by_concurrency[4]["apiWindowMs"]) >= baseline_api_window * 0.55:
        failures.append("concurrency 4 did not improve the mock API window enough over serial")

    fastest = min(cases, key=lambda item: int(item["apiWindowMs"]))
    fastest_end_to_end = min(cases, key=lambda item: int(item["durationMs"]))
    return {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "chunkCount": chunk_count,
        "delayMs": delay_ms,
        "maxSupportedConcurrency": 4,
        "recommendedDefaultConcurrency": 2,
        "fastestConcurrency": fastest["concurrency"],
        "fastestApiConcurrency": fastest["concurrency"],
        "fastestEndToEndConcurrency": fastest_end_to_end["concurrency"],
        "failures": failures,
        "cases": cases,
        "notes": [
            "本脚本使用本地 mock 慢请求，不消耗真实 API。",
            "真实服务商仍可能受并发限流、网关超时、模型排队影响。",
            "当前产品默认 2、最高 4，属于偏稳的本地工具策略。",
        ],
    }


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Benchmark FYADR round-level chunk concurrency with a local mock provider.")
    parser.add_argument("--chunk-count", type=int, default=12)
    parser.add_argument("--delay-ms", type=int, default=90)
    parser.add_argument("--concurrency", type=int, nargs="*", default=DEFAULT_CONCURRENCY_LEVELS)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT_PATH)
    args = parser.parse_args(argv)

    report = run_benchmark(
        chunk_count=max(4, min(64, args.chunk_count)),
        delay_ms=max(10, min(2000, args.delay_ms)),
        concurrency_levels=args.concurrency or DEFAULT_CONCURRENCY_LEVELS,
    )
    report_path = args.report.resolve()
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report["reportPath"] = str(report_path)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
