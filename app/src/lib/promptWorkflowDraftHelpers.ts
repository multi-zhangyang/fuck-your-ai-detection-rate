import type { PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type PromptWorkflowDraft = Pick<
  PromptWorkflow,
  "label" | "description" | "defaultSequence" | "sequenceLimit"
> & { roundLimit: number };

export function buildPromptWorkflowVersion(workflow: PromptWorkflow | null | undefined): string {
  if (!workflow) return "";
  return JSON.stringify([
    workflow.id,
    workflow.label,
    workflow.description ?? "",
    workflow.defaultSequence,
    workflow.sequenceLimit,
    workflow.roundLimit ?? workflow.sequenceLimit,
    workflow.customizable,
  ]);
}

export function buildPromptWorkflowDraft(workflow: PromptWorkflow): PromptWorkflowDraft {
  return {
    label: workflow.label,
    description: workflow.description ?? "",
    defaultSequence: [...workflow.defaultSequence],
    sequenceLimit: workflow.sequenceLimit,
    roundLimit: Math.max(workflow.sequenceLimit, workflow.roundLimit ?? workflow.sequenceLimit),
  };
}

export function isPromptWorkflowDraftDirty(
  workflow: PromptWorkflow | null | undefined,
  draft: PromptWorkflowDraft,
): boolean {
  if (!workflow) return false;
  return workflow.label !== draft.label
    || (workflow.description ?? "") !== (draft.description ?? "")
    || workflow.sequenceLimit !== draft.sequenceLimit
    || Math.max(workflow.sequenceLimit, workflow.roundLimit ?? workflow.sequenceLimit) !== draft.roundLimit
    || workflow.defaultSequence.length !== draft.defaultSequence.length
    || workflow.defaultSequence.some((promptId, index) => promptId !== draft.defaultSequence[index]);
}

export function validatePromptWorkflowDraft(
  draft: PromptWorkflowDraft,
  promptOptions: PromptOption[],
): string {
  if (!draft.label.trim()) return "流程名称不能为空。";
  if (draft.label.trim().length > 80) return "流程名称不能超过 80 个字符。";
  if ((draft.description ?? "").trim().length > 240) return "流程说明不能超过 240 个字符。";
  if (!Number.isInteger(draft.sequenceLimit) || draft.sequenceLimit < 1 || draft.sequenceLimit > 12) {
    return "默认编排上限必须是 1 到 12 之间的整数。";
  }
  if (!Number.isInteger(draft.roundLimit) || draft.roundLimit < 1 || draft.roundLimit > 12) {
    return "运行轮次上限必须是 1 到 12 之间的整数。";
  }
  if (draft.roundLimit < draft.sequenceLimit) {
    return "运行轮次上限不能小于默认编排上限。";
  }
  if (!draft.defaultSequence.length) return "默认编排至少需要一个提示词。";
  if (draft.defaultSequence.length > draft.sequenceLimit) return "默认编排不能超过默认编排上限。";
  if (new Set(draft.defaultSequence).size !== draft.defaultSequence.length) return "同一个提示词不能在默认编排中重复。";
  const availableIds = new Set(promptOptions.map((item) => item.id));
  if (draft.defaultSequence.some((promptId) => !availableIds.has(promptId))) {
    return "默认编排包含已不存在的提示词，请重新选择。";
  }
  return "";
}

export function replacePromptWorkflowSequenceItem(
  sequence: PromptId[],
  index: number,
  promptId: PromptId,
): PromptId[] {
  if (index < 0 || index >= sequence.length || sequence.includes(promptId)) return sequence;
  return sequence.map((item, itemIndex) => (itemIndex === index ? promptId : item));
}

export function movePromptWorkflowSequenceItem(
  sequence: PromptId[],
  index: number,
  direction: -1 | 1,
): PromptId[] {
  const targetIndex = index + direction;
  if (index < 0 || index >= sequence.length || targetIndex < 0 || targetIndex >= sequence.length) {
    return sequence;
  }
  const nextSequence = [...sequence];
  [nextSequence[index], nextSequence[targetIndex]] = [nextSequence[targetIndex], nextSequence[index]];
  return nextSequence;
}

export function getNextPromptWorkflowSequenceItem(
  sequence: PromptId[],
  promptOptions: PromptOption[],
): PromptId | null {
  return promptOptions.find((item) => !sequence.includes(item.id))?.id ?? null;
}
