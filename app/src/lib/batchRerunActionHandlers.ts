import {
  buildUnresolvedFailureChunkIds,
  selectRiskyRerunChunkIds,
} from "@/lib/batchRerunHelpers";
import { isHighRiskFailedOutputChunk, isReviewDecisionResolved } from "@/lib/diffDashboard";
import { stringifyError } from "@/lib/errorText";
import type {
  BatchRerunActionHandlers,
  BatchRerunCoreHandlers,
  BatchRerunHandlersDeps,
} from "@/lib/batchRerunHandlerTypes";
import { createBatchRerunAttachHandlers } from "@/lib/batchRerunAttachHandlers";

export function createBatchRerunActionHandlers(
  deps: BatchRerunHandlersDeps,
  core: BatchRerunCoreHandlers,
): BatchRerunActionHandlers {
  const attach = createBatchRerunAttachHandlers(deps, core);
  const {
    applyBatchRerunCancelRequestedUi,
    attachActiveBatchRerun,
    runBatchRerunTask,
  } = attach;

  async function handleRerunRiskyChunks() {
    const outputPath = deps.getRoundResult()?.outputPath ?? deps.getActiveCompareData()?.outputPath;
    const unresolvedFailureChunkIds = buildUnresolvedFailureChunkIds(
      deps.getActiveRerunFailures(),
      deps.getReviewDecisions(),
      isReviewDecisionResolved,
    );
    const riskyChunkIds = selectRiskyRerunChunkIds({
      chunks: deps.getActiveCompareData()?.chunks,
      unresolvedFailureChunkIds,
      reviewDecisions: deps.getReviewDecisions(),
      isHighRiskFailedOutputChunk,
      isReviewDecisionResolved,
    });
    if (!outputPath || riskyChunkIds.length === 0) {
      deps.setNotice("当前没有需要批量重跑的风险块。");
      return;
    }
    await runBatchRerunTask("重跑需处理块", outputPath, riskyChunkIds.map((id) => ({ chunkId: id })));
  }

  async function handleCancelBatchRerun() {
    const session = deps.getBatchRerunSession();
    if (!session || !deps.getCurrentBatchRerunToken() || session.runId !== deps.getCurrentBatchRerunToken()) {
      deps.setNotice("当前没有可停止的后台重跑任务。");
      return;
    }
    try {
      applyBatchRerunCancelRequestedUi(session);
      await deps.service.cancelBatchRerun(session.runId);
    } catch (appError) {
      deps.setError(stringifyError(appError));
      deps.transitionTask(session.taskTicket, "batch-rerunning");
    }
  }

  return {
    ...attach,
    handleRerunRiskyChunks,
    handleCancelBatchRerun,
  };
}
