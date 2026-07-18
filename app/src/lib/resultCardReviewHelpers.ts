export {
  isReviewChunk,
  getLatestFailedAttempt,
  isHardValidationFallbackChunk,
  isHighRiskFailedOutputChunk,
  getDefaultReviewDecisionForChunk,
  getReviewDecisionMode,
  getDecisionDisplayOutput,
  isReviewDecisionConfirmed,
  isFailedOutputDecision,
} from "@/lib/resultCardDecisionHelpers";

import type { RoundCompareData } from "@/types/app";
import {
  extractCitationTokens,
  extractNumberTokens,
  hasTokenDifference,
  compactFeedbackText,
} from "@/lib/resultCardTokenHelpers";
import { formatChunkFlag, getRiskReasonText } from "@/lib/resultCardFormatHelpers";

export function hasChunkNumberRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return hasTokenDifference(chunk.inputText, chunk.outputText, extractNumberTokens);
}

export function hasChunkCitationRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return (chunk.quality?.missingCitationCount ?? 0) > 0 || hasTokenDifference(chunk.inputText, chunk.outputText, extractCitationTokens);
}

export function getDiffFilterEmptyState(
  mode: "all" | "review" | "highRisk" | "failed",
  titles: { noFailedChunks: string; noHighRiskChunks: string; noReviewChunks: string },
): { title: string } {
  if (mode === "failed") return { title: titles.noFailedChunks };
  if (mode === "highRisk") return { title: titles.noHighRiskChunks };
  return { title: titles.noReviewChunks };
}

export function getChunkReviewReasons(chunk: RoundCompareData["chunks"][number], extraReasons: string[] = []): string[] {
  const quality = chunk.quality;
  const flags = quality?.flags ?? [];
  const reasons: string[] = extraReasons.map((reason) => compactFeedbackText(reason, 84)).filter(Boolean);

  if (chunk.fallbackMode === "source" || flags.includes("source_fallback")) {
    reasons.push("历史记录：模型未过硬校验，该块未采用改写");
  }
  if (chunk.rerunStatus === "fallback" || flags.includes("targeted_rerun_fallback")) {
    reasons.push("历史记录：定向重跑未过硬校验");
  }
  for (const reason of quality?.reviewReasons ?? []) {
    const text = getRiskReasonText(reason);
    if (text) reasons.push(text);
  }
  for (const risk of quality?.machineLikeRisks ?? []) {
    const text = getRiskReasonText(risk);
    if (text) reasons.push(text);
  }
  if ((quality?.missingCitationCount ?? 0) > 0) {
    reasons.push(`缺少引用 ${quality?.missingCitationCount}`);
  }
  for (const flag of flags) {
    if (flag === "source_fallback" || flag === "targeted_rerun_fallback") continue;
    reasons.push(formatChunkFlag(flag));
  }
  if (!reasons.length && quality?.needsReview) {
    reasons.push("本块未通过本地质量校验");
  }
  return reasons.filter((item, index, list) => item && list.indexOf(item) === index).slice(0, 5);
}

export const DIFF_STREAM_LABEL = "流式生成 · 分块";
