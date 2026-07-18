import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function buildProviderModelsPatch(
  provider: ModelProviderConfig,
  modelIds: string[],
  nowIso = new Date().toISOString(),
): Partial<ModelProviderConfig> {
  return {
    models: modelIds,
    defaultModel: provider.defaultModel || modelIds[0] || "",
    updatedAt: nowIso,
  };
}

export function applyProviderModelPatches(
  providers: ModelProviderConfig[],
  patches: Map<string, Partial<ModelProviderConfig>> | Record<string, Partial<ModelProviderConfig>>,
): ModelProviderConfig[] {
  const patchMap = patches instanceof Map ? patches : new Map(Object.entries(patches));
  return providers.map((provider) => ({
    ...provider,
    ...(patchMap.get(provider.id) ?? {}),
  }));
}

export function mergeSavedModelConfig(saved: ModelConfig, nextConfig: ModelConfig): ModelConfig {
  return {
    ...saved,
    ...nextConfig,
    roundModels: { ...(saved.roundModels ?? {}), ...(nextConfig.roundModels ?? {}) },
  };
}

export function getEnabledProviders(providers: ModelProviderConfig[] | undefined): ModelProviderConfig[] {
  return (providers ?? []).filter((provider) => provider.enabled !== false);
}

export function getProviderConnectionIssue(provider: ModelProviderConfig): string | null {
  if (!provider.baseUrl.trim() || !provider.apiKey.trim()) {
    return `${provider.name || provider.id}：连接信息不完整`;
  }
  return null;
}

export function pickDefaultModelFromCatalog(currentModel: string, modelIds: string[]): string {
  if (currentModel.trim()) {
    return currentModel;
  }
  return modelIds[0] || currentModel;
}
