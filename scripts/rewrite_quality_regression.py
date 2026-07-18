#!/usr/bin/env python3
"""Offline regression for rewrite naturalness, fidelity, and anti-gaming rules.

The fixtures are representative academic/technical passages and use only
deterministic local functions or fake identity transforms.  No provider, API
key, network access, or paid model call is involved.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from chunking import Chunk, build_manifest, restore_text_from_chunks  # noqa: E402
from deterministic_postprocess import deterministic_burstiness_postprocess  # noqa: E402
from factual_guards import collect_factual_relation_issues  # noqa: E402
import fyadr_round_service as f  # noqa: E402


def run_regression() -> dict[str, object]:
    failures: list[str] = []
    evidence: dict[str, object] = {}

    # 1. A normal thesis paragraph below the configured limit stays whole.
    paragraph = "。".join(
        ["本研究围绕复杂环境下的目标识别问题展开分析，并结合公开数据集讨论模型结构、训练策略和误差来源"] * 8
    ) + "。"
    manifest = build_manifest(paragraph, chunk_limit=1800, chunk_metric="char")
    evidence["paragraphChars"] = len(paragraph)
    evidence["paragraphChunkCount"] = manifest.chunk_count
    if manifest.chunk_count != 1 or manifest.chunks[0].text != paragraph:
        failures.append(f"paragraph under public chunk limit was fragmented: {[c.char_count for c in manifest.chunks]}")

    oversized = paragraph * 6
    oversized_manifest = build_manifest(oversized, chunk_limit=700, chunk_metric="char")
    if not (oversized_manifest.chunk_count > 1 and all(chunk.char_count <= 700 for chunk in oversized_manifest.chunks)):
        failures.append("truly oversized paragraph was not split within the configured hard limit")
    identity_results = {chunk.chunk_id: chunk.text for chunk in oversized_manifest.chunks}
    if restore_text_from_chunks(oversized_manifest, identity_results) != oversized:
        failures.append("identity chunk split/restore changed paragraph text")

    # 2. Protected numbers/citations are positional: no reorder or duplication.
    factual_source = "模型准确率为91.2%，结论见[3]；召回率为88.7%，结论见[4]。"
    protected = f.protect_structure_tokens(factual_source)
    expected_tokens = list(protected.tokens)
    candidates = {
        "exact": protected.text,
        "reordered": "".join(reversed(expected_tokens)) + "模型结果保持稳定。",
        "duplicated": protected.text + expected_tokens[0],
    }
    placeholder_outcomes: dict[str, str] = {}
    for label, candidate in candidates.items():
        try:
            f.validate_structure_placeholders(candidate, protected.tokens, label)
            placeholder_outcomes[label] = "accepted"
        except ValueError:
            placeholder_outcomes[label] = "rejected"
    evidence["placeholderOutcomes"] = placeholder_outcomes
    if placeholder_outcomes != {"exact": "accepted", "reordered": "rejected", "duplicated": "rejected"}:
        failures.append(f"placeholder sequence/count contract failed: {placeholder_outcomes}")

    technical_tokens_source = (
        r"损失函数为 $L = \sum_{i=1}^{n}(y_i-\hat y_i)^2$，实现见 `loss_fn()`，"
        r"接口为 https://example.com/api/v2/items，数据见 doi:10.1234/abc.2024.7。"
    )
    technical_tokens = f.protect_structure_tokens(technical_tokens_source)
    token_type_values = set(technical_tokens.token_types.values())
    if not {"EQN", "CODE", "URL"}.issubset(token_type_values):
        failures.append(f"formula/code/URL spans were not protected as atomic tokens: {technical_tokens.token_types}")
    if f.restore_structure_tokens(technical_tokens.text, technical_tokens.tokens) != technical_tokens_source:
        failures.append("formula/code/URL token protection was not byte-reversible")

    for label, invalid_output, expected_error in (
        ("extra-number", factual_source + "模型额外提升10%。", "introduced or duplicated numbers"),
        ("extra-citation", factual_source + "该结论另见[9]。", "introduced or duplicated citation"),
    ):
        try:
            f.validate_chunk_output(factual_source, invalid_output, label)
        except ValueError as exc:
            if expected_error not in str(exc):
                failures.append(f"{label} raised the wrong guard: {exc}")
        else:
            failures.append(f"{label} was accepted")

    # 3. The prompt shown to the model uses the same placeholders as its input;
    # raw values must not leak from a separate relation card and get duplicated.
    captured_prompts: list[str] = []

    def identity_transform(input_text: str, prompt: str, _round: int, _chunk_id: str) -> str:
        captured_prompts.append(prompt)
        return input_text

    chunk = Chunk("p0_c0", 0, 0, factual_source, len(factual_source), 0)
    result = f._rewrite_round_chunk(
        index=1,
        chunk=chunk,
        round_number=1,
        normalized_prompt_profile="cn_custom",
        prompt_text="只做保守改写并保持事实。",
        transform=identity_transform,
        global_style_profile={},
        round_dimension=None,
    )
    if result.output_text != factual_source:
        failures.append("identity protected rewrite did not restore exact source")
    prompt = captured_prompts[0] if captured_prompts else ""
    if "91.2%" in prompt or "88.7%" in prompt or "[3]" in prompt or "[4]" in prompt:
        failures.append("raw protected values leaked into the prompt alongside placeholders")
    if not all(token in prompt for token in expected_tokens):
        failures.append("protected prompt did not contain all position-specific placeholders")

    # 4. Metric/value swaps are factual failures; equivalent wording is not.
    metric_source = "在同一测试集上，准确率为91.2%，召回率为88.7%，F1值为89.9%。"
    metric_ok = "同一测试集上的准确率达到91.2%，召回率为88.7%，F1值则为89.9%。"
    metric_swap = "在同一测试集上，召回率为91.2%，准确率为88.7%，F1值为89.9%。"
    if collect_factual_relation_issues(metric_source, metric_ok):
        failures.append("equivalent metric wording triggered a factual-relation false positive")
    swap_issues = collect_factual_relation_issues(metric_source, metric_swap)
    evidence["metricSwapIssueCodes"] = [item.get("code") for item in swap_issues]
    if not any(item.get("code") == "entity_order_changed" for item in swap_issues):
        failures.append("metric/value binding swap was not detected")

    # 5. Replacing a repeated technical noun with a clear pronoun is natural
    # and must not be rejected solely because the exact term count decreased.
    repeated_term_source = (
        "后端采用SpringBoot构建RESTful API，并负责校验请求参数。"
        "SpringBoot还负责事务提交和异常回滚，处理结果随后写入日志。"
        "这些步骤共同保证服务状态与数据库记录保持一致。"
    )
    repeated_term_output = (
        "后端采用SpringBoot构建RESTful API，并负责校验请求参数。"
        "该框架还负责事务提交和异常回滚，处理结果随后写入日志。"
        "这些步骤共同保证服务状态与数据库记录保持一致。"
    )
    try:
        f.validate_chunk_output(repeated_term_source, repeated_term_output, "term-reference")
    except ValueError as exc:
        failures.append(f"clear pronoun reference was blocked by protected-term count: {exc}")

    # 6. A concrete technical construction is not boilerplate and passes the
    # hard validator.  The style heuristic may advise; it must not veto it.
    concrete_source = (
        "系统借助缓存完成状态同步，服务随后校验请求并写入数据库。"
        "缓存仅保存尚未提交的中间状态，事务提交后立即清理。"
        "当写入失败时，服务回滚本次事务并记录错误原因。"
        "上述处理避免了重复提交，同时保持数据状态一致。"
    )
    concrete_output = concrete_source.replace("借助缓存完成", "通过缓存实现")
    try:
        f.validate_chunk_output(concrete_source, concrete_output, "concrete-frame")
    except ValueError as exc:
        failures.append(f"concrete '通过 X 实现 Y' wording was falsely rejected: {exc}")

    # 6b. A style issue labelled high by the collector must not fall through as
    # an advisory-only, default-exportable candidate at the density boundary.
    template_source = "。".join(
        [
            "该系统记录实验数据并保留原始参数",
            "研究人员按照既定流程完成测试",
            "结果表包含准确率和运行时间",
            "对照组采用相同的采样条件",
            "分析过程保持变量定义一致",
            "各项结论均来自本次实验",
            "相关材料可供后续复核",
        ]
    ) + "。"
    template_output = template_source.replace("相关材料可供后续复核", "相关材料具有重要意义")
    template_issues = f._collect_machine_style_validation_issues(template_source, template_output)
    if not any(
        issue.get("code") == "template_density_increased" and issue.get("level") == "high"
        for issue in template_issues
    ):
        failures.append(f"template density boundary did not emit its declared high issue: {template_issues}")
    template_quality = f._build_chunk_quality(template_source, template_output)
    if "machine_style_drift" not in (template_quality.get("flags") or []):
        failures.append("a declared high machine-style issue remained advisory-only")
    try:
        f.validate_chunk_output(template_source, template_output, "template-density-boundary")
    except ValueError as exc:
        if "template_density_increased" not in str(exc):
            failures.append(f"template density boundary raised the wrong hard error: {exc}")
    else:
        failures.append("a declared high template-density issue bypassed hard validation")

    # 7. Punctuation-only rhythm optimisation is never semantics-safe.
    paired = (
        "系统不仅减少了推理延迟，而且降低了显存占用。"
        "模型不仅保留局部特征，而且增强了全局表征。"
        "方法不仅改善召回率，而且维持了精确率。"
    )
    processed, process_report = deterministic_burstiness_postprocess(paired)
    if processed != paired or process_report.get("applied") is not False:
        failures.append("deterministic punctuation pass split a paired conjunction")

    # 8. Two meaningless fragments can inflate raw max/min, but must fail the
    # robust direction check rather than count as a successful rewrite.
    uniform = (
        "本研究提出一种新的分析方法用于识别关键影响因素。"
        "该方法结合公开数据开展模型参数估计与误差分析。"
        "实验结果验证该分析方法在测试任务中的有效性。"
        "模型在不同数据子集上保持相对稳定的预测表现。"
        "研究进一步讨论训练样本变化对最终结论的影响。"
    )
    gamed = "结论明确。结果清楚。" + uniform
    uniform_metrics = f._style_risk_metrics(uniform)
    gamed_metrics = f._style_risk_metrics(gamed)
    direction = f._assess_dimension_direction(
        uniform,
        gamed,
        {"id": "sentence_structure", "primaryMetric": "burstinessRatio"},
    )
    evidence["rhythmMetrics"] = {
        "beforeRobustRatio": uniform_metrics.get("burstinessRatio"),
        "afterRobustRatio": gamed_metrics.get("burstinessRatio"),
        "afterShortSentenceCount": gamed_metrics.get("shortSentenceCount"),
        "directionOk": direction.get("ok"),
    }
    if direction.get("ok") is not False or "过短" not in str(direction.get("note", "")):
        failures.append(f"short-fragment metric gaming was accepted: {direction}")

    # 9. Structural metadata is preserved while real prose remains rewritable.
    for metadata in ("摘要", "1. 引言", "2.1 系统设计", "关键词：深度学习；目标检测"):
        if not f.should_freeze_chunk("cn_custom", metadata):
            failures.append(f"structural metadata was sent through prose rewrite: {metadata}")
    if f.should_freeze_chunk("cn_custom", "该方法在公开数据集上完成验证，并保持稳定结果。"):
        failures.append("ordinary prose was incorrectly frozen")

    # 10. Active/default prompts stay identical and contain no metric quotas.
    prompt_names = ("prewrite.md", "rewrite-pass-1.md", "rewrite-pass-2.md", "classical-rewrite.md")
    prompt_corpus = ""
    for name in prompt_names:
        active = (ROOT_DIR / "prompts" / name).read_text(encoding="utf-8")
        default = (ROOT_DIR / "prompts" / "defaults" / name).read_text(encoding="utf-8")
        prompt_corpus += active
        if active != default:
            failures.append(f"active/default prompt drift: {name}")
    for quota in ("至少要有 2～3 个很短的句子", "最长句与最短句字数比应明显大于 2", "把 2～3 个简单陈述句改为"):
        if quota in prompt_corpus:
            failures.append(f"prompt still contains metric/syntax quota: {quota}")
    for safety_rule in ("不设置短句数量或句长比例", "不做虚构的“细节注入”", "不得插入无信息短句"):
        if safety_rule not in prompt_corpus:
            failures.append(f"prompt missing semantic-safety rule: {safety_rule}")

    return {"ok": not failures, "failures": failures, "evidence": evidence}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("rewrite_quality_regression: PASS")
        print(report["evidence"])
        return 0
    print("rewrite_quality_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    print(report["evidence"])
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
