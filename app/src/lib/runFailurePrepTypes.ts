import type { RunSession } from "@/hooks/useRunSession";
import type {
  DocumentStatus,
  ModelConfig,
} from "@/types/app";

export type FailedRoundMode = "start" | "attach";

export type ClassifiedRunFailure = {
  interrupted: boolean;
  resumable: boolean;
  userCanceled: boolean;
  errorText: string;
  runtimeStep: string;
  noticeText?: string;
};

export type FinalizeFailedRoundInput = {
  appError: unknown;
  runSession: RunSession | null;
  mode: FailedRoundMode;
  sourcePath?: string | null;
  config: ModelConfig;
  launchNextRound?: number | null;
  attachFallbackRound?: number | null;
  refreshWithConfig?: boolean;
};

export type BuildStartRoundFailureInput = {
  appError: unknown;
  runSession: RunSession | null;
  launchStatus?: DocumentStatus | null;
  runConfig: ModelConfig;
};

export type BuildAttachRoundFailureInput = {
  appError: unknown;
  runSession: RunSession | null;
  activeRun: {
    sourcePath?: string | null;
    lastEvent?: { round?: number | null } | null;
  };
  config: ModelConfig;
};

export type MaybeScheduleFailureAutoRetryInput = {
  userCanceled: boolean;
  resumable: boolean;
  sourcePath?: string | null;
  launchNextRound?: number | null;
  mode: FailedRoundMode;
  runSession: RunSession | null;
  attachFallbackRound?: number | null;
  config: ModelConfig;
  reason: string;
  refreshedStatus: DocumentStatus | null;
};

export type BuildMaybeScheduleFailureAutoRetryArgs = {
  userCanceled: boolean;
  failure: ClassifiedRunFailure;
  runMessage: string;
  refreshedStatus: DocumentStatus | null;
  failedRound: FinalizeFailedRoundInput;
};

export type FailureAutoRetrySchedulePlan =
  | { kind: "skip" }
  | {
      kind: "schedule";
      sourcePath: string;
      round: number;
      config: ModelConfig;
      reason: string;
    };
