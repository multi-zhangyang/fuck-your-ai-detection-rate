import { Badge } from "@/components/ui/badge";
import {
  formatHistoryBytes as formatBytes,
  getOrphanKindLabel,
} from "@/lib/historyCardHelpers";
import type { HistoryArtifactQueryItem } from "@/types/app";

export function HistoryArtifactRow({ item }: { item: HistoryArtifactQueryItem }) {
  return (
    <div className="grid min-w-0 gap-2 border-b px-3 py-2 text-xs last:border-b-0 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <div className="truncate font-semibold text-foreground">{item.path}</div>
        <div className="mt-0.5 flex flex-wrap gap-2 text-muted-foreground">
          <span>{getOrphanKindLabel(item.kind)}</span>
          <span>{item.documentCount} 篇文档</span>
          <span>{item.roundCount} 个轮次</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Badge variant={item.exists ? "outline" : "warning"}>{item.exists ? "仍存在" : "已缺失"}</Badge>
        <Badge variant="outline">{formatBytes(item.bytes)}</Badge>
      </div>
    </div>
  );
}
