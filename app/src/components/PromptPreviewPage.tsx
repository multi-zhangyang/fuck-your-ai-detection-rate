import { useEffect, useMemo, useRef, useState } from "react";

import { PromptBackupHistorySheet } from "@/components/PromptBackupHistorySheet";
import { PromptPreviewEditorPanel } from "@/components/PromptPreviewEditorPanel";
import { PromptPreviewListPanel } from "@/components/PromptPreviewListPanel";
import { usePromptPreviewDraftState } from "@/hooks/usePromptPreviewDraftState";
import { usePromptWorkflowDraftState } from "@/hooks/usePromptWorkflowDraftState";
import { PromptWorkflowEditor } from "@/components/PromptWorkflowEditor";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPromptOptionsFromPreviews, getPromptWorkflowsFromPreviews } from "@/lib/promptRegistry";
import { stringifyError } from "@/lib/errorText";
import type {
  PromptBackupItem,
  PromptBackupsResult,
  PromptId,
  PromptPreviewResponse,
  PromptWorkflow,
  PromptWorkflowSaveResult,
} from "@/types/app";

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
  onListPromptBackups,
  onRestorePromptBackup,
  onUpdatePromptWorkflow,
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
  onListPromptBackups: (promptId: PromptId) => Promise<PromptBackupsResult>;
  onRestorePromptBackup: (promptId: PromptId, relativePath: string) => Promise<boolean>;
  onUpdatePromptWorkflow: (
    workflowId: PromptWorkflow["id"],
    payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit" | "roundLimit">,
  ) => Promise<PromptWorkflowSaveResult | null>;
  onDirtyStateChange: (dirty: boolean) => void;
  onConfirmDiscardChanges: () => Promise<boolean>;
}) {
  const [activeSection, setActiveSection] = useState<"prompts" | "workflows">("prompts");
  const [backupSheetOpen, setBackupSheetOpen] = useState(false);
  const [promptBackups, setPromptBackups] = useState<PromptBackupItem[] | null>(null);
  const [promptBackupsLoading, setPromptBackupsLoading] = useState(false);
  const [promptBackupsError, setPromptBackupsError] = useState("");
  const [restoringBackupPath, setRestoringBackupPath] = useState("");
  const backupRequestRef = useRef(0);
  const promptOptions = useMemo(() => getPromptOptionsFromPreviews(value), [value]);
  const promptWorkflows = useMemo(
    () => getPromptWorkflowsFromPreviews(value, promptOptions),
    [value, promptOptions],
  );
  const draft = usePromptPreviewDraftState({
    value,
    activePromptId,
    onSavePrompt,
    onRestoreDefaultPrompt,
    onCreatePrompt,
    onDeletePrompt,
  });
  const workflowDraft = usePromptWorkflowDraftState({
    workflows: promptWorkflows,
    promptOptions,
    onUpdatePromptWorkflow,
  });
  const activePromptIdRef = useRef<PromptId | "">(draft.activeItem?.id ?? "");
  activePromptIdRef.current = draft.activeItem?.id ?? "";

  const hasUnsavedChanges = draft.hasUnsavedChanges || workflowDraft.dirty;
  const interactionBusy = busy || draft.saving || workflowDraft.saving || Boolean(restoringBackupPath);

  async function loadPromptBackups() {
    const promptId = draft.activeItem?.id;
    if (!promptId) return;
    const generation = ++backupRequestRef.current;
    setPromptBackupsLoading(true);
    setPromptBackupsError("");
    try {
      const result = await onListPromptBackups(promptId);
      if (generation === backupRequestRef.current && activePromptIdRef.current === promptId) {
        setPromptBackups(result.items);
      }
    } catch (requestError) {
      if (generation === backupRequestRef.current) {
        setPromptBackupsError(stringifyError(requestError));
      }
    } finally {
      if (generation === backupRequestRef.current) {
        setPromptBackupsLoading(false);
      }
    }
  }

  function openPromptBackups() {
    setBackupSheetOpen(true);
    void loadPromptBackups();
  }

  async function restorePromptBackup(item: PromptBackupItem) {
    const promptId = draft.activeItem?.id;
    if (!promptId || restoringBackupPath) return;
    setRestoringBackupPath(item.relativePath);
    setPromptBackupsError("");
    try {
      const restored = await onRestorePromptBackup(promptId, item.relativePath);
      if (restored && activePromptIdRef.current === promptId) {
        backupRequestRef.current += 1;
        setPromptBackups(null);
        setBackupSheetOpen(false);
      }
    } catch (requestError) {
      setPromptBackupsError(stringifyError(requestError));
    } finally {
      setRestoringBackupPath("");
    }
  }

  function discardAllChanges() {
    draft.discardChanges();
    workflowDraft.resetDraft();
  }

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
    if (!hasUnsavedChanges) return true;
    if (!await onConfirmDiscardChanges()) return false;
    discardAllChanges();
    return true;
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

  async function selectWorkflow(workflowId: string) {
    if (workflowDraft.activeWorkflowId === workflowId) return;
    if (!await confirmDiscardIfNeeded()) return;
    workflowDraft.setActiveWorkflowId(workflowId);
  }

  async function selectSection(section: "prompts" | "workflows") {
    if (section === activeSection) return;
    if (!await confirmDiscardIfNeeded()) return;
    setActiveSection(section);
  }

  async function refreshPrompts() {
    if (!await confirmDiscardIfNeeded()) return;
    onRefresh();
  }

  useEffect(() => {
    onDirtyStateChange(hasUnsavedChanges);
    return () => onDirtyStateChange(false);
  }, [hasUnsavedChanges, onDirtyStateChange]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    backupRequestRef.current += 1;
    setBackupSheetOpen(false);
    setPromptBackups(null);
    setPromptBackupsError("");
    setPromptBackupsLoading(false);
    setRestoringBackupPath("");
  }, [draft.activeItem?.id]);

  return (
    <Tabs
      value={activeSection}
      onValueChange={(nextSection) => { void selectSection(nextSection as "prompts" | "workflows"); }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
        <TabsList className="grid h-9 w-full max-w-[360px] grid-cols-2">
          <TabsTrigger value="prompts" disabled={interactionBusy}>提示词库</TabsTrigger>
          <TabsTrigger value="workflows" disabled={interactionBusy}>流程模板</TabsTrigger>
        </TabsList>
        {hasUnsavedChanges ? <span className="text-xs font-medium text-warning">有未保存修改</span> : null}
      </div>
      <TabsContent value="prompts" className="m-0 min-h-0 flex-1 overflow-hidden max-xl:overflow-y-auto max-xl:overflow-x-hidden max-xl:pb-2">
        <div className="grid h-full min-h-0 gap-5 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
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
            onOpenHistory={openPromptBackups}
            onDraftContentChange={draft.setDraftContent}
            onDraftLabelChange={draft.setDraftLabel}
            onDraftDescriptionChange={draft.setDraftDescription}
            onNewLabelChange={draft.setNewLabel}
            onNewDescriptionChange={draft.setNewDescription}
            onNewContentChange={draft.setNewContent}
          />
        </div>
      </TabsContent>
      <TabsContent value="workflows" className="m-0 min-h-0 flex-1 overflow-hidden max-xl:overflow-y-auto max-xl:overflow-x-hidden max-xl:pb-2">
        <PromptWorkflowEditor
          workflows={workflowDraft.workflows}
          promptOptions={promptOptions}
          activeWorkflow={workflowDraft.activeWorkflow}
          activeWorkflowId={workflowDraft.activeWorkflowId}
          draft={workflowDraft.draft}
          busy={busy}
          saving={workflowDraft.saving}
          editable={workflowDraft.editable}
          dirty={workflowDraft.dirty}
          loadError={error}
          mutationError={workflowDraft.localError}
          validationError={workflowDraft.validationError}
          onSelectWorkflow={(workflowId) => { void selectWorkflow(workflowId); }}
          onDraftChange={workflowDraft.updateDraft}
          onUpdateSequenceItem={workflowDraft.updateSequenceItem}
          onMoveSequenceItem={workflowDraft.moveSequenceItem}
          onRemoveSequenceItem={workflowDraft.removeSequenceItem}
          onAddSequenceItem={workflowDraft.addSequenceItem}
          onReset={workflowDraft.resetDraft}
          onSave={() => { void workflowDraft.saveWorkflow(); }}
        />
      </TabsContent>
      <PromptBackupHistorySheet
        open={backupSheetOpen}
        prompt={draft.activeItem}
        items={promptBackups}
        loading={promptBackupsLoading}
        error={promptBackupsError}
        restoringPath={restoringBackupPath}
        onOpenChange={(open) => { if (open || !restoringBackupPath) setBackupSheetOpen(open); }}
        onReload={() => { void loadPromptBackups(); }}
        onRestore={(item) => { void restorePromptBackup(item); }}
      />
    </Tabs>
  );
}
