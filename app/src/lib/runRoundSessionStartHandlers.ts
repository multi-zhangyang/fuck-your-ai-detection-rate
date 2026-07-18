import type { ReadyRunLaunchPrepared } from "@/lib/runRoundPrep";
import type {
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
  StartAndListenRunRoundInput,
  StartAndListenRunRoundResult,
} from "@/lib/runRoundHandlerTypes";
import type { RunSession } from "@/hooks/useRunSession";
import {
  beginRoundArtifactSnapshotIntent,
  guardRoundArtifactSnapshotCommit,
  roundArtifactPathsMatch,
} from "@/lib/roundArtifactSnapshot";
import { startRevisionBoundRound } from "@/lib/roundInputRevisionGate";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";

const ROUND_INPUT_REVISION_PREVIEW_CHARS = 1;

export function createRunRoundSessionStartHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
) {
  function launchIntentIsCurrent(prepared: ReadyRunLaunchPrepared, taskTicket: number): boolean {
    const current = deps.getDocumentStatus();
    return Boolean(
      current
      && deps.getCurrentTaskTicket() === taskTicket
      && current.docId === prepared.launchStatus.docId
      && current.nextRound === prepared.launchNextRound
      && roundArtifactPathsMatch(current.sourcePath, prepared.launchStatus.sourcePath)
      && (
        prepared.launchNextRound <= 1
        || roundArtifactPathsMatch(
          current.latestOutputPath,
          prepared.launchStatus.latestOutputPath,
        )
      )
    );
  }

  function beginStartedRunSession(prepared: ReadyRunLaunchPrepared, runToken: string, taskTicket: number) {
    return deps.beginRunSession({
      runId: runToken,
      sourcePath: prepared.launchStatus.sourcePath,
      round: prepared.launchNextRound,
      taskTicket,
      mode: "start",
    });
  }

  async function createStartedRunSession(
    prepared: ReadyRunLaunchPrepared,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) {
    if (
      autoNextApproval
      && (
        autoNextApproval.docId !== prepared.launchStatus.docId
        || autoNextApproval.completedRound !== prepared.launchNextRound - 1
        || !roundArtifactPathsMatch(
          autoNextApproval.outputPath,
          prepared.launchStatus.latestOutputPath,
        )
      )
    ) {
      throw new Error("RateAudit 自动下一轮批准不属于当前父轮，未启动模型任务。");
    }
    const runToken = await startRevisionBoundRound({
      launch: {
        sourcePath: prepared.launchStatus.sourcePath,
        docId: prepared.launchStatus.docId,
        nextRound: prepared.launchNextRound,
        parentOutputPath: prepared.launchStatus.latestOutputPath,
      },
      isCurrent: () => launchIntentIsCurrent(prepared, taskTicket),
      approvedParentGeneration: autoNextApproval
        ? {
          compareRevision: autoNextApproval.compareRevision,
          reviewRevision: autoNextApproval.reviewRevision,
          contentRevision: autoNextApproval.contentRevision,
          artifactSnapshotDigest: autoNextApproval.artifactSnapshotDigest,
          effectiveTextSha256: autoNextApproval.effectiveTextSha256,
        }
        : undefined,
      flushReviewDecisionSaves: (outputPath) => deps.flushReviewDecisionSaves(outputPath),
      loadParentSnapshot: async (outputPath, expectedRound) => {
        const requestIntent = beginRoundArtifactSnapshotIntent(
          deps.roundArtifactSnapshotIntentRef,
          {
            outputPath,
            docId: prepared.launchStatus.docId,
            round: expectedRound,
          },
        );
        const parentSnapshot = await deps.service.readRoundSnapshot(outputPath, {
          maxChars: ROUND_INPUT_REVISION_PREVIEW_CHARS,
        });
        const guarded = guardRoundArtifactSnapshotCommit(
          requestIntent,
          deps.roundArtifactSnapshotIntentRef.current,
          parentSnapshot,
        );
        return guarded.status === "ready"
          ? {
            status: "ready" as const,
            compareRevision: parentSnapshot.compareRevision,
            reviewRevision: parentSnapshot.reviewRevision,
            contentRevision: parentSnapshot.contentRevision,
            artifactSnapshotDigest: parentSnapshot.artifactSnapshotDigest,
            effectiveTextSha256: parentSnapshot.effectiveTextSha256,
          }
          : { status: "stale" as const };
      },
      startRunRound: (previousRoundBinding) => deps.service.startRunRound(
        prepared.launchStatus.sourcePath,
        prepared.runConfig,
        previousRoundBinding,
      ),
      cancelRunRound: (runId) => deps.service.cancelRunRound(runId),
    });
    return { runSession: beginStartedRunSession(prepared, runToken, taskTicket), runToken };
  }

  async function attachStartedRunProgress(
    prepared: ReadyRunLaunchPrepared,
    runSession: RunSession,
    runToken: string,
  ) {
    await progress.mergeActiveRunProgressSnapshot({ runSession, runToken });
    await progress.attachRoundProgressListener({
      runSession,
      runToken,
      liveCompareSeed: prepared.liveCompareSeed,
      runtimeFallback: "处理中",
    });
    deps.setRuntimeStep(prepared.launchSeed.startFeedback.runtimeStep);
    deps.setNotice(prepared.launchSeed.startFeedback.notice);
  }

  async function startAndListenRunRound(
    input: StartAndListenRunRoundInput,
  ): Promise<StartAndListenRunRoundResult> {
    await deps.releaseProgressListener();
    const { runSession, runToken } = await createStartedRunSession(
      input.prepared,
      input.taskTicket,
      input.autoNextApproval,
    );
    deps.setVisibleProgress(input.prepared.launchSeed.initialProgress);
    deps.setProgress(input.prepared.launchSeed.initialProgress);
    deps.setRerunFailures([]);
    deps.setLastExportResult(null);
    deps.setLiveCompare(input.prepared.liveCompareSeed);
    deps.setCompareData(input.prepared.liveCompareSeed);
    deps.setReviewDecisions({});
    deps.setRoundResult(null);
    deps.setPreview(null);
    await attachStartedRunProgress(input.prepared, runSession, runToken);
    return { runSession, runToken };
  }

  return {
    beginStartedRunSession,
    createStartedRunSession,
    attachStartedRunProgress,
    startAndListenRunRound,
  };
}
