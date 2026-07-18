import { getPlannedRoundCount } from "@/lib/historyHelpers";
import { sameWorkspacePath } from "@/lib/documentPaths";
import { promptSequencesEqual } from "@/lib/modelRoute";
import { getPromptProfileLabel } from "@/lib/promptRegistry";
import type { DocumentStatus, ModelConfig, PromptOption, PromptWorkflow, RoundProgressStatus } from "@/types/app";

export type RoundResetTarget = {
  round: number;
  mode: "checkpoint" | "completed";
};

export function describePromptProfile(promptProfile: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return getPromptProfileLabel(promptProfile, promptWorkflows);
}

export function isManualContinuationRound(status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): boolean {
  return Boolean(status.hasNextRound && status.nextRound && status.nextRound > getPlannedRoundCount(config, promptOptions, promptWorkflows));
}

export function getRoundResetTarget(
  status: DocumentStatus | null,
  checkpoint: RoundProgressStatus | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): RoundResetTarget | null {
  if (!status) {
    return null;
  }
  const checkpointMatches = Boolean(
    checkpoint?.canResume
    && checkpoint.round
    && status.nextRound
    && checkpoint.round === status.nextRound
    && sameWorkspacePath(checkpoint.sourcePath, status.sourcePath)
    && checkpoint.promptProfile === status.promptProfile
    && promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows),
  );
  if (checkpointMatches && checkpoint?.round) {
    return { round: checkpoint.round, mode: "checkpoint" };
  }
  const completedRounds = (status.completedRounds ?? [])
    .filter((round): round is number => Number.isFinite(round))
    .sort((left, right) => left - right);
  const latestCompletedRound = completedRounds[completedRounds.length - 1];
  if (latestCompletedRound) {
    return { round: latestCompletedRound, mode: "completed" };
  }
  return status.nextRound ? { round: status.nextRound, mode: "checkpoint" } : null;
}

export function describeDocumentProgress(status: Pick<DocumentStatus, "nextRound" | "hasNextRound" | "plannedRounds">, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    const plannedRounds = status.plannedRounds ?? getPlannedRoundCount(config, promptOptions, promptWorkflows);
    if (status.nextRound > plannedRounds) {
      return "流程已完成，可导出。";
    }
    return status.nextRound > 1 ? `可继续第 ${status.nextRound} 轮。` : `可执行第 ${status.nextRound} 轮。`;
  }
  return "流程已完成，可导出。";
}

export function formatDocumentLoadStep(prefix: string, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  return `${prefix}；${describeDocumentProgress(status, config, promptOptions, promptWorkflows)}`;
}

export function formatRoundCompleteStep(round: number, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    return isManualContinuationRound(status, config, promptOptions, promptWorkflows)
      ? `第 ${round} 轮已完成，可导出。`
      : `第 ${round} 轮已完成，可继续第 ${status.nextRound} 轮。`;
  }
  return `第 ${round} 轮已完成，可导出。`;
}

export function formatRoundCompleteNotice(round: number, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    return isManualContinuationRound(status, config, promptOptions, promptWorkflows)
      ? `第 ${round} 轮已完成，可以直接导出。`
      : `第 ${round} 轮已完成，可继续第 ${status.nextRound} 轮。`;
  }
  return `第 ${round} 轮已完成，可以直接导出。`;
}
