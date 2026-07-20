import type { AppService } from "@/lib/appService";
import type { HistoryListRefreshResult } from "@/lib/historyHandlerInputTypes";
import type { ProgressUnlisten, RunSession } from "@/hooks/useRunSession";
import type {
  ClassifiedRunFailure,
  FinalizeFailedRoundInput,
} from "@/lib/runRoundPrep";
import type {
  OptionalUiFeedback,
  TaskPhase,
  TaskTicket,
} from "@/lib/runRoundInputTypes";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type { RoundArtifactSnapshotIntentRef } from "@/lib/roundArtifactSnapshot";
import type {
  DocumentStatus,
  BatchRerunFailure,
  ExportResult,
  HistoryDocumentSummary,
  ModelConfig,
  OutputPreview,
  PromptOption,
  PromptWorkflow,
  ReviewDecision,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
  RoundResult,
} from "@/types/app";

export type RunRoundHandlersDeps = {
  service: AppService;
  roundArtifactSnapshotIntentRef: RoundArtifactSnapshotIntentRef;
  getModelConfig: () => ModelConfig;
  getDocumentStatus: () => DocumentStatus | null;
  getPromptOptions: () => PromptOption[];
  getPromptWorkflows: () => PromptWorkflow[];
  getHistoryItems: () => HistoryDocumentSummary[];
  getRoundProgressStatus: () => RoundProgressStatus | null;
  getActiveCompareData: () => RoundCompareData | null;
  getLatestModelConfig: () => ModelConfig | null;
  getRunning: () => boolean;
  getCurrentRunToken: () => string | null;
  getRunSession: () => RunSession | null;
  getAttachedRunToken: () => string | null;
  getVisibleProgress: () => RoundProgress | null;
  getLiveCompare: () => RoundCompareData | null;
  getRoundProgressRequestId: () => number;
  getCurrentTaskTicket: () => number;
  setLatestModelConfig: (config: ModelConfig | null) => void;
  setAttachedRunToken: (token: string | null) => void;
  setVisibleProgress: (progress: RoundProgress | null) => void;
  setLiveCompare: (compare: RoundCompareData | null) => void;
  setRoundProgressRequestId: (id: number) => void;
  setModelConfig: (config: ModelConfig) => void;
  setProgress: (progress: RoundProgress | null) => void;
  setRoundResult: (result: RoundResult | null) => void;
  setPreview: (preview: OutputPreview | null) => void;
  setCompareData: (compare: RoundCompareData | null) => void;
  setReviewDecisions: (
    value: Record<string, ReviewDecision> | ((current: Record<string, ReviewDecision>) => Record<string, ReviewDecision>),
  ) => void;
  setRerunFailures: (failures: BatchRerunFailure[]) => void;
  setLastExportResult: (result: ExportResult | null) => void;
  setRoundProgressStatus: (status: RoundProgressStatus | null) => void;
  setHistoryPanelOpen: (open: boolean) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  transitionTask: (ticket: number, phase: TaskPhase, options?: { globalBusy?: boolean; runtimeStep?: string }) => boolean;
  applyOptionalUiFeedback: (feedback: OptionalUiFeedback) => void;
  beginRunSession: (input: {
    runId: string;
    sourcePath: string;
    round: number;
    taskTicket: number;
    mode: "start" | "attach";
  }) => RunSession;
  clearRunSession: (session: RunSession | null) => void;
  isActiveRunSession: (session: RunSession | null) => boolean;
  markRunSessionCancelRequested: (session: RunSession) => void;
  isRunSessionCancelRequested: (session: RunSession | null) => boolean;
  releaseProgressListener: () => Promise<void>;
  setProgressUnlisten: (unlisten: ProgressUnlisten | null) => void;
  clearPendingAutoActionForSource: (sourcePath: string | null | undefined) => void;
  clearAutoRetryScope: (scopeKey: string | null | undefined) => void;
  scheduleFailureAutoRetryAfterRefresh: (
    input: FinalizeFailedRoundInput,
    runMessage: string,
    userCanceled: boolean,
    failure: ClassifiedRunFailure,
  ) => Promise<void>;
  scheduleAutoNextRound: (
    status: DocumentStatus,
    completedRound: number,
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
    rateAuditApproval: RateAuditAutoNextApproval,
  ) => void;
  clearAutoSnapshotSuppression: () => void;
  clearDocumentDerivedState: () => void;
  flushReviewDecisionSaves: (outputPath?: string) => Promise<boolean>;
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  refreshHistoryList: () => Promise<HistoryListRefreshResult>;
  loadCompletedRoundArtifacts: (result: RoundResult) => Promise<void>;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  commitUi: (callback: () => void) => void;
};
