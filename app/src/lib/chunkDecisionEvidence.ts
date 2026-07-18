import type {
  CandidateSelectionCandidate,
  ChunkCandidateSelection,
  RerunDimensionDirection,
  ReviewDecision,
  RoundCompareChunk,
} from "@/types/app";
import { normalizeChunkCandidateSelection } from "@/lib/candidateSelectionEvidence";
import { formatFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";

export type ChunkDecisionEvidenceTone = "success" | "warning" | "danger" | "neutral";

export type CandidateSelectionCandidateView = {
  candidateId: string;
  label: string;
  selected: boolean;
  hardGateLabel: string;
  hardGateTone: ChunkDecisionEvidenceTone;
  readabilityLabel: string;
  readabilityTone: ChunkDecisionEvidenceTone;
  sourcePatternLabel: string;
  sourcePatternTone: ChunkDecisionEvidenceTone;
  documentImpactLabel: string;
  documentImpactTone: ChunkDecisionEvidenceTone;
  sentenceBoundaryLabel: string;
  sentenceBoundaryTone: ChunkDecisionEvidenceTone;
  factualGuardLabel: string;
  factualGuardTone: ChunkDecisionEvidenceTone;
  retentionScore: string;
  retentionMinimum: string;
  retentionPassed: boolean;
  retentionDetail: string;
  dimensionLabel: string;
  metricLabel: string;
  metricValue: string;
  metricStatus: string;
  metricNote: string;
  stylePenalty: string;
  safetyLabel: string;
  rejectionLabels: string[];
};

export type CandidateSelectionView = {
  decisionLabel: string;
  decisionTone: ChunkDecisionEvidenceTone;
  selectedLabel: string;
  callLabel: string;
  retryLabel: string;
  comparisonLabel: string;
  reasonLabels: string[];
  candidates: CandidateSelectionCandidateView[];
  disclaimer: string;
};

export type ChunkDecisionEvidence = {
  outcomeLabel: string;
  outcomeDetail: string;
  outcomeTone: ChunkDecisionEvidenceTone;
  attemptCount: number;
  dimensionLabel: string;
  metricLabel: string;
  metricValue: string;
  metricStatus: string;
  metricNote: string;
  riskCodeChange: string;
  hardGateLabel: string;
  hardGateDetail: string;
  hardGateTone: ChunkDecisionEvidenceTone;
  previousTextPreserved: boolean;
  candidateSelection: CandidateSelectionView | null;
};

const METRIC_LABELS: Record<string, string> = {
  burstinessRatio: "句法与节奏",
  connectorDensity: "公式化连接词密度",
  templateDensity: "模板与空泛表达密度",
  structureConcentration: "表层结构集中度",
};

const DIMENSION_LABELS: Record<string, string> = {
  sentence_structure: "句法与节奏",
  transitions: "衔接脚手架",
  template_expression: "模板与空泛表达",
  structure: "段落与枚举结构",
};

const SELECTION_REASON_LABELS: Record<string, string> = {
  no_safe_changed_generated_candidate: "没有同时通过安全条件且产生有效变化的模型候选",
  no_same_dimension_converged_candidate: "没有模型候选通过同维复评分",
  same_dimension_converged: "所选候选通过同维复评分",
  style_regression_within_safety_tolerance: "跨维风格变化仍在安全容差内",
  same_dimension_gain_outweighed_by_cross_dimension_style_regression: "同维收益不足以抵消其他风格维度退化",
  same_dimension_preserved: "原 baseline 已满足同维条件",
  combined_style_penalty_improved: "综合风格惩罚下降",
  baseline_already_same_dimension_safe: "baseline 已满足同维安全条件",
  no_combined_style_gain: "模型候选没有带来可靠的综合风格收益",
  hard_and_factual_guards_passed: "所选候选通过硬门禁和事实关系校验",
  combined_style_penalty_not_worse: "综合风格惩罚没有变差",
  no_measurable_combined_style_gain: "没有可测的净收益，保留 baseline",
  all_model_candidates_failed_hard_validation: "所有模型候选均未通过硬门禁",
  baseline_preserved_but_round_failed: "运行失败并显式保留 baseline",
  document_pattern_delta_accumulation_blocked: "全文累计模式达到阻断线，已保留 baseline",
  repeated_opening_family_introduced: "候选使重复开头在全文累计超线",
  repeated_sentence_skeleton_introduced: "候选使重复句架在全文累计超线",
  sentence_boundary_collapse_introduced: "候选合并了过多原句边界",
  sentence_fragmentation_introduced: "候选新增了过多短碎句",
};

const CANDIDATE_REJECTION_LABELS: Record<string, string> = {
  hard_validation_failed: "硬门禁未通过",
  factual_relation_guard_failed: "事实关系校验未通过",
  deterministic_lexical_retention_below_minimum: "确定性词汇保留代理低于最低线",
  no_material_change: "与 baseline 没有有效变化",
  same_dimension_not_effective: "同维方向没有改善",
  academic_readability_delta_failed: "学术可读性增量门禁未通过",
  source_relative_style_delta_failed: "相对原稿的写作结构增量门禁未通过",
};

const SOURCE_RELATIVE_ISSUE_LABELS: Record<string, string> = {
  repeated_opening_family_introduced: "新增重复开头家族",
  repeated_sentence_skeleton_introduced: "新增重复句架",
  sentence_boundary_collapse_introduced: "句界坍缩：多句被压成一长句",
  sentence_fragmentation_introduced: "短句碎裂：新增过多短碎句",
  source_pattern_profile_invalid: "全文原稿模式基线无效",
};

const READABILITY_ISSUE_LABELS: Record<string, string> = {
  colloquial_register_introduced: "新增口语化或非正式表达",
  academic_collocation_conflict_introduced: "新增学术动宾搭配冲突",
  predicate_completeness_regression: "新增谓语不完整或介词结构悬空",
  telegraphic_clause_chain_introduced: "新增电报式无主语谓语串联",
  vague_causal_reference_introduced: "新增因果或论证指代不清",
};

const HARD_VALIDATION_ISSUE_LABELS: Record<string, string> = {
  academic_register_drift: "学术语域偏移：候选新引入口语化表达",
};

const FACTUAL_ISSUE_LABELS: Record<string, string> = {
  entity_order_changed: "实体顺序发生变化",
  entity_value_binding_missing_entity: "实体与数值绑定缺少实体",
  entity_value_binding_missing_number: "实体与数值绑定缺少数值",
  negation_scope_removed: "否定范围可能丢失",
  factual_scope_qualifier_changed: "事实范围限定词发生新增、删除或类型变化",
  number_order_changed: "数值顺序发生变化",
};

const LEXICAL_RETENTION_DISCLAIMER = "确定性词汇保留分数只衡量词项/CJK 字符覆盖、输出词项精度与长度稳定性；原稿模式、全文影响和句界稳定属于 provider-independent 写作结构启发式，只判断候选相对原稿新增了什么，不判断作者身份，不证明语义等价，不使用向量嵌入或模型裁判，也不是第三方 AI 检测器、检测率或通过率。";

function compactText(value: unknown, maxChars = 220): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function formatMetricNumber(value: unknown): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "";
  if (Number.isInteger(numeric)) return String(numeric);
  return numeric.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
}

