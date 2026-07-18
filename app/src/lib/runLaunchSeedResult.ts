import type { RunSession } from "@/hooks/useRunSession";
import type {
  BuildReadyRunLaunchResultInput,
  PrepareRunLaunchResult,
  ReadyRunLaunchPrepared,
} from "@/lib/runLaunchSeedCore";
import type {
  DocumentStatus,
  RoundCompareData,
  RoundProgress,
} from "@/types/app";

export function buildCompletedRunLaunchResult(
  input: BuildReadyRunLaunchResultInput,
): PrepareRunLaunchResult {
  return {
    kind: "complete",
    runConfig: input.runConfig,
    launchStatus: input.launchStatus,
  };
}

export function buildReadyLaunchResultPayload(
  input: BuildReadyRunLaunchResultInput,
  launchNextRound: number,
  launchSeed: {
    checkpointProgress: RoundProgress | null;
    initialProgress: RoundProgress;
    liveCompareSeed: RoundCompareData;
    startFeedback: { notice: string; runtimeStep: string };
  },
): PrepareRunLaunchResult {
  return {
    kind: "ready",
    runConfig: input.runConfig,
    launchStatus: input.launchStatus,
    launchNextRound,
    launchSeed,
    liveCompareSeed: launchSeed.liveCompareSeed,
  };
}

export function buildReadyRunExecutionResult(
  prepared: ReadyRunLaunchPrepared,
  runSession: RunSession,
) {
  return {
    runSession,
    runConfig: prepared.runConfig,
    launchStatus: prepared.launchStatus,
  };
}

export function buildPrepareAttachActiveRunResult(
  status: DocumentStatus,
  runRound: number,
  seeded: { runSession: RunSession; liveCompareSeed: RoundCompareData | null },
) {
  return {
    runSession: seeded.runSession,
    status,
    runRound,
    liveCompareSeed: seeded.liveCompareSeed,
  };
}
