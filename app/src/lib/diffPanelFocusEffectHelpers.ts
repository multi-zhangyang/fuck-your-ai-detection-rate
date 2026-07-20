import type { DiffFocusRequest } from "@/lib/diffFilterModel";
import { resolveDiffFocusTargetId } from "@/lib/diffPanelScrollFocusHelpers";
import type { RoundCompareData } from "@/types/app";

export function shouldHandleDiffFocusRequest(input: {
  diffFocusRequest: DiffFocusRequest | null;
  filterMode: DiffFocusRequest["filterMode"];
  handledNonce: number | null;
}): DiffFocusRequest | null {
  if (!input.diffFocusRequest || input.diffFocusRequest.filterMode !== input.filterMode) {
    return null;
  }
  if (input.handledNonce === input.diffFocusRequest.nonce) {
    return null;
  }
  return input.diffFocusRequest;
}

export function planDiffFocusScrollAction(input: {
  diffFocusRequest: DiffFocusRequest;
  failedChunkIds: string[];
  highRiskChunkIds: string[];
  reviewChunkIds: string[];
  shownChunks: RoundCompareData["chunks"];
  allChunks: RoundCompareData["chunks"];
  chunkRefs: Record<string, HTMLElement | null>;
}): {
  kind: "chunk" | "top";
  targetId?: string;
  reviewIndex?: number;
} {
  const targetId = resolveDiffFocusTargetId({
    diffFocusRequest: input.diffFocusRequest,
    failedChunkIds: input.failedChunkIds,
    highRiskChunkIds: input.highRiskChunkIds,
    reviewChunkIds: input.reviewChunkIds,
    shownChunks: input.shownChunks,
    allChunks: input.allChunks,
  });
  const targetNode = targetId ? input.chunkRefs[targetId] : null;
  const targetIsShown = Boolean(targetId) && input.shownChunks.some(
    (chunk) => chunk.chunkId === targetId,
  );
  if (targetNode || targetIsShown) {
    return {
      kind: "chunk",
      targetId,
      reviewIndex: input.reviewChunkIds.indexOf(targetId),
    };
  }
  return { kind: "top" };
}
