import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { HomeRunAppendRoundDialogShell } from "@/components/HomeRunAppendRoundDialogShell";
import { HomeRunSetupEditorDialogShell } from "@/components/HomeRunSetupEditorDialogShell";
import type { SetupEditorMode } from "@/components/SetupEditorDialog";
import type { AppendRoundDraft } from "@/lib/homeRunPanelState";
import type {
  ModelConfig,
  ModelProviderConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

type Props = {
  setupEditor: SetupEditorMode | null;
  setSetupEditor: Dispatch<SetStateAction<SetupEditorMode | null>>;
  appendDraft: AppendRoundDraft | null;
  setAppendDraft: Dispatch<SetStateAction<AppendRoundDraft | null>>;
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
  appendRoundNumber: number;
  appendPromptOptions: Array<Pick<PromptOption, "id" | "label">>;
  appendModelOptions: string[];
  appendRouteIssues: string[];
  appendConfirmDisabled: boolean;
  onSaveModelConfig: (config: ModelConfig) => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  updateSequenceLength: (length: number) => void;
  updateSequenceRound: (roundIndex: number, promptId: PromptId) => void;
  resetModelRouteToDefault: () => void;
  updateRoundProvider: (roundIndex: number, providerId: string) => void;
  updateRoundModel: (roundIndex: number, model: string) => void;
  updateAppendProvider: (providerId: string) => void;
  confirmAppendRound: () => void;
};

export function HomeRunPanelDialogs(props: Props) {
  return (
    <>
      <HomeRunSetupEditorDialogShell
        setupEditor={props.setupEditor}
        setSetupEditor={props.setSetupEditor}
        modelConfigRef={props.modelConfigRef}
        busy={props.busy}
        activeSequence={props.activeSequence}
        activeFlowSequence={props.activeFlowSequence}
        sequenceLengthOptions={props.sequenceLengthOptions}
        promptSelectOptions={props.promptSelectOptions}
        promptProfile={props.promptProfile}
        promptWorkflows={props.promptWorkflows}
        modelConfig={props.modelConfig}
        providerOptions={props.providerOptions}
        providers={props.providers}
        customizedRouteCount={props.customizedRouteCount}
        unavailableRouteCount={props.unavailableRouteCount}
        modelRouteStatus={props.modelRouteStatus}
        modelRouteHealthLabel={props.modelRouteHealthLabel}
        modelRouteTitle={props.modelRouteTitle}
        activeModelRouteReady={props.activeModelRouteReady}
        onSaveModelConfig={props.onSaveModelConfig}
        onRefreshAllProviderModels={props.onRefreshAllProviderModels}
        onRefreshProviderModels={props.onRefreshProviderModels}
        updateSequenceLength={props.updateSequenceLength}
        updateSequenceRound={props.updateSequenceRound}
        resetModelRouteToDefault={props.resetModelRouteToDefault}
        updateRoundProvider={props.updateRoundProvider}
        updateRoundModel={props.updateRoundModel}
      />
      <HomeRunAppendRoundDialogShell
        appendDraft={props.appendDraft}
        setAppendDraft={props.setAppendDraft}
        appendRoundNumber={props.appendRoundNumber}
        appendPromptOptions={props.appendPromptOptions}
        providerOptions={props.providerOptions}
        modelConfig={props.modelConfig}
        appendModelOptions={props.appendModelOptions}
        appendRouteIssues={props.appendRouteIssues}
        appendConfirmDisabled={props.appendConfirmDisabled}
        updateAppendProvider={props.updateAppendProvider}
        confirmAppendRound={props.confirmAppendRound}
      />
    </>
  );
}
