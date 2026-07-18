from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from factual_guards import (
    FACTUAL_SCOPE_QUALIFIER_CHANGED,
    collect_factual_relation_issues,
    extract_order_sensitive_entity_sequences,
)


ROOT_DIR = Path(__file__).resolve().parents[1]
REPORT_PATH = ROOT_DIR / "finish" / "regression" / "factual_guards_regression_report.json"


def main() -> int:
    failures: list[str] = []

    source = (
        "融合策略搜索阶段重点比较了 pred_only、feature_concat、score_sum、score_max 与 recon_only "
        "等多种异常评分方式。通过该阶段实验，本文确定 recon_only 是当前混合模型最有效的评分策略。"
        "此后，才将 Hybrid Attention-LSTM 与 recon_only 组合迁移到全部 81 个通道，"
        "并在随机种子 42、43、52 条件下进行三次独立重复实验。"
    )
    harmless_rephrasing = (
        "融合策略搜索阶段重点比较了 pred_only、feature_concat、score_sum、score_max 与 recon_only "
        "等多种异常评分方式。通过该阶段实验，本文确定 recon_only 是当前混合模型最有效的评分策略。"
        "此后，才把 recon_only 与 Hybrid Attention-LSTM 组合迁移到全部 81 个通道，"
        "并在随机种子 42、43、52 条件下进行三次独立重复实验。"
    )
    reordered_list = (
        "融合策略搜索阶段重点比较了 recon_only、score_max、score_sum、feature_concat 与 pred_only "
        "等多种异常评分方式。通过该阶段实验，本文确定 recon_only 是当前混合模型最有效的评分策略。"
        "此后，才将 Hybrid Attention-LSTM 与 recon_only 组合迁移到全部 81 个通道，"
        "并在随机种子 42、43、52 条件下进行三次独立重复实验。"
    )

    sequences = extract_order_sensitive_entity_sequences(source)
    if ["Hybrid Attention-LSTM", "recon_only"] in sequences:
        failures.append("weak two-entity association was incorrectly treated as a hard order lock")

    harmless_issues = collect_factual_relation_issues(source, harmless_rephrasing)
    if harmless_issues:
        failures.append(f"harmless two-entity rephrasing was blocked: {harmless_issues}")

    list_issues = collect_factual_relation_issues(source, reordered_list)
    if not any(issue.get("code") == "entity_order_changed" for issue in list_issues):
        failures.append("real multi-item list reorder was not detected")

    channel_source = (
        "结果表明，Hybrid 方案在 M-2、P-4、P-11、D-16 与 P-3 等通道的提升幅度较大；"
        "与此同时，在 E-6、M-7、G-7、E-7 与 F-3 等通道上也出现了较明显回退。"
        "随后在全部 81 个通道，并在随机种子 42、43、52 条件下进行三次独立重复实验。"
    )
    channel_output = (
        "结果表明，Hybrid 方案在 M-2、P-4、P-11、D-16 以及 P-3 等通道上提升更明显；"
        "与此同时，在 E-6、M-7、G-7、E-7 以及 F-3 等通道上也存在较明显回退。"
        "随后迁移到全部 81 个通道，并在随机种子 42、43、52 条件下开展三次独立重复实验。"
    )
    channel_issues = collect_factual_relation_issues(channel_source, channel_output)
    if channel_issues:
        failures.append(f"channel identifiers were incorrectly treated as standalone numeric order: {channel_issues}")

    api_source = (
        "（2）发送请求：通过OkHttpClient向文心一言API端点"
        "`https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions`"
        "发送POST请求，请求头中包含`Content-Type: application/json`及认证Token，请求体为JSON格式的消息数组。"
    )
    api_output = (
        "(2) 发送请求：运用OkHttpClient来向文心一言API端点"
        "`https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/completions`"
        "去发送一个POST请求，请求头当中包含了`Content-Type: application/json`以及认证Token，请求体的格式是JSON消息数组。"
    )
    api_issues = collect_factual_relation_issues(api_source, api_output)
    if api_issues:
        failures.append(f"API endpoint rewrite was incorrectly blocked by factual relation guard: {api_issues}")

    repeated_api_source = (
        "后端使用SpringBoot框架，能快速构建RESTful API，简化开发；前端采用Vue.js，组件化开发模式清晰高效。"
        "在AI能力方面，系统调用百度的文心一言API，其接口文档完善、调用方式标准（RESTful API），开发者只需通过HTTP请求即可集成。"
    )
    repeated_api_output = (
        "后端方面运用SpringBoot框架，能够快速开展RESTful API的构建工作，进而简化开发过程；前端则选用Vue.js，组件化开发模式比较清晰并且高效。"
        "在AI能力方面，系统调用百度的文心一言API，它的接口文档比较完善，调用方式标准即RESTful API，开发者只需借助HTTP请求就可以完成集成。"
    )
    repeated_api_issues = collect_factual_relation_issues(repeated_api_source, repeated_api_output)
    if repeated_api_issues:
        failures.append(f"Repeated API term positions caused a false order failure: {repeated_api_issues}")

    metric_source = "在相同测试集上，模型的准确率为91.2%，召回率为88.7%，F1值为89.9%。"
    metric_rephrasing = "在同一测试集上，模型准确率达到91.2%，召回率为88.7%，F1值则为89.9%。"
    metric_swapped = "在相同测试集上，模型的召回率为91.2%，准确率为88.7%，F1值为89.9%。"
    metric_rephrasing_issues = collect_factual_relation_issues(metric_source, metric_rephrasing)
    if metric_rephrasing_issues:
        failures.append(f"equivalent metric wording was incorrectly blocked: {metric_rephrasing_issues}")
    metric_swap_issues = collect_factual_relation_issues(metric_source, metric_swapped)
    if not any(issue.get("code") == "entity_order_changed" for issue in metric_swap_issues):
        failures.append("metric/value binding swap was not detected")

    negation_source = "该结论并非说明模型A在所有数据集上都优于模型B。"
    negation_rephrasing = "这并不表示模型A在所有数据集上的表现都优于模型B。"
    negation_removed = "该结论说明模型A在所有数据集上的表现都优于模型B。"
    negation_rephrasing_issues = collect_factual_relation_issues(negation_source, negation_rephrasing)
    if negation_rephrasing_issues:
        failures.append(f"equivalent negation wording was incorrectly blocked: {negation_rephrasing_issues}")
    negation_removed_issues = collect_factual_relation_issues(negation_source, negation_removed)
    if not any(issue.get("code") == "negation_scope_removed" for issue in negation_removed_issues):
        failures.append("complete removal of source negation was not detected")
    not_only_issues = collect_factual_relation_issues(
        "系统不仅校验签名，而且核对版本号。",
        "系统不仅核对签名，而且检查版本号。",
    )
    if not_only_issues:
        failures.append(f"the non-negative construction '不仅' was misclassified: {not_only_issues}")

    v12_scope_source = "系统采用模块化设计，对外留出接口函数，供后续组件调用。"
    v12_scope_candidate = "系统采用模块化设计，对外仅留接口函数，供后续组件调用。"
    v12_scope_issues = collect_factual_relation_issues(v12_scope_source, v12_scope_candidate)
    if not any(issue.get("code") == FACTUAL_SCOPE_QUALIFIER_CHANGED for issue in v12_scope_issues):
        failures.append("v12 exclusivity insertion was not rejected")

    removed_scope_issues = collect_factual_relation_issues(
        "系统仅向通过审核的模块开放接口函数。",
        "系统向通过审核的模块开放接口函数。",
    )
    if not any(issue.get("code") == FACTUAL_SCOPE_QUALIFIER_CHANGED for issue in removed_scope_issues):
        failures.append("source exclusivity deletion was not rejected")

    preserved_scope_issues = collect_factual_relation_issues(
        "开发者只需通过HTTP请求即可完成集成；只要签名有效，请求就会进入队列。",
        "开发者只需借助HTTP请求完成集成；只要签名有效，请求便会进入队列。",
    )
    if preserved_scope_issues:
        failures.append(f"preserved 只需/只要 scope was incorrectly rejected: {preserved_scope_issues}")

    synonymous_scope_issues = collect_factual_relation_issues(
        "第三组实验只调整缓存容量，其余参数保持不变。",
        "第三组实验仅改变缓存容量，其余参数保持不变。",
    )
    if synonymous_scope_issues:
        failures.append(f"same-class 只/仅 replacement was incorrectly rejected: {synonymous_scope_issues}")

    ordinary_lexical_issues = collect_factual_relation_issues(
        "系统对外留出接口函数，便于后续模块调用。",
        "系统向外部保留接口函数，方便后续组件调用。",
    )
    if ordinary_lexical_issues:
        failures.append(f"ordinary lexical rewrite was incorrectly rejected: {ordinary_lexical_issues}")

    lexical_false_positive_issues = collect_factual_relation_issues(
        "研究记录了三只机械臂、两艘船只的平均值与均值。",
        "研究汇总了三只机械臂、两艘船只的平均值和均值。",
    )
    if lexical_false_positive_issues:
        failures.append(f"classifier/lexical 只 or 均 was misclassified: {lexical_false_positive_issues}")

    qualifier_addition_cases = {
        "totality": ("实验结果来自公开数据。", "全部实验结果均来自公开数据。"),
        "any": ("该接口不接受外部输入。", "该接口不接受任何外部输入。"),
        "uniform": ("异常任务由人工复核。", "异常任务一律由人工复核。"),
        "certainty": ("该变化会导致误差增大。", "该变化必然导致误差增大。"),
        "uniqueness": ("缓存容量是本轮调整变量。", "缓存容量是本轮唯一调整变量。"),
    }
    qualifier_addition_codes: dict[str, list[str]] = {}
    for label, (case_source, case_output) in qualifier_addition_cases.items():
        case_issues = collect_factual_relation_issues(case_source, case_output)
        case_codes = [str(issue.get("code", "")) for issue in case_issues]
        qualifier_addition_codes[label] = case_codes
        if FACTUAL_SCOPE_QUALIFIER_CHANGED not in case_codes:
            failures.append(f"{label} scope insertion was not rejected: {case_issues}")

    english_scope_cases = {
        "exclusive": ("The service exposes an interface to external modules.", "The service only exposes an interface to external modules."),
        "totality": ("The samples passed validation.", "All samples passed validation."),
        "every": ("The request is checked before dispatch.", "Every request is checked before dispatch."),
        "any": ("The endpoint rejects external input.", "The endpoint rejects any external input."),
        "certainty": ("This change increases the error.", "This change necessarily increases the error."),
        "always": ("The cache records the status.", "The cache always records the status."),
    }
    english_scope_codes: dict[str, list[str]] = {}
    for label, (case_source, case_output) in english_scope_cases.items():
        case_issues = collect_factual_relation_issues(case_source, case_output)
        case_codes = [str(issue.get("code", "")) for issue in case_issues]
        english_scope_codes[label] = case_codes
        if FACTUAL_SCOPE_QUALIFIER_CHANGED not in case_codes:
            failures.append(f"English {label} scope insertion was not rejected: {case_issues}")

    english_removed_issues = collect_factual_relation_issues(
        "The module only exposes the audited interface.",
        "The module exposes the audited interface.",
    )
    if not any(issue.get("code") == FACTUAL_SCOPE_QUALIFIER_CHANGED for issue in english_removed_issues):
        failures.append("English exclusivity deletion was not rejected")

    english_preserved_issues = collect_factual_relation_issues(
        "The module only exposes the audited interface, and every request is logged.",
        "The module solely exposes the audited interface; all requests are logged.",
    )
    if english_preserved_issues:
        failures.append(f"same-class English qualifier preservation was rejected: {english_preserved_issues}")

    english_substring_issues = collect_factual_relation_issues(
        "The overall alloy analysis covers anyone in the small cohort.",
        "The overall alloy study includes anyone in the small cohort.",
    )
    if english_substring_issues:
        failures.append(f"ordinary English qualifier substrings were misclassified: {english_substring_issues}")

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(REPORT_PATH),
        "failures": failures,
        "sequences": sequences,
        "harmlessIssues": harmless_issues,
        "listIssues": list_issues,
        "channelIssues": channel_issues,
        "apiIssues": api_issues,
        "repeatedApiIssues": repeated_api_issues,
        "metricRephrasingIssues": metric_rephrasing_issues,
        "metricSwapIssues": metric_swap_issues,
        "negationRephrasingIssues": negation_rephrasing_issues,
        "negationRemovedIssues": negation_removed_issues,
        "notOnlyIssues": not_only_issues,
        "v12ScopeIssueCodes": [str(issue.get("code", "")) for issue in v12_scope_issues],
        "removedScopeIssueCodes": [str(issue.get("code", "")) for issue in removed_scope_issues],
        "preservedScopeIssueCodes": [str(issue.get("code", "")) for issue in preserved_scope_issues],
        "synonymousScopeIssueCodes": [str(issue.get("code", "")) for issue in synonymous_scope_issues],
        "ordinaryLexicalIssueCodes": [str(issue.get("code", "")) for issue in ordinary_lexical_issues],
        "lexicalFalsePositiveIssueCodes": [str(issue.get("code", "")) for issue in lexical_false_positive_issues],
        "qualifierAdditionCodes": qualifier_addition_codes,
        "englishScopeCodes": english_scope_codes,
        "englishRemovedIssueCodes": [str(issue.get("code", "")) for issue in english_removed_issues],
        "englishPreservedIssueCodes": [str(issue.get("code", "")) for issue in english_preserved_issues],
        "englishSubstringIssueCodes": [str(issue.get("code", "")) for issue in english_substring_issues],
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
