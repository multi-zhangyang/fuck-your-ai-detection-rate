import {
  getLatestFailedAttempt,
  getReviewDecisionMode,
  isHighRiskFailedOutputChunk,
  isReviewDecisionConfirmed,
  getChunkReviewReasons as getChunkReviewReasonsHelper,
} from "@/lib/resultCardHelpers";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export function deriveChunkQualityDecisionState(input: {
  chunk: RoundCompareData["chunks"][number];
  decision: ReviewDecision;
  forceNeedsReview?: boolean;
  reviewReasonHints?: string[];
}) {
  const quality = input.chunk.quality;
  const isConfirmed = isReviewDecisionConfirmed(input.decision);
  const strategyReviewRequired = input.chunk.rateAuditStrategyReviewRequired === true && !isConfirmed;
  const qualityNeedsReview = Boolean(quality?.needsReview) || strategyReviewRequired;
  const flags = quality?.flags ?? [];
  const advisoryFlags = quality?.advisoryFlags ?? [];
  const isSourceFallback = input.chunk.fallbackMode === "source" || flags.includes("source_fallback");
  const isTargetedFallback = flags.includes("targeted_rerun_fallback") || input.chunk.rerunStatus === "fallback" || Boolean(input.chunk.rerunFallbackMode);
  const isValidationFallback = isSourceFallback || isTargetedFallback;
  const failedAttempt = getLatestFailedAttempt(input.chunk);
  const isHighRiskFailedOutput = isHighRiskFailedOutputChunk(input.chunk);
  const selectedBaseDecision = getReviewDecisionMode(input.decision);
  const reviewToolsVisible = !isConfirmed && (qualityNeedsReview || isValidationFallback);
  const reviewReasons = isHighRiskFailedOutput
    ? []
    : [
        ...(strategyReviewRequired ? ["定点策略候选已通过同维度复评分，人工确认前导出仍保留原文。"] : []),
        ...getChunkReviewReasonsHelper(input.chunk, input.reviewReasonHints ?? []),
      ];
  const visibleFlags = isHighRiskFailedOutput
    ? flags.filter((flag) => flag !== "source_fallback" && flag !== "targeted_rerun_fallback")
    : flags;
  const needsReview = !isConfirmed && (Boolean(input.forceNeedsReview) || qualityNeedsReview);
  return {
    quality,
    qualityNeedsReview,
    strategyReviewRequired,
    flags,
    advisoryFlags,
    isSourceFallback,
    isTargetedFallback,
    isValidationFallback,
    failedAttempt,
    isHighRiskFailedOutput,
    selectedBaseDecision,
    isConfirmed,
    reviewToolsVisible,
    reviewReasons,
    visibleFlags,
    needsReview,
  };
}
