import {
  describeDocumentProgress,
  formatDocumentLoadStep,
} from "@/lib/documentStatusCopy";
import {
  buildConfigForHistorySelection,
  buildHistoryRouteStatusResult,
  planHistoryDocumentLoadFeedback,
  resolveLoadedHistoryRoute,
  shouldSyncHistorySelectionConfig,
} from "@/lib/historyHelpers";
import type {
  HistoryDocumentLoadFeedback,
  HistoryHandlersDeps,
  HistoryRouteStatusResult,
  LoadedHistorySnapshotLike,
  ResyncHistoryDocumentRouteInput,
} from "@/lib/historyHandlerTypes";
import type {
  HistoryDocumentSummary,
  ModelConfig,
} from "@/types/app";

type HistoryListGovernanceHandlers = {
  syncHistorySelectionConfigToUi: (nextConfig: ModelConfig) => void;
};

export function createHistoryDocumentRouteHandlers(
  deps: HistoryHandlersDeps,
  list: HistoryListGovernanceHandlers,
) {
  function resolveHistorySelectionConfig(item: HistoryDocumentSummary, configOverride: ModelConfig) {
    const selectedConfig = buildConfigForHistorySelection(
      item,
      configOverride,
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    );
    if (shouldSyncHistorySelectionConfig(
      selectedConfig,
      deps.getModelConfig(),
      deps.getPromptOptions(),
      deps.getPromptWorkflows(),
    )) {
      list.syncHistorySelectionConfigToUi(selectedConfig);
    }
    return selectedConfig;
  }

  async function resyncHistoryDocumentRoute(input: ResyncHistoryDocumentRouteInput): Promise<HistoryRouteStatusResult> {
    const loadedRoute = resolveLoadedHistoryRoute({
      selectedConfig: input.selectedConfig,
      loadedSnapshot: input.loadedSnapshot as LoadedHistorySnapshotLike,
      promptOptions: deps.getPromptOptions(),
      promptWorkflows: deps.getPromptWorkflows(),
    });
    if (!loadedRoute.shouldResync) {
      return buildHistoryRouteStatusResult(input.status, input.selectedConfig);
    }
    list.syncHistorySelectionConfigToUi(loadedRoute.statusConfig);
    return buildHistoryRouteStatusResult(
      await deps.refreshDocumentState(input.status.sourcePath, loadedRoute.statusConfig),
      loadedRoute.statusConfig,
    );
  }

  async function loadAndResyncHistoryDocument(item: HistoryDocumentSummary, selectedConfig: ModelConfig) {
    const status = await deps.refreshDocumentState(item.sourcePath, selectedConfig);
    const loadedSnapshot = await deps.loadLatestRoundSnapshot(status, selectedConfig, {
      historyItem: item,
      allowProfileFallback: true,
    });
    const resynced = await resyncHistoryDocumentRoute({ selectedConfig, loadedSnapshot, status });
    return { resynced, loadedSnapshot };
  }

  async function loadSelectedHistoryDocument(
    item: HistoryDocumentSummary,
    configOverride: ModelConfig,
  ): Promise<HistoryDocumentLoadFeedback> {
    const selectedConfig = resolveHistorySelectionConfig(item, configOverride);
    const { resynced, loadedSnapshot } = await loadAndResyncHistoryDocument(item, selectedConfig);
    return planHistoryDocumentLoadFeedback({
      status: resynced.status,
      statusConfig: resynced.statusConfig,
      loadedSnapshot,
      formatDocumentLoadStep,
      promptOptions: deps.getPromptOptions(),
      promptWorkflows: deps.getPromptWorkflows(),
      describeDocumentProgress,
    });
  }

  return {
    resolveHistorySelectionConfig,
    resyncHistoryDocumentRoute,
    loadAndResyncHistoryDocument,
    loadSelectedHistoryDocument,
  };
}
