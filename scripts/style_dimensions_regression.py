#!/usr/bin/env python3
"""Regression for conservative, advisory style/readability metrics.

Locks passive-density, content-light idiom density, and robust sentence-length
spread fields.  These are editing hints, not authorship detectors and not hard
validation gates, so the regression asserts diagnostics rather than acceptance.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import fyadr_round_service as f  # noqa: E402


def _risk_codes(text: str) -> list[str]:
    return [str(r.get("code")) for r in f._assess_machine_like_risks(text)]


def run_regression() -> dict[str, object]:
    failures: list[str] = []

    # --- passive-voice density (covers 被字句 WITHOUT 了/过 too) ---
    passive_text = "该问题被解决了，并予以重视，受到广泛关注，加以改进，为学界所接受，得以实施。这至关重要，不言而喻。"
    pm = f._style_risk_metrics(passive_text)
    if int(pm.get("passiveVoiceCount", 0)) < 5:
        failures.append(f"passive count too low: {pm.get('passiveVoiceCount')}")
    if "passive_voice_overuse" not in _risk_codes(passive_text):
        failures.append("passive_voice_overuse risk not raised on dense passive text")
    # 被字句 without 了/过 must still be detected (real-world AI passive sentences
    # often lack 了/过: "该方法被应用于多个数据集上进行验证。").
    bare_passive = "该方法被应用于多个数据集上进行验证。该模型被进一步提升和优化。该结论被广泛接受并加以推广。"
    bpm = f._style_risk_metrics(bare_passive)
    if int(bpm.get("passiveVoiceCount", 0)) < 3:
        failures.append(f"bare 被字句 (no 了/过) under-detected: {bpm.get('passiveVoiceCount')}")
    # 被后接英文(如引述作者) must NOT be flagged as passive: 被 + Latin = not a 被字句.
    en_after_bei = "该问题被Smith(2020)首次提出。"
    if int(f._style_risk_metrics(en_after_bei).get("passiveVoiceCount", 0)) != 0:
        failures.append("被动正则误把 '被+英文' 当成被字句")

    # --- chengyu density ---
    chengyu_text = "这至关重要，不言而喻，举足轻重，相辅相成，显而易见，日益完善，蓬勃发展。结论是结果很好。结论是结果很好。"
    cm = f._style_risk_metrics(chengyu_text)
    if int(cm.get("chengyuCount", 0)) < 5:
        failures.append(f"chengyu count too low: {cm.get('chengyuCount')}")
    if "chengyu_density_high" not in _risk_codes(chengyu_text):
        failures.append("chengyu_density_high risk not raised on dense chengyu text")

    # --- burstiness ratio: uniform short sentences → low ratio ---
    uniform = "。".join(["这是结果很好的结论"] * 6) + "。"
    um = f._style_risk_metrics(uniform)
    br = float(um.get("burstinessRatio", 0) or 0)
    if br >= 2.0:
        failures.append(f"uniform sentences should have low burstiness ratio, got {br}")
    if "low_burstiness_ratio" not in _risk_codes(uniform):
        failures.append("low_burstiness_ratio risk not raised on uniform short sentences")

    # --- varied sentences → high burstiness, no low_burstiness risk ---
    varied = "短。这是一个明显更长的中等长度句子用于拉开长度。短。又是另一个相当长的句子来制造句长差异。短。"
    vm = f._style_risk_metrics(varied)
    if "low_burstiness_ratio" in _risk_codes(varied):
        failures.append("low_burstiness_ratio should NOT be raised on varied sentences")

    # --- connector threshold and convergence must use the same boundary ---
    # Five sentences with exactly two registered connectors -> density 0.40.
    # RateAudit flags 0.40, so an unchanged 0.40 -> 0.40 rewrite cannot be
    # called already-satisfied or improved by the direction evaluator.
    connector_boundary = (
        "首先，系统记录第一组实验的完整参数与误差范围。"
        "其次，研究人员核对第二组样本的标签和来源信息。"
        "第三句说明模型在公开测试集上的实际表现与限制。"
        "第四句保留部署环境中的内存开销和响应时间。"
        "第五句列出仍需人工确认的异常样本和边界条件。"
    )
    boundary_metrics = f._style_risk_metrics(connector_boundary)
    if float(boundary_metrics.get("connectorDensity", 0) or 0) != f.CONNECTOR_DENSITY_RISK_THRESHOLD:
        failures.append(f"connector boundary fixture drifted: {boundary_metrics}")
    if "connector_overuse" not in _risk_codes(connector_boundary):
        failures.append("connector_overuse must fire at the exact 0.40 public threshold")
    connector_dimension = {
        "id": "connector_detail",
        "primaryMetric": "connectorDensity",
        "secondaryMetric": "burstConnectorDensity",
    }
    unchanged_direction = f._assess_dimension_direction(
        connector_boundary,
        connector_boundary,
        connector_dimension,
    )
    if unchanged_direction.get("ok") is not False or unchanged_direction.get("satisfied") is not False:
        failures.append(
            "unchanged connectorDensity 0.40 -> 0.40 was falsely accepted: "
            f"{unchanged_direction}"
        )
    if "connector_overuse" not in list(unchanged_direction.get("riskCodesAfter") or []):
        failures.append(f"direction payload lost the still-active connector risk: {unchanged_direction}")

    # --- metric keys present ---
    for key in (
        "passiveDensity",
        "chengyuDensity",
        "burstinessRatio",
        "paragraphLengthCv",
        "adjacentParagraphUniformity",
        "nestedNumberDensity",
        "colonParallelDensity",
    ):
        if key not in f._style_risk_metrics("一段普通正文，信息密度正常。第二句也正常。"):
            failures.append(f"missing metric key: {key}")

    # --- nested numbered-list + colon-semicolon parallel scaffolds ---
    nested_text = (
        "该方法包含（1）数据预处理，（2）特征提取，（3）模型训练，（4）结果验证。"
        "此外还有(1)基线对比和(2)消融实验。"
    )
    nm = f._style_risk_metrics(nested_text)
    if int(nm.get("nestedNumberCount", 0) or 0) < 3:
        failures.append(f"nested number markers under-detected: {nm.get('nestedNumberCount')}")
    if "nested_number_scaffold" not in _risk_codes(nested_text):
        failures.append("nested_number_scaffold risk not raised on dense nested numbered lists")
    # Full-width only sequence should also count.
    fw_nested = "步骤包括（一）采样；（二）清洗；（三）标注；最后再做验证。"
    if int(f._style_risk_metrics(fw_nested).get("nestedNumberCount", 0) or 0) < 3:
        failures.append("full-width nested number markers under-detected")
    # Sparse single marker must not raise the risk.
    sparse_nested = "文中仅引用公式（1）作为对照。后续实验不再展开编号。"
    if "nested_number_scaffold" in _risk_codes(sparse_nested):
        failures.append("nested_number_scaffold should not fire on a single legitimate marker")

    colon_text = "性能表现：精度提升；召回稳定；延迟下降。第二组同样给出：速度；内存；功耗。"
    cm_colon = f._style_risk_metrics(colon_text)
    if int(cm_colon.get("colonParallelCount", 0) or 0) < 1:
        failures.append(f"colon-parallel template under-detected: {cm_colon.get('colonParallelCount')}")
    if "colon_parallel_scaffold" not in _risk_codes(colon_text):
        failures.append("colon_parallel_scaffold risk not raised on X：A；B；C templates")
    # Ordinary colon without multi-item semicolon list must stay silent.
    ordinary_colon = "结论：该方法在三个公开数据集上均有效，且误差分布更稳定。"
    if "colon_parallel_scaffold" in _risk_codes(ordinary_colon):
        failures.append("colon_parallel_scaffold should not fire on ordinary colon statements")

    # Introduced density: source without scaffolds, output adds them → advisory issue.
    plain_source = (
        "本文先做数据清洗，再提取特征，随后完成训练与验证。"
        "实验对比了基线与消融设置，并报告了精度与延迟。"
        "结果说明该方法在公开数据集上可用，误差分布也更加稳定。"
        "后续工作仍聚焦公开基准与可复现配置。"
    )
    scaffold_output = (
        "本文步骤为（1）数据清洗，（2）特征提取，（3）模型训练，（4）结果验证。"
        "性能表现：精度提升；召回稳定；延迟下降。"
        "此外补充(1)基线对比与(2)消融实验，并报告公开数据集上的稳定性。"
        "后续工作仍聚焦公开基准与可复现配置。"
    )
    issues = f._collect_machine_style_validation_issues(plain_source, scaffold_output)
    issue_codes = [str(item.get("code")) for item in issues]
    if "nested_number_scaffold_introduced" not in issue_codes:
        failures.append(f"introduced nested-number scaffold not flagged: {issue_codes}")
    if "colon_parallel_scaffold_introduced" not in issue_codes:
        failures.append(f"introduced colon-parallel scaffold not flagged: {issue_codes}")
    # Preserve source enumerations: same scaffolds already in input → no introduced issue.
    preserve_issues = f._collect_machine_style_validation_issues(scaffold_output, scaffold_output)
    preserve_codes = [str(item.get("code")) for item in preserve_issues]
    if "nested_number_scaffold_introduced" in preserve_codes or "colon_parallel_scaffold_introduced" in preserve_codes:
        failures.append(f"pre-existing academic enumerations should not be treated as introduced: {preserve_codes}")
    cq_scaffold = f._build_chunk_quality(plain_source, scaffold_output)
    risk_codes = [str(r.get("code")) for r in cq_scaffold.get("machineLikeRisks", [])]
    if "nested_number_scaffold" not in risk_codes and "colon_parallel_scaffold" not in risk_codes:
        failures.append(f"_build_chunk_quality missing scaffold risks: {risk_codes}")
    advisory = list(cq_scaffold.get("advisoryFlags") or [])
    if "nested_number_scaffold" not in advisory and "colon_parallel_scaffold" not in advisory:
        failures.append(f"_build_chunk_quality missing scaffold advisory flags: {advisory}")
    sm_scaffold = cq_scaffold.get("styleMetrics") if isinstance(cq_scaffold.get("styleMetrics"), dict) else {}
    for key in ("nestedNumberDensity", "colonParallelDensity"):
        if key not in sm_scaffold:
            failures.append(f"_build_chunk_quality styleMetrics missing {key}: {sm_scaffold}")

    # --- english text: cn-only metrics zeroed ---
    en = "This is a normal English sentence. Another sentence follows here."
    em = f._style_risk_metrics(en)
    if int(em.get("passiveVoiceCount", 0)) != 0 or int(em.get("chengyuCount", 0)) != 0:
        failures.append(f"cn-only metrics should be 0 on english, got passive={em.get('passiveVoiceCount')} chengyu={em.get('chengyuCount')}")
    if int(em.get("nestedNumberCount", 0) or 0) != 0 or int(em.get("colonParallelCount", 0) or 0) != 0:
        failures.append(
            "cn-only scaffold metrics should be 0 on english, "
            f"got nested={em.get('nestedNumberCount')} colon={em.get('colonParallelCount')}"
        )

    # --- paragraph length symmetry: equal multi-paragraph lengths → low CV + high uniformity ---
    equal_para = "这是一段长度刻意对齐的测试段落用于对称信号。"
    uniform_paragraphs = "\n\n".join([equal_para] * 3)
    upm = f._style_risk_metrics(uniform_paragraphs)
    up_cv = float(upm.get("paragraphLengthCv", 1) if upm.get("paragraphLengthCv") is not None else 1)
    up_uni = float(upm.get("adjacentParagraphUniformity", 0) if upm.get("adjacentParagraphUniformity") is not None else 0)
    if int(upm.get("paragraphCount", 0) or 0) != 3:
        failures.append(f"uniform paragraphs should count as 3, got {upm.get('paragraphCount')}")
    if up_cv >= 0.12:
        failures.append(f"equal paragraphs should have low CV, got {up_cv}")
    if up_uni < 0.85:
        failures.append(f"equal paragraphs should have high adjacent uniformity, got {up_uni}")
    if "paragraph_length_symmetry" not in _risk_codes(uniform_paragraphs):
        failures.append("paragraph_length_symmetry risk not raised on equal multi-paragraph text")
    # Varied paragraph lengths should not fire the symmetry risk.
    varied_paragraphs = (
        "短段。\n\n"
        "这是一段明显更长的中等长度段落，用来拉开相邻自然段的字符规模，使段长不再整齐划一。\n\n"
        "再补一段更长的说明：实验设置、误差来源和对比基线都写在这里，长度显著超过前两段，CV 应抬高。"
    )
    vpm = f._style_risk_metrics(varied_paragraphs)
    if "paragraph_length_symmetry" in _risk_codes(varied_paragraphs):
        failures.append("paragraph_length_symmetry should NOT fire on varied paragraph lengths")
    if float(vpm.get("paragraphLengthCv", 0) or 0) < 0.12:
        failures.append(f"varied paragraphs should have higher CV, got {vpm.get('paragraphLengthCv')}")
    # Single-paragraph / two-paragraph chunks must stay silent (n>=3 gate).
    two_paragraphs = f"{equal_para}\n\n{equal_para}"
    if "paragraph_length_symmetry" in _risk_codes(two_paragraphs):
        failures.append("paragraph_length_symmetry must not fire when paragraphCount < 3")
    if "paragraph_length_symmetry" in _risk_codes(equal_para):
        failures.append("paragraph_length_symmetry must not fire on single-paragraph chunks")
    # Rewrite advice must forbid merge/split when symmetry risk fires.
    cq_para = f._build_chunk_quality(uniform_paragraphs, uniform_paragraphs)
    if "paragraph_length_symmetry" not in [str(r.get("code")) for r in cq_para.get("machineLikeRisks", [])]:
        failures.append("_build_chunk_quality did not surface paragraph_length_symmetry risk")
    if "paragraph_length_symmetry" not in list(cq_para.get("advisoryFlags") or []):
        failures.append("_build_chunk_quality missing paragraph_length_symmetry advisory flag")
    para_advice = " ".join(str(item) for item in (cq_para.get("rewriteAdvice") or []))
    if "合并" not in para_advice or "拆分" not in para_advice:
        failures.append(f"rewriteAdvice should forbid merge/split paragraphs, got: {para_advice}")
    sm_para = cq_para.get("styleMetrics") if isinstance(cq_para.get("styleMetrics"), dict) else {}
    for key in ("paragraphLengthCv", "adjacentParagraphUniformity", "paragraphCount"):
        if key not in sm_para:
            failures.append(f"_build_chunk_quality styleMetrics missing {key}: {sm_para}")

    # --- styleMetrics surfaced in _build_chunk_quality payload (frontend contract) ---
    cq = f._build_chunk_quality("原文。", "本工作探讨该方法，使用YOLOv8模型。该方法被广泛应用。该方法被进一步提升。")
    sm = cq.get("styleMetrics")
    if not isinstance(sm, dict) or "burstinessRatio" not in sm or "passiveDensity" not in sm or "chengyuDensity" not in sm:
        failures.append(f"_build_chunk_quality styleMetrics missing/wrong: {sm}")
    if not isinstance(sm, dict) or "paragraphLengthCv" not in sm or "adjacentParagraphUniformity" not in sm:
        failures.append(f"_build_chunk_quality styleMetrics missing paragraph symmetry keys: {sm}")
    if "passive_voice_overuse" not in [r.get("code") for r in cq.get("machineLikeRisks", [])]:
        failures.append("_build_chunk_quality did not surface passive_voice_overuse risk")

    # --- directionality: AI-heavy text -> high risk; human-naturalized -> no risk.
    # This proves the metrics+risks actually guide rewriting toward lower AI
    # signature (the core moat goal), not just decorate the UI.
    ai_heavy = (
        "本研究提出了一种新的方法用于解决该问题。该方法被应用于多个数据集上进行验证。"
        "实验结果表明该方法是有效且可行的。该模型的性能被进一步提升和优化。"
        "该结论被广泛接受并加以推广应用。该方法至关重要，举足轻重，不言而喻。"
    )
    human_natural = (
        "我们用三个公开数据集验证了这套方法，mAP 从 78.4 升到 85.1。短句先收。"
        "但仔细看误差分布会发现，小目标召回率的提升其实来自数据增强而非模型结构。"
        "这一点容易被忽略。值得一提的是，把 batch size 从 16 降到 8 后显存减半，代价是 mAP 掉 1.3 个点。"
    )
    ai_risks = _risk_codes(ai_heavy)
    human_risks = _risk_codes(human_natural)
    if len(ai_risks) < 3:
        failures.append(f"AI-heavy text should raise >=3 risks, got {ai_risks}")
    if human_risks:
        failures.append(f"human-naturalized text should raise NO risks, got {human_risks}")
    if not (len(human_risks) < len(ai_risks)):
        failures.append(f"metrics not directionally useful: ai={len(ai_risks)} human={len(human_risks)} risks")

    return {"ok": not failures, "failures": failures}


def main() -> int:
    report = run_regression()
    if report["ok"]:
        print("style_dimensions_regression: PASS")
        return 0
    print("style_dimensions_regression: FAIL")
    for failure in report["failures"]:
        print(f"  - {failure}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
