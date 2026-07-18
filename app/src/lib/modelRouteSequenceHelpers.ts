import type { PromptId, PromptOption } from "@/types/app";

export function withSequenceRound(activeSequence: PromptId[], roundIndex: number, promptId: PromptId): PromptId[] {
  return activeSequence.map((item, index) => (index === roundIndex ? promptId : item));
}

export function withSequenceLength(input: {
  activeSequence: PromptId[];
  activeFlowSequence: PromptId[];
  length: number;
  sequenceLengthLimit: number;
  promptSelectOptions: Array<Pick<PromptOption, "id">>;
}): PromptId[] {
  const fallback = input.activeSequence[input.activeSequence.length - 1] ?? input.promptSelectOptions[0]?.id ?? "round1";
  const nextLength = Math.max(1, Math.min(input.sequenceLengthLimit, input.length));
  return Array.from({ length: nextLength }, (_, index) => input.activeSequence[index] ?? input.activeFlowSequence[index] ?? fallback);
}
