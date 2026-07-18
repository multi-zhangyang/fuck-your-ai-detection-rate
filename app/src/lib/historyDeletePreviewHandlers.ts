import { formatBytes } from "@/lib/formatters";
import { splitConfirmText } from "@/lib/exportHelpers";
import {
  buildHistoryDeleteCancelledRuntimeStep,
  buildHistoryDeleteConfirmOptions,
  buildHistoryDeleteFailureRuntimeStep,
  buildHistoryDeletePreviewFailureRuntimeStep,
  buildHistoryDeletePreviewLoadingRuntimeStep,
  buildHistoryDeleteWorkingRuntimeStep,
  getHistoryDeleteCopy,
} from "@/lib/historyDeleteCopy";
import type {
  ExecuteHistoryDeleteInput,
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";
import type {
  DeleteHistoryOptions,
  DeleteHistoryResult,
  HistoryDeleteImpact,
} from "@/types/app";

export function createHistoryDeletePreviewHandlers(
  deps: HistoryHandlersDeps,
  applyHistoryDeleteSuccess: (input: ExecuteHistoryDeleteInput, result: DeleteHistoryResult) => Promise<void>,
) {
  async function handlePreviewHistoryDelete(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<HistoryDeleteImpact | null> {
    try {
      deps.setError("");
      deps.setRuntimeStep("正在计算历史清理影响范围。");
      const impact = await deps.service.previewDocumentHistoryDelete(docId, options);
      deps.setRuntimeStep("历史清理影响预览完成");
      deps.setNotice(`已生成删除前影响预览：${impact.fileStats.existing} 个项目文件，约 ${formatBytes(impact.fileStats.bytes)}。`);
      return impact;
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "历史清理影响预览失败");
      return null;
    }
  }

  async function handleDeleteHistory(docId: string, options?: DeleteHistoryOptions) {
    const { actionLabel, confirmText, doneLabel } = getHistoryDeleteCopy(options);
    const previewTicket = deps.beginTask("loading-history", {
      globalBusy: false,
      runtimeStep: buildHistoryDeletePreviewLoadingRuntimeStep(),
    });
    let impact: HistoryDeleteImpact | null = null;
    try {
      impact = await deps.service.previewDocumentHistoryDelete(docId, options);
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, buildHistoryDeletePreviewFailureRuntimeStep());
    } finally {
      deps.finishTask(previewTicket);
    }
    if (!impact) return;
    if (!(await deps.requestConfirm(buildHistoryDeleteConfirmOptions({
      actionLabel,
      confirmText,
      impact,
      mode: options?.mode,
      splitConfirmText,
    })))) {
      deps.setRuntimeStep(buildHistoryDeleteCancelledRuntimeStep());
      return;
    }
    const taskTicket = deps.beginTask("deleting-history", {
      runtimeStep: buildHistoryDeleteWorkingRuntimeStep(actionLabel),
    });
    try {
      await applyHistoryDeleteSuccess(
        { docId, options, actionLabel, doneLabel },
        await deps.service.deleteDocumentHistory(docId, options),
      );
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, buildHistoryDeleteFailureRuntimeStep(actionLabel));
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    handlePreviewHistoryDelete,
    handleDeleteHistory,
  };
}
