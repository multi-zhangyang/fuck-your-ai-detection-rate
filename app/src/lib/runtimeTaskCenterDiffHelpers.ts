import { isHighRiskFailedOutputChunk, isReviewDecisionResolved } from "@/lib/diffDashboard";
import { getErrorRecoveryPlan } from "@/lib/errorRecovery";
import type { DiffFilterMode } from "@/lib/diffFilterModel";
import type { RuntimeTaskCenterActions, RuntimeTaskCenterItem } from "@/lib/runtimeTaskCenterTypes";
import type {
  BatchRerunFailure,
  ReviewDecision,
  RoundCompareData,
} from "@/types/app";

export function appendDiffReviewTask(
  items: RuntimeTaskCenterItem[],
  input: {
    activeCompareData: RoundCompareData | null;
    activeRerunFailures: BatchRerunFailure[];
    reviewDecisions: Record<string, ReviewDecision>;
    actions: RuntimeTaskCenterActions;
  },
): void {
  if (!input.activeCompareData?.chunks.length) return;
  const failedChunkIds = input.activeRerunFailures
    .filter((failure) => !isReviewDecisionResolved(input.reviewDecisions[failure.chunkId]))
    .map((failure) => failure.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const highRiskChunkIds = input.activeCompareData.chunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionResolved(input.reviewDecisions[chunk.chunkId]))
    .map((chunk) => chunk.chunkId);
  const highRiskChunkIdSet = new Set(highRiskChunkIds);
  const reviewChunkIds = input.activeCompareData.chunks
    .filter((chunk) => {
      const flags = chunk.quality?.flags ?? [];
      return !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(input.reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
          || chunk.rateAuditStrategyReviewRequired === true
          || chunk.fallbackMode === "source"
          || flags.includes("source_fallback"));
    })
    .map((chunk) => chunk.chunkId);
  const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : highRiskChunkIds.length ? "highRisk" : "review";
  const preferredChunkId = failedChunkIds[0] ?? highRiskChunkIds[0] ?? reviewChunkIds[0];
  if (reviewChunkIds.length || highRiskChunkIds.length || failedChunkIds.length) {
    items.push({
      id: `diff-action:${input.activeCompareData.outputPath || input.activeCompareData.docId}:${reviewChunkIds.length}:${highRiskChunkIds.length}:${failedChunkIds.length}`,
      title: failedChunkIds.length ? "Diff 有优化失败" : highRiskChunkIds.length ? "Diff 有高风险" : "Diff 有内容需确认",
      status: failedChunkIds.length ? "需处理" : highRiskChunkIds.length ? "高风险" : "待审阅",
      tone: failedChunkIds.length || highRiskChunkIds.length ? "red" : "amber",
      running: false,
      actionLabel: preferredFilter === "failed" ? "查看失败内容" : preferredFilter === "highRisk" ? "查看高风险" : "只看待确认",
      onAction: () => input.actions.openDiffTaskTarget(preferredFilter, preferredChunkId),
    });
  }
}

export function appendErrorRecoveryTask(
  items: RuntimeTaskCenterItem[],
  error: string,
  actions: RuntimeTaskCenterActions,
): void {
  if (!error.trim()) return;
  const recoveryPlan = getErrorRecoveryPlan(error);
  items.push({
    id: `error:${error.slice(0, 80)}`,
    title: "最近失败",
    status: "需要处理",
    tone: recoveryPlan.tone,
    running: false,
    actionLabel: recoveryPlan.actionLabel,
    onAction: () => actions.openTaskTargetView(recoveryPlan.target),
  });
}
