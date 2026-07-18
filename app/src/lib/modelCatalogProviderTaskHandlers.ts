import { stringifyError } from "@/lib/errorText";
import {
  createEmptyProviderModelRefreshState,
  materializeProviderModelsRequestFailureFeedback,
  planProviderModelsRequestFailureFeedback,
  refreshOneProviderModelPatch,
  buildModelConfigWithProviderPatches,
  mergeSavedModelConfig,
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
    let state = createEmptyProviderModelRefreshState();
    for (const provider of input.enabledProviders) {
      state = await refreshOneProviderModelPatch({
        provider,
        abortController: input.abortController,
        providerPatches: state.providerPatches,
        failures: state.failures,
        baseConfig: deps.getModelConfig(),
        listModels: (config, signal) => deps.service.listModels(config, signal),
        stringifyError,
      });
    }
    return state;
  }

  async function saveModelConfigWithProviderPatches(
    providerPatches: Map<string, Partial<ModelProviderConfig>>,
    providers: ModelProviderConfig[] = deps.getModelConfig().modelProviders ?? [],
  ) {
    const nextConfig = buildModelConfigWithProviderPatches(deps.getModelConfig(), providers, providerPatches);
    const saved = await deps.service.saveModelConfig(nextConfig);
    deps.setModelConfig(mergeSavedModelConfig(saved, nextConfig));
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
