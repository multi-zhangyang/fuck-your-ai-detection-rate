import { Clock3, RotateCcw, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function HistoryDocumentListItemHeader({
  docName,
  isActive,
  roundStateText,
  missingAssets,
  lastTimestampText,
  nextStepText,
  latestResultText,
  exportStateText,
  cleanupStateText,
  pathScopeText,
  cleanupOpen,
  busy,
  onToggleCleanup,
  onSelect,
}: {
  docName: string;
  isActive: boolean;
  roundStateText: string;
  missingAssets: boolean;
  lastTimestampText: string;
  nextStepText: string;
  latestResultText: string;
  exportStateText: string;
  cleanupStateText: string;
  pathScopeText: string;
  cleanupOpen: boolean;
  busy: boolean;
  onToggleCleanup: () => void;
  onSelect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="min-w-0 truncate text-base font-semibold">{docName}</h3>
          {isActive ? <Badge variant="neutral">当前选用</Badge> : null}
          <Badge variant={roundStateText === "流程已完成" ? "secondary" : "outline"}>{roundStateText}</Badge>
          {missingAssets ? <Badge variant="warning">资产需检查</Badge> : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock3 />
            {lastTimestampText}
          </span>
          <span>下一步 {nextStepText}</span>
          <span>最新 {latestResultText}</span>
          <span>导出 {exportStateText}</span>
          <span>可释放 {cleanupStateText}</span>
        </div>
        <p className="mt-2 truncate text-xs text-muted-foreground">{pathScopeText}</p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggleCleanup}
          disabled={busy}
        >
          <Trash2 data-icon="inline-start" />
          {cleanupOpen ? "收起" : "清理"}
        </Button>
        <Button variant={isActive ? "secondary" : "outline"} size="sm" onClick={onSelect} disabled={busy}>
          <RotateCcw data-icon="inline-start" />
          {isActive ? "载入" : "切换"}
        </Button>
      </div>
    </div>
  );
}
