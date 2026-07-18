import type { PendingAutoAction } from "@/lib/autoRun";
import { isCompleteRoundCompareData, roundCheckpointMatchesDocument, sameWorkspacePath } from "@/lib/documentPaths";
import { promptSequencesEqual } from "@/lib/modelRoute";
import { getPromptFlowSequence, normalizePromptSequence } from "@/lib/promptRegistry";
import { buildRunRecoveryPanelState } from "@/lib/runRecovery";
import type {
  DocumentStatus,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export function deriveHomeRunControlState(input: {
  value: DocumentStatus | null;
  progress: RoundProgress | null;
  roundProgressStatus: RoundProgressStatus | null;
  loadedResultRound: number | null;
  activeCompareData: RoundCompareData | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  running: boolean;
}) {
  const {
    value,
    progress,
    roundProgressStatus,
    loadedResultRound,
    activeCompareData,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    running,
  } = input;

  const hasDocument = Boolean(value);
  const completedRounds = (value?.completedRounds ?? [])
    .filter((round): round is number => Number.isFinite(round))
    .sort((left, right) => left - right);
  const latestCompletedRound = completedRounds[completedRounds.length - 1] ?? null;
  const latestRoundCompareReady = Boolean(
    latestCompletedRound
    && activeCompareData?.round === latestCompletedRound
    && isCompleteRoundCompareData(activeCompareData),
  );
  const visibleResultRound = loadedResultRound ?? latestCompletedRound;
  const hasVisibleResult = Boolean(visibleResultRound);
  const resultAheadOfStatus = Boolean(value?.nextRound && visibleResultRound && visibleResultRound >= value.nextRound);
  const activeSequence = normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows);
  const activeFlowSequence = getPromptFlowSequence(promptProfile, activeSequence, promptOptions, promptWorkflows);
  const plannedRoundCount = activeFlowSequence.length;
  const hasPendingRound = Boolean(value?.hasNextRound && value.nextRound && value.nextRound <= plannedRoundCount);
  const activeRunStatus = roundProgressStatus?.activeRun && !roundProgressStatus.activeRun.completed
    ? roundProgressStatus.activeRun
    : null;
  const checkpointOnCurrentRound = roundCheckpointMatchesDocument(roundProgressStatus, value, promptOptions, promptWorkflows);
  const resumableCheckpoint = roundProgressStatus?.canResume
    && sameWorkspacePath(roundProgressStatus.sourcePath, value?.sourcePath)
    && roundProgressStatus.round === value?.nextRound
    && roundProgressStatus.promptProfile === promptProfile
    && promptSequencesEqual(roundProgressStatus.promptSequence, activeSequence, promptOptions, promptProfile, promptWorkflows)
    ? roundProgressStatus
    : null;
  const runRecoveryState = buildRunRecoveryPanelState({
    running,
    progress,
    activeRunStatus,
    resumableCheckpoint,
    nextRound: value?.nextRound,
  });
  const currentRunCompletedChunks = progress?.completedChunks ?? progress?.currentChunk ?? 0;
  const waitingForStatusSync = Boolean(resultAheadOfStatus && !resumableCheckpoint && !checkpointOnCurrentRound);
  const completedButDiffMissing = Boolean(latestCompletedRound && !latestRoundCompareReady && !hasPendingRound);

  return {
    hasDocument,
    completedRounds,
    latestCompletedRound,
    latestRoundCompareReady,
    visibleResultRound,
    hasVisibleResult,
    resultAheadOfStatus,
    activeSequence,
    activeFlowSequence,
    plannedRoundCount,
    hasPendingRound,
    activeRunStatus,
    checkpointOnCurrentRound,
    resumableCheckpoint,
    runRecoveryState,
    currentRunCompletedChunks,
    waitingForStatusSync,
    completedButDiffMissing,
  };
}
