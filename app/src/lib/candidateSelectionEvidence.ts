import type {
  AcademicReadabilityDeltaEvidence,
  CandidateSelectionCandidate,
  ChunkCandidateSelection,
  DeterministicLexicalRetentionProxy,
  RerunDimensionDirection,
  SourceRelativeDocumentDeltaEvidence,
  SourceRelativeStyleDeltaEvidence,
} from "@/types/app";

const CANDIDATE_SELECTION_SCHEMA = "fyadr.chunk-candidate-selection";
const CANDIDATE_SELECTION_VERSION = 2;
const MAX_CANDIDATES = 4;
const MAX_MODEL_ATTEMPTS = 3;
const ACADEMIC_READABILITY_DELTA_SCHEMA = "fyadr.academic-readability-delta";
const ACADEMIC_READABILITY_DELTA_VERSION = 1;
const SOURCE_RELATIVE_STYLE_DELTA_SCHEMA = "fyadr.source-relative-style-delta";
const SOURCE_RELATIVE_STYLE_DELTA_VERSION = 1;
const SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA = "fyadr.source-relative-document-style-delta";
const SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION = 1;
const SHA256_RE = /^[0-9a-f]{64}$/;
const SOURCE_RELATIVE_BLOCKING_CODES = new Set([
  "repeated_opening_family_introduced",
  "repeated_sentence_skeleton_introduced",
  "sentence_boundary_collapse_introduced",
  "sentence_fragmentation_introduced",
  "source_pattern_profile_invalid",
]);
const OPENING_FAMILY_IDS = new Set([
  "cn.based_on",
  "cn.through",
  "cn.targeting",
  "cn.in_context",
  "cn.condition",
  "cn.concession",
  "cn.causal",
  "cn.sequence",
  "cn.additive",
  "cn.article_stance",
  "cn.demonstrative_subject",
  "cn.passive",
  "cn.domain_subject",
  "cn.plain",
  "en.based_on",
  "en.through",
  "en.condition",
  "en.concession",
  "en.causal",
  "en.sequence",
  "en.article_stance",
  "en.plain",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, maxChars = 240): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return null;
  return normalized.slice(0, maxChars);
}

function exactBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function boundedInteger(value: unknown, minimum: number, maximum: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < minimum || value > maximum) return null;
  return value;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function unitIntervalNumber(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric >= 0 && numeric <= 1 ? numeric : null;
}

function normalizeStringList(value: unknown, maxItems = 16): string[] | null {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const items: string[] = [];
  for (const rawItem of value) {
    const item = boundedString(rawItem, 120);
    if (!item) return null;
    if (!items.includes(item)) items.push(item);
  }
  return items;
}

function normalizeDirection(value: unknown): RerunDimensionDirection | null {
  if (!isRecord(value)) return null;
  const direction: RerunDimensionDirection = {};
  for (const key of ["dimensionId", "direction", "primaryMetric", "secondaryMetric", "note"] as const) {
    if (value[key] === undefined) continue;
    const text = boundedString(value[key], key === "note" ? 260 : 120);
    if (!text) return null;
    direction[key] = text;
  }
  for (const key of ["ok", "satisfied"] as const) {
    if (value[key] === undefined) continue;
    const flag = exactBoolean(value[key]);
    if (flag === null) return null;
    direction[key] = flag;
  }
  for (const key of [
    "before",
    "after",
    "variationBefore",
    "variationAfter",
    "openingConcentrationBefore",
    "openingConcentrationAfter",
    "burstBefore",
    "burstAfter",
    "paddingBefore",
    "paddingAfter",
    "closingBefore",
    "closingAfter",
    "chengyuBefore",
    "chengyuAfter",
  ] as const) {
    if (value[key] === undefined) continue;
    const numeric = finiteNumber(value[key]);
    if (numeric === null) return null;
    direction[key] = numeric;
  }
  for (const key of ["riskCodesBefore", "riskCodesAfter"] as const) {
    if (value[key] === undefined) continue;
    const items = normalizeStringList(value[key]);
    if (items === null) return null;
    direction[key] = items;
  }
  if (value.structureDirection !== undefined) {
    if (!isRecord(value.structureDirection)) return null;
    const effective = value.structureDirection.effective;
    const concentration = value.structureDirection.concentration;
    if (effective !== undefined && typeof effective !== "boolean") return null;
    if (concentration !== undefined && finiteNumber(concentration) === null) return null;
    direction.structureDirection = {
      ...(effective === undefined ? {} : { effective }),
      ...(concentration === undefined ? {} : { concentration: Number(concentration) }),
    };
  }
  return direction;
}

function normalizeLexicalRetentionProxy(value: unknown): DeterministicLexicalRetentionProxy | null {
  if (!isRecord(value)) return null;
  const score = unitIntervalNumber(value.score);
  const minimumScore = unitIntervalNumber(value.minimumScore);
  const sourceCoverage = unitIntervalNumber(value.sourceCoverage);
  const outputPrecision = unitIntervalNumber(value.outputPrecision);
  const lengthSimilarity = unitIntervalNumber(value.lengthSimilarity);
  if (
    score === null
    || minimumScore === null
    || sourceCoverage === null
    || outputPrecision === null
    || lengthSimilarity === null
    || value.usesEmbedding !== false
    || value.usesModel !== false
    || value.claimsSemanticEquivalence !== false
    || value.isAiDetector !== false
    || value.claimsDetectionRate !== false
  ) {
    return null;
  }
  const name = value.name === undefined ? null : boundedString(value.name, 120);
  if (value.name !== undefined && !name) return null;
  return {
    ...(name ? { name } : {}),
    score,
    minimumScore,
    sourceCoverage,
    outputPrecision,
    lengthSimilarity,
    usesEmbedding: false,
    usesModel: false,
    claimsSemanticEquivalence: false,
    isAiDetector: false,
    claimsDetectionRate: false,
  };
}

