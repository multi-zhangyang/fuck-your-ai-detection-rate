import type { DiffFocusRequest, RerunFailure } from "@/components/RewriteDiffPanel";
import type {
  ExportFailureDetails,
  ExportResult,
  OutputPreview,
  ReviewDecision,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export type ResultCardProps = {
  result: RoundResult | null;
  preview: OutputPreview | null;
  compareData: RoundCompareData | null;
  exportResult: ExportResult | null;
  exportFailure?: ExportFailureDetails | null;
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
  onExportTxt: () => void;
  onExportDocx: () => void;
  roundRunning?: boolean;
  checkpointPending?: boolean;
  streamChunkId?: string | null;
  streamChars?: number | null;
};
