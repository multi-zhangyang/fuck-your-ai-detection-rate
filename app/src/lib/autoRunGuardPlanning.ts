import { getAutoRunScopeKeyForStatus } from "@/lib/autoRunScope";
import { sameWorkspacePath } from "@/lib/documentPaths";
import { buildAutoRunLaunchNotice } from "@/lib/autoRunActionBuilders";
import { getPromptIdForRound } from "@/lib/promptRegistry";
import { validateStoredRateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type {
  PendingAutoActionGuardResult,
  PendingAutoNextRoundAction,
  PendingAutoRetryAction,
} from "@/lib/autoRunTypes";
import type { DocumentStatus, ModelConfig, PromptOption, PromptWorkflow } from "@/types/app";

export function evaluatePendingAutoActionGuard(input: {
  pendingActionId: string | null | undefined;
  action: PendingAutoRetryAction | PendingAutoNextRoundAction;
  running: boolean;
  latestStatus: DocumentStatus | null | undefined;
  refreshedStatus: DocumentStatus | null | undefined;
  activeConfig: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): PendingAutoActionGuardResult {
  if (input.pendingActionId !== input.action.id) {
    return { type: "noop" };
  }
  if (input.running) {
    return { type: "defer-running" };
  }

  const initialStatus = input.latestStatus;
  if (!initialStatus || !sameWorkspacePath(initialStatus.sourcePath, input.action.sourcePath)) {
    if (input.action.kind === "retry") {
      return { type: "manual-document-switched" };
    }
    return { type: "cancel", notice: "当前页面已切换文档，已取消自动进入下一轮。" };
  }

  const status = input.refreshedStatus ?? initialStatus;
  if (status) {
    const activeScopeKey = getAutoRunScopeKeyForStatus(
      status,
      input.activeConfig,
      input.action.round,
      input.promptOptions,
      input.promptWorkflows,
    );
    if (activeScopeKey !== input.action.scopeKey) {
      return { type: "cancel", notice: "文档或改写流程已变化，已取消本次自动执行。" };
    }
  }

  if (!status?.hasNextRound || status.nextRound !== input.action.round) {
    return { type: "cancel", notice: "文档轮次状态已经变化，已取消本次自动执行。" };
  }

  if (input.action.kind === "next-round") {
    let expectedPromptId = "";
    try {
      expectedPromptId = getPromptIdForRound(
        input.activeConfig.promptProfile,
        input.action.round,
        input.activeConfig.promptSequence,
        input.promptOptions,
        input.promptWorkflows,
      );
    } catch {
      return { type: "cancel", notice: "无法确认流程下一提示词，已取消本次自动执行。" };
    }
    if (!validateStoredRateAuditAutoNextApproval({
      approval: input.action.rateAuditApproval,
      expectedSourcePath: status.sourcePath,
      expectedOutputPath: status.latestOutputPath,
      expectedDocId: status.docId,
      expectedCompletedRound: input.action.completedRound,
      expectedPromptId,
    })) {
      return {
        type: "cancel",
        notice: "RateAudit 批准信息与当前文档、结果或下一提示词不一致，已取消自动进入下一轮。",
      };
    }
  }

  return {
    type: "launch",
    notice: buildAutoRunLaunchNotice(input.action),
  };
}
