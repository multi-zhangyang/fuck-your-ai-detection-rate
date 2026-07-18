import type { RerunFailure } from "@/lib/diffFilterModel";
import { deriveChunkDecisionEvidence } from "@/lib/chunkDecisionEvidence";
import {
  getDefaultReviewDecisionForChunk,
  getDecisionDisplayOutput,
  isReviewDecisionConfirmed,
} from "@/lib/resultCardHelpers";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export function deriveRewriteDiffChunkViewState(input: {
  chunk: RoundCompareData["chunks"][number];
  reviewDecisions: Record<string, ReviewDecision>;
  reviewChunkIdSet: Set<string>;
  changedChunkIdSet: Set<string>;
  numberRiskChunkIdSet: Set<string>;
  citationRiskChunkIdSet: Set<string>;
  highRiskChunkIdSet: Set<string>;
  rerunFailureByChunk: Map<string, RerunFailure>;
  streamChunkId?: string | null;
  focusedChunkId?: string | null;
}) {
  const {
    chunk,
    reviewDecisions,
    reviewChunkIdSet,
    changedChunkIdSet,
    numberRiskChunkIdSet,
    citationRiskChunkIdSet,
    highRiskChunkIdSet,
    rerunFailureByChunk,
    streamChunkId,
    focusedChunkId,
  } = input;
  const rerunFailure = rerunFailureByChunk.get(chunk.chunkId);
  const needsReview = reviewChunkIdSet.has(chunk.chunkId);
  const hasChangedText = changedChunkIdSet.has(chunk.chunkId);
  const hasNumberRisk = numberRiskChunkIdSet.has(chunk.chunkId);
  const hasCitationRisk = citationRiskChunkIdSet.has(chunk.chunkId);
  const hasHighRiskFailedOutput = highRiskChunkIdSet.has(chunk.chunkId);
  const decision = reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk);
  const strategyReviewPending = chunk.rateAuditStrategyReviewRequired === true
    && !isReviewDecisionConfirmed(decision);
  const decisionEvidence = deriveChunkDecisionEvidence(
    chunk,
    decision,
    strategyReviewPending,
  );
  // Partial provider output is never a review candidate.  The Diff stays on
  // the last complete, validated decision until the finished answer passes
  // the backend gates and refreshes the compare artifact.
  const displayOutput = getDecisionDisplayOutput(chunk, decision);
  return {
    rerunFailure,
    needsReview,
    hasChangedText,
    hasNumberRisk,
    hasCitationRisk,
    hasHighRiskFailedOutput,
    decision,
    strategyReviewPending,
    decisionEvidence,
    displayOutput,
    isFocused: focusedChunkId === chunk.chunkId,
    isStreamTarget: streamChunkId === chunk.chunkId,
  };
}
