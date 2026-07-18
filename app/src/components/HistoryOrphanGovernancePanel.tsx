import { Search, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  formatHistoryBytes as formatBytes,
  getOrphanKindLabel,
} from "@/lib/historyCardHelpers";
import { deriveOrphanGovernancePanelState } from "@/lib/historyDeletePanelsViewModel";
import type { HistoryOrphanScanResult } from "@/types/app";

export function OrphanGovernancePanel({
  scan,
  busy,
  onScan,
  onDelete,
}: {
  scan: HistoryOrphanScanResult | null;
  busy: boolean;
  onScan: () => void;
  onDelete: () => void;
}) {
  const {
    stats,
    previewFiles,
    sourceCount,
    exportCount,
    reportCount,
    occupiedLabel,
  } = deriveOrphanGovernancePanelState(scan);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">未归属产物</Badge>
            {scan ? <Badge variant={stats.existing ? "secondary" : "outline"}>{stats.existing} 个</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onScan} disabled={busy}>
            <Search data-icon="inline-start" />
            扫描
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            disabled={busy || !scan || !stats.existing}
          >
            <Trash2 data-icon="inline-start" />
            清理未归属文件
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant={stats.existing ? "secondary" : "outline"}>可清理 {stats.existing}</Badge>
        <Badge variant="outline">占用 {occupiedLabel}</Badge>
        <Badge variant="outline">源副本 {sourceCount}</Badge>
        <Badge variant="outline">导出 {exportCount}</Badge>
        <Badge variant="outline">报告 {reportCount}</Badge>
      </div>

      {scan ? (
        previewFiles.length ? (
          <div className="mt-3 overflow-hidden rounded-lg border bg-background">
            {previewFiles.map((file) => (
              <div key={file.relativePath} className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                  <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
                </div>
                <Badge variant="outline">可清理</Badge>
              </div>
            ))}
            {scan.hasMore ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
          </div>
        ) : (
          <Empty className="mt-3 min-h-[6rem] border bg-background">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Trash2 />
              </EmptyMedia>
              <EmptyTitle>未发现未归属文件</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>未扫描</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