function reasonLabels(codes: string[], labels: Record<string, string>, fallback: string): string[] {
  return codes
    .map((code) => labels[code] || fallback)
    .filter((label, index, items) => items.indexOf(label) === index);
}

function directionPassed(direction: RerunDimensionDirection): boolean {
  return Boolean(
    (direction.ok === true || direction.satisfied === true)
    && direction.structureDirection?.effective !== false
  );
}

function candidateView(
  candidate: CandidateSelectionCandidate,
  selection: ChunkCandidateSelection,
): CandidateSelectionCandidateView {
  const direction = candidate.sameDimensionDirection;
  const primaryMetric = String(direction.primaryMetric || "");
  const dimensionId = String(direction.dimensionId || "");
  const before = formatMetricNumber(direction.before);
  const after = formatMetricNumber(direction.after);
  const proxy = candidate.deterministicLexicalRetentionProxy;
  const sourceRelative = candidate.sourceRelativeStyleDelta;
  const sourceIssueLabels = reasonLabels(
    sourceRelative.blockingIssueCodes,
    SOURCE_RELATIVE_ISSUE_LABELS,
    "其他相对原稿结构退化",
  );
  const factualLabels = reasonLabels(
    candidate.factualIssueCodes,
    FACTUAL_ISSUE_LABELS,
    "其他事实关系问题",
  );
  const rejectionLabels = [
    ...reasonLabels(candidate.rejectionReasonCodes, CANDIDATE_REJECTION_LABELS, "其他安全约束"),
    ...reasonLabels(candidate.hardValidationIssueCodes, HARD_VALIDATION_ISSUE_LABELS, "其他硬门禁问题"),
    ...reasonLabels(candidate.readabilityIssueCodes || [], READABILITY_ISSUE_LABELS, "其他学术可读性退化"),
    ...sourceIssueLabels,
    ...factualLabels,
  ].filter((label, index, items) => items.indexOf(label) === index);
  const academicRegisterDrift = candidate.hardValidationIssueCodes.includes("academic_register_drift");
  const openingDelta = sourceRelative.openingFamilyDelta;
  const skeletonDelta = sourceRelative.sentenceSkeletonDelta;
  const boundaryDelta = sourceRelative.sentenceBoundaryDelta;
  const profileInvalid = sourceRelative.contextScope === "invalid"
    || sourceRelative.blockingIssueCodes.includes("source_pattern_profile_invalid");
  const patternBlocked = profileInvalid
    || openingDelta.blockingPatternCount > 0
    || skeletonDelta.blockingPatternCount > 0;
  const boundaryBlocked = boundaryDelta.collapsed || boundaryDelta.fragmented;
  return {
    candidateId: candidate.candidateId,
    label: candidate.origin === "baseline" ? "Baseline（上一版）" : `模型候选 ${candidate.attempt}`,
    selected: candidate.candidateId === selection.selectedCandidateId,
    hardGateLabel: candidate.hardValid
      ? "硬门禁通过"
      : academicRegisterDrift
        ? "学术语域硬门禁失败"
        : "硬门禁失败",
    hardGateTone: candidate.hardValid ? "success" : "danger",
    readabilityLabel: candidate.readabilityGuardPassed === undefined
      ? "可读性增量证据未提供"
      : candidate.readabilityGuardPassed
        ? "学术可读性增量通过"
        : `学术可读性 ${Math.max(1, candidate.readabilityIssueCodes?.length || 0)} 项退化`,
    readabilityTone: candidate.readabilityGuardPassed === undefined
      ? "neutral"
      : candidate.readabilityGuardPassed ? "success" : "danger",
    sourcePatternLabel: patternBlocked
      ? sourceIssueLabels.filter((label) => label.includes("开头") || label.includes("句架") || label.includes("基线")).join("；") || "原稿模式增量未通过"
      : openingDelta.introducedPatternCount || skeletonDelta.introducedPatternCount
        ? "观察到变化，但未达到阻断线"
        : "未新增重复开头或重复句架",
    sourcePatternTone: patternBlocked ? "danger" : "success",
    documentImpactLabel: profileInvalid
      ? "全文原稿模式基线损坏，未降级为本块判断"
      : sourceRelative.contextScope === "document"
      ? patternBlocked
        ? "替换后全文模式累计超线"
        : `全文上下文通过 · 最大开头计数 ${openingDelta.maxDocumentAfterCount} · 最大句架计数 ${skeletonDelta.maxDocumentAfterCount}`
      : "仅本块上下文；未伪装成全文结论",
    documentImpactTone: patternBlocked ? "danger" : sourceRelative.contextScope === "document" ? "success" : "neutral",
    sentenceBoundaryLabel: boundaryDelta.collapsed
      ? "句界坍缩：多句被压成一长句"
      : boundaryDelta.fragmented
        ? "短句碎裂：新增过多短碎句"
        : `句界稳定 · ${boundaryDelta.inputSentenceCount} → ${boundaryDelta.outputSentenceCount} 句`,
    sentenceBoundaryTone: boundaryBlocked ? "danger" : "success",
    factualGuardLabel: candidate.factualGuardPassed
      ? "事实关系通过"
      : `事实关系 ${Math.max(1, candidate.factualIssueCodes.length)} 项问题`,
    factualGuardTone: candidate.factualGuardPassed ? "success" : "danger",
    retentionScore: proxy.score.toFixed(3),
    retentionMinimum: proxy.minimumScore.toFixed(3),
    retentionPassed: proxy.score >= proxy.minimumScore,
    retentionDetail: `源词项覆盖 ${proxy.sourceCoverage.toFixed(3)} · 输出词项精度 ${proxy.outputPrecision.toFixed(3)} · 长度稳定 ${proxy.lengthSimilarity.toFixed(3)}`,
    dimensionLabel: DIMENSION_LABELS[dimensionId] || dimensionId || "同维判定",
    metricLabel: METRIC_LABELS[primaryMetric] || primaryMetric || "同维判定",
    metricValue: before && after ? `${before} → ${after}` : "定性判定",
    metricStatus: directionPassed(direction) ? "同维通过" : "同维未通过",
    metricNote: compactText(direction.note),
    stylePenalty: candidate.stylePenalty === null ? "未计算" : formatMetricNumber(candidate.stylePenalty),
    safetyLabel: candidate.safetyEligible ? "可进入选择" : "不可选择",
    rejectionLabels,
  };
}

