from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from prompt_library import (  # noqa: E402
    RATE_AUDIT_DIMENSION_REGISTRY,
    ROUND_PERTURBATION_DIMENSIONS,
)
from chunking import Chunk  # noqa: E402
from fyadr_round_service import (  # noqa: E402
    ROUND_COMPARE_VERSION,
    _rewrite_round_chunk,
    build_global_style_profile_from_texts,
)
from rate_audit import RATE_AUDIT_MAX_CHARS, _build_strategy_plan, build_rate_audit_report  # noqa: E402
from source_relative_style_delta import assess_source_relative_document_delta  # noqa: E402


TEMPLATE_HEAVY_TEXT = (
    "首先，该系统能够提高处理效率。其次，该系统能够优化业务流程。"
    "此外，该方案具有十分重要的现实意义。综上所述，该方案具有重要意义。\n"
    "第一，系统提升效率；第二，系统优化流程；第三，系统促进发展。"
)

NATURAL_TECHNICAL_TEXT = (
    "系统把重复校验结果写入缓存，下一次请求可以直接读取已有状态。"
    "队列只处理尚未完成的任务，失败项会保留原因并等待人工确认。"
    "管理员据此定位具体步骤，不必重新执行整条流程。"
)

UNIFORM_RHYTHM_TEXT = "。".join(["该方法用于完成公开数据集上的模型效果验证"] * 6) + "。"

PASSIVE_REGISTER_TEXT = (
    "该方法被应用于三个公开数据集，并记录每次实验的误差范围。"
    "核心结论受到多组重复试验支持，跨域样本被单独检查。"
    "相关限制为研究团队所确认。"
)

TEMPLATE_ONLY_TEXT = (
    "该方案具有重要意义。该方法为后续工作提供了有力支持。"
    "相关研究由此奠定了坚实基础，整体表述仍停留在泛化判断。"
)


