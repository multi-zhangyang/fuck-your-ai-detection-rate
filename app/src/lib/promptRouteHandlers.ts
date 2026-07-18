import {
  buildPromptProfileSwitchFailureRuntimeStep,
  buildPromptProfileSwitchLoadingRuntimeStep,
  buildPromptProfileSwitchSuccessRuntimeStep,
  buildPromptSequenceSwitchFailureRuntimeStep,
  buildPromptSequenceSwitchLoadingRuntimeStep,
  buildPromptSequenceSwitchSuccessRuntimeStep,
} from "@/lib/documentStatusCopy";
import {
  getDefaultPromptProfile,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { createPromptWorkflowRouteHandlers } from "@/lib/promptWorkflowRouteHandlers";
import type {
  ApplyPromptRouteSwitchInput,
  PromptCrudHandlers,
  PromptHandlersDeps,
  PromptRouteHandlers,
} from "@/lib/promptHandlerTypes";
import type { ModelConfig, PromptId } from "@/types/app";

export function createPromptRouteHandlers(
  deps: PromptHandlersDeps,
  crud: PromptCrudHandlers,
): PromptRouteHandlers {
  const workflow = createPromptWorkflowRouteHandlers(deps, crud);

  async function reloadDocumentAfterPromptRouteSwitch(nextConfig: ModelConfig) {
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus?.sourcePath) return false;
    const status = await deps.refreshDocumentState(documentStatus.sourcePath, nextConfig);
    const nextHistoryItems = await deps.refreshHistoryList();
    return Boolean(await deps.loadLatestRoundSnapshot(status, nextConfig, {
      historyItems: nextHistoryItems,
      allowProfileFallback: false,
    }));
  }

  async function applyPromptRouteSwitch(input: ApplyPromptRouteSwitchInput) {
    deps.setModelConfig(input.nextConfig);
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    crud.persistActivePromptRoute(input.nextConfig);
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus?.sourcePath) return;
    try {
      deps.setError("");
      deps.setRuntimeStep(input.loadingRuntimeStep);
      deps.setRuntimeStep(input.successRuntimeStep(await reloadDocumentAfterPromptRouteSwitch(input.nextConfig)));
    } catch (appError) {
      deps.applyErrorRuntimeStep(appError, input.failureRuntimeStep);
    }
  }

  async function handlePromptProfileChange(promptProfile: ModelConfig["promptProfile"]) {
    const targetProfile = normalizePromptProfile(promptProfile, deps.getPromptWorkflows())
      ?? getDefaultPromptProfile(deps.getPromptWorkflows());
    const modelConfig = deps.getModelConfig();
    const nextConfig = {
      ...modelConfig,
      promptProfile: targetProfile,
      promptSequence: normalizePromptSequence(
        modelConfig.promptSequence,
        deps.getPromptOptions(),
        targetProfile,
        deps.getPromptWorkflows(),
      ),
    };
    await applyPromptRouteSwitch({
      nextConfig,
      loadingRuntimeStep: buildPromptProfileSwitchLoadingRuntimeStep(),
      successRuntimeStep: buildPromptProfileSwitchSuccessRuntimeStep,
      failureRuntimeStep: buildPromptProfileSwitchFailureRuntimeStep(),
    });
  }

  async function handlePromptSequenceChange(promptSequence: PromptId[]) {
    const targetProfile = getDefaultPromptProfile(deps.getPromptWorkflows());
    const nextConfig = {
      ...deps.getModelConfig(),
      promptProfile: targetProfile,
      promptSequence: normalizePromptSequence(
        promptSequence,
        deps.getPromptOptions(),
        targetProfile,
        deps.getPromptWorkflows(),
      ),
    };
    await applyPromptRouteSwitch({
      nextConfig,
      loadingRuntimeStep: buildPromptSequenceSwitchLoadingRuntimeStep(),
      successRuntimeStep: buildPromptSequenceSwitchSuccessRuntimeStep,
      failureRuntimeStep: buildPromptSequenceSwitchFailureRuntimeStep(),
    });
  }

  return {
    ...workflow,
    reloadDocumentAfterPromptRouteSwitch,
    applyPromptRouteSwitch,
    handlePromptProfileChange,
    handlePromptSequenceChange,
  };
}
