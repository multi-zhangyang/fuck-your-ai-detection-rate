import { formatBytes } from "@/lib/formatters";
import {
  buildHistoryOrphanCleanupNotice,
  buildHistoryOrphanConfirmOptions,
  buildHistoryOrphanDoneRuntimeStep,
  buildHistoryOrphanEmptyNotice,
  buildHistoryOrphanFailureRuntimeStep,
  buildHistoryOrphanScanFailureRuntimeStep,
  buildHistoryOrphanScanRuntimeStep,
  buildHistoryOrphanWorkingRuntimeStep,
} from "@/lib/historyDeleteCopy";
import type {
  HistoryCoreHandlers,
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";

export function createHistoryOrphanScanHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  async function handleScanHistoryOrphans() {
    const taskTicket = deps.beginTask("loading-history");
    try {
      deps.setRuntimeStep("正在扫描未归属生成文件。");
      const result = await core.refreshHistoryOrphanScan();
      deps.setNotice(
        result.totalOrphanFiles
          ? `发现 ${result.totalOrphanFiles} 个未归属生成文件，可按需清理。`
          : "没有发现未归属生成文件。",
      );
      deps.setRuntimeStep("未归属文件扫描完成");
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "未归属文件扫描失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleDeleteHistoryOrphans() {
    let currentScan = deps.getHistoryOrphanScan();
    if (!currentScan) {
      const scanTicket = deps.beginTask("loading-history");
      try {
        deps.setRuntimeStep(buildHistoryOrphanScanRuntimeStep());
        currentScan = await core.refreshHistoryOrphanScan();
      } catch (appError) {
        deps.applyErrorRuntimeStep(appError, buildHistoryOrphanScanFailureRuntimeStep());
        return;
      } finally {
        deps.finishTask(scanTicket);
      }
    }
    if (!currentScan || !currentScan.totalOrphanFiles) {
      if (currentScan) deps.setNotice(buildHistoryOrphanEmptyNotice());
      return;
    }
    if (!await deps.requestConfirm(buildHistoryOrphanConfirmOptions({
      totalOrphanFiles: currentScan.totalOrphanFiles,
      orphanBytes: currentScan.orphanStats.bytes,
      formatBytes,
    }))) return;
    const taskTicket = deps.beginTask("deleting-history", {
      runtimeStep: buildHistoryOrphanWorkingRuntimeStep(),
    });
    try {
      const result = await deps.service.deleteHistoryOrphans(core.getProtectedHistoryArtifactPaths());
      deps.setHistoryOrphanScan(result.after);
      void core.refreshHistoryArtifactGovernance();
      deps.setNotice(buildHistoryOrphanCleanupNotice(result));
      deps.setRuntimeStep(buildHistoryOrphanDoneRuntimeStep());
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, buildHistoryOrphanFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    handleScanHistoryOrphans,
    handleDeleteHistoryOrphans,
  };
}
