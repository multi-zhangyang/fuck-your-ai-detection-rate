import type { ModelConfig, ModelProviderConfig, PromptOption, PromptWorkflow, RoundModelConfig } from "@/types/app";
import {
  getDefaultPromptProfile,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";

export const MAX_REWRITE_CONCURRENCY = 16;
export const REWRITE_CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

export function normalizeRewriteConcurrency(value: unknown, fallback = 2): number {
  const fallbackValue = Number(fallback) || 2;
  const normalized = Number(value);
  return Math.max(
    1,
    Math.min(
      MAX_REWRITE_CONCURRENCY,
      Number.isFinite(normalized) && normalized > 0 ? normalized : fallbackValue,
    ),
  );
}

export function promptSequencesEqual(
  left: unknown,
  right: unknown,
  options?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  workflows?: PromptWorkflow[],
): boolean {
  const normalizedLeft = normalizePromptSequence(left, options, promptProfile, workflows);
  const normalizedRight = normalizePromptSequence(right, options, promptProfile, workflows);
  if (normalizedLeft.length !== normalizedRight.length) {
    return false;
  }
  return normalizedLeft.every((item, index) => item === normalizedRight[index]);
}

export function normalizeActiveModelConfig(
  config: ModelConfig,
  options?: PromptOption[],
  workflows?: PromptWorkflow[],
): ModelConfig {
  const promptProfile = normalizePromptProfile(config.promptProfile, workflows) ?? getDefaultPromptProfile(workflows);
  const promptSequence = normalizePromptSequence(config.promptSequence, options, promptProfile, workflows);
  if (
    config.promptProfile === promptProfile
    && promptSequencesEqual(config.promptSequence, promptSequence, options, promptProfile, workflows)
  ) {
    return config;
  }
  return { ...config, promptProfile, promptSequence };
}

export function buildRoundModelFromProvider(
  provider: ModelProviderConfig,
  model: string,
  fallback: ModelConfig,
): RoundModelConfig {
  return {
    enabled: true,
    providerId: provider.id,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: model || provider.defaultModel || provider.models?.[0] || "",
    apiType: provider.apiType || fallback.apiType,
    streaming: provider.streaming ?? fallback.streaming,
    temperature: provider.temperature ?? fallback.temperature,
    requestTimeoutSeconds: provider.requestTimeoutSeconds ?? fallback.requestTimeoutSeconds,
    maxRetries: provider.maxRetries ?? fallback.maxRetries,
    rateLimitWindowMinutes: provider.rateLimitWindowMinutes ?? 0,
    rateLimitMaxRequests: provider.rateLimitMaxRequests ?? 0,
  };
}

export function buildModelConfigFromProvider(
  provider: ModelProviderConfig,
  fallback: ModelConfig,
  model?: string,
): ModelConfig {
  return {
    ...fallback,
    baseUrl: provider.baseUrl || fallback.baseUrl,
    apiKey: provider.apiKey || fallback.apiKey,
    model: model || provider.defaultModel || provider.models?.[0] || fallback.model,
    apiType: provider.apiType || fallback.apiType,
    streaming: provider.streaming ?? fallback.streaming,
    temperature: provider.temperature ?? fallback.temperature,
    requestTimeoutSeconds: provider.requestTimeoutSeconds ?? fallback.requestTimeoutSeconds,
    maxRetries: provider.maxRetries ?? fallback.maxRetries,
  };
}

export function findProviderForRoundModel(
  config: ModelConfig,
  roundModel?: RoundModelConfig,
): ModelProviderConfig | null {
  if (!roundModel?.enabled) return null;
  const providers = config.modelProviders ?? [];
  return (
    providers.find((provider) => provider.id && provider.id === roundModel.providerId)
    ?? providers.find((provider) => provider.baseUrl === roundModel.baseUrl && provider.name === roundModel.providerName)
    ?? providers.find((provider) => provider.baseUrl === roundModel.baseUrl)
    ?? null
  );
}
