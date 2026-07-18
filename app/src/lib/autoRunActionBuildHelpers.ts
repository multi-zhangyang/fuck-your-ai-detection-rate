import type {
  ManualInterventionAction,
  PendingAutoNextRoundAction,
  PendingAutoRetryAction,
} from "@/lib/autoRunTypes";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";

export function buildManualInterventionAction(input: {
  sourcePath: string;
  round: number;
  scopeKey: string;
  attempts: number;
  reason: string;
  maxAttempts: number;
  nowMs?: number;
}): ManualInterventionAction {
  return {
    id: `manual:${input.scopeKey}:${input.nowMs ?? Date.now()}`,
    kind: "manual-intervention",
    sourcePath: input.sourcePath,
    scopeKey: input.scopeKey,
    round: input.round,
    attempts: input.attempts,
    maxAttempts: input.maxAttempts,
    reason: input.reason,
    createdAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}

export function buildAutoRetryAction(input: {
  sourcePath: string;
  round: number;
  scopeKey: string;
  attempt: number;
  maxAttempts: number;
  delaySeconds: number;
  reason: string;
  nowMs?: number;
}): PendingAutoRetryAction {
  return {
    id: `retry:${input.scopeKey}:${input.attempt}:${input.nowMs ?? Date.now()}`,
    kind: "retry",
    sourcePath: input.sourcePath,
    scopeKey: input.scopeKey,
    round: input.round,
    secondsRemaining: input.delaySeconds,
    delaySeconds: input.delaySeconds,
    attempt: input.attempt,
    maxAttempts: input.maxAttempts,
    reason: input.reason,
    createdAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}

export function buildAutoNextRoundAction(input: {
  sourcePath: string;
  scopeKey: string;
  round: number;
  completedRound: number;
  delaySeconds: number;
  rateAuditApproval: RateAuditAutoNextApproval;
  nowMs?: number;
}): PendingAutoNextRoundAction {
  return {
    id: `next-round:${input.scopeKey}:${input.nowMs ?? Date.now()}`,
    kind: "next-round",
    sourcePath: input.sourcePath,
    scopeKey: input.scopeKey,
    round: input.round,
    secondsRemaining: input.delaySeconds,
    delaySeconds: input.delaySeconds,
    completedRound: input.completedRound,
    rateAuditApproval: input.rateAuditApproval,
    createdAt: new Date(input.nowMs ?? Date.now()).toISOString(),
  };
}
