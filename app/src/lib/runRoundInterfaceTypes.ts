import type { RunSession } from "@/hooks/useRunSession";
import type { ExecuteRoundResetInput } from "@/lib/documentStatusCopy";
import type { AutoSnapshotLoadedSnapshot } from "@/lib/autoSnapshotRestoreSessionHelpers";
import type { ApplySelectedRoundSnapshotInput } from "@/lib/roundResultHelpers";
import type { ClassifiedRunFailure, FinalizeFailedRoundInput } from "@/lib/runRoundPrep";
import type {
  AttachRoundProgressListenerInput,
  CompleteSuccessfulRoundUiInput,
  FinalizeCompletedRoundInput,
  LoadLatestRoundSnapshotOptions,
} from "@/lib/runRoundInputTypes";
import type {
  DocumentStatus,
  ModelConfig,
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundProgressStatus,
  RoundResult,
} from "@/types/app";

export type RunRoundProgressHandlers = {
  beginRoundProgressRequest: () => number;
  isCurrentRoundProgressRequest: (requestId: number) => boolean;
  commitRoundProgressStatus: (requestId: number, nextStatus: RoundProgressStatus | null) => void;
  refreshRoundProgressStatus: (
    status?: DocumentStatus | null,
    config?: ModelConfig,
  ) => Promise<RoundProgressStatus | null>;
  attachRoundProgressListener: (input: AttachRoundProgressListenerInput) => Promise<void>;
  mergeActiveRunProgressSnapshot: (input: { runSession: RunSession | null; runToken: string }) => Promise<void>;
  clearActiveRunProgressUi: (runSession: RunSession | null) => Promise<void>;
};

export type RunRoundFinishHandlers = {
  applyClassifiedRunFailure: (
    runMessage: string,
    userCanceled: boolean,
    mode: FinalizeFailedRoundInput["mode"],
  ) => ClassifiedRunFailure;
  finalizeFailedRound: (input: FinalizeFailedRoundInput) => Promise<void>;
  scheduleAfterSuccessfulRound: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  applySuccessfulRoundCompletionFeedback: (
    resultRound: number,
    status: DocumentStatus,
    config: ModelConfig,
    sourcePath: string,
    outputPath: string,
  ) => Promise<void>;
  completeSuccessfulRoundUi: (input: CompleteSuccessfulRoundUiInput) => Promise<DocumentStatus>;
  finalizeCompletedRound: (input: FinalizeCompletedRoundInput) => Promise<DocumentStatus>;
  resolveCancelableRunSession: () => RunSession | null;
  applyCancelRequestedUi: (runSession: RunSession) => void;
  handleCancelRunRound: () => Promise<void>;
  performRoundReset: (input: ExecuteRoundResetInput) => Promise<void>;
  resolveConfirmedRoundResetInput: () => { documentStatus: DocumentStatus; resetTarget: import("@/lib/documentStatusCopy").RoundResetTarget } | null;
  executeRoundReset: (input: ExecuteRoundResetInput) => Promise<void>;
  handleResetCurrentRound: () => Promise<void>;
  applyLoadedRoundSnapshotUi: (input: {
    outputPreview: OutputPreview;
    nextCompareData: RoundCompareData;
    savedReviewDecisions: Record<string, ReviewDecision>;
    roundResult: RoundResult;
  }) => void;
  fetchCompleteRoundSnapshot: (outputPath: string) => Promise<{
    artifactSnapshot: import("@/types/app").RoundArtifactSnapshot;
    outputPreview: OutputPreview;
    nextCompareData: RoundCompareData;
    savedReview: { decisions: Record<string, ReviewDecision> };
  }>;
  applySelectedRoundSnapshot: (selection: ApplySelectedRoundSnapshotInput) => Promise<AutoSnapshotLoadedSnapshot | null>;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: LoadLatestRoundSnapshotOptions,
  ) => Promise<AutoSnapshotLoadedSnapshot | null>;
  loadRoundSnapshotByOutputPath: (outputPath: string) => Promise<RoundCompareData | null>;
};
