import type {
  DeleteHistoryOptions,
  HistoryArtifactQueryResponse,
  HistoryArtifactStats,
} from "@/types/app";

export function getDeleteModeLabel(mode: DeleteHistoryOptions["mode"]): string {
  if (mode === "records_only") return "只移除记录";
  if (mode === "exports_only") return "只清理项目导出";
  if (mode === "records_artifacts_and_source") return "彻底清理项目副本";
  return "删除生成链路";
}

export function getDeleteModeScope(fromRound?: number): string {
  return fromRound ? `第 ${fromRound} 轮起` : "整篇文档";
}

export function getOrphanKindLabel(kind: string): string {
  if (kind === "sources") return "源文档副本";
  if (kind === "exports") return "项目导出";
  if (kind === "reports") return "报告文件";
  if (kind === "intermediate") return "中间产物";
  return "其他";
}

export function getArtifactQueryStateLabel(query: HistoryArtifactQueryResponse | null, loading: boolean): string {
  if (loading) return "读取中";
  if (!query) return "未读取";
  if (!query.ok) return "需检查";
  return query.total ? `${query.total} 条` : "无异常";
}

export function getMaintenanceStateLabel(input: {
  missingDocumentCount: number;
  orphanCount: number;
  query: HistoryArtifactQueryResponse | null;
  loading: boolean;
}): string {
  if (input.loading) {
    return "读取中";
  }
  if (input.query?.ok === false) {
    return "需修复索引";
  }
  if (input.missingDocumentCount) {
    return `${input.missingDocumentCount} 篇需检查`;
  }
  if (input.orphanCount) {
    return `${input.orphanCount} 个可清理`;
  }
  return "已整理";
}
