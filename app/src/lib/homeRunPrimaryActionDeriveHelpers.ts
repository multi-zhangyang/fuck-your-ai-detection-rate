export function deriveHomePrimaryActionState(input: {
  hasDocument: boolean;
  hasPendingRound: boolean;
  waitingForStatusSync: boolean;
  completedButDiffMissing: boolean;
  busy: boolean;
  running: boolean;
  activeRunStatus: boolean;
  unavailableRouteCount: number;
  latestRoundCompareReady: boolean;
  promptSequenceCustomizable: boolean;
  activeSequenceLength: number;
  appendRoundLimit: number;
  resumableCheckpoint: boolean;
  latestCompletedRound: number | null;
  nextRound?: number | null;
  checkpointRunLabel: string;
}): {
  canRefreshStatus: boolean;
  canResetRound: boolean;
  canAppendRound: boolean;
  canRunNextRound: boolean;
  nextRoundButtonText: string;
  appendRoundText: string;
  appendRoundNumber: number;
  primaryRunButtonDisabled: boolean;
  primaryRunButtonVariant: "default" | "secondary";
  primaryActionMode: "refresh" | "append" | "run";
} {
  const canRefreshStatus = input.hasDocument && !input.busy && !input.running && !input.activeRunStatus;
  const canResetRound = Boolean(input.resumableCheckpoint || input.latestCompletedRound);
  const canAppendRound = Boolean(
    input.hasDocument
    && !input.hasPendingRound
    && !input.waitingForStatusSync
    && !input.busy
    && !input.running
    && !input.activeRunStatus
    && input.unavailableRouteCount === 0
    && input.latestRoundCompareReady
    && input.promptSequenceCustomizable
    && input.activeSequenceLength < input.appendRoundLimit,
  );
  const canRunNextRound = input.hasPendingRound
    && !input.waitingForStatusSync
    && !input.busy
    && !input.running
    && !input.activeRunStatus
    && input.unavailableRouteCount === 0;
  const nextRoundButtonText = input.hasPendingRound && input.nextRound
    ? input.nextRound > 1
      ? `继续第 ${input.nextRound} 轮`
      : `开始第 ${input.nextRound} 轮`
    : "";
  const appendRoundNumber = input.activeSequenceLength + 1;
  const appendRoundText = `追加第 ${appendRoundNumber} 轮`;
  const needsRefresh = input.waitingForStatusSync || input.completedButDiffMissing;
  const primaryRunButtonDisabled = needsRefresh ? !canRefreshStatus : !(canRunNextRound || canAppendRound);
  const primaryRunButtonVariant = needsRefresh || canRunNextRound || canAppendRound ? "default" : "secondary";
  const primaryActionMode: "refresh" | "append" | "run" = needsRefresh
    ? "refresh"
    : canAppendRound
      ? "append"
      : "run";
  return {
    canRefreshStatus,
    canResetRound,
    canAppendRound,
    canRunNextRound,
    nextRoundButtonText,
    appendRoundText,
    appendRoundNumber,
    primaryRunButtonDisabled,
    primaryRunButtonVariant,
    primaryActionMode,
  };
}
