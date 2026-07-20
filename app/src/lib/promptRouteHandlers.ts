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
import {
  createPromptRouteRequestCoordinator,
} from "@/lib/promptRouteRequestGeneration";
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
  requestCoordinator = createPromptRouteRequestCoordinator(deps.promptRouteRequestRef),
): PromptRouteHandlers {
  async function reloadDocumentAfterPromptRouteSwitch(
    nextConfig: ModelConfig,
    options: { shouldCommit?: () => boolean } = {},
  ) {
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus?.sourcePath) return false;
    const status = await deps.refreshDocumentState(documentStatus.sourcePath, nextConfig, options);
    if (options.shouldCommit && !options.shouldCommit()) return null;
    const refreshedHistory = await deps.refreshHistoryList(options);
    if (
      refreshedHistory.status !== "current"
      || !refreshedHistory.isCurrent()
      || (options.shouldCommit && !options.shouldCommit())
    ) return null;
    const historyShouldCommit = () => (
      refreshedHistory.isCurrent()
      && (!options.shouldCommit || options.shouldCommit())
    );
    const nextHistoryItems = refreshedHistory.items;
    try {
      const loaded = await deps.loadLatestRoundSnapshot(status, nextConfig, {
        historyItems: nextHistoryItems,
        allowProfileFallback: false,
        shouldCommit: historyShouldCommit,
      });
      return historyShouldCommit() ? Boolean(loaded) : null;
    } catch (appError) {
      if (!historyShouldCommit()) return null;
      throw appError;
    }
  }

  async function applyPromptRouteSwitch(input: ApplyPromptRouteSwitchInput) {
    const generation = requestCoordinator.begin();
    const shouldCommit = requestCoordinator.guard(generation);
    deps.setModelConfig(input.nextConfig);
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    crud.persistActivePromptRoute(input.nextConfig);
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus?.sourcePath) return;
    try {
      deps.setError("");
      deps.setRuntimeStep(input.loadingRuntimeStep);
      const loaded = await reloadDocumentAfterPromptRouteSwitch(input.nextConfig, { shouldCommit });
      if (loaded === null || !shouldCommit()) return;
      deps.setRuntimeStep(input.successRuntimeStep(loaded));
    } catch (appError) {
      if (shouldCommit()) deps.applyErrorRuntimeStep(appError, input.failureRuntimeStep);
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

  const workflow = createPromptWorkflowRouteHandlers(
    deps,
    crud,
    requestCoordinator,
    reloadDocumentAfterPromptRouteSwitch,
  );

  return {
    ...workflow,
    reloadDocumentAfterPromptRouteSwitch,
    applyPromptRouteSwitch,
    handlePromptProfileChange,
    handlePromptSequenceChange,
  };
}
