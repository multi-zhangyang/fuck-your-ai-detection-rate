import type {
  DocumentScopeDiagnostics,
  HistoryArtifactQueryFilters,
  HistoryArtifactQueryResponse,
} from "@/types/app";

export function isEndpointCompatibilityError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  return status === 404 || status === 405;
}

export function getSourceKindFromPath(sourcePath: string): string {
  const lowerPath = sourcePath.toLowerCase();
  if (lowerPath.endsWith(".docx")) return "docx";
  if (lowerPath.endsWith(".txt")) return "txt";
  return "";
}

export function buildUnavailableScopeDiagnostics(sourcePath: string, detail = ""): DocumentScopeDiagnostics {
  return {
    available: false,
    ok: true,
    sourcePath,
    sourceKind: getSourceKindFromPath(sourcePath),
    message: detail || "正文边界诊断暂不可用，已跳过非阻断诊断；正文保护与导出仍按后端保护图执行。",
    totalTextUnitCount: 0,
    editableUnitCount: 0,
    protectedUnitCount: 0,
    semanticRangeCount: 0,
    bookmarkRangeCount: 0,
    commentRangeCount: 0,
    semanticRangeTopologyValid: false,
    semanticRangeIssueCount: 0,
    semanticRangeIssueCodes: [],
    semanticRangeCoveredUnitCount: 0,
    editableSemanticRangeCoveredUnitCount: 0,
    bookmarkRangeInteriorUnitCount: 0,
    editableBookmarkRangeInteriorUnitCount: 0,
    commentRangeInteriorUnitCount: 0,
    editableCommentRangeInteriorUnitCount: 0,
    templateInstructionUnitCount: 0,
    editableTemplateInstructionUnitCount: 0,
    reasonCounts: {},
    scope: {},
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
    issues: [],
    units: [],
  };
}

export function normalizeHistoryArtifactKinds(filters: HistoryArtifactQueryFilters): NonNullable<HistoryArtifactQueryResponse["filters"]["kinds"]> {
  const kinds = filters.kinds ?? (Array.isArray(filters.kind) ? filters.kind : filters.kind ? [filters.kind] : []);
  return kinds.filter((kind, index, items) => items.indexOf(kind) === index);
}

export function buildEmptyHistoryArtifactQueryResponse(
  filters: HistoryArtifactQueryFilters,
  error: string,
): HistoryArtifactQueryResponse {
  const limit = Math.max(0, Number(filters.limit ?? 8) || 8);
  const offset = Math.max(0, Number(filters.offset ?? 0) || 0);
  return {
    ok: false,
    source: "sqlite",
    filters: {
      ...filters,
      kinds: normalizeHistoryArtifactKinds(filters),
      limit,
      offset,
    },
    items: [],
    total: 0,
    limit,
    offset,
    hasMore: false,
    stats: {
      total: 0,
      existing: 0,
      intermediate: 0,
      exports: 0,
      reports: 0,
      sources: 0,
      external: 0,
      missing: 0,
      bytes: 0,
    },
    error,
  };
}
