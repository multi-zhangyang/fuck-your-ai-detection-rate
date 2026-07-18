import { stringifyError } from "@/lib/errorText";
import { assertModelConfigValid } from "@/lib/modelConfigValidation";
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

export function createModelCatalogListHandlers(deps: ModelCatalogHandlersDeps): ModelCatalogListHandlers {
  function beginCancelableModelCatalogRequest(): AbortController {
    deps.getModelCatalogAbortRef()?.abort("fyadr-user-cancel");
    const controller = new AbortController();
    deps.setModelCatalogAbortRef(controller);
    return controller;
  }

  function clearCancelableModelCatalogRequest(controller: AbortController) {
    if (deps.getModelCatalogAbortRef() === controller) deps.setModelCatalogAbortRef(null);
  }

  function handleCancelModelCatalogRequest() {
    const controller = deps.getModelCatalogAbortRef();
    if (!controller) {
      deps.setNotice("当前没有正在读取的模型列表。");
      return;
    }
    deps.setRuntimeStep("正在停止模型列表读取…");
    controller.abort("fyadr-user-cancel");
  }

  async function fetchAndApplyModelCatalog(config: ModelConfig, silent: boolean) {
    const startUi = planModelCatalogStartUi(silent);
    const abortController = silent ? null : beginCancelableModelCatalogRequest();
    const taskTicket = silent
      ? null
      : deps.beginTask("loading-models", startUi.runtimeStep ? { runtimeStep: startUi.runtimeStep } : undefined);
    deps.setModelCatalogBusy(true);
    deps.setModelCatalogError("");
    deps.applyOptionalUiFeedback(startUi);
    try {
      assertModelConfigValid(config, { requireConnection: true });
      const result = await deps.service.listModels(config, abortController?.signal);
      const nextModel = resolveNextModelFromCatalog(config.model, result.models.map((item) => item.id));
      deps.setModelCatalog(result);
      if (nextModel) deps.setModelConfig({ ...config, model: nextModel });
      deps.applyOptionalUiFeedback(planModelCatalogSuccessUi(silent, result.total));
      return result;
    } catch (appError) {
      const failureUi = planModelCatalogFailureUi({
        silent,
        aborted: Boolean(abortController?.signal.aborted),
        message: stringifyError(appError),
      });
      deps.setModelCatalogError(failureUi.errorMessage);
      deps.applyOptionalUiFeedback(failureUi);
      return null;
    } finally {
      if (abortController) clearCancelableModelCatalogRequest(abortController);
      deps.setModelCatalogBusy(false);
      if (taskTicket) deps.finishTask(taskTicket);
    }
  }

  async function refreshModelCatalog(config = deps.getModelConfig(), options: { silent?: boolean } = {}) {
    const { silent = false } = options;
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
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
    handleCancelModelCatalogRequest,
    fetchAndApplyModelCatalog,
    refreshModelCatalog,
    listModelsForConfig,
  };
}
