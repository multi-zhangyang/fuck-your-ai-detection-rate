import type {
  BuildAttachRoundFailureInput,
  BuildMaybeScheduleFailureAutoRetryArgs,
  BuildStartRoundFailureInput,
  ClassifiedRunFailure,
  FinalizeFailedRoundInput,
  MaybeScheduleFailureAutoRetryInput,
} from "@/lib/runFailurePrepTypes";
import type { DocumentStatus } from "@/types/app";

export function resolveFailureRetryRound(input: {
  refreshedNextRound?: number | null;
  sessionRound?: number | null;
  launchNextRound?: number | null;
  attachFallbackRound?: number | null;
}): number {
  return (
    input.refreshedNextRound
    || input.sessionRound
    || input.launchNextRound
    || input.attachFallbackRound
    || 1
  );
}

export function shouldScheduleFailureAutoRetry(input: {
  userCanceled: boolean;
  resumable: boolean;
  sourcePath?: string | null;
  nextRound?: number | null;
  mode: "start" | "attach";
}): boolean {
  if (input.userCanceled || !input.resumable || !input.sourcePath) {
    return false;
  }
  if (input.mode === "start") {
    return Boolean(input.nextRound);
  }
  return true;
}

export function buildStartRoundFailureInput(
  input: BuildStartRoundFailureInput,
): FinalizeFailedRoundInput {
  return {
    appError: input.appError,
    runSession: input.runSession,
    mode: "start",
    sourcePath: input.launchStatus?.sourcePath,
    config: input.runConfig,
    launchNextRound: input.launchStatus?.nextRound,
    refreshWithConfig: true,
  };
}

export function buildAttachRoundFailureInput(
  input: BuildAttachRoundFailureInput,
): FinalizeFailedRoundInput {
  return {
    appError: input.appError,
    runSession: input.runSession,
    mode: "attach",
    sourcePath: input.activeRun.sourcePath,
    config: input.config,
    attachFallbackRound: input.activeRun.lastEvent?.round,
  };
}

export function buildMaybeScheduleFailureAutoRetryInput(
  input: BuildMaybeScheduleFailureAutoRetryArgs,
): MaybeScheduleFailureAutoRetryInput {
  return {
    userCanceled: input.userCanceled,
    resumable: input.failure.resumable,
    sourcePath: input.failedRound.sourcePath,
    launchNextRound: input.failedRound.launchNextRound,
    mode: input.failedRound.mode,
    runSession: input.failedRound.runSession,
    attachFallbackRound: input.failedRound.attachFallbackRound,
    config: input.failedRound.config,
    reason: input.runMessage,
    refreshedStatus: input.refreshedStatus,
  };
}

export function buildFailureAutoRetryScheduleArgs(
  input: FinalizeFailedRoundInput,
  runMessage: string,
  userCanceled: boolean,
  failure: ClassifiedRunFailure,
  refreshedStatus: DocumentStatus | null,
): MaybeScheduleFailureAutoRetryInput {
  return buildMaybeScheduleFailureAutoRetryInput({
    userCanceled,
    failure,
    runMessage,
    refreshedStatus,
    failedRound: input,
  });
}
