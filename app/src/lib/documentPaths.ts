import type { DocumentStatus, PromptOption, PromptWorkflow, RoundCompareData, RoundProgressStatus } from "@/types/app";
import { promptSequencesEqual } from "@/lib/modelRoute";

export function isCompleteRoundCompareData(compareData: RoundCompareData | null): compareData is RoundCompareData {
  return Boolean(
    compareData?.outputPath
    && compareData.chunks.length > 0
    && compareData.chunkCount > 0
    && compareData.paragraphCount > 0
    && compareData.chunkCount === compareData.chunks.length,
  );
}

export function sameWorkspacePath(left: string | undefined | null, right: string | undefined | null): boolean {
  const normalize = (value: string | undefined | null) => String(value || "").replace(/\\/g, "/").toLowerCase();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function roundCheckpointMatchesDocument(
  checkpoint: RoundProgressStatus | null | undefined,
  status: DocumentStatus | null | undefined,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  return Boolean(
    checkpoint?.canResume
    && checkpoint.round
    && status?.nextRound
    && checkpoint.round === status.nextRound
    && sameWorkspacePath(checkpoint.sourcePath, status.sourcePath)
    && checkpoint.promptProfile === status.promptProfile
    && promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows),
  );
}
