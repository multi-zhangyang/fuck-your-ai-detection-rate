import {
  DEFAULT_PROMPT_SEQUENCE,
  formatPromptSequence as formatPromptSequenceFromRegistry,
  getPromptFlowSequence,
  getPromptProfileLabel,
  isPromptSequenceCustomizable,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import type {
  DeleteHistoryOptions,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function getMaxRounds(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number {
  return getPlannedRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
}

export function getPlannedRounds(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number {
  return getPromptFlowSequence(promptProfile, promptSequence, promptOptions, promptWorkflows).length;
}

export function getRoundStateText(completedRounds: number[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  const plannedRounds = getPlannedRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  const plannedDone = completedRounds.filter((round) => round <= plannedRounds).length;
  if (plannedDone < plannedRounds) {
    return `${plannedDone}/${plannedRounds} 轮`;
  }
  return "可导出";
}

export function getProfileLabel(promptProfile: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return getPromptProfileLabel(promptProfile, promptWorkflows);
}

export function formatPromptSequence(value: PromptId[] | undefined, promptOptions?: PromptOption[], promptProfile?: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return formatPromptSequenceFromRegistry(value ?? DEFAULT_PROMPT_SEQUENCE, promptOptions, promptProfile, promptWorkflows);
}

export function promptSequencesEqual(
  left: PromptId[] | undefined,
  right: PromptId[] | undefined,
  promptOptions?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const a = normalizePromptSequence(left, promptOptions, promptProfile, promptWorkflows);
  const b = normalizePromptSequence(right, promptOptions, promptProfile, promptWorkflows);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

export function getRoundsForProfile(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): HistoryRound[] {
  return rounds.filter((round) => {
    if ((round.promptProfile || "cn") !== promptProfile) {
      return false;
    }
    if (!isPromptSequenceCustomizable(promptProfile, promptWorkflows)) {
      return true;
    }
    return promptSequencesEqual(round.promptSequence, promptSequence, promptOptions, promptProfile, promptWorkflows);
  });
}

export function getCompletedRounds(rounds: HistoryRound[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number[] {
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  return Array.from(new Set(rounds.map((item) => item.round).filter((round) => round >= 1 && round <= maxRounds))).sort(
    (left, right) => left - right,
  );
}

export function getNextRoundText(completedRounds: number[], promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  for (let round = 1; round <= maxRounds; round += 1) {
    if (!completedRounds.includes(round)) {
      return `第 ${round} 轮`;
    }
  }
  return "可导出";
}

export function getPromptOptions(promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[], promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): Pick<DeleteHistoryOptions, "promptProfile" | "promptSequence"> {
  return {
    promptProfile,
    promptSequence: isPromptSequenceCustomizable(promptProfile, promptWorkflows) ? normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows) : undefined,
  };
}
