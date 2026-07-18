import {
  isHighRiskFailedOutputChunk,
  getDefaultReviewDecisionForChunk,
  isReviewDecisionConfirmed,
} from "@/lib/resultCardHelpers";
import type { ReviewDecision, RoundCompareData, RoundResult } from "@/types/app";

export function deriveResultCardOutputState(input: {
  result: RoundResult | null;
  compareData: RoundCompareData | null;
  checkpointPending?: boolean;
  reviewDecisions: Record<string, ReviewDecision>;
}) {
  const result = input.result;
  const compareData = input.compareData;
  const reviewDecisions = input.reviewDecisions;
  const checkpointPending = input.checkpointPending;
  const compareReady = Boolean(
    compareData?.outputPath
    && compareData.chunks.length > 0
    && compareData.chunkCount > 0
    && compareData.chunkCount === compareData.chunks.length,
  );
  const hasOutput = compareReady;
  const outputReady = Boolean(compareReady && (result?.outputPath || compareData?.outputPath) && !checkpointPending);
  const hasRerunnableReviewChunks = Boolean(compareData?.chunks.some((chunk) => {
    return Boolean(chunk.quality?.needsReview)
      && !isHighRiskFailedOutputChunk(chunk)
      && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk));
  }));
  return {
    compareReady,
    hasOutput,
    outputReady,
    hasRerunnableReviewChunks,
  };
}
