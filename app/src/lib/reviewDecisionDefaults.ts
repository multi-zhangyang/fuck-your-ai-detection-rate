import type { ReviewDecision, RoundCompareData } from "@/types/app";
import { isFailedOutputDecision } from "@/lib/diffDashboard";
import { hasFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";

const SOURCE_DEFAULT_FLAGS = new Set([
  "academic_register_drift",
  "citation_missing",
  "machine_style_drift",
  "machine_like_expression",
  "repeated_content",
  "template_phrase_density",
  "abstract_padding_density",
]);

export function hasPendingRateAuditStrategyCandidate(
  compareData: RoundCompareData | null,
  reviewDecisions: Record<string, ReviewDecision> = {},
): boolean {
  return Boolean(compareData?.chunks.some((chunk) => (
    chunk.rateAuditStrategyReviewRequired === true
    && !isExplicitReviewDecision(reviewDecisions[chunk.chunkId])
  )));
}

function isExplicitReviewDecision(decision: ReviewDecision | undefined): boolean {
  if (!decision) return false;
  if (typeof decision === "object") {
    return !isFailedOutputDecision(decision);
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

/**
 * Mirror the backend's safe export default for a chunk that has no explicit
 * reviewer decision. Current safety evidence always outranks a persisted
 * default from an older candidate generation.
 */
export function deriveDefaultReviewDecision(
  chunk: RoundCompareData["chunks"][number],
): Extract<ReviewDecision, "source" | "rewrite"> {
  const quality = chunk.quality;
  const flags = new Set((quality?.flags ?? []).map((flag) => String(flag)));
  if (chunk.rateAuditStrategyReviewRequired === true) return "source";
  if (
    chunk.fallbackMode === "source"
    || flags.has("source_fallback")
    || flags.has("targeted_rerun_fallback")
    || chunk.rerunStatus === "fallback"
    || Boolean(chunk.rerunFallbackMode)
  ) {
    return "source";
  }
  if (hasFailedAttemptEvidence(chunk) && Boolean(quality?.needsReview)) {
    return "source";
  }
  if ([...SOURCE_DEFAULT_FLAGS].some((flag) => flags.has(flag))) {
    return "source";
  }
  if (chunk.rerunDefaultDecision === "source" || chunk.rerunDefaultDecision === "rewrite") {
    return chunk.rerunDefaultDecision;
  }
  return "rewrite";
}