function normalizeAcademicReadabilityDelta(value: unknown): AcademicReadabilityDeltaEvidence | null {
  if (!isRecord(value)) return null;
  const ok = exactBoolean(value.ok);
  const issueCodes = normalizeStringList(value.issueCodes, 8);
  if (
    value.schema !== ACADEMIC_READABILITY_DELTA_SCHEMA
    || value.schemaVersion !== ACADEMIC_READABILITY_DELTA_VERSION
    || ok === null
    || issueCodes === null
    || (ok && issueCodes.length > 0)
    || (!ok && issueCodes.length === 0)
  ) {
    return null;
  }
  return {
    schema: ACADEMIC_READABILITY_DELTA_SCHEMA,
    schemaVersion: ACADEMIC_READABILITY_DELTA_VERSION,
    ok,
    issueCodes,
  };
}

function sha256(value: unknown, allowEmpty = false): string | null {
  if (allowEmpty && value === "") return "";
  return typeof value === "string" && SHA256_RE.test(value) ? value : null;
}

function normalizeKnownCodes(value: unknown, allowed: Set<string>, maxItems = 16): string[] | null {
  const codes = normalizeStringList(value, maxItems);
  return codes && codes.every((code) => allowed.has(code)) ? codes : null;
}

function stringListsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function sourcePatternRowBlocks(input: {
  kind: "opening_family" | "sentence_skeleton";
  contextScope: "document" | "local" | "invalid";
  outputCount: number;
  introducedCount: number;
  documentAfterCount: number | null;
  documentIntroducedCount: number | null;
}): boolean {
  const localBlock = input.outputCount >= 3 && input.introducedCount >= 2;
  const documentBlock = input.contextScope === "document"
    && (input.documentAfterCount ?? 0) >= 4
    && (input.documentIntroducedCount ?? 0) >= 2;
  return localBlock || documentBlock;
}

function normalizeSourcePatternSummary(
  value: unknown,
  kind: "opening_family" | "sentence_skeleton",
  contextScope: "document" | "local" | "invalid",
): SourceRelativeStyleDeltaEvidence["openingFamilyDelta"] | null {
  if (!isRecord(value)) return null;
  const introducedPatternCount = boundedInteger(value.introducedPatternCount, 0, 1_000_000);
  const blockingPatternCount = boundedInteger(value.blockingPatternCount, 0, 1_000_000);
  const maxIntroducedCount = boundedInteger(value.maxIntroducedCount, 0, 1_000_000);
  const maxDocumentAfterCount = boundedInteger(value.maxDocumentAfterCount, 0, 1_000_000);
  const expectedIssue = kind === "opening_family"
    ? "repeated_opening_family_introduced"
    : "repeated_sentence_skeleton_introduced";
  const issueCodes = normalizeKnownCodes(value.issueCodes, new Set([expectedIssue]), 1);
  if (
    introducedPatternCount === null
    || blockingPatternCount === null
    || maxIntroducedCount === null
    || maxDocumentAfterCount === null
    || issueCodes === null
    || !Array.isArray(value.patterns)
    || value.patterns.length > 12
    || introducedPatternCount < value.patterns.length
    || (introducedPatternCount <= 12 && introducedPatternCount !== value.patterns.length)
    || (blockingPatternCount > 0) !== issueCodes.includes(expectedIssue)
  ) return null;
  const patterns: SourceRelativeStyleDeltaEvidence["openingFamilyDelta"]["patterns"] = [];
  const patternIds: string[] = [];
  let visibleBlockingPatternCount = 0;
  let visibleMaxIntroducedCount = 0;
  let visibleMaxDocumentAfterCount = 0;
  for (const rawPattern of value.patterns) {
    if (!isRecord(rawPattern) || rawPattern.kind !== kind) return null;
    const inputCount = boundedInteger(rawPattern.inputCount, 0, 1_000_000);
    const outputCount = boundedInteger(rawPattern.outputCount, 0, 1_000_000);
    const introducedCount = boundedInteger(rawPattern.introducedCount, 1, 1_000_000);
    const familyId = kind === "opening_family" ? boundedString(rawPattern.familyId, 80) : null;
    const patternSha256 = kind === "sentence_skeleton" ? sha256(rawPattern.patternSha256) : null;
    const documentBeforeCount = rawPattern.documentBeforeCount === null
      ? null
      : boundedInteger(rawPattern.documentBeforeCount, 0, 1_000_000);
    const documentAfterCount = rawPattern.documentAfterCount === null
      ? null
      : boundedInteger(rawPattern.documentAfterCount, 0, 1_000_000);
    const documentIntroducedCount = rawPattern.documentIntroducedCount === null
      ? null
      : boundedInteger(rawPattern.documentIntroducedCount, 0, 1_000_000);
    if (
      inputCount === null
      || outputCount === null
      || introducedCount === null
      || introducedCount !== Math.max(0, outputCount - inputCount)
      || (kind === "opening_family" && (!familyId || !OPENING_FAMILY_IDS.has(familyId)))
      || (kind === "sentence_skeleton" && !patternSha256)
      || (contextScope === "document" && (
        documentBeforeCount === null
        || documentAfterCount === null
        || documentIntroducedCount === null
        || documentAfterCount !== Math.max(0, documentBeforeCount - inputCount) + outputCount
        || documentIntroducedCount !== Math.max(0, documentAfterCount - documentBeforeCount)
      ))
      || (contextScope !== "document" && (
        rawPattern.documentBeforeCount !== null
        || rawPattern.documentAfterCount !== null
        || rawPattern.documentIntroducedCount !== null
      ))
    ) return null;
    patterns.push({
      kind,
      inputCount,
      outputCount,
      introducedCount,
      documentBeforeCount,
      documentAfterCount,
      documentIntroducedCount,
      ...(familyId ? { familyId } : {}),
      ...(patternSha256 ? { patternSha256 } : {}),
    });
    const patternId = familyId || patternSha256;
    if (!patternId) return null;
    patternIds.push(patternId);
    visibleMaxIntroducedCount = Math.max(visibleMaxIntroducedCount, introducedCount);
    visibleMaxDocumentAfterCount = Math.max(
      visibleMaxDocumentAfterCount,
      documentAfterCount ?? 0,
    );
    if (sourcePatternRowBlocks({
      kind,
      contextScope,
      outputCount,
      introducedCount,
      documentAfterCount,
      documentIntroducedCount,
    })) {
      visibleBlockingPatternCount += 1;
    }
  }
  if (
    patternIds.some((patternId, index) => index > 0 && patternIds[index - 1] >= patternId)
    || blockingPatternCount > introducedPatternCount
    || visibleBlockingPatternCount > blockingPatternCount
    || (introducedPatternCount <= 12 && visibleBlockingPatternCount !== blockingPatternCount)
    || maxIntroducedCount < visibleMaxIntroducedCount
    || maxDocumentAfterCount < visibleMaxDocumentAfterCount
    || (introducedPatternCount === 0 && maxIntroducedCount !== 0)
    || (contextScope !== "document" && maxDocumentAfterCount !== 0)
  ) return null;
  return {
    introducedPatternCount,
    blockingPatternCount,
    maxIntroducedCount,
    maxDocumentAfterCount,
    issueCodes,
    patterns,
  };
}

