import { resolveRoundProgressRoute } from "@/lib/documentStatusCopy";
import { mergeVisibleProgress } from "@/lib/progressHelpers";
import { materializeRoundProgressListenerUpdate } from "@/lib/runRoundPrep";
import type { RunSession } from "@/hooks/useRunSession";
import type {
  AttachRoundProgressListenerInput,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import type { RoundProgressStatus } from "@/types/app";

export function createRunRoundProgressHandlers(deps: RunRoundHandlersDeps): RunRoundProgressHandlers {
  function beginRoundProgressRequest() {
    const requestId = deps.getRoundProgressRequestId() + 1;
    deps.setRoundProgressRequestId(requestId);
    return requestId;
  }

  function isCurrentRoundProgressRequest(requestId: number) {
    return requestId === deps.getRoundProgressRequestId();
  }

  function commitRoundProgressStatus(
    requestId: number,
    nextStatus: RoundProgressStatus | null,
    shouldCommit?: () => boolean,
  ) {
    if (isCurrentRoundProgressRequest(requestId) && (!shouldCommit || shouldCommit())) {
      deps.setRoundProgressStatus(nextStatus);
    }
  }

  async function refreshRoundProgressStatus(
    status = deps.getDocumentStatus(),
    config = deps.getModelConfig(),
    options: { shouldCommit?: () => boolean } = {},
  ) {
    const requestId = beginRoundProgressRequest();
    if (!status?.sourcePath || !status.hasNextRound || !status.nextRound) {
      commitRoundProgressStatus(requestId, null, options.shouldCommit);
      return null;
    }
    try {
      const route = resolveRoundProgressRoute({
        status,
        config,
        promptOptions: deps.getPromptOptions(),
        promptWorkflows: deps.getPromptWorkflows(),
      });
      const nextStatus = await deps.service.getRoundProgressStatus(
        status.sourcePath,
        route.statusPromptProfile,
        status.nextRound!,
        route.statusPromptSequence,
      );
      commitRoundProgressStatus(requestId, nextStatus, options.shouldCommit);
      return nextStatus;
    } catch {
      commitRoundProgressStatus(requestId, null, options.shouldCommit);
      return null;
    }
  }

  async function attachRoundProgressListener(input: AttachRoundProgressListenerInput) {
    deps.setProgressUnlisten(await deps.service.listenRoundProgress((nextProgress) => {
      if (!deps.isActiveRunSession(input.runSession)) return;
      const update = materializeRoundProgressListenerUpdate({
        currentProgress: deps.getVisibleProgress(),
        nextProgress,
        currentCompare: deps.getLiveCompare(),
        liveCompareSeed: input.liveCompareSeed,
        runtimeFallback: input.runtimeFallback,
      });
      deps.setVisibleProgress(update.visibleProgress);
      deps.setProgress(update.visibleProgress);
      if (update.compareData) {
        deps.setLiveCompare(update.compareData);
        deps.setCompareData(update.compareData);
      }
      if (update.nextReviewDecisions) deps.setReviewDecisions(update.nextReviewDecisions);
      deps.setRuntimeStep(update.runtimeStep);
    }, input.runToken));
  }

  async function mergeActiveRunProgressSnapshot(input: { runSession: RunSession | null; runToken: string }) {
    try {
      const activeRun = (await deps.service.getHealth()).activeRuns.find((item) => item.runId === input.runToken);
      if (!(activeRun?.lastEvent && deps.isActiveRunSession(input.runSession))) return;
      const visibleProgress = mergeVisibleProgress(deps.getVisibleProgress(), activeRun.lastEvent);
      deps.setVisibleProgress(visibleProgress);
      deps.setProgress(visibleProgress);
    } catch {
      /* keep seeded progress when health snapshot is temporarily unavailable */
    }
  }

  async function clearActiveRunProgressUi(runSession: RunSession | null) {
    if (!deps.isActiveRunSession(runSession)) return;
    await deps.releaseProgressListener();
    deps.setVisibleProgress(null);
    deps.setProgress(null);
  }

  return {
    beginRoundProgressRequest,
    isCurrentRoundProgressRequest,
    commitRoundProgressStatus,
    refreshRoundProgressStatus,
    attachRoundProgressListener,
    mergeActiveRunProgressSnapshot,
    clearActiveRunProgressUi,
  };
}
