import { getFirstChunkIdForDiffMode, type DiffFilterMode, type DiffFocusRequest } from "@/lib/diffFilterModel";
import type { RoundCompareData } from "@/types/app";

export function planDiffFilterModeAfterFailureChange(input: {
  failedChunkCount: number;
  previousFailedCount: number;
  highRiskChunkCount: number;
  filterMode: DiffFilterMode;
}): { filterMode: DiffFilterMode; clearFocusedReview: boolean } | null {
  if (input.failedChunkCount > input.previousFailedCount) {
    return { filterMode: "failed", clearFocusedReview: true };
  }
  if (input.failedChunkCount === 0 && input.filterMode === "failed") {
    return { filterMode: "all", clearFocusedReview: false };
  }
  if (input.highRiskChunkCount === 0 && input.filterMode === "highRisk") {
    return { filterMode: "all", clearFocusedReview: false };
  }
  return null;
}

export function resolveDiffFocusTargetId(input: {
  diffFocusRequest: DiffFocusRequest;
  failedChunkIds: string[];
  highRiskChunkIds: string[];
  reviewChunkIds: string[];
  shownChunks: RoundCompareData["chunks"];
  allChunks: RoundCompareData["chunks"];
}): string {
  return input.diffFocusRequest.chunkId || getFirstChunkIdForDiffMode(input.diffFocusRequest.filterMode, {
    failedChunkIds: input.failedChunkIds,
    highRiskChunkIds: input.highRiskChunkIds,
    reviewChunkIds: input.reviewChunkIds,
    shownChunks: input.shownChunks,
    allChunks: input.allChunks,
  }) || "";
}

export function clampFocusedReviewIndex(focusedReviewIndex: number, reviewChunkCount: number): number {
  if (focusedReviewIndex >= reviewChunkCount) {
    return reviewChunkCount ? reviewChunkCount - 1 : -1;
  }
  return focusedReviewIndex;
}
