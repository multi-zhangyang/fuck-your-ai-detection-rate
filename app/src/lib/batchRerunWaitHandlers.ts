import { waitForMs } from "@/lib/async";
import { formatBatchRerunProgress } from "@/lib/batchRerunHelpers";
import {
  buildAttachedBatchRerunMissingResultError,
  buildBatchAttachSuccessTargets,
} from "@/lib/bootstrapHelpers";
import { BATCH_RERUN_POLL_INTERVAL_MS } from "@/lib/storageKeys";
import type { BatchRerunHandlersDeps } from "@/lib/batchRerunHandlerTypes";
import type {
  BatchRerunStatus,
  BatchRerunTarget,
} from "@/types/app";

export function createBatchRerunWaitHandlers(
  deps: BatchRerunHandlersDeps,
  applyBatchRerunResult: (
    actionLabel: string,
    result: NonNullable<BatchRerunStatus["result"]>,
    targets: BatchRerunTarget[],
    suffix?: string,
  ) => Promise<void>,
) {
  async function waitForBatchRerunResult(runId: string, label: string): Promise<BatchRerunStatus> {
    for (;;) {
      const status = await deps.service.getBatchRerunStatus(runId);
      deps.setRuntimeStep(formatBatchRerunProgress(label, status));
      if (status.completed) return status;
      await waitForMs(BATCH_RERUN_POLL_INTERVAL_MS);
    }
  }

  async function awaitAndApplyBatchRerunResult(
    actionLabel: string,
    runId: string,
    targets: BatchRerunTarget[],
    suffix: string,
  ) {
    const status = await waitForBatchRerunResult(runId, actionLabel);
    if (!status.result) throw new Error(status.error || `${actionLabel}没有返回结果`);
    await applyBatchRerunResult(actionLabel, status.result, targets, suffix);
  }

  async function finalizeAttachedBatchRerun(runId: string, activeBatch: BatchRerunStatus) {
    const status = activeBatch.completed ? activeBatch : await waitForBatchRerunResult(runId, "后台重跑");
    if (!status.result) throw buildAttachedBatchRerunMissingResultError(status.error);
    await applyBatchRerunResult(
      "后台重跑",
      status.result,
      buildBatchAttachSuccessTargets(status.result.successChunkIds),
    );
  }

  return {
    waitForBatchRerunResult,
    awaitAndApplyBatchRerunResult,
    finalizeAttachedBatchRerun,
  };
}
