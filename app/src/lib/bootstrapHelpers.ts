import {
  getPromptOptionsFromPreviews,
  getPromptWorkflowsFromPreviews,
} from "@/lib/promptRegistry";
import type {
  ModelConfig,
  PromptPreviewResponse,
} from "@/types/app";

export function buildBootstrapModelConfigState(input: {
  loadedConfig: ModelConfig;
  loadedPrompts: PromptPreviewResponse | null;
  normalizeActiveModelConfig: (
    config: ModelConfig,
    promptOptions: ReturnType<typeof getPromptOptionsFromPreviews>,
    promptWorkflows: ReturnType<typeof getPromptWorkflowsFromPreviews>,
  ) => ModelConfig;
}): {
  config: ModelConfig;
  loadedPrompts: PromptPreviewResponse | null;
  shouldRefreshCatalog: boolean;
} {
  const loadedPromptOptions = getPromptOptionsFromPreviews(input.loadedPrompts);
  const loadedPromptWorkflows = getPromptWorkflowsFromPreviews(input.loadedPrompts, loadedPromptOptions);
  const config = input.normalizeActiveModelConfig(
    input.loadedConfig,
    loadedPromptOptions,
    loadedPromptWorkflows,
  );
  return {
    config,
    loadedPrompts: input.loadedPrompts,
    shouldRefreshCatalog: Boolean(config.baseUrl && config.apiKey),
  };
}

export function buildBatchAttachSuccessTargets(successChunkIds?: string[] | null): Array<{ chunkId: string }> {
  return (successChunkIds ?? []).map((chunkId) => ({ chunkId }));
}

export function buildAttachedBatchRerunNotice(): string {
  return "已接回后台重跑；刷新页面不会让已完成块白跑。";
}

export function buildAttachedBatchRerunLoadingRuntimeStep(): string {
  return "正在接回后台重跑任务。";
}

export function buildAttachedBatchRerunFailureRuntimeStep(): string {
  return "后台重跑接回失败";
}

export function buildAttachedBatchRerunMissingResultError(error?: string | null): Error {
  return new Error(error || "后台重跑没有返回结果");
}
