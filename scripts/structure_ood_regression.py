#!/usr/bin/env python3
"""Regression for coarse structure diagnostics as advisory-only signals."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402


def _risk_codes(text: str) -> list[str]:
    return [str(item.get("code")) for item in f._assess_machine_like_risks(text)]


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    repeated = "".join(
        [
            "该方法在数据集一上保持稳定。",
            "该方法在数据集二上保持稳定。",
            "该方法在数据集三上保持稳定。",
            "该方法在数据集四上保持稳定。",
            "该方法在数据集五上保持稳定。",
            "该方法在数据集六上保持稳定。",
            "该方法在数据集七上保持稳定。",
            "该方法在数据集八上保持稳定。",
        ]
    )
    repeated_metrics = f._style_risk_metrics(repeated)
    if repeated_metrics.get("dominantStructureType") != "plain_active":
        failures.append(f"unexpected dominant structure: {repeated_metrics}")
    if float(repeated_metrics.get("structureConcentration", 0)) < 0.9:
        failures.append("repeated-frame fixture did not produce a concentrated diagnostic")
    if "structure_template_concentration" not in _risk_codes(repeated):
        failures.append("long repeated-frame passage did not surface an advisory")

    # Short or varied prose is too small/noisy for the coarse classifier to be
    # actionable and must not be treated as a defect.
    short = "该方法有效。该方法可行。"
    if float(f._style_risk_metrics(short).get("structureConcentration", -1)) != 0.0:
        failures.append("short text should have zero structure concentration")
    if "structure_template_concentration" in _risk_codes(short):
        failures.append("short text received a structure-concentration risk")

    varied = (
        "若输入缺失，服务返回校验错误。"
        "缓存只保存尚未提交的状态。"
        "事务提交后，中间记录随即清理。"
        "对长时间未完成的请求，调度器会主动取消。"
        "该策略不改变原始数据。"
        "异常原因写入日志，供后续核对。"
        "必要时可从检查点恢复任务。"
        "最终结果仍由原事务提交。"
    )
    if "structure_template_concentration" in _risk_codes(varied):
        failures.append(f"varied, complete prose was over-flagged: {_risk_codes(varied)}")

    # Dual-check under sentence_structure: long concentrated samples fail via
    # structureDirection, but guidance must still forbid passive / long-的 quotas.
    dimension = {"id": "sentence_structure", "primaryMetric": "burstinessRatio"}
    direction = f._assess_dimension_direction(repeated, repeated, dimension)
    structure_direction = direction.get("structureDirection")
    if not isinstance(structure_direction, dict):
        failures.append("sentence_structure pass missing structureDirection dual-check payload")
    elif structure_direction.get("effective") is not False:
        failures.append(
            f"long concentrated sample should fail structure dual-check: {structure_direction}"
        )
    if direction.get("ok") is not False:
        failures.append(f"long concentrated sample should fail dimension direction: {direction}")
    note = str(direction.get("note", ""))
    # Notes may *forbid* passive/long-的; requiring them is the bug.
    forbidden_require = ("改为被动", "使用被动", "长前置定语", "主导结构类型占比")
    if any(term in note for term in forbidden_require):
        failures.append(f"direction guidance encourages artificial syntax: {direction}")
    if "不要" not in note and "禁止" not in note and "不得" not in note:
        if "被动" in note or "长“的”" in note or "长定语" in note:
            failures.append(f"direction guidance encourages artificial syntax: {direction}")

    english = (
        "The method remains stable on the first dataset. "
        "The second dataset produces a slightly larger error. "
        "No Chinese structure classifier should run here."
    )
    if int(f._style_risk_metrics(english).get("structureTypeTotal", -1)) != 0:
        failures.append("Chinese-only structure classifier ran on English prose")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print(
            "structure_ood_regression: PASS "
            "(structure metric advisory + dual-check under sentence_structure)"
        )
        return 0
    print("structure_ood_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
