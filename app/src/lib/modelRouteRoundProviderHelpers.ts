import { buildRoundModelFromProvider, findProviderForRoundModel } from "@/lib/modelRoute";
import { getRoundModelKey } from "@/lib/promptRegistry";
import type { ModelConfig, PromptWorkflow } from "@/types/app";

export function withRoundProvider(
  config: ModelConfig,
  promptProfile: ModelConfig["promptProfile"],
  roundIndex: number,
  providerId: string,
  promptWorkflows?: PromptWorkflow[],
): ModelConfig {
  const roundKey = getRoundModelKey(promptProfile, roundIndex + 1, promptWorkflows);
  if (!roundKey) {
    return config;
  }
  const currentProviders = config.modelProviders ?? [];
  const nextRoundModels = { ...(config.roundModels ?? {}) };
  if (providerId === "__default") {
    nextRoundModels[roundKey] = {
      ...(nextRoundModels[roundKey] ?? buildRoundModelFromProvider({
        id: "__default",
        name: "默认连接",
        enabled: true,
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiType: config.apiType,
        streaming: config.streaming,
        defaultModel: config.model,
      }, config.model, config)),
      enabled: false,
    };
    return { ...config, roundModels: nextRoundModels };
  }
  const provider = currentProviders.find((item) => item.id === providerId);
  if (!provider) {
    return config;
  }
  nextRoundModels[roundKey] = buildRoundModelFromProvider(provider, provider.defaultModel || provider.models?.[0] || "", config);
  return { ...config, roundModels: nextRoundModels };
}

export function withRoundModel(
  config: ModelConfig,
  promptProfile: ModelConfig["promptProfile"],
  roundIndex: number,
  model: string,
  promptWorkflows?: PromptWorkflow[],
): ModelConfig {
  const roundKey = getRoundModelKey(promptProfile, roundIndex + 1, promptWorkflows);
  if (!roundKey) {
    return config;
  }
  const currentRound = config.roundModels?.[roundKey];
  const provider = currentRound?.enabled ? findProviderForRoundModel(config, currentRound) : null;
  const usableProvider = provider?.enabled === false ? null : provider;
  const nextRoundModels = { ...(config.roundModels ?? {}) };
  if (usableProvider) {
    nextRoundModels[roundKey] = buildRoundModelFromProvider(usableProvider, model, config);
  } else {
    nextRoundModels[roundKey] = {
      enabled: false,
      providerName: "默认连接",
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model,
      apiType: config.apiType,
      streaming: config.streaming,
      temperature: config.temperature,
      requestTimeoutSeconds: config.requestTimeoutSeconds,
      maxRetries: config.maxRetries,
    };
  }
  return { ...config, roundModels: nextRoundModels, model: usableProvider ? config.model : model };
}
