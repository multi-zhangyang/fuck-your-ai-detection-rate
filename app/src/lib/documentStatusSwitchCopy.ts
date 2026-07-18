import { normalizePromptSequence } from "@/lib/promptRegistry";
import type { DocumentStatus, ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export function buildPromptProfileSwitchLoadingRuntimeStep(): string {
  return "正在切换改写轮次模式。";
}

export function buildPromptProfileSwitchSuccessRuntimeStep(loadedSnapshot: boolean): string {
  return loadedSnapshot
    ? "改写轮次模式已切换，已载入最新 Diff。"
    : "改写轮次模式已切换，当前模式暂无 Diff。";
}

export function buildPromptProfileSwitchFailureRuntimeStep(): string {
  return "切换改写轮次模式失败";
}

export function buildPromptSequenceSwitchLoadingRuntimeStep(): string {
  return "正在切换自定义 Prompt 组合。";
}

export function buildPromptSequenceSwitchSuccessRuntimeStep(loadedSnapshot: boolean): string {
  return loadedSnapshot
    ? "自定义组合已切换，已载入匹配 Diff。"
    : "自定义组合已切换，当前组合暂无 Diff。";
}

export function buildPromptSequenceSwitchFailureRuntimeStep(): string {
  return "切换自定义 Prompt 组合失败";
}

export function resolveRoundProgressRoute(input: {
  status: Pick<DocumentStatus, "promptProfile" | "promptSequence">;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
}): {
  statusPromptProfile: string;
  statusPromptSequence: PromptId[];
} {
  const statusPromptProfile = input.status.promptProfile ?? input.config.promptProfile;
  const statusPromptSequence = normalizePromptSequence(
    input.status.promptSequence ?? input.config.promptSequence,
    input.promptOptions,
    statusPromptProfile,
    input.promptWorkflows,
  );
  return { statusPromptProfile, statusPromptSequence };
}
