#!/usr/bin/env python3
"""Focused regression for the text-free academic-readability delta API."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from academic_readability import (
    ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
    ACADEMIC_READABILITY_DELTA_SCHEMA,
    ACADEMIC_READABILITY_DELTA_VERSION,
    COLLOQUIAL_REGISTER_INTRODUCED,
    PREDICATE_COMPLETENESS_REGRESSION,
    TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
    VAGUE_CAUSAL_REFERENCE_INTRODUCED,
    assess_academic_readability_delta,
)


P0_SOURCE = (
    "多电机同轴驱动既能增大伺服系统的输出功率，又可消除传动链齿隙，提高系统的控制精度。"
    "现场总线具有实时性高、稳定性好等优点，广泛应用于伺服系统中，本文实现了一种基于CANopen协议的"
    "双电机同轴驱动控制系统，用于满足不同工业场合对伺服系统的输出功率和控制精度要求。"
)
P0_V7 = (
    "多电机同轴驱动可增大伺服系统输出功率，也能消除传动链齿隙来提升控制精度。"
    "现场总线实时性高、稳定性好，在伺服系统里用得很多；本文据此实现了一套基于CANopen协议的"
    "双电机同轴驱动控制系统，以应对不同工业场合对输出功率和控制精度的需求。"
)
P0_FORMAL = (
    "多电机同轴驱动可提高伺服系统的输出功率，并可消除传动链齿隙，从而提高系统控制精度。"
    "现场总线具有较高的实时性和稳定性，已广泛应用于伺服系统。"
    "本文实现了基于CANopen协议的双电机同轴驱动控制系统，以满足不同工业场合对输出功率与控制精度的要求。"
)

P7_SOURCE = (
    "应用中采用多电机传动的方式，可以满足不同场合的性能指标要求。"
    "全数字控制的应用使得伺服系统的控制精度和可靠性得到提高，也使系统抗干扰能力得到增强[1]"
    "（文献序号用上标，所有参考文献均须在文中标出，且按照顺序引用）。"
    "由于现场总线具有多支点、可靠性强、易扩展等特点，因此现场总线技术在伺服系统中得到了广泛应用，"
    "详细描述请参阅文献[2]（此处文献序号不用上标）。"
)
P7_V7 = (
    "多电机传动在应用中能适配不同场合的性能指标要求。"
    "全数字控制提升了伺服系统的控制精度与可靠性，也增强了抗干扰能力[1]"
    "（文献序号用上标，所有参考文献均须在文中标出，且按照顺序引用）。"
    "现场总线具备多支点、可靠性强和易扩展的特点，因而在伺服系统中被广泛使用，"
    "详见文献[2]（此处文献序号不用上标）。"
)
P7_FORMAL = (
    "多电机传动能够满足不同应用场合的性能指标要求。"
    "全数字控制提高了伺服系统的控制精度与可靠性，并增强了系统的抗干扰能力[1]"
    "（文献序号用上标，所有参考文献均须在文中标出，且按照顺序引用）。"
    "现场总线具有多支点、可靠性强和易扩展等特点，因而广泛应用于伺服系统；"
    "相关内容见文献[2]（此处文献序号不用上标）。"
)

P69_SOURCE = (
    "本章主要介绍了双电机同轴驱动控制系统中控制算法，包括双电机同步所需的速度均衡控制算法和消隙所需的"
    "偏置力矩控制算法，并进行了同轴驱动控制系统的三闭环设计，最后对调节器的PID增量型控制算法做了简要说明。"
    "在此基础上进行了单电机速度、电流双闭环的模型分析，引入到双电机速度、电流双闭环的模型，完成了双电机"
    "双闭环系统方框图后，在Simulink环境下，完成了双电机双闭环仿真模型的简化和搭建，并对速度PI控制器和"
    "双电机同步算法进行了仿真分析，得出了相应的结论，为后续的实物测试应用奠定了基础。"
)
P69_V7 = (
    "本章介绍了双电机同轴驱动控制系统里的控制算法，含双电机同步用的速度均衡控制算法与消隙用的偏置力矩"
    "控制算法，还做了该系统三闭环设计，并对调节器PID增量型控制算法作了简要说明。"
    "随后从单电机速度、电流双闭环模型分析切入，延伸到双电机速度、电流双闭环模型，画出双电机双闭环系统"
    "方框图，在Simulink中简化并搭建双电机双闭环仿真模型，针对速度PI控制器与双电机同步算法仿真分析，"
    "得出相应结论，为后续实物测试应用打下基础。"
)
P69_FORMAL = (
    "本章介绍了双电机同轴驱动控制系统的控制算法，包括用于双电机同步的速度均衡控制算法和用于消隙的偏置"
    "力矩控制算法。本文还完成了同轴驱动控制系统的三闭环设计，并简要说明了调节器的PID增量型控制算法。"
    "在此基础上，本文分析了单电机速度、电流双闭环模型，并将其扩展为双电机速度、电流双闭环模型。"
    "随后，研究建立了双电机双闭环系统方框图，并在Simulink环境下完成仿真模型的简化与搭建。"
    "最后，本文对速度PI控制器和双电机同步算法进行了仿真分析，所得结论为后续实物测试奠定了基础。"
)


ALL_CODES = {
    COLLOQUIAL_REGISTER_INTRODUCED,
    ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
    PREDICATE_COMPLETENESS_REGRESSION,
    TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
    VAGUE_CAUSAL_REFERENCE_INTRODUCED,
}


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _assert_codes(result: dict[str, object], expected: set[str], label: str) -> None:
    actual = set(result.get("issueCodes") or [])
    _assert(actual == expected, f"{label}: expected {sorted(expected)}, got {sorted(actual)}")
    _assert(result.get("ok") is (not expected), f"{label}: ok disagrees with issue codes")


def _assert_text_free(result: dict[str, object], *bodies: str) -> None:
    serialized = json.dumps(result, ensure_ascii=False, sort_keys=True)
    for body in bodies:
        _assert(body not in serialized, "assessment leaked a complete input or output body")
    for private_token in (
        "CANopen",
        "Simulink",
        "多支点",
        "双电机同轴驱动",
        "速度PI控制器",
        "用得很多",
        "适配不同场合",
    ):
        _assert(private_token not in serialized, f"assessment leaked body-derived text: {private_token}")


def _check_contract(result: dict[str, object]) -> None:
    _assert(
        set(result) == {"schema", "schemaVersion", "ok", "issueCodes", "issues", "counts", "claims"},
        f"public fields drifted: {sorted(result)}",
    )
    _assert(result["schema"] == ACADEMIC_READABILITY_DELTA_SCHEMA, "schema drifted")
    _assert(result["schemaVersion"] == ACADEMIC_READABILITY_DELTA_VERSION, "schema version drifted")
    counts = result.get("counts")
    _assert(isinstance(counts, dict), "counts is not an object")
    by_code = counts.get("byCode")
    _assert(isinstance(by_code, dict) and set(by_code) == ALL_CODES, "counts.byCode is incomplete")
    for code, item in by_code.items():
        _assert(
            isinstance(item, dict) and set(item) == {"input", "output", "introduced", "resolved"},
            f"{code}: per-code counters drifted",
        )
        _assert(all(isinstance(value, int) and value >= 0 for value in item.values()), f"{code}: invalid counter")
    _assert(
        counts["introduced"] == sum(item["introduced"] for item in by_code.values()),
        "introduced aggregate drifted",
    )
    _assert(
        counts["resolved"] == sum(item["resolved"] for item in by_code.values()),
        "resolved aggregate drifted",
    )
    claims = result.get("claims")
    _assert(
        isinstance(claims, dict)
        and claims.get("providerIndependent") is True
        and claims.get("deltaOnly") is True
        and claims.get("heuristicOnly") is True
        and claims.get("storesInputText") is False
        and claims.get("storesOutputText") is False
        and claims.get("storesMatchedText") is False
        and claims.get("isAiDetector") is False
        and claims.get("claimsAuthorshipDetection") is False
        and claims.get("claimsSemanticEquivalence") is False
        and claims.get("claimsUniversalGrammarValidation") is False,
        f"honesty/privacy claims drifted: {claims}",
    )


def run_regression() -> dict[str, Any]:
    checks: list[str] = []

    negative_cases = (
        (
            "v7-p0",
            P0_SOURCE,
            P0_V7,
            {COLLOQUIAL_REGISTER_INTRODUCED, VAGUE_CAUSAL_REFERENCE_INTRODUCED},
        ),
        (
            "v7-p7",
            P7_SOURCE,
            P7_V7,
            {ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED},
        ),
        (
            "v7-p69",
            P69_SOURCE,
            P69_V7,
            {
                COLLOQUIAL_REGISTER_INTRODUCED,
                PREDICATE_COMPLETENESS_REGRESSION,
                TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
            },
        ),
    )
    for label, source, candidate, expected_codes in negative_cases:
        result = assess_academic_readability_delta(source, candidate)
        _assert_codes(result, expected_codes, label)
        _check_contract(result)
        _assert_text_free(result, source, candidate)
    checks.append("v7 p0/p7/p69 fail closed through generalized readability deltas without body evidence")

    for label, source, formal_candidate in (
        ("formal-p0", P0_SOURCE, P0_FORMAL),
        ("formal-p7", P7_SOURCE, P7_FORMAL),
        ("formal-p69", P69_SOURCE, P69_FORMAL),
    ):
        result = assess_academic_readability_delta(source, formal_candidate)
        _assert_codes(result, set(), label)
        _check_contract(result)
        _assert_text_free(result, source, formal_candidate)
    checks.append("formal, natural academic rewrites for all three v7 inputs remain eligible")

    business_need = assess_academic_readability_delta(
        "该接口支持多种业务场景。",
        "该接口可适配不同业务需求。",
    )
    _assert_codes(business_need, set(), "legitimate-business-need-collocation")
    explicit_causal = assess_academic_readability_delta(
        "实验结果显示控制误差显著降低。",
        "上述实验结果显示控制误差显著降低。据此，本文进一步分析系统稳定性。",
    )
    _assert_codes(explicit_causal, set(), "explicit-causal-antecedent")
    quoted_colloquial = assess_academic_readability_delta(
        "访谈材料记录了操作人员的原始表述。",
        "访谈材料保留了操作人员所述“该系统里用得很多”，以维持语料原貌。",
    )
    _assert_codes(quoted_colloquial, set(), "quoted-colloquial-material")
    quoted_contracted_state = assess_academic_readability_delta(
        "访谈材料记录了操作人员对链路状态的评价。",
        "访谈材料保留了操作人员所述“调整后传输更稳”，以维持语料原貌。",
    )
    _assert_codes(quoted_contracted_state, set(), "quoted-contracted-state")
    checks.append("legitimate business needs, explicit causal antecedents, and quoted speech avoid false positives")

    contracted_state_cases = (
        (
            "contracted-stability",
            "链路控制策略使数据传输更加稳定。",
            "链路控制策略使数据传输更稳。",
        ),
        (
            "contracted-accuracy",
            "校准后，传感器的测量结果更加准确。",
            "校准后，传感器的测量结果更准。",
        ),
        (
            "contracted-smoothness",
            "调度策略使任务执行过程更加顺畅。",
            "调度策略使任务执行过程更顺。",
        ),
        (
            "contracted-economy",
            "该控制策略能够进一步降低设备能耗。",
            "该控制策略使设备运行更省。",
        ),
    )
    for label, source, candidate in contracted_state_cases:
        result = assess_academic_readability_delta(source, candidate)
        _assert_codes(result, {COLLOQUIAL_REGISTER_INTRODUCED}, label)
        _assert(
            result["counts"]["byCode"][COLLOQUIAL_REGISTER_INTRODUCED]["introduced"] == 1,
            f"{label}: contracted-state delta count drifted",
        )
        _assert_text_free(result, source, candidate)

    for label, formal_comparison in (
        (
            "normal-high-low-and-stable",
            "改进后，系统运行更加稳定，稳态误差更低，估计精度更高。",
        ),
        (
            "normal-full-state-adjectives",
            "重复试验表明，该估计量更准确，优化过程更稳定，参数更新更稳健。",
        ),
        (
            "normal-smooth-and-lower",
            "改进后的控制流程更顺畅，设备能耗相对更低。",
        ),
        (
            "normal-compound-state-words",
            "该算法更省时，任务调度更加准时，输出光束更准直。",
        ),
    ):
        result = assess_academic_readability_delta("原方案的性能满足试验要求。", formal_comparison)
        _assert_codes(result, set(), label)

    unchanged_contracted_state = assess_academic_readability_delta(
        "受访者认为调整后的传输更稳。",
        "受访者认为调整后的传输更稳。",
    )
    _assert_codes(unchanged_contracted_state, set(), "unchanged-contracted-state")
    replaced_contracted_state = assess_academic_readability_delta(
        "旧版控制器运行更稳。",
        "新版估计结果更准。",
    )
    _assert_codes(
        replaced_contracted_state,
        {COLLOQUIAL_REGISTER_INTRODUCED},
        "different-contracted-state-not-hidden-by-family-count",
    )
    replaced_counts = replaced_contracted_state["counts"]["byCode"][COLLOQUIAL_REGISTER_INTRODUCED]
    _assert(
        replaced_counts["input"] == replaced_counts["output"] == 1
        and replaced_counts["introduced"] == replaced_counts["resolved"] == 1,
        f"contracted-state per-rule delta accounting drifted: {replaced_counts}",
    )
    checks.append(
        "new clipped stability/accuracy/smoothness/economy states fail by per-rule delta while full academic adjectives and ordinary high/low comparisons remain eligible"
    )

    category_cases = (
        (
            COLLOQUIAL_REGISTER_INTRODUCED,
            "该方法在工程场景中的应用范围持续扩大。",
            "该方法在工程场景中用得越来越广。",
        ),
        (
            ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
            "该接口能够满足部署要求。",
            "该接口能够适配部署要求。",
        ),
        (
            PREDICATE_COMPLETENESS_REGRESSION,
            "本文针对控制器进行了仿真分析。",
            "本文针对控制器仿真分析。",
        ),
        (
            TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
            "本文先分析数据并构建模型。随后调整参数并验证结果。最后比较误差并形成结论。",
            "分析数据，构建模型，调整参数，验证结果，比较误差，形成结论。",
        ),
        (
            VAGUE_CAUSAL_REFERENCE_INTRODUCED,
            "参数经过调整，系统稳定性仍需验证。",
            "参数经过调整。据此，系统更加稳定。",
        ),
    )
    for code, source, candidate in category_cases:
        result = assess_academic_readability_delta(source, candidate)
        _assert(code in set(result["issueCodes"]), f"generic {code} case was missed: {result}")
    checks.append("all five issue families detect generalized non-v7 examples")

    for unchanged in (P0_V7, P7_V7, P69_V7):
        result = assess_academic_readability_delta(unchanged, unchanged)
        _assert_codes(result, set(), "pre-existing-unchanged-problem")
        _assert(result["counts"]["introduced"] == 0, "unchanged problem produced a positive delta")

    replaced_problem = assess_academic_readability_delta(
        "该模型里的参数由实验数据确定。",
        "说白了，模型参数由实验数据确定。",
    )
    _assert(
        COLLOQUIAL_REGISTER_INTRODUCED in set(replaced_problem["issueCodes"]),
        "a different newly introduced rule was hidden by an equal family-level count",
    )
    colloquial_counts = replaced_problem["counts"]["byCode"][COLLOQUIAL_REGISTER_INTRODUCED]
    _assert(
        colloquial_counts["input"] == colloquial_counts["output"] == 1
        and colloquial_counts["introduced"] == colloquial_counts["resolved"] == 1,
        f"per-rule delta accounting drifted: {colloquial_counts}",
    )
    checks.append("only positive per-rule deltas fail; unchanged old problems do not offset or trigger candidate rejection")

    empty = assess_academic_readability_delta("", "")
    _assert_codes(empty, set(), "empty")
    _check_contract(empty)
    try:
        assess_academic_readability_delta("valid", None)  # type: ignore[arg-type]
    except TypeError:
        pass
    else:
        raise AssertionError("non-string API input was not rejected")

    module_source = Path(__file__).with_name("academic_readability.py").read_text(encoding="utf-8")
    for fixture_body in (P0_SOURCE, P0_V7, P7_SOURCE, P7_V7, P69_SOURCE, P69_V7):
        _assert(fixture_body not in module_source, "production detector hard-coded a complete v7 fixture")
    checks.append("API boundary is deterministic, typed, text-free, and production rules contain no full v7 sentence")

    return {"ok": True, "checks": checks, "checkCount": len(checks)}


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
