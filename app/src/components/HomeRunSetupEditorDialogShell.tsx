import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { SetupEditorDialog, type SetupEditorMode } from "@/components/SetupEditorDialog";
import type {
  ModelConfig,
  ModelProviderConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function HomeRunSetupEditorDialogShell({
  setupEditor,
  setSetupEditor,
  modelConfigRef,
  busy,
  activeSequence,
  activeFlowSequence,
  sequenceLengthOptions,
  promptSelectOptions,
  promptProfile,
  promptWorkflows,
  modelConfig,
  providerOptions,
  providers,
  customizedRouteCount,
  unavailableRouteCount,
  modelRouteStatus,
  modelRouteHealthLabel,
  modelRouteTitle,
  activeModelRouteReady,
  onSaveModelConfig,
  onRefreshAllProviderModels,
  onRefreshProviderModels,
  updateSequenceLength,
  updateSequenceRound,
  resetModelRouteToDefault,
  updateRoundProvider,
  updateRoundModel,
}: {
  setupEditor: SetupEditorMode | null;
  setSetupEditor: Dispatch<SetStateAction<SetupEditorMode | null>>;
  modelConfigRef: MutableRefObject<ModelConfig>;
  busy: boolean;
  activeSequence: PromptId[];
  activeFlowSequence: PromptId[];
  sequenceLengthOptions: number[];
  promptSelectOptions: Array<Pick<PromptOption, "id" | "label">>;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  modelConfig: ModelConfig;
  providerOptions: ModelProviderConfig[];
  providers: ModelProviderConfig[];
  customizedRouteCount: number;
  unavailableRouteCount: number;
  modelRouteStatus: string;
  modelRouteHealthLabel: string;
  modelRouteTitle: string;
  activeModelRouteReady: boolean;
  onSaveModelConfig: (config: ModelConfig) => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  updateSequenceLength: (length: number) => void;
  updateSequenceRound: (roundIndex: number, promptId: PromptId) => void;
  resetModelRouteToDefault: () => void;
  updateRoundProvider: (roundIndex: number, providerId: string) => void;
  updateRoundModel: (roundIndex: number, model: string) => void;
}) {
  return (
    <SetupEditorDialog
      open={Boolean(setupEditor)}
      setupEditor={setupEditor}
      busy={busy}
      activeSequence={activeSequence}
      activeFlowSequence={activeFlowSequence}
      sequenceLengthOptions={sequenceLengthOptions}
      promptSelectOptions={promptSelectOptions}
      promptProfile={promptProfile}
      promptWorkflows={promptWorkflows}
      modelConfig={modelConfig}
      providerOptions={providerOptions}
      providers={providers}
      customizedRouteCount={customizedRouteCount}
      unavailableRouteCount={unavailableRouteCount}
      modelRouteStatus={modelRouteStatus}
      modelRouteHealthLabel={modelRouteHealthLabel}
      modelRouteTitle={modelRouteTitle}
      activeModelRouteReady={activeModelRouteReady}
      onOpenChange={(open) => {
        if (!open) setSetupEditor(null);
      }}
      onUpdateSequenceLength={updateSequenceLength}
      onUpdateSequenceRound={updateSequenceRound}
      onResetModelRouteToDefault={resetModelRouteToDefault}
      onRefreshAllProviderModels={onRefreshAllProviderModels}
      onSaveModelConfig={() => onSaveModelConfig(modelConfigRef.current)}
      onUpdateRoundProvider={updateRoundProvider}
      onUpdateRoundModel={updateRoundModel}
      onRefreshProviderModels={onRefreshProviderModels}
    />
  );
}
