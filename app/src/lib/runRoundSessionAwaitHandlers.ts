import type { ReadyRunLaunchPrepared } from "@/lib/runRoundPrep";
import type {
  AwaitStartedRunRoundInput,
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  StartedRunRoundHandle,
} from "@/lib/runRoundHandlerTypes";
import type { RunSession } from "@/hooks/useRunSession";

export function createRunRoundSessionAwaitHandlers(
  deps: RunRoundHandlersDeps,
  finish: RunRoundFinishHandlers,
) {
  async function awaitStartedRunRound(input: AwaitStartedRunRoundInput) {
    deps.clearAutoSnapshotSuppression();
    const nextResult = await deps.service.awaitRunRound(input.sourcePath, input.config, input.runToken);
    if (!deps.isActiveRunSession(input.runSession)) return;
    await finish.finalizeCompletedRound({
      result: nextResult,
      sourcePath: input.sourcePath,
      config: input.config,
    });
  }

  async function awaitPreparedStartedRun(
    prepared: ReadyRunLaunchPrepared,
    started: StartedRunRoundHandle,
  ) {
    await awaitStartedRunRound({
      runSession: started.runSession,
      sourcePath: prepared.launchStatus.sourcePath,
      config: prepared.runConfig,
      runToken: started.runToken,
    });
    return started.runSession;
  }

  return {
    awaitStartedRunRound,
    awaitPreparedStartedRun,
  };
}
