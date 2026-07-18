import type {
  CustomReviewDecision,
  ReviewDecision,
  RoundCompareData,
} from "@/types/app";
import { deriveDefaultReviewDecision } from "@/lib/reviewDecisionDefaults";
import {
  getLatestFailedAttemptEvidence,
  hasFailedAttemptEvidence,
} from "@/lib/failedAttemptEvidence";

export function isReviewChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  return Boolean(chunk.quality?.needsReview)
    || chunk.rateAuditStrategyReviewRequired === true
    || isHardValidationFallbackChunk(chunk);
}

export function getLatestFailedAttempt(chunk: RoundCompareData["chunks"][number]): NonNullable<RoundCompareData["chunks"][number]["failedAttempts"]>[number] | null {
  return getLatestFailedAttemptEvidence(chunk.failedAttempts);
}

export function isHardValidationFallbackChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  const flags = chunk.quality?.flags ?? [];
  return Boolean(
    chunk.fallbackMode === "source"
    || flags.includes("source_fallback")
    || flags.includes("targeted_rerun_fallback")
    || chunk.rerunStatus === "fallback"
    || chunk.rerunFallbackMode,
  );
}

export function isHighRiskFailedOutputChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  return Boolean(isHardValidationFallbackChunk(chunk) && hasFailedAttemptEvidence(chunk));
}

export function getDefaultReviewDecisionForChunk(chunk: RoundCompareData["chunks"][number]): ReviewDecision {
  return deriveDefaultReviewDecision(chunk);
}

export function getReviewDecisionMode(decision: ReviewDecision): "rewrite" | "source" | "custom" {
  if (isFailedOutputDecision(decision)) return "source";
  if (typeof decision === "object" && decision?.mode === "custom") return "custom";
  return decision === "source" || decision === "source_confirmed" ? "source" : "rewrite";
}

export function getDecisionDisplayOutput(
  chunk: RoundCompareData["chunks"][number],
  decision: ReviewDecision,
): { title: string; text: string; tone: "rewrite" | "danger" } {
  if (isHighRiskFailedOutputChunk(chunk)) {
    return {
      title: "改写（门禁未通过，安全正文保持不变）",
      text: chunk.outputText || chunk.inputText,
      tone: "danger",
    };
  }
  if (chunk.rateAuditStrategyReviewRequired === true && !isReviewDecisionConfirmed(decision)) {
    return { title: "改写（定点候选，待确认）", text: chunk.outputText, tone: "rewrite" };
  }
  const mode = getReviewDecisionMode(decision);
  if (mode === "custom" && typeof decision === "object" && isReviewDecisionConfirmed(decision)) {
    return { title: "改写（人工修改）", text: decision.text || chunk.outputText, tone: "rewrite" };
  }
  if (mode === "source") {
    return { title: "改写（保留原文）", text: chunk.inputText, tone: "rewrite" };
  }
  return { title: "改写", text: chunk.outputText, tone: "rewrite" };
}

export function isReviewDecisionConfirmed(decision: ReviewDecision): boolean {
  if (typeof decision === "object") {
    return !isFailedOutputDecision(decision);
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

export function isFailedOutputDecision(
  decision: ReviewDecision,
): decision is CustomReviewDecision & { source: "failed_output" | "rejected_candidate" } {
  return typeof decision === "object"
    && (decision.source === "failed_output" || decision.source === "rejected_candidate");
}