function normalizeSourceRelativeStyleDelta(value: unknown): SourceRelativeStyleDeltaEvidence | null {
  if (!isRecord(value)) return null;
  const ready = exactBoolean(value.ready);
  const passed = exactBoolean(value.passed);
  const contextScope = value.contextScope === "document"
    || value.contextScope === "local"
    || value.contextScope === "invalid"
    ? value.contextScope
    : null;
  const blockingIssueCodes = normalizeKnownCodes(
    value.blockingIssueCodes,
    SOURCE_RELATIVE_BLOCKING_CODES,
    8,
  );
  const advisoryIssueCodes = normalizeKnownCodes(
    value.advisoryIssueCodes,
    new Set(["opening_family_delta_observed", "sentence_skeleton_delta_observed"]),
    2,
  );
  if (
    value.schema !== SOURCE_RELATIVE_STYLE_DELTA_SCHEMA
    || value.schemaVersion !== SOURCE_RELATIVE_STYLE_DELTA_VERSION
    || ready === null
    || passed === null
    || !contextScope
    || blockingIssueCodes === null
    || advisoryIssueCodes === null
    || passed !== (blockingIssueCodes.length === 0)
    || (contextScope === "invalid" && (
      ready
      || passed
      || !blockingIssueCodes.includes("source_pattern_profile_invalid")
    ))
    || (contextScope !== "invalid" && !ready)
    || !isRecord(value.binding)
  ) return null;
  const sourceProfileSha256 = sha256(value.binding.sourceProfileSha256, true);
  const baselineTextSha256 = sha256(value.binding.baselineTextSha256);
  const candidateTextSha256 = sha256(value.binding.candidateTextSha256);
  if (
    sourceProfileSha256 === null
    || !baselineTextSha256
    || !candidateTextSha256
    || (contextScope === "document" && !sourceProfileSha256)
    || (contextScope !== "document" && sourceProfileSha256 !== "")
  ) return null;
  const openingFamilyDelta = normalizeSourcePatternSummary(
    value.openingFamilyDelta,
    "opening_family",
    contextScope,
  );
  const sentenceSkeletonDelta = normalizeSourcePatternSummary(
    value.sentenceSkeletonDelta,
    "sentence_skeleton",
    contextScope,
  );
  if (!openingFamilyDelta || !sentenceSkeletonDelta || !isRecord(value.sentenceBoundaryDelta)) return null;
  const inputSentenceCount = boundedInteger(value.sentenceBoundaryDelta.inputSentenceCount, 0, 1_000_000);
  const outputSentenceCount = boundedInteger(value.sentenceBoundaryDelta.outputSentenceCount, 0, 1_000_000);
  const inputShortSentenceCount = boundedInteger(value.sentenceBoundaryDelta.inputShortSentenceCount, 0, 1_000_000);
  const outputShortSentenceCount = boundedInteger(value.sentenceBoundaryDelta.outputShortSentenceCount, 0, 1_000_000);
  const collapseCount = boundedInteger(value.sentenceBoundaryDelta.collapseCount, 0, 1_000_000);
  const fragmentIncrease = boundedInteger(value.sentenceBoundaryDelta.fragmentIncrease, 0, 1_000_000);
  const collapsed = exactBoolean(value.sentenceBoundaryDelta.collapsed);
  const fragmented = exactBoolean(value.sentenceBoundaryDelta.fragmented);
  const boundaryIssueCodes = normalizeKnownCodes(
    value.sentenceBoundaryDelta.issueCodes,
    new Set(["sentence_boundary_collapse_introduced", "sentence_fragmentation_introduced"]),
    2,
  );
  if (
    inputSentenceCount === null
    || outputSentenceCount === null
    || inputShortSentenceCount === null
    || outputShortSentenceCount === null
    || collapseCount === null
    || fragmentIncrease === null
    || collapsed === null
    || fragmented === null
    || boundaryIssueCodes === null
    || inputShortSentenceCount > inputSentenceCount
    || outputShortSentenceCount > outputSentenceCount
    || collapseCount !== Math.max(0, inputSentenceCount - outputSentenceCount)
    || fragmentIncrease !== Math.max(0, outputShortSentenceCount - inputShortSentenceCount)
    || collapsed !== boundaryIssueCodes.includes("sentence_boundary_collapse_introduced")
    || fragmented !== boundaryIssueCodes.includes("sentence_fragmentation_introduced")
    || !isRecord(value.claims)
    || value.claims.providerIndependent !== true
    || value.claims.deltaOnly !== true
    || value.claims.heuristicOnly !== true
    || value.claims.storesInputText !== false
    || value.claims.storesOutputText !== false
    || value.claims.storesMatchedText !== false
    || value.claims.isAiDetector !== false
    || value.claims.claimsAuthorshipDetection !== false
    || value.claims.claimsDetectionRate !== false
    || value.claims.claimsSemanticEquivalence !== false
  ) return null;
  const expectedBlockingIssueCodes = [
    ...(contextScope === "invalid" ? ["source_pattern_profile_invalid"] : []),
    ...(openingFamilyDelta.blockingPatternCount > 0 ? ["repeated_opening_family_introduced"] : []),
    ...(sentenceSkeletonDelta.blockingPatternCount > 0 ? ["repeated_sentence_skeleton_introduced"] : []),
    ...boundaryIssueCodes,
  ];
  const expectedAdvisoryIssueCodes = [
    ...(openingFamilyDelta.introducedPatternCount > 0 && openingFamilyDelta.blockingPatternCount === 0
      ? ["opening_family_delta_observed"]
      : []),
    ...(sentenceSkeletonDelta.introducedPatternCount > 0 && sentenceSkeletonDelta.blockingPatternCount === 0
      ? ["sentence_skeleton_delta_observed"]
      : []),
  ];
  if (
    !stringListsEqual(blockingIssueCodes, expectedBlockingIssueCodes)
    || !stringListsEqual(advisoryIssueCodes, expectedAdvisoryIssueCodes)
  ) return null;
  return {
    schema: SOURCE_RELATIVE_STYLE_DELTA_SCHEMA,
    schemaVersion: SOURCE_RELATIVE_STYLE_DELTA_VERSION,
    ready,
    passed,
    contextScope,
    binding: { sourceProfileSha256, baselineTextSha256, candidateTextSha256 },
    openingFamilyDelta,
    sentenceSkeletonDelta,
    sentenceBoundaryDelta: {
      inputSentenceCount,
      outputSentenceCount,
      inputShortSentenceCount,
      outputShortSentenceCount,
      collapseCount,
      fragmentIncrease,
      collapsed,
      fragmented,
      issueCodes: boundaryIssueCodes,
    },
    blockingIssueCodes,
    advisoryIssueCodes,
    claims: {
      providerIndependent: true,
      deltaOnly: true,
      heuristicOnly: true,
      storesInputText: false,
      storesOutputText: false,
      storesMatchedText: false,
      isAiDetector: false,
      claimsAuthorshipDetection: false,
      claimsDetectionRate: false,
      claimsSemanticEquivalence: false,
    },
  };
}

