import type { AppService } from "@/lib/appService";
import type { BatchRerunSession } from "@/hooks/useRunSession";
import type { TaskPhase } from "@/lib/taskState";
import type { RoundArtifactSnapshotIntentRef } from "@/lib/roundArtifactSnapshot";
import type {
  BatchRerunFailure,
  BatchRerunResult,
  BatchRerunStatus,
  BatchRerunTarget,
  ExportResult,
  ModelConfig,
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export type TaskTicket = number;
export type { TaskPhase } from "@/lib/taskState";

export type OptionalUiFeedback = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export type MaterializeBatchRerunResultState = {
  failures: BatchRerunFailure[];
  latestCompare: RoundCompareData | null;
  applied: boolean;
};

export type BatchRerunHandlersDeps = {
  service: AppService;
  roundArtifactSnapshotIntentRef: RoundArtifactSnapshotIntentRef;
  getModelConfig: () => ModelConfig;
  getRoundResult: () => RoundResult | null;
  getActiveCompareData: () => RoundCompareData | null;
  getActiveRerunFailures: () => BatchRerunFailure[];
  getReviewDecisions: () => Record<string, ReviewDecision>;
  getActiveRerunFailureScopeKey: () => string | null;
  getCurrentBatchRerunToken: () => string | null;
  getBatchRerunSession: () => BatchRerunSession | null;
  setRoundResult: (result: RoundResult | null) => void;
  setCompareData: (compare: RoundCompareData | null) => void;
  setPreview: (preview: OutputPreview | null) => void;
  setLastExportResult: (result: ExportResult | null) => void;
  setRerunFailures: (
    value: BatchRerunFailure[] | ((current: BatchRerunFailure[]) => BatchRerunFailure[]),
  ) => void;
  setReviewDecisions: (
    value: Record<string, ReviewDecision> | ((current: Record<string, ReviewDecision>) => Record<string, ReviewDecision>),
  ) => void;
  setLiveCompareRef: (compare: RoundCompareData | null) => void;
  setError: (error: string) => void;
  setNotice: (notice: string) => void;
  setRuntimeStep: (step: string) => void;
  beginTask: (kind: TaskPhase, options?: { runtimeStep?: string; globalBusy?: boolean; clearMessages?: boolean }) => TaskTicket;
  finishTask: (ticket: TaskTicket) => void;
  transitionTask: (ticket: number, phase: TaskPhase, options?: { globalBusy?: boolean; runtimeStep?: string }) => boolean;
  applyErrorRuntimeStep: (error: unknown, fallback: string) => void;
  applyOptionalUiFeedback: (feedback: OptionalUiFeedback) => void;
  beginBatchRerunSession: (session: BatchRerunSession) => void;
  clearBatchRerunSession: (runId: string | null) => void;
  markBatchRerunCancelRequested: (runId: string) => void;
  commitUi: (callback: () => void) => void;
};

export type BatchRerunCoreHandlers = {
  upsertRerunFailure: (failure: BatchRerunFailure) => void;
  materializeBatchRerunResultState: (
    result: BatchRerunResult,
    targets: BatchRerunTarget[],
  ) => Promise<MaterializeBatchRerunResultState>;
  applyBatchRerunResult: (
    actionLabel: string,
    result: BatchRerunResult,
    targets: BatchRerunTarget[],
    suffix?: string,
  ) => Promise<void>;
  waitForBatchRerunResult: (runId: string, label: string) => Promise<BatchRerunStatus>;
  awaitAndApplyBatchRerunResult: (
    actionLabel: string,
    runId: string,
    targets: BatchRerunTarget[],
    suffix: string,
  ) => Promise<void>;
  finalizeAttachedBatchRerun: (runId: string, activeBatch: BatchRerunStatus) => Promise<void>;
};

export type BatchRerunActionHandlers = {
  applyBatchRerunCancelRequestedUi: (session: BatchRerunSession) => void;
  beginAttachActiveBatchRerunTask: (activeBatch: BatchRerunStatus) => number;
  attachActiveBatchRerun: (activeBatch: BatchRerunStatus) => Promise<void>;
  runBatchRerunTask: (
    actionLabel: string,
    outputPath: string,
    targets: BatchRerunTarget[],
    suffix?: string,
    modelConfigOverride?: ModelConfig,
  ) => Promise<void>;
  runPreparedBatchRerunTask: (
    actionLabel: string,
    targets: BatchRerunTarget[],
    startTask: () => Promise<string>,
    suffix?: string,
    options?: { rethrow?: boolean },
  ) => Promise<void>;
  handleRerunRiskyChunks: () => Promise<void>;
  handleCancelBatchRerun: () => Promise<void>;
};
