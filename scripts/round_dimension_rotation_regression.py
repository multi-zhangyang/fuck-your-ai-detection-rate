#!/usr/bin/env python3
"""Round editing-responsibility rotation regression.

Locks that the multi-round chain gives different passes distinct local editing
responsibilities instead of repeatedly rewriting every sentence for the same
reason. Verifies:

1. get_round_dimension mapping: round1->prewrite(warmup), round2->round1 prompt
   (sentence_structure / burstiness), round3->round2 prompt
   (connector_detail / connectorDensity). The two active dimensions are
   DISTINCT (not the same dimension repeated).
2. _assess_dimension_direction is directionally valid per dimension:
   - sentence_structure: output burstiness >= input => ok True; collapsed-back
     to uniform => ok False (advisor fires).
   - connector_detail: output connectorDensity <= input => ok True; connector
     density cranked up => ok False (advisor fires).
   Real chunk texts, real metric computation — no stubs.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402
import prompt_library as p  # noqa: E402

PROFILE = "cn_custom"


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    # --- 1. dimension mapping: rounds map to distinct dimensions ---
    dim1 = p.get_round_dimension(PROFILE, 1)
    dim2 = p.get_round_dimension(PROFILE, 2)
    dim3 = p.get_round_dimension(PROFILE, 3)
    if dim1["promptId"] != "prewrite" or dim1["id"] != "structure_warmup":
        failures.append(f"round1 dimension wrong: {dim1}")
    if dim2["promptId"] != "round1" or dim2["id"] != "sentence_structure":
        failures.append(f"round2 dimension wrong: {dim2}")
    if dim3["promptId"] != "round2" or dim3["id"] != "connector_detail":
        failures.append(f"round3 dimension wrong: {dim3}")
    # The two active (non-warmup) dimensions must be distinct:
    if dim2["primaryMetric"] == dim3["primaryMetric"]:
        failures.append(
            f"round2 and round3 share the same primaryMetric ({dim2['primaryMetric']}); "
            "rotation collapsed — same dimension repeated, AI-rewrite-AI rebound risk"
        )
    if dim2["id"] == dim3["id"]:
        failures.append("round2 and round3 share the same dimension id; rotation collapsed")

    # --- 2a. sentence_structure direction: good rewrite raises burstiness ---
    # Uniform AI-cadence input (every sentence ~same length) -> pass1 rewrite
    # breaks it into short+long interleaving (burstiness ratio rises).
    uniform_input = (
        "该方法用于解决复杂环境下的目标识别问题。该方法使用多个公开数据集完成验证。"
        "该方法在测试任务中取得稳定的预测结果。该方法在不同负载下保持正常响应。"
        "该方法的部署成本处于可接受范围之内。该方法仍需核对小样本条件下的误差。"
    )
    structure_good_output = (
        "面向复杂环境中的目标识别问题，本研究采用该方法开展分析。"
        "多个公开数据集提供了验证基础，测试任务中的预测结果总体稳定。"
        "在不同负载下，系统均能维持正常响应。部署成本仍处于可接受范围。"
        "小样本条件下的误差尚未完全核对，这也是当前结果的主要限制。"
        "这部分误差仍待核对。"
    )
    in_br = float(f._style_risk_metrics(uniform_input).get("burstinessRatio", 0) or 0)
    out_br = float(f._style_risk_metrics(structure_good_output).get("burstinessRatio", 0) or 0)
    good_dir = f._assess_dimension_direction(uniform_input, structure_good_output, dim2)
    if not bool(good_dir.get("ok", False)):
        failures.append(f"sentence_structure: good rewrite (burstiness {in_br}->{out_br}) should be ok=True, got {good_dir}")
    if out_br <= in_br:
        failures.append(f"sentence_structure: output burstiness ({out_br}) did not rise above input ({in_br}) on good rewrite")

    # bad rewrite: collapse back to uniform cadence (burstiness drops to uniform region)
    structure_bad_output = (
        "该方法用于处理复杂环境中的目标识别问题。该方法在多个公开数据集上进行验证。"
        "该方法在测试任务中获得稳定的预测结果。该方法在不同负载下维持正常响应。"
        "该方法的部署成本仍处于可接受范围。该方法还需核对小样本条件下的误差。"
    )
    bad_dir = f._assess_dimension_direction(uniform_input, structure_bad_output, dim2)
    if bool(bad_dir.get("ok", True)):
        failures.append(
            f"sentence_structure: collapsed-uniform rewrite should be ok=False (advisor should fire), got {bad_dir}"
        )

    # --- 2b. connector_detail direction: good rewrite lowers connector density ---
    # Input packed with mechanical connectors -> pass2 rewrite loosens them.
    dense_input = (
        "首先，该方法在工程上有效。其次，多个实验验证了核心结论。此外，整体性能提升明显。"
        "因此，该模型具备可行性。另外，部署成本较低。从而，具备一定的推广价值。"
        "同时，系统在长时间运行中保持稳定响应。"
    )
    connector_good_output = (
        "该方法在工程上有效。多个实验验证了核心结论，整体性能提升明显。"
        "该模型具备可行性，部署成本也较低，具备一定的推广价值。"
        "系统在长时间运行中保持稳定响应，未出现明显退化或异常中断。"
    )
    in_cd = float(f._style_risk_metrics(dense_input).get("connectorDensity", 0) or 0)
    out_cd = float(f._style_risk_metrics(connector_good_output).get("connectorDensity", 0) or 0)
    good_conn = f._assess_dimension_direction(dense_input, connector_good_output, dim3)
    if not bool(good_conn.get("ok", False)):
        failures.append(f"connector_detail: good rewrite (density {in_cd}->{out_cd}) should be ok=True, got {good_conn}")
    if out_cd >= in_cd:
        failures.append(f"connector_detail: output density ({out_cd}) did not drop below input ({in_cd}) on good rewrite")

    # bad rewrite: each sentence loaded with two mechanical connectors ->
    # connector density rises above input (the pass2 dimension regressed).
    connector_bad_output = (
        "首先，该方法在工程上有效，其次，多个实验验证了核心结论。"
        "此外，整体性能提升明显，因此，该模型具备可行性。"
        "另外，部署成本较低，从而，具备一定的推广价值。"
        "同时，系统在长时间运行中保持稳定响应。"
    )
    bad_conn = f._assess_dimension_direction(dense_input, connector_bad_output, dim3)
    if bool(bad_conn.get("ok", True)):
        failures.append(f"connector_detail: connector-cranked-up rewrite should be ok=False, got {bad_conn}")

    # --- 2c. warmup dimension does NOT enforce a direction ---
    warmup_dir = f._assess_dimension_direction(uniform_input, structure_good_output, dim1)
    if not bool(warmup_dir.get("ok", False)):
        failures.append(f"warmup dimension should never enforce direction (ok=True), got {warmup_dir}")

    # --- 2d. already_satisfied: input already low on the dimension (real e2e finding) ---
    # In the real multi-round chain, the sentence-structure round's rewrite often
    # incidentally clears mechanical connectors, so when the connector round is
    # chained it receives a connectorDensity==0 input with nothing to lower.
    # The diagnostic must report already_satisfied (ok=True, satisfied=True), NOT
    # spin a meaningless "decrease succeeded" — that distinction lets the rerun
    # loop know there is genuinely nothing to fix on this dimension.
    already_satisfied_input = (
        "该方法在工程上有效。多个实验验证了核心结论，整体性能提升明显。"
        "该模型具备可行性，部署成本也较低，具备一定的推广价值。"
        "系统在长时间运行中保持稳定响应，未出现明显退化或异常中断。"
    )
    as_in_cd = float(f._style_risk_metrics(already_satisfied_input).get("connectorDensity", 0) or 0)
    if as_in_cd >= 0.45:
        failures.append(f"already_satisfied fixture should have low connectorDensity (<0.45), got {as_in_cd}")
    as_dir = f._assess_dimension_direction(already_satisfied_input, already_satisfied_input, dim3)
    if not bool(as_dir.get("ok", False)):
        failures.append(f"already_satisfied connector input should be ok=True, got {as_dir}")
    if not bool(as_dir.get("satisfied", False)):
        failures.append(f"already_satisfied connector input should report satisfied=True, got {as_dir}")
    if "dimension_direction_not_effective" in str(as_dir.get("note", "")):
        failures.append("already_satisfied should NOT report ineffective")

    # burstiness already satisfied: input already non-uniform (>=2.0) and stays so
    burst_satisfied = (
        "面向复杂环境中的目标识别问题，本研究采用该方法开展分析。"
        "多个公开数据集提供了验证基础，测试任务中的预测结果总体稳定。"
        "在不同负载下，系统均能维持正常响应。部署成本仍处于可接受范围。"
        "小样本条件下的误差尚未完全核对，这也是当前结果的主要限制。"
        "这部分误差仍待核对。"
    )
    bs_dir = f._assess_dimension_direction(burst_satisfied, burst_satisfied, dim2)
    if not bool(bs_dir.get("ok", False)) or not bool(bs_dir.get("satisfied", False)):
        failures.append(f"already_satisfied burstiness input should report ok+satisfied=True, got {bs_dir}")

    # --- 3. chunk quality surfaces roundDimension + dimensionDirection ---
    cq = f._build_chunk_quality(uniform_input, structure_good_output, round_dimension=dim2)
    if cq.get("roundDimension", {}).get("id") != "sentence_structure":
        failures.append(f"_build_chunk_quality did not surface roundDimension id, got {cq.get('roundDimension')}")
    if "dimensionDirection" not in cq or "primaryMetric" not in (cq.get("dimensionDirection") or {}):
        failures.append(f"_build_chunk_quality missing dimensionDirection with primaryMetric, got {cq.get('dimensionDirection')}")
    # bad direction should produce an advisory flag + review reason
    cq_bad = f._build_chunk_quality(uniform_input, structure_bad_output, round_dimension=dim2)
    if "dimension_direction_not_effective" not in (cq_bad.get("advisoryFlags") or []):
        failures.append("dimension_direction_not_effective advisory flag not raised on ineffective dimension rewrite")
    if not any(r.get("code") == "dimension_direction_not_effective" for r in cq_bad.get("reviewReasons", [])):
        failures.append("dimension_direction_not_effective review reason not raised on ineffective dimension rewrite")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("round_dimension_rotation_regression: PASS")
        return 0
    print("round_dimension_rotation_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
