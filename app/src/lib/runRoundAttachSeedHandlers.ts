import {
  resolveAttachRunRound,
  shouldReuseDocumentStatusForAttach,
} from "@/lib/autoRun";
import {
  buildPrepareAttachActiveRunResult,
  planAttachRunSeed,
} from "@/lib/runRoundPrep";
import type {
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
  SeedAndListenAttachedRunInput,
} from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus, EnvironmentDiagnostics } from "@/types/app";

export function createRunRoundAttachSeedHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
) {
  function beginAttachedRunSession(input: SeedAndListenAttachedRunInput) {
    return deps.beginRunSession({
      runId: input.activeRun.runId,
      sourcePath: input.activeRun.sourcePath,
      round: input.runRound,
      taskTicket: input.taskTicket,
      mode: "attach",
    });
  }

  async function seedAndListenAttachedRun(input: SeedAndListenAttachedRunInput) {
    const runSession = beginAttachedRunSession(input);
    const attachSeed = planAttachRunSeed({
      status: input.status,
      runRound: input.runRound,
      lastEvent: input.activeRun.lastEvent ?? null,
    });
    deps.setVisibleProgress(attachSeed.initialProgress);
    deps.setProgress(attachSeed.initialProgress);
    deps.setLiveCompare(attachSeed.liveCompareSeed);
    deps.setCompareData(attachSeed.liveCompareSeed);
    deps.setReviewDecisions({});
    deps.setRoundResult(null);
    deps.setPreview(null);
    deps.setNotice(attachSeed.notice);
    await progress.attachRoundProgressListener({
      runSession,
      runToken: input.activeRun.runId,
      liveCompareSeed: attachSeed.liveCompareSeed,
      runtimeFallback: "后台轮次运行中",
    });
    return { runSession, liveCompareSeed: attachSeed.liveCompareSeed };
  }

  async function resolveDocumentStatusForAttach(sourcePath: string): Promise<DocumentStatus> {
    if (shouldReuseDocumentStatusForAttach({
      documentStatus: deps.getDocumentStatus(),
      sourcePath,
    })) {
      return deps.getDocumentStatus()!;
    }
    return deps.refreshDocumentState(sourcePath);
  }

  async function prepareAttachActiveRun(
    activeRun: EnvironmentDiagnostics["activeRuns"][number],
    taskTicket: number,
  ) {
    await deps.releaseProgressListener();
    const status = await resolveDocumentStatusForAttach(activeRun.sourcePath);
    const runRound = resolveAttachRunRound(activeRun, status);
    const seeded = await seedAndListenAttachedRun({ activeRun, status, runRound, taskTicket });
    return buildPrepareAttachActiveRunResult(status, runRound, seeded);
  }

  return {
    beginAttachedRunSession,
    seedAndListenAttachedRun,
    resolveDocumentStatusForAttach,
    prepareAttachActiveRun,
  };
}
