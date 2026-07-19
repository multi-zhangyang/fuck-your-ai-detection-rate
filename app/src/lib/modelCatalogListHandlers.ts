import { stringifyError } from "@/lib/errorText";
import { assertModelConfigValid } from "@/lib/modelConfigValidation";
import { bindModelCatalogToConfig } from "@/lib/modelCatalogOwnership";
import {
  beginModelCatalogRequest as beginCatalogRequest,
  createModelCatalogRequestRegistry,
  finishModelCatalogRequest,
  isModelCatalogRequestCurrent as requestIsCurrent,
  isModelCatalogRequestLatest as requestIsLatest,
  invalidateModelCatalogRequests,
  latestActiveModelCatalogController,
  stopModelCatalogRequests,
  type ModelCatalogRequestRegistry,
} from "@/lib/modelCatalogRequestHelpers";
import { sameCatalogConnection } from "@/lib/modelConfigProviderCatalogMergeHelpers";
import {
  planModelCatalogFailureUi,
  planModelCatalogMissingCredentialsUi,
  planModelCatalogStartUi,
  planModelCatalogSuccessUi,
  resolveNextModelFromCatalog,
} from "@/lib/providerModelHelpers";
import type {
  ModelCatalogHandlersDeps,
  ModelCatalogListHandlers,
} from "@/lib/modelCatalogHandlerTypes";
import type { ModelCatalogResult, ModelConfig } from "@/types/app";

// `createModelCatalogHandlers` is invoked during every App render.  React state
// setters are stable, so use one as the instance key to keep in-flight request
// state alive across those factory calls without changing App's dependency API.
const MODEL_CATALOG_REGISTRIES = new WeakMap<ModelCatalogHandlersDeps["setModelCatalog"], ModelCatalogRequestRegistry>();

export function createModelCatalogListHandlers(deps: ModelCatalogHandlersDeps): ModelCatalogListHandlers {
  const registry = MODEL_CATALOG_REGISTRIES.get(deps.setModelCatalog) ?? {
    ...createModelCatalogRequestRegistry(),
  };
  MODEL_CATALOG_REGISTRIES.set(deps.setModelCatalog, registry);
  const { activeRequests } = registry;

  function syncModelCatalogBusy() {
    deps.setModelCatalogBusy(activeRequests.size > 0);
  }

  function latestActiveController(): AbortController | null {
    return latestActiveModelCatalogController(registry);
  }

  function beginModelCatalogRequest(): AbortController {
    const { controller } = beginCatalogRequest(registry);
    deps.setModelCatalogAbortRef(controller);
    syncModelCatalogBusy();
    return controller;
  }

  function beginCancelableModelCatalogRequest(): AbortController {
    return beginModelCatalogRequest();
  }

  function clearCancelableModelCatalogRequest(controller: AbortController) {
    finishModelCatalogRequest(registry, controller);
    const currentRef = deps.getModelCatalogAbortRef();
    if (currentRef === controller) deps.setModelCatalogAbortRef(latestActiveController());
    syncModelCatalogBusy();
  }

  function isModelCatalogRequestCurrent(controller: AbortController): boolean {
    return requestIsCurrent(registry, controller);
  }

  function isModelCatalogRequestLatest(controller: AbortController): boolean {
    return requestIsLatest(registry, controller);
  }

  function handleCancelModelCatalogRequest() {
    if (!activeRequests.size) {
      deps.setNotice("当前没有正在读取的模型列表。");
      return;
    }
    deps.setRuntimeStep("正在停止模型列表读取…");
    stopModelCatalogRequests(registry);
  }

  async function fetchAndApplyModelCatalog(config: ModelConfig, silent: boolean) {
    const startUi = planModelCatalogStartUi(silent);
    const abortController = beginModelCatalogRequest();
    const taskTicket = silent
      ? null
      : deps.beginTask("loading-models", startUi.runtimeStep ? { runtimeStep: startUi.runtimeStep } : undefined);
    deps.setModelCatalogError("");
    deps.applyOptionalUiFeedback(startUi);
    try {
      assertModelConfigValid(config, { requireConnection: true });
      const result = await deps.service.listModels(config, abortController.signal);
      if (!isModelCatalogRequestCurrent(abortController)) return null;

      const latestConfig = deps.getModelConfig();
      // A response for an endpoint/key that the user has edited is no longer a
      // catalog for the visible configuration.  Do not show it or copy its
      // model into the new connection.
      if (!sameCatalogConnection(config, latestConfig)) {
        deps.setModelCatalog(null);
        deps.setModelCatalogError("");
        return null;
      }
      const nextModel = resolveNextModelFromCatalog(config.model, result.models.map((item) => item.id));
      const ownedResult = bindModelCatalogToConfig(result, config);
      deps.setModelCatalog(ownedResult);
      // Preserve edits made while the request was in flight.  Automatic model
      // selection is only safe when the model field itself is unchanged.
      if (nextModel && latestConfig.model === config.model) {
        deps.setModelConfig({ ...latestConfig, model: nextModel });
      }
      deps.applyOptionalUiFeedback(planModelCatalogSuccessUi(silent, result.total));
      return ownedResult;
    } catch (appError) {
      if (!isModelCatalogRequestLatest(abortController)) return null;
      if (!abortController.signal.aborted && !sameCatalogConnection(config, deps.getModelConfig())) {
        deps.setModelCatalog(null);
        deps.setModelCatalogError("");
        return null;
      }
      const failureUi = planModelCatalogFailureUi({
        silent,
        aborted: Boolean(abortController.signal.aborted),
        message: stringifyError(appError),
      });
      deps.setModelCatalogError(failureUi.errorMessage);
      deps.applyOptionalUiFeedback(failureUi);
      return null;
    } finally {
      clearCancelableModelCatalogRequest(abortController);
      if (taskTicket !== null) deps.finishTask(taskTicket);
    }
  }

  async function refreshModelCatalog(config = deps.getModelConfig(), options: { silent?: boolean } = {}) {
    const { silent = false } = options;
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      invalidateModelCatalogRequests(registry);
      const missingUi = planModelCatalogMissingCredentialsUi(silent);
      deps.setModelCatalog(null);
      deps.setModelCatalogError(missingUi.errorMessage);
      deps.applyOptionalUiFeedback(missingUi);
      return null;
    }
    return fetchAndApplyModelCatalog(config, silent);
  }

  async function listModelsForConfig(config: ModelConfig, signal?: AbortSignal): Promise<ModelCatalogResult | null> {
    assertModelConfigValid(config, { requireConnection: true });
    return deps.service.listModels(config, signal);
  }

  return {
    beginCancelableModelCatalogRequest,
    clearCancelableModelCatalogRequest,
    isModelCatalogRequestCurrent,
    isModelCatalogRequestLatest,
    handleCancelModelCatalogRequest,
    fetchAndApplyModelCatalog,
    refreshModelCatalog,
    listModelsForConfig,
  };
}
