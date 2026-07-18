import {
  getDefaultPromptProfile,
  getPromptWorkflow,
  normalizePromptSequence,
  getPromptOptionsFromPreviews,
  getPromptWorkflowsFromPreviews,
} from "@/lib/promptRegistryCore";
import type {
  ModelConfig,
  PromptDeleteResult,
  PromptId,
  PromptOption,
  PromptPreviewResponse,
  PromptSaveResult,
  PromptWorkflow,
} from "@/types/app";

export function planDefaultPromptWorkflowConfigUpdate(input: {
  workflowId: PromptWorkflow["id"];
  result: {
    promptDir: string;
    workflows: PromptWorkflow[];
  };
  items: PromptPreviewResponse["items"] | NonNullable<PromptPreviewResponse["items"]>;
  currentConfig: ModelConfig;
}): {
  shouldApply: boolean;
  nextConfig?: ModelConfig;
  nextPromptOptions: PromptOption[];
  nextPromptWorkflows: PromptWorkflow[];
} {
  const previewValue: PromptPreviewResponse = {
    ok: true,
    promptDir: input.result.promptDir,
    items: input.items,
    workflows: input.result.workflows,
  };
  const nextPromptOptions = getPromptOptionsFromPreviews(previewValue);
  const nextPromptWorkflows = getPromptWorkflowsFromPreviews(previewValue, nextPromptOptions);
  const updatedWorkflow = input.result.workflows.find((item) => item.id === input.workflowId);
  if (!(updatedWorkflow && updatedWorkflow.id === getDefaultPromptProfile(nextPromptWorkflows))) {
    return {
      shouldApply: false,
      nextPromptOptions,
      nextPromptWorkflows,
    };
  }
  const nextSequence = normalizePromptSequence(
    updatedWorkflow.defaultSequence,
    nextPromptOptions,
    updatedWorkflow.id,
    nextPromptWorkflows,
  );
  return {
    shouldApply: true,
    nextConfig: {
      ...input.currentConfig,
      promptProfile: updatedWorkflow.id,
      promptSequence: nextSequence,
    },
    nextPromptOptions,
    nextPromptWorkflows,
  };
}

export function mergePromptSaveResultIntoPreviews(
  current: PromptPreviewResponse | null | undefined,
  result: PromptSaveResult,
): PromptPreviewResponse {
  const currentItems = current?.items ?? [];
  const nextItems = currentItems.some((item) => item.id === result.item.id)
    ? currentItems.map((item) => (item.id === result.item.id ? result.item : item))
    : [...currentItems, result.item];
  return {
    ok: true,
    promptDir: result.promptDir,
    items: nextItems,
    workflows: current?.workflows,
  };
}

export function buildPromptPreviewsAfterDelete(
  current: PromptPreviewResponse | null | undefined,
  result: PromptDeleteResult,
): PromptPreviewResponse {
  return {
    ok: true,
    promptDir: result.promptDir,
    items: result.items,
    workflows: result.workflows ?? current?.workflows,
  };
}
