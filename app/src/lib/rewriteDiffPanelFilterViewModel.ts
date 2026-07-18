import {
  buildDiffFilterModel,
  type DiffFilterMode,
  type RerunFailure,
} from "@/lib/diffFilterModel";
import {
  getDiffFilterEmptyState as getDiffFilterEmptyStateHelper,
} from "@/lib/resultCardHelpers";
import { REWRITE_DIFF_PANEL_COPY } from "@/lib/rewriteDiffPanelCopy";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export function getRewriteDiffFilterEmptyState(mode: DiffFilterMode): { title: string } {
  return getDiffFilterEmptyStateHelper(mode, {
    noFailedChunks: REWRITE_DIFF_PANEL_COPY.noFailedChunks,
    noHighRiskChunks: REWRITE_DIFF_PANEL_COPY.noHighRiskChunks,
    noReviewChunks: REWRITE_DIFF_PANEL_COPY.noReviewChunks,
  });
}

export function deriveRewriteDiffPanelFilterState(input: {
  data: RoundCompareData | null;
  rerunFailures: RerunFailure[];
  reviewDecisions: Record<string, ReviewDecision>;
  filterMode: DiffFilterMode;
}) {
  const filterModel = buildDiffFilterModel({
    chunks: input.data?.chunks,
    rerunFailures: input.rerunFailures,
    reviewDecisions: input.reviewDecisions,
    filterMode: input.filterMode,
  });
  return {
    ...filterModel,
    rerunFailureByChunk: new Map(input.rerunFailures.map((failure) => [failure.chunkId, failure])),
    emptyState: getRewriteDiffFilterEmptyState(input.filterMode),
    baseScrollKey: input.data
      ? input.data.outputPath || `${input.data.docId}-${input.data.round}`
      : "empty",
    chunkCountLabel: `${filterModel.shownChunks.length}/${input.data?.chunkCount ?? filterModel.allChunks.length}`,
  };
}

export function formatRewriteDiffStreamBanner(input: {
  streamChunkId: string;
  streamChars?: number | null;
}): { titleSuffix: string; statusText: string } {
  return {
    titleSuffix: `${input.streamChunkId}${input.streamChars ? ` · 已接收 ${input.streamChars} 字` : ""}`,
    statusText: "思考内容已隔离。这里只显示接收计数；完整回答通过门禁后才会进入 Diff。",
  };
}
