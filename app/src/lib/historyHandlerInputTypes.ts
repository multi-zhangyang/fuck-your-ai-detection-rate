import type {
  DeleteHistoryOptions,
  DeleteHistoryResult,
  DocumentStatus,
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

export type LoadLatestRoundSnapshotOptions = {
  historyItems?: import("@/types/app").HistoryDocumentSummary[];
  historyItem?: import("@/types/app").HistoryDocumentSummary | null;
  allowProfileFallback?: boolean;
};
