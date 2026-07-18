export type { RoundResetTarget } from "@/lib/documentStatusProgressCopy";
export type { ExecuteRoundResetInput } from "@/lib/documentStatusResetCopy";

export {
  describePromptProfile,
  isManualContinuationRound,
  getRoundResetTarget,
  describeDocumentProgress,
  formatDocumentLoadStep,
  formatRoundCompleteStep,
  formatRoundCompleteNotice,
} from "@/lib/documentStatusProgressCopy";

export {
  buildRoundResetConfirmOptions,
  buildRoundResetConfig,
  buildExecuteRoundResetInput,
  buildRoundResetSuccessNotice,
  buildRoundResetBusyNotice,
  buildRoundResetMissingNotice,
  buildRoundResetRuntimeStep,
  buildRoundResetFailureRuntimeStep,
} from "@/lib/documentStatusResetCopy";

export {
  buildPromptProfileSwitchLoadingRuntimeStep,
  buildPromptProfileSwitchSuccessRuntimeStep,
  buildPromptProfileSwitchFailureRuntimeStep,
  buildPromptSequenceSwitchLoadingRuntimeStep,
  buildPromptSequenceSwitchSuccessRuntimeStep,
  buildPromptSequenceSwitchFailureRuntimeStep,
  resolveRoundProgressRoute,
} from "@/lib/documentStatusSwitchCopy";
