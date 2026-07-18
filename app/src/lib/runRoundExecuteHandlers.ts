import {
  buildReadyRunExecutionResult,
  buildStartRoundFailureInput,
  buildWorkflowCompleteFeedback,
  type ReadyRunLaunchPrepared,
} from "@/lib/runRoundPrep";
import type {
  RunRoundFinishHandlers,
  RunRoundHandlersDeps,
  } from "@/lib/runRoundHandlerTypes";
import type { RunRoundStartHandlers } from "@/lib/runRoundStartHandlerTypes";
import type { RunRoundPrepareHandlers } from "@/lib/runRoundPrepareHandlers";
import type { RunRoundSessionHandlers } from "@/lib/runRoundSessionHandlers";
import type { DocumentStatus, ModelConfig } from "@/types/app";
import type { RunSession } from "@/hooks/useRunSession";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";

export function createRunRoundExecuteHandlers(
  deps: RunRoundHandlersDeps,
  finish: RunRoundFinishHandlers,
  prepare: RunRoundPrepareHandlers,
  session: RunRoundSessionHandlers,
): Pick<RunRoundStartHandlers, "runPreparedRound" | "executePreparedRunRound" | "handleRunRound"> {
  async function runPreparedRound(
    prepared: ReadyRunLaunchPrepared,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) {
    const started = await session.startAndListenRunRound({ prepared, taskTicket, autoNextApproval });
    return session.awaitPreparedStartedRun(prepared, started);
  }

  async function executePreparedRunRound(
    launchDocumentStatus: DocumentStatus,
    configOverride: ModelConfig | undefined,
    taskTicket: number,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) {
    const prepared = await prepare.prepareRunLaunch({ documentStatus: launchDocumentStatus, configOverride });
    if (prepared.kind === "complete") {
      deps.applyOptionalUiFeedback(buildWorkflowCompleteFeedback());
      return {
        runSession: null as RunSession | null,
        runConfig: prepared.runConfig,
        launchStatus: prepared.launchStatus,
      };
    }
    return buildReadyRunExecutionResult(
      prepared,
      await runPreparedRound(prepared, taskTicket, autoNextApproval),
    );
  }

  async function handleRunRound(
    configOverride?: ModelConfig,
    autoNextApproval?: RateAuditAutoNextApproval,
  ) {
    const launchDocumentStatus = prepare.resolveRunnableDocumentStatus(configOverride);
    if (!launchDocumentStatus) return;
    const taskTicket = deps.beginTask("running-round", { runtimeStep: "正在同步改写路线。" });
    let runSession: RunSession | null = null;
    let runConfig = deps.getModelConfig();
    let launchStatus: DocumentStatus = launchDocumentStatus;
    try {
      ({ runSession, runConfig, launchStatus } = await executePreparedRunRound(
        launchDocumentStatus,
        configOverride,
        taskTicket,
        autoNextApproval,
      ));
    } catch (appError) {
      await finish.finalizeFailedRound(buildStartRoundFailureInput({
        appError,
        runSession,
        launchStatus,
        runConfig,
      }));
    } finally {
      deps.clearRunSession(runSession);
      deps.finishTask(taskTicket);
    }
  }

  return {
    runPreparedRound,
    executePreparedRunRound,
    handleRunRound,
  };
}
