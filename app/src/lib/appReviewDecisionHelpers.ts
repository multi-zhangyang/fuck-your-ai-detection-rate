import type { ReviewDecision } from "@/types/app";

export function planReviewDecisionUpdate(input: {
  current: Record<string, ReviewDecision>;
  chunkId: string;
  decision: ReviewDecision;
  outputPath?: string | null;
}): {
  next: Record<string, ReviewDecision>;
  outputPath?: string | null;
  shouldScheduleSave: boolean;
} {
  const next = { ...input.current, [input.chunkId]: input.decision };
  const outputPath = input.outputPath;
  return {
    next,
    outputPath,
    shouldScheduleSave: Boolean(outputPath),
  };
}
