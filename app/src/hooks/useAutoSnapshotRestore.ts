import { useEffect } from "react";

import {
  resolveAutoSnapshotRestorePlan,
  shouldClearAutoSnapshotKey,
  shouldStartAutoSnapshotRestore,
} from "@/lib/autoSnapshotRestoreEffectHelpers";
import type { UseAutoSnapshotRestoreInput } from "@/lib/autoSnapshotRestoreHookTypes";
import {
  runAutoSnapshotRestoreSession,
} from "@/lib/autoSnapshotRestoreSessionHelpers";
import { useAutoSnapshotRestoreRefs } from "@/hooks/useAutoSnapshotRestoreRefs";

export function useAutoSnapshotRestore(input: UseAutoSnapshotRestoreInput) {
  const {
    documentStatus,
    currentRunToken,
    currentBatchRerunToken,
    taskPhase,
    activeCompareChunkCount,
    autoSnapshotRestoreKeyRef,
    latestModelConfigRef,
    modelConfig,
    historyItems,
    promptOptions,
    promptWorkflows,
    setModelConfig,
    setNotice,
    setRuntimeStep,
    refreshDocumentState,
    loadLatestRoundSnapshot,
  } = input;

  const {
    refreshDocumentStateRef,
    loadLatestRoundSnapshotRef,
  } = useAutoSnapshotRestoreRefs({
    refreshDocumentState,
    loadLatestRoundSnapshot,
  });

  useEffect(() => {
    if (!shouldStartAutoSnapshotRestore({
      documentStatus,
      currentRunToken,
      currentBatchRerunToken,
      taskPhase,
    }) || !documentStatus) {
      return;
    }
    if (shouldClearAutoSnapshotKey(activeCompareChunkCount)) {
      autoSnapshotRestoreKeyRef.current = "";
      return;
    }
    const plan = resolveAutoSnapshotRestorePlan({
      documentStatus,
      modelConfig,
      historyItems,
      promptOptions,
      promptWorkflows,
      currentRestoreKey: autoSnapshotRestoreKeyRef.current,
    });
    if (!plan) {
      return;
    }
    autoSnapshotRestoreKeyRef.current = plan.restoreKey;

    let canceled = false;
    void runAutoSnapshotRestoreSession({
      documentStatus,
      plan,
      historyItems,
      promptOptions,
      promptWorkflows,
      isCanceled: () => canceled,
      loadLatestRoundSnapshotRef,
      refreshDocumentStateRef,
      latestModelConfigRef,
      setModelConfig,
      setRuntimeStep,
      setNotice,
      clearRestoreKey: () => {
        autoSnapshotRestoreKeyRef.current = "";
      },
    });

    return () => {
      canceled = true;
    };
  }, [
    activeCompareChunkCount,
    currentBatchRerunToken,
    currentRunToken,
    documentStatus,
    historyItems,
    modelConfig,
    promptOptions,
    promptWorkflows,
    setModelConfig,
    setNotice,
    setRuntimeStep,
    taskPhase,
    autoSnapshotRestoreKeyRef,
    latestModelConfigRef,
  ]);
}
