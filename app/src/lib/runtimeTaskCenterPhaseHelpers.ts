import { getPhaseTaskTone } from "@/lib/progressHelpers";
import { getTaskPhaseLabel, isTaskBlocking, type TaskPhase } from "@/lib/taskState";
import type { RuntimeTaskCenterActions, RuntimeTaskCenterItem } from "@/lib/runtimeTaskCenterTypes";
import type { WorkbenchView } from "@/lib/workbenchNav";

export function appendTaskPhaseItem(
  items: RuntimeTaskCenterItem[],
  input: {
    taskPhase: TaskPhase;
    currentRunToken: string | null;
    currentBatchRerunToken: string | null;
    busy: boolean;
    progressPercent: number;
    modelCatalogAbortActive: boolean;
    actions: RuntimeTaskCenterActions;
  },
): void {
  const phaseCoveredByRun = Boolean(input.currentRunToken && (input.taskPhase === "running-round" || input.taskPhase === "canceling-run"));
  const phaseCoveredByBatch = Boolean(input.currentBatchRerunToken && (input.taskPhase === "batch-rerunning" || input.taskPhase === "canceling-batch-rerun"));
  if (input.taskPhase === "idle" || phaseCoveredByRun || phaseCoveredByBatch) return;

  const canStopModelCatalog = input.taskPhase === "loading-models" && input.modelCatalogAbortActive;
  const isBlockingPhase = isTaskBlocking(input.taskPhase);
  const actionTarget: WorkbenchView | null = input.taskPhase.includes("model") || input.taskPhase.includes("config") || input.taskPhase === "loading-models"
      ? "model"
      : input.taskPhase.includes("history")
        ? "history"
        : input.taskPhase.includes("diagnosing")
          ? "diagnostics"
          : null;
  items.push({
    id: `phase:${input.taskPhase}`,
    title: getTaskPhaseLabel(input.taskPhase),
    status: canStopModelCatalog ? "可停止" : isBlockingPhase ? "处理中" : "等待操作",
    tone: getPhaseTaskTone(input.taskPhase),
    running: isBlockingPhase || input.busy,
    percent: input.progressPercent > 0 ? input.progressPercent : undefined,
    actionLabel: actionTarget ? "查看位置" : undefined,
    onAction: actionTarget ? () => input.actions.openTaskTargetView(actionTarget) : undefined,
    cancelLabel: canStopModelCatalog ? "停止读取模型" : undefined,
    onCancel: canStopModelCatalog ? () => input.actions.handleCancelModelCatalogRequest() : undefined,
  });
}
