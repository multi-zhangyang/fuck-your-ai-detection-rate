import { describeDocumentProgress, formatDocumentLoadStep } from "@/lib/documentStatusCopy";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import type { DocumentLoadHandlersDeps } from "@/lib/documentLoadHandlerTypes";

export function createDocumentPickHandlers(deps: DocumentLoadHandlersDeps) {
  async function applyPickedDocument(sourcePath: string) {
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    deps.clearDocumentDerivedState();
    const status = await deps.refreshDocumentState(sourcePath);
    await deps.refreshHistoryList();
    deps.setHistoryPanelOpen(true);
    deps.setRuntimeStep(formatDocumentLoadStep(
      "文档已载入",
      status,
      deps.getModelConfig(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    ));
    deps.setNotice(`已导入文档。${describeDocumentProgress(
      status,
      deps.getModelConfig(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    )}`);
  }

  async function loadPickedDocument(taskTicket: number, sourcePath: string) {
    deps.transitionTask(taskTicket, "uploading-document", {
      globalBusy: true,
      runtimeStep: "正在载入文档状态。",
    });
    await applyPickedDocument(sourcePath);
  }

  async function pickAndLoadDocument(taskTicket: number) {
    const picked = await deps.service.pickInputFile();
    if (!picked) {
      deps.setNotice("已取消选择文档。");
      deps.setRuntimeStep("待命");
      return;
    }
    await loadPickedDocument(taskTicket, picked.sourcePath);
  }

  async function handlePickFile() {
    const taskTicket = deps.beginTask("picking-document", {
      globalBusy: false,
      runtimeStep: "正在选择文档。",
    });
    try {
      await pickAndLoadDocument(taskTicket);
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "读取文档失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleRefreshCurrentDocumentStatus() {
    const sourcePath = deps.getDocumentStatus()?.sourcePath;
    if (!sourcePath) {
      deps.setNotice("请先上传或选择一篇文档。");
      return;
    }
    const taskTicket = deps.beginTask("diagnosing", { runtimeStep: "正在刷新轮次状态。" });
    try {
      const refreshConfig = normalizeActiveModelConfig(
        deps.getLatestModelConfig() ?? deps.getModelConfig(),
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
      const message = formatDocumentLoadStep(
        "状态已刷新",
        await deps.refreshDocumentState(sourcePath, refreshConfig),
        refreshConfig,
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
      deps.setRuntimeStep(message);
      deps.setNotice(message);
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "刷新状态失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    applyPickedDocument,
    loadPickedDocument,
    pickAndLoadDocument,
    handlePickFile,
    handleRefreshCurrentDocumentStatus,
  };
}
