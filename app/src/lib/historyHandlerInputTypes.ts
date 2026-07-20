import type {
  DeleteHistoryOptions,
  DeleteHistoryResult,
  DocumentStatus,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptId,
} from "@/types/app";

export type TaskTicket = number;

export type LoadedHistorySnapshotLike = {
  round?: HistoryRound | null;
  compareData?: { promptProfile?: string | null; promptSequence?: PromptId[] | null } | null;
} | null | undefined;

export type ResyncHistoryDocumentRouteInput = {
  selectedConfig: ModelConfig;
  loadedSnapshot: unknown;
  status: DocumentStatus;
  shouldCommit?: () => boolean;
};

export type HistoryDocumentLoadOptions = {
  shouldCommit?: () => boolean;
};

export type HistoryRouteStatusResult = {
  status: DocumentStatus;
  statusConfig: ModelConfig;
};

export type ExecuteHistoryDeleteInput = {
  docId: string;
  options?: DeleteHistoryOptions;
  actionLabel: string;
  doneLabel: string;
};

export type HistoryDocumentLoadFeedback = {
  notice: string;
  runtimeStep: string;
};

export type OptionalUiFeedback = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export type RefreshHistoryListOptions = {
  shouldCommit?: () => boolean;
};

/**
 * Superseded requests do not expose their payload to downstream workflows.
 */
export type HistoryListRefreshResult =
  | { status: "current"; items: HistoryDocumentSummary[]; isCurrent: () => boolean }
  | { status: "stale" };

export type HistoryOrphanScanRefreshResult =
  | {
      status: "current";
      scan: import("@/types/app").HistoryOrphanScanResult;
      isCurrent: () => boolean;
    }
  | { status: "stale" };

export type LoadLatestRoundSnapshotOptions = {
  historyItems?: import("@/types/app").HistoryDocumentSummary[];
  historyItem?: import("@/types/app").HistoryDocumentSummary | null;
  allowProfileFallback?: boolean;
  shouldCommit?: () => boolean;
  promptOptions?: import("@/types/app").PromptOption[];
  promptWorkflows?: import("@/types/app").PromptWorkflow[];
};
