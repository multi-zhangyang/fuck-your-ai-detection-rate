import { isFailedOutputDecision } from "@/lib/diffDashboard";
import { deriveDefaultReviewDecision } from "@/lib/reviewDecisionDefaults";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision {
  const chunk = data.chunks.find((item) => item.chunkId === chunkId);
  return chunk ? deriveDefaultReviewDecision(chunk) : "rewrite";
}

export function normalizeReviewDecisionsForSave(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
  return Object.fromEntries(
    Object.entries(decisions).flatMap(([chunkId, decision]) => {
      if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
        if (isFailedOutputDecision(decision)) {
          return [];
        }
        return [[chunkId, decision] as const];
      }
      if (decision === "source_confirmed") {
        return [[chunkId, "source_confirmed" as ReviewDecision] as const];
      }
      if (decision === "rewrite_confirmed") {
        return [[chunkId, "rewrite_confirmed" as ReviewDecision] as const];
      }
      return [];
    }),
  );
}

export function normalizeSavedReviewDecisions(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
  return Object.fromEntries(
    Object.entries(decisions).map(([chunkId, decision]) => {
      if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
        if (isFailedOutputDecision(decision)) {
          return [chunkId, "source" as ReviewDecision];
        }
        return [chunkId, decision];
      }
      if (decision === "source") return [chunkId, "source" as ReviewDecision];
      if (decision === "source_confirmed") return [chunkId, "source_confirmed" as ReviewDecision];
      if (decision === "rewrite_confirmed") return [chunkId, "rewrite_confirmed" as ReviewDecision];
      return [chunkId, "rewrite" as ReviewDecision];
    }),
  );
}

export function normalizeSavedReviewDecisionsForCompare(
  data: RoundCompareData | null,
  decisions: Record<string, ReviewDecision>,
): Record<string, ReviewDecision> {
  const normalized = normalizeSavedReviewDecisions(decisions);
  if (!data?.chunks.length) {
    return normalized;
  }
  const validChunkIds = new Set(data.chunks.map((chunk) => chunk.chunkId));
  return Object.fromEntries(Object.entries(normalized).filter(([chunkId]) => validChunkIds.has(chunkId)));
}

export function buildDefaultReviewDecisions(data: RoundCompareData | null): Record<string, ReviewDecision> {
  if (!data?.chunks.length) {
    return {};
  }
  return Object.fromEntries(
    data.chunks.map((chunk) => [chunk.chunkId, getDefaultReviewDecisionForChunk(data, chunk.chunkId)]),
  );
}

export function buildLoadedRoundSnapshotReviewDecisions(
  nextCompareData: Parameters<typeof buildDefaultReviewDecisions>[0],
  savedReviewDecisions: Record<string, ReviewDecision>,
): Record<string, ReviewDecision> {
  return {
    ...buildDefaultReviewDecisions(nextCompareData),
    ...normalizeSavedReviewDecisionsForCompare(nextCompareData, savedReviewDecisions),
  };
}

export function buildRerunChunkReviewDecisions(
  compareData: RoundCompareData,
  current: Record<string, ReviewDecision>,
  chunkId: string,
  nextDecision: ReviewDecision,
): Record<string, ReviewDecision> {
  return {
    ...buildDefaultReviewDecisions(compareData),
    ...current,
    [chunkId]: nextDecision,
  };
}
