import type { MutableRefObject } from "react";
import { ChunkQualityBar, TextPane } from "@/components/ChunkQualityBar";
import { RewriteDiffChunkAlerts } from "@/components/RewriteDiffChunkAlerts";
import { RewriteDiffDecisionEvidence } from "@/components/RewriteDiffDecisionEvidence";
import { cn } from "@/lib/utils";
import {
  REWRITE_DIFF_PANEL_COPY as T,
  deriveRewriteDiffChunkViewState,
} from "@/lib/rewriteDiffPanelViewModel";
import type { RerunFailure } from "@/lib/diffFilterModel";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export function RewriteDiffChunkCard({
  chunk,
  busy,
  reviewDecisions,
  reviewChunkIdSet,
  changedChunkIdSet,
  numberRiskChunkIdSet,
  citationRiskChunkIdSet,
  highRiskChunkIdSet,
  rerunFailureByChunk,
  streamChunkId,
  focusedChunkId,
  chunkRefs,
  onReviewDecisionChange,
  onRerunChunk,
}: {
  chunk: RoundCompareData["chunks"][number];
  busy: boolean;
  reviewDecisions: Record<string, ReviewDecision>;
  reviewChunkIdSet: Set<string>;
  changedChunkIdSet: Set<string>;
  numberRiskChunkIdSet: Set<string>;
  citationRiskChunkIdSet: Set<string>;
  highRiskChunkIdSet: Set<string>;
  rerunFailureByChunk: Map<string, RerunFailure>;
  streamChunkId?: string | null;
  focusedChunkId?: string | null;
  chunkRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
}) {
  const {
    rerunFailure,
    needsReview,
    hasChangedText,
    hasNumberRisk,
    hasCitationRisk,
    hasHighRiskFailedOutput,
    decision,
    strategyReviewPending,
    decisionEvidence,
    displayOutput,
    isFocused,
    isStreamTarget,
  } = deriveRewriteDiffChunkViewState({
    chunk,
    reviewDecisions,
    reviewChunkIdSet,
    changedChunkIdSet,
    numberRiskChunkIdSet,
    citationRiskChunkIdSet,
    highRiskChunkIdSet,
    rerunFailureByChunk,
    streamChunkId,
    focusedChunkId,
  });

  return (
    <div
      key={chunk.chunkId}
      ref={(node) => {
        chunkRefs.current[chunk.chunkId] = node;
      }}
      className={cn(
        "grid min-w-0 gap-4 overflow-hidden rounded-lg border p-4 transition xl:grid-cols-2",
        rerunFailure
          ? "border-destructive/30 bg-destructive/5"
          : hasHighRiskFailedOutput
            ? "border-destructive/40 bg-destructive/5"
          : needsReview
            ? "border-primary/20 bg-muted/60"
            : "border-border/70 bg-muted/30",
        isFocused && "ring-2 ring-primary/25 ring-offset-2",
        isStreamTarget && "ring-2 ring-success/40 ring-offset-2",
      )}
    >
      <RewriteDiffChunkAlerts
        chunk={chunk}
        rerunFailure={rerunFailure}
        hasHighRiskFailedOutput={hasHighRiskFailedOutput}
        strategyReviewRequired={strategyReviewPending}
        hasChangedText={hasChangedText}
        hasNumberRisk={hasNumberRisk}
        hasCitationRisk={hasCitationRisk}
      />
      <RewriteDiffDecisionEvidence value={decisionEvidence} />
      <TextPane title={T.source} text={chunk.inputText} />
      <TextPane title={displayOutput.title} text={displayOutput.text} tone={displayOutput.tone} />
      <div className="xl:col-span-2 min-w-0">
        <ChunkQualityBar
          chunk={chunk}
          busy={busy}
          decision={decision}
          forceNeedsReview={needsReview}
          onDecisionChange={(nextDecision) => onReviewDecisionChange(chunk.chunkId, nextDecision)}
          onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)}
        />
      </div>
    </div>
  );
}
