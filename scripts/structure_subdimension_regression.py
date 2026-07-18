#!/usr/bin/env python3
"""Regression for structureConcentration dual-check under sentence_structure.

Locks the detector-in-the-loop structure sub-signal:
1. Long samples (>=8 sentences) still concentrated in plain_active/enumerative
   (>=0.85) fail direction even when burstiness already looks fine.
2. Short samples (<8) and already-dispersed samples do not force structure
   failure.
3. Guidance never demands passive voice / long-的 / type quotas.
4. Connector dimension does NOT carry structureDirection (no cross-dimension
   bleed).
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from fyadr_round_service import _assess_dimension_direction, _style_risk_metrics  # noqa: E402

RHYTHM_DIM = {
    "id": "sentence_structure",
    "label": "句法与节奏",
    "primaryMetric": "burstinessRatio",
    "secondaryMetric": "structureConcentration",
}
CONNECTOR_DIM = {
    "id": "connector_detail",
    "label": "衔接与终稿",
    "primaryMetric": "connectorDensity",
}


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    # 1) Long, length-varied but plain_active-concentrated prose: rhythm may
    # already look "natural", but structure dual-check must still fail.
    concentrated_long = (
        "该方法在第一组实验中表现出较好的稳定性，误差控制在可接受范围内。"
        "跨域场景下误差略升。"
        "低照度样本的召回率有所下降，且该趋势在重复试验中仍然存在。"
        "高噪声样本精确率基本不变。"
        "小目标子集波动更明显，需要在后续工作中继续核对相关限制条件。"
        "公开基准上的总体指标保持平稳。"
        "另一组消融实验未改变核心结论。"
        "部署成本仍在可接受范围内。"
    )
    metrics_long = _style_risk_metrics(concentrated_long)
    if int(metrics_long.get("structureTypeTotal", 0) or 0) < 8:
        failures.append(f"fixture too short for structure dual-check: {metrics_long}")
    if float(metrics_long.get("structureConcentration", 0) or 0) < 0.85:
        failures.append(f"fixture not concentrated enough: {metrics_long}")
    if str(metrics_long.get("dominantStructureType", "")) not in ("plain_active", "enumerative"):
        failures.append(f"fixture dominant type unexpected: {metrics_long}")
    direction = _assess_dimension_direction(concentrated_long, concentrated_long, RHYTHM_DIM)
    if direction.get("ok") is not False:
        failures.append(
            f"length-varied but structure-concentrated long sample must fail dual-check: {direction}"
        )
    structure_direction = direction.get("structureDirection")
    if not isinstance(structure_direction, dict):
        failures.append(f"missing structureDirection on sentence_structure pass: {direction}")
    elif structure_direction.get("effective") is not False:
        failures.append(f"structureDirection.effective should be False: {structure_direction}")
    elif float(structure_direction.get("concentration", 0) or 0) < 0.85:
        failures.append(f"structureDirection concentration below threshold: {structure_direction}")
    note = str(direction.get("note", ""))
    if "被动" in note or "长“的”" in note or "长定语" in note:
        # notes may *forbid* passive/long-的; requiring them is the bug.
        if "不要" not in note and "禁止" not in note and "不得" not in note:
            failures.append(f"structure failure note appears to require passive/long-的: {note}")
    if "开句" not in note and "主语" not in note and "表层" not in note:
        failures.append(f"structure failure note not keyed to surface-frame diversify: {note}")

    # 2) Short concentrated sample (<8 sentences): dual-check must NOT force.
    # Keep char length above STYLE_VALIDATION_MIN_CHARS so the dual-check path
    # is exercised, while sentence count stays below the structure threshold.
    concentrated_but_short = (
        "主测试集上的预测结果在多次重复实验中保持稳定，未见明显漂移。"
        "跨域测试集的误差略有增加，但总体仍处于可接受区间。"
        "低照度样本的召回率有所下降，且该趋势在重复试验中仍然存在。"
        "高噪声样本的精确率基本不变，相关指标波动幅度较小。"
        "小目标子集上的波动相对明显，需要在后续工作中继续核对。"
    )
    short_dir = _assess_dimension_direction(
        concentrated_but_short, concentrated_but_short, RHYTHM_DIM
    )
    short_sd = short_dir.get("structureDirection")
    if not isinstance(short_sd, dict):
        failures.append(f"short sample missing structureDirection payload: {short_dir}")
    elif short_sd.get("applicable") is True:
        failures.append(f"short sample should not be structure-applicable: {short_sd}")
    elif short_sd.get("effective") is not True:
        failures.append(f"short sample structureDirection should stay effective: {short_sd}")

    # 3) Two artificial fragments must not turn an otherwise uniform paragraph
    # into an apparently successful rhythm rewrite.
    uniform = (
        "本研究提出一种新的分析方法用于识别关键影响因素。"
        "该方法结合公开数据开展模型参数估计与误差分析。"
        "实验结果验证该分析方法在测试任务中的有效性。"
        "模型在不同数据子集上保持相对稳定的预测表现。"
        "研究进一步讨论训练样本变化对最终结论的影响。"
    )
    gamed = "结论明确。结果清楚。" + uniform
    gamed_direction = _assess_dimension_direction(uniform, gamed, RHYTHM_DIM)
    if gamed_direction.get("ok") is not False:
        failures.append(f"short-fragment metric gaming was accepted: {gamed_direction}")
    if "过短" not in str(gamed_direction.get("note", "")):
        failures.append(
            f"fragment failure did not provide semantic repair guidance: {gamed_direction}"
        )

    # 4) Naturally varied rewrite with complete clauses and dispersed openings
    # should pass without any passive/subordinate/long-premodifier quota.
    natural = (
        "本研究提出一种新的分析方法，用于识别关键影响因素。"
        "参数估计和误差分析均使用公开数据；在不同数据子集上，模型的预测表现总体稳定，但小样本子集的波动更明显。"
        "实验结果支持该方法的有效性。"
        "训练样本变化对结论的影响另作讨论。"
        "相关限制仍需在后续实验中核对。"
    )
    natural_direction = _assess_dimension_direction(uniform, natural, RHYTHM_DIM)
    if natural_direction.get("ok") is not True:
        failures.append(f"complete-clause natural variation should pass: {natural_direction}")
    natural_sd = natural_direction.get("structureDirection")
    if not isinstance(natural_sd, dict):
        failures.append(f"natural rewrite missing structureDirection: {natural_direction}")
    elif natural_sd.get("effective") is not True:
        # natural fixture has <8 sentences so dual-check is not applicable.
        if natural_sd.get("applicable") is True:
            failures.append(f"natural rewrite failed structure dual-check unexpectedly: {natural_sd}")

    # 5) Connector dimension must not carry structureDirection.
    conn_dir = _assess_dimension_direction(concentrated_long, concentrated_long, CONNECTOR_DIM)
    if "structureDirection" in conn_dir:
        failures.append(f"connector dimension leaked structureDirection: {conn_dir}")

    # 6) Direct primaryMetric=structureConcentration binding also fails on long
    # concentrated samples (optional binding path).
    structure_bound = {
        "id": "sentence_structure",
        "primaryMetric": "structureConcentration",
    }
    bound_dir = _assess_dimension_direction(concentrated_long, concentrated_long, structure_bound)
    if bound_dir.get("ok") is not False:
        failures.append(f"direct structureConcentration binding should fail long concentrated: {bound_dir}")
    if bound_dir.get("primaryMetric") != "structureConcentration":
        failures.append(f"direct binding primaryMetric wrong: {bound_dir}")

    metrics = _style_risk_metrics(gamed)
    if int(metrics.get("shortSentenceCount", 0)) < 2:
        failures.append("short-sentence diagnostic did not count metric-gaming fragments")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print(
            "structure_subdimension_regression: PASS "
            "(structureConcentration dual-check under sentence_structure)"
        )
        return 0
    print("structure_subdimension_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
