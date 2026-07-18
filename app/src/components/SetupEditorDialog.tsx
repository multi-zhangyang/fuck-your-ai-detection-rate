import { SetupEditorDialogBody } from "@/components/SetupEditorDialogBody";
import { Dialog } from "@/components/ui/dialog";
import type { ModelConfig, ModelProviderConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type SetupEditorMode = "prompt" | "model";

type Props = {
  open: boolean;
  setupEditor: SetupEditorMode | null;
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
  onOpenChange: (open: boolean) => void;
  onUpdateSequenceLength: (length: number) => void;
  onUpdateSequenceRound: (roundIndex: number, promptId: PromptId) => void;
  onResetModelRouteToDefault: () => void;
  onRefreshAllProviderModels: () => void;
  onSaveModelConfig: () => void;
  onUpdateRoundProvider: (roundIndex: number, providerId: string) => void;
  onUpdateRoundModel: (roundIndex: number, model: string) => void;
  onRefreshProviderModels: (providerId: string) => void;
};

export function SetupEditorDialog({
  open,
  setupEditor,
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
  onOpenChange,
  onUpdateSequenceLength,
  onUpdateSequenceRound,
  onResetModelRouteToDefault,
  onRefreshAllProviderModels,
  onSaveModelConfig,
  onUpdateRoundProvider,
  onUpdateRoundModel,
  onRefreshProviderModels,
}: Props) {
  if (!open || !setupEditor) {
    return null;
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <SetupEditorDialogBody
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
        onUpdateSequenceLength={onUpdateSequenceLength}
        onUpdateSequenceRound={onUpdateSequenceRound}
        onResetModelRouteToDefault={onResetModelRouteToDefault}
        onRefreshAllProviderModels={onRefreshAllProviderModels}
        onSaveModelConfig={onSaveModelConfig}
        onUpdateRoundProvider={onUpdateRoundProvider}
        onUpdateRoundModel={onUpdateRoundModel}
        onRefreshProviderModels={onRefreshProviderModels}
      />
    </Dialog>
  );
}
