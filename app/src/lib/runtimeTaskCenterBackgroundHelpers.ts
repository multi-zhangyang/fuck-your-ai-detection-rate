import { sameWorkspacePath } from "@/lib/documentPaths";
import { promptSequencesEqual } from "@/lib/modelRoute";
import {
  getBatchTaskPercent,
  getRoundTaskPercent,
} from "@/lib/progressHelpers";
import type { RuntimeTaskCenterActions, RuntimeTaskCenterItem } from "@/lib/runtimeTaskCenterTypes";
import type {
  DocumentStatus,
  EnvironmentDiagnostics,
  PromptOption,
  PromptWorkflow,
  RoundProgressStatus,
} from "@/types/app";

export function appendBackgroundDiagnosticsTasks(
  items: RuntimeTaskCenterItem[],
  input: {
    currentRunToken: string | null;
    currentBatchRerunToken: string | null;
    diagnostics: EnvironmentDiagnostics | null;
    actions: RuntimeTaskCenterActions;
  },
): void {
  const visibleRunIds = new Set([input.currentRunToken].filter((item): item is string => Boolean(item)));
  for (const item of input.diagnostics?.activeRuns ?? []) {
    if (visibleRunIds.has(item.runId)) continue;
    const itemProgress = item.lastEvent ?? null;
    items.push({
      id: `diagnostics-run:${item.runId}`,
      title: "后台轮次任务",
      status: item.cancelRequested ? "中断中" : item.status || "运行中",
      tone: item.cancelRequested ? "red" : "blue",
      running: true,
      percent: getRoundTaskPercent(itemProgress),
      actionLabel: "查看诊断",
      onAction: () => input.actions.openTaskTargetView("diagnostics"),
    });
  }

  const visibleBatchIds = new Set([input.currentBatchRerunToken].filter((item): item is string => Boolean(item)));
  for (const item of input.diagnostics?.activeBatchReruns ?? []) {
    if (visibleBatchIds.has(item.runId)) continue;
    items.push({
      id: `diagnostics-batch:${item.runId}`,
      title: "后台局部优化",
      status: item.cancelRequested ? "停止中" : item.status || "运行中",
      tone: item.cancelRequested ? "red" : "amber",
      running: true,
      percent: getBatchTaskPercent(item),
      actionLabel: "查看诊断",
      onAction: () => input.actions.openTaskTargetView("diagnostics"),
    });
  }
}

export function appendCheckpointResumeTask(
  items: RuntimeTaskCenterItem[],
  input: {
    currentRunToken: string | null;
    roundProgressStatus: RoundProgressStatus | null;
    documentStatus: DocumentStatus | null;
    promptOptions: PromptOption[];
    promptWorkflows: PromptWorkflow[];
    actions: RuntimeTaskCenterActions;
  },
): void {
  const checkpointMatchesCurrentDocument = Boolean(
    input.roundProgressStatus?.canResume
    && (
      !input.documentStatus?.sourcePath
      || (
        sameWorkspacePath(input.roundProgressStatus.sourcePath, input.documentStatus.sourcePath)
        && input.roundProgressStatus.promptProfile === input.documentStatus.promptProfile
        && promptSequencesEqual(
          input.roundProgressStatus.promptSequence,
          input.documentStatus.promptSequence,
          input.promptOptions,
          input.documentStatus.promptProfile,
          input.promptWorkflows,
        )
      )
    ),
  );
  if (input.currentRunToken || !checkpointMatchesCurrentDocument || !input.roundProgressStatus) return;
  const allChunksDone = input.roundProgressStatus.resumeStage === "finalize_output";
  items.push({
    id: `checkpoint:${input.roundProgressStatus.sourcePath}:${input.roundProgressStatus.round ?? "unknown"}`,
    title: allChunksDone ? `第 ${input.roundProgressStatus.round ?? ""} 轮等待收尾` : `第 ${input.roundProgressStatus.round ?? ""} 轮可续跑`,
    status: "可继续",
    tone: input.roundProgressStatus.lastError ? "amber" : "blue",
    running: false,
    percent: input.roundProgressStatus.progressPercent,
    actionLabel: "回主页继续",
    onAction: () => input.actions.openTaskTargetView("home"),
  });
}
