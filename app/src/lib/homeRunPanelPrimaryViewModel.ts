import { isPromptSequenceCustomizable } from "@/lib/promptRegistry";
import {
  buildPrimaryRunButtonText,
  deriveHomePrimaryActionState,
} from "@/lib/homeRunPanelState";
import type {
  DocumentStatus,
  ModelConfig,
  PromptWorkflow,
} from "@/types/app";

export function deriveHomeRunPanelPrimaryState(input: {
  value: DocumentStatus | null;
  busy: boolean;
  running: boolean;
  hasDocument: boolean;
  hasPendingRound: boolean;
  waitingForStatusSync: boolean;
  completedButDiffMissing: boolean;
  latestRoundCompareReady: boolean;
  activeRunStatus: unknown;
  unavailableRouteCount: number;
  activeSequenceLength: number;
  appendRoundLimit: number;
  resumableCheckpoint: { round?: number | null } | null | undefined;
  latestCompletedRound: number | null | undefined;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
}) {
  const checkpointRunLabel = input.resumableCheckpoint?.round
    ? `继续第 ${input.resumableCheckpoint.round} 轮`
    : "";
  const primary = deriveHomePrimaryActionState({
    hasDocument: input.hasDocument,
    hasPendingRound: input.hasPendingRound,
    waitingForStatusSync: input.waitingForStatusSync,
    completedButDiffMissing: input.completedButDiffMissing,
    busy: input.busy,
    running: input.running,
    activeRunStatus: Boolean(input.activeRunStatus),
    unavailableRouteCount: input.unavailableRouteCount,
    latestRoundCompareReady: input.latestRoundCompareReady,
    promptSequenceCustomizable: isPromptSequenceCustomizable(input.promptProfile, input.promptWorkflows),
    activeSequenceLength: input.activeSequenceLength,
    appendRoundLimit: input.appendRoundLimit,
    resumableCheckpoint: Boolean(input.resumableCheckpoint),
    latestCompletedRound: input.latestCompletedRound ?? null,
    nextRound: input.value?.nextRound,
    checkpointRunLabel,
  });
  const runButtonText = buildPrimaryRunButtonText({
    running: input.running,
    nextRound: input.value?.nextRound,
    activeRunStatus: Boolean(input.activeRunStatus),
    unavailableRouteCount: input.unavailableRouteCount,
    waitingForStatusSync: input.waitingForStatusSync,
    completedButDiffMissing: input.completedButDiffMissing,
    hasPendingRound: input.hasPendingRound,
    resumableCheckpoint: Boolean(input.resumableCheckpoint),
    checkpointRunLabel,
    nextRoundButtonText: primary.nextRoundButtonText,
    canAppendRound: primary.canAppendRound,
    appendRoundText: primary.appendRoundText,
    hasDocument: input.hasDocument,
  });
  return {
    checkpointRunLabel,
    ...primary,
    runButtonText,
  };
}