function normalizeDocumentPatternSummary(
  value: unknown,
  kind: "opening_family" | "sentence_skeleton",
): SourceRelativeDocumentDeltaEvidence["openingFamilyDelta"] | null {
  if (!isRecord(value)) return null;
  const introducedPatternCount = boundedInteger(value.introducedPatternCount, 0, 1_000_000);
  const blockingPatternCount = boundedInteger(value.blockingPatternCount, 0, 1_000_000);
  const maxIntroducedCount = boundedInteger(value.maxIntroducedCount, 0, 1_000_000);
  const maxResultCount = boundedInteger(value.maxResultCount, 0, 1_000_000);
  const expectedIssue = kind === "opening_family"
    ? "repeated_opening_family_introduced"
    : "repeated_sentence_skeleton_introduced";
  const issueCodes = normalizeKnownCodes(value.issueCodes, new Set([expectedIssue]), 1);
  if (
    introducedPatternCount === null
    || blockingPatternCount === null
    || maxIntroducedCount === null
    || maxResultCount === null
    || issueCodes === null
    || !Array.isArray(value.patterns)
    || value.patterns.length > 24
    || introducedPatternCount < value.patterns.length
    || (introducedPatternCount <= 24 && introducedPatternCount !== value.patterns.length)
    || (blockingPatternCount > 0) !== issueCodes.includes(expectedIssue)
  ) return null;
  const patterns: SourceRelativeDocumentDeltaEvidence["openingFamilyDelta"]["patterns"] = [];
  const patternIds: string[] = [];
  let visibleBlockingPatternCount = 0;
  let visibleMaxIntroducedCount = 0;
  let visibleMaxResultCount = 0;
  for (const rawPattern of value.patterns) {
    if (!isRecord(rawPattern) || rawPattern.kind !== kind) return null;
    const baselineCount = boundedInteger(rawPattern.baselineCount, 0, 1_000_000);
    const resultCount = boundedInteger(rawPattern.resultCount, 0, 1_000_000);
    const introducedCount = boundedInteger(rawPattern.introducedCount, 1, 1_000_000);
    const familyId = kind === "opening_family" ? boundedString(rawPattern.familyId, 80) : null;
    const patternSha256 = kind === "sentence_skeleton" ? sha256(rawPattern.patternSha256) : null;
    if (
      baselineCount === null
      || resultCount === null
      || introducedCount === null
      || introducedCount !== Math.max(0, resultCount - baselineCount)
      || (kind === "opening_family" && (!familyId || !OPENING_FAMILY_IDS.has(familyId)))
      || (kind === "sentence_skeleton" && !patternSha256)
    ) return null;
    patterns.push({
      kind,
      baselineCount,
      resultCount,
      introducedCount,
      ...(familyId ? { familyId } : {}),
      ...(patternSha256 ? { patternSha256 } : {}),
    });
    const patternId = familyId || patternSha256;
    if (!patternId) return null;
    patternIds.push(patternId);
    visibleMaxIntroducedCount = Math.max(visibleMaxIntroducedCount, introducedCount);
    visibleMaxResultCount = Math.max(visibleMaxResultCount, resultCount);
    if (resultCount >= 4 && introducedCount >= 1) visibleBlockingPatternCount += 1;
  }
  if (
    patternIds.some((patternId, index) => index > 0 && patternIds[index - 1] >= patternId)
    || blockingPatternCount > introducedPatternCount
    || visibleBlockingPatternCount > blockingPatternCount
    || (introducedPatternCount <= 24 && visibleBlockingPatternCount !== blockingPatternCount)
    || maxIntroducedCount < visibleMaxIntroducedCount
    || maxResultCount < visibleMaxResultCount
    || (introducedPatternCount === 0 && maxIntroducedCount !== 0)
  ) return null;
  return { introducedPatternCount, blockingPatternCount, maxIntroducedCount, maxResultCount, issueCodes, patterns };
}

