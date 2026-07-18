import type {
  DeleteHistoryOptions,
  DeleteHistoryResult,
  HistoryArtifactQueryFilters,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseBackupResult,
  HistoryDatabaseCheckResult,
  HistoryDatabaseCompactResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDatabaseRecoverResult,
  HistoryDatabaseRepairResult,
  HistoryDeleteImpact,
  HistoryListResponse,
  HistoryOrphanDeleteResult,
  HistoryOrphanScanResult,
} from "@/types/app";
import {
  buildEmptyHistoryArtifactQueryResponse,
  isEndpointCompatibilityError,
  normalizeHistoryArtifactKinds,
} from "@/lib/webServiceCompat";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceHistoryApi = {
  async listDocumentHistories(): Promise<HistoryListResponse> {
    return requestJson<HistoryListResponse>("/api/history-documents");
  },

  async deleteDocumentHistory(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<DeleteHistoryResult> {
    return requestJson<DeleteHistoryResult>("/api/document-history", {
      method: "DELETE",
      body: JSON.stringify({
        docId,
        fromRound: options?.fromRound ?? null,
        promptProfile: options?.promptProfile ?? null,
        promptSequence: options?.promptSequence ?? null,
        mode: options?.mode ?? "records_and_artifacts",
      }),
    });
  },

  async previewDocumentHistoryDelete(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<HistoryDeleteImpact> {
    return requestJson<HistoryDeleteImpact>("/api/document-history/impact", {
      method: "POST",
      body: JSON.stringify({
        docId,
        fromRound: options?.fromRound ?? null,
        promptProfile: options?.promptProfile ?? null,
        promptSequence: options?.promptSequence ?? null,
        mode: options?.mode ?? "records_and_artifacts",
      }),
    });
  },

  async queryHistoryArtifacts(filters: HistoryArtifactQueryFilters = {}): Promise<HistoryArtifactQueryResponse> {
    const query = new URLSearchParams();
    if (filters.docId) query.set("docId", filters.docId);
    if (filters.roundNumber) query.set("roundNumber", String(filters.roundNumber));
    const kinds = filters.kinds ?? (Array.isArray(filters.kind) ? filters.kind : filters.kind ? [filters.kind] : []);
    kinds.forEach((kind) => query.append("kind", kind));
    if (filters.exists !== undefined) query.set("exists", String(filters.exists));
    if (filters.minBytes) query.set("minBytes", String(filters.minBytes));
    if (filters.maxBytes) query.set("maxBytes", String(filters.maxBytes));
    if (filters.pathContains) query.set("pathContains", filters.pathContains);
    if (filters.limit) query.set("limit", String(filters.limit));
    if (filters.offset) query.set("offset", String(filters.offset));
    const suffix = query.toString();
    try {
      return await requestJson<HistoryArtifactQueryResponse>(`/api/history-artifacts${suffix ? `?${suffix}` : ""}`);
    } catch (error) {
      if (isEndpointCompatibilityError(error)) {
        return buildEmptyHistoryArtifactQueryResponse(
          filters,
          "当前后端未提供历史资产索引接口，已跳过非阻断治理探测；重启本地 Web 服务后可恢复完整历史治理。",
        );
      }
      throw error;
    }
  },

  async checkHistoryDatabase(): Promise<HistoryDatabaseCheckResult> {
    return requestJson<HistoryDatabaseCheckResult>("/api/history-db/check");
  },

  async repairHistoryDatabase(): Promise<HistoryDatabaseRepairResult> {
    return requestJson<HistoryDatabaseRepairResult>("/api/history-db/repair", { method: "POST" });
  },

  async getHistoryDatabaseMaintenance(): Promise<HistoryDatabaseMaintenanceSummary> {
    return requestJson<HistoryDatabaseMaintenanceSummary>("/api/history-db/maintenance");
  },

  async listHistoryDatabaseBackups(validate = false): Promise<HistoryDatabaseBackupListResult> {
    const suffix = validate ? "?validate=1" : "";
    return requestJson<HistoryDatabaseBackupListResult>(`/api/history-db/backups${suffix}`);
  },

  async backupHistoryDatabase(
    options: { reason?: string; keep?: number } = {},
  ): Promise<HistoryDatabaseBackupResult> {
    return requestJson<HistoryDatabaseBackupResult>("/api/history-db/backup", {
      method: "POST",
      body: JSON.stringify({
        reason: options.reason ?? "manual",
        keep: options.keep ?? 12,
      }),
    });
  },

  async compactHistoryDatabase(
    options: { createBackup?: boolean; keep?: number } = {},
  ): Promise<HistoryDatabaseCompactResult> {
    return requestJson<HistoryDatabaseCompactResult>("/api/history-db/compact", {
      method: "POST",
      body: JSON.stringify({
        createBackup: options.createBackup ?? true,
        keep: options.keep ?? 12,
      }),
    });
  },

  async recoverHistoryDatabase(
    options: { backupPath?: string; keep?: number } = {},
  ): Promise<HistoryDatabaseRecoverResult> {
    return requestJson<HistoryDatabaseRecoverResult>("/api/history-db/recover", {
      method: "POST",
      body: JSON.stringify({
        backupPath: options.backupPath ?? "",
        keep: options.keep ?? 12,
      }),
    });
  },

  async scanHistoryOrphans(protectedPaths: string[] = []): Promise<HistoryOrphanScanResult> {
    return requestJson<HistoryOrphanScanResult>("/api/history-orphans", {
      method: "POST",
      body: JSON.stringify({ protectedPaths }),
    });
  },

  async deleteHistoryOrphans(protectedPaths: string[] = []): Promise<HistoryOrphanDeleteResult> {
    return requestJson<HistoryOrphanDeleteResult>("/api/history-orphans", {
      method: "DELETE",
      body: JSON.stringify({ protectedPaths }),
    });
  },
};
