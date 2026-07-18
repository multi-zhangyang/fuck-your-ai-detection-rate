import type { AppService } from "@/lib/appService";
import { buildBootstrapModelConfigState } from "@/lib/bootstrapHelpers";
import { stringifyError } from "@/lib/errorText";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import type { ModelConfig, PromptPreviewResponse } from "@/types/app";

export async function bootstrapAppConfig(input: {
  service: AppService;
  cancelled: () => boolean;
  setError: (message: string) => void;
  setModelConfig: (config: ModelConfig) => void;
  setModelConfigReady: (ready: boolean) => void;
  setPromptPreviews: (previews: PromptPreviewResponse) => void;
  refreshModelCatalog: (config?: ModelConfig, options?: { silent?: boolean }) => Promise<unknown>;
}): Promise<void> {
  try {
    const loadedConfig = await input.service.loadModelConfig();
    let loadedPrompts: PromptPreviewResponse | null = null;
    try {
      loadedPrompts = await input.service.getPromptPreviews();
    } catch {
      loadedPrompts = null;
    }
    const bootstrapped = buildBootstrapModelConfigState({
      loadedConfig,
      loadedPrompts,
      normalizeActiveModelConfig,
    });
    if (input.cancelled()) {
      return;
    }
    if (bootstrapped.loadedPrompts) {
      input.setPromptPreviews(bootstrapped.loadedPrompts);
    }
    input.setModelConfig(bootstrapped.config);
    if (bootstrapped.shouldRefreshCatalog) {
      void input.refreshModelCatalog(bootstrapped.config, { silent: true });
    }
  } catch (appError) {
    if (!input.cancelled()) {
      input.setError(stringifyError(appError));
    }
  } finally {
    if (!input.cancelled()) {
      input.setModelConfigReady(true);
    }
  }
}
