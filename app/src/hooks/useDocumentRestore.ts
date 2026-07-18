import { useEffect } from "react";

import { runDocumentRestoreEffect } from "@/lib/documentRestoreEffectRunner";
import type { UseDocumentRestoreInput } from "@/lib/documentRestoreHookTypes";
import { useDocumentRestoreRefs } from "@/hooks/useDocumentRestoreRefs";

export function useDocumentRestore(input: UseDocumentRestoreInput) {
  const {
    modelConfigReady,
    historyListReady,
    restoredDocumentRef,
    documentStatus,
    historyItems,
    modelConfig,
    promptOptions,
    promptWorkflows,
    taskTicketRef,
    setModelConfig,
    setError,
    setNotice,
    setRuntimeStep,
    beginTask,
    finishTask,
    refreshDocumentState,
    refreshHistoryList,
    clearLoadedRoundSnapshot,
    loadLatestRoundSnapshot,
  } = input;

  const {
    beginTaskRef,
    finishTaskRef,
    refreshDocumentStateRef,
    refreshHistoryListRef,
    clearLoadedRoundSnapshotRef,
    loadLatestRoundSnapshotRef,
    setNoticeRef,
    setRuntimeStepRef,
  } = useDocumentRestoreRefs({
    beginTask,
    finishTask,
    refreshDocumentState,
    refreshHistoryList,
    clearLoadedRoundSnapshot,
    loadLatestRoundSnapshot,
    setNotice,
    setRuntimeStep,
  });

  useEffect(() => {
    runDocumentRestoreEffect({
      modelConfigReady,
      historyListReady,
      restoredDocumentRef,
      documentStatus,
      historyItems,
      modelConfig,
      promptOptions,
      promptWorkflows,
      taskTicketRef,
      setModelConfig,
      setError,
      beginTaskRef,
      finishTaskRef,
      refreshDocumentStateRef,
      refreshHistoryListRef,
      clearLoadedRoundSnapshotRef,
      loadLatestRoundSnapshotRef,
      setNoticeRef,
      setRuntimeStepRef,
    });
  }, [
    documentStatus,
    historyItems,
    historyListReady,
    modelConfig,
    modelConfigReady,
    promptOptions,
    promptWorkflows,
    setError,
    setModelConfig,
    restoredDocumentRef,
    taskTicketRef,
  ]);
}
