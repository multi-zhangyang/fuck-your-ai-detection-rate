import type { HistoryDatabaseRecoverResult } from "@/types/app";

export function buildHistoryDatabaseRecoverySuccessMessage(
  result: HistoryDatabaseRecoverResult,
): string {
  switch (result.reconciliation?.action) {
    case "rebuild-index-from-preserved-json":
      return "已保留较新历史并重建索引";
    case "json-and-recovered-index-aligned":
      return "JSON 历史与恢复索引一致，历史索引已恢复";
    case "hydrate-missing-json-from-recovered-index":
      return "原 JSON 历史缺失，已从健康备份恢复历史并重建索引";
    default:
      return "历史索引恢复完成；JSON 历史仍是权威数据源";
  }
}
