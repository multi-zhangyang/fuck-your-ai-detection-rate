import {
  isPromptSequenceCustomizable,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { isCompleteRoundCompareData } from "@/lib/documentPaths";
import type { DocumentStatus, ModelConfig, PromptId, PromptOption, PromptWorkflow, RoundCompareData } from "@/types/app";

export function normalizeDetectionDocumentKey(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}
export function normalizeDocumentRef(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}

export function documentRefsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeDocumentRef(left);
  const b = normalizeDocumentRef(right);
  if (!a || !b) {
    return false;
  }
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}


export function promptSequenceCoversSelectedRoute(
  recordSequence: PromptId[] | undefined,
  selectedSequence: PromptId[] | undefined,
  round: number | undefined,
  options?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  workflows?: PromptWorkflow[],
): boolean {
  const record = normalizePromptSequence(recordSequence, options, promptProfile, workflows);
  const selected = normalizePromptSequence(selectedSequence, options, promptProfile, workflows);
  if (!record.length || !selected.length) {
    return false;
  }
  if (typeof round === "number" && round > record.length) {
    return false;
  }
  return record.length <= selected.length && record.every((item, index) => item === selected[index]);
}

export function compareDataMatchesDocument(
  compareData: RoundCompareData | null,
  document: DocumentStatus | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  if (!isCompleteRoundCompareData(compareData) || !document) {
    return false;
  }
  const comparePromptProfile = normalizePromptProfile(compareData.promptProfile, promptWorkflows) ?? compareData.promptProfile;
  const documentPromptProfile = normalizePromptProfile(document.promptProfile, promptWorkflows) ?? document.promptProfile;
  if (comparePromptProfile !== documentPromptProfile) {
    return false;
  }
  if (
    isPromptSequenceCustomizable(documentPromptProfile, promptWorkflows)
    && !promptSequenceCoversSelectedRoute(
      compareData.promptSequence,
      document.promptSequence,
      compareData.round,
      promptOptions,
      documentPromptProfile,
      promptWorkflows,
    )
  ) {
    return false;
  }
  const compareDocKey = normalizeDetectionDocumentKey(compareData.docId);
  const documentDocKey = normalizeDetectionDocumentKey(document.docId);
  if (compareDocKey && documentDocKey && compareDocKey === documentDocKey) {
    return true;
  }
  const sourceKey = normalizeDetectionDocumentKey(document.sourcePath);
  const inputKey = normalizeDetectionDocumentKey(compareData.inputPath);
  const outputKey = normalizeDetectionDocumentKey(compareData.outputPath);
  const currentInputKey = normalizeDetectionDocumentKey(document.currentInputPath);
  const currentOutputKey = normalizeDetectionDocumentKey(document.currentOutputPath);
  const latestOutputKey = normalizeDetectionDocumentKey(document.latestOutputPath);
  return Boolean(
    (sourceKey && (documentRefsMatch(sourceKey, inputKey) || documentRefsMatch(sourceKey, outputKey)))
    || (currentInputKey && documentRefsMatch(currentInputKey, inputKey))
    || (currentOutputKey && documentRefsMatch(currentOutputKey, outputKey))
    || (latestOutputKey && documentRefsMatch(latestOutputKey, outputKey))
  );
}
