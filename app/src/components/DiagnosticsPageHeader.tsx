import { Activity, CheckCircle2, FileText, Loader2, RefreshCw } from "lucide-react";

import { DiagnosticSummaryTile } from "@/components/DiagnosticsPanels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/formatters";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type { EnvironmentDiagnostics } from "@/types/app";

export function DiagnosticsPageHeader({
  value,
  busy,
  statusText,
  statusVariant,
  passedCount,
  checksCount,
  errorCount,
  warningCount,
  configReady,
  activeTaskCount,
  recentTaskCount,
  taskStateStore,
  copied,
  onCopy,
  onRefresh,
}: {
  value: EnvironmentDiagnostics | null;
  busy: boolean;
  statusText: string;
  statusVariant: "danger" | "warning" | "success" | "outline";
  passedCount: number;
  checksCount: number;
  errorCount: number;
  warningCount: number;
  configReady: boolean;
  activeTaskCount: number;
  recentTaskCount: number;
  taskStateStore: EnvironmentDiagnostics["taskStateStore"] | null | undefined;
  copied: boolean;
  onCopy: () => void;
  onRefresh: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 px-4 py-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant}>{statusText}</Badge>
              {value ? <Badge variant="outline">{formatDateTime(value.createdAt)}</Badge> : null}
            </div>
            <div className="flex items-center gap-3">
              <span className="vercel-icon-frame size-9"><Activity className="size-4" /></span>
              <div>
                <div className="vercel-kicker mb-0.5">System health</div>
                <CardTitle className="text-lg">启动诊断</CardTitle>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void onCopy()} disabled={!value}>
              {copied ? <CheckCircle2 data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
              {copied ? "已复制" : "复制诊断"}
            </Button>
            <Button size="sm" onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              重新自检
            </Button>
          </div>
        </div>
      </CardHeader>
      {value ? (
        <CardContent className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
          <DiagnosticSummaryTile label="自检项" value={`${passedCount}/${checksCount}`} detail={errorCount || warningCount ? "有项目需要确认" : "全部可用"} />
          <DiagnosticSummaryTile label="模型连接" value={configReady ? "可启动" : "待补全"} detail={value.config.model || "未选择模型"} />
          <DiagnosticSummaryTile label="后台任务" value={`${activeTaskCount} 运行中`} detail={`${recentTaskCount} 条近期记录`} />
          <DiagnosticSummaryTile label="快照" value={taskStateStore ? `${taskStateStore.fileCount} 个` : "未返回"} detail={taskStateStore ? `${taskStateStore.staleCount} 个可清理` : "等待后端状态"} />
        </CardContent>
      ) : null}
    </Card>
  );
}
