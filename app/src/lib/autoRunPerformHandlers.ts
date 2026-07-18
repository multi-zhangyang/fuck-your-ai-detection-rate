import {
  buildDeferRunningAutoActionUpdate,
  buildManualInterventionAction,
  buildManualInterventionNotice,
  evaluatePendingAutoActionGuard,
  resolvePendingAutoActionPlan,
  shouldRefreshPendingAutoActionStatus,
  type PendingAutoNextRoundAction,
  type PendingAutoRetryAction,
} from "@/lib/autoRun";
import {
  runRevalidatedRateAuditAutoNext,
  type RateAuditAutoNextGateResult,
} from "@/lib/rateAuditAutoNextGate";
import { AUTO_RUN_RETRY_MAX_ATTEMPTS } from "@/lib/storageKeys";
import type {
  AutoRunClearHandlers,
  AutoRunHandlersDeps,
  AutoRunPerformHandlers,
} from "@/lib/autoRunHandlerTypes";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export function createAutoRunPerformHandlers(
  deps: AutoRunHandlersDeps,
  clear: AutoRunClearHandlers,
): AutoRunPerformHandlers {
  function buildPendingAutoActionGuard(
    action: PendingAutoRetryAction | PendingAutoNextRoundAction,
    activeConfig: ModelConfig,
    refreshedStatus: DocumentStatus | null,
  ) {
    return evaluatePendingAutoActionGuard({
      pendingActionId: deps.getPendingAutoActionId(),
      action,
      running: deps.getRunning(),
      latestStatus: deps.getLatestDocumentStatus(),
      refreshedStatus,
      activeConfig,
      promptOptions: deps.getPromptOptions(),
      promptWorkflows: deps.getPromptWorkflows(),
    });
  }

  async function resolveCurrentPendingAutoActionPlan(
    action: PendingAutoRetryAction | PendingAutoNextRoundAction,
  ) {
    const activeConfig = deps.getLatestModelConfig() ?? deps.getModelConfig();
    let refreshedStatus: DocumentStatus | null = null;
    if (shouldRefreshPendingAutoActionStatus({
      latestStatus: deps.getLatestDocumentStatus(),
      actionSourcePath: action.sourcePath,
    })) {
      try {
        refreshedStatus = await deps.refreshDocumentState(action.sourcePath, activeConfig);
      } catch {
        refreshedStatus = deps.getLatestDocumentStatus() ?? null;
      }
    }
    return resolvePendingAutoActionPlan({
      guard: buildPendingAutoActionGuard(action, activeConfig, refreshedStatus),
      action,
    });
  }

  async function performPendingAutoAction(action: PendingAutoRetryAction | PendingAutoNextRoundAction) {
    if (deps.getPendingAutoActionId() !== action.id) return;
    if (deps.getRunning()) {
      deps.setPendingAutoAction(buildDeferRunningAutoActionUpdate(action.id));
      return;
    }
    const plan = await resolveCurrentPendingAutoActionPlan(action);
    if (plan.type === "noop" || plan.type === "defer-running") return;
    if (plan.type === "manual-intervention") {
      deps.setPendingAutoAction(buildManualInterventionAction({
        ...plan,
        maxAttempts: AUTO_RUN_RETRY_MAX_ATTEMPTS,
      }));
      deps.setNotice(buildManualInterventionNotice(plan.round, plan.attempts, AUTO_RUN_RETRY_MAX_ATTEMPTS));
      return;
    }
    if (plan.type === "cancel") {
      clear.clearPendingAutoActionWithNotice(action.id, plan.notice);
      return;
    }
    if (action.kind === "next-round") {
      const revalidation = await performRevalidatedAutoNextRound(action);
      if (!revalidation.allowed) {
        if (deps.getPendingAutoActionId() === action.id) {
          clear.clearPendingAutoActionWithNotice(action.id, revalidation.notice);
        }
      }
      return;
    }
    clear.clearPendingAutoActionWithNotice(action.id, plan.notice);
    await deps.handleRunRound();
  }

  async function performRevalidatedAutoNextRound(
    action: PendingAutoNextRoundAction,
  ): Promise<RateAuditAutoNextGateResult> {
    return runRevalidatedRateAuditAutoNext({
      getRateAudit: deps.getRateAudit,
      launch: async (approval) => {
        if (deps.getPendingAutoActionId() !== action.id) return;
        if (deps.getRunning()) {
          deps.setPendingAutoAction(buildDeferRunningAutoActionUpdate(action.id));
          return;
        }
        clear.clearPendingAutoActionWithNotice(
          action.id,
          "RateAudit 统一快照复核通过，正在进入下一轮。",
        );
        await deps.handleRunRound(approval);
      },
      approval: action.rateAuditApproval,
      sourcePath: action.sourcePath,
      outputPath: action.rateAuditApproval.outputPath,
      expectedDocId: action.rateAuditApproval.docId,
      expectedPromptId: action.rateAuditApproval.recommendedPromptId,
      completedRound: action.completedRound,
      nextRound: action.round,
    });
  }

  return {
    buildPendingAutoActionGuard,
    resolveCurrentPendingAutoActionPlan,
    performRevalidatedAutoNextRound,
    performPendingAutoAction,
  };
}
