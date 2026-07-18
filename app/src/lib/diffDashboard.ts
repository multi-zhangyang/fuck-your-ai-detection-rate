import type { DiffFilterMode } from "@/components/ResultCard";
import { hasFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export type DiffFailureLike = {
  chunkId: string;
};
export type DiffDashboardStats = {
  chunkCount: number;
  reviewCount: number;
  highRiskCount: number;
  failedCount: number;
  preferredFilter: DiffFilterMode;
  preferredChunkId?: string;
};

export function isFailedOutputDecision(decision: ReviewDecision): boolean {
  return typeof decision === "object"
    && (decision.source === "failed_output" || decision.source === "rejected_candidate");
}

export function isReviewDecisionResolved(decision?: ReviewDecision): boolean {
  if (!decision) return false;
  if (typeof decision === "object") {
    return !isFailedOutputDecision(decision);
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

export function isHighRiskFailedOutputChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  const flags = chunk.quality?.flags ?? [];
  const hasHardValidationFallback = chunk.fallbackMode === "source"
    || flags.includes("source_fallback")
    || flags.includes("targeted_rerun_fallback")
    || chunk.rerunStatus === "fallback"
    || Boolean(chunk.rerunFallbackMode);
  return Boolean(hasFailedAttemptEvidence(chunk) && hasHardValidationFallback);
}

export function buildDiffDashboardStats(
  compareData: RoundCompareData | null,
  failures: DiffFailureLike[],
  reviewDecisions: Record<string, ReviewDecision>,
): DiffDashboardStats {
  if (!compareData?.chunks.length) {
    return {
      chunkCount: 0,
      reviewCount: 0,
      highRiskCount: 0,
      failedCount: 0,
      preferredFilter: "all",
    };
  }
  const failedChunkIds = failures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const highRiskChunkIds = compareData.chunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]))
    .map((chunk) => chunk.chunkId);
  const highRiskChunkIdSet = new Set(highRiskChunkIds);
  const reviewChunkIds = compareData.chunks
    .filter((chunk) => {
      const flags = chunk.quality?.flags ?? [];
      return !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
        || chunk.rateAuditStrategyReviewRequired === true
        || chunk.fallbackMode === "source"
        || flags.includes("source_fallback"));
    })
    .map((chunk) => chunk.chunkId);
  const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : highRiskChunkIds.length ? "highRisk" : reviewChunkIds.length ? "review" : "all";
  return {
    chunkCount: compareData.chunkCount ?? compareData.chunks.length,
    reviewCount: reviewChunkIds.length,
    highRiskCount: highRiskChunkIds.length,
    failedCount: failedChunkIds.length,
    preferredFilter,
    preferredChunkId: failedChunkIds[0] ?? highRiskChunkIds[0] ?? reviewChunkIds[0],
  };
}

export function formatDiffDashboardLabel(stats: DiffDashboardStats): string {
  if (!stats.chunkCount) {
    return "未生成";
  }
  const parts = [`${stats.chunkCount} 块`];
  if (stats.reviewCount) parts.push(`${stats.reviewCount} 需处理`);
  if (stats.highRiskCount) parts.push(`${stats.highRiskCount} 高风险`);
  if (stats.failedCount) parts.push(`${stats.failedCount} 失败`);
  if (parts.length === 1) parts.push("已稳定");
  return parts.join(" · ");
}
