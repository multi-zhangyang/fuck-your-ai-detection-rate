import {
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { promptSequencesEqual } from "@/lib/modelRoute";
import {
  isPromptProfile,
} from "@/lib/historyMatchHelpers";
import type {
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function resolveLoadedHistoryRoute(input: {
  selectedConfig: ModelConfig;
  loadedSnapshot: {
    round?: HistoryRound | null;
    compareData?: { promptProfile?: string | null; promptSequence?: PromptId[] | null } | null;
  } | null | undefined;
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): {
  statusConfig: ModelConfig;
  shouldResync: boolean;
} {
  const loadedProfile = input.loadedSnapshot?.round?.promptProfile ?? input.loadedSnapshot?.compareData?.promptProfile;
  const loadedPromptProfile = isPromptProfile(loadedProfile, input.promptWorkflows)
    ? loadedProfile
    : input.selectedConfig.promptProfile;
  const loadedSequence = normalizePromptSequence(
    input.loadedSnapshot?.round?.promptSequence
      ?? input.loadedSnapshot?.compareData?.promptSequence
      ?? input.selectedConfig.promptSequence,
    input.promptOptions,
    loadedPromptProfile,
    input.promptWorkflows,
  );
  if (
    isPromptProfile(loadedProfile, input.promptWorkflows)
    && (
      loadedProfile !== input.selectedConfig.promptProfile
      || !promptSequencesEqual(
        loadedSequence,
        input.selectedConfig.promptSequence,
        input.promptOptions,
        loadedPromptProfile,
        input.promptWorkflows,
      )
    )
  ) {
    return {
      statusConfig: {
        ...input.selectedConfig,
        promptProfile: loadedProfile,
        promptSequence: loadedSequence,
      },
      shouldResync: true,
    };
  }
  return { statusConfig: input.selectedConfig, shouldResync: false };
}
