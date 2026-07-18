import type { ModelConfig, ModelProviderConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type SetupEditorDialogBodyProps = {
  setupEditor: "prompt" | "model";
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
  onUpdateSequenceLength: (length: number) => void;
  onUpdateSequenceRound: (roundIndex: number, promptId: PromptId) => void;
  onResetModelRouteToDefault: () => void;
  onRefreshAllProviderModels: () => void;
  onSaveModelConfig: () => void;
  onUpdateRoundProvider: (roundIndex: number, providerId: string) => void;
  onUpdateRoundModel: (roundIndex: number, model: string) => void;
  onRefreshProviderModels: (providerId: string) => void;
};
