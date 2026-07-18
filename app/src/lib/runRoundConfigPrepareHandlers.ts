import { stringifyError } from "@/lib/errorText";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import {
  buildBusyRunNotice,
  buildMissingDocumentNotice,
  buildRunConfigForLaunch,
  mergeSavedRunConfig,
  planBackendConcurrencyReadyError,
  shouldSyncRunConfigToUi,
} from "@/lib/runRoundPrep";
import { ACTIVE_PROMPT_PROFILE_KEY, ACTIVE_PROMPT_SEQUENCE_KEY } from "@/lib/storageKeys";
import { writeStorageValue } from "@/lib/safeStorage";
import type { RunRoundHandlersDeps } from "@/lib/runRoundHandlerTypes";
import type { DocumentStatus, ModelConfig } from "@/types/app";

export type RunRoundConfigPrepareHandlers = {
  resolveRunnableDocumentStatus: (configOverride?: ModelConfig) => DocumentStatus | null;
  syncRunConfigToUi: (runConfig: ModelConfig) => void;
  assertBackendConcurrencyReady: (requestedConcurrency: number) => Promise<void>;
  persistRunConfigForLaunch: (runConfig: ModelConfig) => Promise<ModelConfig>;
  buildLaunchRunConfig: (configOverride?: ModelConfig) => ModelConfig;
};

export function createRunRoundConfigPrepareHandlers(
  deps: RunRoundHandlersDeps,
): RunRoundConfigPrepareHandlers {
  function resolveRunnableDocumentStatus(configOverride?: ModelConfig) {
    if (deps.getRunning()) {
      deps.setNotice(buildBusyRunNotice());
      return null;
    }
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus) {
      deps.setNotice(buildMissingDocumentNotice());
      return null;
    }
    return documentStatus;
  }

  function syncRunConfigToUi(runConfig: ModelConfig) {
    deps.setLatestModelConfig(runConfig);
    if (shouldSyncRunConfigToUi(
      runConfig,
      deps.getModelConfig(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    )) {
      deps.setModelConfig(runConfig);
      writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, runConfig.promptProfile);
      writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(runConfig.promptSequence));
    }
  }

  async function assertBackendConcurrencyReady(requestedConcurrency: number) {
    try {
      const runtime = await deps.service.getBackendRuntime();
      const guardError = planBackendConcurrencyReadyError({
        requestedConcurrency,
        backendMaxConcurrency: Number(runtime.maxRewriteConcurrency ?? 0) || 0,
      });
      if (guardError) throw new Error(guardError);
    } catch (error) {
      const guardError = planBackendConcurrencyReadyError({
        requestedConcurrency,
        backendMaxConcurrency: 0,
        fetchErrorMessage: stringifyError(error),
      });
      if (guardError) throw new Error(guardError);
    }
  }

  async function persistRunConfigForLaunch(runConfig: ModelConfig): Promise<ModelConfig> {
    syncRunConfigToUi(runConfig);
    await assertBackendConcurrencyReady(runConfig.rewriteConcurrency);
    const savedConfig = await deps.service.saveModelConfig(runConfig);
    const merged = mergeSavedRunConfig(savedConfig, runConfig);
    deps.setLatestModelConfig(merged);
    deps.setModelConfig(merged);
    return merged;
  }

  function buildLaunchRunConfig(configOverride?: ModelConfig) {
    return buildRunConfigForLaunch(
      configOverride,
      deps.getLatestModelConfig(),
      deps.getModelConfig(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
      normalizeActiveModelConfig,
    );
  }

  return {
    resolveRunnableDocumentStatus,
    syncRunConfigToUi,
    assertBackendConcurrencyReady,
    persistRunConfigForLaunch,
    buildLaunchRunConfig,
  };
}
