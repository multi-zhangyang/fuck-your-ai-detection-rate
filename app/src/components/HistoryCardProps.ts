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

export type HistoryCardProps = {
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
  onToggle: () => void;
  onSelect: (item: HistoryDocumentSummary) => void;
  onPreviewDelete: (docId: string, options?: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null>;
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
};
