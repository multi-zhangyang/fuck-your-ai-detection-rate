import type { EnvironmentDiagnostics } from "@/types/app";

export type DiagnosticTaskItem = NonNullable<EnvironmentDiagnostics["tasks"]>[number];

export function getDiagnosticBadgeVariant(level?: string): "success" | "warning" | "danger" | "outline" {
  if (level === "success") return "success";
  if (level === "warning") return "warning";
  if (level === "error") return "danger";
  return "outline";
}

export function getTaskItemString(item: DiagnosticTaskItem, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value : "";
}

export function getTaskItemNumber(item: DiagnosticTaskItem, key: string): number | null {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getTaskItemRecord(item: DiagnosticTaskItem, key: string): Record<string, unknown> | null {
  const value = item[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function isDiagnosticTaskActive(item: DiagnosticTaskItem): boolean {
  return Boolean(item.active || getTaskItemString(item, "taskGroup") === "active");
}

export function compareDiagnosticTasks(left: DiagnosticTaskItem, right: DiagnosticTaskItem): number {
  if (isDiagnosticTaskActive(left) !== isDiagnosticTaskActive(right)) {
    return isDiagnosticTaskActive(left) ? -1 : 1;
  }
  return getTaskItemString(right, "sortAt").localeCompare(getTaskItemString(left, "sortAt"));
}

export function getDiagnosticTaskStatus(item: DiagnosticTaskItem): string {
  const status = getTaskItemString(item, "status");
  if (Boolean(item.cancelRequested)) {
    return "停止中";
  }
  if (isDiagnosticTaskActive(item)) {
    return status === "canceling" ? "停止中" : "运行中";
  }
  if (!item.completed) {
    return "未完成";
  }
  if (status === "interrupted") {
    return "已中断";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "canceled") {
    return "已停止";
  }
  return status || "已记录";
}

export function getDiagnosticTaskBadgeVariant(item: DiagnosticTaskItem): "success" | "warning" | "danger" | "outline" {
  const status = getTaskItemString(item, "status");
  if (status === "failed") {
    return "danger";
  }
  if (status === "interrupted" || Boolean(item.cancelRequested) || isDiagnosticTaskActive(item) || !item.completed) {
    return "warning";
  }
  return "outline";
}
