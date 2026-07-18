export type LegacyRerunRefreshIdentity = {
  sourcePath: string;
  outputPath: string;
  docId: string;
  round: number;
};

export type IdentityBoundRefreshResult<T> =
  | { status: "ready"; snapshot: T }
  | { status: "stale" };

type IdentityBoundRefreshOptions<T> = {
  expectedIdentity: LegacyRerunRefreshIdentity;
  getCurrentIdentity: () => LegacyRerunRefreshIdentity | null;
  loadSnapshot: () => Promise<T>;
  getSnapshotIdentity: (snapshot: T) => LegacyRerunRefreshIdentity | null;
};

function normalizeWorkspacePath(value: string): string {
  return String(value || "").replace(/\\/g, "/").toLowerCase();
}

export function buildLegacyRerunRefreshIdentity(
  sourcePath: string | null | undefined,
  compare: {
    outputPath?: string | null;
    docId?: string | null;
    round?: number | null;
  } | null | undefined,
): LegacyRerunRefreshIdentity | null {
  const normalizedSourcePath = String(sourcePath || "").trim();
  const outputPath = String(compare?.outputPath || "").trim();
  const docId = String(compare?.docId || "").trim();
  const round = Number(compare?.round || 0);
  if (!normalizedSourcePath || !outputPath || !docId || !Number.isInteger(round) || round <= 0) {
    return null;
  }
  return {
    sourcePath: normalizedSourcePath,
    outputPath,
    docId,
    round,
  };
}

export function legacyRerunRefreshIdentityMatches(
  expected: LegacyRerunRefreshIdentity | null | undefined,
  actual: LegacyRerunRefreshIdentity | null | undefined,
): boolean {
  if (!expected || !actual) return false;
  return normalizeWorkspacePath(expected.sourcePath) === normalizeWorkspacePath(actual.sourcePath)
    && normalizeWorkspacePath(expected.outputPath) === normalizeWorkspacePath(actual.outputPath)
    && expected.docId === actual.docId
    && expected.round === actual.round;
}

/**
 * Load the compare/review snapshot written by a failed legacy rerun, but only
 * return it while the same source, output, document id and round remain
 * visible. The second identity check is deliberately after both requests have
 * settled so a slow response from a document that was switched away cannot be
 * applied to the new page.
 */
export async function loadIdentityBoundLegacyRerunRefresh<T>(
  options: IdentityBoundRefreshOptions<T>,
): Promise<IdentityBoundRefreshResult<T>> {
  if (!legacyRerunRefreshIdentityMatches(options.expectedIdentity, options.getCurrentIdentity())) {
    return { status: "stale" };
  }
  const snapshot = await options.loadSnapshot();
  if (!legacyRerunRefreshIdentityMatches(options.expectedIdentity, options.getCurrentIdentity())) {
    return { status: "stale" };
  }
  if (!legacyRerunRefreshIdentityMatches(options.expectedIdentity, options.getSnapshotIdentity(snapshot))) {
    return { status: "stale" };
  }
  return { status: "ready", snapshot };
}
