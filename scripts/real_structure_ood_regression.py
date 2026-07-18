#!/usr/bin/env python3
"""Optional real-provider tests + offline synthetic structure-frame checks.

The historical filename is kept for runner compatibility.  Structure metrics
are observations only.  One synthetic sample contains a genuinely repetitive
surface frame; the other contains necessary contrast/negation that must not be
removed merely to reduce connector counts.  Normal budget is two completions,
with a bounded maximum of four through validation repair.

When FYADR_RUN_REAL_LLM is unset, the offline branch still verifies that a
non-gaming surface-frame rewrite lowers plain_active concentration on a
high-plain input, while short-fragment gaming is rejected by direction checks.
"""

from __future__ import annotations

import json
import shutil
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402
from real_quality_contract import (  # noqa: E402
    assess_conservative_edit,
    describe_external_unavailability,
    is_external_unavailability,
    real_calls_enabled,
    resolve_provider,
    run_real_round,
)


REPETITIVE_SAMPLE = (
    "该方法在数据集D1上的F1值为87.6%。该方法在数据集D2上的F1值为84.3%。"
    "该方法使用AdamW优化器。该方法将学习率设为0.0003。"
    "该方法不包含测试集标签信息[7]。该方法只处理已经匿名化的合成样本。"
)
REPETITIVE_LITERALS = ("D1", "D2", "F1", "87.6%", "84.3%", "AdamW", "0.0003", "[7]")

LOGIC_SAMPLE = (
    "虽然缓存命中率达到96.0%，但是系统仍未关闭一致性校验，因为离线写入可能产生旧版本数据。"
    "只有当版本号V2.4与服务端记录一致时，请求才允许提交[8]。"
    "该结论不表示所有网络条件下的延迟都会下降。"
)
LOGIC_LITERALS = ("96.0%", "V2.4", "[8]")

# High plain_active concentration fixture (8 sentences, same opening frame).
HIGH_PLAIN_INPUT = (
    "该方法在数据集一上保持稳定。"
    "该方法在数据集二上保持稳定。"
    "该方法在数据集三上保持稳定。"
    "该方法在数据集四上保持稳定。"
    "该方法在数据集五上保持稳定。"
    "该方法在数据集六上保持稳定。"
    "该方法在数据集七上保持稳定。"
    "该方法在数据集八上保持稳定。"
)

# Non-gaming rewrite: same facts, varied openings / complete clauses, no ≤6-char fragments.
# subordinate_lead + plain mix lowers concentration without short-sentence gaming.
HIGH_PLAIN_NATURAL_REWRITE = (
    "在数据集一上，该方法保持稳定。"
    "数据集二的结果同样稳定。"
    "当切换到数据集三时，该方法仍保持稳定。"
    "数据集四上的表现保持稳定。"
    "若输入来自数据集五，该方法保持稳定。"
    "数据集六上同样观察到稳定表现。"
    "在数据集七条件下，该方法保持稳定。"
    "数据集八的结果保持稳定。"
)

# Gaming rewrite: prepend meaningless fragments to inflate raw length ratio.
HIGH_PLAIN_GAMING_REWRITE = (
    "短。结论明确。"
    + HIGH_PLAIN_INPUT
)

STRUCTURE_DIM = {
    "id": "sentence_structure",
    "label": "句法与节奏",
    "primaryMetric": "burstinessRatio",
    "secondaryMetric": "structureConcentration",
}


