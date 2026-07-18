import { buildDefaultReviewDecisions, getDefaultReviewDecisionForChunk } from "@/lib/reviewDecisions";
import { buildRoundResultFromBatchRerunResult } from "@/lib/roundResultHelpers";
import type {
  BatchRerunFailure,
  BatchRerunResult,
  BatchRerunTarget,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export function pickCompletedBatchTargets(
  result: BatchRerunResult,
  targets: BatchRerunTarget[],
): BatchRerunTarget[] {
  const failedChunkIds = new Set(result.failures.map((failure) => failure.chunkId));
  const successChunkIds = new Set(result.successChunkIds ?? []);
  if (successChunkIds.size) {
    return [...successChunkIds].map((chunkId) => ({ chunkId }));
  }
  return targets.slice(0, result.completedCount).filter((target) => !failedChunkIds.has(target.chunkId));
}

export function buildBatchRerunReviewDecisions(
  compareData: RoundCompareData,
  current: Record<string, ReviewDecision>,
  completedTargets: BatchRerunTarget[],
): Record<string, ReviewDecision> {
  return {
    ...buildDefaultReviewDecisions(compareData),
    ...current,
    ...Object.fromEntries(
      completedTargets.map((target) => [target.chunkId, getDefaultReviewDecisionForChunk(compareData, target.chunkId)]),
    ),
  };
}

export function resolveBatchRerunRoundResult(
  result: BatchRerunResult,
  compareData: RoundCompareData,
  current: RoundResult | null,
): RoundResult | null {
  return buildRoundResultFromBatchRerunResult({ ...result, compare: compareData }, current);
}

export function appendBatchPreviewFailure(
  failures: BatchRerunFailure[],
  errorText: string,
): BatchRerunFailure[] {
  return [...failures, { chunkId: "预览刷新", error: errorText }];
}
