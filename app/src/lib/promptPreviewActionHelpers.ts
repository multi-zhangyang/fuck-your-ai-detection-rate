import { stringifyError } from "@/lib/errorText";
import type { PromptPreviewItem } from "@/types/app";

export async function runPromptPreviewAction(input: {
  setSaving: (value: boolean) => void;
  setLocalError: (value: string) => void;
  action: () => Promise<void>;
}): Promise<boolean> {
  input.setSaving(true);
  input.setLocalError("");
  try {
    await input.action();
    return true;
  } catch (appError) {
    input.setLocalError(stringifyError(appError));
    return false;
  } finally {
    input.setSaving(false);
  }
}

export function canSaveActivePrompt(input: {
  activeItem: PromptPreviewItem | null;
  editable: boolean;
  dirty: boolean;
  metaDirty: boolean;
}): boolean {
  return Boolean(input.activeItem && input.editable && (input.dirty || input.metaDirty));
}

export function canRestoreDefaultPrompt(activeItem: PromptPreviewItem | null): boolean {
  return Boolean(activeItem?.defaultAvailable);
}

export function canDeletePrompt(activeItem: PromptPreviewItem | null): boolean {
  return Boolean(activeItem && !activeItem.builtIn);
}

export type SavePromptPayload = {
  label: string;
  description?: string;
  content: string;
  contentDirty: boolean;
  metaDirty: boolean;
};

export function buildSavePromptPayload(input: {
  draftLabel: string;
  draftDescription: string;
  draftContent: string;
  dirty: boolean;
  metaDirty: boolean;
}): SavePromptPayload {
  return {
    label: input.draftLabel,
    description: input.draftDescription,
    content: input.draftContent,
    contentDirty: input.dirty,
    metaDirty: input.metaDirty,
  };
}

export function buildCreatePromptPayload(input: {
  newLabel: string;
  newDescription: string;
  newContent: string;
}): { label: string; description?: string; content: string } {
  return {
    label: input.newLabel,
    description: input.newDescription,
    content: input.newContent,
  };
}
