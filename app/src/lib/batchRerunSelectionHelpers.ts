import type {
  BatchRerunFailure,
  ReviewDecision,
} from "@/types/app";

export function upsertScopedRerunFailures(
  current: BatchRerunFailure[],
  failure: BatchRerunFailure,
  scopeKey: string | null | undefined,
): BatchRerunFailure[] {
  if (!failure.chunkId || failure.chunkId === "预览刷新" || !scopeKey) {
    return current;
  }
  const scopedFailure = { ...failure, scopeKey };
  return [
    ...current.filter((item) => !(item.scopeKey === scopeKey && item.chunkId === failure.chunkId)),
    scopedFailure,
  ];
}

export function selectRiskyRerunChunkIds<T extends {
  chunkId: string;
  quality?: { needsReview?: boolean } | null;
  rateAuditStrategyReviewRequired?: boolean;
}>(input: {
  chunks: T[] | null | undefined;
  unresolvedFailureChunkIds: Set<string>;
  reviewDecisions: Record<string, ReviewDecision | undefined>;
  isHighRiskFailedOutputChunk: (chunk: T) => boolean;
  isReviewDecisionResolved: (decision: ReviewDecision | undefined) => boolean;
}): string[] {
  return (input.chunks ?? [])
    .filter((chunk) => (
      Boolean(chunk.quality?.needsReview)
      && chunk.rateAuditStrategyReviewRequired !== true
      && !input.unresolvedFailureChunkIds.has(chunk.chunkId)
      && !input.isHighRiskFailedOutputChunk(chunk)
      && !input.isReviewDecisionResolved(input.reviewDecisions[chunk.chunkId])
    ))
    .map((chunk) => chunk.chunkId);
}

export function buildUnresolvedFailureChunkIds(
  failures: Array<{ chunkId: string }>,
  reviewDecisions: Record<string, ReviewDecision | undefined>,
  isReviewDecisionResolved: (decision: ReviewDecision | undefined) => boolean,
): Set<string> {
  return new Set(
    failures
      .filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId]))
      .map((failure) => failure.chunkId),
  );
}
