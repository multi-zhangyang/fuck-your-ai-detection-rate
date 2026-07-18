import { normalizeDetectionDocumentKey } from "@/lib/documentMatch";
import { normalizePromptSequence } from "@/lib/promptRegistry";
import type { DocumentStatus, ModelConfig, PromptOption, PromptWorkflow } from "@/types/app";

export function getAutoRunScopeKey(sourcePath: string, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, round: number): string {
  const promptSequence = (config.promptSequence ?? []).join(">");
  return [normalizeDetectionDocumentKey(sourcePath), config.promptProfile, promptSequence, round].join("::");
}
export function getAutoRunScopeKeyForStatus(
  status: Pick<DocumentStatus, "sourcePath" | "promptProfile" | "promptSequence">,
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  round: number,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): string {
  const promptProfile = status.promptProfile ?? config.promptProfile;
  const promptSequence = normalizePromptSequence(status.promptSequence ?? config.promptSequence, promptOptions, promptProfile, promptWorkflows);
  return getAutoRunScopeKey(status.sourcePath, { promptProfile, promptSequence }, round);
}

export function isInterruptedRunMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("interrupted")
    || lowered.includes("progress channel disconnected")
    || lowered.includes("backend restarted")
    || message.includes("已中断")
    || message.includes("中断")
    || message.includes("断开");
}

export function isResumableRunMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return isInterruptedRunMessage(message)
    || lowered.includes("completed chunks are kept")
    || lowered.includes("checkpoint")
    || message.includes("断点")
    || message.includes("已完成的分块")
    || message.includes("已完成的块")
    || message.includes("续跑");
}
