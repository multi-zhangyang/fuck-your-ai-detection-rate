import {
  buildFailureAutoRetryScheduleArgs,
  type ClassifiedRunFailure,
  type FinalizeFailedRoundInput,
} from "@/lib/runRoundPrep";
import type {
  AutoRunHandlersDeps,
  RefreshStatusAfterFailedRoundInput,
} from "@/lib/autoRunHandlerTypes";
import type { DocumentStatus } from "@/types/app";

export function createAutoRunFailureRefreshHandlers(
  deps: AutoRunHandlersDeps,
  maybeScheduleFailureAutoRetry: (input: import("@/lib/runRoundPrep").MaybeScheduleFailureAutoRetryInput) => void,
) {
  async function refreshDocumentStateForFailedRound(input: RefreshStatusAfterFailedRoundInput) {
    if (!input.sourcePath) return null;
    return input.refreshWithConfig
      ? await deps.refreshDocumentState(input.sourcePath, input.config)
      : await deps.refreshDocumentState(input.sourcePath);
  }

  async function scheduleFailureAutoRetryAfterRefresh(
    input: FinalizeFailedRoundInput,
    runMessage: string,
    userCanceled: boolean,
    failure: ClassifiedRunFailure,
  ) {
    let refreshedStatus: DocumentStatus | null = null;
    try {
      refreshedStatus = await refreshDocumentStateForFailedRound({
        sourcePath: input.sourcePath,
        config: input.config,
        refreshWithConfig: input.refreshWithConfig,
      });
      if (refreshedStatus) await deps.refreshHistoryList();
      else refreshedStatus = null;
    } catch {
      refreshedStatus = null;
    }
    maybeScheduleFailureAutoRetry(
      buildFailureAutoRetryScheduleArgs(input, runMessage, userCanceled, failure, refreshedStatus),
    );
  }

  return {
    refreshDocumentStateForFailedRound,
    scheduleFailureAutoRetryAfterRefresh,
  };
}
