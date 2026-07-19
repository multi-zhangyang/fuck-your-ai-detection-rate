import {
  appendCurrentBatchRerunTask,
  appendCurrentRunTask,
  appendPendingAutoActionTask,
} from "@/lib/runtimeTaskCenterActiveHelpers";
import {
  appendBackgroundDiagnosticsTasks,
  appendCheckpointResumeTask,
} from "@/lib/runtimeTaskCenterBackgroundHelpers";
import {
  appendDiffReviewTask,
  appendErrorRecoveryTask,
} from "@/lib/runtimeTaskCenterDiffHelpers";
import { appendTaskPhaseItem } from "@/lib/runtimeTaskCenterPhaseHelpers";
import type {
  RuntimeTaskCenterInput,
  RuntimeTaskCenterItem,
} from "@/lib/runtimeTaskCenterTypes";

export type {
  RuntimeTaskCenterActions,
  RuntimeTaskCenterInput,
  RuntimeTaskCenterItem,
} from "@/lib/runtimeTaskCenterTypes";

export function buildRuntimeTaskCenterItems(input: RuntimeTaskCenterInput): RuntimeTaskCenterItem[] {
  const items: RuntimeTaskCenterItem[] = [];
  const activeRunStatus = input.roundProgressStatus?.activeRun && !input.roundProgressStatus.activeRun.completed
    ? input.roundProgressStatus.activeRun
    : null;
  const activeProgress = input.progress ?? activeRunStatus?.lastEvent ?? null;

  appendPendingAutoActionTask(items, input.pendingAutoAction, input.actions);
  appendCurrentRunTask(items, {
    currentRunToken: input.currentRunToken,
    runSession: input.runSession,
    activeProgress,
    activeRunStatus,
    progressPercent: input.progressPercent,
    actions: input.actions,
  });
  appendCurrentBatchRerunTask(items, {
    currentBatchRerunToken: input.currentBatchRerunToken,
    batchRerunSession: input.batchRerunSession,
    diagnostics: input.diagnostics,
    actions: input.actions,
  });
  appendTaskPhaseItem(items, {
    taskPhase: input.taskPhase,
    currentRunToken: input.currentRunToken,
    currentBatchRerunToken: input.currentBatchRerunToken,
    busy: input.busy,
    progressPercent: input.progressPercent,
    modelCatalogAbortActive: input.modelCatalogAbortActive,
    actions: input.actions,
  });
  appendDiffReviewTask(items, {
    activeCompareData: input.activeCompareData,
    activeRerunFailures: input.activeRerunFailures,
    reviewDecisions: input.reviewDecisions,
    actions: input.actions,
  });
  appendErrorRecoveryTask(items, input.error, input.actions);
  appendBackgroundDiagnosticsTasks(items, {
    currentRunToken: input.currentRunToken,
    currentBatchRerunToken: input.currentBatchRerunToken,
    diagnostics: input.diagnostics,
    actions: input.actions,
  });
  appendCheckpointResumeTask(items, {
    currentRunToken: input.currentRunToken,
    roundProgressStatus: input.roundProgressStatus,
    documentStatus: input.documentStatus,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
    actions: input.actions,
  });

  return items;
}
