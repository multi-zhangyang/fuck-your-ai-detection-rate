import { getRoundRouteIssues } from "@/lib/modelRouteEdit";
import { findProviderForRoundModel } from "@/lib/modelRoute";
import { getPromptOption, getRoundModelKey } from "@/lib/promptRegistry";
import type { ModelConfig, ModelProviderConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type SetupEditorRoundRouteState = {
  promptOption: PromptOption | undefined;
  selectedProviderId: string;
  selectedModels: string[];
  selectedModelValue: string;
  routeIssues: string[];
  provider: ModelProviderConfig | null | undefined;
  roundModel: NonNullable<ModelConfig["roundModels"]>[string] | undefined;
};

export function deriveSetupEditorRoundRouteState(input: {
  promptId: PromptId;
  index: number;
  promptSelectOptions: Array<Pick<PromptOption, "id" | "label">>;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  modelConfig: ModelConfig;
}): SetupEditorRoundRouteState {
  const {
    promptId,
    index,
    promptSelectOptions,
    promptProfile,
    promptWorkflows,
    modelConfig,
  } = input;
  const promptOption = getPromptOption(promptId, promptSelectOptions as PromptOption[]);
  const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
  const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
  const provider = findProviderForRoundModel(modelConfig, roundModel);
  const selectedProviderId = roundModel?.enabled && provider && provider.enabled !== false ? provider.id : "__default";
  const selectedModels = selectedProviderId === "__default" ? [] : provider?.models?.length ? provider.models : [];
  const selectedModelValue = selectedProviderId === "__default"
    ? ""
    : roundModel?.model || provider?.defaultModel || selectedModels[0] || "";
  const routeIssues = getRoundRouteIssues(
    modelConfig,
    selectedProviderId || "__default",
    provider,
    String(selectedModelValue ?? ""),
  );
  return {
    promptOption,
    selectedProviderId,
    selectedModels,
    selectedModelValue,
    routeIssues,
    provider,
    roundModel,
  };
}

export function deriveSetupEditorDialogChrome(input: {
  setupEditor: "prompt" | "model";
}): {
  dialogMaxWidthClass: string;
  title: string;
  description: string;
} {
  return {
    dialogMaxWidthClass: input.setupEditor === "model" ? "sm:max-w-[720px]" : "sm:max-w-[560px]",
    title: input.setupEditor === "prompt" ? "改写流程" : "模型路线",
    description: input.setupEditor === "prompt" ? "编辑改写流程配置。" : "编辑模型路线配置。",
  };
}
