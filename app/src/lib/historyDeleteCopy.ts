export {
  getHistoryDeleteCopy,
  buildHistoryDeleteConfirmText,
  buildHistoryDeleteResultNotice,
  buildHistoryOrphanCleanupNotice,
} from "@/lib/historyDeleteNoticeCopy";

export {
  buildHistoryDeleteConfirmOptions,
  buildHistoryOrphanConfirmOptions,
  resolveHistoryDeleteDocumentFollowup,
  type HistoryDeleteDocumentFollowup,
} from "@/lib/historyDeleteConfirmCopy";

export {
  buildHistoryDeletePreviewFailureRuntimeStep,
  buildHistoryDeleteFailureRuntimeStep,
  buildHistoryDeleteWorkingRuntimeStep,
  buildHistoryOrphanScanRuntimeStep,
  buildHistoryOrphanScanFailureRuntimeStep,
  buildHistoryOrphanEmptyNotice,
  buildHistoryOrphanWorkingRuntimeStep,
  buildHistoryOrphanDoneRuntimeStep,
  buildHistoryOrphanFailureRuntimeStep,
  buildHistoryDeletePreviewLoadingRuntimeStep,
  buildHistoryDeleteCancelledRuntimeStep,
} from "@/lib/historyDeleteRuntimeCopy";
