import { clampPercent } from "@/lib/qualityStats";
import type {
  PendingAutoAction,
  PendingAutoNextRoundAction,
  PendingAutoRetryAction,
} from "@/lib/autoRunTypes";

export function isCountdownAutoAction(
  action: PendingAutoAction | null,
): action is PendingAutoRetryAction | PendingAutoNextRoundAction {
  return Boolean(action && (action.kind === "retry" || action.kind === "next-round"));
}

export function getPendingAutoActionPercent(action: PendingAutoAction): number | undefined {
  if (!isCountdownAutoAction(action) || action.delaySeconds <= 0) {
    return undefined;
  }
  return clampPercent(Math.round(((action.delaySeconds - action.secondsRemaining) / action.delaySeconds) * 100));
}

export function getPendingAutoActionTitle(action: PendingAutoAction): string {
  if (action.kind === "retry") {
    return `第 ${action.round} 轮中断恢复`;
  }
  if (action.kind === "next-round") {
    return `第 ${action.completedRound} 轮已完成`;
  }
  return `第 ${action.round} 轮等待人工介入`;
}

export function formatPendingAutoActionStatus(action: PendingAutoAction): string {
  if (action.kind === "retry") {
    return `将在 ${action.secondsRemaining} 秒后自动重跑，第 ${action.attempt}/${action.maxAttempts} 次`;
  }
  if (action.kind === "next-round") {
    return `将在 ${action.secondsRemaining} 秒后自动进入第 ${action.round} 轮`;
  }
  return `自动重跑 ${action.attempts}/${action.maxAttempts} 次仍中断，等待人工处理`;
}

export function buildManualInterventionNotice(round: number, attempts: number, maxAttempts: number): string {
  return attempts >= maxAttempts
    ? `第 ${round} 轮连续 ${maxAttempts} 次自动重跑仍中断，已停止自动重跑，等待人工处理。`
    : `第 ${round} 轮自动执行已暂停，等待人工处理。`;
}

export function buildAutoRetryNotice(round: number, delaySeconds: number, attempt: number, maxAttempts: number): string {
  return `第 ${round} 轮被迫中断，将在 ${delaySeconds} 秒后自动重跑（第 ${attempt}/${maxAttempts} 次）。`;
}

export function buildAutoNextRoundNotice(completedRound: number, delaySeconds: number, nextRound: number): string {
  return `第 ${completedRound} 轮已完成，将在 ${delaySeconds} 秒后自动进入第 ${nextRound} 轮。`;
}

export function buildAutoRunLaunchNotice(action: PendingAutoRetryAction | PendingAutoNextRoundAction): string {
  return action.kind === "retry"
    ? `正在自动重跑第 ${action.round} 轮（第 ${action.attempt}/${action.maxAttempts} 次）。`
    : `第 ${action.completedRound} 轮已完成，正在自动进入第 ${action.round} 轮。`;
}
