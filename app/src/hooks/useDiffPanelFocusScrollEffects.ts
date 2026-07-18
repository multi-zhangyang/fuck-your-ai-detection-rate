import { useLayoutEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { DiffFilterMode, DiffFocusRequest } from "@/lib/diffFilterModel";
import {
  planDiffFocusScrollAction,
  shouldHandleDiffFocusRequest,
} from "@/lib/diffPanelFocusEffectHelpers";
import { setDiffScrollTop } from "@/lib/diffPanelScrollPositionStore";
import type { RoundCompareData } from "@/types/app";

export function useDiffPanelFocusScrollEffects(input: {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  chunkRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
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
  useLayoutEffect(() => {
    const request = shouldHandleDiffFocusRequest({
      diffFocusRequest: input.diffFocusRequest,
      filterMode: input.filterMode,
      handledNonce: input.handledDiffFocusNonceRef.current,
    });
    if (!request) {
      return;
    }
    const node = input.scrollRef.current;
    if (!node) {
      return;
    }
    input.handledDiffFocusNonceRef.current = request.nonce;
    const frame = window.requestAnimationFrame(() => {
      const action = planDiffFocusScrollAction({
        diffFocusRequest: request,
        failedChunkIds: input.failedChunkIds,
        highRiskChunkIds: input.highRiskChunkIds,
        reviewChunkIds: input.reviewChunkIds,
        shownChunks: input.shownChunks,
        allChunks: input.allChunks,
        chunkRefs: input.chunkRefs.current,
      });
      if (action.kind === "chunk" && action.targetId) {
        const targetNode = input.chunkRefs.current[action.targetId];
        targetNode?.scrollIntoView({ behavior: "smooth", block: "start" });
        input.setFocusedReviewIndex(action.reviewIndex ?? -1);
        return;
      }
      node.scrollTo({ top: 0, behavior: "smooth" });
      setDiffScrollTop(input.scrollKey, 0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    input.shownChunkCount,
    input.diffFocusRequest?.chunkId,
    input.diffFocusRequest?.filterMode,
    input.diffFocusRequest?.nonce,
    input.filterMode,
    input.reviewChunkIds,
    input.failedChunkIds,
    input.highRiskChunkIds,
    input.shownChunks,
    input.allChunks,
    input.scrollKey,
    input.scrollRef,
    input.chunkRefs,
    input.handledDiffFocusNonceRef,
    input.setFocusedReviewIndex,
  ]);
}
