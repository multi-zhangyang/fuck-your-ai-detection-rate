import { describePromptProfile } from "@/lib/documentStatusCopy";
import { getPlannedRoundCount } from "@/lib/historyHelpers";
import {
  buildCompletedRunLaunchResult,
  buildReadyLaunchResultPayload,
  isWorkflowAlreadyComplete,
  planRunLaunchSeed,
  selectMatchingCheckpointStatus,
  type BuildReadyRunLaunchResultInput,
  type PrepareRunLaunchResult,
} from "@/lib/runRoundPrep";
import type {
  PrepareRunLaunchInput,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import type { RunRoundConfigPrepareHandlers } from "@/lib/runRoundConfigPrepareHandlers";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export type RunRoundLaunchPrepareHandlers = {
  resolveLaunchCheckpointStatus: (launchStatus: DocumentStatus, runConfig: ModelConfig) => Promise<import("@/types/app").RoundProgressStatus | null>;
  planReadyRunLaunchSeed: (input: BuildReadyRunLaunchResultInput, launchNextRound: number) => Promise<{
    initialProgress: import("@/types/app").RoundProgress | null;
    liveCompareSeed: import("@/types/app").RoundCompareData;
    startFeedback: { notice: string; runtimeStep: string };
  }>;
  buildReadyRunLaunchResult: (input: BuildReadyRunLaunchResultInput) => Promise<PrepareRunLaunchResult>;
  prepareRunLaunch: (input: PrepareRunLaunchInput) => Promise<PrepareRunLaunchResult>;
};

export function createRunRoundLaunchPrepareHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
  config: RunRoundConfigPrepareHandlers,
): RunRoundLaunchPrepareHandlers {
  async function resolveLaunchCheckpointStatus(launchStatus: DocumentStatus, runConfig: ModelConfig) {
    const matchedCheckpoint = selectMatchingCheckpointStatus(
      deps.getRoundProgressStatus(),
      launchStatus,
      runConfig,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    return matchedCheckpoint ?? await progress.refreshRoundProgressStatus(launchStatus, runConfig);
  }

  async function planReadyRunLaunchSeed(input: BuildReadyRunLaunchResultInput, launchNextRound: number) {
    const checkpointStatus = await resolveLaunchCheckpointStatus(input.launchStatus, input.runConfig);
    return planRunLaunchSeed({
      checkpointStatus,
      launchStatus: input.launchStatus,
      launchNextRound,
      rewriteConcurrency: input.runConfig.rewriteConcurrency,
      activeCompareData: deps.getActiveCompareData(),
      promptProfileLabel: describePromptProfile(input.runConfig.promptProfile, deps.getPromptWorkflows()),
    });
  }

  async function buildReadyRunLaunchResult(
    input: BuildReadyRunLaunchResultInput,
  ): Promise<PrepareRunLaunchResult> {
    const launchPlannedRounds = getPlannedRoundCount(
      input.runConfig,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    if (isWorkflowAlreadyComplete(input.launchStatus, launchPlannedRounds) || !input.launchStatus.nextRound) {
      return buildCompletedRunLaunchResult(input);
    }
    const launchNextRound = input.launchStatus.nextRound;
    return buildReadyLaunchResultPayload(
      input,
      launchNextRound,
      await planReadyRunLaunchSeed(input, launchNextRound),
    );
  }

  async function prepareRunLaunch(input: PrepareRunLaunchInput): Promise<PrepareRunLaunchResult> {
    deps.clearPendingAutoActionForSource(input.documentStatus.sourcePath);
    const runConfig = await config.persistRunConfigForLaunch(config.buildLaunchRunConfig(input.configOverride));
    const launchStatus = await deps.refreshDocumentState(input.documentStatus.sourcePath, runConfig);
    return buildReadyRunLaunchResult({ runConfig, launchStatus });
  }

  return {
    resolveLaunchCheckpointStatus,
    planReadyRunLaunchSeed,
    buildReadyRunLaunchResult,
    prepareRunLaunch,
  };
}
