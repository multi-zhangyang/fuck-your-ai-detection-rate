import {
  createModelProvider,
  providerToModelConfig,
} from "@/lib/modelConfigCardHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export type ProviderCatalogBusyMap = Partial<Record<string, boolean>>;
export type ProviderCatalogErrorMap = Partial<Record<string, string>>;

export type ModelConfigProviderCatalogInput = {
  getValue: () => ModelConfig;
  onChange: (value: ModelConfig) => void;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  getSelectedProviderId: () => string;
  setSelectedProviderId: (providerId: string) => void;
  getAbortController: () => AbortController | null;
  setAbortController: (controller: AbortController | null) => void;
};

export function createModelConfigProviderMutationHandlers(input: ModelConfigProviderCatalogInput) {
  function updateProviders(providers: ModelProviderConfig[]) {
    input.onChange({ ...input.getValue(), modelProviders: providers });
  }

  function addProvider() {
    const provider = createModelProvider(input.getValue());
    updateProviders([...(input.getValue().modelProviders ?? []), provider]);
    input.setSelectedProviderId(provider.id);
  }

  function deleteProvider(providerId: string) {
    const nextProviders = (input.getValue().modelProviders ?? []).filter((provider) => provider.id !== providerId);
    updateProviders(nextProviders);
    if (input.getSelectedProviderId() === providerId) {
      input.setSelectedProviderId(nextProviders[0]?.id ?? "");
    }
  }

  function updateProvider(providerId: string, patch: Partial<ModelProviderConfig>) {
    const nextProviders = (input.getValue().modelProviders ?? []).map((provider) => (
      provider.id === providerId ? { ...provider, ...patch, updatedAt: new Date().toISOString() } : provider
    ));
    updateProviders(nextProviders);
  }

  function beginProviderCatalogRequest(): AbortController {
    input.getAbortController()?.abort("fyadr-provider-catalog-replaced");
    const controller = new AbortController();
    input.setAbortController(controller);
    return controller;
  }

  function clearProviderCatalogRequest(controller: AbortController) {
    if (input.getAbortController() === controller) {
      input.setAbortController(null);
    }
  }

  function stopProviderCatalogRequest() {
    input.getAbortController()?.abort("fyadr-user-cancel");
  }

  function saveProviderConfig(provider: ModelProviderConfig) {
    const value = input.getValue();
    const testValue = provider.enabled === false ? undefined : providerToModelConfig(value, provider);
    input.onSave(value, testValue);
  }

  return {
    updateProviders,
    addProvider,
    deleteProvider,
    updateProvider,
    beginProviderCatalogRequest,
    clearProviderCatalogRequest,
    stopProviderCatalogRequest,
    saveProviderConfig,
  };
}
