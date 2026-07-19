import { buildModelConfigFromProvider } from "@/lib/modelRoute";
import { sameCatalogConnection } from "@/lib/modelConfigProviderCatalogMergeHelpers";
import {
  buildNoEnabledProvidersNotice,
  buildProviderMissingNotice,
  buildProviderModelsBatchLoadingRuntimeStep,
  buildProviderModelsBatchSuccessRuntimeStep,
  buildProviderModelsPatch,
  buildProviderModelsSingleLoadingRuntimeStep,
  buildProviderModelsSingleSuccessRuntimeStep,
  formatProviderModelsBatchNotice,
  formatProviderModelsRefreshNotice,
  getEnabledProviders,
} from "@/lib/providerModelHelpers";
import { createModelCatalogProviderTaskHelpers } from "@/lib/modelCatalogProviderTaskHandlers";
import type {
  ModelCatalogHandlersDeps,
  ModelCatalogListHandlers,
  ModelCatalogProviderHandlers,
} from "@/lib/modelCatalogHandlerTypes";
import type { ModelProviderConfig } from "@/types/app";

export function createModelCatalogProviderHandlers(
  deps: ModelCatalogHandlersDeps,
  catalog: ModelCatalogListHandlers,
): ModelCatalogProviderHandlers {
  const task = createModelCatalogProviderTaskHelpers(deps, catalog);

  async function handleRefreshAllProviderModels() {
    const providers = deps.getModelConfig().modelProviders ?? [];
    const enabledProviders = getEnabledProviders(providers);
    if (!enabledProviders.length) {
      deps.setNotice(buildNoEnabledProvidersNotice());
      return;
    }
    const { taskTicket, abortController } = task.beginProviderModelsTask(buildProviderModelsBatchLoadingRuntimeStep());
    try {
      const { providerPatches, failures, requestProviders } = await task.collectProviderModelPatches({
        enabledProviders,
        abortController,
      });
      if (!catalog.isModelCatalogRequestCurrent(abortController)) return;
      if (providerPatches.size) {
        await task.saveModelConfigWithProviderPatches(
          providerPatches,
          undefined,
          requestProviders,
          () => catalog.isModelCatalogRequestCurrent(abortController),
        );
      }
      if (!catalog.isModelCatalogRequestCurrent(abortController)) return;
      deps.setNotice(formatProviderModelsBatchNotice(providerPatches.size, failures));
      deps.setRuntimeStep(buildProviderModelsBatchSuccessRuntimeStep());
    } catch (appError) {
      if (catalog.isModelCatalogRequestLatest(abortController)) {
        task.applyProviderModelsRequestFailure(abortController, appError, "batch");
      }
    } finally {
      task.finishProviderModelsTask({ abortController, taskTicket });
    }
  }

  async function refreshSingleProviderModels(provider: ModelProviderConfig) {
    const { taskTicket, abortController } = task.beginProviderModelsTask(
      buildProviderModelsSingleLoadingRuntimeStep(provider.name),
    );
    try {
      const requestConfig = buildModelConfigFromProvider(provider, deps.getModelConfig());
      const modelIds = (await deps.service.listModels(
        requestConfig,
        abortController.signal,
      )).models.map((item) => item.id);
      if (!catalog.isModelCatalogRequestCurrent(abortController)) return;
      const latestConfig = deps.getModelConfig();
      const latestProvider = latestConfig.modelProviders?.find((item) => item.id === provider.id);
      if (!latestProvider) return;
      if (!sameCatalogConnection(
        requestConfig,
        buildModelConfigFromProvider(latestProvider, latestConfig),
      )) {
        deps.setNotice(`${latestProvider.name || latestProvider.id} 的连接配置已变化，旧模型列表未写入。`);
        deps.setRuntimeStep("连接配置已变化，模型列表未更新");
        return;
      }
      await task.saveModelConfigWithProviderPatches(
        new Map([[provider.id, buildProviderModelsPatch(provider, modelIds)]]),
        undefined,
        new Map([[provider.id, provider]]),
        () => catalog.isModelCatalogRequestCurrent(abortController),
      );
      if (!catalog.isModelCatalogRequestCurrent(abortController)) return;
      deps.setNotice(formatProviderModelsRefreshNotice(latestProvider.name, modelIds.length));
      deps.setRuntimeStep(buildProviderModelsSingleSuccessRuntimeStep());
    } catch (appError) {
      if (catalog.isModelCatalogRequestLatest(abortController)) {
        task.applyProviderModelsRequestFailure(abortController, appError, "single");
      }
    } finally {
      task.finishProviderModelsTask({ abortController, taskTicket });
    }
  }

  async function handleRefreshProviderModels(providerId: string) {
    const provider = deps.getModelConfig().modelProviders?.find((item) => item.id === providerId);
    if (!provider) {
      deps.setNotice(buildProviderMissingNotice());
      return;
    }
    await refreshSingleProviderModels(provider);
  }

  return {
    ...task,
    handleRefreshAllProviderModels,
    refreshSingleProviderModels,
    handleRefreshProviderModels,
  };
}
