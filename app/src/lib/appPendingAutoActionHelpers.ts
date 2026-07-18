export function clearAutoRetryScopeCounts(
  counts: Record<string, number>,
  scopeKey: string | null | undefined,
): Record<string, number> {
  if (!scopeKey) return counts;
  const nextCounts = { ...counts };
  delete nextCounts[scopeKey];
  return nextCounts;
}

export function shouldClearPendingAutoActionForSource(
  pending: { sourcePath?: string | null } | null | undefined,
  sourcePath: string | null | undefined,
  sameWorkspacePath: (a: string, b: string) => boolean,
): boolean {
  if (!sourcePath || !pending?.sourcePath) return false;
  return sameWorkspacePath(pending.sourcePath, sourcePath);
}
