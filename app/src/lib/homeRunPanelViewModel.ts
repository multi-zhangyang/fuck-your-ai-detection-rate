import { deriveHomeRunControlState } from "@/lib/homeRunControl";
import { deriveHomeRunPanelRouteState } from "@/lib/homeRunPanelRouteViewModel";
import { deriveHomeRunPanelPrimaryState } from "@/lib/homeRunPanelPrimaryViewModel";
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

export function deriveHomeRunPanelViewState(input: {
  value: DocumentStatus | null;
  busy: boolean;
  modelConfig: ModelConfig;
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
    busy,
    modelConfig,
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

  const controlState = deriveHomeRunControlState({
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
  });
  const routeState = deriveHomeRunPanelRouteState({
    modelConfig,
    promptProfile,
    promptWorkflows,
    promptOptions,
    activeFlowSequence: controlState.activeFlowSequence,
    progress,
    currentRunCompletedChunks: controlState.currentRunCompletedChunks,
  });
  const primaryState = deriveHomeRunPanelPrimaryState({
    value,
    busy,
    running,
    hasDocument: controlState.hasDocument,
    hasPendingRound: controlState.hasPendingRound,
    waitingForStatusSync: controlState.waitingForStatusSync,
    completedButDiffMissing: controlState.completedButDiffMissing,
    latestRoundCompareReady: controlState.latestRoundCompareReady,
    activeRunStatus: controlState.activeRunStatus,
    unavailableRouteCount: routeState.unavailableRouteCount,
    activeSequenceLength: controlState.activeSequence.length,
    appendRoundLimit: routeState.appendRoundLimit,
    resumableCheckpoint: controlState.resumableCheckpoint,
    latestCompletedRound: controlState.latestCompletedRound,
    promptProfile,
    promptWorkflows,
  });

  return {
    ...controlState,
    ...routeState,
    ...primaryState,
  };
}
