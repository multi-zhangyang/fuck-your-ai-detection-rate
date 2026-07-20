import {
  buildRestoredSnapshotRuntimeStep,
  buildRestoredSuppressedSnapshotRuntimeStep,
  persistRestoredPromptRoute,
  resolveLoadedSnapshotPromptRoute,
} from "@/lib/documentRestoreHelpers";
import { shouldSuppressAutoSnapshotRestore } from "@/lib/autoSnapshot";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";
import type {
  HistoryListRefreshResult,
  RefreshHistoryListOptions,
} from "@/lib/historyHandlerInputTypes";

export type DocumentRestoreSuccessDeps = {
  sourcePath: string;
  nextConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  taskTicket: number;
  taskTicketRef: { current: number };
  refreshDocumentState: (
    sourcePath: string,
    config?: ModelConfig,
    options?: { shouldCommit?: () => boolean },
  ) => Promise<DocumentStatus>;
  refreshHistoryList: (options?: RefreshHistoryListOptions) => Promise<HistoryListRefreshResult>;
  clearLoadedRoundSnapshot: () => void;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
      shouldCommit?: () => boolean;
    },
  ) => Promise<unknown>;
  setModelConfig: (config: ModelConfig) => void;
  setRuntimeStep: (step: string) => void;
};

export async function runDocumentRestoreSuccessPath(deps: DocumentRestoreSuccessDeps): Promise<void> {
  const {
    sourcePath,
    nextConfig,
    promptOptions,
    promptWorkflows,
    taskTicket,
    taskTicketRef,
    refreshDocumentState,
    refreshHistoryList,
    clearLoadedRoundSnapshot,
    loadLatestRoundSnapshot,
    setModelConfig,
    setRuntimeStep,
  } = deps;
  const taskIsCurrent = () => taskTicket === taskTicketRef.current;
  const status = await refreshDocumentState(sourcePath, nextConfig, { shouldCommit: taskIsCurrent });
  if (!taskIsCurrent()) {
    return;
  }
  const refreshedHistory = await refreshHistoryList({ shouldCommit: taskIsCurrent });
  if (!taskIsCurrent()) {
    return;
  }
  if (refreshedHistory.status !== "current" || !refreshedHistory.isCurrent()) {
    return;
  }
  const historyIsCurrent = () => taskIsCurrent() && refreshedHistory.isCurrent();
  const nextHistoryItems = refreshedHistory.items;
  if (shouldSuppressAutoSnapshotRestore(status, nextConfig, promptOptions, promptWorkflows)) {
    clearLoadedRoundSnapshot();
    setRuntimeStep(buildRestoredSuppressedSnapshotRuntimeStep());
    return;
  }
  const loadedSnapshot = await loadLatestRoundSnapshot(status, nextConfig, {
    historyItems: nextHistoryItems,
    allowProfileFallback: true,
    shouldCommit: historyIsCurrent,
  });
  if (!historyIsCurrent()) {
    return;
  }
  const loadedRoute = resolveLoadedSnapshotPromptRoute({
    loadedSnapshot: loadedSnapshot as {
      round?: { promptProfile?: string | null; promptSequence?: string[] | null } | null;
      compareData?: { promptProfile?: string | null; promptSequence?: string[] | null } | null;
    } | null,
    nextConfig,
    promptOptions,
    promptWorkflows,
  });
  if (loadedRoute.shouldSync) {
    if (!historyIsCurrent()) return;
    setModelConfig(loadedRoute.syncedConfig);
    persistRestoredPromptRoute(
      loadedRoute.syncedConfig.promptProfile,
      loadedRoute.syncedConfig.promptSequence,
    );
    await refreshDocumentState(status.sourcePath, loadedRoute.syncedConfig, {
      shouldCommit: historyIsCurrent,
    });
    if (!historyIsCurrent()) {
      return;
    }
  }
  if (!historyIsCurrent()) return;
  setRuntimeStep(buildRestoredSnapshotRuntimeStep(loadedSnapshot));
}
