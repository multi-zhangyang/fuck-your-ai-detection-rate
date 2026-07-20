import type { RoundCompareData } from "@/types/app";

export const DIFF_VIRTUALIZATION_THRESHOLD = 40;
export const DIFF_VIRTUAL_OVERSCAN = 6;
export const DIFF_VIRTUAL_ESTIMATED_ROW_SIZE = 536;
export const DIFF_VIRTUAL_ROW_GAP = 16;

export function shouldVirtualizeDiffChunks(chunkCount: number): boolean {
  return chunkCount > DIFF_VIRTUALIZATION_THRESHOLD;
}

export function findDiffChunkIndex(
  chunks: RoundCompareData["chunks"],
  chunkId: string,
): number {
  if (!chunkId) {
    return -1;
  }
  return chunks.findIndex((chunk) => chunk.chunkId === chunkId);
}
