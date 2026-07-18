import {
  DEFAULT_PROMPT_SEQUENCE,
  normalizePromptId,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import {
  ACTIVE_DOCUMENT_KEY,
  ACTIVE_PROMPT_PROFILE_KEY,
  ACTIVE_PROMPT_SEQUENCE_KEY,
} from "@/lib/storageKeys";
import { readStorageValue, writeStorageValue } from "@/lib/safeStorage";
import type { ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export function normalizeStoredPromptSequence(value: unknown): PromptId[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePromptId(item))
    .filter((item): item is PromptId => item !== null);
}

export function readStoredPromptSequence(): PromptId[] {
  try {
    const stored = normalizeStoredPromptSequence(JSON.parse(readStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY) || "[]"));
    return stored.length ? stored : DEFAULT_PROMPT_SEQUENCE;
  } catch {
    return DEFAULT_PROMPT_SEQUENCE;
  }
}

export function persistActiveDocument(
  sourcePath: string,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[] = DEFAULT_PROMPT_SEQUENCE,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
) {
  writeStorageValue(ACTIVE_DOCUMENT_KEY, sourcePath);
  writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, promptProfile);
  writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows)));
}
