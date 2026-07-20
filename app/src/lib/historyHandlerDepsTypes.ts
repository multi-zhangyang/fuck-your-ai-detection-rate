import type { AppService } from "@/lib/appService";
import type {
  LoadLatestRoundSnapshotOptions,
  OptionalUiFeedback,
  TaskTicket,
} from "@/lib/historyHandlerInputTypes";
import type { TaskPhase } from "@/lib/taskState";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type { RoundArtifactSnapshotIntentRef } from "@/lib/roundArtifactSnapshot";
import type {
  DocumentHistory,
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
  DocumentStatus,
  ExportFailureDetails,
  ExportResult,
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseCheckResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDocumentSummary,
  HistoryOrphanScanResult,
  ModelConfig,
  OutputPreview,
  PromptOption,
  PromptWorkflow,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export type HistoryHandlersDeps = {
  service: AppService;
  roundArtifactSnapshotIntentRef: RoundArtifactSnapshotIntentRef;
  getModelConfig: () => ModelConfig;
  getDocumentStatus: () => DocumentStatus | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getHistoryItems: () => HistoryDocumentSummary[];
  getHistoryArtifactMode: () => HistoryArtifactGovernanceMode;
  getHistoryOrphanScan: () => HistoryOrphanScanResult | null;
  getRoundResult: () => RoundResult | null;
  getActiveCompareData: () => RoundCompareData | null;
  getLastExportResult: () => ExportResult | null;
  setModelConfig: (config: ModelConfig) => void;
  setDocumentStatus: (status: DocumentStatus | null) => void;
  setHistory: (history: DocumentHistory | null) => void;
  setProtectionMap: (map: DocumentProtectionMap | null) => void;
  setScopeDiagnostics: (diagnostics: DocumentScopeDiagnostics | null) => void;
  setHistoryItems: (items: HistoryDocumentSummary[]) => void;
  setHistoryOrphanScan: (scan: HistoryOrphanScanResult | null) => void;
  setHistoryDatabaseMaintenance: (summary: HistoryDatabaseMaintenanceSummary | null) => void;
  setHistoryDatabaseMaintenanceLoading: (loading: boolean) => void;
  setHistoryDatabaseBackups: (backups: HistoryDatabaseBackupListResult | null) => void;
  setHistoryDatabaseBackupsLoading: (loading: boolean) => void;
  setHistoryDatabaseCheck: (check: HistoryDatabaseCheckResult | null) => void;
  setHistoryDatabaseCheckLoading: (loading: boolean) => void;
  setHistoryArtifactMode: (mode: HistoryArtifactGovernanceMode) => void;
  setHistoryArtifactQuery: (query: HistoryArtifactQueryResponse | null) => void;
  setHistoryArtifactLoading: (loading: boolean) => void;
  setPreview: (preview: OutputPreview | null) => void;
  setCompareData: (compare: RoundCompareData | null) => void;
  setReviewDecisions: (decisions: Record<string, ReviewDecision>) => void;
  setLastExportResult: (result: ExportResult | null) => void;
  setLastExportFailure: (failure: ExportFailureDetails | null) => void;
  setLiveCompareRef: (compare: RoundCompareData | null) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  applyOptionalUiFeedback: (feedback: OptionalUiFeedback) => void;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  clearDocumentDerivedState: () => void;
  clearAutoSnapshotSuppression: () => void;
  clearPendingAutoActionForManualContextChange: () => void;
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: {
      shouldCommit?: () => boolean;
      promptOptions?: PromptOption[];
      promptWorkflows?: PromptWorkflow[];
    },
  ) => Promise<DocumentStatus>;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: LoadLatestRoundSnapshotOptions,
  ) => Promise<unknown>;
  startTransition: (callback: () => void) => void;
  flushReviewDecisionSaves: (outputPath: string) => Promise<boolean>;
};
