import { describePromptProfile } from "@/lib/documentStatusCopy";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import { sameCatalogConnection } from "@/lib/modelConfigProviderCatalogMergeHelpers";
import {
  beginModelConfigOperation,
  createModelConfigOperationGeneration,
  isCurrentModelConfigOperation,
  type ModelConfigOperationGeneration,
} from "@/lib/modelConfigOperationGeneration";
import { assertModelConfigValid } from "@/lib/modelConfigValidation";
import {
  mergeSavedModelConfig,
  reconcileSavedModelConfig,
  planModelConfigSaveFailureRuntimeStep,
  planModelConfigSaveLoadingRuntimeStep,
  planModelConfigSaveSuccessFeedback,
  planTestConnectionSuccessFeedback,
} from "@/lib/providerModelHelpers";
import type {
  ModelCatalogConfigHandlers,
  ModelCatalogHandlersDeps,
  ModelCatalogListHandlers,
} from "@/lib/modelCatalogHandlerTypes";
import type { ModelConfig } from "@/types/app";

const MODEL_CONFIG_OPERATION_GENERATIONS = new WeakMap<
  ModelCatalogHandlersDeps["setModelConfig"],
  ModelConfigOperationGeneration
>();

export function createModelCatalogConfigHandlers(
  deps: ModelCatalogHandlersDeps,
  catalog: ModelCatalogListHandlers,
): ModelCatalogConfigHandlers {
  const operationGeneration = MODEL_CONFIG_OPERATION_GENERATIONS.get(deps.setModelConfig)
    ?? createModelConfigOperationGeneration();
  MODEL_CONFIG_OPERATION_GENERATIONS.set(deps.setModelConfig, operationGeneration);

  async function persistNormalizedModelConfig(configToSave: ModelConfig, testConfig?: ModelConfig) {
    assertModelConfigValid(configToSave);
    if (testConfig) {
      assertModelConfigValid(testConfig, { requireConnection: true });
      await deps.service.testModelConnection(
        normalizeActiveModelConfig(testConfig, deps.getPromptOptions(), deps.getPromptWorkflows()),
      );
    }
    const saved = await deps.service.saveModelConfig(configToSave);
    return normalizeActiveModelConfig(
      mergeSavedModelConfig(saved, configToSave),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
  }

  async function applySavedModelConfig(mergedSaved: ModelConfig, generation?: number) {
    const isCurrent = () => generation === undefined
      || isCurrentModelConfigOperation(operationGeneration, generation);
    if (!isCurrent()) return;
    deps.setModelConfig(mergedSaved);
    const documentStatus = deps.getDocumentStatus();
    if (documentStatus) await deps.refreshDocumentState(documentStatus.sourcePath, mergedSaved);
    if (!isCurrent()) return;
    if (mergedSaved.baseUrl && mergedSaved.apiKey) await catalog.refreshModelCatalog(mergedSaved, { silent: true });
    if (!isCurrent()) return;
    deps.applyOptionalUiFeedback(
      planModelConfigSaveSuccessFeedback(
        describePromptProfile(mergedSaved.promptProfile, deps.getPromptWorkflows()),
      ),
    );
  }

  async function handleSaveModelConfig(nextConfig?: ModelConfig, testConfig?: ModelConfig) {
    const generation = beginModelConfigOperation(operationGeneration);
    const taskTicket = deps.beginTask("saving-config", {
      runtimeStep: planModelConfigSaveLoadingRuntimeStep(Boolean(testConfig)),
    });
    try {
      const configToSave = normalizeActiveModelConfig(
        nextConfig ?? deps.getModelConfig(),
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
      assertModelConfigValid(configToSave);
      const savedConfig = await persistNormalizedModelConfig(configToSave, testConfig);
      if (!isCurrentModelConfigOperation(operationGeneration, generation)) return;
      await applySavedModelConfig(
        reconcileSavedModelConfig(configToSave, savedConfig, deps.getModelConfig()),
        generation,
      );
    } catch (appError) {
      if (!isCurrentModelConfigOperation(operationGeneration, generation)) return;
      deps.applyErrorRuntimeStep(appError, planModelConfigSaveFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleTestConnection() {
    const generation = beginModelConfigOperation(operationGeneration);
    const taskTicket = deps.beginTask("testing-config", { runtimeStep: "正在测试接口连通性。" });
    let onlineConfig: ModelConfig | null = null;
    try {
      onlineConfig = normalizeActiveModelConfig(
        deps.getModelConfig(),
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
      assertModelConfigValid(onlineConfig, { requireConnection: true });
      const result = await deps.service.testModelConnection(onlineConfig);
      if (!isCurrentModelConfigOperation(operationGeneration, generation)) return;
      // The connection test has no cancellable signal in the service contract;
      // discard its feedback and follow-up catalog when the user changed the
      // endpoint/key/API while it was in flight.
      if (!sameCatalogConnection(onlineConfig, deps.getModelConfig())) return;
      deps.applyOptionalUiFeedback(planTestConnectionSuccessFeedback(result));
      await catalog.refreshModelCatalog(onlineConfig, { silent: true });
    } catch (appError) {
      if (!isCurrentModelConfigOperation(operationGeneration, generation)) return;
      if (onlineConfig && !sameCatalogConnection(onlineConfig, deps.getModelConfig())) return;
      deps.applyErrorRuntimeStep(appError, "接口连通性测试失败");
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  return {
    persistNormalizedModelConfig,
    applySavedModelConfig,
    handleSaveModelConfig,
    handleTestConnection,
  };
}
