import {
  pickDefaultModelFromCatalog,
  applyProviderModelPatches,
} from "@/lib/providerModelCatalogPatchHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export function formatProviderModelsRefreshFailure(
  provider: ModelProviderConfig,
  errorText: string,
): string {
  return `${provider.name || provider.id}：${errorText}`;
}

export function buildProviderModelsAbortedError(): Error {
  return new Error("操作已停止。");
}

export function buildModelConfigWithProviderPatches(
  config: ModelConfig,
  providers: ModelProviderConfig[],
  patches: Map<string, Partial<ModelProviderConfig>> | Record<string, Partial<ModelProviderConfig>>,
): ModelConfig {
  return {
    ...config,
    modelProviders: applyProviderModelPatches(providers, patches),
  };
}

export function resolveNextModelFromCatalog(
  currentModel: string,
  modelIds: string[],
): string | null {
  const nextModel = pickDefaultModelFromCatalog(currentModel, modelIds);
  return nextModel !== currentModel ? nextModel : null;
}
