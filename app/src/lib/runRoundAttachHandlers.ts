import { buildAttachRoundFailureInput } from "@/lib/runRoundPrep";
import { createRunRoundAttachSeedHandlers } from "@/lib/runRoundAttachSeedHandlers";
import type {
  AwaitAttachedActiveRunInput,
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  RunRoundProgressHandlers,
} from "@/lib/runRoundHandlerTypes";
import type { EnvironmentDiagnostics, RoundResult } from "@/types/app";
import type { RunSession } from "@/hooks/useRunSession";

export function createRunRoundAttachHandlers(
  deps: RunRoundHandlersDeps,
  progress: RunRoundProgressHandlers,
  finish: RunRoundFinishHandlers,
) {
  const seed = createRunRoundAttachSeedHandlers(deps, progress);

  async function finalizeAttachedActiveRunResult(
    input: AwaitAttachedActiveRunInput,
    nextResult: RoundResult,
  ) {
    if (!deps.isActiveRunSession(input.runSession)) return;
    await finish.finalizeCompletedRound({
      result: nextResult,
      sourcePath: input.activeRun.sourcePath,
      config: deps.getModelConfig(),
      clearAutoSnapshot: true,
    });
  }

  async function awaitAttachedActiveRun(input: AwaitAttachedActiveRunInput) {
    const nextResult = await deps.service.awaitRunRound(
      input.activeRun.sourcePath,
      deps.getModelConfig(),
      input.activeRun.runId,
    );
    await finalizeAttachedActiveRunResult(input, nextResult);
  }

  async function runAttachedActiveSession(
    activeRun: EnvironmentDiagnostics["activeRuns"][number],
    taskTicket: number,
  ) {
    const prepared = await seed.prepareAttachActiveRun(activeRun, taskTicket);
    await awaitAttachedActiveRun({ activeRun, runSession: prepared.runSession });
    return prepared.runSession;
  }

  async function attachActiveRun(activeRun: EnvironmentDiagnostics["activeRuns"][number]) {
    if (deps.getCurrentRunToken() || deps.getAttachedRunToken() === activeRun.runId) return;
    deps.setAttachedRunToken(activeRun.runId);
    const taskTicket = deps.beginTask("running-round", {
      clearMessages: false,
      runtimeStep: "正在接管后台运行中的轮次。",
    });
    let runSession: RunSession | null = null;
    try {
      runSession = await runAttachedActiveSession(activeRun, taskTicket);
    } catch (appError) {
      await finish.finalizeFailedRound(buildAttachRoundFailureInput({
        appError,
        runSession,
        activeRun,
        config: deps.getModelConfig(),
      }));
    } finally {
      deps.setAttachedRunToken(null);
      deps.clearRunSession(runSession);
      deps.finishTask(taskTicket);
    }
  }

  return {
    ...seed,
    finalizeAttachedActiveRunResult,
    awaitAttachedActiveRun,
    runAttachedActiveSession,
    attachActiveRun,
  };
}
