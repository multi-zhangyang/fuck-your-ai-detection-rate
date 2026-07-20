import { useEffect, useMemo, useState } from "react";

import { stringifyError } from "@/lib/errorText";
import {
  buildPromptWorkflowDraft,
  buildPromptWorkflowVersion,
  getNextPromptWorkflowSequenceItem,
  isPromptWorkflowDraftDirty,
  movePromptWorkflowSequenceItem,
  replacePromptWorkflowSequenceItem,
  validatePromptWorkflowDraft,
  type PromptWorkflowDraft,
} from "@/lib/promptWorkflowDraftHelpers";
import type {
  PromptId,
  PromptOption,
  PromptProfile,
  PromptWorkflow,
  PromptWorkflowSaveResult,
} from "@/types/app";

const EMPTY_DRAFT: PromptWorkflowDraft = {
  label: "",
  description: "",
  defaultSequence: [],
  sequenceLimit: 1,
  roundLimit: 1,
};

export function usePromptWorkflowDraftState(input: {
  workflows: PromptWorkflow[];
  promptOptions: PromptOption[];
  onUpdatePromptWorkflow: (
    workflowId: PromptWorkflow["id"],
    payload: PromptWorkflowDraft,
  ) => Promise<PromptWorkflowSaveResult | null>;
}) {
  const visibleWorkflows = useMemo(
    () => input.workflows.filter((item) => item.visible !== false),
    [input.workflows],
  );
  const [activeWorkflowId, setActiveWorkflowId] = useState<PromptProfile>("");
  const [draft, setDraft] = useState<PromptWorkflowDraft>(EMPTY_DRAFT);
  const [draftVersion, setDraftVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const activeWorkflow = visibleWorkflows.find((item) => item.id === activeWorkflowId)
    ?? visibleWorkflows.find((item) => item.customizable && !item.legacy)
    ?? visibleWorkflows[0]
    ?? null;
  const activeVersion = buildPromptWorkflowVersion(activeWorkflow);
  const draftReady = Boolean(activeVersion && draftVersion === activeVersion);
  const dirty = draftReady && isPromptWorkflowDraftDirty(activeWorkflow, draft);
  const validationError = draftReady
    ? validatePromptWorkflowDraft(draft, input.promptOptions)
    : "";
  const editable = Boolean(activeWorkflow?.customizable && !activeWorkflow.legacy);

  useEffect(() => {
    if (activeWorkflow && activeWorkflow.id !== activeWorkflowId) {
      setActiveWorkflowId(activeWorkflow.id);
    }
  }, [activeWorkflow, activeWorkflowId]);

  useEffect(() => {
    if (!activeWorkflow) {
      setDraft(EMPTY_DRAFT);
      setDraftVersion("");
      return;
    }
    setDraft(buildPromptWorkflowDraft(activeWorkflow));
    setDraftVersion(activeVersion);
    setLocalError("");
  }, [activeVersion]);

  function updateDraft(patch: Partial<PromptWorkflowDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateSequenceItem(index: number, promptId: PromptId) {
    setDraft((current) => ({
      ...current,
      defaultSequence: replacePromptWorkflowSequenceItem(current.defaultSequence, index, promptId),
    }));
  }

  function moveSequenceItem(index: number, direction: -1 | 1) {
    setDraft((current) => ({
      ...current,
      defaultSequence: movePromptWorkflowSequenceItem(current.defaultSequence, index, direction),
    }));
  }

  function removeSequenceItem(index: number) {
    setDraft((current) => ({
      ...current,
      defaultSequence: current.defaultSequence.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addSequenceItem() {
    setDraft((current) => {
      if (current.defaultSequence.length >= current.sequenceLimit) return current;
      const promptId = getNextPromptWorkflowSequenceItem(current.defaultSequence, input.promptOptions);
      return promptId
        ? { ...current, defaultSequence: [...current.defaultSequence, promptId] }
        : current;
    });
  }

  function resetDraft() {
    if (!activeWorkflow) return;
    setDraft(buildPromptWorkflowDraft(activeWorkflow));
    setDraftVersion(activeVersion);
    setLocalError("");
  }

  async function saveWorkflow() {
    if (!activeWorkflow || !editable || !dirty || validationError || saving) return;
    setSaving(true);
    setLocalError("");
    try {
      const result = await input.onUpdatePromptWorkflow(activeWorkflow.id, {
        label: draft.label.trim(),
        description: (draft.description ?? "").trim(),
        defaultSequence: [...draft.defaultSequence],
        sequenceLimit: draft.sequenceLimit,
        roundLimit: draft.roundLimit,
      });
      const savedWorkflow = result?.workflows.find((item) => item.id === activeWorkflow.id);
      if (savedWorkflow) {
        setDraft(buildPromptWorkflowDraft(savedWorkflow));
        setDraftVersion(buildPromptWorkflowVersion(savedWorkflow));
      }
    } catch (appError) {
      setLocalError(stringifyError(appError));
    } finally {
      setSaving(false);
    }
  }

  return {
    workflows: visibleWorkflows,
    activeWorkflow,
    activeWorkflowId: activeWorkflow?.id ?? "",
    setActiveWorkflowId,
    draft,
    updateDraft,
    editable,
    dirty,
    validationError,
    saving,
    localError,
    updateSequenceItem,
    moveSequenceItem,
    removeSequenceItem,
    addSequenceItem,
    resetDraft,
    saveWorkflow,
  };
}
