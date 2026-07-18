import { Activity, Clock3 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  formatShortTaskId,
  getDiagnosticBadgeVariant,
  getDiagnosticTaskBadgeVariant,
  getDiagnosticTaskStatus,
  getTaskItemNumber,
  getTaskItemRecord,
  getTaskItemString,
  isDiagnosticTaskActive,
  type DiagnosticTaskItem,
} from "@/lib/diagnosticsHelpers";
import { formatDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { EnvironmentDiagnostics } from "@/types/app";

export function DiagnosticSummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-lg font-semibold text-foreground">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

export function DiagnosticCheckCard({ item }: { item: EnvironmentDiagnostics["checks"][number] }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-md border bg-card px-3 py-2", item.level === "error" && "border-destructive/30 bg-destructive/5", item.level === "warning" && "border-primary/25 bg-muted/60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-semibold text-foreground">{item.label}</div>
        <Badge className="shrink-0" variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "success" ? "通过" : item.level === "error" ? "错误" : item.level === "warning" ? "提示" : "信息"}</Badge>
      </div>
      <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message}</div>
    </div>
  );
}

export function DiagnosticTaskAlert({ item }: { item: DiagnosticTaskItem }) {
  const isBatch = getTaskItemString(item, "taskType") === "batch-rerun";
  const active = isDiagnosticTaskActive(item);
  const status = getDiagnosticTaskStatus(item);
  const lastEvent = getTaskItemRecord(item, "lastEvent");
  const targetPath = getTaskItemString(item, "targetPath") || getTaskItemString(item, "sourcePath") || getTaskItemString(item, "outputPath");
  const updatedAt = getTaskItemString(item, "persistedAt") || getTaskItemString(item, "updatedAt") || getTaskItemString(item, "createdAt");
  const totalCount = getTaskItemNumber(item, "totalCount");
  const completedCount = getTaskItemNumber(item, "completedCount");
  const successCount = getTaskItemNumber(item, "successCount");
  const failureCount = getTaskItemNumber(item, "failureCount");
  const eventCount = getTaskItemNumber(item, "eventCount");
  const phase = typeof lastEvent?.phase === "string" ? lastEvent.phase : "";
  const chunkId = typeof lastEvent?.chunkId === "string" ? lastEvent.chunkId : getTaskItemString(item, "currentChunkId");
  const error = getTaskItemString(item, "error");

  return (
    <div className={cn("flex gap-3 p-3", (getTaskItemString(item, "status") === "interrupted" || active) && "bg-muted/60")}>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        {active ? <Activity /> : <Clock3 />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground">
          <span className="min-w-0 truncate">后台任务 · {formatShortTaskId(item.runId) ?? item.runId}</span>
          <span className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{isBatch ? "局部优化" : "全文改写"}</Badge>
            <Badge variant={getDiagnosticTaskBadgeVariant(item)}>{status}</Badge>
          </span>
        </div>
        <div className="grid gap-1 pt-1 text-xs text-muted-foreground">
          <span className="truncate font-medium">{targetPath || "未返回路径"}</span>
          {isBatch && totalCount !== null ? (
            <span>
              {completedCount ?? 0}/{totalCount} 段 · 成功 {successCount ?? 0} · 失败 {failureCount ?? 0}
              {chunkId ? ` · 当前 ${chunkId}` : ""}
            </span>
          ) : (
            <span>
              事件 {eventCount ?? 0} 个
              {phase ? ` · 阶段 ${phase}` : ""}
              {chunkId ? ` · 块 ${chunkId}` : ""}
            </span>
          )}
          {error ? <span className="rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">{error}</span> : null}
          <span>{active ? "更新" : "落盘"} {formatDateTime(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

export function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <b className="min-w-0 truncate text-right text-foreground">{value}</b>
    </div>
  );
}
