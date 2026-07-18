import {
  resolveAutoSnapshotLoadedRoute,
} from "@/lib/autoSnapshotRestoreHelpers";
import { stringifyError } from "@/lib/errorText";
import { writeStorageValue } from "@/lib/safeStorage";
import {
  ACTIVE_PROMPT_PROFILE_KEY,
  ACTIVE_PROMPT_SEQUENCE_KEY,
} from "@/lib/storageKeys";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
  RoundCompareData,
} from "@/types/app";

export type AutoSnapshotLoadedSnapshot = {
  round?: {
    promptProfile?: string | null;
    promptSequence?: string[] | null;
  } | null;
  compareData: Pick<RoundCompareData, "round" | "promptProfile" | "promptSequence">;
};

export type AutoSnapshotSessionDeps = {
  documentStatus: DocumentStatus;
  plan: {
    restoreConfig: ModelConfig;
    matchedItem: HistoryDocumentSummary | null | undefined;
  };
  historyItems: HistoryDocumentSummary[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  isCanceled: () => boolean;
  loadLatestRoundSnapshotRef: {
    current: (
      status: DocumentStatus,
      config: ModelConfig,
      options?: {
        historyItems?: HistoryDocumentSummary[];
        historyItem?: HistoryDocumentSummary | null;
        allowProfileFallback?: boolean;
      },
    ) => Promise<AutoSnapshotLoadedSnapshot | null | undefined | void>;
  };
  refreshDocumentStateRef: {
    current: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  };
  latestModelConfigRef: { current: ModelConfig | null };
  setModelConfig: (config: ModelConfig) => void;
  setRuntimeStep: (step: string) => void;
  setNotice: (message: string) => void;
  clearRestoreKey: () => void;
};

export async function runAutoSnapshotRestoreSession(deps: AutoSnapshotSessionDeps): Promise<void> {
  const {
    documentStatus,
    plan,
    historyItems,
    promptOptions,
    promptWorkflows,
    isCanceled,
    loadLatestRoundSnapshotRef,
    refreshDocumentStateRef,
    latestModelConfigRef,
    setModelConfig,
    setRuntimeStep,
    setNotice,
    clearRestoreKey,
  } = deps;
  try {
    const loadedSnapshot = await loadLatestRoundSnapshotRef.current(documentStatus, plan.restoreConfig, {
      historyItems,
      historyItem: plan.matchedItem,
      allowProfileFallback: true,
    });
    if (isCanceled() || !loadedSnapshot) {
      return;
    }
    const loadedRoute = resolveAutoSnapshotLoadedRoute({
      loadedSnapshot,
      restoreConfig: plan.restoreConfig,
      promptOptions,
      promptWorkflows,
    });
    if (loadedRoute.shouldSync) {
      latestModelConfigRef.current = loadedRoute.syncedConfig;
      setModelConfig(loadedRoute.syncedConfig);
      writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, loadedRoute.loadedProfile);
      writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(loadedRoute.loadedSequence));
      await refreshDocumentStateRef.current(documentStatus.sourcePath, loadedRoute.syncedConfig);
      if (isCanceled()) {
        return;
      }
    }
    setRuntimeStep(`已恢复第 ${loadedSnapshot.compareData.round} 轮 Diff。`);
  } catch (appError) {
    if (!isCanceled()) {
      clearRestoreKey();
      setNotice(`检测到已有结果，但 Diff 恢复失败：${stringifyError(appError)}`);
    }
  }
}
