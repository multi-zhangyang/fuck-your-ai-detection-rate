from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from factual_guards import collect_factual_relation_issues, extract_order_sensitive_entity_sequences


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

    report = {
        "ok": not failures,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "reportPath": str(REPORT_PATH),
        "failures": failures,
        "sequences": sequences,
        "harmlessIssues": harmless_issues,
        "listIssues": list_issues,
        "channelIssues": channel_issues,
    }
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
