import {
  buildRestoredDocumentConfig,
  readStoredDocumentRestoreSource,
  resolveStoredDocumentRestoreTarget,
} from "@/lib/documentRestoreHelpers";
import type {
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type DocumentRestoreBootstrapPlan =
  | { kind: "skip" }
  | {
    kind: "restore";
    sourcePath: string;
    nextConfig: ModelConfig;
    shouldSyncConfig: boolean;
  };

export function planDocumentRestoreBootstrap(input: {
  historyItems: HistoryDocumentSummary[];
  modelConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
}): DocumentRestoreBootstrapPlan {
  const stored = readStoredDocumentRestoreSource();
  const target = resolveStoredDocumentRestoreTarget({
    storedSourcePath: stored.storedSourcePath,
    historyItems: input.historyItems,
  });
  if (!target.sourcePath) {
    return { kind: "skip" };
  }
  const { nextConfig, shouldSyncConfig } = buildRestoredDocumentConfig({
    modelConfig: input.modelConfig,
    storedPromptProfile: stored.storedPromptProfile,
    storedPromptSequence: stored.storedPromptSequence,
    matchedItem: target.matchedItem,
    promptOptions: input.promptOptions,
    promptWorkflows: input.promptWorkflows,
  });
  return {
    kind: "restore",
    sourcePath: target.sourcePath,
    nextConfig,
    shouldSyncConfig,
  };
}
