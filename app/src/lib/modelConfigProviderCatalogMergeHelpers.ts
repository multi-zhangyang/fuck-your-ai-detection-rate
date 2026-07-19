import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function sameCatalogConnection(left: ModelConfig, right: ModelConfig): boolean {
  return left.baseUrl.trim() === right.baseUrl.trim()
    && left.apiKey.trim() === right.apiKey.trim()
    && left.apiType === right.apiType;
}

export type ProviderCatalogResultPatch = {
  providerId: string;
  modelIds: string[];
};

export function mergeProviderCatalogResults(
  latestConfig: ModelConfig,
  results: ProviderCatalogResultPatch[],
  updatedAt = new Date().toISOString(),
  requestProviders?: ModelProviderConfig[],
): { config: ModelConfig; appliedProviderIds: string[] } {
  const resultByProvider = new Map(results.map((result) => [result.providerId, result]));
  const requestProviderById = new Map((requestProviders ?? []).map((provider) => [provider.id, provider]));
  const appliedProviderIds: string[] = [];
  const modelProviders = (latestConfig.modelProviders ?? []).map((provider) => {
    const result = resultByProvider.get(provider.id);
    if (!result) return provider;
    appliedProviderIds.push(provider.id);
    const requestProvider = requestProviderById.get(provider.id);
    const defaultModel = requestProvider
      ? provider.defaultModel === requestProvider.defaultModel
        ? provider.defaultModel || result.modelIds[0] || ""
        : provider.defaultModel
      : provider.defaultModel || result.modelIds[0] || "";
    return {
      ...provider,
      models: result.modelIds,
      // A default chosen or edited while the request was running wins.  The
      // first returned model is only a fallback for an actually empty field.
      defaultModel,
      updatedAt,
    };
  });
  return {
    config: { ...latestConfig, modelProviders },
    appliedProviderIds,
  };
}