function buildCandidateSelectionView(selection: ChunkCandidateSelection): CandidateSelectionView {
  const selected = selection.candidates.find((candidate) => candidate.candidateId === selection.selectedCandidateId);
  const selectedLabel = selected?.origin === "model"
    ? `模型候选 ${selected.attempt}`
    : "Baseline（上一版）";
  const decisionLabel = selection.runFailed
    ? "运行失败，保留 baseline"
    : selection.publishedRewrite
      ? `选择 ${selectedLabel}`
      : "保留 baseline";
  return {
    decisionLabel,
    decisionTone: selection.runFailed ? "danger" : selection.publishedRewrite ? "success" : "warning",
    selectedLabel,
    callLabel: `${selection.modelAttemptCount} 次模型调用 / 上限 ${selection.modelAttemptLimit} 次`,
    retryLabel: selection.conditionalRetryCount
      ? `首个候选未满足选择条件，追加 ${selection.conditionalRetryCount} 次有界重试`
      : "首个候选已足够判定，没有追加条件重试",
    comparisonLabel: `比较 ${selection.candidates.length} 个版本（上限 ${selection.candidateLimit}，含 baseline）`,
    reasonLabels: reasonLabels(selection.reasonCodes, SELECTION_REASON_LABELS, "其他候选选择约束"),
    candidates: selection.candidates.map((candidate) => candidateView(candidate, selection)),
    disclaimer: LEXICAL_RETENTION_DISCLAIMER,
  };
}

