import { Download } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { HistoryRound } from "@/types/app";

export function HistoryDocumentRoundHeader({
  roundItem,
  busy,
  hasMissingAssets,
  outputPathText,
  sequenceLabel,
  profileLabel,
  timestampText,
  onDownload,
}: {
  roundItem: HistoryRound;
  busy: boolean;
  hasMissingAssets: boolean;
  outputPathText: string;
  sequenceLabel: string | null;
  profileLabel: string;
  timestampText: string;
  onDownload: (item: HistoryRound, format: "txt" | "docx") => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">第 {roundItem.round} 轮</Badge>
          <Badge variant="outline">{profileLabel}</Badge>
          {sequenceLabel ? <Badge variant="outline">{sequenceLabel}</Badge> : null}
          {hasMissingAssets ? <Badge variant="warning">资产需检查</Badge> : null}
          <Badge variant="outline">{timestampText}</Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">{outputPathText}</p>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
        <Button variant="outline" size="sm" onClick={() => onDownload(roundItem, "txt")} disabled={busy || !roundItem.outputPath}>
          <Download data-icon="inline-start" />
          TXT
        </Button>
        <Button size="sm" onClick={() => onDownload(roundItem, "docx")} disabled={busy || !roundItem.outputPath}>
          <Download data-icon="inline-start" />
          Word
        </Button>
      </div>
    </div>
  );
}
