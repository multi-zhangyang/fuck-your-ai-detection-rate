import type {
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryFilters,
  HistoryArtifactQueryResponse,
} from "@/types/app";

const EMPTY_STATS = {
  total: 0,
  existing: 0,
  intermediate: 0,
  exports: 0,
  reports: 0,
  sources: 0,
  external: 0,
  missing: 0,
  bytes: 0,
} as const;

export function createEmptyHistoryArtifactQuery(error: string): HistoryArtifactQueryResponse {
  return {
    ok: false,
    source: "sqlite",
    filters: {},
    items: [],
    total: 0,
    limit: 8,
    offset: 0,
    hasMore: false,
    stats: { ...EMPTY_STATS },
    error,
  };
}

export function createFailedHistoryArtifactQuery(
  filters: HistoryArtifactQueryFilters,
  error: string,
): HistoryArtifactQueryResponse {
  return {
    ok: false,
    source: "sqlite",
    filters,
    items: [],
    total: 0,
    limit: filters.limit ?? 8,
    offset: filters.offset ?? 0,
    hasMore: false,
    stats: { ...EMPTY_STATS },
    error,
  };
}

export function buildHistoryArtifactFilters(input: {
  mode: HistoryArtifactGovernanceMode;
  currentDocId?: string | null;
  fallbackDocId?: string | null;
}): HistoryArtifactQueryFilters | null {
  if (input.mode === "current") {
    const docId = input.currentDocId || input.fallbackDocId || "";
    return docId ? { docId, exists: "existing", limit: 8 } : null;
  }
  if (input.mode === "large") {
    return { exists: "existing", minBytes: 64 * 1024, limit: 8 };
  }
  return { exists: "missing", limit: 8 };
}
