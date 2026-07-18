import { documentRefsMatch } from "@/lib/documentMatch";
import { promptSequencesEqual } from "@/lib/modelRoute";
import { normalizePromptSequence } from "@/lib/promptRegistry";
import { normalizeStoredPromptSequence } from "@/lib/promptStorage";
import { readStorageValue, removeStorageValue, writeStorageValue } from "@/lib/safeStorage";
import { AUTO_SNAPSHOT_SUPPRESSION_KEY } from "@/lib/storageKeys";
import type { DocumentStatus, ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type AutoSnapshotSuppression = {
  sourcePath: string;
  docId: string;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  round: number | null;
  createdAt: string;
};

export function readAutoSnapshotSuppression(): AutoSnapshotSuppression | null {
  try {
    const raw = readStorageValue(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AutoSnapshotSuppression>;
    const promptProfile = String(parsed.promptProfile ?? "").trim().toLowerCase();
    if (!parsed.sourcePath || !promptProfile) {
      removeStorageValue(AUTO_SNAPSHOT_SUPPRESSION_KEY);
      return null;
    }
    return {
      sourcePath: parsed.sourcePath,
      docId: parsed.docId ?? "",
      promptProfile,
      promptSequence: normalizeStoredPromptSequence(parsed.promptSequence),
      round: typeof parsed.round === "number" ? parsed.round : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    removeStorageValue(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    return null;
  }
}

export function suppressAutoSnapshotRestore(
  status: DocumentStatus,
  config: ModelConfig,
  round: number | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
) {
  const payload: AutoSnapshotSuppression = {
    sourcePath: status.sourcePath,
    docId: status.docId,
    promptProfile: config.promptProfile,
    promptSequence: normalizePromptSequence(config.promptSequence, promptOptions, config.promptProfile, promptWorkflows),
    round,
    createdAt: new Date().toISOString(),
  };
  writeStorageValue(AUTO_SNAPSHOT_SUPPRESSION_KEY, JSON.stringify(payload));
}

export function clearAutoSnapshotSuppression() {
  removeStorageValue(AUTO_SNAPSHOT_SUPPRESSION_KEY);
}

export function shouldSuppressAutoSnapshotRestore(
  status: DocumentStatus,
  config: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const suppression = readAutoSnapshotSuppression();
  if (!suppression) {
    return false;
  }
  return (
    suppression.promptProfile === config.promptProfile
    && promptSequencesEqual(suppression.promptSequence, config.promptSequence, promptOptions, config.promptProfile, promptWorkflows)
    && (
      documentRefsMatch(suppression.sourcePath, status.sourcePath)
      || documentRefsMatch(suppression.docId, status.docId)
    )
  );
}
