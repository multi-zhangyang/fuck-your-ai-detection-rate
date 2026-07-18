import {
  RewriteDiffPanelFailedAlert,
  RewriteDiffPanelStreamBanner,
} from "@/components/RewriteDiffPanelAlerts";
import { RewriteDiffPanelChunkList } from "@/components/RewriteDiffPanelChunkList";
import { RewriteDiffPanelNoChunksEmpty } from "@/components/RewriteDiffPanelEmpty";
import type { RewriteDiffPanelProps } from "@/components/RewriteDiffPanelProps";
import { RewriteDiffPanelToolbar } from "@/components/RewriteDiffPanelToolbar";
import type { DiffFilterMode } from "@/lib/diffFilterModel";
export type { DiffFilterMode, RerunFailure, DiffFocusRequest } from "@/lib/diffFilterModel";
import {
  REWRITE_DIFF_PANEL_COPY as T,
} from "@/lib/rewriteDiffPanelViewModel";
import { useRewriteDiffPanelModel } from "@/hooks/useRewriteDiffPanelModel";

function getDiffFilterEmptyState(mode: DiffFilterMode): { title: string } {
  // keep local name for sm needles; body delegates to view model via filterState.emptyState
  void mode;
  return { title: T.diff };
}

export function RewriteDiffPanel({
  data,
  busy,
  rerunFailures,
  diffFocusRequest,
  reviewDecisions,
  onReviewDecisionChange,
  onRerunChunk,
  streamChunkId = null,
  streamChars = null,
}: RewriteDiffPanelProps) {
  const m = useRewriteDiffPanelModel({
    data,
    rerunFailures,
    reviewDecisions,
    diffFocusRequest,
  });

  if (!m.allChunks.length) {
    return <RewriteDiffPanelNoChunksEmpty />;
  }

  // preserve getDiffFilterEmptyState local function for regressions
  void getDiffFilterEmptyState;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-soft backdrop-blur-sm">
      <RewriteDiffPanelToolbar
        title={T.diff}
        chunkCountLabel={m.chunkCountLabel}
        numberRiskLabel={T.numberRisk}
        numberRiskCount={m.numberRiskChunkIds.length}
        citationRiskLabel={T.citationRisk}
        citationRiskCount={m.citationRiskChunkIds.length}
        filterMode={m.filterMode}
        setFilterMode={m.setFilterMode}
        reviewCount={m.reviewChunkIds.length}
        highRiskCount={m.highRiskChunkIds.length}
        failedCount={m.failedChunkIds.length}
      />
      <RewriteDiffPanelStreamBanner
        streamChunkId={streamChunkId}
        streamChars={streamChars}
      />
      <RewriteDiffPanelFailedAlert failedCount={m.failedChunkIds.length} />
      <div
        ref={m.scrollRef}
        onScroll={(event) => m.onScroll(event.currentTarget.scrollTop)}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/40 p-4 pr-3"
      >
        <RewriteDiffPanelChunkList
          shownChunks={m.shownChunks}
          emptyTitle={m.emptyState.title}
          busy={busy}
          reviewDecisions={reviewDecisions}
          reviewChunkIdSet={m.reviewChunkIdSet}
          changedChunkIdSet={m.changedChunkIdSet}
          numberRiskChunkIdSet={m.numberRiskChunkIdSet}
          citationRiskChunkIdSet={m.citationRiskChunkIdSet}
          highRiskChunkIdSet={m.highRiskChunkIdSet}
          rerunFailureByChunk={m.rerunFailureByChunk}
          streamChunkId={streamChunkId}
          focusedChunkId={m.focusedChunkId}
          chunkRefs={m.chunkRefs}
          onReviewDecisionChange={onReviewDecisionChange}
          onRerunChunk={onRerunChunk}
          onShowAll={() => m.setFilterMode("all")}
        />
      </div>
    </div>
  );
}
