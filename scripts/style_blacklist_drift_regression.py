#!/usr/bin/env python3
"""High-precision style-registry and prompt-alignment regression."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402
import style_blacklist_registry as r  # noqa: E402


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    pairs = [
        (f.MECHANICAL_CONNECTOR_RE, r.build_mechanical_connector_pattern()),
        (f.TEMPLATE_PHRASE_RE, r.build_template_phrase_pattern()),
        (f.EN_MECHANICAL_CONNECTOR_RE, r.build_en_mechanical_connector_pattern()),
        (f.EN_TEMPLATE_PHRASE_RE, r.build_en_template_phrase_pattern()),
        (f.AI_BURST_CONNECTOR_RE, r.build_ai_burst_connector_pattern()),
        (f.AI_ABSTRACT_PADDING_RE, r.build_ai_abstract_padding_pattern()),
        (f.GENERIC_CLOSING_RE, r.build_generic_closing_pattern()),
        (f.PASSIVE_VOICE_RE, r.build_passive_voice_pattern()),
        (f.CHENGYU_RE, r.build_chengyu_pattern()),
        (f.INTRODUCED_TEMPLATE_PHRASE_RE, r.build_introduced_template_phrase_pattern()),
        (f.NESTED_NUMBER_MARKER_RE, r.build_nested_number_marker_pattern()),
        (f.COLON_PARALLEL_RE, r.build_colon_parallel_pattern()),
    ]
    for compiled, expected in pairs:
        if compiled.pattern != expected:
            failures.append(f"compiled pattern drifted from registry: {compiled.pattern!r}")

    # High-confidence boilerplate should still be visible to diagnostics.
    for phrase in ("综上所述", "总而言之", "具有重要意义", "不言而喻", "举足轻重"):
        if not any(pattern.search(phrase) for pattern in (f.MECHANICAL_CONNECTOR_RE, f.TEMPLATE_PHRASE_RE, f.CHENGYU_RE)):
            failures.append(f"high-confidence boilerplate not covered: {phrase}")

    # Necessary logic and factual result wording must not be blacklisted.  A
    # rewrite system that penalises these terms can weaken or alter claims.
    for phrase in ("因此", "同时", "所以", "事实上", "显著提升", "显著提高", "大幅降低", "深入研究", "广泛应用"):
        if f.MECHANICAL_CONNECTOR_RE.fullmatch(phrase) or f.CHENGYU_RE.fullmatch(phrase):
            failures.append(f"ordinary logical/factual phrase was blacklisted: {phrase}")

    concrete = "系统通过缓存实现状态同步，并在事务提交后清理中间状态。"
    if f.TEMPLATE_PHRASE_RE.search(concrete):
        failures.append("productive technical construction '通过 X 实现 Y' was treated as boilerplate")

    prompt_texts = {
        path.name: path.read_text(encoding="utf-8")
        for path in sorted((ROOT_DIR / "prompts").glob("*.md"))
    }
    corpus = "\n".join(prompt_texts.values())
    for forbidden in (
        "至少要有 2～3 个很短的句子",
        "把 2～3 个简单陈述句改为",
        "细节注入与词汇句法冗余化",
        "最长句与最短句字数比应明显大于 2",
    ):
        if forbidden in corpus:
            failures.append(f"prompt still contains metric-gaming quota: {forbidden}")
    for required in ("不设置短句数量或句长比例", "不做虚构的“细节注入”", "不得插入无信息短句"):
        if required not in corpus:
            failures.append(f"prompt corpus missing semantic-safety instruction: {required}")

    for name in ("prewrite.md", "rewrite-pass-1.md", "rewrite-pass-2.md", "classical-rewrite.md"):
        default_text = (ROOT_DIR / "prompts" / "defaults" / name).read_text(encoding="utf-8")
        if prompt_texts.get(name) != default_text:
            failures.append(f"active/default prompt drift: {name}")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("style_blacklist_drift_regression: PASS")
        return 0
    print("style_blacklist_drift_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
