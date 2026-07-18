import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { DiffFilterMode, DiffFocusRequest } from "@/lib/diffFilterModel";
import { useDiffPanelFocusScrollEffects } from "@/hooks/useDiffPanelFocusScrollEffects";
import { useDiffPanelScrollRestoreEffects } from "@/hooks/useDiffPanelScrollRestoreEffects";
import type { RoundCompareData } from "@/types/app";

export function useDiffPanelScrollEffects(input: {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  chunkRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  restoredKeyRef: MutableRefObject<string>;
  previousChunkCountRef: MutableRefObject<number>;
  handledDiffFocusNonceRef: MutableRefObject<number | null>;
  setFocusedReviewIndex: Dispatch<SetStateAction<number>>;
  scrollKey: string;
  shownChunkCount: number;
  filterMode: DiffFilterMode;
  diffFocusRequest: DiffFocusRequest | null;
  failedChunkIds: string[];
  highRiskChunkIds: string[];
  reviewChunkIds: string[];
  shownChunks: RoundCompareData["chunks"];
  allChunks: RoundCompareData["chunks"];
}) {
  useDiffPanelScrollRestoreEffects({
    scrollRef: input.scrollRef,
    restoredKeyRef: input.restoredKeyRef,
    previousChunkCountRef: input.previousChunkCountRef,
    scrollKey: input.scrollKey,
    shownChunkCount: input.shownChunkCount,
    filterMode: input.filterMode,
  });
  useDiffPanelFocusScrollEffects({
    scrollRef: input.scrollRef,
    chunkRefs: input.chunkRefs,
    handledDiffFocusNonceRef: input.handledDiffFocusNonceRef,
    setFocusedReviewIndex: input.setFocusedReviewIndex,
    scrollKey: input.scrollKey,
    shownChunkCount: input.shownChunkCount,
    filterMode: input.filterMode,
    diffFocusRequest: input.diffFocusRequest,
    failedChunkIds: input.failedChunkIds,
    highRiskChunkIds: input.highRiskChunkIds,
    reviewChunkIds: input.reviewChunkIds,
    shownChunks: input.shownChunks,
    allChunks: input.allChunks,
  });
}
