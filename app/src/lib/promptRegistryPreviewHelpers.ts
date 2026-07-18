import {
  DEFAULT_PROMPT_OPTIONS,
  DEFAULT_PROMPT_SEQUENCE_LIMIT,
  DEFAULT_PROMPT_WORKFLOWS,
} from "@/lib/promptRegistryDefaults";
import { normalizePromptSequence } from "@/lib/promptRegistrySequenceHelpers";
import type {
  PromptId,
  PromptOption,
  PromptPreviewResponse,
  PromptWorkflow,
} from "@/types/app";

const PROMPT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function normalizePromptId(value: unknown): PromptId | null {
  const promptId = String(value ?? "").trim().toLowerCase();
  return PROMPT_ID_PATTERN.test(promptId) ? promptId : null;
}

export function getPromptOptionsFromPreviews(value: PromptPreviewResponse | null | undefined): PromptOption[] {
  const items = value?.items?.length ? value.items : DEFAULT_PROMPT_OPTIONS;
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    fileName: item.fileName,
    relativePath: item.relativePath,
    builtIn: item.builtIn,
    editable: item.editable,
    defaultAvailable: item.defaultAvailable,
  }));
}

export function getPromptWorkflowsFromPreviews(value: PromptPreviewResponse | null | undefined, options?: PromptOption[]): PromptWorkflow[] {
  const workflows = value?.workflows?.length ? value.workflows : DEFAULT_PROMPT_WORKFLOWS;
  return workflows.map((item) => ({
    id: item.id,
    label: item.label,
    description: item.description,
    defaultSequence: normalizePromptSequence(item.defaultSequence, options),
    customizable: Boolean(item.customizable),
    sequenceLimit: Math.max(1, Number(item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT)),
    roundLimit: Math.max(
      Math.max(1, Number(item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT)),
      Number(item.roundLimit || item.sequenceLimit || item.defaultSequence?.length || DEFAULT_PROMPT_SEQUENCE_LIMIT),
    ),
    chunkMetric: item.chunkMetric ?? "char",
    legacy: Boolean(item.legacy),
    visible: item.visible !== false,
  }));
}
