import {
  isPromptProfile,
} from "@/lib/historyHelpers";
import {
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { promptSequencesEqual } from "@/lib/modelRoute";
import type {
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function buildRestoredSnapshotRuntimeStep(loadedSnapshot: unknown): string {
  return loadedSnapshot ? "已恢复上次文档和最新 Diff。" : "已恢复上次文档，当前模式暂无 Diff。";
}

export function buildRestoredSuppressedSnapshotRuntimeStep(): string {
  return "已恢复文档；上次放弃本轮后不会自动载入旧 Diff。";
}

export function buildRestoredDocumentFailureRuntimeStep(): string {
  return "恢复上次文档失败";
}

export function buildRestoredDocumentDiscardNotice(): string {
  return "已跳过不可用的上次文档记录，请重新上传或从历史记录中手动选择可用文档。";
}

export function buildRestoredDocumentLoadingRuntimeStep(): string {
  return "正在恢复上次文档。";
}

export function resolveLoadedSnapshotPromptRoute(input: {
  loadedSnapshot: {
    round?: { promptProfile?: string | null; promptSequence?: string[] | null } | null;
    compareData?: { promptProfile?: string | null; promptSequence?: string[] | null } | null;
  } | null | undefined;
  nextConfig: ModelConfig;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): {
  shouldSync: boolean;
  syncedConfig: ModelConfig;
} {
  const loadedProfile = input.loadedSnapshot?.round?.promptProfile ?? input.loadedSnapshot?.compareData?.promptProfile;
  const loadedPromptProfile = isPromptProfile(loadedProfile, input.promptWorkflows)
    ? loadedProfile
    : input.nextConfig.promptProfile;
  const loadedSequence = normalizePromptSequence(
    input.loadedSnapshot?.round?.promptSequence
      ?? input.loadedSnapshot?.compareData?.promptSequence
      ?? input.nextConfig.promptSequence,
    input.promptOptions,
    loadedPromptProfile,
    input.promptWorkflows,
  );
  const shouldSync = Boolean(
    isPromptProfile(loadedProfile, input.promptWorkflows)
    && (
      loadedProfile !== input.nextConfig.promptProfile
      || !promptSequencesEqual(
        loadedSequence,
        input.nextConfig.promptSequence,
        input.promptOptions,
        loadedPromptProfile,
        input.promptWorkflows,
      )
    ),
  );
  return {
    shouldSync,
    syncedConfig: {
      ...input.nextConfig,
      promptProfile: loadedPromptProfile,
      promptSequence: loadedSequence,
    },
  };
}
