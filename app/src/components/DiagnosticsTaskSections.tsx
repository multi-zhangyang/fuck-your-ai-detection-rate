import { Fragment } from "react";
import { CheckCircle2, Trash2 } from "lucide-react";
import type { ComponentType } from "react";

import { DiagnosticSummaryTile } from "@/components/DiagnosticsPanels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Separator } from "@/components/ui/separator";
import type { DiagnosticTaskItem } from "@/lib/diagnosticsHelpers";
import { formatBytes } from "@/lib/formatters";
import type { EnvironmentDiagnostics } from "@/types/app";

export function DiagnosticsTaskSections({
  busy,
  activeTaskCount,
  taskItems,
  taskStateStore,
  onCleanupTaskSnapshots,
  DiagnosticTaskAlert,
}: {
  busy: boolean;
  activeTaskCount: number;
  taskItems: DiagnosticTaskItem[];
  taskStateStore: EnvironmentDiagnostics["taskStateStore"];
  onCleanupTaskSnapshots: () => void;
  DiagnosticTaskAlert: ComponentType<{ item: DiagnosticTaskItem }>;
}) {
  return (
    <>
      {taskStateStore ? (
        <Card>
          <CardHeader className="px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle className="text-base">任务快照治理</CardTitle>
              <Button variant="outline" size="sm" onClick={onCleanupTaskSnapshots} disabled={busy || taskStateStore.staleCount <= 0}>
                <Trash2 data-icon="inline-start" />
                清理过期快照
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
            <div className="grid gap-2 md:grid-cols-4">
              <DiagnosticSummaryTile label="文件" value={`${taskStateStore.fileCount} · ${formatBytes(taskStateStore.sizeBytes)}`} detail="本地快照" />
              <DiagnosticSummaryTile label="快照分布" value={`${taskStateStore.runRoundCount} / ${taskStateStore.batchRerunCount}`} detail="改写 / 局部优化" />
              <DiagnosticSummaryTile label="保护中" value={`${taskStateStore.activeSnapshotCount}`} detail="运行态保留" />
              <DiagnosticSummaryTile label="可清理" value={`${taskStateStore.staleCount}`} detail="过期快照" />
            </div>
            <div className="truncate text-[11px] font-medium text-muted-foreground">{taskStateStore.path}</div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">后台任务</CardTitle>
            <Badge variant={activeTaskCount ? "warning" : "outline"}>{activeTaskCount ? "有任务运行" : "空闲"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {taskItems.length ? (
            <div className="overflow-hidden rounded-lg border bg-card">
              {taskItems.map((item, index) => (
                <Fragment key={`${item.taskType}-${item.runId}`}>
                  {index ? <Separator /> : null}
                  <DiagnosticTaskAlert item={item} />
                </Fragment>
              ))}
            </div>
          ) : (
            <Empty className="min-h-[8rem] border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                <EmptyTitle>暂无后台任务</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </>
  );
}
