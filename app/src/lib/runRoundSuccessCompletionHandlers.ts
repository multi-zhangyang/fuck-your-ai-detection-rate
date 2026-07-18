import { getAutoRunScopeKey } from "@/lib/autoRunScope";
import { shouldScheduleAutoNextRound } from "@/lib/autoRun";
import { getPromptIdForRound } from "@/lib/promptRegistry";
import { runRateAuditGatedAutoNext } from "@/lib/rateAuditAutoNextGate";
import {
  buildRoundCompletionFeedback,
  buildRunResultLoadingState,
} from "@/lib/runRoundPrep";
import type {
  CompleteSuccessfulRoundUiInput,
  FinalizeCompletedRoundInput,
  RunRoundHandlersDeps,
} from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export type RunRoundSuccessCompletionHandlers = {
  scheduleAfterSuccessfulRound: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  applySuccessfulRoundCompletionFeedback: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  completeSuccessfulRoundUi: (input: CompleteSuccessfulRoundUiInput) => Promise<DocumentStatus>;
  finalizeCompletedRound: (input: FinalizeCompletedRoundInput) => Promise<DocumentStatus>;
};

export function createRunRoundSuccessCompletionHandlers(
  deps: RunRoundHandlersDeps,
): RunRoundSuccessCompletionHandlers {
  async function scheduleAfterSuccessfulRound(
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) {
    deps.clearAutoRetryScope(getAutoRunScopeKey(sourcePath, config, resultRound));
    if (!shouldScheduleAutoNextRound(
      status,
      config,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    )) {
      return;
    }

    const nextRound = status.nextRound;
    if (!nextRound) {
      return;
    }
    let expectedPromptId = "";
    try {
      expectedPromptId = getPromptIdForRound(
        config.promptProfile,
        nextRound,
        config.promptSequence,
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
    } catch {
      deps.applyOptionalUiFeedback({
        notice: "无法确认流程下一提示词，已为安全起见暂停自动下一轮。",
        runtimeStep: `第 ${resultRound} 轮已完成；下一提示词无法确认。`,
      });
      return;
    }

    deps.applyOptionalUiFeedback({
      notice: `第 ${resultRound} 轮已完成，正在用 RateAudit 确认是否进入第 ${nextRound} 轮。`,
      runtimeStep: `正在诊断第 ${resultRound} 轮结果并核对下一提示词。`,
    });
    const gate = await runRateAuditGatedAutoNext({
      getRateAudit: (requestSourcePath, requestOutputPath) => (
        deps.service.getRateAudit(requestSourcePath, requestOutputPath)
      ),
      schedule: (approval) => deps.scheduleAutoNextRound(status, resultRound, config, approval),
      sourcePath,
      outputPath,
      expectedDocId: status.docId,
      expectedPromptId,
      completedRound: resultRound,
      nextRound,
    });
    deps.applyOptionalUiFeedback(gate.allowed
      ? { runtimeStep: gate.runtimeStep }
      : { notice: gate.notice, runtimeStep: gate.runtimeStep });
  }

  async function applySuccessfulRoundCompletionFeedback(
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) {
    const completionFeedback = buildRoundCompletionFeedback(
      resultRound,
      status,
      config,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    deps.applyOptionalUiFeedback({
      notice: completionFeedback.notice,
      runtimeStep: completionFeedback.runtimeStep,
    });
    await scheduleAfterSuccessfulRound(resultRound, status, config, sourcePath, outputPath);
  }

  async function completeSuccessfulRoundUi(input: CompleteSuccessfulRoundUiInput) {
    const status = await deps.refreshDocumentState(input.sourcePath, input.config);
    await deps.refreshHistoryList();
    deps.setHistoryPanelOpen(true);
    await applySuccessfulRoundCompletionFeedback(
      input.result.round,
      status,
      input.config,
      input.sourcePath,
      input.result.outputPath,
    );
    return status;
  }

  async function finalizeCompletedRound(input: FinalizeCompletedRoundInput) {
    if (input.clearAutoSnapshot) deps.clearAutoSnapshotSuppression();
    await deps.releaseProgressListener();
    deps.setVisibleProgress(null);
    const loadingState = buildRunResultLoadingState(input.result.round);
    deps.setProgress(loadingState.progress);
    deps.setRoundResult(input.result);
    deps.setRuntimeStep(loadingState.runtimeStep);
    await deps.loadCompletedRoundArtifacts(input.result);
    return completeSuccessfulRoundUi({
      result: input.result,
      sourcePath: input.sourcePath,
      config: input.config,
    });
  }

  return {
    scheduleAfterSuccessfulRound,
    applySuccessfulRoundCompletionFeedback,
    completeSuccessfulRoundUi,
    finalizeCompletedRound,
  };
}
