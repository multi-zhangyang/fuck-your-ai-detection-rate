import { buildRestoredDocumentLoadingRuntimeStep } from "@/lib/documentRestoreHelpers";
import {
  executeDocumentRestoreSession,
  planDocumentRestoreEffectStart,
  shouldStartDocumentRestore,
} from "@/lib/documentRestoreEffectHelpers";
import type { UseDocumentRestoreInput } from "@/lib/documentRestoreHookTypes";

export function runDocumentRestoreEffect(input: {
  modelConfigReady: boolean;
  historyListReady: boolean;
  restoredDocumentRef: UseDocumentRestoreInput["restoredDocumentRef"];
  documentStatus: UseDocumentRestoreInput["documentStatus"];
  historyItems: UseDocumentRestoreInput["historyItems"];
  modelConfig: UseDocumentRestoreInput["modelConfig"];
  promptOptions: UseDocumentRestoreInput["promptOptions"];
  promptWorkflows: UseDocumentRestoreInput["promptWorkflows"];
  taskTicketRef: UseDocumentRestoreInput["taskTicketRef"];
  setModelConfig: UseDocumentRestoreInput["setModelConfig"];
  setError: UseDocumentRestoreInput["setError"];
  beginTaskRef: { current: UseDocumentRestoreInput["beginTask"] };
  finishTaskRef: { current: UseDocumentRestoreInput["finishTask"] };
  refreshDocumentStateRef: { current: UseDocumentRestoreInput["refreshDocumentState"] };
  refreshHistoryListRef: { current: UseDocumentRestoreInput["refreshHistoryList"] };
  clearLoadedRoundSnapshotRef: { current: UseDocumentRestoreInput["clearLoadedRoundSnapshot"] };
  loadLatestRoundSnapshotRef: { current: UseDocumentRestoreInput["loadLatestRoundSnapshot"] };
  setNoticeRef: { current: UseDocumentRestoreInput["setNotice"] };
  setRuntimeStepRef: { current: UseDocumentRestoreInput["setRuntimeStep"] };
}): void {
  if (!shouldStartDocumentRestore({
    modelConfigReady: input.modelConfigReady,
    historyListReady: input.historyListReady,
    restoredDocument: input.restoredDocumentRef.current,
    documentStatus: input.documentStatus,
    historyItems: input.historyItems,
    modelConfig: input.modelConfig,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
  })) {
    return;
  }
  const plan = planDocumentRestoreEffectStart({
    historyItems: input.historyItems,
    modelConfig: input.modelConfig,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
  });
  if (plan.kind === "skip" || !plan.nextConfig || !plan.sourcePath) {
    input.restoredDocumentRef.current = true;
    return;
  }

  input.restoredDocumentRef.current = true;
  if (plan.shouldSyncConfig) {
    input.setModelConfig(plan.nextConfig);
  }

  const taskTicket = input.beginTaskRef.current("restoring-document", {
    clearMessages: false,
    runtimeStep: buildRestoredDocumentLoadingRuntimeStep(),
  });

  void executeDocumentRestoreSession({
    sourcePath: plan.sourcePath,
    nextConfig: plan.nextConfig,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
    taskTicket,
    taskTicketRef: input.taskTicketRef,
    refreshDocumentState: (...args) => input.refreshDocumentStateRef.current(...args),
    refreshHistoryList: (...args) => input.refreshHistoryListRef.current(...args),
    clearLoadedRoundSnapshot: () => input.clearLoadedRoundSnapshotRef.current(),
    loadLatestRoundSnapshot: (...args) => input.loadLatestRoundSnapshotRef.current(...args),
    setModelConfig: input.setModelConfig,
    setError: input.setError,
    setNotice: (message) => input.setNoticeRef.current(message),
    setRuntimeStep: (step) => input.setRuntimeStepRef.current(step),
    finishTaskRef: input.finishTaskRef,
  });
}
