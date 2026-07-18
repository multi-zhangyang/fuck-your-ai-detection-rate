import { describePromptProfile } from "@/lib/documentStatusCopy";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import { assertModelConfigValid } from "@/lib/modelConfigValidation";
import {
  mergeSavedModelConfig,
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

export function createModelCatalogConfigHandlers(
  deps: ModelCatalogHandlersDeps,
  catalog: ModelCatalogListHandlers,
): ModelCatalogConfigHandlers {
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

  async function applySavedModelConfig(mergedSaved: ModelConfig) {
    deps.setModelConfig(mergedSaved);
    const documentStatus = deps.getDocumentStatus();
    if (documentStatus) await deps.refreshDocumentState(documentStatus.sourcePath, mergedSaved);
    if (mergedSaved.baseUrl && mergedSaved.apiKey) await catalog.refreshModelCatalog(mergedSaved, { silent: true });
    deps.applyOptionalUiFeedback(
      planModelConfigSaveSuccessFeedback(
        describePromptProfile(mergedSaved.promptProfile, deps.getPromptWorkflows()),
      ),
    );
  }

  async function handleSaveModelConfig(nextConfig?: ModelConfig, testConfig?: ModelConfig) {
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
      await applySavedModelConfig(await persistNormalizedModelConfig(configToSave, testConfig));
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, planModelConfigSaveFailureRuntimeStep());
    } finally {
      deps.finishTask(taskTicket);
    }
  }

  async function handleTestConnection() {
    const taskTicket = deps.beginTask("testing-config", { runtimeStep: "正在测试接口连通性。" });
    try {
      const onlineConfig = normalizeActiveModelConfig(
        deps.getModelConfig(),
        deps.getPromptOptions(),
        deps.getPromptWorkflows(),
      );
      assertModelConfigValid(onlineConfig, { requireConnection: true });
      deps.applyOptionalUiFeedback(
        planTestConnectionSuccessFeedback(await deps.service.testModelConnection(onlineConfig)),
      );
      await catalog.refreshModelCatalog(onlineConfig, { silent: true });
    } catch (appError) {
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
