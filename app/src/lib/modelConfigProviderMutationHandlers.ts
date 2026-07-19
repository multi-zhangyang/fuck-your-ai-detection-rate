import {
  createModelProvider,
  providerToModelConfig,
  removeModelProvider,
} from "@/lib/modelConfigCardHelpers";
import {
  beginProviderCatalogRequest as beginCatalogRequest,
  finishProviderCatalogRequest,
  isProviderCatalogRequestCurrent as requestIsCurrent,
  isProviderCatalogRequestLatest as requestIsLatest,
  stopProviderCatalogRequests,
  type ProviderCatalogRequestHandle,
  type ProviderCatalogRequestRegistry,
} from "@/lib/modelConfigProviderCatalogRequestHelpers";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export {
  createProviderCatalogRequestRegistry,
  type ProviderCatalogRequestHandle,
  type ProviderCatalogRequestRegistry,
} from "@/lib/modelConfigProviderCatalogRequestHelpers";

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
  getRequestRegistry: () => ProviderCatalogRequestRegistry;
};

export function createModelConfigProviderMutationHandlers(input: ModelConfigProviderCatalogInput) {
  function updateProviders(providers: ModelProviderConfig[]) {
    const nextConfig = { ...input.getValue(), modelProviders: providers };
    input.onChange(nextConfig);
    return nextConfig;
  }

  function addProvider() {
    const provider = createModelProvider(input.getValue());
    updateProviders([...(input.getValue().modelProviders ?? []), provider]);
    input.setSelectedProviderId(provider.id);
  }

  function deleteProvider(providerId: string) {
    const provider = (input.getValue().modelProviders ?? []).find((item) => item.id === providerId);
    if (!provider) return;
    if (typeof globalThis.confirm === "function" && !globalThis.confirm(
      `确认删除服务商“${provider.name || provider.id}”吗？确认后会立即保存本机配置，不会删除任何远端账号或数据。`,
    )) return;
    const nextConfig = removeModelProvider(input.getValue(), providerId);
    const nextProviders = nextConfig.modelProviders ?? [];
    input.onChange(nextConfig);
    if (input.getSelectedProviderId() === providerId) {
      input.setSelectedProviderId(nextProviders[0]?.id ?? "");
    }
    input.onSave(nextConfig);
  }

  function updateProvider(providerId: string, patch: Partial<ModelProviderConfig>) {
    const nextProviders = (input.getValue().modelProviders ?? []).map((provider) => (
      provider.id === providerId
        ? (() => {
          const connectionChanged = (
            (patch.baseUrl !== undefined && patch.baseUrl.trim() !== provider.baseUrl.trim())
            || (patch.apiKey !== undefined && patch.apiKey.trim() !== provider.apiKey.trim())
            || (patch.apiType !== undefined && patch.apiType !== provider.apiType)
          );
          return {
            ...provider,
            ...patch,
            ...(connectionChanged ? { models: [] } : {}),
            updatedAt: new Date().toISOString(),
          };
        })()
        : provider
    ));
    updateProviders(nextProviders);
  }

  function beginProviderCatalogRequestHandle(providerIds: string[] = []): ProviderCatalogRequestHandle {
    const registry = input.getRequestRegistry();
    const handle = beginCatalogRequest(registry, providerIds);
    input.setAbortController(handle.abortController);
    return handle;
  }

  function beginProviderCatalogRequest(): AbortController {
    return beginProviderCatalogRequestHandle().abortController;
  }

  function clearProviderCatalogRequestHandle(handle: ProviderCatalogRequestHandle) {
    const registry = input.getRequestRegistry();
    finishProviderCatalogRequest(registry, handle);
    if (input.getAbortController() === handle.abortController) {
      const activeRequests = [...registry.activeRequests.values()];
      const latestActive = activeRequests.length ? activeRequests[activeRequests.length - 1] : undefined;
      input.setAbortController(latestActive?.abortController ?? null);
    }
  }

  function clearProviderCatalogRequest(controller: AbortController) {
    const request = [...input.getRequestRegistry().activeRequests.values()]
      .find((item) => item.abortController === controller);
    if (request) clearProviderCatalogRequestHandle(request);
  }

  function isProviderCatalogRequestCurrent(handle: ProviderCatalogRequestHandle): boolean {
    return requestIsCurrent(input.getRequestRegistry(), handle);
  }

  function isProviderCatalogRequestLatest(handle: ProviderCatalogRequestHandle): boolean {
    return requestIsLatest(input.getRequestRegistry(), handle);
  }

  function stopProviderCatalogRequest() {
    stopProviderCatalogRequests(input.getRequestRegistry());
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
    beginProviderCatalogRequestHandle,
    beginProviderCatalogRequest,
    clearProviderCatalogRequestHandle,
    clearProviderCatalogRequest,
    isProviderCatalogRequestCurrent,
    isProviderCatalogRequestLatest,
    stopProviderCatalogRequest,
    saveProviderConfig,
  };
}
