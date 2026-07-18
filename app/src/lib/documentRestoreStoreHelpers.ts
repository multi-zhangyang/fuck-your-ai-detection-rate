import {
  resolveRestoredPromptProfile,
} from "@/lib/historyHelpers";
import {
  isPromptSequenceCustomizable,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { promptSequencesEqual } from "@/lib/modelRoute";
import { readStoredPromptSequence } from "@/lib/promptStorage";
import { readStorageValue, removeStorageValue, writeStorageValue } from "@/lib/safeStorage";
import {
  ACTIVE_DOCUMENT_KEY,
  ACTIVE_PROMPT_PROFILE_KEY,
  ACTIVE_PROMPT_SEQUENCE_KEY,
} from "@/lib/storageKeys";
import type {
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function readStoredDocumentRestoreSource(): {
  storedSourcePath: string;
  storedPromptProfile: ModelConfig["promptProfile"] | null;
  storedPromptSequence: ReturnType<typeof readStoredPromptSequence>;
} {
  return {
    storedSourcePath: readStorageValue(ACTIVE_DOCUMENT_KEY) || "",
    storedPromptProfile: readStorageValue(ACTIVE_PROMPT_PROFILE_KEY) as ModelConfig["promptProfile"] | null,
    storedPromptSequence: readStoredPromptSequence(),
  };
}

export function resolveStoredDocumentRestoreTarget(input: {
  storedSourcePath: string;
  historyItems: HistoryDocumentSummary[];
}): {
  matchedItem: HistoryDocumentSummary | undefined;
  sourcePath: string | null;
} {
  if (!input.storedSourcePath) {
    return { matchedItem: undefined, sourcePath: null };
  }
  const matchedItem = input.historyItems.find((item) => (
    item.sourcePath === input.storedSourcePath
    || item.originPath === input.storedSourcePath
    || item.docId === input.storedSourcePath
  ));
  return {
    matchedItem,
    sourcePath: matchedItem?.sourcePath || input.storedSourcePath || null,
  };
}

export function buildRestoredDocumentConfig(input: {
  modelConfig: ModelConfig;
  storedPromptProfile: ModelConfig["promptProfile"] | null;
  storedPromptSequence: ReturnType<typeof readStoredPromptSequence>;
  matchedItem?: HistoryDocumentSummary;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): {
  nextConfig: ModelConfig;
  shouldSyncConfig: boolean;
} {
  const safeProfile = resolveRestoredPromptProfile(
    input.storedPromptProfile,
    input.matchedItem,
    input.modelConfig.promptProfile,
    input.promptWorkflows,
  );
  const nextSequence = isPromptSequenceCustomizable(safeProfile, input.promptWorkflows)
    ? normalizePromptSequence(input.storedPromptSequence, input.promptOptions, safeProfile, input.promptWorkflows)
    : normalizePromptSequence(input.modelConfig.promptSequence, input.promptOptions, safeProfile, input.promptWorkflows);
  const nextConfig = {
    ...input.modelConfig,
    promptProfile: safeProfile,
    promptSequence: nextSequence,
  };
  const shouldSyncConfig = (
    nextConfig.promptProfile !== input.modelConfig.promptProfile
    || !promptSequencesEqual(
      nextConfig.promptSequence,
      input.modelConfig.promptSequence,
      input.promptOptions,
      safeProfile,
      input.promptWorkflows,
    )
  );
  return { nextConfig, shouldSyncConfig };
}

export function persistRestoredPromptRoute(profile: ModelConfig["promptProfile"], sequence: ModelConfig["promptSequence"]) {
  writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, profile);
  writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(sequence));
}

export function clearStoredActiveDocument() {
  removeStorageValue(ACTIVE_DOCUMENT_KEY);
}
