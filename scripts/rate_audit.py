from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Iterable

from fyadr_round_service import _assess_machine_like_risks, _style_risk_metrics
from prompt_library import (
    RATE_AUDIT_DIMENSION_REGISTRY,
    RATE_AUDIT_DIMENSION_REGISTRY_VERSION,
    ROUND_PERTURBATION_DIMENSIONS,
    get_rate_audit_dimension_definition,
)


RATE_AUDIT_VERSION = 3
RATE_AUDIT_MAX_CHARS = 300_000
RATE_AUDIT_MAX_HOTSPOTS = 12

SEVERITY_POINTS = {
    "high": 3,
    "medium": 2,
    "low": 1,
}

DIMENSION_DEFINITIONS = RATE_AUDIT_DIMENSION_REGISTRY

RISK_DIMENSION_LOOKUP = {
    str(code): str(dimension["dimensionId"])
    for dimension in DIMENSION_DEFINITIONS
    for code in dimension["riskCodes"]
}

PUBLIC_METRIC_FIELDS = (
    "sentenceCount",
    "paragraphCount",
    "sentenceLengthVariation",
    "burstinessRatio",
    "shortSentenceRate",
    "connectorDensity",
    "templateDensity",
    "abstractPaddingDensity",
    "passiveDensity",
    "chengyuDensity",
    "nestedNumberDensity",
    "colonParallelDensity",
    "structureConcentration",
    "paragraphLengthCv",
    "adjacentParagraphUniformity",
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_analysis_text(value: Any) -> tuple[str, bool, int]:
    text = str(value or "").replace("\r\n", "\n").replace("\r", "\n")
    original_char_count = len(text)
    if original_char_count <= RATE_AUDIT_MAX_CHARS:
        return text, False, original_char_count

    candidate = text[:RATE_AUDIT_MAX_CHARS]
    minimum_boundary = int(RATE_AUDIT_MAX_CHARS * 0.85)
    boundaries = (
        candidate.rfind("\n\n"),
        candidate.rfind("\n"),
        candidate.rfind("。"),
        candidate.rfind("！"),
        candidate.rfind("？"),
    )
    boundary = max(boundaries)
    if boundary >= minimum_boundary:
        candidate = candidate[: boundary + 1]
    return candidate, True, original_char_count


def _severity_points(level: Any) -> int:
    return SEVERITY_POINTS.get(str(level or "").strip().lower(), 1)


def _normalize_risk(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    code = str(value.get("code", "") or "").strip()
    message = str(value.get("message", "") or "").strip()
    if not code or not message:
        return None
    level = str(value.get("level", "medium") or "medium").strip().lower() or "medium"
    return {
        "code": code,
        "level": level,
        "message": message,
        "points": _severity_points(level),
        "dimensionId": RISK_DIMENSION_LOOKUP.get(code, "other"),
    }


def _public_metrics(raw: dict[str, object]) -> dict[str, Any]:
    metrics: dict[str, Any] = {
        "language": str(raw.get("language", "") or ""),
        "charCount": int(raw.get("charCount", 0) or 0),
    }
    for field in PUBLIC_METRIC_FIELDS:
        value = raw.get(field, 0)
        if isinstance(value, bool):
            metrics[field] = int(value)
        elif isinstance(value, (int, float)):
            metrics[field] = value
        else:
            metrics[field] = 0
    return metrics


def _build_dimensions(risks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dimensions: list[dict[str, Any]] = []
    for definition in DIMENSION_DEFINITIONS:
        dimension_id = str(definition["dimensionId"])
        items = [risk for risk in risks if risk.get("dimensionId") == dimension_id]
        points = sum(int(risk.get("points", 0) or 0) for risk in items)
        high_count = sum(1 for risk in items if risk.get("level") == "high")
        status = "focus" if high_count or points >= 4 else "watch" if items else "clear"
        dimensions.append(
            {
                "id": dimension_id,
                "label": str(definition["label"]),
                "description": str(definition["description"]),
                "action": str(definition["action"]),
                "riskCount": len(items),
                "highRiskCount": high_count,
                "riskPoints": points,
                "status": status,
                "riskCodes": [str(risk["code"]) for risk in items],
                "repairPromptId": str(definition.get("repairPromptId", "") or ""),
                "evaluatorDimensionId": str(definition.get("evaluatorDimensionId", "") or ""),
                "primaryMetric": str(definition.get("primaryMetric", "") or ""),
                "secondaryMetric": str(definition.get("secondaryMetric", "") or ""),
                "directionEvaluator": str(definition.get("directionEvaluator", "manual_review") or "manual_review"),
                "targetScope": str(definition.get("targetScope", "manual_review") or "manual_review"),
                "maxAttempts": int(definition.get("maxAttempts", 0) or 0),
                "plateauPolicy": str(definition.get("plateauPolicy", "manual_review_only") or "manual_review_only"),
                "canExecute": bool(definition.get("canExecute", False)),
                "manualReviewReason": str(definition.get("manualReviewReason", "") or ""),
            }
        )
    return dimensions


def analyze_rate_stage(
    text: str,
    *,
    stage_id: str,
    label: str,
    round_number: int | None = None,
) -> dict[str, Any]:
    analyzed_text, truncated, original_char_count = _normalize_analysis_text(text)
    raw_metrics = _style_risk_metrics(analyzed_text)
    risks = [
        normalized
        for raw in _assess_machine_like_risks(analyzed_text, raw_metrics)
        if (normalized := _normalize_risk(raw)) is not None
    ]
    dimensions = _build_dimensions(risks)
    return {
        "id": str(stage_id or "stage"),
        "label": str(label or stage_id or "阶段"),
        "round": round_number,
        "originalCharCount": original_char_count,
        "analyzedCharCount": len(analyzed_text),
        "truncated": truncated,
        "riskCount": len(risks),
        "highRiskCount": sum(1 for risk in risks if risk.get("level") == "high"),
        "riskPoints": sum(int(risk.get("points", 0) or 0) for risk in risks),
        "risks": risks,
        "dimensions": dimensions,
        "metrics": _public_metrics(raw_metrics),
    }


def _dimension_delta(
    baseline: dict[str, Any],
    current: dict[str, Any],
) -> list[dict[str, Any]]:
    before_lookup = {
        str(item.get("id", "")): item
        for item in baseline.get("dimensions", [])
        if isinstance(item, dict)
    }
    result: list[dict[str, Any]] = []
    for current_item in current.get("dimensions", []):
        if not isinstance(current_item, dict):
            continue
        dimension_id = str(current_item.get("id", ""))
        before_item = before_lookup.get(dimension_id, {})
        before = int(before_item.get("riskPoints", 0) or 0)
        after = int(current_item.get("riskPoints", 0) or 0)
        change = after - before
        trend = "improved" if change < 0 else "regressed" if change > 0 else "stable"
        result.append(
            {
                "id": dimension_id,
                "label": str(current_item.get("label", dimension_id) or dimension_id),
                "beforeRiskPoints": before,
                "afterRiskPoints": after,
                "riskPointChange": change,
                "trend": trend,
            }
        )
    return result


def _build_delta(baseline: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    before_points = int(baseline.get("riskPoints", 0) or 0)
    after_points = int(current.get("riskPoints", 0) or 0)
    dimensions = _dimension_delta(baseline, current)
    relative_change = None
    if before_points > 0:
        relative_change = round(((after_points - before_points) / before_points) * 100, 1)
    return {
        "beforeRiskPoints": before_points,
        "afterRiskPoints": after_points,
        "riskPointChange": after_points - before_points,
        "beforeRiskCount": int(baseline.get("riskCount", 0) or 0),
        "afterRiskCount": int(current.get("riskCount", 0) or 0),
        "relativeRiskChangePercent": relative_change,
        "improvedDimensionCount": sum(1 for item in dimensions if item["trend"] == "improved"),
        "regressedDimensionCount": sum(1 for item in dimensions if item["trend"] == "regressed"),
        "stableDimensionCount": sum(1 for item in dimensions if item["trend"] == "stable"),
        "dimensions": dimensions,
    }


def _excerpt(text: str, limit: int = 180) -> str:
    compact = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(compact) <= limit:
        return compact
    return f"{compact[:limit].rstrip()}…"


def _fallback_paragraph_chunks(text: str) -> list[dict[str, Any]]:
    analyzed_text, _, _ = _normalize_analysis_text(text)
    paragraphs = [item.strip() for item in re.split(r"\n+", analyzed_text) if item.strip()]
    return [
        {
            "chunkId": f"paragraph-{index + 1}",
            "paragraphIndex": index,
            "text": paragraph,
        }
        for index, paragraph in enumerate(paragraphs)
    ]


def build_rate_hotspots(
    chunks: Iterable[dict[str, Any]] | None,
    *,
    fallback_text: str,
    limit: int = RATE_AUDIT_MAX_HOTSPOTS,
) -> list[dict[str, Any]]:
    normalized_chunks = list(chunks or _fallback_paragraph_chunks(fallback_text))
    hotspots: list[dict[str, Any]] = []
    for index, chunk in enumerate(normalized_chunks):
        if not isinstance(chunk, dict):
            continue
        text = str(chunk.get("text", chunk.get("outputText", "")) or "")
        if not text.strip():
            continue
        stage = analyze_rate_stage(
            text,
            stage_id=str(chunk.get("chunkId", f"chunk-{index + 1}")),
            label=f"段落 {int(chunk.get('paragraphIndex', index) or 0) + 1}",
        )
        if int(stage.get("riskCount", 0) or 0) <= 0:
            continue
        dimensions = [
            str(item.get("id", ""))
            for item in stage.get("dimensions", [])
            if isinstance(item, dict) and int(item.get("riskPoints", 0) or 0) > 0
        ]
        hotspots.append(
            {
                "chunkId": str(chunk.get("chunkId", f"chunk-{index + 1}")),
                "paragraphIndex": int(chunk.get("paragraphIndex", index) or 0),
                "chunkIndex": int(chunk.get("chunkIndex", 0) or 0),
                "excerpt": _excerpt(text),
                "riskCount": int(stage.get("riskCount", 0) or 0),
                "highRiskCount": int(stage.get("highRiskCount", 0) or 0),
                "riskPoints": int(stage.get("riskPoints", 0) or 0),
                "dimensionIds": dimensions,
                "risks": stage.get("risks", []),
            }
        )
    hotspots.sort(
        key=lambda item: (
            int(item.get("riskPoints", 0) or 0),
            int(item.get("highRiskCount", 0) or 0),
            int(item.get("riskCount", 0) or 0),
        ),
        reverse=True,
    )
    return hotspots[: max(1, min(int(limit or RATE_AUDIT_MAX_HOTSPOTS), RATE_AUDIT_MAX_HOTSPOTS))]


def _build_recommendations(
    current: dict[str, Any],
    delta: dict[str, Any],
    hotspots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    delta_lookup = {
        str(item.get("id", "")): item
        for item in delta.get("dimensions", [])
        if isinstance(item, dict)
    }
    active_dimensions = [
        item
        for item in current.get("dimensions", [])
        if isinstance(item, dict) and int(item.get("riskPoints", 0) or 0) > 0
    ]
    active_dimensions.sort(
        key=lambda item: (
            delta_lookup.get(str(item.get("id", "")), {}).get("trend") == "regressed",
            int(item.get("riskPoints", 0) or 0),
            int(item.get("highRiskCount", 0) or 0),
        ),
        reverse=True,
    )
    recommendations: list[dict[str, Any]] = []
    for item in active_dimensions[:3]:
        dimension_id = str(item.get("id", ""))
        definition = get_rate_audit_dimension_definition(dimension_id)
        trend = str(delta_lookup.get(dimension_id, {}).get("trend", "stable"))
        risk_points = int(item.get("riskPoints", 0) or 0)
        target_ids = [
            str(hotspot.get("chunkId", ""))
            for hotspot in hotspots
            if dimension_id in hotspot.get("dimensionIds", [])
        ]
        priority = "high" if trend == "regressed" or risk_points >= 4 else "medium"
        recommendations.append(
            {
                "dimensionId": dimension_id,
                "label": str(item.get("label", dimension_id) or dimension_id),
                "priority": priority,
                "trend": trend,
                "riskCount": int(item.get("riskCount", 0) or 0),
                "highRiskCount": int(item.get("highRiskCount", 0) or 0),
                "riskPoints": risk_points,
                "reason": (
                    "这一维度相对原文新增或加重，应优先处理。"
                    if trend == "regressed"
                    else f"当前仍有 {int(item.get('riskCount', 0) or 0)} 项启发式信号。"
                ),
                "action": str(item.get("action", "") or ""),
                "targetChunkIds": list(dict.fromkeys(target_ids))[:8],
                "repairPromptId": str(definition.get("repairPromptId", "") or ""),
                "evaluatorDimensionId": str(definition.get("evaluatorDimensionId", "") or ""),
                "primaryMetric": str(definition.get("primaryMetric", "") or ""),
                "secondaryMetric": str(definition.get("secondaryMetric", "") or ""),
                "directionEvaluator": str(definition.get("directionEvaluator", "manual_review") or "manual_review"),
                "targetScope": str(definition.get("targetScope", "manual_review") or "manual_review"),
                "maxAttempts": int(definition.get("maxAttempts", 0) or 0),
                "plateauPolicy": str(definition.get("plateauPolicy", "manual_review_only") or "manual_review_only"),
                "canExecute": bool(definition.get("canExecute", False)),
                "manualReviewReason": str(definition.get("manualReviewReason", "") or ""),
            }
        )
    if not recommendations:
        recommendations.append(
            {
                "dimensionId": "manual_review",
                "label": "人工抽查",
                "priority": "low",
                "trend": "stable",
                "riskCount": 0,
                "highRiskCount": 0,
                "riskPoints": 0,
                "reason": "当前规则未触发明显表达信号。",
                "action": "无需为了统计指标继续改写；优先检查事实、术语、引用、否定范围和导师要求。",
                "targetChunkIds": [],
                "repairPromptId": "",
                "evaluatorDimensionId": "",
                "primaryMetric": "",
                "secondaryMetric": "",
                "directionEvaluator": "manual_review",
                "targetScope": "manual_review",
                "maxAttempts": 0,
                "plateauPolicy": "manual_review_only",
                "canExecute": False,
                "manualReviewReason": "当前没有需要自动执行的诊断维度。",
            }
        )
    return recommendations


def _build_strategy_plan(
    *,
    source_only: bool,
    current: dict[str, Any],
    delta: dict[str, Any],
    hotspots: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
    content_contract: dict[str, Any] | None,
    current_prompt_id: str,
    next_prompt_id: str,
) -> dict[str, Any]:
    """Turn diagnostic evidence into one bounded next-step decision.

    The decision is deliberately conservative: a lower heuristic point count
    never justifies rewriting already-natural text, and no strategy is marked
    executable while the body-only/format contract is not ready.
    """

    contract_present = isinstance(content_contract, dict)
    contract_ready = bool(content_contract.get("ready")) if contract_present else True
    format_ready = bool(content_contract.get("formatLockReady")) if contract_present else True
    scope_ready = bool(content_contract.get("scopeReady")) if contract_present else True
    normalized_recommendations = [
        item
        for item in recommendations
        if isinstance(item, dict)
    ]
    executable_candidates: list[dict[str, Any]] = []
    registered_executable_candidates: list[dict[str, Any]] = []
    manual_candidates: list[dict[str, Any]] = []
    for item in normalized_recommendations:
        candidate_dimension_id = str(item.get("dimensionId", "") or "")
        if not candidate_dimension_id or candidate_dimension_id == "manual_review":
            continue
        candidate_definition = get_rate_audit_dimension_definition(candidate_dimension_id)
        if bool(candidate_definition.get("canExecute")):
            registered_executable_candidates.append(item)
            candidate_target_ids = [
                str(value).strip()
                for value in item.get("targetChunkIds", [])
                if str(value).strip()
            ] if isinstance(item.get("targetChunkIds"), list) else []
            if candidate_target_ids and str(candidate_definition.get("repairPromptId", "") or ""):
                executable_candidates.append(item)
        else:
            manual_candidates.append(item)

    # Manual-only document/register signals remain blocking evidence, but they
    # must not starve an independent chunk-scoped dimension that has a real
    # prompt, evaluator, and target set.  Only the first queued dimension is
    # selected for this plan; the queue is disclosure, not a multi-dimension
    # execution bundle.
    primary = (
        executable_candidates[0]
        if executable_candidates
        else manual_candidates[0]
        if manual_candidates
        else registered_executable_candidates[0]
        if registered_executable_candidates
        else normalized_recommendations[0]
        if normalized_recommendations
        else {}
    )

    delta_by_dimension = {
        str(item.get("id", "") or ""): item
        for item in delta.get("dimensions", [])
        if isinstance(item, dict) and str(item.get("id", "") or "")
    }
    blocking_manual_dimensions: list[dict[str, Any]] = []
    for item in current.get("dimensions", []):
        if not isinstance(item, dict) or int(item.get("riskPoints", 0) or 0) <= 0:
            continue
        item_dimension_id = str(item.get("id", "") or "")
        item_definition = get_rate_audit_dimension_definition(item_dimension_id)
        if bool(item_definition.get("canExecute")):
            continue
        manual_target_ids = list(dict.fromkeys(
            str(hotspot.get("chunkId", "") or "").strip()
            for hotspot in hotspots
            if isinstance(hotspot, dict)
            and item_dimension_id in (hotspot.get("dimensionIds") or [])
            and str(hotspot.get("chunkId", "") or "").strip()
        ))[:8]
        item_delta = delta_by_dimension.get(item_dimension_id, {})
        blocking_manual_dimensions.append(
            {
                "dimensionId": item_dimension_id,
                "label": str(item.get("label", item_dimension_id) or item_dimension_id),
                "trend": str(item_delta.get("trend", "stable") or "stable"),
                "riskCount": int(item.get("riskCount", 0) or 0),
                "highRiskCount": int(item.get("highRiskCount", 0) or 0),
                "riskPoints": int(item.get("riskPoints", 0) or 0),
                "targetScope": str(item_definition.get("targetScope", "manual_review") or "manual_review"),
                "targetChunkIds": manual_target_ids,
                "targetChunkCount": len(manual_target_ids),
                "manualReviewReason": str(item_definition.get("manualReviewReason", "") or ""),
                "action": str(item.get("action", "") or ""),
            }
        )
    blocking_manual_dimensions.sort(
        key=lambda item: (
            str(item.get("trend", "")) == "regressed",
            int(item.get("highRiskCount", 0) or 0),
            int(item.get("riskPoints", 0) or 0),
        ),
        reverse=True,
    )

    executable_queue: list[dict[str, Any]] = []
    for item in executable_candidates:
        queue_dimension_id = str(item.get("dimensionId", "") or "")
        queue_definition = get_rate_audit_dimension_definition(queue_dimension_id)
        queue_target_ids = list(dict.fromkeys(
            str(value).strip()
            for value in item.get("targetChunkIds", [])
            if str(value).strip()
        ))[:8]
        executable_queue.append(
            {
                "dimensionId": queue_dimension_id,
                "label": str(item.get("label", queue_dimension_id) or queue_dimension_id),
                "priority": str(item.get("priority", "medium") or "medium"),
                "trend": str(item.get("trend", "stable") or "stable"),
                "riskCount": int(item.get("riskCount", 0) or 0),
                "highRiskCount": int(item.get("highRiskCount", 0) or 0),
                "riskPoints": int(item.get("riskPoints", 0) or 0),
                "repairPromptId": str(queue_definition.get("repairPromptId", "") or ""),
                "evaluatorDimensionId": str(queue_definition.get("evaluatorDimensionId", "") or ""),
                "primaryMetric": str(queue_definition.get("primaryMetric", "") or ""),
                "targetScope": str(queue_definition.get("targetScope", "") or ""),
                "maxAttempts": int(queue_definition.get("maxAttempts", 0) or 0),
                "plateauPolicy": str(queue_definition.get("plateauPolicy", "") or ""),
                "targetChunkIds": queue_target_ids,
                "targetChunkCount": len(queue_target_ids),
            }
        )
    dimension_id = str(primary.get("dimensionId", "manual_review") or "manual_review")
    dimension_definition = get_rate_audit_dimension_definition(dimension_id)
    dimension_can_execute = bool(dimension_definition.get("canExecute", False))
    repair_prompt = str(dimension_definition.get("repairPromptId", "") or "")
    manual_review_reason = str(dimension_definition.get("manualReviewReason", "") or "")
    target_chunk_ids = [
        str(value)
        for value in primary.get("targetChunkIds", [])
        if str(value).strip()
    ][:8]
    current_points = int(current.get("riskPoints", 0) or 0)
    point_change = int(delta.get("riskPointChange", 0) or 0)
    primary_trend = str(primary.get("trend", "stable") or "stable")
    primary_high = int(primary.get("highRiskCount", 0) or 0)
    resolved_current_prompt = str(current_prompt_id or "").strip()
    resolved_next_prompt = str(next_prompt_id or "").strip()
    current_prompt_dimension = ROUND_PERTURBATION_DIMENSIONS.get(resolved_current_prompt, {})
    current_evaluator_dimension_id = str(current_prompt_dimension.get("id", "") or "")
    current_rate_dimension = next(
        (
            definition
            for definition in DIMENSION_DEFINITIONS
            if current_evaluator_dimension_id
            and str(definition.get("evaluatorDimensionId", "") or "") == current_evaluator_dimension_id
        ),
        {},
    )
    progress_dimension_id = str(current_rate_dimension.get("dimensionId", "") or "")
    progress_delta = next(
        (
            item
            for item in delta.get("dimensions", [])
            if isinstance(item, dict) and str(item.get("id", "") or "") == progress_dimension_id
        ),
        {},
    )
    progress_current = next(
        (
            item
            for item in current.get("dimensions", [])
            if isinstance(item, dict) and str(item.get("id", "") or "") == progress_dimension_id
        ),
        {},
    )
    progress_trend = str(progress_delta.get("trend", "") or "")
    progress_after_points = int(progress_current.get("riskPoints", 0) or 0)
    progress_evidence_ready = bool(
        progress_dimension_id
        and progress_trend in {"improved", "regressed", "stable"}
    )
    current_dimension_can_advance = bool(
        progress_evidence_ready
        and (progress_trend == "improved" or progress_after_points <= 0)
    )
    prewrite_global_progress_ready = bool(
        resolved_current_prompt == "prewrite"
        and current_evaluator_dimension_id == "structure_warmup"
        and point_change < 0
    )
    progress_evidence_source = (
        "bound_dimension"
        if progress_evidence_ready
        else "prewrite_global_delta"
        if prewrite_global_progress_ready
        else "none"
    )

    if not contract_ready or not scope_ready or not format_ready:
        decision = "blocked"
        reason = "正文范围或格式锁契约未通过；在修复边界证据前，不允许继续改写或导出。"
        recommended_prompt = ""
    elif current_points <= 0:
        decision = "stop"
        recommended_prompt = ""
        reason = "当前未命中明显启发式信号；继续改写更可能损伤事实、术语或自然表达。"
    elif source_only:
        decision = "next_dimension"
        recommended_prompt = resolved_next_prompt or "prewrite"
        reason = "原文基线已建立且仍存在可解释的启发式信号，先执行流程中的首个保守维度，再用同一套规则比较变化。"
    elif not dimension_can_execute:
        decision = "manual_review"
        recommended_prompt = ""
        reason = (
            f"{manual_review_reason} 当前只提供热区与诊断证据，不会借用其他维度的提示词自动改写。"
            if manual_review_reason
            else "当前主问题没有注册同维度评估器；只提供热区与诊断证据，不自动改写。"
        )
    elif primary_trend == "regressed" or primary_high > 0:
        decision = "targeted_rerun"
        recommended_prompt = repair_prompt
        reason = "当前存在新增、加重或高等级信号；仅用该维度注册的修复提示词处理命中段落，并由同维度评估器复评分。"
    elif resolved_next_prompt and (
        current_dimension_can_advance
        or prewrite_global_progress_ready
    ):
        decision = "next_dimension"
        recommended_prompt = resolved_next_prompt
        reason = (
            f"当前提示词绑定的“{str(current_rate_dimension.get('label', progress_dimension_id) or progress_dimension_id)}”"
            f"维度已{'降至无风险点' if progress_after_points <= 0 else '出现改善'}，可进入下一个不同职责的提示词，避免重复施压。"
            if progress_dimension_id
            else "当前保守预处理使整体启发式信号下降，可进入首个有同维度评估器的正式修复轮次。"
        )
    elif target_chunk_ids or hotspots:
        decision = "targeted_rerun"
        recommended_prompt = repair_prompt
        reason = "整体没有明显退化，但仍有局部热区；仅用该维度注册的修复提示词处理列出的段落，并做同维度复评分。"
    else:
        decision = "stop"
        recommended_prompt = ""
        reason = "没有可执行的局部目标；停止自动改写并转入事实、引用与人工语言检查。"

    manual_review_required = bool(blocking_manual_dimensions)
    if manual_review_required and decision in {"targeted_rerun", "next_dimension"}:
        reason = (
            f"{reason} 另有 {len(blocking_manual_dimensions)} 个未具备可靠自动评估器的维度仍须人工复核；"
            "本次执行不会把这些人工风险标记为已解决。"
        )

    can_execute = bool(
        contract_ready
        and scope_ready
        and format_ready
        and (
            (
                decision == "targeted_rerun"
                and dimension_can_execute
                and target_chunk_ids
                and recommended_prompt
            )
            or (decision == "next_dimension" and recommended_prompt)
        )
    )
    return {
        "version": RATE_AUDIT_VERSION,
        "decision": decision,
        "label": {
            "blocked": "先修复正文边界",
            "stop": "停止自动改写",
            "targeted_rerun": "定点重跑",
            "next_dimension": "进入下一维度",
            "manual_review": "转人工复核",
        }.get(decision, decision),
        "recommendedPromptId": recommended_prompt,
        "currentPromptId": resolved_current_prompt,
        "nextPromptId": resolved_next_prompt,
        "dimensionId": dimension_id,
        "dimensionLabel": str(primary.get("label", "人工抽查") or "人工抽查"),
        "dimensionRegistryVersion": RATE_AUDIT_DIMENSION_REGISTRY_VERSION,
        "repairPromptId": repair_prompt,
        "evaluatorDimensionId": str(dimension_definition.get("evaluatorDimensionId", "") or ""),
        "primaryMetric": str(dimension_definition.get("primaryMetric", "") or ""),
        "secondaryMetric": str(dimension_definition.get("secondaryMetric", "") or ""),
        "directionEvaluator": str(dimension_definition.get("directionEvaluator", "manual_review") or "manual_review"),
        "targetScope": str(dimension_definition.get("targetScope", "manual_review") or "manual_review"),
        "maxAttempts": int(dimension_definition.get("maxAttempts", 0) or 0),
        "plateauPolicy": str(dimension_definition.get("plateauPolicy", "manual_review_only") or "manual_review_only"),
        "dimensionCanExecute": dimension_can_execute,
        "manualReviewReason": manual_review_reason,
        "promptSelectionSource": (
            "dimension_registry"
            if decision == "targeted_rerun"
            else "workflow_sequence" if decision == "next_dimension" else "none"
        ),
        "progressEvidenceDimensionId": progress_dimension_id,
        "progressEvidenceEvaluatorDimensionId": current_evaluator_dimension_id,
        "progressEvidenceTrend": progress_trend or ("improved" if prewrite_global_progress_ready else ""),
        "progressEvidenceAfterRiskPoints": progress_after_points,
        "progressEvidenceReady": bool(progress_evidence_ready or prewrite_global_progress_ready),
        "progressEvidenceSource": progress_evidence_source,
        "blockingManualDimensions": blocking_manual_dimensions,
        "blockingManualDimensionCount": len(blocking_manual_dimensions),
        "executableQueue": executable_queue,
        "executableQueueCount": len(executable_queue),
        "selectedExecutableDimensionId": (
            dimension_id
            if decision == "targeted_rerun" and executable_queue
            else ""
        ),
        "manualReviewRequired": manual_review_required or decision == "manual_review",
        "manualReviewStillRequired": manual_review_required,
        "hardStop": False,
        "plateauReached": False,
        "plateauReason": "",
        "reason": reason,
        "action": str(primary.get("action", "") or ""),
        "targetChunkIds": target_chunk_ids,
        "targetChunkCount": len(target_chunk_ids),
        "contentContractReady": contract_ready,
        "scopeContractReady": scope_ready,
        "formatContractReady": format_ready,
        "canExecute": can_execute,
    }


def _build_dual_contract_readiness(
    strategy_plan: dict[str, Any],
    content_contract: dict[str, Any] | None,
    *,
    source_only: bool,
) -> dict[str, Any]:
    contract_present = isinstance(content_contract, dict)
    content_ready = bool(content_contract.get("ready")) if contract_present else True
    scope_ready = bool(content_contract.get("scopeReady")) if contract_present else True
    format_ready = bool(content_contract.get("formatLockReady")) if contract_present else True
    blocked = not (content_ready and scope_ready and format_ready)
    decision = str(strategy_plan.get("decision", "stop"))
    status = "blocked" if blocked else "attention" if decision in {"targeted_rerun", "manual_review"} else "ready"
    return {
        "status": status,
        "strategyDecisionReady": decision in {"stop", "targeted_rerun", "next_dimension", "manual_review"},
        "contentContractReady": content_ready,
        "scopeContractReady": scope_ready,
        "formatContractReady": format_ready,
        "runReady": bool(source_only and not blocked),
        "preExportReady": bool(not source_only and not blocked),
        "blockedReason": (
            "正文范围或格式锁契约未通过。"
            if blocked
            else ""
        ),
    }


def build_rate_audit_report(
    *,
    source_text: str,
    stages: Iterable[dict[str, Any]] | None = None,
    current_chunks: Iterable[dict[str, Any]] | None = None,
    source_path: str = "",
    current_output_path: str = "",
    current_stage_id: str | None = None,
    content_contract: dict[str, Any] | None = None,
    current_prompt_id: str = "",
    next_prompt_id: str = "",
) -> dict[str, Any]:
    baseline = analyze_rate_stage(source_text, stage_id="source", label="原文")
    stage_results: list[dict[str, Any]] = [baseline]
    stage_texts: dict[str, str] = {"source": source_text}
    seen_stage_ids = {"source"}
    for index, stage in enumerate(stages or []):
        if not isinstance(stage, dict):
            continue
        text = str(stage.get("text", "") or "")
        if not text.strip():
            continue
        stage_id = str(stage.get("id", f"round-{index + 1}") or f"round-{index + 1}")
        if stage_id in seen_stage_ids:
            continue
        seen_stage_ids.add(stage_id)
        round_number_raw = stage.get("round")
        round_number = int(round_number_raw) if isinstance(round_number_raw, int) else None
        result = analyze_rate_stage(
            text,
            stage_id=stage_id,
            label=str(stage.get("label", f"第 {round_number or index + 1} 轮") or f"第 {round_number or index + 1} 轮"),
            round_number=round_number,
        )
        stage_results.append(result)
        stage_texts[stage_id] = text

    selected_stage_id = str(current_stage_id or "").strip()
    current = next(
        (item for item in stage_results if item.get("id") == selected_stage_id),
        stage_results[-1],
    )
    current_text = stage_texts.get(str(current.get("id", "source")), source_text)
    delta = _build_delta(baseline, current)
    hotspots = build_rate_hotspots(current_chunks, fallback_text=current_text)
    recommendations = _build_recommendations(current, delta, hotspots)
    source_only = str(current.get("id", "source")) == "source"
    strategy_plan = _build_strategy_plan(
        source_only=source_only,
        current=current,
        delta=delta,
        hotspots=hotspots,
        recommendations=recommendations,
        content_contract=content_contract,
        current_prompt_id=current_prompt_id,
        next_prompt_id=next_prompt_id,
    )
    readiness = _build_dual_contract_readiness(
        strategy_plan,
        content_contract,
        source_only=source_only,
    )
    return {
        "version": RATE_AUDIT_VERSION,
        "label": "heuristic-rate-audit",
        "isAiDetector": False,
        "disclaimer": "这是基于可解释文本特征的相对诊断，不是第三方 AIGC 检测结果，也不代表任何平台的通过率。",
        "createdAt": _utc_now(),
        "sourcePath": str(source_path or ""),
        "currentOutputPath": str(current_output_path or ""),
        "sourceOnly": source_only,
        "stageCount": len(stage_results),
        "baseline": baseline,
        "current": current,
        "stages": stage_results,
        "delta": delta,
        "hotspotCount": len(hotspots),
        "hotspots": hotspots,
        "recommendations": recommendations,
        "strategyPlan": strategy_plan,
        "contentContract": content_contract,
        "readiness": readiness,
    }
