import type { MutableRefObject } from "react";

import { RewriteDiffChunkCard } from "@/components/RewriteDiffChunkCard";
import { RewriteDiffPanelFilterEmpty } from "@/components/RewriteDiffPanelEmpty";
import type { RerunFailure } from "@/lib/diffFilterModel";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

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
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onShowAll: () => void;
}) {
  return (
    <div className="grid gap-4">
      {shownChunks.length ? shownChunks.map((chunk) => (
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
          streamChunkId={streamChunkId}
          focusedChunkId={focusedChunkId}
          chunkRefs={chunkRefs}
          onReviewDecisionChange={onReviewDecisionChange}
          onRerunChunk={onRerunChunk}
        />
      )) : (
        <RewriteDiffPanelFilterEmpty
          title={emptyTitle}
          onShowAll={onShowAll}
        />
      )}
    </div>
  );
}
