import type { HistoryDocumentDeleteAction } from "@/lib/historyDocumentListViewTypes";
import type { DeleteHistoryOptions, HistoryDeleteImpact } from "@/types/app";

export function buildHistoryDocumentDeleteActions(): HistoryDocumentDeleteAction[] {
  return [
    { title: "只移除记录", options: { mode: "records_only" } },
    { title: "清理项目导出", options: { mode: "exports_only" } },
    { title: "删除生成链路", options: { mode: "records_and_artifacts" }, destructive: true },
    { title: "彻底清理项目副本", options: { mode: "records_artifacts_and_source" }, destructive: true },
  ];
}

export function resolveDocumentImpactPreview(input: {
  impactPreview: { key: string; impact: HistoryDeleteImpact } | null;
  documentDeleteActions: HistoryDocumentDeleteAction[];
  docId: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
}): HistoryDeleteImpact | null {
  if (!input.impactPreview) {
    return null;
  }
  return input.documentDeleteActions.some((action) => input.makeDeleteActionKey(input.docId, action.options) === input.impactPreview!.key)
    ? input.impactPreview.impact
    : null;
}
