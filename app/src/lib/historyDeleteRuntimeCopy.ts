export function buildHistoryDeletePreviewFailureRuntimeStep(): string {
  return "历史清理影响预览失败";
}

export function buildHistoryDeleteFailureRuntimeStep(actionLabel: string): string {
  return `${actionLabel}失败`;
}

export function buildHistoryDeleteWorkingRuntimeStep(actionLabel: string): string {
  return `正在${actionLabel}。`;
}

export function buildHistoryOrphanScanRuntimeStep(): string {
  return "正在扫描未归属生成文件。";
}

export function buildHistoryOrphanScanFailureRuntimeStep(): string {
  return "未归属文件扫描失败";
}

export function buildHistoryOrphanEmptyNotice(): string {
  return "没有可清理的未归属生成文件。";
}

export function buildHistoryOrphanWorkingRuntimeStep(): string {
  return "正在清理未归属生成文件。";
}

export function buildHistoryOrphanDoneRuntimeStep(): string {
  return "未归属文件清理完成";
}

export function buildHistoryOrphanFailureRuntimeStep(): string {
  return "未归属文件清理失败";
}

export function buildHistoryDeletePreviewLoadingRuntimeStep(): string {
  return "正在计算历史清理影响范围。";
}

export function buildHistoryDeleteCancelledRuntimeStep(): string {
  return "待命";
}
