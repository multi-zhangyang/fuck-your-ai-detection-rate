import {
  getDefaultPromptProfile,
  isPromptSequenceCustomizable,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { promptSequencesEqual } from "@/lib/modelRoute";
import {
  getPreferredHistoryRound,
  isPromptProfile,
  sortHistoryRounds,
} from "@/lib/historyRoundMatchHelpers";
import type {
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function buildConfigForHistorySelection(
  item: HistoryDocumentSummary,
  fallbackConfig: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): ModelConfig {
  const preferredRound = getPreferredHistoryRound(item);
  const promptProfile = isPromptProfile(preferredRound?.promptProfile, promptWorkflows)
    ? preferredRound.promptProfile
    : fallbackConfig.promptProfile;
  const promptSequence = isPromptSequenceCustomizable(promptProfile, promptWorkflows)
    ? normalizePromptSequence(preferredRound?.promptSequence ?? fallbackConfig.promptSequence, promptOptions, promptProfile, promptWorkflows)
    : normalizePromptSequence(fallbackConfig.promptSequence, promptOptions, promptProfile, promptWorkflows);
  return { ...fallbackConfig, promptProfile, promptSequence };
}

export function resolveRestoredPromptProfile(
  storedPromptProfile: string | null,
  matchedItem: HistoryDocumentSummary | undefined,
  fallbackProfile: ModelConfig["promptProfile"],
  promptWorkflows?: PromptWorkflow[],
): ModelConfig["promptProfile"] {
  const defaultProfile = getDefaultPromptProfile(promptWorkflows);
  if (isPromptProfile(storedPromptProfile, promptWorkflows)) {
    if (storedPromptProfile === defaultProfile || isPromptSequenceCustomizable(storedPromptProfile, promptWorkflows)) {
      return storedPromptProfile;
    }
    if (matchedItem?.rounds.some((roundItem) => (roundItem.promptProfile || "cn") === storedPromptProfile)) {
      return storedPromptProfile;
    }
  }
  const latestRound = matchedItem ? sortHistoryRounds(matchedItem.rounds, "timestamp")[0] : null;
  return isPromptProfile(latestRound?.promptProfile, promptWorkflows) ? latestRound.promptProfile : fallbackProfile;
}

export function shouldSyncHistorySelectionConfig(
  selectedConfig: ModelConfig,
  modelConfig: ModelConfig,
  promptOptions: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  return (
    selectedConfig.promptProfile !== modelConfig.promptProfile
    || !promptSequencesEqual(
      selectedConfig.promptSequence,
      modelConfig.promptSequence,
      promptOptions,
      selectedConfig.promptProfile,
      promptWorkflows,
    )
  );
}
