import { useEffect } from "react";

import { PromptPreviewEditorPanel } from "@/components/PromptPreviewEditorPanel";
import { PromptPreviewListPanel } from "@/components/PromptPreviewListPanel";
import { usePromptPreviewDraftState } from "@/hooks/usePromptPreviewDraftState";
import type { PromptId, PromptPreviewResponse } from "@/types/app";

export function PromptPreviewPage({
  value,
  busy,
  error,
  activePromptId,
  onActivePromptIdChange,
  onRefresh,
  onSavePrompt,
  onRestoreDefaultPrompt,
  onCreatePrompt,
  onDeletePrompt,
  onDirtyStateChange,
  onConfirmDiscardChanges,
}: {
  value: PromptPreviewResponse | null;
  busy: boolean;
  error: string;
  activePromptId: PromptId;
  onActivePromptIdChange: (promptId: PromptId) => void;
  onRefresh: () => void;
  onSavePrompt: (promptId: PromptId, payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean }) => Promise<void>;
  onRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
  onCreatePrompt: (payload: { label: string; description?: string; content: string }) => Promise<void>;
  onDeletePrompt: (promptId: PromptId) => Promise<void>;
  onDirtyStateChange: (dirty: boolean) => void;
  onConfirmDiscardChanges: () => Promise<boolean>;
}) {
  const draft = usePromptPreviewDraftState({
    value,
    activePromptId,
    onSavePrompt,
    onRestoreDefaultPrompt,
    onCreatePrompt,
    onDeletePrompt,
  });

  async function saveActivePrompt() {
    await draft.saveActivePrompt();
  }
  async function restoreDefaultPrompt() {
    await draft.restoreDefaultPrompt();
  }
  async function createPrompt() {
    await draft.createPrompt();
  }
  async function deletePrompt() {
    await draft.deletePrompt();
  }

  async function confirmDiscardIfNeeded() {
    return !draft.hasUnsavedChanges || await onConfirmDiscardChanges();
  }

  async function enterCreateMode() {
    if (!await confirmDiscardIfNeeded()) return;
    draft.setCreateMode(true);
  }

  async function cancelCreateMode() {
    if (!await confirmDiscardIfNeeded()) return;
    draft.setCreateMode(false);
  }

  async function selectPrompt(promptId: PromptId) {
    if (!draft.createMode && draft.activeItem?.id === promptId) return;
    if (!await confirmDiscardIfNeeded()) return;
    draft.setCreateMode(false);
    onActivePromptIdChange(promptId);
  }

  async function refreshPrompts() {
    if (!await confirmDiscardIfNeeded()) return;
    onRefresh();
  }

  useEffect(() => {
    onDirtyStateChange(draft.hasUnsavedChanges);
    return () => onDirtyStateChange(false);
  }, [draft.hasUnsavedChanges, onDirtyStateChange]);

  useEffect(() => {
    if (!draft.hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [draft.hasUnsavedChanges]);

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-hidden max-xl:overflow-y-auto max-xl:overflow-x-hidden max-xl:pb-2 xl:grid-cols-[320px_minmax(0,1fr)]">
      <PromptPreviewListPanel
        items={draft.items}
        activeItem={draft.activeItem}
        busy={busy}
        saving={draft.saving}
        createMode={draft.createMode}
        error={error}
        localError={draft.localError}
        onCreateMode={() => { void enterCreateMode(); }}
        onRefresh={() => { void refreshPrompts(); }}
        onSelect={(promptId) => { void selectPrompt(promptId); }}
      />
      <PromptPreviewEditorPanel
        createMode={draft.createMode}
        activeItem={draft.activeItem}
        busy={busy}
        saving={draft.saving}
        editable={draft.editable}
        dirty={draft.dirty}
        metaDirty={draft.metaDirty}
        contentLineCount={draft.contentLineCount}
        draftContent={draft.draftContent}
        draftLabel={draft.draftLabel}
        draftDescription={draft.draftDescription}
        newLabel={draft.newLabel}
        newDescription={draft.newDescription}
        newContent={draft.newContent}
        error={error}
        onCancelCreate={() => { void cancelCreateMode(); }}
        onCreate={() => { void createPrompt(); }}
        onSave={() => { void saveActivePrompt(); }}
        onRestoreDefault={() => { void restoreDefaultPrompt(); }}
        onDelete={() => { void deletePrompt(); }}
        onResetDraftContent={() => { if (draft.activeItem) draft.setDraftContent(draft.activeItem.content); }}
        onDraftContentChange={draft.setDraftContent}
        onDraftLabelChange={draft.setDraftLabel}
        onDraftDescriptionChange={draft.setDraftDescription}
        onNewLabelChange={draft.setNewLabel}
        onNewDescriptionChange={draft.setNewDescription}
        onNewContentChange={draft.setNewContent}
      />
    </div>
  );
}
