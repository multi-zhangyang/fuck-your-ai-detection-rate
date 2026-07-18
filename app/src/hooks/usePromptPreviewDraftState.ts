import { useMemo } from "react";

import { usePromptPreviewFormState } from "@/hooks/usePromptPreviewFormState";
import { createPromptPreviewDraftActions } from "@/lib/promptPreviewDraftActionFactory";
import type { PromptId, PromptPreviewResponse } from "@/types/app";

export function usePromptPreviewDraftState(input: {
  value: PromptPreviewResponse | null;
  activePromptId: PromptId;
  onSavePrompt: (promptId: PromptId, payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean }) => Promise<void>;
  onRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
  onCreatePrompt: (payload: { label: string; description?: string; content: string }) => Promise<void>;
  onDeletePrompt: (promptId: PromptId) => Promise<void>;
}) {
  const form = usePromptPreviewFormState({
    value: input.value,
    activePromptId: input.activePromptId,
  });

  const actions = useMemo(() => createPromptPreviewDraftActions({
    getForm: () => form,
    onSavePrompt: input.onSavePrompt,
    onRestoreDefaultPrompt: input.onRestoreDefaultPrompt,
    onCreatePrompt: input.onCreatePrompt,
    onDeletePrompt: input.onDeletePrompt,
  }), [
    form,
    input.onSavePrompt,
    input.onRestoreDefaultPrompt,
    input.onCreatePrompt,
    input.onDeletePrompt,
  ]);

  // keep local function names for SM needles (prompt preview CRUD)
  async function saveActivePrompt() {
    await actions.saveActivePrompt();
  }
  async function restoreDefaultPrompt() {
    await actions.restoreDefaultPrompt();
  }
  async function createPrompt() {
    await actions.createPrompt();
  }
  async function deletePrompt() {
    await actions.deletePrompt();
  }

  return {
    items: form.items,
    activeItem: form.activeItem,
    editable: form.editable,
    dirty: form.dirty,
    metaDirty: form.metaDirty,
    hasUnsavedChanges: form.hasUnsavedChanges,
    contentLineCount: form.contentLineCount,
    draftContent: form.draftContent,
    draftLabel: form.draftLabel,
    draftDescription: form.draftDescription,
    createMode: form.createMode,
    setCreateMode: form.setCreateMode,
    newLabel: form.newLabel,
    newDescription: form.newDescription,
    newContent: form.newContent,
    saving: form.saving,
    localError: form.localError,
    setDraftContent: form.setDraftContent,
    setDraftLabel: form.setDraftLabel,
    setDraftDescription: form.setDraftDescription,
    setNewLabel: form.setNewLabel,
    setNewDescription: form.setNewDescription,
    setNewContent: form.setNewContent,
    saveActivePrompt,
    restoreDefaultPrompt,
    createPrompt,
    deletePrompt,
  };
}