def _run_offline_structure_checks() -> dict[str, object]:
    """Offline synthetic path: concentration drop without fragment gaming."""
    failures: list[str] = []

    input_metrics = f._style_risk_metrics(HIGH_PLAIN_INPUT)
    natural_metrics = f._style_risk_metrics(HIGH_PLAIN_NATURAL_REWRITE)
    gaming_metrics = f._style_risk_metrics(HIGH_PLAIN_GAMING_REWRITE)

    input_conc = float(input_metrics.get("structureConcentration", 0) or 0)
    natural_conc = float(natural_metrics.get("structureConcentration", 0) or 0)
    if input_conc < 0.85:
        failures.append(f"high-plain fixture not concentrated enough: {input_metrics}")
    if str(input_metrics.get("dominantStructureType", "")) not in ("plain_active", "enumerative"):
        failures.append(f"high-plain fixture dominant type unexpected: {input_metrics}")
    if natural_conc >= input_conc:
        failures.append(
            f"natural non-gaming rewrite should lower structureConcentration "
            f"({input_conc} -> {natural_conc})"
        )
    if natural_conc >= 0.85 and str(natural_metrics.get("dominantStructureType", "")) in (
        "plain_active",
        "enumerative",
    ):
        failures.append(
            f"natural rewrite still concentrated in plain/enumerative: {natural_metrics}"
        )

    # Short-fragment gaming must be rejected by direction (or raise fragment risk),
    # not accepted as a successful structure/rhythm rewrite.
    gaming_direction = f._assess_dimension_direction(
        HIGH_PLAIN_INPUT, HIGH_PLAIN_GAMING_REWRITE, STRUCTURE_DIM
    )
    gaming_short = int(gaming_metrics.get("shortSentenceCount", 0) or 0)
    input_short = int(input_metrics.get("shortSentenceCount", 0) or 0)
    gaming_risks = [
        str(item.get("code")) for item in f._assess_machine_like_risks(HIGH_PLAIN_GAMING_REWRITE)
    ]
    gaming_flagged = (
        gaming_direction.get("ok") is False
        or "sentence_fragment_gaming" in gaming_risks
        or (gaming_short >= input_short + 2 and float(gaming_metrics.get("shortSentenceRate", 0) or 0) >= 0.20)
    )
    if not gaming_flagged:
        failures.append(
            f"short-fragment gaming was not flagged: direction={gaming_direction}, "
            f"risks={gaming_risks}, short={gaming_short}"
        )
    # Natural rewrite must not introduce fragment gaming.
    natural_short = int(natural_metrics.get("shortSentenceCount", 0) or 0)
    natural_risks = [
        str(item.get("code")) for item in f._assess_machine_like_risks(HIGH_PLAIN_NATURAL_REWRITE)
    ]
    if "sentence_fragment_gaming" in natural_risks or natural_short >= 2:
        failures.append(
            f"natural rewrite incorrectly looks like fragment gaming: "
            f"short={natural_short}, risks={natural_risks}"
        )

    # Prompt self-check targets (advisory, not hard quotas) must be present in pass-1.
    pass1 = (ROOT_DIR / "prompts" / "rewrite-pass-1.md").read_text(encoding="utf-8")
    for required in (
        "P90",
        "P10",
        "表层框架",
        "不设置短句数量或句长比例",
        "不得插入无信息短句",
        "成对结构",
    ):
        if required not in pass1:
            failures.append(f"rewrite-pass-1.md missing actionable self-check target: {required}")
    for forbidden in (
        "至少要有 2～3 个很短的句子",
        "最长句与最短句字数比应明显大于 2",
        "把 2～3 个简单陈述句改为",
    ):
        if forbidden in pass1:
            failures.append(f"rewrite-pass-1.md reintroduced metric-gaming quota: {forbidden}")

    # Active/default parity for structure-length self-check files.
    for name in ("rewrite-pass-1.md", "prewrite.md"):
        active = (ROOT_DIR / "prompts" / name).read_text(encoding="utf-8")
        default = (ROOT_DIR / "prompts" / "defaults" / name).read_text(encoding="utf-8")
        if active != default:
            failures.append(f"active/default prompt drift: {name}")

    return {
        "ok": not failures,
        "failures": failures,
        "inputConcentration": input_conc,
        "naturalConcentration": natural_conc,
        "gamingShortSentenceCount": gaming_short,
        "gamingDirectionOk": gaming_direction.get("ok"),
        "structureMetricUse": "diagnostic-only; offline synthetic concentration drop without fragment gaming",
    }


def run_regression() -> dict[str, object]:
    offline = _run_offline_structure_checks()
    if not offline.get("ok"):
        return {
            "ok": False,
            "skipped": False,
            "failures": offline.get("failures", []),
            "offline": offline,
        }

    if not real_calls_enabled():
        return {
            "ok": True,
            "skipped": True,
            "reason": "set FYADR_RUN_REAL_LLM=1 to allow synthetic provider calls",
            "offline": offline,
        }
    provider = resolve_provider()
    if provider is None:
        return {
            "ok": True,
            "skipped": True,
            "reason": "no real provider configured",
            "offline": offline,
        }

    tmpdir = Path(tempfile.mkdtemp(prefix="fyadr_real_structure_quality_"))
    try:
        try:
            repetitive = run_real_round(
                tmpdir,
                case_id="repeated-frame",
                round_number=2,
                input_text=REPETITIVE_SAMPLE,
                provider=provider,
            )
            logic = run_real_round(
                tmpdir,
                case_id="necessary-logic",
                round_number=3,
                input_text=LOGIC_SAMPLE,
                provider=provider,
            )
        except Exception as error:
            if is_external_unavailability(error):
                return {
                    "ok": True,
                    "skipped": True,
                    "reason": f"provider temporarily unavailable: {describe_external_unavailability(error)}",
                    "offline": offline,
                }
            return {
                "ok": False,
                "skipped": False,
                "failures": [f"real pipeline failed: {error}"],
                "offline": offline,
            }

        repeated_assessment = assess_conservative_edit(
            REPETITIVE_SAMPLE,
            str(repetitive["output"]),
            required_literals=REPETITIVE_LITERALS,
        )
        logic_assessment = assess_conservative_edit(
            LOGIC_SAMPLE,
            str(logic["output"]),
            required_literals=LOGIC_LITERALS,
            require_change=False,
        )
        failures = [f"repeated-frame sample: {item}" for item in repeated_assessment["failures"]]
        failures.extend(f"necessary-logic sample: {item}" for item in logic_assessment["failures"])
        return {
            "ok": not failures,
            "skipped": False,
            "failures": failures,
            "completionBudget": {"normal": 2, "maximumWithValidationRepair": 4, "transportRetries": 0},
            "structureMetricUse": "diagnostic-only; no required direction or target type",
            "repeatedFrame": repeated_assessment,
            "necessaryLogic": logic_assessment,
            "offline": offline,
        }
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def main() -> int:
    report = run_regression()
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
