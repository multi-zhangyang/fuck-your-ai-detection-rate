import type { ModelConfig, ModelProviderConfig, PromptId, PromptWorkflow, RoundModelConfig } from "@/types/app";

export function getAppendModelOptions(
  modelConfig: ModelConfig,
  providerOptions: ModelProviderConfig[],
  providerId: string,
  selectedModel = "",
): string[] {
  const models = providerId === "__default"
    ? [modelConfig.model]
    : [
      providerOptions.find((item) => item.id === providerId)?.defaultModel,
      ...(providerOptions.find((item) => item.id === providerId)?.models ?? []),
    ];
  return Array.from(new Set([...models, selectedModel].map((item) => String(item ?? "").trim()).filter(Boolean)));
}

export function getAppendDefaultRoute(
  modelConfig: ModelConfig,
  promptProfile: ModelConfig["promptProfile"],
  activeSequenceLength: number,
  getRoundModelKey: (
    profile: ModelConfig["promptProfile"],
    round: number,
    workflows?: PromptWorkflow[],
  ) => string | null,
  findProviderForRoundModel: (
    config: ModelConfig,
    roundModel?: RoundModelConfig,
  ) => ModelProviderConfig | null | undefined,
  promptWorkflows?: PromptWorkflow[],
): { providerId: string; model: string } {
  const lastRoundKey = getRoundModelKey(promptProfile, activeSequenceLength, promptWorkflows);
  const lastRoundModel = lastRoundKey ? modelConfig.roundModels?.[lastRoundKey] : undefined;
  const lastProvider = findProviderForRoundModel(modelConfig, lastRoundModel);
  if (lastRoundModel?.enabled && lastProvider && lastProvider.enabled !== false) {
    return {
      providerId: lastProvider.id,
      model: lastRoundModel.model || lastProvider.defaultModel || lastProvider.models?.[0] || "",
    };
  }
  return { providerId: "__default", model: modelConfig.model || "" };
}

export function buildAppendProviderRoute(input: {
  providerId: string;
  defaultModel: string;
  providerOptions: ModelProviderConfig[];
}): { providerId: string; model: string } {
  if (input.providerId === "__default") {
    return {
      providerId: input.providerId,
      model: input.defaultModel || "",
    };
  }
  const provider = input.providerOptions.find((item) => item.id === input.providerId);
  return {
    providerId: input.providerId,
    model: provider?.defaultModel || provider?.models?.[0] || "",
  };
}

export function resolveAppendProvider(
  appendDraft: { providerId: string } | null,
  providerOptions: ModelProviderConfig[],
): ModelProviderConfig | null {
  if (!appendDraft?.providerId || appendDraft.providerId === "__default") {
    return null;
  }
  return providerOptions.find((item) => item.id === appendDraft.providerId) ?? null;
}

export function buildAppendPromptOptions(
  promptSelectOptions: Array<{ id: PromptId; label: string }>,
): Array<{ id: PromptId; label: string }> {
  return promptSelectOptions.length ? promptSelectOptions : [{ id: "round1" as PromptId, label: "round1" }];
}
