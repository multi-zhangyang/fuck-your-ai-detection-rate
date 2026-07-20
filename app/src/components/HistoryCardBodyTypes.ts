import type {
  DeleteHistoryOptions,
  DocumentHistory,
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseCheckResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  HistoryOrphanScanResult,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export type HistoryCardBodyProps = {
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  items: HistoryDocumentSummary[];
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  orphanScan: HistoryOrphanScanResult | null;
  artifactQuery: HistoryArtifactQueryResponse | null;
  artifactMode: HistoryArtifactGovernanceMode;
  artifactLoading: boolean;
  open: boolean;
  busy: boolean;
  onSelect: (item: HistoryDocumentSummary) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onArtifactModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefreshArtifacts: () => void;
  onRepairHistoryDatabase: () => void;
  onScanOrphans: () => void;
  onDeleteOrphans: () => void;
  dbMaintenanceSummary: HistoryDatabaseMaintenanceSummary | null;
  dbMaintenanceSummaryLoading: boolean;
  dbBackups: HistoryDatabaseBackupListResult | null;
  dbBackupsLoading: boolean;
  dbCheck: HistoryDatabaseCheckResult | null;
  dbCheckLoading: boolean;
  onRefreshDatabaseMaintenance: () => void;
  onRefreshDatabaseBackups: () => void;
  onCheckDatabase: () => void;
  onBackupDatabase: () => void;
  onCompactDatabase: () => void;
  onRecoverDatabase: (backupPath: string | null) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  impactPreview: { key: string; impact: HistoryDeleteImpact } | null;
  impactLoadingKey: string;
  maintenanceOpen: boolean;
  setMaintenanceOpen: (value: boolean | ((current: boolean) => boolean)) => void;
  cleanupDocId: string | null;
  setCleanupDocId: (value: string | null | ((current: string | null) => string | null)) => void;
  continuationCount: number;
  exportableCount: number;
  missingDocumentCount: number;
  maintenanceStateLabel: string;
  totalBytesLabel: string;
  currentCleanupOptions: DeleteHistoryOptions;
  currentCleanupKey: string;
  governanceImpactPreview: HistoryDeleteImpact | null;
  handlePreviewDelete: (docId: string, options: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null | void>;
};
