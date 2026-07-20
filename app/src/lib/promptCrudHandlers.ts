import { stringifyError } from "@/lib/errorText";
import {
  planPromptPreviewsSuccessNotice,
  planPromptPreviewsUnavailableMessage,
} from "@/lib/diagnosticsHelpers";
import {
  buildPromptPreviewsAfterDelete,
  mergePromptSaveResultIntoPreviews,
} from "@/lib/promptRegistry";
import {
  getDefaultPromptProfile,
  getPromptOptionsFromPreviews,
  getPromptWorkflowsFromPreviews,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import {
  createPromptRouteRequestCoordinator,
} from "@/lib/promptRouteRequestGeneration";
import {
  beginPromptPreviewMutation,
  beginPromptPreviewRead,
  createPromptPreviewRequestRegistry,
  finishPromptPreviewRequest,
  isCurrentPromptPreviewRequest,
  isPromptPreviewRequestBusy,
  type PromptPreviewRequestRegistry,
} from "@/lib/promptPreviewRequestGeneration";
import { ACTIVE_PROMPT_PROFILE_KEY, ACTIVE_PROMPT_SEQUENCE_KEY } from "@/lib/storageKeys";
import { writeStorageValue } from "@/lib/safeStorage";
import type {
  PromptCrudHandlers,
  PromptHandlersDeps,
} from "@/lib/promptHandlerTypes";
import type { ModelConfig, PromptId, PromptPreviewResponse, PromptSaveResult } from "@/types/app";

const PROMPT_PREVIEW_REQUEST_REGISTRIES = new WeakMap<
  PromptHandlersDeps["setPromptPreviews"],
  PromptPreviewRequestRegistry
>();

export function createPromptCrudHandlers(
  deps: PromptHandlersDeps,
  requestCoordinator = createPromptRouteRequestCoordinator(deps.promptRouteRequestRef),
): PromptCrudHandlers {
  const previewRequestRegistry = deps.promptPreviewRequestRegistry
    ?? PROMPT_PREVIEW_REQUEST_REGISTRIES.get(deps.setPromptPreviews)
    ?? createPromptPreviewRequestRegistry();
  PROMPT_PREVIEW_REQUEST_REGISTRIES.set(deps.setPromptPreviews, previewRequestRegistry);

  function syncPromptPreviewBusy() {
    deps.setPromptPreviewBusy(isPromptPreviewRequestBusy(previewRequestRegistry));
  }

  async function runPromptPreviewMutation<T>(operation: () => Promise<T>): Promise<T | null> {
    const generation = beginPromptPreviewMutation(previewRequestRegistry);
    if (generation === null) return null;
    syncPromptPreviewBusy();
    deps.setPromptPreviewError("");
    try {
      const result = await operation();
      return isCurrentPromptPreviewRequest(previewRequestRegistry, generation) ? result : null;
    } finally {
      finishPromptPreviewRequest(previewRequestRegistry, generation);
      syncPromptPreviewBusy();
    }
  }

  function persistActivePromptRoute(config: ModelConfig) {
    writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, config.promptProfile);
    writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(config.promptSequence));
  }

  async function refreshPromptPreviews(options: { silent?: boolean } = {}) {
    const generation = beginPromptPreviewRead(previewRequestRegistry);
    if (generation === null) return null;
    syncPromptPreviewBusy();
    deps.setPromptPreviewError("");
    try {
      const result = await deps.service.getPromptPreviews();
      if (!isCurrentPromptPreviewRequest(previewRequestRegistry, generation)) return null;
      deps.setPromptPreviews(result);
      if (result.items.length && !result.items.some((item) => item.id === deps.getActivePromptPreviewId())) {
        deps.setActivePromptPreviewId(result.items[0].id);
      }
      if (!options.silent) deps.setNotice(planPromptPreviewsSuccessNotice());
      return result;
    } catch (appError) {
      if (!isCurrentPromptPreviewRequest(previewRequestRegistry, generation)) return null;
      const status = (appError as { status?: number } | null)?.status;
      const message = planPromptPreviewsUnavailableMessage(status, stringifyError(appError));
      deps.setPromptPreviewError(message);
      if (!options.silent) deps.setError(message);
      return null;
    } finally {
      finishPromptPreviewRequest(previewRequestRegistry, generation);
      syncPromptPreviewBusy();
    }
  }

  function applyPromptSaveResult(result: PromptSaveResult) {
    deps.setPromptPreviewError("");
    deps.setActivePromptPreviewId(result.item.id);
    deps.setPromptPreviews((current) => mergePromptSaveResultIntoPreviews(current, result));
  }

  async function handleSavePromptDraft(
    promptId: PromptId,
    payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean },
  ) {
    if (!payload.metaDirty && !payload.contentDirty) return;
    const result = await runPromptPreviewMutation(async () => {
      let saved: PromptSaveResult | null = null;
      if (payload.metaDirty) {
        saved = await deps.service.updatePromptMeta(promptId, {
          label: payload.label,
          description: payload.description,
        });
      }
      if (payload.contentDirty) {
        saved = await deps.service.savePrompt(promptId, payload.content);
      }
      return saved;
    });
    if (!result) return;
    applyPromptSaveResult(result);
    deps.setNotice("提示词已保存。");
  }

  async function handleRestoreDefaultPrompt(promptId: PromptId) {
    const item = deps.getPromptPreviews()?.items.find((prompt) => prompt.id === promptId);
    if (!item) return;
    if (!await deps.requestConfirm({
      title: "恢复默认提示词",
      description: `将用内置默认内容覆盖「${item.label}」当前版本；未保存的修改也会丢失。`,
      confirmLabel: "恢复默认",
      tone: "warning",
    })) return;
    const result = await runPromptPreviewMutation(() => deps.service.restoreDefaultPrompt(promptId));
    if (!result) return;
    applyPromptSaveResult(result);
    deps.setNotice("已恢复默认提示词。");
  }

  async function handleCreatePrompt(payload: { label: string; description?: string; content: string }) {
    const result = await runPromptPreviewMutation(() => deps.service.createPrompt(payload));
    if (!result) return;
    applyPromptSaveResult(result);
    deps.setNotice("自定义提示词已创建。");
  }

  async function handleDeletePrompt(promptId: PromptId) {
    const item = deps.getPromptPreviews()?.items.find((prompt) => prompt.id === promptId);
    if (!item || item.builtIn) return;
    if (!await deps.requestConfirm({
      title: "删除提示词",
      description: `删除「${item.label}」后会从改写流程选项中移除。`,
      confirmLabel: "删除",
      tone: "danger",
    })) return;
    const result = await runPromptPreviewMutation(() => deps.service.deletePrompt(promptId));
    if (!result) return;
    const nextPreviews = buildPromptPreviewsAfterDelete(deps.getPromptPreviews(), result);
    const nextPromptOptions = getPromptOptionsFromPreviews(nextPreviews);
    const nextPromptWorkflows = getPromptWorkflowsFromPreviews(nextPreviews, nextPromptOptions);
    const currentConfig = deps.getModelConfig();
    const nextProfile = normalizePromptProfile(currentConfig.promptProfile, nextPromptWorkflows)
      ?? getDefaultPromptProfile(nextPromptWorkflows);
    const nextConfig = {
      ...currentConfig,
      promptProfile: nextProfile,
      promptSequence: normalizePromptSequence(
        currentConfig.promptSequence,
        nextPromptOptions,
        nextProfile,
        nextPromptWorkflows,
      ),
    };
    const generation = requestCoordinator.begin();
    const shouldCommit = requestCoordinator.guard(generation);
    deps.setPromptPreviewError("");
    deps.setPromptPreviews(nextPreviews);
    deps.setActivePromptPreviewId(result.items[0]?.id ?? "");
    deps.setModelConfig(nextConfig);
    persistActivePromptRoute(nextConfig);
    deps.clearAutoSnapshotSuppression();
    deps.clearPendingAutoActionForManualContextChange();
    deps.setNotice("提示词已删除。");
    const documentStatus = deps.getDocumentStatus();
    if (!documentStatus?.sourcePath) return;
    let syncShouldCommit = shouldCommit;
    try {
      deps.setRuntimeStep("提示词已删除，正在同步当前文档路线…");
      const status = await deps.refreshDocumentState(documentStatus.sourcePath, nextConfig, {
        shouldCommit,
        promptOptions: nextPromptOptions,
        promptWorkflows: nextPromptWorkflows,
      });
      if (!shouldCommit()) return;
      const refreshedHistory = await deps.refreshHistoryList({ shouldCommit });
      if (
        refreshedHistory.status !== "current"
        || !refreshedHistory.isCurrent()
        || !shouldCommit()
      ) return;
      syncShouldCommit = () => refreshedHistory.isCurrent() && shouldCommit();
      const nextHistoryItems = refreshedHistory.items;
      const loaded = await deps.loadLatestRoundSnapshot(status, nextConfig, {
        historyItems: nextHistoryItems,
        allowProfileFallback: false,
        shouldCommit: syncShouldCommit,
        promptOptions: nextPromptOptions,
        promptWorkflows: nextPromptWorkflows,
      });
      if (syncShouldCommit()) deps.setRuntimeStep(loaded ? "已同步删除后的提示词路线。" : "提示词已删除，当前文档暂无可载入 Diff。");
    } catch (appError) {
      if (syncShouldCommit()) deps.setError(`提示词已删除，但当前文档同步失败：${stringifyError(appError)}`);
    }
  }

  return {
    runPromptPreviewMutation,
    persistActivePromptRoute,
    refreshPromptPreviews,
    applyPromptSaveResult,
    handleSavePromptDraft,
    handleRestoreDefaultPrompt,
    handleCreatePrompt,
    handleDeletePrompt,
  };
}
