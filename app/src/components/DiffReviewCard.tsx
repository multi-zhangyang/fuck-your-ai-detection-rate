import { BatchRerunStatusAlert } from "@/components/BatchRerunStatusAlert";
import { RewriteDiffPanel, type DiffFocusRequest, type RerunFailure } from "@/components/RewriteDiffPanel";
import { Card, CardContent } from "@/components/ui/card";
import type { ReviewDecision, RoundCompareData, RoundResult } from "@/types/app";

export function DiffReviewCard({
  result,
  compareData,
  busy,
  rerunFailures = [],
  diffFocusRequest = null,
  reviewDecisions,
  onReviewDecisionChange,
  onRerunChunk,
  onRerunRiskyChunks,
  batchRerunRunning = false,
  batchRerunStatusText = "",
  onCancelBatchRerun,
  streamChunkId = null,
  streamChars = null,
}: {
  result: RoundResult | null;
  compareData: RoundCompareData | null;
  busy: boolean;
  rerunFailures?: RerunFailure[];
  diffFocusRequest?: DiffFocusRequest | null;
  reviewDecisions: Record<string, ReviewDecision>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  onRerunRiskyChunks: () => void;
  batchRerunRunning?: boolean;
  batchRerunStatusText?: string;
  onCancelBatchRerun?: () => void;
  streamChunkId?: string | null;
  streamChars?: number | null;
}) {
  void result;
  void onRerunRiskyChunks;
  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden border-border/80 bg-card/90 shadow-soft">
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 pb-4 pt-3">
        {batchRerunRunning ? (
          <BatchRerunStatusAlert statusText={batchRerunStatusText} onCancel={onCancelBatchRerun} />
        ) : null}
        <RewriteDiffPanel data={compareData} busy={busy} rerunFailures={rerunFailures} diffFocusRequest={diffFocusRequest} reviewDecisions={reviewDecisions} onReviewDecisionChange={onReviewDecisionChange} onRerunChunk={onRerunChunk} streamChunkId={streamChunkId} streamChars={streamChars} />
      </CardContent>
    </Card>
  );
}
