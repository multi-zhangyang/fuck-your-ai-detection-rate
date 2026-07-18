import type { DocumentStatus, ModelConfig } from "@/types/app";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";

export type PendingAutoActionBase = {
  id: string;
  sourcePath: string;
  scopeKey: string;
  round: number;
  createdAt: string;
};

export type PendingAutoRetryAction = PendingAutoActionBase & {
  kind: "retry";
  secondsRemaining: number;
  delaySeconds: number;
  attempt: number;
  maxAttempts: number;
  reason: string;
};

export type PendingAutoNextRoundAction = PendingAutoActionBase & {
  kind: "next-round";
  secondsRemaining: number;
  delaySeconds: number;
  completedRound: number;
  rateAuditApproval: RateAuditAutoNextApproval;
};

export type ManualInterventionAction = PendingAutoActionBase & {
  kind: "manual-intervention";
  attempts: number;
  maxAttempts: number;
  reason: string;
};

export type PendingAutoAction = PendingAutoRetryAction | PendingAutoNextRoundAction | ManualInterventionAction;

export type PendingAutoActionGuardResult =
  | { type: "noop" }
  | { type: "defer-running" }
  | { type: "manual-document-switched" }
  | { type: "cancel"; notice: string }
  | { type: "launch"; notice: string };

export type PendingAutoActionPlan =
  | { type: "noop" }
  | { type: "defer-running" }
  | {
    type: "manual-intervention";
    sourcePath: string;
    round: number;
    scopeKey: string;
    attempts: number;
    reason: string;
  }
  | { type: "cancel"; notice: string }
  | { type: "launch"; notice: string };
