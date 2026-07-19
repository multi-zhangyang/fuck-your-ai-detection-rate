import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export const NUMBER_FIELDS = new Set<keyof ModelConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rewriteConcurrency"]);
export const PROVIDER_NUMBER_FIELDS = new Set<keyof ModelProviderConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rateLimitWindowMinutes", "rateLimitMaxRequests"]);

export const API_OPTIONS: Array<{ value: ModelConfig["apiType"]; label: string }> = [
  { value: "chat_completions", label: "chat/completions" },
  { value: "responses", label: "responses" },
];

export function createModelProvider(value: ModelConfig): ModelProviderConfig {
  const timestamp = Date.now().toString(36);
  return {
    id: `provider-${timestamp}`,
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
