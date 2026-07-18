import {
  buildAppendRoundModelConfig,
  buildAppendProviderRoute,
  buildOpenAppendDraft,
  getAppendDefaultRoute as getAppendDefaultRouteHelper,
  getAppendModelOptions as getAppendModelOptionsHelper,
  type AppendRoundDraft,
} from "@/lib/homeRunPanelState";
import {
  findProviderForRoundModel,
} from "@/lib/modelRoute";
import {
  getRoundModelKey,
} from "@/lib/promptRegistry";
import type {
  ModelConfig,
  ModelProviderConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function createAppendRoundControlHelpers(input: {
  getModelConfig: () => ModelConfig;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  activeSequence: PromptId[];
  promptSelectOptions: PromptOption[];
  providerOptions: ModelProviderConfig[];
  appendRoundLimit: number;
}) {
  const getAppendModelOptionsFor = (providerId: string, selectedModel = "") => getAppendModelOptionsHelper(
    input.getModelConfig(),
    input.providerOptions,
    providerId,
    selectedModel,
  );
  const getAppendDefaultRoute = () => getAppendDefaultRouteHelper(
    input.getModelConfig(),
    input.promptProfile,
    input.activeSequence.length,
    getRoundModelKey,
    findProviderForRoundModel,
    input.promptWorkflows,
  );
  const buildOpenDraft = () => {
    const route = getAppendDefaultRoute();
    return buildOpenAppendDraft({
      activeSequence: input.activeSequence,
      promptSelectOptions: input.promptSelectOptions,
      defaultRoute: route,
      defaultModelFallback: getAppendModelOptionsFor(route.providerId)[0] || "",
    });
  };
  const buildProviderDraftPatch = (draft: AppendRoundDraft, providerId: string): AppendRoundDraft => {
    const route = buildAppendProviderRoute({
      providerId,
      defaultModel: input.getModelConfig().model || "",
      providerOptions: input.providerOptions,
    });
    return { ...draft, providerId: route.providerId, model: route.model };
  };
  const buildConfirmedConfig = (appendDraft: AppendRoundDraft) => buildAppendRoundModelConfig({
    currentConfig: input.getModelConfig(),
    promptProfile: input.promptProfile,
    activeSequence: input.activeSequence,
    appendDraft,
    appendRoundLimit: input.appendRoundLimit,
    promptWorkflows: input.promptWorkflows,
    getRoundModelKey,
  });
  return {
    getAppendModelOptionsFor,
    buildOpenDraft,
    buildProviderDraftPatch,
    buildConfirmedConfig,
  };
}
