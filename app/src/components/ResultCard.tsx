import { FileOutput } from "lucide-react";

import { BatchRerunStatusAlert } from "@/components/BatchRerunStatusAlert";
import { ResultCardExportActions } from "@/components/ResultCardExportActions";
import type { ResultCardProps } from "@/components/ResultCardProps";
import {
  ExportFailurePanel,
  ExportHealthPanel,
  LiveHint,
} from "@/components/ResultCardSmWrappers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { RESULT_CARD_COPY as T } from "@/lib/resultCardCopy";
import { DIFF_STREAM_LABEL } from "@/lib/resultCardHelpers";
import { deriveResultCardOutputState } from "@/lib/resultCardOutputViewModel";

export { DIFF_STREAM_LABEL };
export type { DiffFilterMode, DiffFocusRequest } from "@/components/RewriteDiffPanel";

// re-export SM wrappers for merge-read continuity
export {
  ExportFailurePanel,
  ExportHealthPanel,
  LiveHint,
  getDiffFilterEmptyState,
  hasChunkNumberRisk,
  hasChunkCitationRisk,
  getChunkReviewReasons,
} from "@/components/ResultCardSmWrappers";

export function ResultCard({
  result,
  compareData,
  exportResult,
  exportFailure = null,
  busy,
  reviewDecisions,
  onRerunRiskyChunks,
  batchRerunRunning = false,
  batchRerunStatusText = "",
  onCancelBatchRerun,
  onExportTxt,
  onExportDocx,
  roundRunning = false,
  checkpointPending = false,
}: ResultCardProps) {
  const {
    hasOutput,
    outputReady,
    hasRerunnableReviewChunks,
  } = deriveResultCardOutputState({
    result,
    compareData,
    checkpointPending,
    reviewDecisions,
  });
  return (
    <Card className={cn("flex h-auto min-h-[8rem] w-full shrink-0 flex-col overflow-hidden border-border/80 bg-card/95 shadow-soft", hasOutput && "min-h-0")}>
      <CardHeader className="shrink-0 border-b border-border/70 bg-muted/20 px-5 py-3">
        <div className="flex gap-3 md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-8"><FileOutput className="size-4" /></span>
            <div className="min-w-0">
              <div className="vercel-kicker mb-0.5">Output</div>
              <CardTitle className="truncate text-base">输出与导出</CardTitle>
            </div>
          </div>
          <Badge variant={outputReady ? "success" : "outline"} className="shrink-0 self-center">
            {outputReady ? "可导出" : hasOutput ? "待检查" : "等待结果"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-visible px-5 pb-4 pt-3">
        {batchRerunRunning ? (
          <BatchRerunStatusAlert statusText={batchRerunStatusText} onCancel={onCancelBatchRerun} />
        ) : null}
        {hasOutput ? (
          <>
            <ResultCardExportActions
              outputReady={outputReady}
              busy={busy}
              hasRerunnableReviewChunks={hasRerunnableReviewChunks}
              rerunRiskyLabel={T.rerunRisky}
              onExportDocx={onExportDocx}
              onExportTxt={onExportTxt}
              onRerunRiskyChunks={onRerunRiskyChunks}
            />
            <ExportHealthPanel exportResult={exportResult} />
            <ExportFailurePanel value={exportFailure} />

            {!result ? <LiveHint running={roundRunning} /> : null}
          </>
        ) : (
          <Empty className="vercel-empty-state min-h-[10rem] flex-1 border border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileOutput />
              </EmptyMedia>
              <EmptyTitle className="text-base">{T.noResult}</EmptyTitle>
              <EmptyDescription>完成改写后，导出选项与文档健康检查会在这里出现。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
