import { AlertTriangle, CheckCircle2, Database, HardDriveDownload, Loader2, RotateCcw, Search, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatHistoryBytes as formatBytes } from "@/lib/historyCardFormatHelpers";
import { formatDateTime } from "@/lib/formatters";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type {
  HistoryDatabaseBackupListResult,
  HistoryDatabaseCheckResult,
  HistoryDatabaseMaintenanceSummary,
} from "@/types/app";

const HISTORY_CHECK_ACTION_LABELS: Record<string, string> = {
  "history-db-repair": "修复历史索引",
  "manual-review": "人工检查历史记录",
};

function formatRecommendedAction(action: string): string {
  const normalized = action.trim();
  return HISTORY_CHECK_ACTION_LABELS[normalized] ?? normalized;
}

export function HistoryDatabaseMaintenancePanel({
  summary,
  summaryLoading,
  backups,
  backupsLoading,
  check,
  checkLoading,
  busy,
  onRefresh,
  onRefreshBackups,
  onCheck,
  onBackup,
  onCompact,
  onRecover,
}: {
  summary: HistoryDatabaseMaintenanceSummary | null;
  summaryLoading: boolean;
  backups: HistoryDatabaseBackupListResult | null;
  backupsLoading: boolean;
  check: HistoryDatabaseCheckResult | null;
  checkLoading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onRefreshBackups: () => void;
  onCheck: () => void;
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
            {check ? (
              <Badge variant={check.ok ? "success" : check.errorCount ? "danger" : "warning"}>
                {check.ok ? "完整校验通过" : `校验发现 ${check.issueCount} 项`}
              </Badge>
            ) : null}
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
          <Button variant="outline" size="sm" onClick={onCheck} disabled={busy || checkLoading}>
            {checkLoading ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <ShieldCheck data-icon="inline-start" />}
            {checkLoading ? "校验中" : "完整校验"}
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

      {check ? (
        <div className="mt-3 rounded-md border bg-background p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 items-start gap-2">
              {check.ok
                ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />}
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground">
                  {check.ok ? "当前历史库结构与数据完整" : "当前历史库需要处理"}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  错误 {check.errorCount} · 警告 {check.warningCount} · 共 {check.issueCount} 项
                  {check.checkedAt ? ` · ${formatDateTime(check.checkedAt)}` : ""}
                </div>
              </div>
            </div>
            {check.repairableIssueCount ? <Badge variant="warning">{check.repairableIssueCount} 项可修复</Badge> : null}
          </div>
          {check.issues.length ? (
            <div className="mt-3 divide-y overflow-hidden rounded-md border">
              {check.issues.map((issue, index) => (
                <div key={`${issue.code}-${index}`} className="grid gap-1 px-3 py-2 text-[11px] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-2">
                  <Badge variant={issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "outline"} className="w-fit">
                    {issue.severity === "error" ? "错误" : issue.severity === "warning" ? "警告" : "信息"}
                  </Badge>
                  <div className="min-w-0">
                    <div className="break-words text-foreground">{issue.message}</div>
                    {issue.recommendedAction ? (
                      <div className="mt-0.5 break-words text-muted-foreground">
                        建议操作：{formatRecommendedAction(issue.recommendedAction)}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : checkLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
          <Loader2 className={LOADING_ICON_CLASS_NAME} />正在执行只读完整校验…
        </div>
      ) : (
        <div className="mt-3 text-xs text-muted-foreground">尚未执行当前历史库完整校验。</div>
      )}

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
                  {entry.modifiedAt ? ` · ${formatDateTime(entry.modifiedAt)}` : ""}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge variant={entry.ok === true ? "success" : entry.ok === false ? "danger" : "outline"}>
                    {entry.ok === true ? "备份有效" : entry.ok === false ? "备份异常" : "未校验"}
                  </Badge>
                  {entry.validation ? (
                    <span className="text-[11px] text-muted-foreground">
                      错误 {entry.validation.errorCount} · 警告 {entry.validation.warningCount}
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRecover(entry.path)}
                disabled={busy || entry.ok === false}
                title={entry.ok === false ? "异常备份不能用于恢复" : undefined}
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
