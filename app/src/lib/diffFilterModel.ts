import {
  getDefaultReviewDecisionForChunk,
  hasChunkTextChange,
  isHighRiskFailedOutputChunk,
  isReviewChunk,
  isReviewDecisionConfirmed,
  hasChunkNumberRisk,
  hasChunkCitationRisk,
} from "@/lib/resultCardHelpers";
import type { BatchRerunFailure, ReviewDecision, RoundCompareData } from "@/types/app";
export type DiffFilterMode = "all" | "review" | "highRisk" | "failed";

export type RerunFailure = BatchRerunFailure;


export type DiffFilterModel = {
  allChunks: RoundCompareData["chunks"];
  failedChunkIds: string[];
  failedChunkIdSet: Set<string>;
  highRiskChunkIds: string[];
  highRiskChunkIdSet: Set<string>;
  changedChunkIds: string[];
  changedChunkIdSet: Set<string>;
  numberRiskChunkIds: string[];
  numberRiskChunkIdSet: Set<string>;
  citationRiskChunkIds: string[];
  citationRiskChunkIdSet: Set<string>;
  reviewChunkIds: string[];
  reviewChunkIdSet: Set<string>;
  shownChunks: RoundCompareData["chunks"];
};

export function buildDiffFilterModel(input: {
  chunks: RoundCompareData["chunks"] | undefined;
  rerunFailures: RerunFailure[];
  reviewDecisions: Record<string, ReviewDecision>;
  filterMode: DiffFilterMode;
}): DiffFilterModel {
  const allChunks = input.chunks ?? [];
  const rerunFailureByChunk = new Map(input.rerunFailures.map((failure) => [failure.chunkId, failure]));
  const failedChunkIds = allChunks
    .filter((chunk) => rerunFailureByChunk.has(chunk.chunkId) && !isReviewDecisionConfirmed(input.reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk)))
    .map((chunk) => chunk.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const highRiskChunkIds = allChunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionConfirmed(input.reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk)))
    .map((chunk) => chunk.chunkId);
  const highRiskChunkIdSet = new Set(highRiskChunkIds);
  const changedChunkIds = allChunks.filter((chunk) => hasChunkTextChange(chunk)).map((chunk) => chunk.chunkId);
  const changedChunkIdSet = new Set(changedChunkIds);
  const numberRiskChunkIds = allChunks.filter((chunk) => hasChunkNumberRisk(chunk)).map((chunk) => chunk.chunkId);
  const numberRiskChunkIdSet = new Set(numberRiskChunkIds);
  const citationRiskChunkIds = allChunks.filter((chunk) => hasChunkCitationRisk(chunk)).map((chunk) => chunk.chunkId);
  const citationRiskChunkIdSet = new Set(citationRiskChunkIds);
  const reviewChunkIds = allChunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionConfirmed(input.reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk)) && isReviewChunk(chunk))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIdSet = new Set(reviewChunkIds);
  const shownChunks = input.filterMode === "failed"
    ? allChunks.filter((chunk) => failedChunkIdSet.has(chunk.chunkId))
    : input.filterMode === "highRisk"
      ? allChunks.filter((chunk) => highRiskChunkIdSet.has(chunk.chunkId))
      : input.filterMode === "review"
        ? allChunks.filter((chunk) => reviewChunkIdSet.has(chunk.chunkId))
        : allChunks;
  return {
    allChunks,
    failedChunkIds,
    failedChunkIdSet,
    highRiskChunkIds,
    highRiskChunkIdSet,
    changedChunkIds,
    changedChunkIdSet,
    numberRiskChunkIds,
    numberRiskChunkIdSet,
    citationRiskChunkIds,
    citationRiskChunkIdSet,
    reviewChunkIds,
    reviewChunkIdSet,
    shownChunks,
  };
}

export function getFirstChunkIdForDiffMode(
  mode: DiffFilterMode,
  model: Pick<DiffFilterModel, "failedChunkIds" | "highRiskChunkIds" | "reviewChunkIds" | "shownChunks" | "allChunks">,
): string {
  if (mode === "failed") return model.failedChunkIds[0] ?? "";
  if (mode === "highRisk") return model.highRiskChunkIds[0] ?? "";
  if (mode === "review") return model.reviewChunkIds[0] ?? "";
  return model.shownChunks[0]?.chunkId ?? model.allChunks[0]?.chunkId ?? "";
}

export type DiffFocusRequest = {
  filterMode: DiffFilterMode;
  chunkId?: string;
  nonce: number;
};
