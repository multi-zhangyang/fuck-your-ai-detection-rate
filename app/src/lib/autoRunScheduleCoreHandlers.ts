import {
  buildAutoNextRoundSchedule,
  resolveAutoRetryPlan,
} from "@/lib/autoRun";
import { getAutoRunScopeKey } from "@/lib/autoRunScope";
import {
  planFailureAutoRetrySchedule,
  type MaybeScheduleFailureAutoRetryInput,
} from "@/lib/runRoundPrep";
import {
  AUTO_NEXT_ROUND_DELAY_SECONDS,
  AUTO_RUN_RETRY_DELAY_SECONDS,
  AUTO_RUN_RETRY_MAX_ATTEMPTS,
} from "@/lib/storageKeys";
import type {
  AutoRunHandlersDeps,
  ScheduleAutoRetryInput,
} from "@/lib/autoRunHandlerTypes";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export function createAutoRunScheduleCoreHandlers(deps: AutoRunHandlersDeps) {
  function scheduleAutoRetry(input: ScheduleAutoRetryInput) {
    const scopeKey = getAutoRunScopeKey(input.sourcePath, input.config, input.round);
    const plan = resolveAutoRetryPlan({
      sourcePath: input.sourcePath,
      round: input.round,
      config: input.config,
      reason: input.reason,
      currentAttemptCount: deps.getAutoRetryCounts()[scopeKey] ?? 0,
      maxAttempts: AUTO_RUN_RETRY_MAX_ATTEMPTS,
      delaySeconds: AUTO_RUN_RETRY_DELAY_SECONDS,
    });
    if (plan.type !== "manual") {
      deps.setAutoRetryCounts({ ...deps.getAutoRetryCounts(), [plan.scopeKey]: plan.attempt });
    }
    deps.setPendingAutoAction(plan.action);
    deps.setNotice(plan.notice);
  }

  function maybeScheduleFailureAutoRetry(input: MaybeScheduleFailureAutoRetryInput) {
    const plan = planFailureAutoRetrySchedule(input);
    if (plan.kind !== "schedule") return;
    scheduleAutoRetry({
      sourcePath: plan.sourcePath,
      round: plan.round,
      config: plan.config,
      reason: plan.reason,
    });
  }

  function scheduleAutoNextRound(
    status: DocumentStatus,
    completedRound: number,
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
    rateAuditApproval: RateAuditAutoNextApproval,
  ) {
    const scheduled = buildAutoNextRoundSchedule({
      status,
      completedRound,
      config,
      delaySeconds: AUTO_NEXT_ROUND_DELAY_SECONDS,
      rateAuditApproval,
      promptOptions: deps.getPromptOptions(),
      promptWorkflows: deps.getPromptWorkflows(),
    });
    if (!scheduled) return;
    deps.setPendingAutoAction(scheduled.action);
    deps.setNotice(scheduled.notice);
  }

  return {
    scheduleAutoRetry,
    maybeScheduleFailureAutoRetry,
    scheduleAutoNextRound,
  };
}
