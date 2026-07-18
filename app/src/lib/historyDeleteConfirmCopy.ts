import { buildHistoryDeleteConfirmText } from "@/lib/historyDeleteConfirmTextCopy";
import type { HistoryDeleteImpact, HistoryDeleteMode } from "@/types/app";

export function buildHistoryDeleteConfirmOptions(input: {
  actionLabel: string;
  confirmText: string;
  impact: HistoryDeleteImpact | null;
  mode?: HistoryDeleteMode;
  splitConfirmText: (text: string) => { description: string; details: string[] };
}): {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  cancelLabel: string;
  tone: "warning" | "danger";
} {
  const confirmBody = input.splitConfirmText(buildHistoryDeleteConfirmText(input.confirmText, input.impact));
  return {
    title: input.actionLabel,
    description: confirmBody.description,
    details: confirmBody.details,
    confirmLabel: "确认执行",
    cancelLabel: "取消",
    tone: input.mode === "records_only" ? "warning" : "danger",
  };
}

export function buildHistoryOrphanConfirmOptions(input: {
  totalOrphanFiles: number;
  orphanBytes: number;
  formatBytes: (bytes: number) => string;
}): {
  title: string;
  description: string;
  details: string[];
  confirmLabel: string;
  cancelLabel: string;
  tone: "danger";
} {
  return {
    title: `清理 ${input.totalOrphanFiles} 个未归属项目文件`,
    description: "只会删除项目目录中未被历史记录或当前文档引用的源文档副本和生成产物。",
    details: [
      `预计释放：${input.formatBytes(input.orphanBytes)}`,
      "浏览器已经下载到本地的文件不会受影响。",
      "外部路径文件不会被删除。",
    ],
    confirmLabel: "确认清理",
    cancelLabel: "先不清理",
    tone: "danger",
  };
}

export type HistoryDeleteDocumentFollowup<T extends { docId: string; sourcePath: string } = { docId: string; sourcePath: string }> =
  | { type: "none" }
  | { type: "clear-current" }
  | { type: "reload"; sourcePath: string; historyItem: T }
  | { type: "clear-snapshot" };

export function resolveHistoryDeleteDocumentFollowup<T extends { docId: string; sourcePath: string }>(input: {
  currentDocId?: string | null;
  deletedDocId: string;
  removedDocument: boolean;
  historyItems: T[];
}): HistoryDeleteDocumentFollowup<T> {
  if (input.currentDocId !== input.deletedDocId) {
    return { type: "none" };
  }
  if (input.removedDocument) {
    return { type: "clear-current" };
  }
  const matchedItem = input.historyItems.find((item) => item.docId === input.deletedDocId);
  if (matchedItem) {
    return { type: "reload", sourcePath: matchedItem.sourcePath, historyItem: matchedItem };
  }
  return { type: "clear-snapshot" };
}
