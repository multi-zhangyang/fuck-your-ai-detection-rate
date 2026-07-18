import { createCheckpointProgress } from "@/lib/progressHelpers";
import { createLiveCompareData } from "@/lib/roundResultHelpers";
import {
  buildAttachActiveRunNotice,
  buildInitialRunProgress,
  buildRunStartFeedback,
  pickLiveCompareSeed,
} from "@/lib/runLaunchSeedFeedbackHelpers";
import type {
  DocumentStatus,
  ModelConfig,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export type PrepareRunLaunchResult =
  | {
    kind: "complete";
    runConfig: ModelConfig;
    launchStatus: DocumentStatus;
  }
  | {
    kind: "ready";
    runConfig: ModelConfig;
    launchStatus: DocumentStatus;
    launchNextRound: number;
    launchSeed: ReturnType<typeof planRunLaunchSeed>;
    liveCompareSeed: RoundCompareData;
  };
export type ReadyRunLaunchPrepared = Extract<PrepareRunLaunchResult, { kind: "ready" }>;
export type BuildReadyRunLaunchResultInput = {
  runConfig: ModelConfig;
  launchStatus: DocumentStatus;
};

export function planRunLaunchSeed(input: {
  checkpointStatus: RoundProgressStatus | null;
  launchStatus: DocumentStatus;
  launchNextRound: number;
  rewriteConcurrency: number;
  activeCompareData: RoundCompareData | null | undefined;
  promptProfileLabel: string;
}): {
  checkpointProgress: RoundProgress | null;
  initialProgress: RoundProgress;
  liveCompareSeed: RoundCompareData;
  startFeedback: { runtimeStep: string; notice: string };
} {
  const checkpointProgress = createCheckpointProgress(input.checkpointStatus, input.rewriteConcurrency);
  const initialProgress = buildInitialRunProgress(
    input.checkpointStatus,
    input.launchNextRound,
    input.rewriteConcurrency,
  );
  const liveCompareSeed = pickLiveCompareSeed(
    input.activeCompareData,
    input.launchStatus,
    input.launchNextRound,
  );
  const startFeedback = buildRunStartFeedback({
    checkpointProgress,
    nextRound: input.launchNextRound,
    promptProfileLabel: input.promptProfileLabel,
  });
  return {
    checkpointProgress,
    initialProgress,
    liveCompareSeed,
    startFeedback,
  };
}

export function planAttachRunSeed(input: {
  status: DocumentStatus;
  runRound: number;
  lastEvent?: RoundProgress | null;
}): {
  liveCompareSeed: RoundCompareData;
  initialProgress: RoundProgress | null;
  notice: string;
} {
  return {
    liveCompareSeed: createLiveCompareData(input.status, input.runRound),
    initialProgress: input.lastEvent ?? null,
    notice: buildAttachActiveRunNotice(),
  };
}
