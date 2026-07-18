import type { RunSession } from "@/hooks/useRunSession";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type { TaskPhase as RealTaskPhase } from "@/lib/taskState";
import type {
  FinalizeFailedRoundInput,
  ReadyRunLaunchPrepared,
} from "@/lib/runRoundPrep";
import type {
  DocumentStatus,
  EnvironmentDiagnostics,
  HistoryDocumentSummary,
  ModelConfig,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export type TaskTicket = number;
export type TaskPhase = RealTaskPhase;

export type PrepareRunLaunchInput = {
  documentStatus: DocumentStatus;
  configOverride?: ModelConfig;
};

export type FinalizeCompletedRoundInput = {
  result: RoundResult;
  sourcePath: string;
  config: ModelConfig;
  clearAutoSnapshot?: boolean;
};

export type CompleteSuccessfulRoundUiInput = {
  result: RoundResult;
  sourcePath: string;
  config: ModelConfig;
};

export type AwaitAttachedActiveRunInput = {
  activeRun: EnvironmentDiagnostics["activeRuns"][number];
  runSession: RunSession | null;
};

export type StartAndListenRunRoundInput = {
  prepared: ReadyRunLaunchPrepared;
  taskTicket: number;
  autoNextApproval?: RateAuditAutoNextApproval;
};

export type StartAndListenRunRoundResult = {
  runSession: RunSession;
  runToken: string;
};

export type StartedRunRoundHandle = StartAndListenRunRoundResult;

export type AwaitStartedRunRoundInput = {
  runSession: RunSession | null;
  sourcePath: string;
  config: ModelConfig;
  runToken: string;
};

export type SeedAndListenAttachedRunInput = {
  activeRun: EnvironmentDiagnostics["activeRuns"][number];
  status: DocumentStatus;
  runRound: number;
  taskTicket: number;
};

export type AttachRoundProgressListenerInput = {
  runSession: RunSession | null;
  runToken: string;
  liveCompareSeed: RoundCompareData;
  runtimeFallback: string;
};

export type LoadLatestRoundSnapshotOptions = {
  historyItems?: HistoryDocumentSummary[];
  historyItem?: HistoryDocumentSummary | null;
  allowProfileFallback?: boolean;
};

export type OptionalUiFeedback = {
  notice?: string;
  setError?: string;
  runtimeStep?: string;
  clearMessages?: boolean;
};

export type { ExecuteRoundResetInput } from "@/lib/documentStatusCopy";
export type { ApplySelectedRoundSnapshotInput } from "@/lib/roundResultHelpers";
export type {
  ClassifiedRunFailure,
  FinalizeFailedRoundInput,
  PrepareRunLaunchResult,
  ReadyRunLaunchPrepared,
} from "@/lib/runRoundPrep";
