import { providerToModelConfig } from "@/lib/modelConfigCardHelpers";
import {
  createModelConfigProviderMutationHandlers,
  type ModelConfigProviderCatalogInput,
  type ProviderCatalogBusyMap,
  type ProviderCatalogErrorMap,
} from "@/lib/modelConfigProviderMutationHandlers";
import type { ModelCatalogResult, ModelConfig, ModelProviderConfig } from "@/types/app";

export type {
  ProviderCatalogBusyMap,
  ProviderCatalogErrorMap,
} from "@/lib/modelConfigProviderMutationHandlers";

export function createModelConfigProviderCatalogHandlers(input: ModelConfigProviderCatalogInput & {
  onListModelsForConfig: (config: ModelConfig, signal?: AbortSignal) => Promise<ModelCatalogResult | null>;
  setProviderCatalogBusy: (updater: (current: ProviderCatalogBusyMap) => ProviderCatalogBusyMap) => void;
  setProviderCatalogErrors: (updater: (current: ProviderCatalogErrorMap) => ProviderCatalogErrorMap) => void;
}) {
  const mutation = createModelConfigProviderMutationHandlers(input);
  const {
    updateProvider,
    beginProviderCatalogRequest,
    clearProviderCatalogRequest,
  } = mutation;

  async function refreshProviderCatalog(provider: ModelProviderConfig) {
    const abortController = beginProviderCatalogRequest();
    input.setProviderCatalogBusy((current) => ({ ...current, [provider.id]: true }));
    input.setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "" }));
    try {
      const value = input.getValue();
      const onListModelsForConfig = input.onListModelsForConfig;
      const catalog = await onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal);
      if (catalog) {
        updateProvider(provider.id, {
          models: catalog.models.map((item) => item.id),
          defaultModel: provider.defaultModel || catalog.models[0]?.id || "",
        });
      }
    } catch (error) {
      input.setProviderCatalogErrors((current) => ({
        ...current,
        [provider.id]: abortController.signal.aborted
          ? "已停止读取模型列表。"
          : error instanceof Error ? error.message : String(error),
      }));
    } finally {
      clearProviderCatalogRequest(abortController);
      input.setProviderCatalogBusy((current) => ({ ...current, [provider.id]: false }));
    }
  }

  async function refreshAllProviderCatalogs() {
    const value = input.getValue();
    const providers = value.modelProviders ?? [];
    const enabledProviders = providers.filter((provider) => provider.enabled !== false);
    if (!enabledProviders.length) return;
    const abortController = beginProviderCatalogRequest();
    let nextProviders = [...providers];
    for (const provider of enabledProviders) {
      if (abortController.signal.aborted) {
        break;
      }
      input.setProviderCatalogBusy((current) => ({ ...current, [provider.id]: true }));
      input.setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "" }));
      try {
        const onListModelsForConfig = input.onListModelsForConfig;
        const catalog = await onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal);
        if (catalog) {
          nextProviders = nextProviders.map((item) => (
            item.id === provider.id
              ? {
                ...item,
                models: catalog.models.map((model) => model.id),
                defaultModel: item.defaultModel || catalog.models[0]?.id || "",
                updatedAt: new Date().toISOString(),
              }
              : item
          ));
        }
      } catch (error) {
        if (abortController.signal.aborted) {
          input.setProviderCatalogErrors((current) => ({ ...current, [provider.id]: "已停止读取模型列表。" }));
          break;
        }
        input.setProviderCatalogErrors((current) => ({
          ...current,
          [provider.id]: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        input.setProviderCatalogBusy((current) => ({ ...current, [provider.id]: false }));
      }
    }
    clearProviderCatalogRequest(abortController);
    const nextConfig = { ...value, modelProviders: nextProviders };
    input.onChange(nextConfig);
    input.onSave(nextConfig);
  }

  return {
    ...mutation,
    refreshProviderCatalog,
    refreshAllProviderCatalogs,
  };
}
