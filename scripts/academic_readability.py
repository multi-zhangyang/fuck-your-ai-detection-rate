"""Provider-independent academic-readability delta checks for Chinese prose.

The public API deliberately reports only aggregate diagnostic metadata.  It
never returns the input, the output, matched phrases, or surrounding excerpts.
The rules are conservative surface heuristics rather than a grammar parser;
callers should use them to reject a newly degraded candidate, not to claim that
accepted prose is universally grammatical or academically sound.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import re
from typing import Callable, Final


ACADEMIC_READABILITY_DELTA_SCHEMA: Final = "fyadr.academic-readability-delta"
ACADEMIC_READABILITY_DELTA_VERSION: Final = 1

COLLOQUIAL_REGISTER_INTRODUCED: Final = "colloquial_register_introduced"
ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED: Final = "academic_collocation_conflict_introduced"
PREDICATE_COMPLETENESS_REGRESSION: Final = "predicate_completeness_regression"
TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED: Final = "telegraphic_clause_chain_introduced"
VAGUE_CAUSAL_REFERENCE_INTRODUCED: Final = "vague_causal_reference_introduced"


_QUOTED_SPAN_RE = re.compile(
    r"“[^”\n]{0,500}”|‘[^’\n]{0,500}’|「[^」\n]{0,500}」|『[^』\n]{0,500}』"
    r'|(?<![A-Za-z0-9])"[^"\n]{0,500}"'
)
_WHITESPACE_RE = re.compile(r"\s+")
_SENTENCE_SPLIT_RE = re.compile(r"[。！？!?；;]+")
_CLAUSE_SPLIT_RE = re.compile(r"[，,]+")
_PREDICATE_CLAUSE_SPLIT_RE = re.compile(r"[，,。！？!?；;]+")


# A clipped one-character state is only counted when it is used as a complete
# predicate/modifier after a degree marker.  The lexical boundary is important:
# it admits informal forms such as “更稳” while excluding the first character
# of normal academic adjectives such as “更稳定”, “更稳健” and “更准确”.
# Keep the state list deliberately narrow; ordinary academic comparisons such
# as “更高/更低/更快/更慢” are intentionally outside this hard gate.
_CONTRACTED_STATE_DEGREE = r"(?:更(?:加|为)?|较(?:为)?|比较|相对|很|挺)"
_CONTRACTED_STATE_BOUNDARY = r"(?=$|[^\u3400-\u9fffA-Za-z0-9_]|[且而并但或也了的地])"


# Each expression is intentionally bounded and reusable.  No source fixture or
# full sentence is embedded in a production rule.
_COLLOQUIAL_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "followed_change",
        re.compile(r"(?:也|就|会)?跟着(?:增强|提高|上升|下降|降低|增大|减小|变化|改变|变强|变弱)"),
    ),
    (
        "informal_usage_degree",
        re.compile(r"(?:被)?用得(?:越来越|比较|相当|很)?(?:广|多|少|好|差|频繁)"),
    ),
    ("plain_speaking", re.compile(r"说白了|说到底|话说回来")),
    (
        "very_adjective",
        re.compile(
            r"挺(?:好|多|大|高|低|快|慢|强|弱|方便|容易|难|重要|明显|不错|合适|有效|清楚|常见|麻烦|复杂|简单)(?:的|了)?"
        ),
    ),
    (
        "contracted_stability_state",
        re.compile(rf"{_CONTRACTED_STATE_DEGREE}稳{_CONTRACTED_STATE_BOUNDARY}"),
    ),
    (
        "contracted_accuracy_state",
        re.compile(rf"{_CONTRACTED_STATE_DEGREE}准{_CONTRACTED_STATE_BOUNDARY}"),
    ),
    (
        "contracted_smoothness_state",
        re.compile(rf"{_CONTRACTED_STATE_DEGREE}顺{_CONTRACTED_STATE_BOUNDARY}"),
    ),
    (
        "contracted_economy_state",
        re.compile(rf"{_CONTRACTED_STATE_DEGREE}省{_CONTRACTED_STATE_BOUNDARY}"),
    ),
    ("do_informal", re.compile(r"搞(?:清楚|明白|懂|定|好|出来|一下|研究|开发|分析|设计)")),
    ("casual_choice", re.compile(r"随便(?:选|选择|使用|设置|调整|修改|处理|采用|看看|写|填|换|改)")),
    ("first_person_colloquial", re.compile(r"咱们")),
    (
        "domain_li",
        re.compile(
            r"(?:系统|模型|算法|论文|研究|实验|章节|框架|平台|环境|数据集|网络|结构|过程|方法)"
            r"里(?:面)?(?:的|所|用|有|包含|存在|进行|实现|应用|部署|运行)"
        ),
    ),
    ("also_did", re.compile(r"(?:还|也|就|再)(?:做|搞)了")),
    (
        "used_for_modifier",
        re.compile(
            r"(?:同步|消隙|控制|训练|测试|实验|部署|评估|分析|计算|测量|校准|采样|通信|传输|检测)"
            r"用的(?=[\u4e00-\u9fffA-Za-z0-9_-]{0,14}(?:方法|算法|模型|数据|参数|装置|设备|工具|指标|方案|控制器|传感器))"
        ),
    ),
)


_COLLOCATION_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "adapt_requirement",
        re.compile(r"适配[^，。；!?！？\n]{0,30}要求"),
    ),
    (
        "realize_requirement",
        re.compile(r"(?:实现|达成)[^，。；!?！？\n]{0,24}(?:要求|需求)"),
    ),
    (
        "enhance_precision",
        re.compile(r"增强[^，。；!?！？\n]{0,16}(?:控制|测量|定位|计算|识别)?精度"),
    ),
)


_PREPOSITIONAL_NOMINAL_RE = re.compile(
    r"^(?:并|且|同时|随后|进而|然后)?(?:本文|本研究|本章)?(?:针对|围绕|关于|对于|对)"
    r"[^，。；!?！？\n]{2,80}"
    r"(?:仿真分析|实验分析|统计分析|回归分析|对比分析|性能分析|误差分析|机理分析|"
    r"模型分析|数据分析|研究|验证|测试|评估|比较)$"
)
_PREDICATE_BRIDGE_RE = re.compile(
    r"(?:进行|开展|实施|完成|作出|做出|展开)(?:了|过)?|(?:予以|加以)(?:分析|研究|验证|测试|评估|比较)"
)
_DANGLING_PREPOSITION_END_RE = re.compile(
    r"(?:主要|完全|部分|仍然|仅)?(?:基于|通过|根据|依据|针对|围绕|对于|关于|作用于|取决于|依赖于)$"
)


_ACTION_RE = re.compile(
    r"(?:介绍|包括|包含|采用|使用|分析|研究|引入|完成|搭建|简化|仿真|得出|绘制|画出|"
    r"提升|提高|增强|实现|说明|比较|验证|评估|测试|构建|建立|设计|处理|提出|计算|获得|"
    r"形成|切入|延伸|讨论|考察|测量|校准|采样|传输|检测|打下|奠定)"
)
_EXPLICIT_SUBJECT_RE = re.compile(
    r"^(?:(?:并|且|同时|随后|进而|然后|最后)，?)?"
    r"(?:本文|本研究|本章|研究(?:者|人员|团队)|实验(?:结果|数据)|分析结果|"
    r"该(?:方法|模型|系统|算法|控制器|结果|数据|实验)|系统|模型|算法)"
)
_FINITE_ACTION_RE = re.compile(
    r"(?:介绍|包括|包含|采用|使用|分析|研究|引入|完成|搭建|简化|仿真|得出|绘制|画出|"
    r"提升|提高|增强|实现|说明|比较|验证|评估|测试|构建|建立|设计|处理|提出|计算|获得|"
    r"形成|切入|延伸|讨论|考察|测量|校准|采样|传输|检测|打下|奠定)(?:了|过)"
)
_MODAL_ACTION_RE = re.compile(
    r"(?:可|可以|能够|能|应|应当|需要|将|已|已经|进一步|分别|依次)"
    r"[^，,。；!?！？\n]{0,8}"
    r"(?:采用|使用|分析|研究|完成|搭建|简化|得出|绘制|提升|提高|增强|实现|说明|比较|"
    r"验证|评估|测试|构建|建立|设计|处理|提出|计算|获得|形成|讨论|考察|测量)"
)


_VAGUE_CAUSAL_MARKER_RE = re.compile(r"据此|基于此|由此(?:可见|可知|表明|说明|导致|使得?)|这(?:表明|说明|意味着|导致|使得?)")
_EXPLICIT_ANTECEDENT_RE = re.compile(
    r"(?:上述|前述|该|这一|这些)(?:实验|结果|结论|发现|分析|数据|证据|现象|关系|差异|变化|机制|条件|模型|方法)"
    r"|(?:实验|统计|分析|测量|仿真)(?:结果|数据)[^。！？!?；;]{0,20}(?:显示|表明|说明|证明|发现)"
)


def _mask_quoted_spans(text: str) -> str:
    """Remove quoted material from heuristic scoring without retaining it."""

    return _QUOTED_SPAN_RE.sub(lambda match: " " * len(match.group(0)), text)


def _normalise_for_analysis(text: str) -> str:
    return _WHITESPACE_RE.sub("", _mask_quoted_spans(text))


def _regex_profile(text: str, rules: tuple[tuple[str, re.Pattern[str]], ...]) -> Counter[str]:
    return Counter({rule_id: len(tuple(pattern.finditer(text))) for rule_id, pattern in rules})


def _colloquial_profile(text: str) -> Counter[str]:
    return _regex_profile(text, _COLLOQUIAL_RULES)


def _collocation_profile(text: str) -> Counter[str]:
    return _regex_profile(text, _COLLOCATION_RULES)


def _predicate_profile(text: str) -> Counter[str]:
    profile: Counter[str] = Counter()
    for clause in _PREDICATE_CLAUSE_SPLIT_RE.split(text):
        clause = clause.strip(" ：:（）()[]【】")
        if not clause:
            continue
        if _PREPOSITIONAL_NOMINAL_RE.fullmatch(clause) and not _PREDICATE_BRIDGE_RE.search(clause):
            profile["prepositional_nominal_predicate"] += 1
        if _DANGLING_PREPOSITION_END_RE.search(clause):
            profile["dangling_preposition"] += 1
    return profile


def _is_bare_action_clause(clause: str) -> bool:
    clause = clause.strip(" ：:（）()[]【】")
    if not clause or not _ACTION_RE.search(clause):
        return False
    if _EXPLICIT_SUBJECT_RE.search(clause):
        return False
    if _FINITE_ACTION_RE.search(clause) or _MODAL_ACTION_RE.search(clause):
        return False
    return True


def _telegraphic_profile(text: str) -> Counter[str]:
    profile: Counter[str] = Counter()
    for sentence in _SENTENCE_SPLIT_RE.split(text):
        clauses = [clause for clause in _CLAUSE_SPLIT_RE.split(sentence) if clause.strip()]
        if len(clauses) < 5:
            continue
        action_clause_count = sum(1 for clause in clauses if _ACTION_RE.search(clause))
        if action_clause_count < 5:
            continue
        bare_action_count = sum(1 for clause in clauses if _is_bare_action_clause(clause))
        # Three coordinated zero-subject predicates are common and readable in
        # Chinese.  Risk begins only when a long sentence stacks at least four.
        excess = max(0, bare_action_count - 3)
        if excess:
            profile["bare_action_chain_excess"] += excess
    return profile


def _has_explicit_antecedent(text: str, marker_start: int) -> bool:
    lookback = text[max(0, marker_start - 72):marker_start]
    return bool(_EXPLICIT_ANTECEDENT_RE.search(lookback))


def _vague_causal_profile(text: str) -> Counter[str]:
    profile: Counter[str] = Counter()
    for match in _VAGUE_CAUSAL_MARKER_RE.finditer(text):
        if not _has_explicit_antecedent(text, match.start()):
            profile["deictic_causal_without_explicit_antecedent"] += 1
    return profile


@dataclass(frozen=True)
class _IssueSpec:
    code: str
    level: str
    message: str
    detector: Callable[[str], Counter[str]]


_ISSUE_SPECS: tuple[_IssueSpec, ...] = (
    _IssueSpec(
        COLLOQUIAL_REGISTER_INTRODUCED,
        "high",
        "候选新引入了不适合学术正文的口语化或非正式书面表达。",
        _colloquial_profile,
    ),
    _IssueSpec(
        ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED,
        "high",
        "候选新引入了高置信度的学术动宾搭配冲突。",
        _collocation_profile,
    ),
    _IssueSpec(
        PREDICATE_COMPLETENESS_REGRESSION,
        "high",
        "候选新引入了谓语不完整或介词结构悬空。",
        _predicate_profile,
    ),
    _IssueSpec(
        TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED,
        "high",
        "候选新引入了过量的无主语裸谓语串联，句子呈电报式压缩。",
        _telegraphic_profile,
    ),
    _IssueSpec(
        VAGUE_CAUSAL_REFERENCE_INTRODUCED,
        "medium",
        "候选新引入了缺少明确先行依据的因果或论证指代。",
        _vague_causal_profile,
    ),
)


def _positive_rule_delta(before: Counter[str], after: Counter[str]) -> int:
    """Sum only per-rule increases so one old pattern cannot hide a new one."""

    return sum(max(0, after[rule_id] - before[rule_id]) for rule_id in before.keys() | after.keys())


def _resolved_rule_delta(before: Counter[str], after: Counter[str]) -> int:
    return sum(max(0, before[rule_id] - after[rule_id]) for rule_id in before.keys() | after.keys())


def assess_academic_readability_delta(input_text: str, output_text: str) -> dict[str, object]:
    """Assess only readability problems newly introduced by ``output_text``.

    ``ok`` is the candidate-acceptance signal: callers that use this check as a
    release gate should accept a candidate only when ``ok is True``.  Existing
    input problems that are preserved do not fail this delta check.  The return
    value is text-free and deterministic; it can be logged or persisted without
    disclosing either body.
    """

    if not isinstance(input_text, str) or not isinstance(output_text, str):
        raise TypeError("input_text and output_text must both be strings")

    before_text = _normalise_for_analysis(input_text)
    after_text = _normalise_for_analysis(output_text)
    issues: list[dict[str, object]] = []
    by_code: dict[str, dict[str, int]] = {}

    for spec in _ISSUE_SPECS:
        before_profile = spec.detector(before_text)
        after_profile = spec.detector(after_text)
        before_count = sum(before_profile.values())
        after_count = sum(after_profile.values())
        introduced_count = _positive_rule_delta(before_profile, after_profile)
        resolved_count = _resolved_rule_delta(before_profile, after_profile)
        by_code[spec.code] = {
            "input": before_count,
            "output": after_count,
            "introduced": introduced_count,
            "resolved": resolved_count,
        }
        if introduced_count:
            issues.append(
                {
                    "code": spec.code,
                    "level": spec.level,
                    "message": spec.message,
                    "introducedCount": introduced_count,
                    "inputCount": before_count,
                    "outputCount": after_count,
                }
            )

    issue_codes = [str(issue["code"]) for issue in issues]
    introduced_total = sum(item["introduced"] for item in by_code.values())
    resolved_total = sum(item["resolved"] for item in by_code.values())
    input_total = sum(item["input"] for item in by_code.values())
    output_total = sum(item["output"] for item in by_code.values())
    return {
        "schema": ACADEMIC_READABILITY_DELTA_SCHEMA,
        "schemaVersion": ACADEMIC_READABILITY_DELTA_VERSION,
        "ok": not issue_codes,
        "issueCodes": issue_codes,
        "issues": issues,
        "counts": {
            "input": input_total,
            "output": output_total,
            "introduced": introduced_total,
            "resolved": resolved_total,
            "byCode": by_code,
        },
        "claims": {
            "providerIndependent": True,
            "deltaOnly": True,
            "heuristicOnly": True,
            "storesInputText": False,
            "storesOutputText": False,
            "storesMatchedText": False,
            "isAiDetector": False,
            "claimsAuthorshipDetection": False,
            "claimsSemanticEquivalence": False,
            "claimsUniversalGrammarValidation": False,
        },
    }


__all__ = [
    "ACADEMIC_READABILITY_DELTA_SCHEMA",
    "ACADEMIC_READABILITY_DELTA_VERSION",
    "COLLOQUIAL_REGISTER_INTRODUCED",
    "ACADEMIC_COLLOCATION_CONFLICT_INTRODUCED",
    "PREDICATE_COMPLETENESS_REGRESSION",
    "TELEGRAPHIC_CLAUSE_CHAIN_INTRODUCED",
    "VAGUE_CAUSAL_REFERENCE_INTRODUCED",
    "assess_academic_readability_delta",
]
