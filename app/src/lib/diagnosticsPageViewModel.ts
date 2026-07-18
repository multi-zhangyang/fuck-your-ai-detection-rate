import {
  buildDiagnosticTaskItems,
  isDiagnosticTaskActive,
  type DiagnosticTaskItem,
} from "@/lib/diagnosticsHelpers";
import type { EnvironmentDiagnostics } from "@/types/app";

export type DiagnosticsPageViewState = {
  checks: NonNullable<EnvironmentDiagnostics["checks"]>;
  warningCount: number;
  errorCount: number;
  passedCount: number;
  healthPercent: number;
  statusText: string;
  statusVariant: "danger" | "warning" | "success" | "outline";
  problemChecks: NonNullable<EnvironmentDiagnostics["checks"]>;
  activeBatchRerunCount: number;
  recentRunCount: number;
  recentBatchRerunCount: number;
  taskItems: DiagnosticTaskItem[];
  activeTaskCount: number;
  recentTaskCount: number;
  taskStateStore: EnvironmentDiagnostics["taskStateStore"];
  configReady: boolean;
};

export function deriveDiagnosticsPageViewState(
  value: EnvironmentDiagnostics | null,
): DiagnosticsPageViewState {
  const checks = value?.checks ?? [];
  const warningCount = checks.filter((item) => item.level === "warning").length;
  const errorCount = checks.filter((item) => item.level === "error").length;
  const passedCount = checks.filter((item) => item.ok || item.level === "success" || item.level === "info").length;
  const healthPercent = checks.length ? Math.round((passedCount / checks.length) * 100) : 0;
  const statusText = !value ? "等待自检" : errorCount ? `${errorCount} 个错误` : warningCount ? `${warningCount} 个提示` : "运行正常";
  const statusVariant: DiagnosticsPageViewState["statusVariant"] = errorCount
    ? "danger"
    : warningCount
      ? "warning"
      : value
        ? "success"
        : "outline";
  const problemChecks = checks.filter((item) => item.level === "error" || item.level === "warning");
  const activeBatchRerunCount = value?.activeBatchRerunCount ?? value?.activeBatchReruns?.length ?? 0;
  const recentRunCount = value?.recentRunCount ?? value?.recentRuns?.length ?? 0;
  const recentBatchRerunCount = value?.recentBatchRerunCount ?? value?.recentBatchReruns?.length ?? 0;
  const taskItems = buildDiagnosticTaskItems(value);
  const activeTaskCount = value?.tasks?.length
    ? taskItems.filter(isDiagnosticTaskActive).length
    : (value?.activeRunCount ?? 0) + activeBatchRerunCount;
  const recentTaskCount = value?.recentTaskCount ?? value?.recentTasks?.length ?? recentRunCount + recentBatchRerunCount;
  const taskStateStore = value?.taskStateStore;
  const configReady = value ? Boolean(value.config.hasBaseUrl && value.config.hasApiKey && value.config.model) : false;
  return {
    checks,
    warningCount,
    errorCount,
    passedCount,
    healthPercent,
    statusText,
    statusVariant,
    problemChecks,
    activeBatchRerunCount,
    recentRunCount,
    recentBatchRerunCount,
    taskItems,
    activeTaskCount,
    recentTaskCount,
    taskStateStore,
    configReady,
  };
}
