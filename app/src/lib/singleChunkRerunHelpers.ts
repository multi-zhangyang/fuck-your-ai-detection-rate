import type { BatchRerunTarget } from "@/types/app";

export type SingleChunkRerunIdentity = {
  sourcePath: string;
  outputPath: string;
  docId: string;
  round: number;
};

export function buildSingleChunkRerunIdentity(
  sourcePath: string | null | undefined,
  compare: {
    outputPath?: string | null;
    docId?: string | null;
    round?: number | null;
  } | null | undefined,
): SingleChunkRerunIdentity | null {
  const normalizedSourcePath = String(sourcePath || "").trim();
  const outputPath = String(compare?.outputPath || "").trim();
  const docId = String(compare?.docId || "").trim();
  const round = Number(compare?.round || 0);
  if (!normalizedSourcePath || !outputPath || !docId || !Number.isInteger(round) || round <= 0) {
    return null;
  }
  return { sourcePath: normalizedSourcePath, outputPath, docId, round };
}

/**
 * Keep an ordinary one-chunk rerun on the resumable batch-task protocol.
 * Manual feedback remains bound to that exact target and is never promoted
 * into task progress/status text.
 */
export function buildSingleChunkBatchRerunTargets(
  chunkId: string,
  userFeedback?: string,
): BatchRerunTarget[] {
  return [{ chunkId, userFeedback }];
}
