import {
  formatHistoryBytes as formatBytes,
  getDeleteModeLabel,
  getSafeArtifactStats,
} from "@/lib/historyCardHelpers";
import type {
  HistoryDeleteImpact,
  HistoryOrphanScanResult,
} from "@/types/app";

export function deriveOrphanGovernancePanelState(scan: HistoryOrphanScanResult | null) {
  const stats = scan?.orphanStats ?? getSafeArtifactStats();
  const previewFiles = scan?.orphanFiles.slice(0, 6) ?? [];
  return {
    stats,
    previewFiles,
    sourceCount: scan?.orphanKindStats.sources.files ?? 0,
    exportCount: scan?.orphanKindStats.exports.files ?? 0,
    reportCount: scan?.orphanKindStats.reports.files ?? 0,
    occupiedLabel: formatBytes(stats.bytes),
  };
}

export function deriveAssetImpactPanelState(impact: HistoryDeleteImpact) {
  const stats = impact.fileStats;
  const previewFiles = impact.files.filter((file) => file.exists).slice(0, 8);
  const sourceState = impact.willDeleteSource
    ? "含源副本"
    : impact.sourceOwnedByProject
      ? "保留源副本"
      : "外部源文件";
  return {
    stats,
    previewFiles,
    sourceState,
    modeLabel: getDeleteModeLabel(impact.mode),
    deleteSummaryLabel: `将删除 ${stats.existing} 个文件 · ${formatBytes(stats.bytes)}`,
  };
}
