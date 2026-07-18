import {
  DEFAULT_PROMPT_SEQUENCE,
  formatPromptSequence as formatPromptSequenceFromRegistry,
  getPromptFlowSequence,
  getPromptProfileLabel,
  isPromptSequenceCustomizable,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { formatBytes } from "@/lib/formatters";
import type {
  DeleteHistoryOptions,
  HistoryArtifactQueryResponse,
  HistoryArtifactStats,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function formatTimestamp(value: string): string {
  if (!value) {
    return "时间未知";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDocName(item: HistoryDocumentSummary): string {
  const rawValue = item.originPath || item.sourcePath || item.docId;
  const parts = rawValue.split(/[\\/]/);
  return parts[parts.length - 1] || rawValue;
}

export function formatPathScope(value: string | undefined): string {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "来源未知";
  }
  const normalized = rawValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const filename = parts[parts.length - 1] || normalized;
  if (normalized.startsWith("origin/")) {
    return `项目源文档 · ${filename}`;
  }
  if (normalized.startsWith("finish/")) {
    return `项目生成物 · ${filename}`;
  }
  if (/^[a-zA-Z]:\//.test(normalized) || normalized.startsWith("//")) {
    return `本地文件 · ${filename}`;
  }
  return `文档索引 · ${filename}`;
}

export function formatHistoryBytes(value?: number): string {
  return formatBytes(Number(value ?? 0));
}
