import type {
  DocumentStatus,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function buildHistoryDocumentLoadNotice(
  status: DocumentStatus,
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  progressText: string,
): string {
  return `已切换到历史文档。${progressText}`;
}

export function buildHistoryDocumentLoadRuntimeStep(input: {
  loadedSnapshot: unknown;
  status: DocumentStatus;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  formatDocumentLoadStep: (
    prefix: string,
    status: DocumentStatus,
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
    promptOptions?: PromptOption[],
    promptWorkflows?: PromptWorkflow[],
  ) => string;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): string {
  const prefix = input.loadedSnapshot
    ? "历史文档已载入，并显示最新 Diff"
    : "历史文档已载入，但当前模式暂无 Diff";
  return input.formatDocumentLoadStep(
    prefix,
    input.status,
    input.config,
    input.promptOptions,
    input.promptWorkflows,
  );
}

export function buildHistoryDocumentLoadFailureRuntimeStep(): string {
  return "载入历史文档失败";
}

export function buildHistoryDocumentLoadingRuntimeStep(): string {
  return "正在载入历史文档。";
}
