import { Database, HardDriveDownload, Loader2, RotateCcw, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatHistoryBytes as formatBytes } from "@/lib/historyCardFormatHelpers";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type {
  HistoryDatabaseBackupListResult,
  HistoryDatabaseMaintenanceSummary,
} from "@/types/app";

export function HistoryDatabaseMaintenancePanel({
  summary,
  summaryLoading,
  backups,
  backupsLoading,
  busy,
  onRefresh,
  onRefreshBackups,
  onBackup,
  onCompact,
  onRecover,
}: {
  summary: HistoryDatabaseMaintenanceSummary | null;
  summaryLoading: boolean;
  backups: HistoryDatabaseBackupListResult | null;
  backupsLoading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onRefreshBackups: () => void;
  onBackup: () => void;
  onCompact: () => void;
  onRecover: (backupPath: string | null) => void;
}) {
  const storage = summary?.storage;
  const fileSize = storage?.fileSizeBytes ?? 0;
  const freeBytes = storage?.freeBytes ?? 0;
  const freeRatio = storage?.freeRatio ?? 0;
  const shouldCompact = Boolean(summary?.policy?.shouldCompact);
  const backupItems = backups?.items ?? [];

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">历史库维护</Badge>
            {summary ? (
              <Badge variant={summary.ok ? "secondary" : "warning"}>
                {summary.ok ? "索引在线" : "索引异常"}
              </Badge>
            ) : null}
            {shouldCompact ? <Badge variant="warning">建议压缩</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy || summaryLoading}>
            {summaryLoading ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Search data-icon="inline-start" />}
            {summaryLoading ? "读取中" : "概览"}
          </Button>
          <Button variant="outline" size="sm" onClick={onRefreshBackups} disabled={busy || backupsLoading}>
            {backupsLoading ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <HardDriveDownload data-icon="inline-start" />}
            {backupsLoading ? "读取中" : "备份列表"}
          </Button>
          <Button variant="outline" size="sm" onClick={onBackup} disabled={busy}>
            <HardDriveDownload data-icon="inline-start" />
            立即备份
          </Button>
          <Button variant="outline" size="sm" onClick={onCompact} disabled={busy}>
            <Database data-icon="inline-start" />
            压缩
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={fileSize ? "secondary" : "outline"}>库大小 {summary ? formatBytes(fileSize) : "未读取"}</Badge>
        <Badge variant={freeBytes ? "secondary" : "outline"}>空闲 {summary ? formatBytes(freeBytes) : "未读取"}</Badge>
        <Badge variant={freeRatio ? "secondary" : "outline"}>碎片率 {summary ? `${(freeRatio * 100).toFixed(1)}%` : "未读取"}</Badge>
        <Badge variant="outline">备份 {summary ? summary.backupCount ?? 0 : "未读取"}</Badge>
      </div>

      {summary?.path ? (
        <div className="mt-2 truncate text-xs text-muted-foreground" title={summary.path}>
          {summary.path}
        </div>
      ) : null}

      {summaryLoading ? (
        <div className="mt-3 text-xs text-muted-foreground">正在加载维护概览…</div>
      ) : !summary ? (
        <div className="mt-3 text-xs text-muted-foreground">尚未读取维护概览。</div>
      ) : null}

      {backupsLoading ? (
        <div className="mt-3 text-xs text-muted-foreground">正在加载备份列表…</div>
      ) : backups && backupItems.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          {backupItems.map((entry) => (
            <div
              key={entry.path}
              className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
            >
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground" title={entry.path}>
                  {entry.name}
                </div>
                <div className="mt-0.5 text-muted-foreground">
                  {formatBytes(entry.sizeBytes)}
                  {entry.modifiedAt ? ` · ${entry.modifiedAt}` : ""}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRecover(entry.path)}
                disabled={busy}
              >
                <RotateCcw data-icon="inline-start" />
                恢复索引
              </Button>
            </div>
          ))}
        </div>
      ) : backups ? (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardDriveDownload />
            </EmptyMedia>
            <EmptyTitle>暂无历史库备份</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HardDriveDownload />
            </EmptyMedia>
            <EmptyTitle>尚未读取备份列表</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
