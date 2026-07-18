#!/usr/bin/env python3
"""Regression for the semantic-safety post-process policy.

Sentence punctuation is part of meaning.  A parser-free comma-to-period pass
must never rewrite conditionals, paired conjunctions, lists, citations, or
ordinary prose merely to improve a sentence-length statistic.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from deterministic_postprocess import deterministic_burstiness_postprocess  # noqa: E402


CASES = {
    "paired_conjunction": (
        "系统不仅减少了推理延迟，而且降低了显存占用。"
        "模型不仅保留局部特征，而且增强了全局表征。"
        "方法不仅改善召回率，而且维持了精确率。"
    ),
    "conditional_clause": (
        "由于样本数量有限，模型未能充分收敛。"
        "如果标注噪声继续增加，实验结果仍会波动。"
        "虽然设备算力受限，但是训练设置保持不变。"
    ),
    "enumeration": (
        "流程包括采集、清洗和训练三个阶段。"
        "模块负责读取、校验和写入三项任务。"
        "实验覆盖精确率、召回率和F1值三个指标。"
    ),
    "citation_and_number": (
        "模型在公开数据集上的准确率为91.2%，详见表3和文献[8]。"
        "对照组的准确率为88.7%，差异在重复实验中保持稳定。"
        "训练共运行200轮，batch size固定为16。"
    ),
    "already_varied": "短段落保持完整。另一个句子包含更充分的限定条件和实验对象，因此长度自然更长。结果不变。",
    "empty": "",
}


def run_regression() -> dict[str, object]:
    failures: list[str] = []
    reports: dict[str, dict[str, object]] = {}
    for label, source in CASES.items():
        output, report = deterministic_burstiness_postprocess(source)
        reports[label] = report
        if output != source:
            failures.append(f"{label}: post-process changed text bytes")
        if report.get("applied") is not False:
            failures.append(f"{label}: non-mutating policy reported applied=True")
        if int(report.get("splitCount", -1)) != 0:
            failures.append(f"{label}: splitCount must remain zero")
        if "semantics-safe" not in str(report.get("reason", "")):
            failures.append(f"{label}: report did not explain semantic-safety policy")

    return {"ok": not failures, "failures": failures, "reports": reports}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("deterministic_postprocess_regression: PASS (byte-preserving semantic-safety policy)")
        return 0
    print("deterministic_postprocess_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
