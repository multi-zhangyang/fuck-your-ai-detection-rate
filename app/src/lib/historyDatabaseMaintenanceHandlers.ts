import { stringifyError } from "@/lib/errorText";
import { buildHistoryDatabaseRecoverySuccessMessage } from "@/lib/historyDatabaseRecoveryMessage";
import {
  beginHistoryRequest,
  isCurrentHistoryRequest,
} from "@/lib/historyRequestGeneration";
import type { HistoryCoreHandlers, HistoryHandlersDeps } from "@/lib/historyHandlerTypes";
import type {
  HistoryDatabaseBackupListResult,
  HistoryDatabaseBackupResult,
  HistoryDatabaseCompactResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDatabaseRecoverResult,
} from "@/types/app";

const DEFAULT_BACKUP_KEEP = 12;

export function createHistoryDatabaseMaintenanceHandlers(
  deps: HistoryHandlersDeps,
  core: HistoryCoreHandlers,
) {
  async function refreshHistoryDatabaseMaintenance(): Promise<HistoryDatabaseMaintenanceSummary | null> {
    const requestKey = deps.setHistoryDatabaseMaintenance as unknown as object;
    const generation = beginHistoryRequest(requestKey, "maintenance");
    deps.setHistoryDatabaseMaintenance(null);
    deps.setHistoryDatabaseMaintenanceLoading(true);
    try {
      const summary = await deps.service.getHistoryDatabaseMaintenance();
      if (isCurrentHistoryRequest(requestKey, "maintenance", generation)) {
        deps.setHistoryDatabaseMaintenance(summary);
      }
      return summary;
    } catch (appError) {
      if (isCurrentHistoryRequest(requestKey, "maintenance", generation)) {
        deps.setError(stringifyError(appError));
      }
      return null;
    } finally {
      if (isCurrentHistoryRequest(requestKey, "maintenance", generation)) {
        deps.setHistoryDatabaseMaintenanceLoading(false);
      }
    }
  }

  async function refreshHistoryDatabaseBackups(
    validate = false,
  ): Promise<HistoryDatabaseBackupListResult | null> {
    const requestKey = deps.setHistoryDatabaseBackups as unknown as object;
    const generation = beginHistoryRequest(requestKey, "backups");
    deps.setHistoryDatabaseBackups(null);
    deps.setHistoryDatabaseBackupsLoading(true);
    try {
      const result = await deps.service.listHistoryDatabaseBackups(validate);
      if (isCurrentHistoryRequest(requestKey, "backups", generation)) {
        deps.setHistoryDatabaseBackups(result);
      }
      return result;
    } catch (appError) {
      if (isCurrentHistoryRequest(requestKey, "backups", generation)) {
        deps.setError(stringifyError(appError));
      }
      return null;
    } finally {
      if (isCurrentHistoryRequest(requestKey, "backups", generation)) {
        deps.setHistoryDatabaseBackupsLoading(false);
      }
    }
  }

  function applyMaintenanceFeedback(label: string, ok: boolean, error?: string) {
    deps.applyOptionalUiFeedback({
      notice: ok ? label : undefined,
      setError: ok ? undefined : (error || label),
      runtimeStep: ok ? "历史库维护完成" : "历史库维护失败",
    });
  }

  async function handleBackupHistoryDatabase(reason: string) {
    const ticket = deps.beginTask("loading-history", { runtimeStep: "正在备份历史库" });
    try {
      const result = await deps.service.backupHistoryDatabase({ reason, keep: DEFAULT_BACKUP_KEEP });
      if (result.ok) {
        await Promise.all([refreshHistoryDatabaseMaintenance(), refreshHistoryDatabaseBackups(false)]);
        await core.refreshHistoryList();
      }
      applyMaintenanceFeedback(
        result.ok ? `历史库已备份${result.path ? `：${result.path}` : ""}` : "历史库备份失败",
        result.ok,
        result.error,
      );
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "历史库备份失败");
    } finally {
      deps.finishTask(ticket);
    }
  }

  async function handleCompactHistoryDatabase(createBackup: boolean) {
    const ticket = deps.beginTask("loading-history", { runtimeStep: "正在压缩历史库" });
    try {
      const result = await deps.service.compactHistoryDatabase({ createBackup, keep: DEFAULT_BACKUP_KEEP });
      if (result.ok) {
        await Promise.all([refreshHistoryDatabaseMaintenance(), refreshHistoryDatabaseBackups(false)]);
        await core.refreshHistoryList();
      }
      const saved = result.savedBytes ?? 0;
      applyMaintenanceFeedback(
        result.ok ? `历史库已压缩，回收 ${saved} 字节` : "历史库压缩失败",
        result.ok,
        result.error,
      );
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "历史库压缩失败");
    } finally {
      deps.finishTask(ticket);
    }
  }

  async function handleRecoverHistoryDatabase(backupPath: string | null) {
    const confirmed = await deps.requestConfirm({
      title: "安全恢复历史索引",
      description: "SQLite 仅用于历史查询索引。恢复前会备份当前索引；若现有 JSON 历史有效，系统会保留 JSON 并据此重建索引，不会用旧备份回退历史。只有 JSON 缺失时才会从备份恢复历史数据；JSON 无效时操作会停止并保留原文件。",
      confirmLabel: "恢复索引",
      cancelLabel: "取消",
      tone: "warning",
    });
    if (!confirmed) {
      return;
    }
    const ticket = deps.beginTask("loading-history", { runtimeStep: "正在安全恢复历史索引" });
    try {
      const result = await deps.service.recoverHistoryDatabase({
        backupPath: backupPath ?? undefined,
        keep: DEFAULT_BACKUP_KEEP,
      });
      if (result.ok) {
        await Promise.all([refreshHistoryDatabaseMaintenance(), refreshHistoryDatabaseBackups(false)]);
        await core.refreshHistoryList();
        await core.refreshHistoryArtifactGovernance();
      }
      applyMaintenanceFeedback(
        result.ok ? buildHistoryDatabaseRecoverySuccessMessage(result) : "历史索引恢复失败",
        result.ok,
        result.error,
      );
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, "历史索引恢复失败");
    } finally {
      deps.finishTask(ticket);
    }
  }

  return {
    refreshHistoryDatabaseMaintenance,
    refreshHistoryDatabaseBackups,
    handleBackupHistoryDatabase,
    handleCompactHistoryDatabase,
    handleRecoverHistoryDatabase,
  };
}

export type HistoryDatabaseMaintenanceHandlers = ReturnType<typeof createHistoryDatabaseMaintenanceHandlers>;
export type {
  HistoryDatabaseBackupListResult,
  HistoryDatabaseBackupResult,
  HistoryDatabaseCompactResult,
  HistoryDatabaseRecoverResult,
};
