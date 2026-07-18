import { normalizeDetectionDocumentKey } from "@/lib/documentMatch";
import {
  getLatestHistoryRound,
  historyItemMatchesDocument,
} from "@/lib/historyHelpers";
import {
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type AutoSnapshotRestorePlan = {
  restoreKey: string;
  restoreConfig: ModelConfig;
  matchedItem: HistoryDocumentSummary | undefined;
  outputPath: string;
};

export function planAutoSnapshotRestore(input: {
  documentStatus: DocumentStatus;
  modelConfig: ModelConfig;
  historyItems: HistoryDocumentSummary[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
}): AutoSnapshotRestorePlan | null {
  const statusPromptProfile = input.documentStatus.promptProfile ?? input.modelConfig.promptProfile;
  const statusPromptSequence = normalizePromptSequence(
    input.documentStatus.promptSequence ?? input.modelConfig.promptSequence,
    input.promptOptions,
    statusPromptProfile,
    input.promptWorkflows,
  );
  const matchedItem = input.historyItems.find((item) => historyItemMatchesDocument(item, input.documentStatus, input.documentStatus.sourcePath));
  const latestRound = matchedItem
    ? getLatestHistoryRound(
      matchedItem,
      statusPromptProfile,
      statusPromptSequence,
      true,
      input.promptOptions,
      input.promptWorkflows,
    )
    : null;
  const outputPath = latestRound?.outputPath || input.documentStatus.latestOutputPath;
  if (!outputPath) {
    return null;
  }
  const restoreKey = [
    normalizeDetectionDocumentKey(input.documentStatus.sourcePath),
    statusPromptProfile,
    statusPromptSequence.join(","),
    normalizeDetectionDocumentKey(outputPath),
  ].join("::");
  return {
    restoreKey,
    restoreConfig: {
      ...input.modelConfig,
      promptProfile: statusPromptProfile,
      promptSequence: statusPromptSequence,
    },
    matchedItem,
    outputPath,
  };
}
