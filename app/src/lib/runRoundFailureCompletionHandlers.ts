import { stringifyError } from "@/lib/errorText";
import {
  classifyRunFailure,
  materializeRunFailureUi,
  type ClassifiedRunFailure,
  type FinalizeFailedRoundInput,
} from "@/lib/runRoundPrep";
import type {
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";

export type RunRoundFailureCompletionHandlers = {
  applyClassifiedRunFailure: (
    runMessage: string,
    userCanceled: boolean,
    mode: FinalizeFailedRoundInput["mode"],
  ) => ClassifiedRunFailure;
  finalizeFailedRound: (input: FinalizeFailedRoundInput) => Promise<void>;
};

export function createRunRoundFailureCompletionHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
): RunRoundFailureCompletionHandlers {
  function applyClassifiedRunFailure(
    runMessage: string,
    userCanceled: boolean,
    mode: FinalizeFailedRoundInput["mode"],
  ) {
    const failure = classifyRunFailure(runMessage, userCanceled, mode);
    const failureUi = materializeRunFailureUi(failure);
    if (failureUi.clearError) deps.setError("");
    else deps.setError(failureUi.error);
    if (failureUi.notice) deps.setNotice(failureUi.notice);
    deps.setRuntimeStep(failureUi.runtimeStep);
    return failure;
  }

  async function finalizeFailedRound(input: FinalizeFailedRoundInput) {
    await progress.clearActiveRunProgressUi(input.runSession);
    const runMessage = stringifyError(input.appError);
    const userCanceled = deps.isRunSessionCancelRequested(input.runSession);
    const failure = applyClassifiedRunFailure(runMessage, userCanceled, input.mode);
    await deps.scheduleFailureAutoRetryAfterRefresh(input, runMessage, userCanceled, failure);
  }

  return {
    applyClassifiedRunFailure,
    finalizeFailedRound,
  };
}
