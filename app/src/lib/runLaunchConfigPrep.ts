import { sameWorkspacePath } from "@/lib/documentPaths";
import { normalizeActiveModelConfig, normalizeRewriteConcurrency, promptSequencesEqual } from "@/lib/modelRoute";
import {
  getDefaultPromptProfile,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import type {
  DocumentStatus,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
  RoundProgressStatus,
} from "@/types/app";

export function buildRunConfigForLaunch(
  configOverride: ModelConfig | undefined,
  latestModelConfig: ModelConfig | null | undefined,
  modelConfig: ModelConfig,
  promptOptions: PromptOption[],
  promptWorkflows: PromptWorkflow[],
  normalizeActiveModelConfig: (
    config: ModelConfig,
    promptOptions: PromptOption[],
    promptWorkflows: PromptWorkflow[],
  ) => ModelConfig,
): ModelConfig {
  const baseModelConfig = normalizeActiveModelConfig(
    configOverride ?? latestModelConfig ?? modelConfig,
    promptOptions,
    promptWorkflows,
  );
  const selectedPromptProfile = normalizePromptProfile(baseModelConfig.promptProfile, promptWorkflows)
    ?? getDefaultPromptProfile(promptWorkflows);
  const selectedPromptSequence = normalizePromptSequence(
    baseModelConfig.promptSequence,
    promptOptions,
    selectedPromptProfile,
    promptWorkflows,
  );
  return {
    ...baseModelConfig,
    rewriteConcurrency: normalizeRewriteConcurrency(baseModelConfig.rewriteConcurrency),
    promptProfile: selectedPromptProfile,
    promptSequence: selectedPromptSequence,
  };
}

export function shouldSyncRunConfigToUi(
  runConfig: ModelConfig,
  modelConfig: ModelConfig,
  promptOptions: PromptOption[],
  promptWorkflows: PromptWorkflow[],
): boolean {
  return (
    runConfig.promptProfile !== modelConfig.promptProfile
    || runConfig.rewriteConcurrency !== modelConfig.rewriteConcurrency
    || !promptSequencesEqual(
      runConfig.promptSequence,
      modelConfig.promptSequence,
      promptOptions,
      runConfig.promptProfile,
      promptWorkflows,
    )
  );
}

export function mergeSavedRunConfig(savedConfig: ModelConfig, runConfig: ModelConfig): ModelConfig {
  return {
    ...savedConfig,
    ...runConfig,
    roundModels: { ...(savedConfig.roundModels ?? {}), ...(runConfig.roundModels ?? {}) },
    rewriteConcurrency: normalizeRewriteConcurrency(runConfig.rewriteConcurrency),
  };
}

export function selectMatchingCheckpointStatus(
  roundProgressStatus: RoundProgressStatus | null | undefined,
  launchStatus: DocumentStatus,
  runConfig: ModelConfig,
  promptOptions: PromptOption[],
  promptWorkflows: PromptWorkflow[],
): RoundProgressStatus | null {
  if (
    roundProgressStatus
    && sameWorkspacePath(roundProgressStatus.sourcePath, launchStatus.sourcePath)
    && roundProgressStatus.round === launchStatus.nextRound
    && roundProgressStatus.promptProfile === runConfig.promptProfile
    && promptSequencesEqual(
      roundProgressStatus.promptSequence,
      runConfig.promptSequence,
      promptOptions,
      runConfig.promptProfile,
      promptWorkflows,
    )
  ) {
    return roundProgressStatus;
  }
  return null;
}
