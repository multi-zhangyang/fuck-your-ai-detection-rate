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
import type { PromptRouteRequestCoordinator } from "@/lib/promptRouteRequestGeneration";
import type { ModelConfig, PromptPreviewResponse, PromptWorkflow } from "@/types/app";

export function createPromptWorkflowRouteHandlers(
  deps: PromptHandlersDeps,
  crud: PromptCrudHandlers,
  requestCoordinator: PromptRouteRequestCoordinator,
  reloadDocumentAfterPromptRouteSwitch: (
    nextConfig: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<boolean>,
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
    const generation = requestCoordinator.begin();
    const shouldCommit = requestCoordinator.guard(generation);
    const nextConfig = planned.nextConfig;
    deps.setModelConfig(nextConfig);
    crud.persistActivePromptRoute(nextConfig);
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    await reloadDocumentAfterPromptRouteSwitch(nextConfig, { shouldCommit });
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
