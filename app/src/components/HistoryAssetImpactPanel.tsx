import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  formatHistoryBytes as formatBytes,
  getOrphanKindLabel,
} from "@/lib/historyCardHelpers";
import { deriveAssetImpactPanelState } from "@/lib/historyDeletePanelsViewModel";
import type { HistoryDeleteImpact } from "@/types/app";

export function AssetImpactPanel({ impact }: { impact: HistoryDeleteImpact }) {
  const {
    stats,
    previewFiles,
    sourceState,
    modeLabel,
    deleteSummaryLabel,
  } = deriveAssetImpactPanelState(impact);
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">删除影响预览</Badge>
            <Badge variant="outline">{modeLabel}</Badge>
            {impact.fromRound ? <Badge variant="outline">从第 {impact.fromRound} 轮开始</Badge> : null}
          </div>
        </div>
        <Badge variant={stats.existing ? "warning" : "success"}>
          {deleteSummaryLabel}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">源副本 {stats.sources ?? 0}</Badge>
        <Badge variant="outline">中间 {stats.intermediate}</Badge>
        <Badge variant="outline">导出 {stats.exports}</Badge>
        <Badge variant="outline">报告 {stats.reports}</Badge>
        <Badge variant="outline">{sourceState}</Badge>
      </div>

      {impact.affectedRounds.length ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5 text-foreground">
          影响轮次：{impact.affectedRounds.join(", ")}
        </div>
      ) : null}

      {previewFiles.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          {previewFiles.map((file) => (
            <div key={`${file.relativePath}-${file.kind}`} className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
              <div className="min-w-0">
                <div className="truncate font-semibold text-foreground">{file.relativePath}</div>
                <div className="mt-0.5 text-muted-foreground">{getOrphanKindLabel(file.kind)} · {formatBytes(file.bytes)}</div>
              </div>
              <Badge variant="outline">将删除</Badge>
            </div>
          ))}
          {impact.hasMoreFiles ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
        </div>
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Trash2 />
            </EmptyMedia>
            <EmptyTitle>无项目文件删除</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}

      {impact.warnings.length ? (
        <div className="mt-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs leading-5">
          {impact.warnings.map((warning) => <div key={warning}>提醒：{warning}</div>)}
        </div>
      ) : null}
    </div>
  );
}
