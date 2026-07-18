import { useEffect, useState } from "react";

import {
  buildActivePromptVersion,
  countPromptContentLines,
  hasPromptPreviewUnsavedChanges,
  isPromptDraftDirty,
  isPromptMetaDirty,
  resolveActivePromptItem,
} from "@/lib/promptPreviewDraftHelpers";
import type { PromptId, PromptPreviewResponse } from "@/types/app";

export function usePromptPreviewFormState(input: {
  value: PromptPreviewResponse | null;
  activePromptId: PromptId;
}) {
  const [draftContent, setDraftContent] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftVersion, setDraftVersion] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const items = input.value?.items ?? [];
  const activeItem = resolveActivePromptItem(items, input.activePromptId);
  const activeVersion = buildActivePromptVersion(activeItem);
  const editable = activeItem?.editable !== false;
  const draftReady = Boolean(activeVersion && draftVersion === activeVersion);
  const dirty = draftReady && isPromptDraftDirty(activeItem, draftContent);
  const metaDirty = draftReady && isPromptMetaDirty(activeItem, draftLabel, draftDescription);
  const editorContent = createMode ? newContent : draftContent;
  const contentLineCount = countPromptContentLines(editorContent);
  const hasUnsavedChanges = hasPromptPreviewUnsavedChanges({
    dirty,
    metaDirty,
    createMode,
    newLabel,
    newDescription,
    newContent,
  });

  useEffect(() => {
    if (activeItem && !createMode) {
      setDraftContent(activeItem.content);
      setDraftLabel(activeItem.label);
      setDraftDescription(activeItem.description);
      setDraftVersion(activeVersion);
      setLocalError("");
    }
  }, [activeVersion, activeItem, createMode]);

  return {
    items,
    activeItem,
    editable,
    dirty,
    metaDirty,
    hasUnsavedChanges,
    contentLineCount,
    draftContent,
    draftLabel,
    draftDescription,
    createMode,
    setCreateMode,
    newLabel,
    newDescription,
    newContent,
    saving,
    setSaving,
    localError,
    setLocalError,
    setDraftContent,
    setDraftLabel,
    setDraftDescription,
    setNewLabel,
    setNewDescription,
    setNewContent,
  };
}