def _assert(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def _exercise_pure_report() -> list[str]:
    checks: list[str] = []
    registry = {
        str(item.get("dimensionId", "")): item
        for item in RATE_AUDIT_DIMENSION_REGISTRY
    }
    _assert(set(registry) == {"rhythm", "transitions", "templates", "structure", "register"}, "dimension registry ids drifted")
    _assert(
        {dimension_id for dimension_id, item in registry.items() if item.get("canExecute")}
        == {"rhythm", "transitions", "templates"},
        "rhythm, transitions, and templates must advertise their real same-dimension loops",
    )
    for dimension_id in ("rhythm", "transitions", "templates"):
        item = registry[dimension_id]
        prompt_id = str(item.get("repairPromptId", ""))
        prompt_dimension = ROUND_PERTURBATION_DIMENSIONS.get(prompt_id, {})
        _assert(prompt_dimension, f"{dimension_id} repair prompt is not registered")
        _assert(
            str(prompt_dimension.get("id", "")) == str(item.get("evaluatorDimensionId", "")),
            f"{dimension_id} evaluator dimension does not match its repair prompt",
        )
        _assert(
            str(prompt_dimension.get("primaryMetric", "")) == str(item.get("primaryMetric", "")),
            f"{dimension_id} primary metric does not match its repair prompt",
        )
    for dimension_id in ("structure", "register"):
        item = registry[dimension_id]
        _assert(item.get("canExecute") is False, f"{dimension_id} must remain manual-only without a real evaluator")
        _assert(not item.get("repairPromptId"), f"{dimension_id} must not borrow another dimension's prompt")
        _assert(item.get("directionEvaluator") == "manual_review", f"{dimension_id} must disclose manual review")
    checks.append("one registry binds executable dimensions to their real prompts and evaluators")

    template_report = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        stages=[{"id": "round-template", "label": "模板回归", "round": 2, "text": TEMPLATE_ONLY_TEXT}],
        current_chunks=[
            {"chunkId": "template-c1", "paragraphIndex": 0, "chunkIndex": 0, "text": TEMPLATE_ONLY_TEXT},
        ],
        current_stage_id="round-template",
        current_prompt_id="round1",
    )
    _assert(template_report["strategyPlan"]["dimensionId"] == "templates", "template fixture must select templates")
    _assert(template_report["strategyPlan"]["decision"] == "targeted_rerun", "template dimension must be executable")
    _assert(template_report["strategyPlan"]["recommendedPromptId"] == "template-repair", "template dimension borrowed the wrong prompt")
    _assert(template_report["strategyPlan"]["primaryMetric"] == "templateDensity", "template evaluator metric drifted")
    checks.append("template and empty-padding risks have a dedicated prompt and same-dimension evaluator")

    cross_dimension_plan = _build_strategy_plan(
        source_only=False,
        current={
            "riskPoints": 2,
            "dimensions": [{"id": "rhythm", "label": "句法与节奏", "riskPoints": 2, "highRiskCount": 0}],
        },
        delta={
            "riskPointChange": -3,
            "dimensions": [{"id": "rhythm", "trend": "stable", "riskPointChange": 0}],
        },
        hotspots=[{"chunkId": "rhythm-stable", "dimensionIds": ["rhythm"]}],
        recommendations=[{
            "dimensionId": "rhythm",
            "label": "句法与节奏",
            "trend": "stable",
            "riskPoints": 2,
            "highRiskCount": 0,
            "targetChunkIds": ["rhythm-stable"],
            "action": "局部修复重复句模。",
        }],
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        current_prompt_id="round1",
        next_prompt_id="round2",
    )
    _assert(cross_dimension_plan["decision"] == "targeted_rerun", "global improvement incorrectly advanced an unimproved bound dimension")
    _assert(cross_dimension_plan["progressEvidenceDimensionId"] == "rhythm", "strategy lost the current prompt's bound dimension")
    _assert(cross_dimension_plan["progressEvidenceTrend"] == "stable", "strategy replaced bound-dimension evidence with the global delta")
    checks.append("next-dimension decisions require evidence from the current prompt's own bound dimension")

    unknown_prompt_plan = _build_strategy_plan(
        source_only=False,
        current={
            "riskPoints": 2,
            "dimensions": [{"id": "rhythm", "label": "句法与节奏", "riskPoints": 2, "highRiskCount": 0}],
        },
        delta={
            "riskPointChange": -3,
            "dimensions": [{"id": "rhythm", "trend": "stable", "riskPointChange": 0}],
        },
        hotspots=[{"chunkId": "unknown-prompt-rhythm", "dimensionIds": ["rhythm"]}],
        recommendations=[{
            "dimensionId": "rhythm",
            "label": "句法与节奏",
            "trend": "stable",
            "riskPoints": 2,
            "highRiskCount": 0,
            "targetChunkIds": ["unknown-prompt-rhythm"],
            "action": "局部修复重复句模。",
        }],
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        current_prompt_id="custom-unregistered-prompt",
        next_prompt_id="round2",
    )
    _assert(
        unknown_prompt_plan["decision"] == "targeted_rerun",
        "an unregistered custom prompt used a global score decrease as next-dimension evidence",
    )
    _assert(
        unknown_prompt_plan["progressEvidenceSource"] == "none"
        and unknown_prompt_plan["progressEvidenceReady"] is False,
        "an unregistered custom prompt fabricated bound progress evidence",
    )

    prewrite_plan = _build_strategy_plan(
        source_only=False,
        current={
            "riskPoints": 2,
            "dimensions": [{"id": "rhythm", "label": "句法与节奏", "riskPoints": 2, "highRiskCount": 0}],
        },
        delta={
            "riskPointChange": -3,
            "dimensions": [{"id": "rhythm", "trend": "stable", "riskPointChange": 0}],
        },
        hotspots=[{"chunkId": "prewrite-rhythm", "dimensionIds": ["rhythm"]}],
        recommendations=[{
            "dimensionId": "rhythm",
            "label": "句法与节奏",
            "trend": "stable",
            "riskPoints": 2,
            "highRiskCount": 0,
            "targetChunkIds": ["prewrite-rhythm"],
            "action": "局部修复重复句模。",
        }],
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        current_prompt_id="prewrite",
        next_prompt_id="round1",
    )
    _assert(prewrite_plan["decision"] == "next_dimension", "the registered prewrite warm-up could not advance after a global improvement")
    _assert(
        prewrite_plan["progressEvidenceSource"] == "prewrite_global_delta"
        and prewrite_plan["progressEvidenceReady"] is True,
        "the prewrite-only global-delta exception is not explicit",
    )
    checks.append("only the registered prewrite warm-up may use a global delta when no RateAudit evaluator is bound")

    mixed_manual_executable_plan = _build_strategy_plan(
        source_only=False,
        current={
            "riskPoints": 9,
            "dimensions": [
                {
                    "id": "structure",
                    "label": "段落与枚举结构",
                    "riskCount": 2,
                    "riskPoints": 6,
                    "highRiskCount": 1,
                    "action": "人工核对必要编号结构。",
                },
                {
                    "id": "transitions",
                    "label": "衔接脚手架",
                    "riskCount": 1,
                    "riskPoints": 3,
                    "highRiskCount": 1,
                    "action": "删除冗余公式化过渡语。",
                },
            ],
        },
        delta={
            "riskPointChange": 3,
            "dimensions": [
                {"id": "structure", "trend": "stable", "riskPointChange": 0},
                {"id": "transitions", "trend": "regressed", "riskPointChange": 3},
            ],
        },
        hotspots=[
            {"chunkId": "transition-target", "dimensionIds": ["transitions"]},
            {"chunkId": "structure-review", "dimensionIds": ["structure"]},
        ],
        # The manual-only dimension is intentionally first and higher-scored.
        recommendations=[
            {
                "dimensionId": "structure",
                "label": "段落与枚举结构",
                "priority": "high",
                "trend": "stable",
                "riskCount": 2,
                "riskPoints": 6,
                "highRiskCount": 1,
                "targetChunkIds": ["structure-review"],
                "action": "人工核对必要编号结构。",
            },
            {
                "dimensionId": "transitions",
                "label": "衔接脚手架",
                "priority": "high",
                "trend": "regressed",
                "riskCount": 1,
                "riskPoints": 3,
                "highRiskCount": 1,
                "targetChunkIds": ["transition-target"],
                "action": "删除冗余公式化过渡语。",
            },
        ],
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        current_prompt_id="round1",
        next_prompt_id="round2",
    )
    _assert(
        mixed_manual_executable_plan["decision"] == "targeted_rerun"
        and mixed_manual_executable_plan["dimensionId"] == "transitions",
        "a higher-scored manual-only dimension starved an independent executable repair",
    )
    _assert(
        mixed_manual_executable_plan["targetChunkIds"] == ["transition-target"]
        and mixed_manual_executable_plan["selectedExecutableDimensionId"] == "transitions",
        "the mixed plan did not remain a single-dimension targeted execution",
    )
    _assert(
        [item["dimensionId"] for item in mixed_manual_executable_plan["executableQueue"]] == ["transitions"],
        "the executable queue lost or merged the independent transition repair",
    )
    _assert(
        [item["dimensionId"] for item in mixed_manual_executable_plan["blockingManualDimensions"]] == ["structure"]
        and mixed_manual_executable_plan["manualReviewRequired"] is True
        and mixed_manual_executable_plan["manualReviewStillRequired"] is True,
        "the executable plan hid its unresolved manual-only risk",
    )
    checks.append("manual-only risks stay visible without starving one independent executable dimension")

    improved = build_rate_audit_report(
        source_text=TEMPLATE_HEAVY_TEXT,
        stages=[{"id": "round-1", "label": "第 1 轮", "round": 1, "text": NATURAL_TECHNICAL_TEXT}],
        current_chunks=[
            {"chunkId": "p0001-c00", "paragraphIndex": 0, "chunkIndex": 0, "text": NATURAL_TECHNICAL_TEXT},
        ],
        current_stage_id="round-1",
    )
    _assert(improved["isAiDetector"] is False, "RateAudit must never claim to be an AI detector")
    _assert(improved["baseline"]["riskPoints"] > improved["current"]["riskPoints"], "natural result should reduce heuristic risk points")
    _assert(improved["delta"]["riskPointChange"] < 0, "improved report must expose a negative point change")
    _assert(improved["stageCount"] == 2, "source and first round should both appear in the trajectory")
    _assert("第三方" in improved["disclaimer"], "report must carry an explicit third-party-detector disclaimer")
    _assert(improved["strategyPlan"]["decision"] == "stop", "a clean current result should stop automatic rewriting")
    checks.append("source-to-round trajectory reports an honest heuristic improvement")

    regressed = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        stages=[{"id": "round-1", "label": "第 1 轮", "round": 1, "text": TEMPLATE_HEAVY_TEXT}],
        current_chunks=[
            {"chunkId": "p0001-c00", "paragraphIndex": 0, "chunkIndex": 0, "text": TEMPLATE_HEAVY_TEXT},
        ],
        current_stage_id="round-1",
        current_prompt_id="round1",
    )
    _assert(regressed["delta"]["riskPointChange"] > 0, "template-heavy rewrite should be marked as regressed")
    _assert(regressed["delta"]["regressedDimensionCount"] > 0, "dimension delta should identify at least one regression")
    _assert(regressed["hotspots"] and regressed["hotspots"][0]["chunkId"] == "p0001-c00", "hotspot must retain the real compare chunk id")
    target_ids = [
        chunk_id
        for item in regressed["recommendations"]
        for chunk_id in item.get("targetChunkIds", [])
    ]
    _assert("p0001-c00" in target_ids, "recommendations must link back to affected Diff chunks")
    _assert(regressed["strategyPlan"]["decision"] == "targeted_rerun", "regressed signals should produce a targeted-rerun decision")
    _assert(regressed["strategyPlan"]["targetChunkIds"] == ["p0001-c00"], "strategy decision must retain executable chunk targets")
    _assert(regressed["strategyPlan"]["dimensionId"] == "transitions", "transition fixture must select the transition dimension")
    _assert(regressed["strategyPlan"]["recommendedPromptId"] == "round2", "transition repair must use its registered round2 prompt")
    _assert(regressed["strategyPlan"]["recommendedPromptId"] != regressed["strategyPlan"]["currentPromptId"], "targeted rerun must not blindly reuse the current prompt")
    checks.append("regressions become ranked dimensions, hotspots, and Diff targets")

    rhythm = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        stages=[{"id": "round-rhythm", "label": "节奏回归", "round": 2, "text": UNIFORM_RHYTHM_TEXT}],
        current_chunks=[
            {"chunkId": "rhythm-c1", "paragraphIndex": 0, "chunkIndex": 0, "text": UNIFORM_RHYTHM_TEXT},
        ],
        current_stage_id="round-rhythm",
        current_prompt_id="round2",
    )
    _assert(rhythm["strategyPlan"]["dimensionId"] == "rhythm", "uniform fixture must select rhythm")
    _assert(rhythm["strategyPlan"]["decision"] == "targeted_rerun", "rhythm remains an executable targeted dimension")
    _assert(rhythm["strategyPlan"]["recommendedPromptId"] == "round1", "rhythm must repair with round1 even when current prompt is round2")
    _assert(rhythm["strategyPlan"]["primaryMetric"] == "burstinessRatio", "rhythm strategy must expose its real evaluator metric")

    register = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        stages=[{"id": "round-register", "label": "语态回归", "round": 2, "text": PASSIVE_REGISTER_TEXT}],
        current_chunks=[
            {"chunkId": "register-c1", "paragraphIndex": 0, "chunkIndex": 0, "text": PASSIVE_REGISTER_TEXT},
        ],
        current_stage_id="round-register",
        current_prompt_id="round2",
    )
    _assert(register["strategyPlan"]["dimensionId"] == "register", "passive fixture must select register")
    _assert(register["strategyPlan"]["decision"] == "manual_review", "register must not claim an automatic closure without an evaluator")
    _assert(register["strategyPlan"]["canExecute"] is False, "manual-only register strategy must not be executable")
    _assert(register["strategyPlan"]["recommendedPromptId"] == "", "manual-only register strategy must not borrow round2")
    checks.append("strategy selection uses dimension repair prompts and fails closed for manual-only dimensions")

    baseline_only = build_rate_audit_report(
        source_text=TEMPLATE_HEAVY_TEXT,
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        next_prompt_id="prewrite",
    )
    _assert(baseline_only["strategyPlan"]["decision"] == "next_dimension", "source baseline should recommend the first workflow dimension")
    _assert(baseline_only["strategyPlan"]["recommendedPromptId"] == "prewrite", "source strategy must name the executable prompt")
    clean_baseline = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        next_prompt_id="prewrite",
    )
    _assert(clean_baseline["baseline"]["riskPoints"] == 0, "clean source fixture must remain signal-free")
    _assert(clean_baseline["strategyPlan"]["decision"] == "stop", "a signal-free source must not be pushed into a needless first rewrite")
    _assert(clean_baseline["strategyPlan"]["canExecute"] is False, "a signal-free source stop must not be executable")
    empty_baseline = build_rate_audit_report(
        source_text="",
        content_contract={"ready": True, "scopeReady": True, "formatLockReady": True},
        next_prompt_id="prewrite",
    )
    _assert(empty_baseline["strategyPlan"]["decision"] == "stop", "empty source input must never advertise an executable rewrite")
    blocked = build_rate_audit_report(
        source_text=TEMPLATE_HEAVY_TEXT,
        content_contract={"ready": False, "scopeReady": False, "formatLockReady": False},
        next_prompt_id="prewrite",
    )
    _assert(blocked["strategyPlan"]["decision"] == "blocked", "failed content contract must block strategy execution")
    _assert(blocked["readiness"]["status"] == "blocked", "dual-contract readiness must expose the hard block")
    checks.append("strategy plan only starts a source workflow when the baseline contains an explainable signal")

    selected = build_rate_audit_report(
        source_text=NATURAL_TECHNICAL_TEXT,
        stages=[
            {"id": "round-1", "label": "第 1 轮", "round": 1, "text": TEMPLATE_HEAVY_TEXT},
            {"id": "round-2", "label": "第 2 轮", "round": 2, "text": NATURAL_TECHNICAL_TEXT},
        ],
        current_stage_id="round-1",
    )
    _assert(selected["current"]["id"] == "round-1", "explicitly selected historical stage must remain current")
    _assert(selected["stageCount"] == 3, "trajectory should keep later stages even when inspecting an older round")
    checks.append("historical round selection is independent from trajectory ordering")

    oversized = build_rate_audit_report(source_text="句子。" * (RATE_AUDIT_MAX_CHARS // 3 + 20))
    _assert(oversized["baseline"]["truncated"] is True, "oversized reports must disclose truncation")
    _assert(oversized["baseline"]["analyzedCharCount"] <= RATE_AUDIT_MAX_CHARS, "analysis limit must be enforced")
    checks.append("oversized documents are bounded and truncation stays visible")
    return checks


def _exercise_service_and_route() -> list[str]:
    import app_service
    import web_app

    checks: list[str] = []
    origin_root = ROOT_DIR / "origin"
    finish_root = ROOT_DIR / "finish"
    origin_root.mkdir(parents=True, exist_ok=True)
    finish_root.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="rate-audit-origin-", dir=origin_root) as origin_temp, tempfile.TemporaryDirectory(
        prefix="rate-audit-output-", dir=finish_root
    ) as output_temp:
        source_path = Path(origin_temp) / "sample.txt"
        output_path = Path(output_temp) / "sample_round1.txt"
        source_path.write_text(TEMPLATE_HEAVY_TEXT, encoding="utf-8")
        fixture_text = app_service._release_gate_normalize_text(
            TEMPLATE_HEAVY_TEXT,
            TEMPLATE_HEAVY_TEXT,
        )

        # Build the fixture through the production candidate evaluator and
        # selector. An unchanged model response has no measurable gain, so the
        # bounded second attempt also remains unchanged and the authoritative
        # decision safely preserves the baseline. This gives the release gate
        # real selection/readability/hash evidence without certifying an
        # unrelated changed output.
        fixture_chunk = Chunk(
            "p0001-c00",
            0,
            0,
            fixture_text,
            len(fixture_text),
            0,
        )

        def identity_transform(chunk_text: str, _prompt: str, _round: int, _chunk_id: str) -> str:
            return chunk_text

        global_style_profile = build_global_style_profile_from_texts([fixture_text])
        source_pattern_profile = global_style_profile.get("documentPatternBaseline")
        _assert(isinstance(source_pattern_profile, dict), "fixture source-pattern profile is missing")
        source_profile_sha256 = str(source_pattern_profile.get("profileSha256", ""))
        _assert(bool(source_profile_sha256), "fixture source-pattern profile is not content-addressed")
        fixture_result = _rewrite_round_chunk(
            index=1,
            chunk=fixture_chunk,
            round_number=1,
            normalized_prompt_profile="cn_custom",
            prompt_text="仅在产生可测净收益时进行最少必要修改。",
            transform=identity_transform,
            global_style_profile=global_style_profile,
            round_dimension={"id": "neutral", "primaryMetric": ""},
        )
        candidate_selection = next(
            event
            for event in fixture_result.validation_events
            if event.get("event") == "candidate-selection"
        )
        _assert(candidate_selection.get("decision") == "preserved_baseline", "fixture selector did not preserve baseline")
        _assert(candidate_selection.get("publishedRewrite") is False, "fixture published a zero-gain candidate")
        output_path.write_text(fixture_result.output_text, encoding="utf-8")

        source_status = app_service.get_document_status(str(source_path))
        compare_path = app_service._find_compare_path_for_output(output_path)
        normalized_input = app_service._release_gate_normalize_text(fixture_text, fixture_text)
        normalized_output = app_service._release_gate_normalize_text(
            fixture_text,
            fixture_result.output_text,
        )
        source_relative_document_delta = assess_source_relative_document_delta(
            [normalized_input],
            [normalized_output],
        )
        _assert(source_relative_document_delta.get("passed") is True, "fixture document delta did not pass")
        fixture_compare_payload = {
            "version": ROUND_COMPARE_VERSION,
            "docId": source_status["docId"],
            "round": 1,
            "promptProfile": "cn_custom",
            "promptSequence": ["classical"],
            "chunkCount": 1,
            "paragraphCount": 1,
            "validationEvents": fixture_result.validation_events,
            "sourcePatternProfiles": {
                source_profile_sha256: source_pattern_profile,
            },
            "sourceRelativeDocumentDelta": source_relative_document_delta,
            "chunks": [
                {
                    "chunkId": "p0001-c00",
                    "paragraphIndex": 0,
                    "chunkIndex": 0,
                    "inputText": fixture_text,
                    "outputText": fixture_result.output_text,
                    "outputCharCount": len(fixture_result.output_text),
                    "candidateBaselineText": fixture_text,
                    "candidateSelection": candidate_selection,
                }
            ],
        }
        compare_path.write_text(
            json.dumps(
                fixture_compare_payload,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        app_service._assert_document_release_payload(
            fixture_compare_payload,
            {"p0001-c00": "rewrite_confirmed"},
        )

        report = app_service.get_document_rate_audit(str(source_path), str(output_path))
        _assert(report["current"]["id"] == "current", "unindexed explicit output should be audited as the current result")
        _assert(report["currentOutputPath"] == str(output_path.resolve()), "selected output identity must be stable")
        _assert(report["contentContract"]["ready"] is True, "rate-audit must include the document edit contract")
        _assert(report["contentContract"]["formatLockApplicable"] is False, "TXT report must disclose that Word format lock is not applicable")
        _assert(report["strategyPlan"]["decision"] in {"stop", "targeted_rerun", "next_dimension", "manual_review"}, "service report must expose an honest strategy decision")
        checks.append("application service audits an explicit workspace result without history records")

        app_service.save_review_decisions(str(output_path), {"p0001-c00": "source_confirmed"})
        reviewed_report = app_service.get_document_rate_audit(str(source_path), str(output_path))
        _assert(
            reviewed_report["current"]["riskPoints"] == reviewed_report["baseline"]["riskPoints"],
            "rate-audit document score must analyze the source text selected for export",
        )
        _assert(
            reviewed_report.get("hotspots")
            and reviewed_report["hotspots"][0]["chunkId"] == "p0001-c00",
            "rate-audit hotspots must analyze the same selected source chunk",
        )
        _assert(
            reviewed_report.get("effectiveText", {}).get("source") == "review_materialized_compare"
            and reviewed_report.get("effectiveText", {}).get("reviewDecisionCount") == 1,
            "rate-audit must disclose that saved review decisions were materialized",
        )
        checks.append("saved source/custom review decisions drive both audit scores and chunk hotspots")

        client = web_app.app.test_client()
        response = client.get(
            "/api/rate-audit",
            query_string={"sourcePath": str(source_path), "outputPath": str(output_path)},
        )
        _assert(response.status_code == 200, "rate-audit endpoint should return HTTP 200 for workspace files")
        payload = response.get_json()
        _assert(isinstance(payload, dict) and payload.get("label") == "heuristic-rate-audit", "endpoint payload label is unstable")

        outside_source = client.get("/api/rate-audit", query_string={"sourcePath": str(ROOT_DIR / "README.md")})
        _assert(outside_source.status_code == 400, "rate-audit must reject source files outside origin")
        outside_output = client.get(
            "/api/rate-audit",
            query_string={"sourcePath": str(source_path), "outputPath": str(ROOT_DIR / "README.md")},
        )
        _assert(outside_output.status_code == 400, "rate-audit must reject outputs outside finish")
        alien_output = Path(output_temp) / "alien_round1.txt"
        alien_output.write_text(TEMPLATE_HEAVY_TEXT, encoding="utf-8")
        alien_compare = app_service._find_compare_path_for_output(alien_output)
        alien_compare.write_text(
            json.dumps({"version": 1, "docId": "origin/another-document.txt", "round": 1, "chunks": []}),
            encoding="utf-8",
        )
        alien_response = client.get(
            "/api/rate-audit",
            query_string={"sourcePath": str(source_path), "outputPath": str(alien_output)},
        )
        _assert(alien_response.status_code == 400, "rate-audit must reject outputs that belong to another document")
        checks.append("HTTP endpoint preserves path boundaries and document ownership")
    return checks


def main() -> int:
    checks = [*_exercise_pure_report(), *_exercise_service_and_route()]
    report = {
        "ok": True,
        "checks": checks,
    }
    report_path = ROOT_DIR / "finish" / "regression" / "rate_audit_regression_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
