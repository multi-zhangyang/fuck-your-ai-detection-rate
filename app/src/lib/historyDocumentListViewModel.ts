import {
  formatTimestamp,
  formatDocName,
  formatPathScope,
  getRoundStateText,
  formatPromptSequence,
  getNextRoundText,
  getSafeArtifactStats,
  getExportStateText,
  getCleanupStateText,
} from "@/lib/historyCardHelpers";
import {
  buildHistoryDocumentDeleteActions,
  resolveDocumentImpactPreview,
} from "@/lib/historyDocumentDeleteActionHelpers";
import { deriveHistoryDocumentListItemRounds } from "@/lib/historyDocumentListItemRoundHelpers";
import type {
  DeleteHistoryOptions,
  DocumentHistory,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

import type {
  HistoryDocumentListItemState,
} from "@/lib/historyDocumentListViewTypes";

export function deriveHistoryDocumentListItemState(input: {
  item: HistoryDocumentSummary;
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  cleanupDocId: string | null;
  impactPreview: { key: string; impact: HistoryDeleteImpact } | null;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  itemsLength: number;
}): HistoryDocumentListItemState {
  const {
    item,
    currentDocId,
    currentHistory,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    cleanupDocId,
    impactPreview,
    makeDeleteActionKey,
    itemsLength,
  } = input;
  const rounds = deriveHistoryDocumentListItemRounds({
    item,
    currentDocId,
    currentHistory,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    itemsLength,
  });
  const cleanupOpen = cleanupDocId === item.docId;
  const roundStateText = getRoundStateText(rounds.completedRounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
  const nextStepText = getNextRoundText(rounds.completedRounds, promptProfile, promptSequence, promptOptions, promptWorkflows);
  const latestResultText = rounds.latestRound?.outputPath ? `第 ${rounds.latestRound.round} 轮` : "未生成";
  const exportStateText = getExportStateText(item, rounds.visibleRounds);
  const cleanupStateText = getCleanupStateText(item.artifactStats);
  const missingAssets = getSafeArtifactStats(item.artifactStats).missing > 0;
  const documentDeleteActions = buildHistoryDocumentDeleteActions();
  const documentImpactPreview = resolveDocumentImpactPreview({
    impactPreview,
    documentDeleteActions,
    docId: item.docId,
    makeDeleteActionKey,
  });
  return {
    isActive: rounds.isActive,
    cleanupOpen,
    shouldShowRounds: rounds.shouldShowRounds,
    profileRounds: rounds.profileRounds,
    activeRounds: rounds.activeRounds,
    visibleRounds: rounds.visibleRounds,
    completedRounds: rounds.completedRounds,
    roundStateText,
    latestRound: rounds.latestRound,
    nextStepText,
    latestResultText,
    exportStateText,
    cleanupStateText,
    missingAssets,
    documentDeleteActions,
    documentImpactPreview,
    listKey: `${item.docId}-${promptProfile}-${formatPromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows)}`,
    docName: formatDocName(item),
    lastTimestampText: item.lastTimestamp ? formatTimestamp(item.lastTimestamp) : "暂无时间记录",
    pathScopeText: formatPathScope(item.originPath || item.sourcePath || item.docId),
  };
}

export { deriveHistoryDocumentRoundState } from "@/lib/historyDocumentRoundViewModel";

export type {
  HistoryDocumentDeleteAction,
  HistoryDocumentListItemState,
  HistoryDocumentRoundViewState,
} from "@/lib/historyDocumentListViewTypes";
