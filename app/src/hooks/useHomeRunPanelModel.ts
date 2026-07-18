import { useEffect, useRef, useState } from "react";

import type { SetupEditorMode } from "@/components/SetupEditorDialog";
import { useAppendRoundControls } from "@/hooks/useAppendRoundControls";
import { useHomeRunPanelActions } from "@/hooks/useHomeRunPanelActions";
import { useSetupEditorEscape } from "@/hooks/useSetupEditorEscape";
import { deriveHomeRunPanelViewState } from "@/lib/homeRunPanelViewModel";
import type { HomeRunPanelProps } from "@/lib/homeRunPanelTypes";

export type { HomeRunPanelProps } from "@/lib/homeRunPanelTypes";

export function useHomeRunPanelModel({
  value,
  busy,
  modelConfig,
  progress,
  roundProgressStatus,
  loadedResultRound,
  activeCompareData,
  pendingAutoAction,
  promptProfile,
  promptSequence,
  promptOptions,
  promptWorkflows,
  onPromptProfileChange,
  onPromptSequenceChange,
  onModelConfigChange,
  onSaveModelConfig,
  onRefreshAllProviderModels,
  onRefreshProviderModels,
  onPickFile,
  onRunRound,
  onRefreshStatus,
  onCancelRun,
  onRejectAutoAction,
  onResetRound,
  running,
}: HomeRunPanelProps) {
  const [setupEditor, setSetupEditor] = useState<SetupEditorMode | null>(null);
  const modelConfigRef = useRef(modelConfig);
  useEffect(() => {
    modelConfigRef.current = modelConfig;
  }, [modelConfig]);
  useSetupEditorEscape(setupEditor, setSetupEditor);

  const view = deriveHomeRunPanelViewState({
    value,
    busy,
    modelConfig,
    progress,
    roundProgressStatus,
    loadedResultRound,
    activeCompareData,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    running,
  });

  const append = useAppendRoundControls({
    modelConfig,
    modelConfigRef,
    promptProfile,
    promptWorkflows,
    activeSequence: view.activeSequence,
    promptSelectOptions: view.promptSelectOptions,
    providerOptions: view.providerOptions,
    busy,
    running,
    appendRoundLimit: view.appendRoundLimit,
    onModelConfigChange,
    onRunRound,
  });

  const actions = useHomeRunPanelActions({
    modelConfigRef,
    primaryActionMode: view.primaryActionMode,
    onRefreshStatus,
    openAppendRoundDialog: append.openAppendRoundDialog,
    onRunRound,
    activeSequence: view.activeSequence,
    activeFlowSequence: view.activeFlowSequence,
    sequenceLengthLimit: view.sequenceLengthLimit,
    promptSelectOptions: view.promptSelectOptions,
    promptProfile,
    promptWorkflows,
    rewriteConcurrency: view.rewriteConcurrency,
    onPromptSequenceChange,
    onModelConfigChange,
  });

  return {
    setupEditor,
    setSetupEditor,
    modelConfigRef,
    ...view,
    appendDraft: append.appendDraft,
    setAppendDraft: append.setAppendDraft,
    appendPromptOptions: append.appendPromptOptions,
    appendModelOptions: append.appendModelOptions,
    appendRouteIssues: append.appendRouteIssues,
    appendConfirmDisabled: append.appendConfirmDisabled,
    confirmAppendRound: append.confirmAppendRound,
    updateAppendProvider: append.updateAppendProvider,
    ...actions,
    onPromptProfileChange,
    onSaveModelConfig,
    onRefreshAllProviderModels,
    onRefreshProviderModels,
    onPickFile,
    onCancelRun,
    onRejectAutoAction,
    onResetRound,
    busy,
    running,
    value,
    progress,
    pendingAutoAction,
    promptProfile,
    promptWorkflows,
    modelConfig,
  };
}
