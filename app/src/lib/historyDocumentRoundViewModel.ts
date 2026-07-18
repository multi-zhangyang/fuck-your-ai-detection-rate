import {
  formatTimestamp,
  formatPathScope,
  getProfileLabel,
  formatPromptSequence,
  getPromptOptions,
  getSafeArtifactStats,
} from "@/lib/historyCardHelpers";
import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

import type {
  HistoryDocumentDeleteAction,
  HistoryDocumentRoundViewState,
} from "@/lib/historyDocumentListViewTypes";

export function deriveHistoryDocumentRoundState(input: {
  item: HistoryDocumentSummary;
  roundItem: HistoryRound;
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  impactPreview: { key: string; impact: HistoryDeleteImpact } | null;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  sequenceCustomizable: boolean;
}): HistoryDocumentRoundViewState {
  const {
    item,
    roundItem,
    promptSequence,
    promptOptions,
    promptWorkflows,
    impactPreview,
    makeDeleteActionKey,
    sequenceCustomizable,
  } = input;
  const roundPromptProfile = (roundItem.promptProfile || "cn") as ModelConfig["promptProfile"];
  const roundPromptOptions = getPromptOptions(
    roundPromptProfile,
    roundItem.promptSequence ?? promptSequence,
    promptOptions,
    promptWorkflows,
  );
  const roundDeleteActions: HistoryDocumentDeleteAction[] = [
    { title: "清理本轮导出", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "exports_only" } },
    { title: "回滚到本轮前", options: { ...roundPromptOptions, fromRound: roundItem.round, mode: "records_and_artifacts" }, destructive: true },
  ];
  const roundImpactPreview = impactPreview
    && roundDeleteActions.some((action) => makeDeleteActionKey(item.docId, action.options) === impactPreview.key)
    ? impactPreview.impact
    : null;
  return {
    roundPromptProfile,
    roundDeleteActions,
    roundImpactPreview,
    roundKey: `${item.docId}-${roundItem.promptProfile}-${roundItem.round}-${formatPromptSequence(roundItem.promptSequence, promptOptions, roundPromptProfile, promptWorkflows)}`,
    hasMissingAssets: Boolean(getSafeArtifactStats(roundItem.artifactStats).missing),
    outputPathText: roundItem.outputPath ? formatPathScope(roundItem.outputPath) : "暂无输出路径",
    sequenceLabel: sequenceCustomizable
      ? formatPromptSequence(roundItem.promptSequence, promptOptions, roundPromptProfile, promptWorkflows)
      : null,
    profileLabel: getProfileLabel(roundPromptProfile, promptWorkflows),
    timestampText: formatTimestamp(roundItem.timestamp),
  };
}
