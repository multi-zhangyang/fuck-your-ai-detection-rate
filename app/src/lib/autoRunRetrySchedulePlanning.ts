import { getAutoRunScopeKey } from "@/lib/autoRunScope";
import { isManualContinuationRound } from "@/lib/documentStatusCopy";
import {
  buildAutoNextRoundAction,
  buildAutoNextRoundNotice,
  buildAutoRetryAction,
  buildAutoRetryNotice,
  buildManualInterventionAction,
  buildManualInterventionNotice,
} from "@/lib/autoRunActionBuilders";
import type {
  ManualInterventionAction,
  PendingAutoNextRoundAction,
  PendingAutoRetryAction,
} from "@/lib/autoRunTypes";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type { DocumentStatus, ModelConfig, PromptOption, PromptWorkflow } from "@/types/app";

export function shouldScheduleAutoNextRound(
  status: DocumentStatus,
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  if (!status.hasNextRound || !status.nextRound) {
    return false;
  }
  return !isManualContinuationRound(status, config, promptOptions, promptWorkflows);
}

export function buildAutoNextRoundSchedule(input: {
  status: DocumentStatus;
  completedRound: number;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  delaySeconds: number;
  rateAuditApproval: RateAuditAutoNextApproval;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  nowMs?: number;
}): { action: PendingAutoNextRoundAction; notice: string } | null {
  if (!shouldScheduleAutoNextRound(input.status, input.config, input.promptOptions, input.promptWorkflows)) {
    return null;
  }
  const nextRound = input.status.nextRound!;
  const scopeKey = getAutoRunScopeKey(input.status.sourcePath, input.config, nextRound);
  const action = buildAutoNextRoundAction({
    sourcePath: input.status.sourcePath,
    scopeKey,
    round: nextRound,
    completedRound: input.completedRound,
    delaySeconds: input.delaySeconds,
    rateAuditApproval: input.rateAuditApproval,
    nowMs: input.nowMs,
  });
  return {
    action,
    notice: `${buildAutoNextRoundNotice(input.completedRound, input.delaySeconds, nextRound)} RateAudit 已批准提示词“${input.rateAuditApproval.recommendedPromptId}”。`,
  };
}

export function resolveAutoRetryPlan(input: {
  sourcePath: string;
  round: number;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  reason: string;
  currentAttemptCount: number;
  maxAttempts: number;
  delaySeconds: number;
  nowMs?: number;
}):
  | { type: "retry"; attempt: number; action: PendingAutoRetryAction; notice: string; scopeKey: string }
  | { type: "manual"; attempts: number; action: ManualInterventionAction; notice: string; scopeKey: string } {
  const scopeKey = getAutoRunScopeKey(input.sourcePath, input.config, input.round);
  const nextAttempt = input.currentAttemptCount + 1;
  if (nextAttempt > input.maxAttempts) {
    const action = buildManualInterventionAction({
      sourcePath: input.sourcePath,
      round: input.round,
      scopeKey,
      attempts: input.maxAttempts,
      reason: input.reason,
      maxAttempts: input.maxAttempts,
      nowMs: input.nowMs,
    });
    return {
      type: "manual",
      attempts: input.maxAttempts,
      action,
      notice: buildManualInterventionNotice(input.round, input.maxAttempts, input.maxAttempts),
      scopeKey,
    };
  }
  const action = buildAutoRetryAction({
    sourcePath: input.sourcePath,
    round: input.round,
    scopeKey,
    attempt: nextAttempt,
    maxAttempts: input.maxAttempts,
    delaySeconds: input.delaySeconds,
    reason: input.reason,
    nowMs: input.nowMs,
  });
  return {
    type: "retry",
    attempt: nextAttempt,
    action,
    notice: buildAutoRetryNotice(input.round, input.delaySeconds, nextAttempt, input.maxAttempts),
    scopeKey,
  };
}
