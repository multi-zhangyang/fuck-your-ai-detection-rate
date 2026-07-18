import { formatBatchRerunSummary } from "@/lib/exportHelpers";
import { normalizeChunkCandidateSelection } from "@/lib/candidateSelectionEvidence";
import type {
  BatchRerunFailure,
  BatchRerunResult,
  BatchRerunStatus,
} from "@/types/app";

export { formatBatchRerunSummary };

const PRESERVED_REASON_LABELS: Record<string, string> = {
  document_pattern_delta_accumulation_blocked: "全文累计模式达到阻断线",
  repeated_opening_family_introduced: "新增重复开头",
  repeated_sentence_skeleton_introduced: "新增重复句架",
  sentence_boundary_collapse_introduced: "句界坍缩",
  sentence_fragmentation_introduced: "短句碎裂",
  source_pattern_profile_invalid: "全文原稿模式基线无效",
  no_safe_changed_generated_candidate: "没有候选同时通过安全门禁并形成有效变化",
  no_same_dimension_converged_candidate: "没有候选通过同维复评分",
  no_measurable_combined_style_gain: "没有可测的净收益",
  no_combined_style_gain: "没有可靠的综合风格收益",
};

function summarizePreservedCandidateSelection(
  candidateSelectionAttempt: unknown,
): { reasonLabels: string[] } | null {
  const selection = normalizeChunkCandidateSelection(candidateSelectionAttempt);
  if (!selection || selection.publishedRewrite) return null;
  const codes = [
    ...selection.reasonCodes,
    ...selection.resultSourceRelativeStyleDelta.blockingIssueCodes,
    ...(selection.documentArbitration?.rejectedDocumentDelta.blockingIssueCodes ?? []),
    ...selection.candidates.flatMap((candidate) => (
      candidate.origin === "model"
        ? candidate.sourceRelativeStyleDelta.blockingIssueCodes
        : []
    )),
  ];
  const reasonLabels: string[] = [];
  for (const code of codes) {
    const label = PRESERVED_REASON_LABELS[code];
    if (label && !reasonLabels.includes(label)) reasonLabels.push(label);
  }
  return { reasonLabels };
}

function preservedReasonSuffix(reasonLabels: string[]): string {
  return reasonLabels.length ? ` 原因：${reasonLabels.slice(0, 4).join("、")}。` : "";
}

function countValidPreservedAttempts(
  attempts: BatchRerunResult["preservedAttempts"],
): number {
  if (!Array.isArray(attempts)) return 0;
  return attempts.reduce((count, item) => (
    summarizePreservedCandidateSelection(item?.candidateSelectionAttempt) ? count + 1 : count
  ), 0);
}

export function buildPreservedCandidateSelectionNotice(
  candidateSelectionAttempt: unknown,
): string {
  const summary = summarizePreservedCandidateSelection(candidateSelectionAttempt);
  if (!summary) return "";
  return `没有模型候选胜出，原审核正文、自定义文本与审核决定均保持不变；未把 baseline 冒充为新改写。${preservedReasonSuffix(summary.reasonLabels)}`;
}

export function buildPreservedAttemptNotice(
  result: Pick<BatchRerunResult, "preservedAttempts" | "totalCount">,
): string {
  const attempts = Array.isArray(result.preservedAttempts) ? result.preservedAttempts : [];
  const reasonLabels: string[] = [];
  let firstValidAttempt: unknown;
  let validCount = 0;
  for (const item of attempts) {
    const summary = summarizePreservedCandidateSelection(item?.candidateSelectionAttempt);
    if (!summary) continue;
    if (validCount === 0) firstValidAttempt = item.candidateSelectionAttempt;
    validCount += 1;
    for (const label of summary.reasonLabels) {
      if (!reasonLabels.includes(label)) reasonLabels.push(label);
    }
  }
  if (!validCount) return "";
  if (validCount === 1 && result.totalCount === 1) {
    return buildPreservedCandidateSelectionNotice(firstValidAttempt);
  }
  return `其中 ${validCount} 块没有模型候选胜出，原审核正文、自定义文本与审核决定均保持不变；未把 baseline 冒充为新改写。${preservedReasonSuffix(reasonLabels)}`;
}

export function buildBatchRerunRuntimeStep(
  actionLabel: string,
  result: Pick<BatchRerunResult, "canceled" | "successCount" | "preservedAttempts">,
  failures: BatchRerunFailure[],
): string {
  const preservedCount = countValidPreservedAttempts(result.preservedAttempts);
  if (preservedCount > 0 && preservedCount === result.successCount && !failures.length) {
    return `${actionLabel}候选未胜出，原审核状态保持不变`;
  }
  if (result.successCount === 0 && failures.length) {
    return `${actionLabel}全部失败`;
  }
  if (result.canceled) {
    return `${actionLabel}已停止`;
  }
  if (failures.length) {
    return `${actionLabel}部分完成`;
  }
  return `${actionLabel}完成`;
}

export function buildBatchRerunNoticeSuffix(result: Pick<BatchRerunResult, "canceled">, suffix = ""): string {
  return result.canceled ? `${suffix}已停止；已完成的块已保留。` : suffix;
}

export function planBatchRerunFeedback(input: {
  actionLabel: string;
  result: Pick<BatchRerunResult, "successCount" | "totalCount" | "canceled" | "preservedAttempts">;
  failures: BatchRerunFailure[];
  suffix?: string;
}): {
  kind: "error" | "notice";
  message: string;
  runtimeStep: string;
} {
  const preservedNotice = buildPreservedAttemptNotice(input.result);
  const finalSuffix = buildBatchRerunNoticeSuffix(
    input.result,
    [input.suffix ?? "", preservedNotice].filter(Boolean).join(" "),
  );
  const message = formatBatchRerunSummary(
    input.actionLabel,
    input.result.successCount,
    input.result.totalCount,
    input.failures,
    finalSuffix,
  );
  const runtimeStep = buildBatchRerunRuntimeStep(input.actionLabel, input.result, input.failures);
  if (input.result.successCount === 0 && input.failures.length) {
    return { kind: "error", message, runtimeStep };
  }
  return { kind: "notice", message, runtimeStep };
}

export function toOptionalUiFeedbackFromBatchPlan(
  feedback: ReturnType<typeof planBatchRerunFeedback>,
): { setError?: string; notice?: string; runtimeStep?: string } {
  return feedback.kind === "error"
    ? { setError: feedback.message, runtimeStep: feedback.runtimeStep }
    : { notice: feedback.message, runtimeStep: feedback.runtimeStep };
}

export function formatBatchRerunProgress(label: string, status: BatchRerunStatus): string {
  const chunkText = status.currentChunkId ? `：${status.currentChunkId}` : "";
  const cancelText = status.cancelRequested ? "，正在停止" : "";
  return `${label} ${status.completedCount}/${status.totalCount}${chunkText}；成功 ${status.successCount}，失败 ${status.failureCount}${cancelText}`;
}
