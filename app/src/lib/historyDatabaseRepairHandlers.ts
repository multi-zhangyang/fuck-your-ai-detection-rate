import {
  planHistoryDatabaseRepairFailureRuntimeStep,
  planHistoryDatabaseRepairFeedback,
  planHistoryDatabaseRepairLoadingRuntimeStep,
} from "@/lib/historyArtifactHelpers";
import type {
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";
import type { HistoryDatabaseRepairResult } from "@/types/app";

export function createHistoryDatabaseRepairHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  async function applyHistoryDatabaseRepairResult(result: HistoryDatabaseRepairResult) {
    await core.refreshHistoryList();
    deps.setHistoryOrphanScan(null);
    await core.refreshHistoryArtifactGovernance(deps.getHistoryArtifactMode());
    const feedback = planHistoryDatabaseRepairFeedback({
      ok: result.ok,
      beforeIssueCount: result.before?.issueCount,
      afterIssueCount: result.after?.issueCount,
      error: result.error,
    });
    deps.applyOptionalUiFeedback({
      setError: feedback.error,
      notice: feedback.notice,
      runtimeStep: feedback.runtimeStep,
    });
  }

  async function handleRepairHistoryDatabase() {
    const taskTicket = deps.beginTask("loading-history", {
      runtimeStep: planHistoryDatabaseRepairLoadingRuntimeStep(),
    });
    try {
      await applyHistoryDatabaseRepairResult(await deps.service.repairHistoryDatabase());
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, planHistoryDatabaseRepairFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    applyHistoryDatabaseRepairResult,
    handleRepairHistoryDatabase,
  };
}
