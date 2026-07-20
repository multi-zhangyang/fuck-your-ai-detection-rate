import { useRef, useState } from "react";

import type { DiffFilterMode, DiffFocusRequest } from "@/lib/diffFilterModel";
import {
  buildDiffPanelScrollKey,
  resolveFocusedChunkId,
  setDiffScrollTop,
} from "@/lib/diffPanelScrollPositionStore";
import { useDiffPanelFilterEffects } from "@/hooks/useDiffPanelFilterEffects";
import { useDiffPanelScrollEffects } from "@/hooks/useDiffPanelScrollEffects";
import type { RoundCompareData } from "@/types/app";

type Input = {
  baseScrollKey: string;
  filterMode: DiffFilterMode;
  setFilterMode: (mode: DiffFilterMode) => void;
  shownChunkCount: number;
  failedChunkCount: number;
  highRiskChunkCount: number;
  reviewChunkIds: string[];
  failedChunkIds: string[];
  highRiskChunkIds: string[];
  shownChunks: RoundCompareData["chunks"];
  allChunks: RoundCompareData["chunks"];
  allChunkCount: number;
  diffFocusRequest: DiffFocusRequest | null;
};

export function useDiffPanelScrollFocus({
  baseScrollKey,
  filterMode,
  setFilterMode,
  shownChunkCount,
  failedChunkCount,
  highRiskChunkCount,
  reviewChunkIds,
  failedChunkIds,
  highRiskChunkIds,
  shownChunks,
  allChunks,
  allChunkCount,
  diffFocusRequest,
}: Input) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const chunkRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const virtualScrollToChunkRef = useRef<((chunkId: string) => boolean) | null>(null);
  const restoredKeyRef = useRef("");
  const previousChunkCountRef = useRef(0);
  const previousFailedCountRef = useRef(0);
  const handledDiffFocusNonceRef = useRef<number | null>(null);
  const [focusedReviewIndex, setFocusedReviewIndex] = useState(-1);

  const scrollKey = buildDiffPanelScrollKey(baseScrollKey, filterMode);
  const focusedChunkId = resolveFocusedChunkId(focusedReviewIndex, reviewChunkIds);

  useDiffPanelFilterEffects({
    focusedReviewIndex,
    setFocusedReviewIndex,
    reviewChunkCount: reviewChunkIds.length,
    failedChunkCount,
    highRiskChunkCount,
    filterMode,
    setFilterMode,
    previousFailedCountRef,
    allChunkCount,
    diffFocusRequest,
  });

  useDiffPanelScrollEffects({
    scrollRef,
    chunkRefs,
    virtualScrollToChunkRef,
    restoredKeyRef,
    previousChunkCountRef,
    handledDiffFocusNonceRef,
    setFocusedReviewIndex,
    scrollKey,
    shownChunkCount,
    filterMode,
    diffFocusRequest,
    failedChunkIds,
    highRiskChunkIds,
    reviewChunkIds,
    shownChunks,
    allChunks,
  });

  const onScroll = (scrollTop: number) => {
    setDiffScrollTop(scrollKey, scrollTop);
  };

  return {
    scrollRef,
    chunkRefs,
    virtualScrollToChunkRef,
    focusedReviewIndex,
    setFocusedReviewIndex,
    focusedChunkId,
    scrollKey,
    onScroll,
  };
}