function normalizeSourceRelativeDocumentDelta(value: unknown): SourceRelativeDocumentDeltaEvidence | null {
  if (!isRecord(value) || !isRecord(value.binding)) return null;
  const passed = exactBoolean(value.passed);
  const chunkCount = boundedInteger(value.binding.chunkCount, 0, 100_000);
  const baselineProfileSha256 = sha256(value.binding.baselineProfileSha256);
  const resultProfileSha256 = sha256(value.binding.resultProfileSha256);
  const baselineChunksSha256 = sha256(value.binding.baselineChunksSha256);
  const resultChunksSha256 = sha256(value.binding.resultChunksSha256);
  const blockingIssueCodes = normalizeKnownCodes(value.blockingIssueCodes, SOURCE_RELATIVE_BLOCKING_CODES, 4);
  const advisoryIssueCodes = normalizeKnownCodes(
    value.advisoryIssueCodes,
    new Set(["document_opening_family_delta_observed", "document_sentence_skeleton_delta_observed"]),
    2,
  );
  const openingFamilyDelta = normalizeDocumentPatternSummary(value.openingFamilyDelta, "opening_family");
  const sentenceSkeletonDelta = normalizeDocumentPatternSummary(value.sentenceSkeletonDelta, "sentence_skeleton");
  if (
    value.schema !== SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA
    || value.schemaVersion !== SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION
    || value.ready !== true
    || passed === null
    || chunkCount === null
    || !baselineProfileSha256
    || !resultProfileSha256
    || !baselineChunksSha256
    || !resultChunksSha256
    || blockingIssueCodes === null
    || advisoryIssueCodes === null
    || passed !== (blockingIssueCodes.length === 0)
    || !openingFamilyDelta
    || !sentenceSkeletonDelta
    || !isRecord(value.claims)
    || value.claims.providerIndependent !== true
    || value.claims.deltaOnly !== true
    || value.claims.heuristicOnly !== true
    || value.claims.storesInputText !== false
    || value.claims.storesOutputText !== false
    || value.claims.storesMatchedText !== false
    || value.claims.preservesChunkBoundaries !== true
    || value.claims.isAiDetector !== false
    || value.claims.claimsAuthorshipDetection !== false
    || value.claims.claimsDetectionRate !== false
    || value.claims.claimsSemanticEquivalence !== false
  ) return null;
  const expectedBlockingIssueCodes = [
    ...(openingFamilyDelta.blockingPatternCount > 0 ? ["repeated_opening_family_introduced"] : []),
    ...(sentenceSkeletonDelta.blockingPatternCount > 0 ? ["repeated_sentence_skeleton_introduced"] : []),
  ];
  const expectedAdvisoryIssueCodes = [
    ...(openingFamilyDelta.introducedPatternCount > 0 && openingFamilyDelta.blockingPatternCount === 0
      ? ["document_opening_family_delta_observed"]
      : []),
    ...(sentenceSkeletonDelta.introducedPatternCount > 0 && sentenceSkeletonDelta.blockingPatternCount === 0
      ? ["document_sentence_skeleton_delta_observed"]
      : []),
  ];
  if (
    !stringListsEqual(blockingIssueCodes, expectedBlockingIssueCodes)
    || !stringListsEqual(advisoryIssueCodes, expectedAdvisoryIssueCodes)
  ) return null;
  return {
    schema: SOURCE_RELATIVE_DOCUMENT_DELTA_SCHEMA,
    schemaVersion: SOURCE_RELATIVE_DOCUMENT_DELTA_VERSION,
    ready: true,
    passed,
    binding: { chunkCount, baselineProfileSha256, resultProfileSha256, baselineChunksSha256, resultChunksSha256 },
    openingFamilyDelta,
    sentenceSkeletonDelta,
    blockingIssueCodes,
    advisoryIssueCodes,
    claims: {
      providerIndependent: true,
      deltaOnly: true,
      heuristicOnly: true,
      storesInputText: false,
      storesOutputText: false,
      storesMatchedText: false,
      preservesChunkBoundaries: true,
      isAiDetector: false,
      claimsAuthorshipDetection: false,
      claimsDetectionRate: false,
      claimsSemanticEquivalence: false,
    },
  };
}

