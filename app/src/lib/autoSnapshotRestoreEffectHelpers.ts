import { shouldSuppressAutoSnapshotRestore } from "@/lib/autoSnapshot";
import { planAutoSnapshotRestore, type AutoSnapshotRestorePlan } from "@/lib/autoSnapshotRestoreHelpers";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function shouldStartAutoSnapshotRestore(input: {
  documentStatus: DocumentStatus | null;
  currentRunToken: string | null;
  currentBatchRerunToken: string | null;
  taskPhase: string;
}): boolean {
  return Boolean(
    input.documentStatus?.sourcePath
    && !input.currentRunToken
    && !input.currentBatchRerunToken
    && input.taskPhase === "idle",
  );
}

export function shouldClearAutoSnapshotKey(activeCompareChunkCount?: number): boolean {
  return Boolean(activeCompareChunkCount);
}

export function resolveAutoSnapshotRestorePlan(input: {
  documentStatus: DocumentStatus;
  modelConfig: ModelConfig;
  historyItems: HistoryDocumentSummary[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  currentRestoreKey: string;
}): AutoSnapshotRestorePlan | null {
  if (shouldSuppressAutoSnapshotRestore(
    input.documentStatus,
    input.modelConfig,
    input.promptOptions,
    input.promptWorkflows,
  )) {
    return null;
  }
  const plan = planAutoSnapshotRestore({
    documentStatus: input.documentStatus,
    modelConfig: input.modelConfig,
    historyItems: input.historyItems,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
  });
  if (!plan) {
    return null;
  }
  if (input.currentRestoreKey === plan.restoreKey) {
    return null;
  }
  return plan;
}
