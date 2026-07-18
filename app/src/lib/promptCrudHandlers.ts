import { stringifyError } from "@/lib/errorText";
import {
  planPromptPreviewsSuccessNotice,
  planPromptPreviewsUnavailableMessage,
} from "@/lib/diagnosticsHelpers";
import {
  buildPromptPreviewsAfterDelete,
  mergePromptSaveResultIntoPreviews,
} from "@/lib/promptRegistry";
import { ACTIVE_PROMPT_PROFILE_KEY, ACTIVE_PROMPT_SEQUENCE_KEY } from "@/lib/storageKeys";
import { writeStorageValue } from "@/lib/safeStorage";
import type {
  PromptCrudHandlers,
  PromptHandlersDeps,
} from "@/lib/promptHandlerTypes";
import type { ModelConfig, PromptId, PromptPreviewResponse, PromptSaveResult } from "@/types/app";

export function createPromptCrudHandlers(deps: PromptHandlersDeps): PromptCrudHandlers {
  function persistActivePromptRoute(config: ModelConfig) {
    writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, config.promptProfile);
    writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(config.promptSequence));
  }

  async function refreshPromptPreviews(options: { silent?: boolean } = {}) {
    deps.setPromptPreviewBusy(true);
    deps.setPromptPreviewError("");
    try {
      const result = await deps.service.getPromptPreviews();
      deps.setPromptPreviews(result);
      if (result.items.length && !result.items.some((item) => item.id === deps.getActivePromptPreviewId())) {
        deps.setActivePromptPreviewId(result.items[0].id);
      }
      if (!options.silent) deps.setNotice(planPromptPreviewsSuccessNotice());
      return result;
    } catch (appError) {
      const status = (appError as { status?: number } | null)?.status;
      const message = planPromptPreviewsUnavailableMessage(status, stringifyError(appError));
      deps.setPromptPreviewError(message);
      if (!options.silent) deps.setError(message);
      return null;
    } finally {
      deps.setPromptPreviewBusy(false);
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
    let result: PromptSaveResult | null = null;
    if (payload.metaDirty) {
      result = await deps.service.updatePromptMeta(promptId, {
        label: payload.label,
        description: payload.description,
      });
    }
    if (payload.contentDirty) {
      result = await deps.service.savePrompt(promptId, payload.content);
    }
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
    const result = await deps.service.restoreDefaultPrompt(promptId);
    applyPromptSaveResult(result);
    deps.setNotice("已恢复默认提示词。");
  }

  async function handleCreatePrompt(payload: { label: string; description?: string; content: string }) {
    const result = await deps.service.createPrompt(payload);
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
    const result = await deps.service.deletePrompt(promptId);
    deps.setPromptPreviewError("");
    deps.setPromptPreviews((current) => buildPromptPreviewsAfterDelete(current, result));
    deps.setActivePromptPreviewId(result.items[0]?.id ?? "");
    deps.setNotice("提示词已删除。");
  }

  return {
    persistActivePromptRoute,
    refreshPromptPreviews,
    applyPromptSaveResult,
    handleSavePromptDraft,
    handleRestoreDefaultPrompt,
    handleCreatePrompt,
    handleDeletePrompt,
  };
}
