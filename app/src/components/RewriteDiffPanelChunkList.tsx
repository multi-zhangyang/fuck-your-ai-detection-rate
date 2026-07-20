import { useCallback, useLayoutEffect, type MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { RewriteDiffChunkCard } from "@/components/RewriteDiffChunkCard";
import { RewriteDiffPanelFilterEmpty } from "@/components/RewriteDiffPanelEmpty";
import type { RerunFailure } from "@/lib/diffFilterModel";
import type { ReviewDecision, RoundCompareData } from "@/types/app";
import {
  DIFF_VIRTUAL_ESTIMATED_ROW_SIZE,
  DIFF_VIRTUAL_OVERSCAN,
  DIFF_VIRTUAL_ROW_GAP,
  findDiffChunkIndex,
  shouldVirtualizeDiffChunks,
} from "@/lib/diffVirtualization";

export function RewriteDiffPanelChunkList({
  shownChunks,
  emptyTitle,
  busy,
  reviewDecisions,
  reviewChunkIdSet,
  changedChunkIdSet,
  numberRiskChunkIdSet,
  citationRiskChunkIdSet,
  highRiskChunkIdSet,
  rerunFailureByChunk,
  streamChunkId,
  focusedChunkId,
  chunkRefs,
  scrollRef,
  virtualScrollToChunkRef,
  onReviewDecisionChange,
  onRerunChunk,
  onShowAll,
}: {
  shownChunks: RoundCompareData["chunks"];
  emptyTitle: string;
  busy: boolean;
  reviewDecisions: Record<string, ReviewDecision>;
  reviewChunkIdSet: Set<string>;
  changedChunkIdSet: Set<string>;
  numberRiskChunkIdSet: Set<string>;
  citationRiskChunkIdSet: Set<string>;
  highRiskChunkIdSet: Set<string>;
  rerunFailureByChunk: Map<string, RerunFailure>;
  streamChunkId?: string | null;
  focusedChunkId?: string | null;
  chunkRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  virtualScrollToChunkRef: MutableRefObject<((chunkId: string) => boolean) | null>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onShowAll: () => void;
}) {
  const virtualized = shouldVirtualizeDiffChunks(shownChunks.length);
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: shownChunks.length,
    enabled: virtualized,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DIFF_VIRTUAL_ESTIMATED_ROW_SIZE,
    getItemKey: (index) => shownChunks[index]?.chunkId ?? index,
    gap: DIFF_VIRTUAL_ROW_GAP,
    overscan: DIFF_VIRTUAL_OVERSCAN,
  });
  const scrollToChunk = useCallback((chunkId: string) => {
    if (!virtualized) {
      return false;
    }
    const index = findDiffChunkIndex(shownChunks, chunkId);
    if (index < 0) {
      return false;
    }
    virtualizer.scrollToIndex(index, { align: "start" });
    return true;
  }, [shownChunks, virtualized, virtualizer]);

  useLayoutEffect(() => {
    virtualScrollToChunkRef.current = scrollToChunk;
    return () => {
      if (virtualScrollToChunkRef.current === scrollToChunk) {
        virtualScrollToChunkRef.current = null;
      }
    };
  }, [scrollToChunk, virtualScrollToChunkRef]);

  const renderChunk = (chunk: RoundCompareData["chunks"][number]) => (
    <RewriteDiffChunkCard
      key={chunk.chunkId}
      chunk={chunk}
      busy={busy}
      reviewDecisions={reviewDecisions}
      reviewChunkIdSet={reviewChunkIdSet}
      changedChunkIdSet={changedChunkIdSet}
      numberRiskChunkIdSet={numberRiskChunkIdSet}
      citationRiskChunkIdSet={citationRiskChunkIdSet}
      highRiskChunkIdSet={highRiskChunkIdSet}
      rerunFailureByChunk={rerunFailureByChunk}
      streamChunkId={streamChunkId === chunk.chunkId ? chunk.chunkId : null}
      focusedChunkId={focusedChunkId === chunk.chunkId ? chunk.chunkId : null}
      chunkRefs={chunkRefs}
      onReviewDecisionChange={onReviewDecisionChange}
      onRerunChunk={onRerunChunk}
    />
  );

  if (!shownChunks.length) {
    return (
      <div className="grid gap-4">
        <RewriteDiffPanelFilterEmpty title={emptyTitle} onShowAll={onShowAll} />
      </div>
    );
  }

  if (!virtualized) {
    return <div className="grid gap-4">{shownChunks.map(renderChunk)}</div>;
  }

  return (
    <div
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const chunk = shownChunks[virtualRow.index];
        if (!chunk) {
          return null;
        }
        return (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderChunk(chunk)}
          </div>
        );
      })}
    </div>
  );
}
