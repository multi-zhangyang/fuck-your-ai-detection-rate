import { formatHistoryBytes } from "@/lib/historyCardFormatHelpers";
import type {
  HistoryArtifactStats,
  HistoryDocumentSummary,
  HistoryRound,
} from "@/types/app";

export function getSafeArtifactStats(stats?: HistoryArtifactStats): HistoryArtifactStats {
  return stats ?? {
    total: 0,
    existing: 0,
    intermediate: 0,
    exports: 0,
    reports: 0,
    sources: 0,
    external: 0,
    missing: 0,
    bytes: 0,
  };
}

export function mergeArtifactStats(items: Array<HistoryArtifactStats | undefined>): HistoryArtifactStats {
  return items.reduce<HistoryArtifactStats>((total, item) => ({
    total: total.total + (item?.total ?? 0),
    existing: total.existing + (item?.existing ?? 0),
    intermediate: total.intermediate + (item?.intermediate ?? 0),
    exports: total.exports + (item?.exports ?? 0),
    reports: total.reports + (item?.reports ?? 0),
    sources: (total.sources ?? 0) + (item?.sources ?? 0),
    external: total.external + (item?.external ?? 0),
    missing: total.missing + (item?.missing ?? 0),
    bytes: total.bytes + (item?.bytes ?? 0),
  }), {
    total: 0,
    existing: 0,
    intermediate: 0,
    exports: 0,
    reports: 0,
    sources: 0,
    external: 0,
    missing: 0,
    bytes: 0,
  });
}

export function getLatestRound(rounds: HistoryRound[]): HistoryRound | null {
  if (!rounds.length) {
    return null;
  }
  return [...rounds].sort((left, right) => {
    const leftTime = new Date(left.timestamp || "").getTime();
    const rightTime = new Date(right.timestamp || "").getTime();
    const normalizedLeft = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRight = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedRight - normalizedLeft;
  })[0] ?? null;
}

export function hasExportableOutput(item: HistoryDocumentSummary, rounds: HistoryRound[]): boolean {
  return Boolean(item.latestOutputPath || rounds.some((round) => round.outputPath));
}

export function getExportStateText(item: HistoryDocumentSummary, rounds: HistoryRound[]): string {
  if (!hasExportableOutput(item, rounds)) {
    return "暂无输出";
  }
  const missingCount = getSafeArtifactStats(item.artifactStats).missing
    + rounds.reduce((total, round) => total + getSafeArtifactStats(round.artifactStats).missing, 0);
  return missingCount ? "需检查" : "可导出";
}

export function getCleanupStateText(stats?: HistoryArtifactStats): string {
  const safeStats = getSafeArtifactStats(stats);
  if (!safeStats.existing) {
    return "很干净";
  }
  return formatHistoryBytes(safeStats.bytes);
}
