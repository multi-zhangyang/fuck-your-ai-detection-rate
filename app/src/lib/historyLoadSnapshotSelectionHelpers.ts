import {
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import {
  getLatestHistoryRound,
  historyItemMatchesDocument,
} from "@/lib/historyMatchHelpers";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function resolveLatestRoundSnapshotSelection(input: {
  status: DocumentStatus;
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
  historyItems: HistoryDocumentSummary[];
  historyItem?: HistoryDocumentSummary | null;
  allowProfileFallback?: boolean;
  promptOptions?: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
}): {
  matchedItem: HistoryDocumentSummary | null;
  latestRound: HistoryRound | null;
  outputPath: string | null;
  expectedIdentity: { outputPath: string; docId: string; round: number } | null;
} {
  const matchedItem = input.historyItem
    ?? input.historyItems.find((item) => historyItemMatchesDocument(item, input.status, input.status.sourcePath))
    ?? null;
  const latestRound = matchedItem
    ? getLatestHistoryRound(
      matchedItem,
      input.config.promptProfile,
      normalizePromptSequence(
        input.config.promptSequence,
        input.promptOptions,
        input.config.promptProfile,
        input.promptWorkflows,
      ),
      input.allowProfileFallback ?? false,
      input.promptOptions,
      input.promptWorkflows,
    )
    : null;
  const outputPath = latestRound?.outputPath || input.status.latestOutputPath || null;
  const expectedRound = latestRound?.round
    ?? Math.max(0, ...input.status.completedRounds.filter((round) => Number.isInteger(round)));
  return {
    matchedItem,
    latestRound,
    outputPath: outputPath || null,
    expectedIdentity: outputPath && input.status.docId && expectedRound > 0
      ? { outputPath, docId: input.status.docId, round: expectedRound }
      : null,
  };
}

export function buildIncompleteRoundSnapshotError(): Error {
  return new Error("本轮结果不完整，不能载入为已完成 Diff。");
}
