import { isPromptProfile } from "@/lib/historyHelpers";
import { promptSequencesEqual } from "@/lib/modelRoute";
import {
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import type {
  ModelConfig,
  PromptOption,
  PromptWorkflow,
  RoundCompareData,
} from "@/types/app";

export function resolveAutoSnapshotLoadedRoute(input: {
  loadedSnapshot: {
    round?: { promptProfile?: string | null; promptSequence?: string[] | null } | null;
    compareData: Pick<RoundCompareData, "round" | "promptProfile" | "promptSequence">;
  };
  restoreConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
}): {
  shouldSync: boolean;
  syncedConfig: ModelConfig;
  loadedProfile: ModelConfig["promptProfile"];
  loadedSequence: ModelConfig["promptSequence"];
} {
  const loadedProfileRaw = input.loadedSnapshot.round?.promptProfile ?? input.loadedSnapshot.compareData.promptProfile;
  const loadedPromptProfile = isPromptProfile(loadedProfileRaw, input.promptWorkflows)
    ? loadedProfileRaw
    : input.restoreConfig.promptProfile;
  const loadedSequence = normalizePromptSequence(
    input.loadedSnapshot.round?.promptSequence
      ?? input.loadedSnapshot.compareData.promptSequence
      ?? input.restoreConfig.promptSequence,
    input.promptOptions,
    loadedPromptProfile,
    input.promptWorkflows,
  );
  const shouldSync = Boolean(
    isPromptProfile(loadedProfileRaw, input.promptWorkflows)
    && (
      loadedProfileRaw !== input.restoreConfig.promptProfile
      || !promptSequencesEqual(
        loadedSequence,
        input.restoreConfig.promptSequence,
        input.promptOptions,
        loadedPromptProfile,
        input.promptWorkflows,
      )
    ),
  );
  return {
    shouldSync,
    syncedConfig: {
      ...input.restoreConfig,
      promptProfile: isPromptProfile(loadedProfileRaw, input.promptWorkflows) ? loadedProfileRaw : loadedPromptProfile,
      promptSequence: loadedSequence,
    },
    loadedProfile: isPromptProfile(loadedProfileRaw, input.promptWorkflows) ? loadedProfileRaw : loadedPromptProfile,
    loadedSequence,
  };
}
