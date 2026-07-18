import { sameWorkspacePath } from "@/lib/documentPaths";
import {
  buildAutoRunLaunchNotice,
  isCountdownAutoAction,
} from "@/lib/autoRunActionBuilders";
import type {
  PendingAutoAction,
  PendingAutoActionGuardResult,
  PendingAutoActionPlan,
  PendingAutoNextRoundAction,
  PendingAutoRetryAction,
} from "@/lib/autoRunTypes";
import type { DocumentStatus } from "@/types/app";

export function buildDeferRunningAutoActionUpdate(actionId: string) {
  return (current: PendingAutoAction | null): PendingAutoAction | null => {
    if (!isCountdownAutoAction(current) || current.id !== actionId) {
      return current;
    }
    return { ...current, secondsRemaining: 1 };
  };
}

export function buildClearPendingAutoActionIfId(actionId: string) {
  return (current: PendingAutoAction | null): PendingAutoAction | null => (
    current?.id === actionId ? null : current
  );
}

export function resolvePendingAutoActionPlan(input: {
  guard: PendingAutoActionGuardResult;
  action: PendingAutoRetryAction | PendingAutoNextRoundAction;
  documentSwitchedReason?: string;
}): PendingAutoActionPlan {
  if (input.guard.type === "noop" || input.guard.type === "defer-running") {
    return { type: input.guard.type };
  }
  if (input.guard.type === "manual-document-switched") {
    if (input.action.kind !== "retry") {
      return { type: "noop" };
    }
    return {
      type: "manual-intervention",
      sourcePath: input.action.sourcePath,
      round: input.action.round,
      scopeKey: input.action.scopeKey,
      attempts: input.action.attempt,
      reason: input.documentSwitchedReason ?? "当前页面已切换文档，自动执行已暂停。",
    };
  }
  if (input.guard.type === "cancel") {
    return { type: "cancel", notice: input.guard.notice };
  }
  return {
    type: "launch",
    notice: input.guard.notice || buildAutoRunLaunchNotice(input.action),
  };
}

export function resolveAttachRunRound(
  activeRun: { lastEvent?: { round?: number } | null },
  status: { nextRound?: number | null },
): number {
  return activeRun.lastEvent?.round || status.nextRound || 1;
}

export function shouldRefreshPendingAutoActionStatus(input: {
  latestStatus: DocumentStatus | null | undefined;
  actionSourcePath: string;
}): boolean {
  return Boolean(
    input.latestStatus
    && sameWorkspacePath(input.latestStatus.sourcePath, input.actionSourcePath),
  );
}

export function shouldReuseDocumentStatusForAttach(input: {
  documentStatus: DocumentStatus | null | undefined;
  sourcePath: string;
}): boolean {
  return Boolean(
    input.documentStatus
    && sameWorkspacePath(input.documentStatus.sourcePath, input.sourcePath),
  );
}
