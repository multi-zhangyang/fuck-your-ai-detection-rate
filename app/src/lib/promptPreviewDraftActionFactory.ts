import {
  buildCreatePromptPayload,
  buildSavePromptPayload,
  canDeletePrompt,
  canRestoreDefaultPrompt,
  canSaveActivePrompt,
  runPromptPreviewAction,
} from "@/lib/promptPreviewActionHelpers";
import type { PromptId, PromptPreviewItem } from "@/types/app";

export function createPromptPreviewDraftActions(input: {
  getForm: () => {
    activeItem: PromptPreviewItem | null | undefined;
    editable: boolean;
    dirty: boolean;
    metaDirty: boolean;
    draftLabel: string;
    draftDescription: string;
    draftContent: string;
    newLabel: string;
    newDescription: string;
    newContent: string;
    setSaving: (value: boolean) => void;
    setLocalError: (value: string) => void;
    setCreateMode: (value: boolean) => void;
    setNewLabel: (value: string) => void;
    setNewDescription: (value: string) => void;
    setNewContent: (value: string) => void;
  };
  onSavePrompt: (promptId: PromptId, payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean }) => Promise<void>;
  onRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
  onCreatePrompt: (payload: { label: string; description?: string; content: string }) => Promise<void>;
  onDeletePrompt: (promptId: PromptId) => Promise<void>;
}) {
  async function saveActivePrompt() {
    const form = input.getForm();
    const activeItem = form.activeItem ?? null;
    if (!canSaveActivePrompt({
      activeItem,
      editable: form.editable,
      dirty: form.dirty,
      metaDirty: form.metaDirty,
    }) || !activeItem) return;
    await runPromptPreviewAction({
      setSaving: form.setSaving,
      setLocalError: form.setLocalError,
      action: async () => {
        await input.onSavePrompt(activeItem.id, buildSavePromptPayload({
          draftLabel: form.draftLabel,
          draftDescription: form.draftDescription,
          draftContent: form.draftContent,
          dirty: form.dirty,
          metaDirty: form.metaDirty,
        }));
      },
    });
  }

  async function restoreDefaultPrompt() {
    const form = input.getForm();
    const activeItem = form.activeItem ?? null;
    if (!canRestoreDefaultPrompt(activeItem) || !activeItem) return;
    await runPromptPreviewAction({
      setSaving: form.setSaving,
      setLocalError: form.setLocalError,
      action: async () => {
        await input.onRestoreDefaultPrompt(activeItem.id);
      },
    });
  }

  async function createPrompt() {
    const form = input.getForm();
    const ok = await runPromptPreviewAction({
      setSaving: form.setSaving,
      setLocalError: form.setLocalError,
      action: async () => {
        await input.onCreatePrompt(buildCreatePromptPayload({
          newLabel: form.newLabel,
          newDescription: form.newDescription,
          newContent: form.newContent,
        }));
      },
    });
    if (ok) {
      form.setCreateMode(false);
      form.setNewLabel("");
      form.setNewDescription("");
      form.setNewContent("");
    }
  }

  async function deletePrompt() {
    const form = input.getForm();
    const activeItem = form.activeItem ?? null;
    if (!canDeletePrompt(activeItem) || !activeItem) return;
    await runPromptPreviewAction({
      setSaving: form.setSaving,
      setLocalError: form.setLocalError,
      action: async () => {
        await input.onDeletePrompt(activeItem.id);
      },
    });
  }

  return {
    saveActivePrompt,
    restoreDefaultPrompt,
    createPrompt,
    deletePrompt,
  };
}
