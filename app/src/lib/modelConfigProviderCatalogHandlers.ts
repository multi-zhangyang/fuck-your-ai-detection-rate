import { providerToModelConfig } from "@/lib/modelConfigCardHelpers";
import {
  mergeProviderCatalogResults,
  sameCatalogConnection,
} from "@/lib/modelConfigProviderCatalogMergeHelpers";
import {
  createModelConfigProviderMutationHandlers,
  type ModelConfigProviderCatalogInput,
  type ProviderCatalogBusyMap,
  type ProviderCatalogErrorMap,
  type ProviderCatalogRequestHandle,
} from "@/lib/modelConfigProviderMutationHandlers";
import { getActiveProviderCatalogIds } from "@/lib/modelConfigProviderCatalogRequestHelpers";
import { getProviderConnectionIssue } from "@/lib/providerModelCatalogPatchCore";
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

  function syncProviderCatalogBusy() {
    const activeProviderIds = getActiveProviderCatalogIds(input.getRequestRegistry());
    input.setProviderCatalogBusy((current) => {
      const next = { ...current };
      for (const providerId of Object.keys(next)) {
        if (!activeProviderIds.has(providerId)) delete next[providerId];
      }
      for (const providerId of activeProviderIds) next[providerId] = true;
      return next;
    });
  }

  function beginRequest(providerIds: string[]): ProviderCatalogRequestHandle {
    const handle = mutation.beginProviderCatalogRequestHandle(providerIds);
    syncProviderCatalogBusy();
    input.setProviderCatalogErrors((current) => {
      const next = { ...current };
      for (const providerId of providerIds) next[providerId] = "";
      return next;
    });
    return handle;
  }

  function finishRequest(handle: ProviderCatalogRequestHandle) {
    mutation.clearProviderCatalogRequestHandle(handle);
    syncProviderCatalogBusy();
  }

  function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  function applyCurrentErrors(handle: ProviderCatalogRequestHandle, errors: ProviderCatalogErrorMap) {
    if (!mutation.isProviderCatalogRequestLatest(handle)) return;
    input.setProviderCatalogErrors((current) => ({ ...current, ...errors }));
  }

  async function refreshProviderCatalog(provider: ModelProviderConfig) {
    const currentValue = input.getValue();
    const currentProvider = currentValue.modelProviders?.find((item) => item.id === provider.id);
    if (!currentProvider) return;
    const connectionIssue = getProviderConnectionIssue(currentProvider);
    if (connectionIssue) {
      input.setProviderCatalogErrors((current) => ({
        ...current,
        [currentProvider.id]: connectionIssue,
      }));
      return;
    }
    const requestConfig = providerToModelConfig(currentValue, currentProvider);
    const handle = beginRequest([currentProvider.id]);
    try {
      const catalog = await input.onListModelsForConfig(
        requestConfig,
        handle.abortController.signal,
      );
      if (!catalog) {
        if (mutation.isProviderCatalogRequestLatest(handle)) {
          applyCurrentErrors(handle, { [currentProvider.id]: "模型服务未返回目录。" });
        }
        return;
      }
      if (!mutation.isProviderCatalogRequestCurrent(handle)) return;
      const latestValue = input.getValue();
      const latestProvider = latestValue.modelProviders?.find((item) => item.id === currentProvider.id);
      if (!latestProvider) return;
      if (!sameCatalogConnection(requestConfig, providerToModelConfig(latestValue, latestProvider))) {
        applyCurrentErrors(handle, { [currentProvider.id]: "连接配置已变化，已忽略旧模型列表。" });
        return;
      }
      const { config, appliedProviderIds } = mergeProviderCatalogResults(latestValue, [{
        providerId: currentProvider.id,
        modelIds: catalog.models.map((item) => item.id),
      }], undefined, [currentProvider]);
      if (appliedProviderIds.length) input.onChange(config);
    } catch (error) {
      applyCurrentErrors(handle, {
        [currentProvider.id]: handle.abortController.signal.aborted
          ? "已停止读取模型列表。"
          : errorText(error),
      });
    } finally {
      finishRequest(handle);
    }
  }

  async function refreshAllProviderCatalogs() {
    const requestValue = input.getValue();
    const enabledProviders = (requestValue.modelProviders ?? [])
      .filter((provider) => provider.enabled !== false);
    if (!enabledProviders.length) return;

    const handle = beginRequest(enabledProviders.map((provider) => provider.id));
    try {
      const outcomes = await Promise.all(enabledProviders.map(async (provider) => {
        const connectionIssue = getProviderConnectionIssue(provider);
        const requestConfig = providerToModelConfig(requestValue, provider);
        if (connectionIssue) {
          return { providerId: provider.id, requestConfig, modelIds: null, error: connectionIssue };
        }
        try {
          const catalog = await input.onListModelsForConfig(
            requestConfig,
            handle.abortController.signal,
          );
          return catalog
            ? { providerId: provider.id, requestConfig, modelIds: catalog.models.map((model) => model.id), error: "" }
            : { providerId: provider.id, requestConfig, modelIds: null, error: "模型服务未返回目录。" };
        } catch (error) {
          return {
            providerId: provider.id,
            requestConfig,
            modelIds: null,
            error: errorText(error),
          };
        }
      }));

      if (!mutation.isProviderCatalogRequestCurrent(handle)) {
        if (mutation.isProviderCatalogRequestLatest(handle) && handle.abortController.signal.aborted) {
          applyCurrentErrors(handle, Object.fromEntries(
            enabledProviders
              .filter((provider) => input.getValue().modelProviders?.some((item) => item.id === provider.id))
              .map((provider) => [provider.id, "已停止读取模型列表。"]),
          ));
        }
        return;
      }

      const latestValue = input.getValue();
      const applicableOutcomes = outcomes.filter((outcome) => {
        if (!outcome.modelIds) return false;
        const latestProvider = latestValue.modelProviders?.find((provider) => provider.id === outcome.providerId);
        return Boolean(
          latestProvider
          && sameCatalogConnection(outcome.requestConfig, providerToModelConfig(latestValue, latestProvider)),
        );
      });
      const errors = Object.fromEntries(outcomes.flatMap((outcome) => {
        if (!latestValue.modelProviders?.some((provider) => provider.id === outcome.providerId)) return [];
        if (outcome.error) return [[outcome.providerId, outcome.error]];
        if (!applicableOutcomes.includes(outcome)) {
          return [[outcome.providerId, "连接配置已变化，已忽略旧模型列表。"]];
        }
        return [];
      }));
      applyCurrentErrors(handle, errors);
      const { config, appliedProviderIds } = mergeProviderCatalogResults(
        latestValue,
        applicableOutcomes.flatMap((outcome) => outcome.modelIds
          ? [{ providerId: outcome.providerId, modelIds: outcome.modelIds }]
          : []),
        undefined,
        enabledProviders,
      );
      if (!appliedProviderIds.length) return;

      // Merge against getValue() at completion.  New providers stay present,
      // deleted providers cannot reappear, and only catalog-owned fields are
      // patched on providers edited during the request.
      input.onChange(config);
      input.onSave(config);
    } finally {
      finishRequest(handle);
    }
  }

  return {
    ...mutation,
    refreshProviderCatalog,
    refreshAllProviderCatalogs,
  };
}
