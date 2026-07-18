import { formatRoundCompleteNotice, formatRoundCompleteStep } from "@/lib/documentStatusCopy";
import type {
  DocumentStatus,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function buildRoundCompletedLoadingStep(round: number): string {
  return `第 ${round} 轮已完成，正在读取预览。`;
}

export function buildRoundCompletionFeedback(
  round: number,
  status: DocumentStatus,
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): { runtimeStep: string; notice: string } {
  return {
    runtimeStep: formatRoundCompleteStep(round, status, config, promptOptions, promptWorkflows),
    notice: formatRoundCompleteNotice(round, status, config, promptOptions, promptWorkflows),
  };
}

export function buildRunResultLoadingState(round: number): {
  progress: null;
  runtimeStep: string;
} {
  return {
    progress: null,
    runtimeStep: buildRoundCompletedLoadingStep(round),
  };
}
