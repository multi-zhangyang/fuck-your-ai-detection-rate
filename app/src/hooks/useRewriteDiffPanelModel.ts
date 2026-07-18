import { useState } from "react";

import { useDiffPanelScrollFocus } from "@/hooks/useDiffPanelScrollFocus";
import type { DiffFilterMode } from "@/lib/diffFilterModel";
import { deriveRewriteDiffPanelFilterState } from "@/lib/rewriteDiffPanelViewModel";
import type { RewriteDiffPanelProps } from "@/components/RewriteDiffPanelProps";

export function useRewriteDiffPanelModel({
  data,
  rerunFailures,
  reviewDecisions,
  diffFocusRequest,
}: Pick<
  RewriteDiffPanelProps,
  "data" | "rerunFailures" | "reviewDecisions" | "diffFocusRequest"
>) {
  const [filterMode, setFilterMode] = useState<DiffFilterMode>("all");
  const filterState = deriveRewriteDiffPanelFilterState({
    data,
    rerunFailures,
    reviewDecisions,
    filterMode,
  });
  const scroll = useDiffPanelScrollFocus({
    baseScrollKey: filterState.baseScrollKey,
    filterMode,
    setFilterMode,
    shownChunkCount: filterState.shownChunks.length,
    failedChunkCount: filterState.failedChunkIds.length,
    highRiskChunkCount: filterState.highRiskChunkIds.length,
    reviewChunkIds: filterState.reviewChunkIds,
    failedChunkIds: filterState.failedChunkIds,
    highRiskChunkIds: filterState.highRiskChunkIds,
    shownChunks: filterState.shownChunks,
    allChunks: filterState.allChunks,
    allChunkCount: filterState.allChunks.length,
    diffFocusRequest,
  });

  return {
    filterMode,
    setFilterMode,
    ...filterState,
    ...scroll,
  };
}
