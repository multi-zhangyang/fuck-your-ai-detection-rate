import {
  ACTIVE_PROMPT_PROFILE,
  DEFAULT_PROMPT_SEQUENCE_LIMIT,
  DEFAULT_PROMPT_WORKFLOWS,
} from "@/lib/promptRegistryDefaults";
import type {
  PromptProfile,
  PromptWorkflow,
} from "@/types/app";

function getWorkflowCandidates(workflows?: PromptWorkflow[]): PromptWorkflow[] {
  return workflows?.length ? workflows : DEFAULT_PROMPT_WORKFLOWS;
}

function getFallbackWorkflow(workflows?: PromptWorkflow[]): PromptWorkflow {
  const candidates = getWorkflowCandidates(workflows);
  return candidates.find((item) => item.id === ACTIVE_PROMPT_PROFILE)
    ?? candidates.find((item) => item.visible !== false && !item.legacy)
    ?? candidates[0]
    ?? DEFAULT_PROMPT_WORKFLOWS[0];
}

export function getEditablePromptWorkflows(workflows?: PromptWorkflow[]): PromptWorkflow[] {
  const candidates = getWorkflowCandidates(workflows);
  const editable = candidates.filter((item) => item.visible !== false && !item.legacy && item.customizable);
  return editable.length ? editable : candidates.filter((item) => item.visible !== false && !item.legacy);
}

export function getDefaultPromptProfile(workflows?: PromptWorkflow[]): PromptProfile {
  return getEditablePromptWorkflows(workflows)[0]?.id ?? getFallbackWorkflow(workflows).id;
}

export function getPromptWorkflow(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): PromptWorkflow {
  const normalizedId = String(promptProfile || getDefaultPromptProfile(workflows)).trim().toLowerCase();
  const candidates = getWorkflowCandidates(workflows);
  return candidates.find((item) => item.id === normalizedId) ?? getFallbackWorkflow(candidates);
}

export function normalizePromptProfile(value: unknown, workflows?: PromptWorkflow[]): PromptProfile | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return getWorkflowCandidates(workflows).some((item) => item.id === normalized) ? normalized : null;
}

export function isPromptSequenceCustomizable(promptProfile: PromptProfile | undefined, workflows?: PromptWorkflow[]): boolean {
  return getPromptWorkflow(promptProfile, workflows).customizable;
}

export function getPromptSequenceLimit(promptProfile: PromptProfile | undefined = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): number {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  return Math.max(1, Number(workflow.sequenceLimit || workflow.defaultSequence.length || DEFAULT_PROMPT_SEQUENCE_LIMIT));
}

export function getPromptRoundLimit(promptProfile: PromptProfile | undefined = ACTIVE_PROMPT_PROFILE, workflows?: PromptWorkflow[]): number {
  const workflow = getPromptWorkflow(promptProfile, workflows);
  const sequenceLimit = Math.max(1, Number(workflow.sequenceLimit || workflow.defaultSequence.length || DEFAULT_PROMPT_SEQUENCE_LIMIT));
  return Math.max(sequenceLimit, Number(workflow.roundLimit || sequenceLimit));
}