function normalizeCandidate(value: unknown): CandidateSelectionCandidate | null {
  if (!isRecord(value)) return null;
  const candidateId = boundedString(value.candidateId, 80);
  const origin = value.origin === "baseline" || value.origin === "model" ? value.origin : null;
  const attempt = boundedInteger(value.attempt, 0, MAX_MODEL_ATTEMPTS);
  const textSha256 = sha256(value.textSha256);
  const charCount = boundedInteger(value.charCount, 0, 10_000_000);
  const changedFromBaseline = exactBoolean(value.changedFromBaseline);
  const hardValid = exactBoolean(value.hardValid);
  const hardValidationIssueCodes = value.hardValidationIssueCodes === undefined
    ? []
    : normalizeStringList(value.hardValidationIssueCodes);
  const hasReadabilityEvidence = value.academicReadabilityDelta !== undefined
    || value.readabilityGuardPassed !== undefined
    || value.readabilityIssueCodes !== undefined;
  const academicReadabilityDelta = hasReadabilityEvidence
    ? normalizeAcademicReadabilityDelta(value.academicReadabilityDelta)
    : null;
  const readabilityGuardPassed = hasReadabilityEvidence
    ? exactBoolean(value.readabilityGuardPassed)
    : null;
  const readabilityIssueCodes = hasReadabilityEvidence
    ? normalizeStringList(value.readabilityIssueCodes, 8)
    : null;
  const sourceRelativeStyleDelta = normalizeSourceRelativeStyleDelta(value.sourceRelativeStyleDelta);
  const sourceRelativeStyleGuardPassed = exactBoolean(value.sourceRelativeStyleGuardPassed);
  const factualGuardPassed = exactBoolean(value.factualGuardPassed);
  const factualIssueCodes = normalizeStringList(value.factualIssueCodes);
  const retention = normalizeLexicalRetentionProxy(value.deterministicLexicalRetentionProxy);
  const direction = normalizeDirection(value.sameDimensionDirection);
  const stylePenalty = value.stylePenalty === null ? null : finiteNumber(value.stylePenalty);
  const safetyEligible = exactBoolean(value.safetyEligible);
  const rejectionReasonCodes = normalizeStringList(value.rejectionReasonCodes);
  if (
    !candidateId
    || !origin
    || attempt === null
    || !textSha256
    || charCount === null
    || changedFromBaseline === null
    || hardValid === null
    || hardValidationIssueCodes === null
    || !hasReadabilityEvidence
    || (hasReadabilityEvidence && (
      !academicReadabilityDelta
      || readabilityGuardPassed === null
      || readabilityIssueCodes === null
      || academicReadabilityDelta.ok !== readabilityGuardPassed
      || academicReadabilityDelta.issueCodes.length !== readabilityIssueCodes.length
      || academicReadabilityDelta.issueCodes.some((code, index) => code !== readabilityIssueCodes[index])
      || (readabilityGuardPassed && readabilityIssueCodes.length > 0)
      || (!readabilityGuardPassed && readabilityIssueCodes.length === 0)
    ))
    || !sourceRelativeStyleDelta
    || sourceRelativeStyleGuardPassed === null
    || sourceRelativeStyleDelta.passed !== sourceRelativeStyleGuardPassed
    || sourceRelativeStyleDelta.binding.candidateTextSha256 !== textSha256
    || factualGuardPassed === null
    || factualIssueCodes === null
    || !retention
    || !direction
    || (value.stylePenalty !== null && stylePenalty === null)
    || safetyEligible === null
    || rejectionReasonCodes === null
    || (origin === "baseline" && attempt !== 0)
    || (origin === "model" && attempt < 1)
    || (origin === "baseline" && (candidateId !== "baseline" || changedFromBaseline))
    || (hardValid && hardValidationIssueCodes.length > 0)
    || (factualGuardPassed && factualIssueCodes.length > 0)
    || (!factualGuardPassed && factualIssueCodes.length === 0)
    || (safetyEligible && (
      !hardValid
      || readabilityGuardPassed === false
      || !sourceRelativeStyleGuardPassed
      || !factualGuardPassed
      || retention.score < retention.minimumScore
    ))
  ) {
    return null;
  }
  return {
    candidateId,
    origin,
    attempt,
    textSha256,
    charCount,
    changedFromBaseline,
    hardValid,
    hardValidationIssueCodes,
    ...(academicReadabilityDelta && readabilityGuardPassed !== null && readabilityIssueCodes
      ? { academicReadabilityDelta, readabilityGuardPassed, readabilityIssueCodes }
      : {}),
    sourceRelativeStyleDelta,
    sourceRelativeStyleGuardPassed,
    factualGuardPassed,
    factualIssueCodes,
    deterministicLexicalRetentionProxy: retention,
    sameDimensionDirection: direction,
    stylePenalty,
    safetyEligible,
    rejectionReasonCodes,
  };
}

