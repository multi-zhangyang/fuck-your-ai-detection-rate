import { suppressAutoSnapshotRestore } from "@/lib/autoSnapshot";
import {
  buildExecuteRoundResetInput,
  buildRoundResetBusyNotice,
  buildRoundResetConfirmOptions,
  buildRoundResetFailureRuntimeStep,
  buildRoundResetMissingNotice,
  buildRoundResetRuntimeStep,
  buildRoundResetSuccessNotice,
  getRoundResetTarget,
  type ExecuteRoundResetInput,
  type RoundResetTarget,
} from "@/lib/documentStatusCopy";
import { stringifyError } from "@/lib/errorText";
import type { RunRoundHandlersDeps } from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus } from "@/types/app";

export type RunRoundResetHandlers = {
  performRoundReset: (input: ExecuteRoundResetInput) => Promise<void>;
  resolveConfirmedRoundResetInput: () => { documentStatus: DocumentStatus; resetTarget: RoundResetTarget } | null;
  executeRoundReset: (input: ExecuteRoundResetInput) => Promise<void>;
  handleResetCurrentRound: () => Promise<void>;
};

export function createRunRoundResetHandlers(deps: RunRoundHandlersDeps): RunRoundResetHandlers {
  async function performRoundReset(input: ExecuteRoundResetInput) {
    deps.clearPendingAutoActionForSource(input.sourcePath);
    await deps.releaseProgressListener();
    await deps.service.resetRoundProgress(
      input.sourcePath,
      input.resetPromptProfile,
      input.resetRoundNumber,
      input.resetPromptSequence,
    );
    suppressAutoSnapshotRestore(
      input.status,
      input.resetConfig,
      input.resetRoundNumber,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    deps.setProgress(null);
    deps.clearDocumentDerivedState();
    await deps.refreshDocumentState(input.sourcePath, input.resetConfig);
    await deps.refreshHistoryList();
    deps.setNotice(buildRoundResetSuccessNotice(input.resetMode, input.resetRoundNumber));
    deps.setRuntimeStep(buildRoundResetRuntimeStep());
  }

  function resolveConfirmedRoundResetInput() {
    if (deps.getRunning()) {
      deps.setNotice(buildRoundResetBusyNotice());
      return null;
    }
    const documentStatus = deps.getDocumentStatus();
    const resetTarget = getRoundResetTarget(
      documentStatus,
      deps.getRoundProgressStatus(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    if (!documentStatus || !resetTarget) {
      deps.setNotice(buildRoundResetMissingNotice());
      return null;
    }
    return { documentStatus, resetTarget };
  }

  async function executeRoundReset(input: ExecuteRoundResetInput) {
    const taskTicket = deps.beginTask("resetting-round");
    try {
      await performRoundReset(input);
    } catch (appError) {
      deps.setError(stringifyError(appError));
      deps.setRuntimeStep(buildRoundResetFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleResetCurrentRound() {
    const resolved = resolveConfirmedRoundResetInput();
    if (!resolved) return;
    const { documentStatus: status, resetTarget } = resolved;
    if (!await deps.requestConfirm(buildRoundResetConfirmOptions(resetTarget))) return;
    await executeRoundReset(buildExecuteRoundResetInput(
      status,
      deps.getModelConfig(),
      resetTarget,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    ));
  }

  return {
    performRoundReset,
    resolveConfirmedRoundResetInput,
    executeRoundReset,
    handleResetCurrentRound,
  };
}