function latestDirection(chunk: RoundCompareChunk): RerunDimensionDirection | null {
  const directions = Array.isArray(chunk.rerunDimensionConvergeDirections)
    ? chunk.rerunDimensionConvergeDirections
    : [];
  for (let index = directions.length - 1; index >= 0; index -= 1) {
    const item = directions[index];
    if (item && typeof item === "object" && !Array.isArray(item)) return item;
  }
  return null;
}

function latestHardGateDetail(chunk: RoundCompareChunk): string {
  return formatFailedAttemptEvidence(
    chunk,
    "候选未通过事实关系、引用、数字、术语、结构占位或适用的 Word 格式锚点校验。失败正文与原始错误未保存。",
  );
}

function deriveOutcome(
  chunk: RoundCompareChunk,
  decision: ReviewDecision,
  strategyReviewPending: boolean,
  selection: ChunkCandidateSelection | null,
): Pick<ChunkDecisionEvidence, "outcomeLabel" | "outcomeDetail" | "outcomeTone" | "previousTextPreserved"> {
  if (selection) {
    const selected = selection.candidates.find((candidate) => candidate.candidateId === selection.selectedCandidateId);
    const selectedLabel = selected?.origin === "model" ? `模型候选 ${selected.attempt}` : "baseline";
    if (decision === "source_confirmed") {
      return {
        outcomeLabel: "已确认保留上一版",
        outcomeDetail: "候选选择证据仍可复核，但你明确选择保留本轮输入正文；导出不会采用模型候选。",
        outcomeTone: "neutral",
        previousTextPreserved: true,
      };
    }
    if (decision === "rewrite_confirmed") {
      return {
        outcomeLabel: selection.publishedRewrite ? "所选候选已确认采用" : "已确认采用 baseline",
        outcomeDetail: selection.publishedRewrite
          ? `${selectedLabel} 经过有界选择后发布，并已由你明确确认采用。`
          : "有界选择没有发布新的模型改写；当前确认采用的仍是 baseline。",
        outcomeTone: selection.publishedRewrite ? "success" : "neutral",
        previousTextPreserved: !selection.publishedRewrite,
      };
    }
    if (selection.runFailed) {
      return {
        outcomeLabel: "运行失败，已保留 baseline",
        outcomeDetail: "所有模型候选均未满足发布条件；本轮失败，不会把 baseline 冒充为成功改写。",
        outcomeTone: "danger",
        previousTextPreserved: true,
      };
    }
    if (selection.publishedRewrite) {
      return {
        outcomeLabel: `有界选择采用 ${selectedLabel}`,
        outcomeDetail: "系统在 baseline 与有上限的模型候选之间按硬门禁、事实关系、同维方向、词汇保留代理和风格惩罚进行确定性选择。",
        outcomeTone: "success",
        previousTextPreserved: false,
      };
    }
    return {
      outcomeLabel: "没有模型候选胜出，保留 baseline",
      outcomeDetail: "模型候选没有同时满足安全与收益条件，因此显式保留本轮输入正文，不计为成功的新改写。",
      outcomeTone: "warning",
      previousTextPreserved: true,
    };
  }

  const reason = String(chunk.rerunNonConvergedReason || "");
  const nonConverged = chunk.rerunStatus === "non_converged" || Boolean(reason);
  if (nonConverged) {
    if (reason === "hard_validation_attempt_limit") {
      return {
        outcomeLabel: "未接收，已保留上一版",
        outcomeDetail: "候选在尝试上限内仍未通过本地硬门禁，没有替换此前已接受的正文。",
        outcomeTone: "danger",
        previousTextPreserved: true,
      };
    }
    return {
      outcomeLabel: "未收敛，已保留上一版",
      outcomeDetail: "候选虽然完成生成，但同一维度的复评分没有达到接收条件，因此没有覆盖此前已接受的正文。",
      outcomeTone: "warning",
      previousTextPreserved: true,
    };
  }

  if (chunk.rateAuditStrategyReviewRequired === true) {
    if (strategyReviewPending) {
      return {
        outcomeLabel: "候选通过，待人工确认",
        outcomeDetail: "候选已满足程序接收条件；确认前，导出和后续诊断仍使用安全原文或上一版已接受正文。",
        outcomeTone: "warning",
        previousTextPreserved: true,
      };
    }
    if (decision === "rewrite_confirmed") {
      return {
        outcomeLabel: "候选已确认采用",
        outcomeDetail: "程序证据已通过，且你已经明确采用这一候选。",
        outcomeTone: "success",
        previousTextPreserved: false,
      };
    }
    if (decision === "source_confirmed") {
      return {
        outcomeLabel: "已确认保留上一版",
        outcomeDetail: "候选证据仍可复核，但当前明确选择不采用该候选。",
        outcomeTone: "neutral",
        previousTextPreserved: true,
      };
    }
  }

  if (chunk.rerunDimensionConverged === true && decision === "rewrite_confirmed") {
    return {
      outcomeLabel: "候选已确认采用",
      outcomeDetail: "同维复评分与本地硬门禁均已通过，且你已经明确采用这一候选。",
      outcomeTone: "success",
      previousTextPreserved: false,
    };
  }
  if (chunk.rerunDimensionConverged === true && decision === "source_confirmed") {
    return {
      outcomeLabel: "已确认保留上一版",
      outcomeDetail: "候选通过程序证据，但你明确选择保留此前正文；导出不会采用该候选。",
      outcomeTone: "neutral",
      previousTextPreserved: true,
    };
  }

  return {
    outcomeLabel: chunk.rerunDimensionConverged === true ? "同维重跑已收敛" : "重跑证据已记录",
    outcomeDetail: chunk.rerunDimensionConverged === true
      ? "候选通过同一维度复评分；最终采用状态仍以当前审阅选择为准。"
      : "系统已记录本次重跑的判定证据，请结合审阅状态确认最终正文。",
    outcomeTone: chunk.rerunDimensionConverged === true ? "success" : "neutral",
    previousTextPreserved: false,
  };
}

