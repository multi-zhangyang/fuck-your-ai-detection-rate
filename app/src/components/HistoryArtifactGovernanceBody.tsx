import { AlertTriangle, Database } from "lucide-react";

import { HistoryArtifactRow } from "@/components/HistoryArtifactRow";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatHistoryBytes as formatBytes } from "@/lib/historyCardHelpers";
import type {
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryArtifactStats,
} from "@/types/app";

export function HistoryArtifactGovernanceBody({
  query,
  mode,
  loading,
  stats,
  previewItems,
  currentDocId,
  onModeChange,
}: {
  query: HistoryArtifactQueryResponse | null;
  mode: HistoryArtifactGovernanceMode;
  loading: boolean;
  stats: HistoryArtifactStats;
  previewItems: NonNullable<HistoryArtifactQueryResponse["items"]>;
  currentDocId: string | null;
  onModeChange: (mode: HistoryArtifactGovernanceMode) => void;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">索引 {stats.total}</Badge>
        <Badge variant="outline">存在 {stats.existing}</Badge>
        <Badge variant={stats.missing ? "warning" : "outline"}>缺失 {stats.missing}</Badge>
        <Badge variant="outline">占用 {formatBytes(stats.bytes)}</Badge>
        <Badge variant="outline">外部 {stats.external}</Badge>
      </div>

      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          if (value === "missing" || value === "current" || value === "large") {
            onModeChange(value);
          }
        }}
        className="mt-3 grid gap-2 md:grid-cols-3"
      >
        <ToggleGroupItem value="missing" variant="outline" className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">缺失资产</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="current" variant="outline" disabled={!currentDocId} className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">当前文档</span>
        </ToggleGroupItem>
        <ToggleGroupItem value="large" variant="outline" className="h-10 justify-center px-3">
          <span className="text-sm font-semibold">大文件</span>
        </ToggleGroupItem>
      </ToggleGroup>

      {query?.ok === false ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTriangle />
          <AlertTitle>索引读取失败</AlertTitle>
          <AlertDescription>{query.error || "SQLite 历史索引暂时不可用，请先刷新或运行历史库修复。"}</AlertDescription>
        </Alert>
      ) : previewItems.length ? (
        <div className="mt-3 overflow-hidden rounded-lg border bg-background">
          {previewItems.map((item) => <HistoryArtifactRow key={`${item.path}-${item.kind}`} item={item} />)}
          {query?.hasMore ? <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">还有更多</div> : null}
        </div>
      ) : (
        <Empty className="mt-3 min-h-[6rem] border bg-background">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Database />
            </EmptyMedia>
            <EmptyTitle>{loading ? "读取中" : "无资产"}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </>
  );
}
