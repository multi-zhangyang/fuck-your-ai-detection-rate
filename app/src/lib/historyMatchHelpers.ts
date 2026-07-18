export {
  documentRefsMatch,
  normalizeDocumentRef,
  getPlannedRoundCount,
  historyItemMatchesDocument,
  isPromptProfile,
  sortHistoryRounds,
  historyRoundMatchesPrompt,
  getLatestHistoryRound,
  getPreferredHistoryRound,
} from "@/lib/historyRoundMatchHelpers";

export {
  buildConfigForHistorySelection,
  resolveRestoredPromptProfile,
  shouldSyncHistorySelectionConfig,
} from "@/lib/historySelectionHelpers";
