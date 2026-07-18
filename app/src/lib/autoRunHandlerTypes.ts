import type { PendingAutoAction, PendingAutoNextRoundAction, PendingAutoRetryAction } from "@/lib/autoRun";
import type { ClassifiedRunFailure, FinalizeFailedRoundInput, MaybeScheduleFailureAutoRetryInput } from "@/lib/runRoundPrep";
import type {
  RateAuditAutoNextApproval,
  RateAuditAutoNextGateResult,
} from "@/lib/rateAuditAutoNextGate";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
  RateAuditReport,
} from "@/types/app";

export type ScheduleAutoRetryInput = {
  sourcePath: string;
  round: number;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  reason: string;
};

export type RefreshStatusAfterFailedRoundInput = {
  sourcePath?: string | null;
  config: ModelConfig;
  refreshWithConfig?: boolean;
};

export type OptionalUiFeedback = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export type AutoRunHandlersDeps = {
  getModelConfig: () => ModelConfig;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getLatestModelConfig: () => ModelConfig | null;
  getLatestDocumentStatus: () => DocumentStatus | null;
  getPendingAutoActionId: () => string | undefined;
  getRunning: () => boolean;
  getAutoRetryCounts: () => Record<string, number>;
  setAutoRetryCounts: (counts: Record<string, number>) => void;
  setPendingAutoAction: (
    value: PendingAutoAction | null | ((current: PendingAutoAction | null) => PendingAutoAction | null),
  ) => void;
  setNotice: (notice: string) => void;
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  refreshHistoryList: () => Promise<HistoryDocumentSummary[]>;
  getRateAudit: (sourcePath: string, outputPath?: string) => Promise<RateAuditReport>;
  handleRunRound: (approval?: RateAuditAutoNextApproval) => Promise<void>;
};

export type AutoRunClearHandlers = {
  clearAutoRetryScope: (scopeKey: string | null | undefined) => void;
  clearPendingAutoActionWithNotice: (actionId: string, notice: string) => void;
  clearPendingAutoActionForSource: (sourcePath: string | null | undefined) => void;
  clearPendingAutoActionForManualContextChange: () => void;
};

export type AutoRunScheduleHandlers = {
  scheduleAutoRetry: (input: ScheduleAutoRetryInput) => void;
  maybeScheduleFailureAutoRetry: (input: MaybeScheduleFailureAutoRetryInput) => void;
  scheduleAutoNextRound: (
    status: DocumentStatus,
    completedRound: number,
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
    rateAuditApproval: RateAuditAutoNextApproval,
  ) => void;
  refreshDocumentStateForFailedRound: (input: RefreshStatusAfterFailedRoundInput) => Promise<DocumentStatus | null>;
  scheduleFailureAutoRetryAfterRefresh: (
    input: FinalizeFailedRoundInput,
    runMessage: string,
    userCanceled: boolean,
    failure: ClassifiedRunFailure,
  ) => Promise<void>;
};

export type AutoRunPerformHandlers = {
  buildPendingAutoActionGuard: (
    action: PendingAutoRetryAction | PendingAutoNextRoundAction,
    activeConfig: ModelConfig,
    refreshedStatus: DocumentStatus | null,
  ) => unknown;
  resolveCurrentPendingAutoActionPlan: (
    action: PendingAutoRetryAction | PendingAutoNextRoundAction,
  ) => Promise<unknown>;
  performRevalidatedAutoNextRound: (
    action: PendingAutoNextRoundAction,
  ) => Promise<RateAuditAutoNextGateResult>;
  performPendingAutoAction: (action: PendingAutoRetryAction | PendingAutoNextRoundAction) => Promise<void>;
};
