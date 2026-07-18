export function buildPrimaryRunButtonText(input: {
  running: boolean;
  nextRound?: number | null;
  activeRunStatus: boolean;
  unavailableRouteCount: number;
  waitingForStatusSync: boolean;
  completedButDiffMissing: boolean;
  hasPendingRound: boolean;
  resumableCheckpoint: boolean;
  checkpointRunLabel: string;
  nextRoundButtonText: string;
  canAppendRound: boolean;
  appendRoundText: string;
  hasDocument: boolean;
}): string {
  if (input.running) {
    return `正在执行第 ${input.nextRound ?? ""} 轮`;
  }
  if (input.activeRunStatus) {
    return "后台已有运行";
  }
  if (input.unavailableRouteCount) {
    return "先修复模型路线";
  }
  if (input.waitingForStatusSync) {
    return "刷新轮次状态";
  }
  if (input.completedButDiffMissing) {
    return "结果不完整，刷新状态";
  }
  if (input.hasPendingRound) {
    return input.resumableCheckpoint ? input.checkpointRunLabel : input.nextRoundButtonText;
  }
  if (input.canAppendRound) {
    return input.appendRoundText;
  }
  return input.hasDocument ? "流程完成，可导出" : "上传后开始第 1 轮";
}
