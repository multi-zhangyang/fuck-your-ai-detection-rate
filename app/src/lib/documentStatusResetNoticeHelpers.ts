import type { RoundResetTarget } from "@/lib/documentStatusProgressCopy";

export function buildRoundResetSuccessNotice(mode: RoundResetTarget["mode"], round: number): string {
  return mode === "completed"
    ? `第 ${round} 轮结果已放弃；可从第 ${round} 轮重新开始。`
    : `第 ${round} 轮进度已放弃；刷新后不会自动恢复旧 Diff，历史记录仍可手动打开。`;
}

export function buildRoundResetBusyNotice(): string {
  return "当前轮次正在运行中，请先中断后再放弃本轮断点。";
}

export function buildRoundResetMissingNotice(): string {
  return "当前没有可放弃进度的轮次。";
}

export function buildRoundResetRuntimeStep(): string {
  return "当前轮次进度已清理";
}

export function buildRoundResetFailureRuntimeStep(): string {
  return "清理当前轮次断点失败";
}
