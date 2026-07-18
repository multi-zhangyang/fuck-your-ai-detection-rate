import { buildModelConfigFromProvider } from "@/lib/modelRoute";
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
      const { providerPatches, failures } = await task.collectProviderModelPatches({
        enabledProviders,
        providers,
        abortController,
      });
      await task.saveModelConfigWithProviderPatches(providerPatches, providers);
      deps.setNotice(formatProviderModelsBatchNotice(providerPatches.size, failures));
      deps.setRuntimeStep(buildProviderModelsBatchSuccessRuntimeStep());
    } catch (appError) {
      task.applyProviderModelsRequestFailure(abortController, appError, "batch");
    } finally {
      task.finishProviderModelsTask({ abortController, taskTicket });
    }
  }

  async function refreshSingleProviderModels(provider: ModelProviderConfig) {
    const { taskTicket, abortController } = task.beginProviderModelsTask(
      buildProviderModelsSingleLoadingRuntimeStep(provider.name),
    );
    try {
      const modelIds = (await deps.service.listModels(
        buildModelConfigFromProvider(provider, deps.getModelConfig()),
        abortController.signal,
      )).models.map((item) => item.id);
      await task.saveModelConfigWithProviderPatches(new Map([[provider.id, buildProviderModelsPatch(provider, modelIds)]]));
      deps.setNotice(formatProviderModelsRefreshNotice(provider.name, modelIds.length));
      deps.setRuntimeStep(buildProviderModelsSingleSuccessRuntimeStep());
    } catch (appError) {
      task.applyProviderModelsRequestFailure(abortController, appError, "single");
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
