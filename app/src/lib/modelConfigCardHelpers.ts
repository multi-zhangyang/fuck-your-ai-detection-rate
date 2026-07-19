import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export const NUMBER_FIELDS = new Set<keyof ModelConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rewriteConcurrency"]);
export const PROVIDER_NUMBER_FIELDS = new Set<keyof ModelProviderConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rateLimitWindowMinutes", "rateLimitMaxRequests"]);

export const API_OPTIONS: Array<{ value: ModelConfig["apiType"]; label: string }> = [
  { value: "chat_completions", label: "chat/completions" },
  { value: "responses", label: "responses" },
];

let providerIdSequence = 0;

function createProviderId(existingProviders: ModelProviderConfig[]): string {
  const existingIds = new Set(existingProviders.map((provider) => provider.id));
  const timestamp = Date.now().toString(36);
  let candidate = "";
  do {
    providerIdSequence += 1;
    candidate = `provider-${timestamp}-${providerIdSequence.toString(36)}`;
  } while (existingIds.has(candidate));
  return candidate;
}

export function createModelProvider(value: ModelConfig): ModelProviderConfig {
  const existingProviders = value.modelProviders ?? [];
  return {
    id: createProviderId(existingProviders),
    name: `服务商 ${((value.modelProviders?.length ?? 0) + 1)}`,
    enabled: true,
    baseUrl: value.baseUrl,
    apiKey: value.apiKey,
    apiType: value.apiType,
    streaming: value.streaming,
    temperature: value.temperature,
    requestTimeoutSeconds: value.requestTimeoutSeconds,
    maxRetries: value.maxRetries,
    rateLimitWindowMinutes: 0,
    rateLimitMaxRequests: 0,
    models: value.model ? [value.model] : [],
    defaultModel: value.model,
    updatedAt: new Date().toISOString(),
  };
}

export function removeModelProvider(value: ModelConfig, providerId: string): ModelConfig {
  const provider = value.modelProviders?.find((item) => item.id === providerId);
  if (!provider) return value;
  const roundModels = value.roundModels
    ? Object.fromEntries(Object.entries(value.roundModels).filter(([, route]) => !(
      route.providerId === providerId
      || (
        !route.providerId
        && route.providerName === provider.name
        && route.baseUrl === provider.baseUrl
      )
    )))
    : value.roundModels;
  return {
    ...value,
    modelProviders: (value.modelProviders ?? []).filter((item) => item.id !== providerId),
    roundModels,
  };
}

export function providerToModelConfig(value: ModelConfig, provider: ModelProviderConfig, model?: string): ModelConfig {
  return {
    ...value,
    baseUrl: provider.baseUrl.trim() || value.baseUrl,
    apiKey: provider.apiKey.trim() || value.apiKey,
    model: (model ?? provider.defaultModel ?? "").trim() || value.model,
    apiType: provider.apiType || value.apiType,
    streaming: provider.streaming ?? value.streaming,
    temperature: typeof provider.temperature === "number" ? provider.temperature : value.temperature,
    requestTimeoutSeconds: typeof provider.requestTimeoutSeconds === "number" ? provider.requestTimeoutSeconds : value.requestTimeoutSeconds,
    maxRetries: typeof provider.maxRetries === "number" ? provider.maxRetries : value.maxRetries,
  };
}
