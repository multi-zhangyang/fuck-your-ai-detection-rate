import type { DeleteHistoryOptions } from "@/types/app";

export function buildHistoryDeleteActionKey(docId: string, options?: DeleteHistoryOptions): string {
  return JSON.stringify({
    docId,
    mode: options?.mode ?? "records_and_artifacts",
    fromRound: options?.fromRound ?? null,
    promptProfile: options?.promptProfile ?? null,
    promptSequence: options?.promptSequence ?? null,
  });
}
