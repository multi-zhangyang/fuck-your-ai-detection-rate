#!/usr/bin/env python3
"""Full-pipeline regression for non-mutating deterministic post-processing."""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402
import prompt_library as p  # noqa: E402


SOURCE = (
    "系统不仅减少了推理延迟，而且降低了显存占用。"
    "由于样本数量有限，模型在验证集上的准确率为91.2%，相关结论见[3]。"
    "流程包括采集、清洗和训练三个阶段。"
    "虽然设备算力受限，但是训练轮数仍保持为200轮。"
)


def _identity_transform(input_text: str, _prompt: str, _round: int, _chunk_id: str) -> str:
    return input_text


def run_regression() -> dict[str, object]:
    failures: list[str] = []
    tmpdir = Path(tempfile.mkdtemp(prefix="fyadr_detpp_safe_"))
    try:
        input_path = tmpdir / "input.txt"
        output_path = tmpdir / "output.txt"
        manifest_path = tmpdir / "manifest.json"
        input_path.write_text(SOURCE, encoding="utf-8")
        result = f.run_round(
            doc_id="deterministic-postprocess-safety",
            round_number=2,
            input_path=input_path,
            output_path=output_path,
            manifest_path=manifest_path,
            transform=_identity_transform,
            prompt_profile="cn_custom",
            prompt_sequence=p.DEFAULT_PROMPT_SEQUENCES["cn_custom"],
            chunk_limit=1000,
            max_concurrency=1,
        )
        output = output_path.read_text(encoding="utf-8")
        if output != SOURCE:
            failures.append("full pipeline changed punctuation/content after the model output passed validation")
        compare = json.loads(f.get_round_compare_path(output_path).read_text(encoding="utf-8"))
        events = [
            event for event in compare.get("validationEvents", [])
            if str(event.get("event", "")).startswith("deterministic-burstiness-postprocess")
        ]
        if events:
            failures.append(f"pipeline recorded a deterministic sentence split: {events}")
        quality = result.get("quality_summary") or {}
        if int(quality.get("deterministicPostprocessCount", -1)) != 0:
            failures.append("quality summary must report zero deterministic mutations")
        if int(quality.get("deterministicPostprocessSplitTotal", -1)) != 0:
            failures.append("quality summary must report zero deterministic splits")
        if output.count("[3]") != 1 or output.count("91.2%") != 1 or output.count("200") != 1:
            failures.append("citation/number counts changed across the pipeline")
        return {"ok": not failures, "failures": failures}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("deterministic_postprocess_integration_regression: PASS")
        return 0
    print("deterministic_postprocess_integration_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
