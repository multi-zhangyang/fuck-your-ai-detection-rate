import { mergeProgressIntoCompareData, mergeVisibleProgress } from "@/lib/progressHelpers";
import { formatRuntimeStep } from "@/lib/runtimeProgress";
import { buildDefaultReviewDecisions, normalizeSavedReviewDecisionsForCompare } from "@/lib/reviewDecisions";
import type {
  ReviewDecision,
  RoundCompareData,
  RoundProgress,
} from "@/types/app";

export type RoundProgressViewUpdate = {
  visibleProgress: RoundProgress;
  compareData?: RoundCompareData;
  chunkIdForReview?: string;
  runtimeStep: string;
};

export type MaterializedRoundProgressUpdate = {
  visibleProgress: RoundProgress;
  compareData?: RoundCompareData;
  nextReviewDecisions?: (current: Record<string, ReviewDecision>) => Record<string, ReviewDecision>;
  runtimeStep: string;
};

export function buildRoundProgressViewUpdate(input: {
  currentProgress: RoundProgress | null;
  nextProgress: RoundProgress;
  currentCompare: RoundCompareData | null;
  liveCompareSeed: RoundCompareData;
  runtimeFallback: string;
}): RoundProgressViewUpdate {
  const visibleProgress = mergeVisibleProgress(input.currentProgress, input.nextProgress);
  const update: RoundProgressViewUpdate = {
    visibleProgress,
    runtimeStep: formatRuntimeStep(visibleProgress, input.runtimeFallback),
  };
  if (
    input.nextProgress.phase === "chunk-complete"
    && input.nextProgress.compareInputText
    && input.nextProgress.compareOutputText
  ) {
    update.compareData = mergeProgressIntoCompareData(
      input.currentCompare,
      input.nextProgress,
      input.liveCompareSeed,
    );
    if (input.nextProgress.chunkId) {
      update.chunkIdForReview = input.nextProgress.chunkId;
    }
  }
  return update;
}

export function buildMergedCompletionReviewDecisions(
  compareData: RoundCompareData,
  savedDecisions: Parameters<typeof normalizeSavedReviewDecisionsForCompare>[1],
) {
  return {
    ...buildDefaultReviewDecisions(compareData),
    ...normalizeSavedReviewDecisionsForCompare(compareData, savedDecisions),
  };
}

export function buildProgressReviewDecisionPatch(
  current: Record<string, ReviewDecision>,
  chunkId: string | undefined,
  decision: ReviewDecision = "rewrite",
): Record<string, ReviewDecision> {
  if (!chunkId || current[chunkId]) {
    return current;
  }
  return { ...current, [chunkId]: decision };
}

export function materializeRoundProgressListenerUpdate(input: {
  currentProgress: RoundProgress | null;
  nextProgress: RoundProgress;
  currentCompare: RoundCompareData | null;
  liveCompareSeed: RoundCompareData;
  runtimeFallback: string;
}): MaterializedRoundProgressUpdate {
  const update = buildRoundProgressViewUpdate(input);
  return {
    visibleProgress: update.visibleProgress,
    compareData: update.compareData,
    nextReviewDecisions: update.chunkIdForReview
      ? (current) => buildProgressReviewDecisionPatch(current, update.chunkIdForReview)
      : undefined,
    runtimeStep: update.runtimeStep,
  };
}
