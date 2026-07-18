import type {
  ExecuteHistoryDeleteInput,
  HistoryDocumentLoadFeedback,
  HistoryRouteStatusResult,
  ResyncHistoryDocumentRouteInput,
} from "@/lib/historyHandlerInputTypes";
import type {
  DeleteHistoryOptions,
  DeleteHistoryResult,
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDatabaseRepairResult,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  HistoryOrphanScanResult,
  ModelConfig,
  RoundResult,
} from "@/types/app";

export type HistoryCoreHandlers = {
  syncHistorySelectionConfigToUi: (nextConfig: ModelConfig) => void;
  getProtectedHistoryArtifactPaths: () => string[];
  refreshHistoryList: () => Promise<HistoryDocumentSummary[]>;
  refreshHistoryOrphanScan: () => Promise<HistoryOrphanScanResult>;
  refreshHistoryArtifactGovernance: (mode?: HistoryArtifactGovernanceMode) => Promise<HistoryArtifactQueryResponse | null>;
  resolveHistorySelectionConfig: (item: HistoryDocumentSummary, configOverride: ModelConfig) => ModelConfig;
  resyncHistoryDocumentRoute: (input: ResyncHistoryDocumentRouteInput) => Promise<HistoryRouteStatusResult>;
  loadAndResyncHistoryDocument: (
    item: HistoryDocumentSummary,
    selectedConfig: ModelConfig,
  ) => Promise<{ resynced: HistoryRouteStatusResult; loadedSnapshot: unknown }>;
  loadSelectedHistoryDocument: (
    item: HistoryDocumentSummary,
    configOverride: ModelConfig,
  ) => Promise<HistoryDocumentLoadFeedback>;
  loadCompletedRoundArtifacts: (result: RoundResult) => Promise<void>;
  handleExportFromHistory: (item: HistoryExportSelection, format: "txt" | "docx") => Promise<void>;
};

export type HistoryDeleteHandlers = {
  handlePreviewHistoryDelete: (
    docId: string,
    options?: DeleteHistoryOptions,
  ) => Promise<HistoryDeleteImpact | null>;
  applyHistoryDeleteSuccess: (input: ExecuteHistoryDeleteInput, result: DeleteHistoryResult) => Promise<void>;
  handleDeleteHistory: (docId: string, options?: DeleteHistoryOptions) => Promise<void>;
  handleScanHistoryOrphans: () => Promise<void>;
  handleDeleteHistoryOrphans: () => Promise<void>;
  applyHistoryDatabaseRepairResult: (result: HistoryDatabaseRepairResult) => Promise<void>;
  handleRepairHistoryDatabase: () => Promise<void>;
  refreshHistoryDatabaseMaintenance: () => Promise<HistoryDatabaseMaintenanceSummary | null>;
  refreshHistoryDatabaseBackups: (validate?: boolean) => Promise<HistoryDatabaseBackupListResult | null>;
  handleBackupHistoryDatabase: (reason: string) => Promise<void>;
  handleCompactHistoryDatabase: (createBackup: boolean) => Promise<void>;
  handleRecoverHistoryDatabase: (backupPath: string | null) => Promise<void>;
};
