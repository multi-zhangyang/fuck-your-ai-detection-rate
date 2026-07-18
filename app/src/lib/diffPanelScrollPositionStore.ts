const diffScrollPositions = new Map<string, number>();

export function getDiffScrollTop(scrollKey: string): number {
  return diffScrollPositions.get(scrollKey) ?? 0;
}

export function setDiffScrollTop(scrollKey: string, scrollTop: number): void {
  diffScrollPositions.set(scrollKey, scrollTop);
}

export function buildDiffPanelScrollKey(baseScrollKey: string, filterMode: string): string {
  return `${baseScrollKey}:${filterMode}`;
}

export function resolveFocusedChunkId(focusedReviewIndex: number, reviewChunkIds: string[]): string {
  return focusedReviewIndex >= 0 ? reviewChunkIds[focusedReviewIndex] ?? "" : "";
}
