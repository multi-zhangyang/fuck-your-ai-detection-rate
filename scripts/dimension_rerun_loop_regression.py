#!/usr/bin/env python3
"""Dimension-targeted rerun loop regression (core-algorithm moat, real).

Closes the detector-in-the-loop: when a round's primary perturbation dimension
did NOT move toward lower-AI (dimension_direction_not_effective), the targeted
rerun path must generate a dimension-specific repair instruction keyed to the
round's primaryMetric (burstiness vs connectorDensity), NOT a generic
"reduce machine-like expression" note. This proves the diagnostic -> rerun loop
actually steers the rerun at the failing dimension.

Real, not ok=true: quality dicts are produced by the real _build_chunk_quality
(with round_dimension=...) so field names match production; direction failure is
a real computed direction (burstiness not raised / connectorDensity cranked up).
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import app_service as a  # noqa: E402
import fyadr_round_service as f  # noqa: E402
import prompt_library as p  # noqa: E402

PROFILE = "cn_custom"


def _chunk(input_text: str, output_text: str, round_number: int) -> dict:
    """Build a real production-shaped chunk dict via real quality pipeline."""
    round_dimension = f.resolve_round_dimension(PROFILE, round_number)
    quality = f._build_chunk_quality(input_text, output_text, round_dimension=round_dimension)
    return {"inputText": input_text, "outputText": output_text, "quality": quality}


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    # --- round2 in cn_custom -> round1 prompt -> sentence_structure / burstiness ---
    dim2 = p.get_round_dimension(PROFILE, 2)
    assert dim2["primaryMetric"] == "burstinessRatio", dim2
    # uniform input; ineffective rewrite stays in uniform region -> direction NOT effective.
    uniform_input = (
        "该方法用于解决复杂环境下的目标识别问题。该方法使用多个公开数据集完成验证。"
        "该方法在测试任务中取得稳定的预测结果。该方法在不同负载下保持正常响应。"
        "该方法的部署成本处于可接受范围之内。该方法仍需核对小样本条件下的误差。"
    )
    ineffective_structure = (
        "该方法用于处理复杂环境中的目标识别问题。该方法在多个公开数据集上进行验证。"
        "该方法在测试任务中获得稳定的预测结果。该方法在不同负载下维持正常响应。"
        "该方法的部署成本仍处于可接受范围。该方法还需核对小样本条件下的误差。"
    )
    chunk_b = _chunk(uniform_input, ineffective_structure, 2)
    # sanity: direction really flagged ineffective (real computed)
    if "dimension_direction_not_effective" not in (chunk_b["quality"].get("advisoryFlags") or []):
        failures.append(
            f"burstiness-ineffective chunk should raise dimension_direction_not_effective, "
            f"got advisoryFlags={chunk_b['quality'].get('advisoryFlags')}"
        )
    note_b, tags_b, advice_b = a._build_rerun_strategy_note(chunk_b)
    if "dimension-targeted-repair" not in tags_b:
        failures.append(f"burstiness rerun missing dimension-targeted-repair tag, tags={tags_b}")
    if "节奏" not in note_b or "Dimension-targeted" not in note_b:
        failures.append("rhythm rerun note missing dimension-targeted instruction")
    # The dimension-targeted line must repair repeated frames without quotas.
    dim_lines_b = [ln for ln in note_b.split("\n") if "Dimension-targeted" in ln or "dimension-targeted" in ln.lower()]
    if not any("节奏" in ln and "完整" in ln for ln in dim_lines_b):
        failures.append(f"rhythm rerun line is not keyed to complete semantic units: {dim_lines_b}")
    if any("至少" in ln or "最长句" in ln or "改为被动句" in ln for ln in dim_lines_b):
        failures.append(f"rhythm rerun line still contains metric/syntax quotas: {dim_lines_b}")
    if not any("节奏" in x for x in advice_b):
        failures.append(f"rhythm rerun advice not keyed to local rhythm repair, advice={advice_b}")

    # --- round3 in cn_custom -> round2 prompt -> connector_detail / connectorDensity ---
    dim3 = p.get_round_dimension(PROFILE, 3)
    assert dim3["primaryMetric"] == "connectorDensity", dim3
    dense_input = (
        "首先，该方法在工程上有效。其次，多个实验验证了核心结论。此外，整体性能提升明显。"
        "因此，该模型具备可行性。另外，部署成本较低。从而，具备一定的推广价值。"
        "同时，系统在长时间运行中保持稳定响应。"
    )
    # ineffective connector rewrite: crank connectors UP (each sentence two connectors).
    ineffective_connector = (
        "首先，该方法在工程上有效，其次，多个实验验证了核心结论。"
        "此外，整体性能提升明显，因此，该模型具备可行性。"
        "另外，部署成本较低，从而，具备一定的推广价值。"
        "同时，系统在长时间运行中保持稳定响应。"
    )
    chunk_c = _chunk(dense_input, ineffective_connector, 3)
    if "dimension_direction_not_effective" not in (chunk_c["quality"].get("advisoryFlags") or []):
        failures.append(
            f"connector-ineffective chunk should raise dimension_direction_not_effective, "
            f"got advisoryFlags={chunk_c['quality'].get('advisoryFlags')}"
        )
    note_c, tags_c, advice_c = a._build_rerun_strategy_note(chunk_c)
    if "dimension-targeted-repair" not in tags_c:
        failures.append(f"connector rerun missing dimension-targeted-repair tag, tags={tags_c}")
    if not any(term in note_c for term in ("连接词", "过渡语")) or "Dimension-targeted" not in note_c:
        failures.append("connector rerun note missing dimension-targeted connector instruction")
    # the dimension-targeted LINE must be keyed to connectors, not burstiness.
    # (the chunk may also carry unrelated rhythm templates from low_burstiness_ratio on
    # this doubly-broken text — that is correct behavior, not cross-dimension bleed.)
    dim_lines = [ln for ln in note_c.split("\n") if "Dimension-targeted" in ln or "dimension-targeted" in ln.lower()]
    if not any("过渡语" in ln or "连接词" in ln for ln in dim_lines):
        failures.append(f"connector rerun dimension-targeted line not keyed to connectors: {dim_lines}")
    if not any("衔接" in x or "连接词" in x for x in advice_c):
        failures.append(f"connector rerun advice not keyed to connectors, advice={advice_c}")

    # --- divergence: the two notes must NOT be identical (rotation produces different guidance) ---
    if note_b == note_c:
        failures.append("burstiness and connector rerun notes are identical; dimension targeting did not diverge")

    # --- no dimension problem -> no dimension-targeted injection (negative control) ---
    good_structure = (
        "面向复杂环境中的目标识别问题，本研究采用该方法开展分析。"
        "多个公开数据集提供了验证基础，测试任务中的预测结果总体稳定。"
        "在不同负载下，系统均能维持正常响应。部署成本仍处于可接受范围。"
        "小样本条件下的误差尚未完全核对，这也是当前结果的主要限制。"
        "这部分误差仍待核对。"
    )
    chunk_ok = _chunk(uniform_input, good_structure, 2)
    note_ok, tags_ok, _ = a._build_rerun_strategy_note(chunk_ok)
    if "Dimension-targeted" in note_ok or "dimension-targeted-repair" in tags_ok:
        failures.append("effective-dimension chunk should NOT inject dimension-targeted repair, got it")

    # --- structure dual-check: rhythm may look fine, structure still concentrated ---
    # Length-varied plain_active prose (>=8 sentences, concentration >=0.85) should
    # raise dimension_direction_not_effective and inject structure-diversify without
    # passive / long-的 quotas.
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
    chunk_s = _chunk(concentrated_long, concentrated_long, 2)
    quality_s = chunk_s["quality"]
    direction_s = quality_s.get("dimensionDirection") or {}
    structure_direction = direction_s.get("structureDirection") if isinstance(direction_s, dict) else None
    if not isinstance(structure_direction, dict) or structure_direction.get("effective") is not False:
        failures.append(
            f"structure dual-check should mark structureDirection.effective=False, got {structure_direction}"
        )
    if "dimension_direction_not_effective" not in (quality_s.get("advisoryFlags") or []):
        failures.append(
            f"structure-concentrated chunk should raise dimension_direction_not_effective, "
            f"got advisoryFlags={quality_s.get('advisoryFlags')}"
        )
    note_s, tags_s, advice_s = a._build_rerun_strategy_note(chunk_s)
    if "dimension-targeted-repair" not in tags_s:
        failures.append(f"structure dual-check rerun missing dimension-targeted-repair tag, tags={tags_s}")
    if "structure-diversify" not in tags_s and "structure-diversify" not in note_s:
        # tag may come from structure_template_concentration advisory; also accept
        # the dimension-targeted line carrying structure-diversify text.
        if "structure-diversify" not in note_s and "表层框架" not in note_s:
            failures.append(
                f"structure dual-check rerun missing structure-diversify guidance: "
                f"tags={tags_s} note={note_s!r}"
            )
    dim_lines_s = [ln for ln in note_s.split("\n") if "Dimension-targeted" in ln or "dimension-targeted" in ln.lower()]
    if not any("structure-diversify" in ln or "表层框架" in ln or "开句" in ln for ln in dim_lines_s):
        failures.append(f"structure dual-check dimension-targeted line not structure-keyed: {dim_lines_s}")
    if any(("改为被动" in ln) or ("长“的”链" in ln and "不要" not in ln and "禁止" not in ln) for ln in dim_lines_s):
        failures.append(f"structure dual-check guidance forces passive/long-的 quotas: {dim_lines_s}")
    # Must not demand passive / long-的 as a positive requirement.
    forbidden_require = ("改为被动", "使用被动", "长前置定语配额", "至少2个被动")
    if any(term in note_s for term in forbidden_require):
        failures.append(f"structure dual-check note requires artificial syntax: {note_s!r}")
    if not any("结构" in x or "开句" in x or "表层" in x for x in advice_s):
        failures.append(f"structure dual-check advice not keyed to frame diversify, advice={advice_s}")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("dimension_rerun_loop_regression: PASS")
        return 0
    print("dimension_rerun_loop_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
