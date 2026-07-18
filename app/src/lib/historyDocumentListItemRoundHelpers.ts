import {
  getRoundsForProfile,
  getCompletedRounds,
  getLatestRound,
} from "@/lib/historyCardHelpers";
import type {
  DocumentHistory,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function deriveHistoryDocumentListItemRounds(input: {
  item: HistoryDocumentSummary;
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  itemsLength: number;
}): {
  isActive: boolean;
  shouldShowRounds: boolean;
  profileRounds: HistoryRound[];
  activeRounds: HistoryRound[];
  visibleRounds: HistoryRound[];
  completedRounds: number[];
  latestRound: HistoryRound | null;
} {
  const isActive = input.currentDocId === input.item.docId;
  const shouldShowRounds = isActive || input.itemsLength === 1;
  const profileRounds = getRoundsForProfile(
    input.item.rounds,
    input.promptProfile,
    input.promptSequence,
    input.promptOptions,
    input.promptWorkflows,
  );
  const activeRounds = isActive && input.currentHistory
    ? getRoundsForProfile(
      input.currentHistory.rounds,
      input.promptProfile,
      input.promptSequence,
      input.promptOptions,
      input.promptWorkflows,
    )
    : profileRounds;
  const visibleRounds = activeRounds.length ? activeRounds : input.item.rounds;
  const completedRounds = getCompletedRounds(
    activeRounds,
    input.promptProfile,
    input.promptSequence,
    input.promptOptions,
    input.promptWorkflows,
  );
  const latestRound = getLatestRound(visibleRounds);
  return {
    isActive,
    shouldShowRounds,
    profileRounds,
    activeRounds,
    visibleRounds,
    completedRounds,
    latestRound,
  };
}
