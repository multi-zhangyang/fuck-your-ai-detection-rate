export { documentRefsMatch, normalizeDocumentRef } from "@/lib/historyMatchHelpers";

export {
  getPlannedRoundCount,
  historyItemMatchesDocument,
  isPromptProfile,
  sortHistoryRounds,
  historyRoundMatchesPrompt,
  getLatestHistoryRound,
  getPreferredHistoryRound,
  buildConfigForHistorySelection,
  resolveRestoredPromptProfile,
  shouldSyncHistorySelectionConfig,
} from "@/lib/historyMatchHelpers";

export {
  resolveLoadedHistoryRoute,
  buildHistoryDocumentLoadNotice,
  buildHistoryDocumentLoadRuntimeStep,
  buildHistoryDocumentLoadFailureRuntimeStep,
  buildHistoryDocumentLoadingRuntimeStep,
  resolveLatestRoundSnapshotSelection,
  buildIncompleteRoundSnapshotError,
  planHistoryDocumentLoadFeedback,
  buildLoadedRoundSnapshotView,
  buildHistoryRouteStatusResult,
} from "@/lib/historyLoadHelpers";
