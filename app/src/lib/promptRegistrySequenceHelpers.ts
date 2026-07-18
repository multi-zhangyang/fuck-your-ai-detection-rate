import {
  ACTIVE_PROMPT_PROFILE,
  DEFAULT_PROMPT_OPTIONS,
  DEFAULT_PROMPT_SEQUENCE,
} from "@/lib/promptRegistryDefaults";
import { normalizePromptId } from "@/lib/promptRegistryPreviewHelpers";
import {
  getPromptRoundLimit,
  getPromptSequenceLimit,
  getPromptWorkflow,
} from "@/lib/promptRegistryResolveHelpers";
import type {
  PromptId,
  PromptOption,
  PromptProfile,
  PromptWorkflow,
} from "@/types/app";

export function normalizePromptSequence(value: unknown, options?: PromptOption[], promptProfile: PromptProfile = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): PromptId[] {
  const rawItems = Array.isArray(value) ? value : [];
  const optionIds = new Set((options ?? DEFAULT_PROMPT_OPTIONS).map((item) => item.id));
  const normalized = rawItems
    .map((item) => normalizePromptId(item))
    .filter((item): item is PromptId => item !== null)
    .filter((item) => !optionIds.size || optionIds.has(item));
  const workflow = getPromptWorkflow(promptProfile, workflows);
  const fallback = workflow.defaultSequence?.length ? workflow.defaultSequence : DEFAULT_PROMPT_SEQUENCE;
  const sequence = normalized.length ? normalized : fallback;
  const limit = workflow.customizable ? getPromptRoundLimit(promptProfile, workflows) : getPromptSequenceLimit(promptProfile, workflows);
  return sequence.slice(0, limit);
}

export function getPromptFlowSequence(promptProfile: PromptProfile, promptSequence?: PromptId[], options?: PromptOption[], workflows?: PromptWorkflow[]): PromptId[] {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  if (!workflow.customizable) {
    return workflow.defaultSequence;
  }
  return normalizePromptSequence(promptSequence, options, workflow.id, workflows);
}

export function getRoundModelKey(promptProfile: PromptProfile, round?: number | null, workflows?: PromptWorkflow[]): string | null {
  if (!round || round < 1 || round > getPromptRoundLimit(promptProfile, workflows)) {
    return null;
  }
  return `${getPromptWorkflow(promptProfile, workflows).id}:${round}`;
}

export function getPromptIdForRound(promptProfile: PromptProfile, round: number, promptSequence?: PromptId[], options?: PromptOption[], workflows?: PromptWorkflow[]): PromptId {
  const sequence = getPromptFlowSequence(promptProfile, promptSequence, options, workflows);
  if (round < 1 || round > sequence.length) {
    throw new Error(`Round ${round} is outside the selected ${sequence.length} round prompt workflow.`);
  }
  return sequence[round - 1] ?? DEFAULT_PROMPT_SEQUENCE[0];
}
