import {
  buildHistoryDocumentLoadNotice,
  buildHistoryDocumentLoadRuntimeStep,
} from "@/lib/historyLoadNoticeHelpers";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function planHistoryDocumentLoadFeedback(input: {
  status: DocumentStatus;
  statusConfig: ModelConfig;
  loadedSnapshot: unknown;
  formatDocumentLoadStep: (
    prefix: string,
    status: DocumentStatus,
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
    promptOptions?: PromptOption[],
    promptWorkflows?: PromptWorkflow[],
  ) => string;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  describeDocumentProgress: (
    status: DocumentStatus,
    config: ModelConfig,
    promptOptions?: PromptOption[],
    promptWorkflows?: PromptWorkflow[],
  ) => string;
}): { notice: string; runtimeStep: string } {
  return {
    notice: buildHistoryDocumentLoadNotice(
      input.status,
      input.statusConfig,
      input.describeDocumentProgress(
        input.status,
        input.statusConfig,
        input.promptOptions,
        input.promptWorkflows,
      ),
    ),
    runtimeStep: buildHistoryDocumentLoadRuntimeStep({
      loadedSnapshot: input.loadedSnapshot,
      status: input.status,
      config: input.statusConfig,
      formatDocumentLoadStep: input.formatDocumentLoadStep,
      promptOptions: input.promptOptions,
      promptWorkflows: input.promptWorkflows,
    }),
  };
}

export function buildLoadedRoundSnapshotView(input: {
  matchedItem: HistoryDocumentSummary | null | undefined;
  latestRound: HistoryRound | null | undefined;
  compareData: import("@/types/app").RoundCompareData;
}) {
  return {
    historyItem: input.matchedItem ?? null,
    round: input.latestRound ?? null,
    compareData: input.compareData,
  };
}

export function buildHistoryRouteStatusResult(
  status: DocumentStatus,
  statusConfig: ModelConfig,
) {
  return { status, statusConfig };
}
