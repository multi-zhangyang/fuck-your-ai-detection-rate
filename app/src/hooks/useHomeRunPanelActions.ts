import type { MutableRefObject } from "react";

import { createHomeRunPanelRouteEditors } from "@/lib/homeRunPanelRouteEditHelpers";
import type { ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export function useHomeRunPanelActions(input: {
  modelConfigRef: MutableRefObject<ModelConfig>;
  primaryActionMode: string;
  onRefreshStatus: () => void;
  openAppendRoundDialog: () => void;
  onRunRound: (modelConfig?: ModelConfig) => void;
  activeSequence: PromptId[];
  activeFlowSequence: PromptId[];
  sequenceLengthLimit: number;
  promptSelectOptions: PromptOption[];
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  rewriteConcurrency: number;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void | Promise<void>;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
}) {
  const {
    modelConfigRef,
    primaryActionMode,
    onRefreshStatus,
    openAppendRoundDialog,
    onRunRound,
    activeSequence,
    activeFlowSequence,
    sequenceLengthLimit,
    promptSelectOptions,
    promptProfile,
    promptWorkflows,
    rewriteConcurrency,
    onPromptSequenceChange,
    onModelConfigChange,
  } = input;

  const handlePrimaryRunAction = async () => {
    if (primaryActionMode === "refresh") {
      onRefreshStatus();
      return;
    }
    if (primaryActionMode === "append") {
      openAppendRoundDialog();
      return;
    }
    onRunRound(modelConfigRef.current);
  };

  const routeEditors = createHomeRunPanelRouteEditors({
    getModelConfig: () => modelConfigRef.current,
    setModelConfig: (next) => {
      modelConfigRef.current = next;
    },
    activeSequence,
    activeFlowSequence,
    sequenceLengthLimit,
    promptSelectOptions,
    promptProfile,
    promptWorkflows,
    rewriteConcurrency,
    onPromptSequenceChange,
    onModelConfigChange,
  });

  return {
    handlePrimaryRunAction,
    ...routeEditors,
  };
}
