import type { AppService } from "@/lib/appService";
import { buildBootstrapModelConfigState } from "@/lib/bootstrapHelpers";
import { stringifyError } from "@/lib/errorText";
import { normalizeActiveModelConfig } from "@/lib/modelRoute";
import {
  beginPromptPreviewRead,
  createPromptPreviewRequestRegistry,
  finishPromptPreviewRequest,
  isCurrentPromptPreviewRequest,
  isPromptPreviewRequestBusy,
  type PromptPreviewRequestRegistry,
} from "@/lib/promptPreviewRequestGeneration";
import type { ModelConfig, PromptPreviewResponse } from "@/types/app";

export async function bootstrapAppConfig(input: {
  service: AppService;
  cancelled: () => boolean;
  setError: (message: string) => void;
  setModelConfig: (config: ModelConfig) => void;
  setModelConfigReady: (ready: boolean) => void;
  setPromptPreviews: (previews: PromptPreviewResponse) => void;
  setPromptPreviewBusy: (busy: boolean) => void;
  promptPreviewRequestRegistry?: PromptPreviewRequestRegistry;
  shouldCommitModelConfig?: () => boolean;
  refreshModelCatalog: (config?: ModelConfig, options?: { silent?: boolean }) => Promise<unknown>;
}): Promise<void> {
  const promptPreviewRequestRegistry = input.promptPreviewRequestRegistry
    ?? createPromptPreviewRequestRegistry();
  const promptGeneration = beginPromptPreviewRead(promptPreviewRequestRegistry);
  if (promptGeneration !== null) {
    input.setPromptPreviewBusy(true);
  }
  const loadedPromptsPromise = promptGeneration === null
    ? Promise.resolve<PromptPreviewResponse | null>(null)
    : input.service.getPromptPreviews().catch(() => null);

  try {
    const loadedConfig = await input.service.loadModelConfig();
    const loadedPrompts = await loadedPromptsPromise;
    // A lazy read or mutation may have taken ownership while bootstrap was waiting.
    // Never normalize the model route from a prompt registry response that is no
    // longer current; the response can contain an older workflow sequence.
    const promptRequestCurrent = promptGeneration !== null
      && isCurrentPromptPreviewRequest(promptPreviewRequestRegistry, promptGeneration);
    const bootstrapped = buildBootstrapModelConfigState({
      loadedConfig,
      loadedPrompts: promptRequestCurrent ? loadedPrompts : null,
      normalizePromptRegistry: promptRequestCurrent,
      normalizeActiveModelConfig,
    });
    if (input.cancelled()) {
      return;
    }
    if (bootstrapped.loadedPrompts && promptRequestCurrent) {
      input.setPromptPreviews(bootstrapped.loadedPrompts);
    }
    if (input.shouldCommitModelConfig && !input.shouldCommitModelConfig()) {
      return;
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
    if (promptGeneration !== null) {
      finishPromptPreviewRequest(promptPreviewRequestRegistry, promptGeneration);
      input.setPromptPreviewBusy(isPromptPreviewRequestBusy(promptPreviewRequestRegistry));
    }
    if (!input.cancelled()) {
      input.setModelConfigReady(true);
    }
  }
}
