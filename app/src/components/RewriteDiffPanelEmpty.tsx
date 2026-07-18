import { FileSearch, ScanSearch, ShieldCheck, SplitSquareHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { REWRITE_DIFF_PANEL_COPY as T } from "@/lib/rewriteDiffPanelViewModel";

export function RewriteDiffPanelNoChunksEmpty() {
  return (
    <Empty className="min-h-0 flex-1 border bg-background/70" data-vercel-state="review">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12 rounded-xl">
          <SplitSquareHorizontal />
        </EmptyMedia>
        <div className="vercel-kicker mt-1">Review workspace</div>
        <EmptyTitle>等待生成{T.diff}</EmptyTitle>
        <EmptyDescription className="max-w-md">
          载入文档并完成一轮改写后，这里会并排展示原文与结果，供你逐段确认。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-lg sm:flex-row sm:justify-center">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/75 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          <FileSearch className="size-3.5" /> 原文对照
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/75 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          <ScanSearch className="size-3.5" /> 风险定位
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-card/75 px-2.5 py-1.5 text-[11px] text-muted-foreground shadow-sm">
          <ShieldCheck className="size-3.5" /> 结构保护
        </span>
      </EmptyContent>
    </Empty>
  );
}

export function RewriteDiffPanelFilterEmpty({
  title,
  onShowAll,
}: {
  title: string;
  onShowAll: () => void;
}) {
  return (
    <Empty className="vercel-empty-state border border-border/70">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SplitSquareHorizontal />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      <Button size="sm" variant="outline" onClick={onShowAll}>{T.showAll}</Button>
    </Empty>
  );
}
