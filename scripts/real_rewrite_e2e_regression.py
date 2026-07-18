#!/usr/bin/env python3
"""Optional real-provider, two-pass conservative rewrite smoke.

Only the synthetic paragraph below is sent to the configured provider.  A
normal run performs two completions (round 2 then round 3); FYADR's bounded
validation repair can raise the maximum to four.  Transport retries are off.
No detector score or detector-pass claim is made.
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


SYNTHETIC_INPUT = (
    "ResNet-50在验证集上的准确率为91.2%，召回率为88.7%，平均延迟为128 ms[3]。"
    "首先，该系统使用Qwen2.5-1.5B-Instruct完成候选生成；其次，规则模块进行结果校验。"
    "该系统不支持离线写入，因此缓存模块不得绕过一致性检查。"
    "该方案可以完成当前任务，该方案也可以维持接口兼容，该方案还可以减少重复配置。"
)
REQUIRED_LITERALS = (
    "ResNet-50",
    "91.2%",
    "88.7%",
    "128 ms",
    "[3]",
    "Qwen2.5-1.5B-Instruct",
)


def run_regression() -> dict[str, object]:
    if not real_calls_enabled():
        return {"ok": True, "skipped": True, "reason": "set FYADR_RUN_REAL_LLM=1 to allow synthetic provider calls"}
    provider = resolve_provider()
    if provider is None:
        return {"ok": True, "skipped": True, "reason": "no real provider configured"}

    tmpdir = Path(tempfile.mkdtemp(prefix="fyadr_real_quality_e2e_"))
    try:
        try:
            first = run_real_round(
                tmpdir,
                case_id="conservative-chain-first",
                round_number=2,
                input_text=SYNTHETIC_INPUT,
                provider=provider,
            )
            first_assessment = assess_conservative_edit(
                SYNTHETIC_INPUT,
                str(first["output"]),
                required_literals=REQUIRED_LITERALS,
            )
            if not first_assessment["ok"]:
                return {
                    "ok": False,
                    "skipped": False,
                    "failures": [f"round 2: {item}" for item in first_assessment["failures"]],
                    "round2": first_assessment,
                }

            second = run_real_round(
                tmpdir,
                case_id="conservative-chain-second",
                round_number=3,
                input_text=str(first["output"]),
                provider=provider,
            )
            second_assessment = assess_conservative_edit(
                str(first["output"]),
                str(second["output"]),
                required_literals=REQUIRED_LITERALS,
                require_change=False,
            )
        except Exception as error:
            if is_external_unavailability(error):
                return {"ok": True, "skipped": True, "reason": f"provider temporarily unavailable: {describe_external_unavailability(error)}"}
            return {"ok": False, "skipped": False, "failures": [f"real pipeline failed: {error}"]}

        failures = [f"round 3: {item}" for item in second_assessment["failures"]]
        final_assessment = assess_conservative_edit(
            SYNTHETIC_INPUT,
            str(second["output"]),
            required_literals=REQUIRED_LITERALS,
        )
        failures.extend(f"final chain: {item}" for item in final_assessment["failures"])
        for label, payload in (("round 2", first), ("round 3", second)):
            chunks = payload.get("compare", {}).get("chunks", []) if isinstance(payload.get("compare"), dict) else []
            if not chunks:
                failures.append(f"{label}: compare payload has no chunks")
            elif any(isinstance(chunk, dict) and chunk.get("fallbackMode") for chunk in chunks):
                failures.append(f"{label}: output used a source fallback instead of a validated edit")

        return {
            "ok": not failures,
            "skipped": False,
            "failures": failures,
            "completionBudget": {"normal": 2, "maximumWithValidationRepair": 4, "transportRetries": 0},
            "round2": first_assessment,
            "round3": second_assessment,
            "final": final_assessment,
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
