#!/usr/bin/env python3
"""Optional real-provider comparison of the two editing passes.

The historical filename is retained for release-runner compatibility.  The
test no longer demands a synthetic metric "gain".  It runs the same synthetic
paragraph independently through round 2 and round 3 and checks that both obey
the conservative factual contract.  Style metrics are reported diagnostically.
Normal budget: two completions; bounded maximum with validation repair: four.
"""

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

from real_quality_contract import (  # noqa: E402
    assess_conservative_edit,
    describe_external_unavailability,
    is_external_unavailability,
    real_calls_enabled,
    resolve_provider,
    run_real_round,
)


SHARED_SYNTHETIC_INPUT = (
    "模型A的精确率为93.4%，模型B的精确率为90.1%，二者参数量分别为24.6 M和18.2 M[5]。"
    "首先，系统会进行数据读取。其次，系统会进行特征计算。此外，系统会进行结果写入。"
    "但是，该结论并非说明模型A在所有数据集上都优于模型B。"
)
REQUIRED_LITERALS = ("模型A", "模型B", "93.4%", "90.1%", "24.6 M", "18.2 M", "[5]")


def run_regression() -> dict[str, object]:
    if not real_calls_enabled():
        return {"ok": True, "skipped": True, "reason": "set FYADR_RUN_REAL_LLM=1 to allow synthetic provider calls"}
    provider = resolve_provider()
    if provider is None:
        return {"ok": True, "skipped": True, "reason": "no real provider configured"}

    tmpdir = Path(tempfile.mkdtemp(prefix="fyadr_real_pass_compare_"))
    try:
        try:
            pass_one = run_real_round(
                tmpdir,
                case_id="independent-pass-one",
                round_number=2,
                input_text=SHARED_SYNTHETIC_INPUT,
                provider=provider,
            )
            pass_two = run_real_round(
                tmpdir,
                case_id="independent-pass-two",
                round_number=3,
                input_text=SHARED_SYNTHETIC_INPUT,
                provider=provider,
            )
        except Exception as error:
            if is_external_unavailability(error):
                return {"ok": True, "skipped": True, "reason": f"provider temporarily unavailable: {describe_external_unavailability(error)}"}
            return {"ok": False, "skipped": False, "failures": [f"real pipeline failed: {error}"]}

        assessment_one = assess_conservative_edit(
            SHARED_SYNTHETIC_INPUT,
            str(pass_one["output"]),
            required_literals=REQUIRED_LITERALS,
        )
        assessment_two = assess_conservative_edit(
            SHARED_SYNTHETIC_INPUT,
            str(pass_two["output"]),
            required_literals=REQUIRED_LITERALS,
        )
        failures = [f"round 2: {item}" for item in assessment_one["failures"]]
        failures.extend(f"round 3: {item}" for item in assessment_two["failures"])
        return {
            "ok": not failures,
            "skipped": False,
            "failures": failures,
            "completionBudget": {"normal": 2, "maximumWithValidationRepair": 4, "transportRetries": 0},
            "metricUse": "diagnostic-only; no authorship or detector threshold",
            "round2": assessment_one,
            "round3": assessment_two,
            "syntheticOutputOnFailure": {
                "round2": str(pass_one["output"]) if failures else "",
                "round3": str(pass_two["output"]) if failures else "",
            },
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
