import { AlertTriangle, CheckCircle2, Database } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatBytes, formatDateTime } from "@/lib/formatters";
import type { EnvironmentDiagnostics } from "@/types/app";

const ACTION_LABELS: Record<string, string> = {
  none: "无需操作",
  "compact-index": "已自动压缩",
  "repair-index": "已自动修复",
  "recover-from-backup": "已从备份恢复",
  "refresh-json-backup": "已同步兼容备份",
  failed: "治理失败",
};

const COMPACTION_REASON_LABELS: Record<string, string> = {
  delete_event_threshold: "删除操作较多",
  deleted_row_threshold: "累计删除记录较多",
  free_bytes_threshold: "可回收空间较大",
  free_ratio_threshold: "空闲页比例较高",
};

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 px-3 py-2.5">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-base font-semibold text-foreground">{value}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

export function DiagnosticsHistoryDatabaseSection({ value }: { value: EnvironmentDiagnostics["historyDatabase"] }) {
  if (!value) return null;
  const status = value.status;
  const storage = value.storage;
  const readiness = value.readiness;
  const shouldCompact = Boolean(value.policy?.shouldCompact);
  const ready = Boolean(value.ok && readiness?.ok !== false);
  const error = readiness?.error || readiness?.compactError || value.error || storage?.error || "";
  const action = readiness?.action || "none";
  const reasons = (value.policy?.reasons ?? []).map((reason) => COMPACTION_REASON_LABELS[reason] ?? reason);

  return (
    <Card>
      <CardHeader className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-9"><Database className="size-4" /></span>
            <div className="min-w-0">
              <CardTitle className="text-base">历史数据库</CardTitle>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">SQLite 查询索引与自动治理状态</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={ready ? "success" : "warning"}>{ready ? "索引就绪" : "需要处理"}</Badge>
            {shouldCompact ? <Badge variant="warning">建议压缩</Badge> : null}
            <Badge variant="outline">{ACTION_LABELS[action] ?? action}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="grid divide-y overflow-hidden rounded-md border bg-background sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
          <Metric
            label="索引结构"
            value={status?.exists ? `Schema v${status.schemaVersion ?? "-"}` : "尚未创建"}
            detail={`${status?.migrationCount ?? 0} 项迁移`}
          />
          <Metric
            label="历史规模"
            value={`${status?.documentCount ?? 0} 文档 · ${status?.roundCount ?? 0} 轮`}
            detail={`${status?.artifactCount ?? 0} 个资产索引`}
          />
          <Metric
            label="存储空间"
            value={formatBytes(storage?.fileSizeBytes ?? 0)}
            detail={`可回收 ${formatBytes(storage?.freeBytes ?? 0)} · ${((storage?.freeRatio ?? 0) * 100).toFixed(1)}%`}
          />
          <Metric
            label="安全备份"
            value={`${value.backupCount ?? 0} 份`}
            detail={value.latestBackup?.modifiedAt ? `最近 ${formatDateTime(value.latestBackup.modifiedAt)}` : "暂无备份"}
          />
        </div>

        <div className="mt-3 flex min-w-0 items-start gap-2 rounded-md bg-muted/45 px-3 py-2 text-xs">
          {ready
            ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
          <div className="min-w-0 flex-1">
            <div className="font-medium text-foreground">
              {error || (shouldCompact ? "历史库可继续使用，但当前空间策略建议执行压缩。" : "历史库自检与自动治理已完成。")}
            </div>
            <div className="mt-0.5 break-words text-[11px] text-muted-foreground">
              {reasons.length ? `压缩依据：${reasons.join("、")}。` : "当前没有触发压缩阈值。"}
              {readiness?.checkedAt ? ` 检查于 ${formatDateTime(readiness.checkedAt)}。` : ""}
            </div>
          </div>
        </div>
        {value.path ? <div className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={value.path}>{value.path}</div> : null}
      </CardContent>
    </Card>
  );
}
