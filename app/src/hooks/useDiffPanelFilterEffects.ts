import { useEffect, type Dispatch, type SetStateAction } from "react";

import type { DiffFilterMode, DiffFocusRequest } from "@/lib/diffFilterModel";
import {
  clampFocusedReviewIndex,
  planDiffFilterModeAfterFailureChange,
} from "@/lib/diffPanelScrollFocusHelpers";

export function useDiffPanelFilterEffects(input: {
  focusedReviewIndex: number;
  setFocusedReviewIndex: Dispatch<SetStateAction<number>>;
  reviewChunkCount: number;
  failedChunkCount: number;
  highRiskChunkCount: number;
  filterMode: DiffFilterMode;
  setFilterMode: (mode: DiffFilterMode) => void;
  previousFailedCountRef: { current: number };
  allChunkCount: number;
  diffFocusRequest: DiffFocusRequest | null;
}) {
  useEffect(() => {
    const nextIndex = clampFocusedReviewIndex(input.focusedReviewIndex, input.reviewChunkCount);
    if (nextIndex !== input.focusedReviewIndex) {
      input.setFocusedReviewIndex(nextIndex);
    }
  }, [input.focusedReviewIndex, input.reviewChunkCount, input.setFocusedReviewIndex]);

  useEffect(() => {
    const previousFailedCount = input.previousFailedCountRef.current;
    const plan = planDiffFilterModeAfterFailureChange({
      failedChunkCount: input.failedChunkCount,
      previousFailedCount,
      highRiskChunkCount: input.highRiskChunkCount,
      filterMode: input.filterMode,
    });
    if (plan) {
      input.setFilterMode(plan.filterMode);
      if (plan.clearFocusedReview) {
        input.setFocusedReviewIndex(-1);
      }
    }
    input.previousFailedCountRef.current = input.failedChunkCount;
  }, [
    input.failedChunkCount,
    input.filterMode,
    input.highRiskChunkCount,
    input.setFilterMode,
    input.setFocusedReviewIndex,
    input.previousFailedCountRef,
  ]);

  useEffect(() => {
    if (!input.diffFocusRequest || !input.allChunkCount) {
      return;
    }
    input.setFilterMode(input.diffFocusRequest.filterMode);
    input.setFocusedReviewIndex(-1);
  }, [
    input.allChunkCount,
    input.diffFocusRequest?.filterMode,
    input.diffFocusRequest?.nonce,
    input.setFilterMode,
    input.setFocusedReviewIndex,
  ]);
}
