import { formatBytes } from "@/lib/formatters";
import type { DeleteHistoryOptions, HistoryDeleteImpact, HistoryDeleteMode } from "@/types/app";

export function getHistoryDeleteCopy(options?: DeleteHistoryOptions): {
  actionLabel: string;
  confirmText: string;
  doneLabel: string;
} {
  const mode: HistoryDeleteMode = options?.mode ?? "records_and_artifacts";
  const fromRound = options?.fromRound;
  if (mode === "records_artifacts_and_source") {
    return {
      actionLabel: "彻底清理该文档项目副本",
      confirmText: "确认彻底清理这篇文档的项目副本吗？\n\n会删除历史记录、轮次中间产物、项目导出副本，并且只在源文件位于项目 origin 目录时删除该源文档副本；不会删除浏览器下载目录或其他外部路径文件。",
      doneLabel: "项目副本彻底清理完成",
    };
  }
  if (mode === "exports_only") {
    return {
      actionLabel: fromRound ? `清理第 ${fromRound} 轮及之后的项目导出副本` : "清理该文档项目导出副本",
      confirmText: fromRound
        ? `确认只清理第 ${fromRound} 轮及之后的项目导出副本吗？\n\n会删除项目内 Word/TXT 导出副本及其审计报告；会保留中间结果、Diff 和历史轮次。浏览器已经下载到本地的文件不受影响。`
        : "确认只清理该文档的项目导出副本吗？\n\n会删除项目内 Word/TXT 导出副本及其审计报告；会保留中间结果、Diff 和历史轮次。浏览器已经下载到本地的文件不受影响。",
      doneLabel: "项目导出副本清理完成",
    };
  }
  if (mode === "records_only") {
    return {
      actionLabel: fromRound ? `移除第 ${fromRound} 轮及之后的界面记录` : "仅移除该文档界面记录",
      confirmText: fromRound
        ? `确认只移除第 ${fromRound} 轮及之后的界面记录吗？\n\n不会删除项目里的生成文件，但这些文件会从界面索引中脱离。`
        : "确认只移除该文档的界面记录吗？\n\n不会删除项目里的生成文件，但这篇文档会从历史列表中消失。",
      doneLabel: "界面记录移除完成",
    };
  }
  return {
    actionLabel: fromRound ? `回滚第 ${fromRound} 轮及之后` : "删除该文档生成链路",
    confirmText: fromRound
      ? `确认回滚第 ${fromRound} 轮及之后吗？\n\n会删除对应历史轮次、中间文件、Diff、降检与质量报告和项目导出副本；不会删除源文档。`
      : "确认删除该文档的生成链路吗？\n\n会删除本项目为这篇文档生成的历史轮次、中间文件、Diff、降检与质量报告和项目导出副本；不会删除源文档。",
    doneLabel: fromRound ? "历史回滚完成" : "生成链路清理完成",
  };
}

export function buildHistoryDeleteConfirmText(baseText: string, impact: HistoryDeleteImpact | null): string {
  if (!impact) {
    return baseText;
  }
  const stats = impact.fileStats;
  const roundText = impact.affectedRounds.length ? impact.affectedRounds.join(", ") : "无";
  const sourceText = impact.willDeleteSource
    ? `源文档副本：会删除项目 origin 内源文件（${stats.sources ?? 0} 个）`
    : impact.sourceOwnedByProject
      ? "源文档副本：保留"
      : "源文档副本：外部路径不删除";
  const warningText = impact.warnings.length ? `\n提醒：${impact.warnings.join("；")}` : "";
  return [
    baseText,
    "",
    "【删除前影响预览】",
    `影响轮次：${roundText}`,
    `文件数量：${stats.existing} 个，占用 ${formatBytes(stats.bytes)}`,
    `分类：源副本 ${stats.sources ?? 0}，项目导出 ${stats.exports}，中间产物 ${stats.intermediate}，报告 ${stats.reports}`,
    sourceText,
    impact.hasMoreFiles ? "文件列表较长，界面只展示前 80 个，后端会按同一安全规则处理。" : "",
    warningText.trim(),
  ].filter(Boolean).join("\n");
}
