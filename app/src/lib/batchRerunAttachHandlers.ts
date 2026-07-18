import {
  buildAttachedBatchRerunFailureRuntimeStep,
  buildAttachedBatchRerunLoadingRuntimeStep,
  buildAttachedBatchRerunNotice,
} from "@/lib/bootstrapHelpers";
import type {
  BatchRerunCoreHandlers,
  BatchRerunHandlersDeps,
} from "@/lib/batchRerunHandlerTypes";
import type { BatchRerunSession } from "@/hooks/useRunSession";
import type { BatchRerunStatus, BatchRerunTarget, ModelConfig } from "@/types/app";

export function createBatchRerunAttachHandlers(
  deps: BatchRerunHandlersDeps,
  core: BatchRerunCoreHandlers,
) {
  function applyBatchRerunCancelRequestedUi(session: BatchRerunSession) {
    deps.markBatchRerunCancelRequested(session.runId);
    deps.transitionTask(session.taskTicket, "canceling-batch-rerun", {
      runtimeStep: `${session.label}正在停止；当前块完成后会停下`,
    });
    deps.setNotice("已请求停止后台重跑；已完成的块会保留。");
  }

  function beginAttachActiveBatchRerunTask(activeBatch: BatchRerunStatus) {
    const taskTicket = deps.beginTask("batch-rerunning", {
      clearMessages: false,
      runtimeStep: buildAttachedBatchRerunLoadingRuntimeStep(),
    });
    deps.beginBatchRerunSession({
      runId: activeBatch.runId,
      taskTicket,
      label: "后台重跑",
      cancelRequested: activeBatch.cancelRequested,
    });
    deps.setNotice(buildAttachedBatchRerunNotice());
    return taskTicket;
  }

  async function attachActiveBatchRerun(activeBatch: BatchRerunStatus) {
    if (deps.getCurrentBatchRerunToken() || deps.getBatchRerunSession()?.runId === activeBatch.runId) return;
    const runId = activeBatch.runId;
    const taskTicket = beginAttachActiveBatchRerunTask(activeBatch);
    try {
      await core.finalizeAttachedBatchRerun(runId, activeBatch);
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, buildAttachedBatchRerunFailureRuntimeStep());
    } finally {
      deps.clearBatchRerunSession(runId);
      deps.finishTask(taskTicket);
    }
  }

  async function runPreparedBatchRerunTask(
    actionLabel: string,
    targets: BatchRerunTarget[],
    startTask: () => Promise<string>,
    suffix = "",
    options?: { rethrow?: boolean },
  ) {
    const taskTicket = deps.beginTask("batch-rerunning", { runtimeStep: `${actionLabel}准备中` });
    let runId: string | null = null;
    try {
      deps.setRerunFailures([]);
      runId = await startTask();
      deps.beginBatchRerunSession({
        runId,
        taskTicket,
        label: actionLabel,
        cancelRequested: false,
      });
      await core.awaitAndApplyBatchRerunResult(actionLabel, runId, targets, suffix);
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, `${actionLabel}失败`);
      if (options?.rethrow) throw appError;
    } finally {
      deps.clearBatchRerunSession(runId);
      deps.finishTask(taskTicket);
    }
  }

  async function runBatchRerunTask(
    actionLabel: string,
    outputPath: string,
    targets: BatchRerunTarget[],
    suffix = "",
    modelConfigOverride?: ModelConfig,
  ) {
    await runPreparedBatchRerunTask(
      actionLabel,
      targets,
      () => deps.service.startBatchRerun(outputPath, targets, modelConfigOverride ?? deps.getModelConfig()),
      suffix,
    );
  }

  return {
    applyBatchRerunCancelRequestedUi,
    beginAttachActiveBatchRerunTask,
    attachActiveBatchRerun,
    runBatchRerunTask,
    runPreparedBatchRerunTask,
  };
}
