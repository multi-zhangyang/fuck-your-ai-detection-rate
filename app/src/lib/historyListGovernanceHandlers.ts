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
import { ACTIVE_PROMPT_PROFILE_KEY, ACTIVE_PROMPT_SEQUENCE_KEY } from "@/lib/storageKeys";
import { writeStorageValue } from "@/lib/safeStorage";
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

  async function refreshHistoryList() {
    const result = await deps.service.listDocumentHistories();
    deps.setHistoryItems(result.items);
    return result.items;
  }

  async function refreshHistoryOrphanScan() {
    const result = await deps.service.scanHistoryOrphans(getProtectedHistoryArtifactPaths());
    deps.setHistoryOrphanScan(result);
    return result;
  }

  async function refreshHistoryArtifactGovernance(mode = deps.getHistoryArtifactMode()) {
    const filters = buildHistoryArtifactFilters({
      mode,
      currentDocId: deps.getDocumentStatus()?.docId,
      fallbackDocId: deps.getHistoryItems()[0]?.docId,
    });
    deps.setHistoryArtifactMode(mode);
    if (!filters) {
      deps.setHistoryArtifactQuery(createEmptyHistoryArtifactQuery("先选择一篇文档，再查看当前文档资产。"));
      return null;
    }
    deps.setHistoryArtifactLoading(true);
    try {
      const result = await deps.service.queryHistoryArtifacts(filters);
      deps.setHistoryArtifactQuery(result);
      return result;
    } catch (appError) {
      const message = stringifyError(appError);
      deps.setHistoryArtifactQuery(createFailedHistoryArtifactQuery(filters, message));
      deps.setError(message);
      return null;
    } finally {
      deps.setHistoryArtifactLoading(false);
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
