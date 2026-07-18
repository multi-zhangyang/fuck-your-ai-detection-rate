import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ResultCardExportActions({
  outputReady,
  busy,
  hasRerunnableReviewChunks,
  rerunRiskyLabel,
  onExportDocx,
  onExportTxt,
  onRerunRiskyChunks,
}: {
  outputReady: boolean;
  busy: boolean;
  hasRerunnableReviewChunks: boolean;
  rerunRiskyLabel: string;
  onExportDocx: () => void;
  onExportTxt: () => void;
  onRerunRiskyChunks: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button className="h-11 min-w-40 px-4" onClick={onExportDocx} disabled={!outputReady || busy}>
        <Download data-icon="inline-start" />
        导出 Word
      </Button>
      <Button className="h-11 min-w-28 px-4" variant="outline" onClick={onExportTxt} disabled={!outputReady || busy}>
        <Download data-icon="inline-start" />
        TXT
      </Button>
      <Button className="h-11 min-w-40 px-4" variant="outline" onClick={onRerunRiskyChunks} disabled={!outputReady || !hasRerunnableReviewChunks || busy}>
        {rerunRiskyLabel}
      </Button>
    </div>
  );
}
