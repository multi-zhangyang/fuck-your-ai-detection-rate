import { SplitSquareHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DiffFilterMode } from "@/lib/diffFilterModel";

export function RewriteDiffPanelToolbar({
  title,
  chunkCountLabel,
  numberRiskLabel,
  numberRiskCount,
  citationRiskLabel,
  citationRiskCount,
  filterMode,
  setFilterMode,
  reviewCount,
  highRiskCount,
  failedCount,
}: {
  title: string;
  chunkCountLabel: string;
  numberRiskLabel: string;
  numberRiskCount: number;
  citationRiskLabel: string;
  citationRiskCount: number;
  filterMode: DiffFilterMode;
  setFilterMode: (mode: DiffFilterMode) => void;
  reviewCount: number;
  highRiskCount: number;
  failedCount: number;
}) {
  return (
    <div className="sticky top-0 z-20 shrink-0 border-b border-border/70 bg-card/90 px-3 py-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-2 overflow-x-auto overflow-y-hidden pb-1">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
          <span className="vercel-icon-frame size-7"><SplitSquareHorizontal className="size-3.5 text-primary" /></span>
          {title}
        </span>
        <Badge variant="outline">{chunkCountLabel}</Badge>
        {numberRiskCount ? <Badge variant="warning">{numberRiskLabel} {numberRiskCount}</Badge> : null}
        {citationRiskCount ? <Badge variant="warning">{citationRiskLabel} {citationRiskCount}</Badge> : null}
        <ToggleGroup
          type="single"
          value={filterMode}
          onValueChange={(value) => value && setFilterMode(value as DiffFilterMode)}
          className="justify-start"
        >
          <ToggleGroupItem value="all" aria-label="显示全部">全部</ToggleGroupItem>
          <ToggleGroupItem value="review" aria-label="只看需处理" disabled={!reviewCount}>需处理 {reviewCount}</ToggleGroupItem>
          <ToggleGroupItem value="highRisk" aria-label="只看高风险" disabled={!highRiskCount}>高风险 {highRiskCount}</ToggleGroupItem>
          {failedCount ? <ToggleGroupItem value="failed" aria-label="只看失败">失败 {failedCount}</ToggleGroupItem> : null}
        </ToggleGroup>
      </div>
    </div>
  );
}
