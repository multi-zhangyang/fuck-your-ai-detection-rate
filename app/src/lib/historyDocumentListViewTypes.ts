import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
} from "@/types/app";

export type HistoryDocumentDeleteAction = {
  title: string;
  options: DeleteHistoryOptions;
  destructive?: boolean;
};

export type HistoryDocumentListItemState = {
  isActive: boolean;
  cleanupOpen: boolean;
  shouldShowRounds: boolean;
  profileRounds: HistoryDocumentSummary["rounds"];
  activeRounds: HistoryDocumentSummary["rounds"];
  visibleRounds: HistoryDocumentSummary["rounds"];
  completedRounds: number[];
  roundStateText: string;
  latestRound: HistoryRound | null;
  nextStepText: string;
  latestResultText: string;
  exportStateText: string;
  cleanupStateText: string;
  missingAssets: boolean;
  documentDeleteActions: HistoryDocumentDeleteAction[];
  documentImpactPreview: HistoryDeleteImpact | null;
  listKey: string;
  docName: string;
  lastTimestampText: string;
  pathScopeText: string;
};

export type HistoryDocumentRoundViewState = {
  roundPromptProfile: ModelConfig["promptProfile"];
  roundDeleteActions: HistoryDocumentDeleteAction[];
  roundImpactPreview: HistoryDeleteImpact | null;
  roundKey: string;
  hasMissingAssets: boolean;
  outputPathText: string;
  sequenceLabel: string | null;
  profileLabel: string;
  timestampText: string;
};
