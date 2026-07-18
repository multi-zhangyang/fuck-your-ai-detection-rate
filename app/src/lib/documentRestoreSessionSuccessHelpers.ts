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

export type DocumentRestoreSuccessDeps = {
  sourcePath: string;
  nextConfig: ModelConfig;
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  taskTicket: number;
  taskTicketRef: { current: number };
  refreshDocumentState: (sourcePath: string, config?: ModelConfig) => Promise<DocumentStatus>;
  refreshHistoryList: () => Promise<HistoryDocumentSummary[]>;
  clearLoadedRoundSnapshot: () => void;
  loadLatestRoundSnapshot: (
    status: DocumentStatus,
    config: ModelConfig,
    options?: {
      historyItems?: HistoryDocumentSummary[];
      allowProfileFallback?: boolean;
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
  const status = await refreshDocumentState(sourcePath, nextConfig);
  if (taskTicket !== taskTicketRef.current) {
    return;
  }
  const nextHistoryItems = await refreshHistoryList();
  if (taskTicket !== taskTicketRef.current) {
    return;
  }
  if (shouldSuppressAutoSnapshotRestore(status, nextConfig, promptOptions, promptWorkflows)) {
    clearLoadedRoundSnapshot();
    setRuntimeStep(buildRestoredSuppressedSnapshotRuntimeStep());
    return;
  }
  const loadedSnapshot = await loadLatestRoundSnapshot(status, nextConfig, {
    historyItems: nextHistoryItems,
    allowProfileFallback: true,
  });
  if (taskTicket !== taskTicketRef.current) {
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
    setModelConfig(loadedRoute.syncedConfig);
    persistRestoredPromptRoute(
      loadedRoute.syncedConfig.promptProfile,
      loadedRoute.syncedConfig.promptSequence,
    );
    await refreshDocumentState(status.sourcePath, loadedRoute.syncedConfig);
    if (taskTicket !== taskTicketRef.current) {
      return;
    }
  }
  setRuntimeStep(buildRestoredSnapshotRuntimeStep(loadedSnapshot));
}
