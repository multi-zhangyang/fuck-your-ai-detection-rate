import {
  formatHistoryBytes as formatBytes,
  getMaxRounds,
  getRoundsForProfile,
  getCompletedRounds,
  getSafeArtifactStats,
  mergeArtifactStats,
  hasExportableOutput,
  getMaintenanceStateLabel as getMaintenanceStateLabelHelper,
} from "@/lib/historyCardHelpers";
import type {
  HistoryArtifactQueryResponse,
  HistoryDocumentSummary,
  HistoryOrphanScanResult,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function deriveHistoryCardSummaryState(input: {
  items: HistoryDocumentSummary[];
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  orphanScan: HistoryOrphanScanResult | null;
  artifactQuery: HistoryArtifactQueryResponse | null;
  artifactLoading: boolean;
}) {
  const {
    items,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    orphanScan,
    artifactQuery,
    artifactLoading,
  } = input;
  const maxRounds = getMaxRounds(promptProfile, promptSequence, promptOptions, promptWorkflows);
  const totalStats = mergeArtifactStats(items.map((item) => item.artifactStats));
  const continuationCount = items.filter((item) => {
    const completedRounds = getCompletedRounds(
      getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows),
      promptProfile,
      promptSequence,
      promptOptions,
      promptWorkflows,
    );
    return completedRounds.length < maxRounds;
  }).length;
  const exportableCount = items.filter((item) => hasExportableOutput(
    item,
    getRoundsForProfile(item.rounds, promptProfile, promptSequence, promptOptions, promptWorkflows),
  )).length;
  const missingDocumentCount = items.filter((item) => getSafeArtifactStats(item.artifactStats).missing > 0).length;
  const maintenanceStateLabel = getMaintenanceStateLabelHelper({
    missingDocumentCount,
    orphanCount: orphanScan?.orphanStats.existing ?? 0,
    query: artifactQuery,
    loading: artifactLoading,
  });
  return {
    maxRounds,
    totalStats,
    totalBytesLabel: formatBytes(totalStats.bytes),
    continuationCount,
    exportableCount,
    missingDocumentCount,
    maintenanceStateLabel,
  };
}
