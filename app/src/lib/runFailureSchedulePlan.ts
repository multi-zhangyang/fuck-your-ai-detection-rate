import type {
  FailureAutoRetrySchedulePlan,
  MaybeScheduleFailureAutoRetryInput,
} from "@/lib/runFailurePrepTypes";
import {
  resolveFailureRetryRound,
  shouldScheduleFailureAutoRetry,
} from "@/lib/runFailureScheduleBuilders";

export function planFailureAutoRetrySchedule(
  input: MaybeScheduleFailureAutoRetryInput,
): FailureAutoRetrySchedulePlan {
  const sourcePath = input.sourcePath ?? undefined;
  const canSchedule = Boolean(sourcePath) && shouldScheduleFailureAutoRetry({
    userCanceled: input.userCanceled,
    resumable: input.resumable,
    sourcePath,
    nextRound: input.launchNextRound,
    mode: input.mode,
  });
  if (!canSchedule || !sourcePath) {
    return { kind: "skip" };
  }
  return {
    kind: "schedule",
    sourcePath,
    round: resolveFailureRetryRound({
      refreshedNextRound: input.refreshedStatus?.nextRound,
      sessionRound: input.runSession?.round,
      launchNextRound: input.launchNextRound,
      attachFallbackRound: input.attachFallbackRound,
    }),
    config: input.config,
    reason: input.reason,
  };
}
