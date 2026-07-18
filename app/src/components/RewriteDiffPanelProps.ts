import type { DiffFocusRequest, DiffFilterMode, RerunFailure } from "@/lib/diffFilterModel";
import type { ReviewDecision, RoundCompareData } from "@/types/app";

export type RewriteDiffPanelProps = {
  data: RoundCompareData | null;
  busy: boolean;
  rerunFailures: RerunFailure[];
  diffFocusRequest: DiffFocusRequest | null;
  reviewDecisions: Record<string, ReviewDecision>;
  onReviewDecisionChange: (chunkId: string, decision: ReviewDecision) => void;
  onRerunChunk: (chunkId: string, userFeedback?: string) => void;
  streamChunkId?: string | null;
  streamChars?: number | null;
};

export type { DiffFilterMode, DiffFocusRequest, RerunFailure };
