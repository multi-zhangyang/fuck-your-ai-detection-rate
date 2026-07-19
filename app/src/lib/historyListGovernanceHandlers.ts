import { stringifyError } from "@/lib/errorText";
import {
  buildHistoryArtifactFilters,
  buildProtectedHistoryArtifactPaths,
  createEmptyHistoryArtifactQuery,
  createFailedHistoryArtifactQuery,
} from "@/lib/historyArtifactHelpers";
import type {
  HistoryHandlersDeps,
} from "@/lib/historyHandlerTypes";
import type { RefreshHistoryListOptions } from "@/lib/historyHandlerInputTypes";
import { ACTIVE_PROMPT_PROFILE_KEY, ACTIVE_PROMPT_SEQUENCE_KEY } from "@/lib/storageKeys";
import { writeStorageValue } from "@/lib/safeStorage";
import {
  beginHistoryRequest,
  getCurrentHistoryArtifactMode,
  isCurrentHistoryRequest,
  setCurrentHistoryArtifactMode,
} from "@/lib/historyRequestGeneration";
import type {
  HistoryArtifactGovernanceMode,
  ModelConfig,
} from "@/types/app";

export function createHistoryListGovernanceHandlers(deps: HistoryHandlersDeps) {
  function syncHistorySelectionConfigToUi(nextConfig: ModelConfig) {
    deps.setModelConfig(nextConfig);
    writeStorageValue(ACTIVE_PROMPT_PROFILE_KEY, nextConfig.promptProfile);
    writeStorageValue(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(nextConfig.promptSequence));
  }

  function getProtectedHistoryArtifactPaths(): string[] {
    return buildProtectedHistoryArtifactPaths({
      sourcePath: deps.getDocumentStatus()?.sourcePath,
      outputPath: deps.getRoundResult()?.outputPath,
      compareOutputPath: deps.getActiveCompareData()?.outputPath,
      exportPath: deps.getLastExportResult()?.path,
    });
  }

  async function refreshHistoryList(options: RefreshHistoryListOptions = {}) {
    const result = await deps.service.listDocumentHistories();
    if (!options.shouldCommit || options.shouldCommit()) {
      deps.setHistoryItems(result.items);
    }
    return result.items;
  }

  async function refreshHistoryOrphanScan() {
    const result = await deps.service.scanHistoryOrphans(getProtectedHistoryArtifactPaths());
    deps.setHistoryOrphanScan(result);
    return result;
  }

  async function refreshHistoryArtifactGovernance(mode?: HistoryArtifactGovernanceMode) {
    const requestKey = deps.setHistoryArtifactQuery as unknown as object;
    const requestedMode = mode
      ?? getCurrentHistoryArtifactMode(requestKey, deps.getHistoryArtifactMode());
    setCurrentHistoryArtifactMode(requestKey, requestedMode);
    const generation = beginHistoryRequest(requestKey, "artifact");
    const filters = buildHistoryArtifactFilters({
      mode: requestedMode,
      currentDocId: deps.getDocumentStatus()?.docId,
      fallbackDocId: deps.getHistoryItems()[0]?.docId,
    });
    deps.setHistoryArtifactMode(requestedMode);
    // Do not leave a response for the previous mode visible while the new
    // mode is loading. The mode and query must describe the same request.
    deps.setHistoryArtifactQuery(null);
    if (!filters) {
      if (isCurrentHistoryRequest(requestKey, "artifact", generation)) {
        deps.setHistoryArtifactQuery(createEmptyHistoryArtifactQuery("先选择一篇文档，再查看当前文档资产。"));
        deps.setHistoryArtifactLoading(false);
      }
      return null;
    }
    deps.setHistoryArtifactLoading(true);
    try {
      const result = await deps.service.queryHistoryArtifacts(filters);
      if (isCurrentHistoryRequest(requestKey, "artifact", generation)) {
        deps.setHistoryArtifactQuery(result);
      }
      return result;
    } catch (appError) {
      const message = stringifyError(appError);
      if (isCurrentHistoryRequest(requestKey, "artifact", generation)) {
        deps.setHistoryArtifactQuery(createFailedHistoryArtifactQuery(filters, message));
        deps.setError(message);
      }
      return null;
    } finally {
      if (isCurrentHistoryRequest(requestKey, "artifact", generation)) {
        deps.setHistoryArtifactLoading(false);
      }
    }
  }

  return {
    syncHistorySelectionConfigToUi,
    getProtectedHistoryArtifactPaths,
    refreshHistoryList,
    refreshHistoryOrphanScan,
    refreshHistoryArtifactGovernance,
  };
}
