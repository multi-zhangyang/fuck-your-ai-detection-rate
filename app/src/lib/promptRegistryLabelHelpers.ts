import {
  ACTIVE_PROMPT_PROFILE,
  DEFAULT_PROMPT_OPTIONS,
} from "@/lib/promptRegistryDefaults";
import {
  getPromptWorkflow,
  normalizePromptId,
  normalizePromptSequence,
} from "@/lib/promptRegistryWorkflowHelpers";
import type {
  PromptId,
  PromptOption,
  PromptProfile,
  PromptWorkflow,
} from "@/types/app";

export function getPromptProfileLabel(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): string {
  return getPromptWorkflow(promptProfile, workflows).label;
}

export function getPromptOption(promptId: PromptId, options?: PromptOption[]): PromptOption | undefined {
  const normalizedId = normalizePromptId(promptId) ?? promptId;
  return (options ?? DEFAULT_PROMPT_OPTIONS).find((item) => item.id === normalizedId);
}

export function getPromptLabel(promptId: PromptId, options?: PromptOption[]): string {
  return getPromptOption(promptId, options)?.label ?? promptId;
}

export function formatPromptSequence(sequence: PromptId[] | undefined, options?: PromptOption[], promptProfile: PromptProfile = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): string {
  return normalizePromptSequence(sequence, options, promptProfile, workflows).map((id) => getPromptLabel(id, options)).join(" → ");
}
