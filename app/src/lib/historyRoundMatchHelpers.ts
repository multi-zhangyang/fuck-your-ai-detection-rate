import {
  getPromptFlowSequence,
  isPromptSequenceCustomizable,
  normalizePromptProfile,
} from "@/lib/promptRegistry";
import {
  documentRefsMatch,
  normalizeDocumentRef,
  promptSequenceCoversSelectedRoute,
} from "@/lib/documentMatch";
import type {
  DocumentStatus,
  HistoryDocumentSummary,
  HistoryRound,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export { documentRefsMatch, normalizeDocumentRef };

export function getPlannedRoundCount(
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): number {
  return getPromptFlowSequence(config.promptProfile, config.promptSequence, promptOptions, promptWorkflows).length;
}

export function historyItemMatchesDocument(item: HistoryDocumentSummary, status: DocumentStatus | null, sourcePath?: string): boolean {
  const documentRefs = [status?.docId, status?.sourcePath, sourcePath].filter(Boolean) as string[];
  const historyRefs = [item.docId, item.sourcePath, item.originPath].filter(Boolean);
  return documentRefs.some((documentRef) => historyRefs.some((historyRef) => documentRefsMatch(documentRef, historyRef)));
}

export function isPromptProfile(value: unknown, workflows?: PromptWorkflow[]): value is ModelConfig["promptProfile"] {
  return Boolean(normalizePromptProfile(value, workflows));
}

export function sortHistoryRounds(rounds: HistoryRound[], strategy: "round" | "timestamp" = "round"): HistoryRound[] {
  return [...rounds]
    .filter((roundItem) => Boolean(roundItem.outputPath))
    .sort((left, right) => {
      const leftTime = Date.parse(left.timestamp || "");
      const rightTime = Date.parse(right.timestamp || "");
      const leftTimestamp = Number.isFinite(leftTime) ? leftTime : 0;
      const rightTimestamp = Number.isFinite(rightTime) ? rightTime : 0;
      if (strategy === "timestamp" && rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      if (right.round !== left.round) {
        return right.round - left.round;
      }
      return rightTimestamp - leftTimestamp;
    });
}

export function historyRoundMatchesPrompt(
  roundItem: HistoryRound,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[],
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const plannedRounds = getPlannedRoundCount({ promptProfile, promptSequence }, promptOptions, promptWorkflows);
  if (roundItem.round < 1 || roundItem.round > plannedRounds) {
    return false;
  }
  if ((roundItem.promptProfile || "cn") !== promptProfile) {
    return false;
  }
  if (!isPromptSequenceCustomizable(promptProfile, promptWorkflows)) {
    return true;
  }
  return promptSequenceCoversSelectedRoute(roundItem.promptSequence, promptSequence, roundItem.round, promptOptions, promptProfile, promptWorkflows);
}

export function getLatestHistoryRound(
  item: HistoryDocumentSummary,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[],
  allowProfileFallback: boolean,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): HistoryRound | null {
  const profileRound = sortHistoryRounds(
    item.rounds.filter((roundItem) => historyRoundMatchesPrompt(roundItem, promptProfile, promptSequence, promptOptions, promptWorkflows)),
  )[0];
  if (profileRound || !allowProfileFallback) {
    return profileRound ?? null;
  }
  return (
    item.rounds.find((roundItem) => roundItem.outputPath && roundItem.outputPath === item.latestOutputPath)
    ?? sortHistoryRounds(item.rounds, "timestamp")[0]
    ?? null
  );
}

export function getPreferredHistoryRound(item: HistoryDocumentSummary): HistoryRound | null {
  const latestByOutput = item.rounds.find((roundItem) => roundItem.outputPath && roundItem.outputPath === item.latestOutputPath);
  return latestByOutput ?? sortHistoryRounds(item.rounds, "timestamp")[0] ?? null;
}
