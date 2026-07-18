import type { EnvironmentDiagnostics } from "@/types/app";
import {
  compareDiagnosticTasks,
  type DiagnosticTaskItem,
} from "@/lib/diagnosticsTaskAccessHelpers";

export function buildDiagnosticTaskItems(value: EnvironmentDiagnostics | null): DiagnosticTaskItem[] {
  if (!value) {
    return [];
  }
  const backendItems = value.tasks ?? [];
  if (backendItems.length) {
    return [...backendItems].sort(compareDiagnosticTasks);
  }
  const fallbackItems: DiagnosticTaskItem[] = [
    ...value.activeRuns.map((item) => ({
      ...item,
      taskType: "run-round",
      taskGroup: "active",
      targetPath: item.sourcePath,
      active: true,
      sortAt: item.updatedAt,
    })),
    ...(value.activeBatchReruns ?? []).map((item) => ({
      ...item,
      taskType: "batch-rerun",
      taskGroup: "active",
      targetPath: item.outputPath,
      active: true,
      sortAt: item.updatedAt,
    })),
    ...(value.recentRuns ?? []).map((item) => ({
      ...item,
      taskType: "run-round",
      taskGroup: "recent",
      targetPath: item.sourcePath,
      active: false,
      sortAt: item.persistedAt || item.updatedAt,
    })),
    ...(value.recentBatchReruns ?? []).map((item) => ({
      ...item,
      taskType: "batch-rerun",
      taskGroup: "recent",
      targetPath: item.outputPath,
      active: false,
      sortAt: item.persistedAt || item.updatedAt,
    })),
  ];
  return fallbackItems.sort(compareDiagnosticTasks);
}
