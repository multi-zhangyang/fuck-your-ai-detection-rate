import { stringifyError } from "@/lib/errorText";
import { buildModelConfigFromProvider } from "@/lib/modelRoute";
import { sameCatalogConnection } from "@/lib/modelConfigProviderCatalogMergeHelpers";
import {
  createEmptyProviderModelRefreshState,
  materializeProviderModelsRequestFailureFeedback,
  planProviderModelsRequestFailureFeedback,
  refreshOneProviderModelPatch,
  buildModelConfigWithProviderPatches,
  mergeSavedModelConfig,
  reconcileSavedModelConfig,
} from "@/lib/providerModelHelpers";
import type {
  CollectProviderModelPatchesInput,
  ModelCatalogHandlersDeps,
  ModelCatalogListHandlers,
} from "@/lib/modelCatalogHandlerTypes";
import type { ModelProviderConfig } from "@/types/app";

export function createModelCatalogProviderTaskHelpers(
  deps: ModelCatalogHandlersDeps,
  catalog: ModelCatalogListHandlers,
) {
  function beginProviderModelsTask(runtimeStep: string) {
    const taskTicket = deps.beginTask("loading-models");
    const abortController = catalog.beginCancelableModelCatalogRequest();
    deps.setRuntimeStep(runtimeStep);
    return { taskTicket, abortController };
  }

  function finishProviderModelsTask(input: {
    abortController: AbortController;
    taskTicket: number;
  }) {
    catalog.clearCancelableModelCatalogRequest(input.abortController);
    deps.finishTask(input.taskTicket);
  }

  function applyProviderModelsRequestFailure(
    abortController: AbortController,
    appError: unknown,
    mode: "batch" | "single",
  ) {
    deps.applyOptionalUiFeedback(materializeProviderModelsRequestFailureFeedback(
      planProviderModelsRequestFailureFeedback({
        aborted: abortController.signal.aborted,
        mode,
        message: stringifyError(appError),
      }),
    ));
  }

  async function collectProviderModelPatches(input: CollectProviderModelPatchesInput) {
    const requestBaseConfig = deps.getModelConfig();
    const requestProviders = new Map(input.enabledProviders.map((provider) => [provider.id, provider]));
    const outcomes = await Promise.all(input.enabledProviders.map(async (provider) => {
      const requestConfig = buildModelConfigFromProvider(provider, requestBaseConfig);
      const state = await refreshOneProviderModelPatch({
        provider,
        abortController: input.abortController,
        providerPatches: new Map<string, Partial<ModelProviderConfig>>(),
        failures: [],
        baseConfig: requestBaseConfig,
        listModels: (config, signal) => deps.service.listModels(config, signal),
        stringifyError,
      });
      const latestConfig = deps.getModelConfig();
      const latestProvider = latestConfig.modelProviders?.find((item) => item.id === provider.id);
      if (!latestProvider || !sameCatalogConnection(
        requestConfig,
        buildModelConfigFromProvider(latestProvider, latestConfig),
      )) {
        state.providerPatches.delete(provider.id);
        state.failures = latestProvider
          ? [`${latestProvider.name || latestProvider.id}：连接配置已变化，已忽略旧模型列表`]
          : [];
      }
      return state;
    }));
    const combined = createEmptyProviderModelRefreshState();
    for (const outcome of outcomes) {
      for (const [providerId, patch] of outcome.providerPatches) {
        combined.providerPatches.set(providerId, patch);
      }
      combined.failures.push(...outcome.failures);
    }
    return { ...combined, requestProviders };
  }

  async function saveModelConfigWithProviderPatches(
    providerPatches: Map<string, Partial<ModelProviderConfig>>,
    providers?: ModelProviderConfig[],
    requestProviders?: Map<string, ModelProviderConfig>,
    shouldCommit?: () => boolean,
  ) {
    const latestConfig = deps.getModelConfig();
    const latestProviders = providers ?? latestConfig.modelProviders ?? [];
    const latestProviderById = new Map(latestProviders.map((provider) => [provider.id, provider]));
    const safePatches = new Map<string, Partial<ModelProviderConfig>>();
    for (const [providerId, patch] of providerPatches) {
      const latestProvider = latestProviderById.get(providerId);
      const requestProvider = requestProviders?.get(providerId);
      if (latestProvider && requestProvider && latestProvider.defaultModel !== requestProvider.defaultModel) {
        const { defaultModel: _staleDefaultModel, ...catalogPatch } = patch;
        safePatches.set(providerId, catalogPatch);
      } else {
        safePatches.set(providerId, patch);
      }
    }
    const nextConfig = buildModelConfigWithProviderPatches(latestConfig, latestProviders, safePatches);
    if (shouldCommit && !shouldCommit()) return nextConfig;
    const saved = await deps.service.saveModelConfig(nextConfig);
    if (shouldCommit && !shouldCommit()) return nextConfig;
    const mergedSaved = mergeSavedModelConfig(saved, nextConfig);
    deps.setModelConfig(reconcileSavedModelConfig(nextConfig, mergedSaved, deps.getModelConfig()));
    return nextConfig;
  }

  return {
    beginProviderModelsTask,
    finishProviderModelsTask,
    applyProviderModelsRequestFailure,
    collectProviderModelPatches,
    saveModelConfigWithProviderPatches,
  };
}
