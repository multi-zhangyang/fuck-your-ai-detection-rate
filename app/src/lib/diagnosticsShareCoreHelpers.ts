import type { EnvironmentDiagnostics } from "@/types/app";
import { redactLocalPath } from "@/lib/formatters";
import {
  buildDiagnosticTaskItems,
  getTaskItemString,
  isDiagnosticTaskActive,
} from "@/lib/diagnosticsTaskHelpers";

export function buildShareableDiagnosticsCore(value: EnvironmentDiagnostics) {
  const diagnosticTasks = buildDiagnosticTaskItems(value);
  return {
    ok: value.ok,
    createdAt: value.createdAt,
    checks: value.checks.map((item) => ({
      key: item.key,
      label: item.label,
      level: item.level,
      ok: item.ok,
      message: item.message,
    })),
    config: {
      exists: value.config.exists,
      hasBaseUrl: value.config.hasBaseUrl,
      hasApiKey: value.config.hasApiKey,
      apiType: value.config.apiType,
      model: value.config.model ? "<configured>" : "",
      promptProfile: value.config.promptProfile,
      promptSequence: value.config.promptSequence,
      requestTimeoutSeconds: value.config.requestTimeoutSeconds,
      maxRetries: value.config.maxRetries,
      providerCount: value.config.providerCount,
      enabledProviderCount: value.config.enabledProviderCount,
      customRoundCount: value.config.customRoundCount,
    },
    runtime: {
      pythonVersion: value.runtime.pythonVersion,
      platform: value.runtime.platform,
      pythonExecutable: redactLocalPath(value.runtime.pythonExecutable),
    },
    paths: value.paths.map((item) => ({
      key: item.key,
      label: item.label,
      exists: item.exists,
      writable: item.writable,
      fileCount: item.fileCount,
      sizeBytes: item.sizeBytes,
      path: redactLocalPath(item.path),
    })),
    activeRunCount: value.activeRunCount,
    activeBatchRerunCount: value.activeBatchRerunCount ?? value.activeBatchReruns?.length ?? 0,
    recentRunCount: value.recentRunCount ?? value.recentRuns?.length ?? 0,
    recentBatchRerunCount: value.recentBatchRerunCount ?? value.recentBatchReruns?.length ?? 0,
    taskCount: value.taskCount ?? diagnosticTasks.length,
    recentTaskCount: value.recentTaskCount ?? value.recentTasks?.length ?? diagnosticTasks.filter((item) => !isDiagnosticTaskActive(item)).length,
    tasks: diagnosticTasks.map((item) => ({
      runId: item.runId,
      taskType: item.taskType,
      taskGroup: item.taskGroup,
      active: isDiagnosticTaskActive(item),
      status: item.status,
      completed: item.completed,
      cancelRequested: item.cancelRequested,
      restoredFromDisk: item.restoredFromDisk,
      targetPath: redactLocalPath(getTaskItemString(item, "targetPath")),
      updatedAt: getTaskItemString(item, "updatedAt"),
      persistedAt: getTaskItemString(item, "persistedAt"),
      sortAt: getTaskItemString(item, "sortAt"),
    })),
    taskStateStore: value.taskStateStore ? {
      ...value.taskStateStore,
      path: redactLocalPath(value.taskStateStore.path),
    } : undefined,
  };
}
