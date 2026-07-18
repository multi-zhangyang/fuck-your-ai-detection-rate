import { getPendingAutoActionPercent, getPendingAutoActionTitle } from "@/lib/autoRun";
import {
  getBatchTaskPercent,
  getRoundTaskPercent,
} from "@/lib/progressHelpers";
import type { RuntimeTaskCenterActions, RuntimeTaskCenterItem } from "@/lib/runtimeTaskCenterTypes";
import type { PendingAutoAction } from "@/lib/autoRunTypes";
import type {
  EnvironmentDiagnostics,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export function appendPendingAutoActionTask(
  items: RuntimeTaskCenterItem[],
  pendingAutoAction: PendingAutoAction | null,
  actions: RuntimeTaskCenterActions,
): void {
  if (!pendingAutoAction) return;
  items.push({
    id: `auto:${pendingAutoAction.id}`,
    title: getPendingAutoActionTitle(pendingAutoAction),
    status: pendingAutoAction.kind === "manual-intervention" ? "等待人工" : "倒计时",
    tone: pendingAutoAction.kind === "manual-intervention" ? "red" : pendingAutoAction.kind === "retry" ? "amber" : "blue",
    running: false,
    percent: getPendingAutoActionPercent(pendingAutoAction),
    actionLabel: "查看主页",
    onAction: () => actions.openTaskTargetView("home"),
    cancelLabel: pendingAutoAction.kind === "manual-intervention" ? "我来处理" : "拒绝自动执行",
    onCancel: () => actions.rejectPendingAutoAction(pendingAutoAction.id),
  });
}

export function appendCurrentRunTask(
  items: RuntimeTaskCenterItem[],
  input: {
    currentRunToken: string | null;
    runSession: { round?: number | null; cancelRequested?: boolean } | null | undefined;
    activeProgress: RoundProgress | null;
    activeRunStatus: NonNullable<RoundProgressStatus["activeRun"]> | null;
    progressPercent: number;
    actions: RuntimeTaskCenterActions;
  },
): void {
  if (!input.currentRunToken) return;
  const cancelRequested = Boolean(
    input.runSession?.cancelRequested
    || input.activeProgress?.phase === "cancel-requested"
    || input.activeRunStatus?.cancelRequested,
  );
  items.push({
    id: `run:${input.currentRunToken}`,
    title: input.runSession?.round ? `第 ${input.runSession.round} 轮改写` : "轮次改写",
    status: cancelRequested ? "中断中" : "运行中",
    tone: cancelRequested ? "red" : "blue",
    running: true,
    percent: getRoundTaskPercent(input.activeProgress, input.progressPercent),
    actionLabel: "查看主页",
    onAction: () => input.actions.openTaskTargetView("home"),
    cancelLabel: cancelRequested ? undefined : "中断当前轮",
    onCancel: cancelRequested ? undefined : () => void input.actions.handleCancelRunRound(),
  });
}

export function appendCurrentBatchRerunTask(
  items: RuntimeTaskCenterItem[],
  input: {
    currentBatchRerunToken: string | null;
    batchRerunSession: { label?: string; cancelRequested?: boolean } | null | undefined;
    diagnostics: EnvironmentDiagnostics | null;
    actions: RuntimeTaskCenterActions;
  },
): void {
  if (!input.currentBatchRerunToken) return;
  const activeBatchStatus = (input.diagnostics?.activeBatchReruns ?? []).find((item) => item.runId === input.currentBatchRerunToken);
  const cancelRequested = Boolean(input.batchRerunSession?.cancelRequested || activeBatchStatus?.cancelRequested);
  items.push({
    id: `batch:${input.currentBatchRerunToken}`,
    title: input.batchRerunSession?.label || "局部优化",
    status: cancelRequested ? "停止中" : "运行中",
    tone: cancelRequested ? "red" : "amber",
    running: true,
    percent: getBatchTaskPercent(activeBatchStatus),
    actionLabel: "查看主页",
    onAction: () => input.actions.openTaskTargetView("home"),
    cancelLabel: cancelRequested ? undefined : "停止重跑",
    onCancel: cancelRequested ? undefined : () => void input.actions.handleCancelBatchRerun(),
  });
}