export function normalizeChunkCandidateSelection(value: unknown): ChunkCandidateSelection | null {
  if (!isRecord(value)) return null;
  if (value.schema !== CANDIDATE_SELECTION_SCHEMA || value.schemaVersion !== CANDIDATE_SELECTION_VERSION) return null;
  const decision = value.decision === "generated_selected"
    || value.decision === "preserved_baseline"
    || value.decision === "hard_failure_preserved_baseline"
    ? value.decision
    : null;
  const publishedRewrite = exactBoolean(value.publishedRewrite);
  const runFailed = exactBoolean(value.runFailed);
  const selectedCandidateId = boundedString(value.selectedCandidateId, 80);
  const selectedOrigin = value.selectedOrigin === "baseline" || value.selectedOrigin === "model"
    ? value.selectedOrigin
    : null;
  const selectedTextSha256 = sha256(value.selectedTextSha256);
  const resultTextSha256 = sha256(value.resultTextSha256);
  const publishedTextSha256 = value.publishedTextSha256 === undefined
    ? undefined
    : sha256(value.publishedTextSha256);
  const selectedCharCount = boundedInteger(value.selectedCharCount, 0, 10_000_000);
  const resultCharCount = boundedInteger(value.resultCharCount, 0, 10_000_000);
  const publishedCharCount = value.publishedCharCount === undefined
    ? undefined
    : boundedInteger(value.publishedCharCount, 0, 10_000_000);
  const postprocessApplied = exactBoolean(value.postprocessApplied);
  const resultSourceRelativeStyleDelta = normalizeSourceRelativeStyleDelta(
    value.resultSourceRelativeStyleDelta,
  );
  const reasonCodes = normalizeStringList(value.reasonCodes);
  const candidateLimit = boundedInteger(value.candidateLimit, 1, MAX_CANDIDATES);
  const modelAttemptLimit = boundedInteger(value.modelAttemptLimit, 1, MAX_MODEL_ATTEMPTS);
  const modelAttemptCount = boundedInteger(value.modelAttemptCount, 0, MAX_MODEL_ATTEMPTS);
  const conditionalRetryCount = boundedInteger(value.conditionalRetryCount, 0, 1);
  const rawRetentionAssessment = isRecord(value.retentionAssessment) ? value.retentionAssessment : null;
  const retentionName = rawRetentionAssessment?.name === undefined
    ? null
    : boundedString(rawRetentionAssessment.name, 120);
  if (
    !decision
    || publishedRewrite === null
    || runFailed === null
    || !selectedCandidateId
    || !selectedOrigin
    || !selectedTextSha256
    || !resultTextSha256
    || selectedCharCount === null
    || resultCharCount === null
    || postprocessApplied === null
    || !resultSourceRelativeStyleDelta
    || (publishedRewrite && !resultSourceRelativeStyleDelta.passed)
    || (!resultSourceRelativeStyleDelta.passed
      && resultSourceRelativeStyleDelta.contextScope !== "invalid")
    || resultSourceRelativeStyleDelta.binding.candidateTextSha256 !== resultTextSha256
    || reasonCodes === null
    || candidateLimit === null
    || modelAttemptLimit === null
    || modelAttemptCount === null
    || conditionalRetryCount === null
    || !rawRetentionAssessment
    || (rawRetentionAssessment.name !== undefined && !retentionName)
    || rawRetentionAssessment.usesEmbedding !== false
    || rawRetentionAssessment.usesModel !== false
    || rawRetentionAssessment.claimsSemanticEquivalence !== false
    || rawRetentionAssessment.isAiDetector !== false
    || rawRetentionAssessment.claimsDetectionRate !== false
    || !Array.isArray(value.candidates)
    || value.candidates.length < 1
    || value.candidates.length > candidateLimit
    || modelAttemptCount > modelAttemptLimit
    || conditionalRetryCount > modelAttemptCount
    || (runFailed && publishedRewrite)
    || (publishedRewrite && (
      !publishedTextSha256
      || publishedTextSha256 !== resultTextSha256
      || publishedCharCount === undefined
      || publishedCharCount === null
      || publishedCharCount !== resultCharCount
    ))
    || (!publishedRewrite && (
      publishedTextSha256 !== undefined
      || publishedCharCount !== undefined
      || postprocessApplied
    ))
    || (decision === "generated_selected" && (!publishedRewrite || runFailed || selectedOrigin !== "model"))
    || (decision === "preserved_baseline" && (publishedRewrite || runFailed || selectedOrigin !== "baseline"))
    || (decision === "hard_failure_preserved_baseline" && (publishedRewrite || !runFailed || selectedOrigin !== "baseline"))
  ) {
    return null;
  }
  const candidates = value.candidates.map(normalizeCandidate);
  if (candidates.some((candidate) => candidate === null)) return null;
  const normalizedCandidates = candidates as CandidateSelectionCandidate[];
  const candidateIds = normalizedCandidates.map((candidate) => candidate.candidateId);
  const baselineCandidates = normalizedCandidates.filter((candidate) => candidate.origin === "baseline");
  const modelCandidates = normalizedCandidates.filter((candidate) => candidate.origin === "model");
  const selected = normalizedCandidates.find((candidate) => candidate.candidateId === selectedCandidateId);
  const baseline = baselineCandidates[0];
  if (
    new Set(candidateIds).size !== candidateIds.length
    || baselineCandidates.length !== 1
    || modelCandidates.length !== modelAttemptCount
    || !selected
    || !baseline
    || selected.origin !== selectedOrigin
    || selected.textSha256 !== selectedTextSha256
    || selected.charCount !== selectedCharCount
    || baseline.sourceRelativeStyleDelta.binding.baselineTextSha256 !== baseline.textSha256
    || baseline.sourceRelativeStyleDelta.binding.candidateTextSha256 !== baseline.textSha256
    || (!baseline.sourceRelativeStyleDelta.passed
      && baseline.sourceRelativeStyleDelta.contextScope !== "invalid")
    || normalizedCandidates.some((candidate) => (
      candidate.sourceRelativeStyleDelta.binding.baselineTextSha256
        !== baseline.sourceRelativeStyleDelta.binding.baselineTextSha256
      || candidate.sourceRelativeStyleDelta.contextScope
        !== baseline.sourceRelativeStyleDelta.contextScope
      || candidate.sourceRelativeStyleDelta.binding.sourceProfileSha256
        !== baseline.sourceRelativeStyleDelta.binding.sourceProfileSha256
    ))
    || resultSourceRelativeStyleDelta.binding.baselineTextSha256
      !== baseline.sourceRelativeStyleDelta.binding.baselineTextSha256
    || resultSourceRelativeStyleDelta.contextScope !== baseline.sourceRelativeStyleDelta.contextScope
    || resultSourceRelativeStyleDelta.binding.sourceProfileSha256
      !== baseline.sourceRelativeStyleDelta.binding.sourceProfileSha256
    || (!postprocessApplied && (
      selectedTextSha256 !== resultTextSha256
      || selectedCharCount !== resultCharCount
    ))
    || (publishedRewrite && (
      selectedOrigin !== "model"
      || !selected.changedFromBaseline
      || !selected.hardValid
      || !selected.safetyEligible
      || !selected.sourceRelativeStyleGuardPassed
    ))
    || (!publishedRewrite && selectedOrigin === "model" && decision === "generated_selected")
  ) {
    return null;
  }
  let documentArbitration: ChunkCandidateSelection["documentArbitration"];
  if (value.documentArbitration !== undefined) {
    if (!isRecord(value.documentArbitration)) return null;
    const rejectedDocumentDelta = normalizeSourceRelativeDocumentDelta(
      value.documentArbitration.rejectedDocumentDelta,
    );
    if (
      value.documentArbitration.decision !== "baseline_preserved"
      || value.documentArbitration.reasonCode !== "document_pattern_delta_accumulation_blocked"
      || !rejectedDocumentDelta
      || rejectedDocumentDelta.passed
      || publishedRewrite
      || !reasonCodes.includes("document_pattern_delta_accumulation_blocked")
    ) return null;
    documentArbitration = {
      decision: "baseline_preserved",
      reasonCode: "document_pattern_delta_accumulation_blocked",
      rejectedDocumentDelta,
    };
  }
  return {
    schema: CANDIDATE_SELECTION_SCHEMA,
    schemaVersion: CANDIDATE_SELECTION_VERSION,
    decision,
    publishedRewrite,
    runFailed,
    selectedCandidateId,
    selectedOrigin,
    selectedTextSha256,
    resultTextSha256,
    ...(publishedTextSha256 ? { publishedTextSha256 } : {}),
    selectedCharCount,
    resultCharCount,
    ...(publishedCharCount !== undefined && publishedCharCount !== null ? { publishedCharCount } : {}),
    postprocessApplied,
    resultSourceRelativeStyleDelta,
    reasonCodes,
    modelAttemptCount,
    conditionalRetryCount,
    candidateLimit,
    modelAttemptLimit,
    retentionAssessment: {
      ...(retentionName ? { name: retentionName } : {}),
      usesEmbedding: false,
      usesModel: false,
      claimsSemanticEquivalence: false,
      isAiDetector: false,
      claimsDetectionRate: false,
    },
    candidates: normalizedCandidates,
    ...(documentArbitration ? { documentArbitration } : {}),
  };
}
