import { formatBytes } from "@/lib/formatters";

export function buildHistoryDeleteResultNotice(result: {
  removedDocument: boolean;
  deletedRounds: number[];
  affectedRounds?: number[];
  deletedFileStats?: {
    existing: number;
    sources?: number;
    exports: number;
    intermediate: number;
    reports: number;
  } | null;
  deletedFiles: unknown[];
  failedFiles?: unknown[] | null;
}): string {
  const affectedRounds = result.deletedRounds.length ? result.deletedRounds : result.affectedRounds ?? [];
  const roundText = affectedRounds.length ? `影响轮次：${affectedRounds.join(", ")}。` : "没有匹配到可处理的轮次。";
  const deletedStats = result.deletedFileStats;
  const fileText = deletedStats
    ? `删除文件：${deletedStats.existing} 个（源副本 ${deletedStats.sources ?? 0}，项目导出 ${deletedStats.exports}，中间/报告 ${deletedStats.intermediate + deletedStats.reports}）。`
    : `删除生成文件：${result.deletedFiles.length} 个；源文档保留。`;
  const failedText = result.failedFiles?.length ? `另有 ${result.failedFiles.length} 个文件删除失败，已保留在项目目录中。` : "";
  return result.removedDocument
    ? `历史记录已移除。${roundText}${fileText}${failedText}`
    : `历史记录已更新。${roundText}${fileText}${failedText}`;
}

export function buildHistoryOrphanCleanupNotice(result: {
  deletedFileStats: {
    total: number;
    sources?: number;
    intermediate: number;
    exports: number;
    reports: number;
    bytes: number;
  };
  failedFiles: unknown[];
}): string {
  const deletedStats = result.deletedFileStats;
  const failedText = result.failedFiles.length ? `，${result.failedFiles.length} 个文件未能删除` : "";
  return `已清理 ${deletedStats.total} 个未归属项目文件（源副本 ${deletedStats.sources ?? 0}，生成物 ${deletedStats.intermediate + deletedStats.exports + deletedStats.reports}），释放 ${formatBytes(deletedStats.bytes)}${failedText}。`;
}
