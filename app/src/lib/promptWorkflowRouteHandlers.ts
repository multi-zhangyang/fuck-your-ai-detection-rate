import {
  getDefaultPromptProfile,
  normalizePromptProfile,
  normalizePromptSequence,
  planDefaultPromptWorkflowConfigUpdate,
} from "@/lib/promptRegistry";
import type {
  PromptCrudHandlers,
  PromptHandlersDeps,
} from "@/lib/promptHandlerTypes";
import type { ModelConfig, PromptPreviewResponse, PromptWorkflow } from "@/types/app";

export function createPromptWorkflowRouteHandlers(
  deps: PromptHandlersDeps,
  crud: PromptCrudHandlers,
) {
  async function applyUpdatedDefaultPromptWorkflow(
    workflowId: PromptWorkflow["id"],
    result: { promptDir: string; workflows: PromptWorkflow[] },
    items: NonNullable<PromptPreviewResponse["items"]>,
  ) {
    const planned = planDefaultPromptWorkflowConfigUpdate({
      workflowId,
      result,
      items,
      currentConfig: deps.getModelConfig(),
    });
    if (!planned.shouldApply || !planned.nextConfig) return;
    const nextConfig = planned.nextConfig;
    deps.setModelConfig(nextConfig);
    crud.persistActivePromptRoute(nextConfig);
    const documentStatus = deps.getDocumentStatus();
    if (documentStatus?.sourcePath) {
      await deps.refreshDocumentState(documentStatus.sourcePath, nextConfig);
    }
  }

  async function handleUpdatePromptWorkflow(
    workflowId: PromptWorkflow["id"],
    payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit">,
  ) {
    const result = await deps.service.updatePromptWorkflow(workflowId, payload);
    const items = deps.getPromptPreviews()?.items ?? [];
    deps.setPromptPreviews((current) => ({
      ok: true,
      promptDir: result.promptDir,
      items: current?.items ?? items,
      workflows: result.workflows,
    }));
    await applyUpdatedDefaultPromptWorkflow(workflowId, result, items);
    deps.setNotice("改写流程已保存。");
  }

  return {
    applyUpdatedDefaultPromptWorkflow,
    handleUpdatePromptWorkflow,
  };
}