export function deriveChunkDecisionEvidence(
  chunk: RoundCompareChunk,
  decision: ReviewDecision,
  strategyReviewPending: boolean,
): ChunkDecisionEvidence | null {
  const selection = normalizeChunkCandidateSelection(chunk.candidateSelection);
  const selectedCandidate = selection?.candidates.find(
    (candidate) => candidate.candidateId === selection.selectedCandidateId,
  ) ?? null;
  const direction = latestDirection(chunk) ?? selectedCandidate?.sameDimensionDirection ?? null;
  const hasEvidence = Boolean(
    selection
    || direction
    || chunk.rateAuditStrategyReviewRequired === true
    || chunk.rerunDimensionConverged !== undefined
    || chunk.rerunNonConvergedReason
    || chunk.rerunStatus === "non_converged"
  );
  if (!hasEvidence) return null;

  const outcome = deriveOutcome(chunk, decision, strategyReviewPending, selection);
  const primaryMetric = String(direction?.primaryMetric || "");
  const dimensionId = String(direction?.dimensionId || chunk.rateAuditStrategyEvaluatorDimensionId || "");
  const before = formatMetricNumber(direction?.before);
  const after = formatMetricNumber(direction?.after);
  const metricPassed = Boolean(
    chunk.rerunDimensionConverged === true
    || (direction && directionPassed(direction))
  );
  const riskCodesBefore = Array.isArray(direction?.riskCodesBefore) ? direction.riskCodesBefore : [];
  const riskCodesAfter = Array.isArray(direction?.riskCodesAfter) ? direction.riskCodesAfter : [];
  const reason = String(chunk.rerunNonConvergedReason || "");
  const selectionHardGateFailed = Boolean(
    selection?.runFailed
    || (selectedCandidate && (
      !selectedCandidate.hardValid
      || !selectedCandidate.factualGuardPassed
      || !selectedCandidate.safetyEligible
    ))
  );
  const hardGateFailed = reason === "hard_validation_attempt_limit" || selectionHardGateFailed;
  const dimensionOnlyFailure = reason === "dimension_attempt_limit" || (
    chunk.rerunStatus === "non_converged"
    && Boolean(direction)
    && !hardGateFailed
  );

  return {
    ...outcome,
    attemptCount: selection?.modelAttemptCount ?? Math.max(0, Number(chunk.rerunAttemptCount) || 0),
    dimensionLabel: DIMENSION_LABELS[dimensionId] || dimensionId || "同维复评分",
    metricLabel: METRIC_LABELS[primaryMetric] || primaryMetric || "同维判定",
    metricValue: before && after ? `${before} → ${after}` : "定性判定",
    metricStatus: metricPassed ? "满足接收条件" : direction ? "未满足接收条件" : "未提供数值证据",
    metricNote: compactText(direction?.note),
    riskCodeChange: riskCodesBefore.length || riskCodesAfter.length
      ? `同类风险项 ${riskCodesBefore.length} → ${riskCodesAfter.length}`
      : "",
    hardGateLabel: hardGateFailed
      ? selection?.runFailed ? "模型候选未通过发布门禁" : "硬门禁未通过"
      : "本地硬门禁已通过",
    hardGateDetail: selection?.runFailed
      ? `模型候选在调用上限内仍未通过发布条件；系统保留 baseline，并把本轮标记为失败。${latestHardGateDetail(chunk)}`
      : hardGateFailed
        ? latestHardGateDetail(chunk)
      : dimensionOnlyFailure
        ? "事实关系、引用、数字、术语、结构占位和适用的 Word 格式锚点已通过程序校验；候选仅因同维改善不足而未接收。"
        : "事实关系、引用、数字、术语、结构占位和适用的 Word 格式锚点已通过程序校验；学术语义仍需人工确认。",
    hardGateTone: hardGateFailed ? "danger" : "success",
    candidateSelection: selection ? buildCandidateSelectionView(selection) : null,
  };
}
