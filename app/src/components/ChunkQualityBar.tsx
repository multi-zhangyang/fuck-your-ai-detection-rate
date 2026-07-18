import { ChunkQualityActions } from "@/components/ChunkQualityActions";
import { ChunkQualityMeta } from "@/components/ChunkQualityMeta";
import { TextPane } from "@/components/RewriteDiffTextPane";
import { cn } from "@/lib/utils";
import {
  deriveChunkQualityDecisionState,
} from "@/lib/chunkQualityDecisionHelpers";
import {
  getChunkReviewReasons as getChunkReviewReasonsHelper,
} from "@/lib/resultCardHelpers";
import { T } from "@/lib/chunkQualityBarCopy";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export { TextPane };

function getChunkReviewReasons(chunk: RoundCompareData["chunks"][number], extraReasons: string[] = []): string[] {
  return getChunkReviewReasonsHelper(chunk, extraReasons);
}

export function ChunkQualityBar({ chunk, busy, decision, forceNeedsReview = false, reviewReasonHints = [], onDecisionChange, onRerun }: { chunk: RoundCompareData["chunks"][number]; busy: boolean; decision: ReviewDecision; forceNeedsReview?: boolean; reviewReasonHints?: string[]; onDecisionChange: (decision: ReviewDecision) => void; onRerun: (userFeedback?: string) => void }) {
  const {
    quality,
    advisoryFlags,
    isValidationFallback,
    isHighRiskFailedOutput,
    selectedBaseDecision,
    isConfirmed,
    reviewToolsVisible,
    reviewReasons,
    visibleFlags,
    needsReview,
  } = deriveChunkQualityDecisionState({
    chunk,
    decision,
    forceNeedsReview,
    reviewReasonHints,
  });
  void getChunkReviewReasons;
  const decisionLabel = selectedBaseDecision === "custom" ? T.customChoice : selectedBaseDecision === "rewrite" ? T.useRewrite : T.useSource;
  return (
    <div className={cn(
      "flex min-w-0 flex-col gap-3 rounded-md border px-3 py-3 text-xs text-muted-foreground",
      isHighRiskFailedOutput ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-background",
    )}>
      <ChunkQualityMeta
        chunk={chunk}
        quality={quality}
        isHighRiskFailedOutput={isHighRiskFailedOutput}
        isValidationFallback={isValidationFallback}
        needsReview={needsReview}
        visibleFlags={visibleFlags}
        advisoryFlags={advisoryFlags}
        isConfirmed={isConfirmed}
        decisionLabel={decisionLabel}
        reviewReasons={reviewReasons}
      />
      <ChunkQualityActions
        chunk={chunk}
        busy={busy}
        selectedBaseDecision={selectedBaseDecision}
        isConfirmed={isConfirmed}
        isHighRiskFailedOutput={isHighRiskFailedOutput}
        reviewToolsVisible={reviewToolsVisible}
        onAdoptRewrite={() => onDecisionChange("rewrite_confirmed")}
        onUseSource={() => onDecisionChange("source_confirmed")}
        onRerun={onRerun}
      />
    </div>
  );
}
