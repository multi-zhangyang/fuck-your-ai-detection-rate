import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = resolve(ROOT, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function typeScriptModuleUrl(relativePath, replacements = {}) {
  let source = readFileSync(resolve(APP_DIR, relativePath), "utf8");
  for (const [before, after] of Object.entries(replacements)) {
    source = source.replaceAll(before, after);
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

function javascriptModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

function clone(value) {
  return structuredClone(value);
}

function containsExactKey(value, forbiddenKeys) {
  if (Array.isArray(value)) return value.some((item) => containsExactKey(item, forbiddenKeys));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, item]) => (
    forbiddenKeys.has(key) || containsExactKey(item, forbiddenKeys)
  ));
}

const normalizerUrl = typeScriptModuleUrl("src/lib/candidateSelectionEvidence.ts");
const { normalizeChunkCandidateSelection } = await import(normalizerUrl);
const failedAttemptNormalizerUrl = typeScriptModuleUrl("src/lib/failedAttemptEvidence.ts");
const evidenceUrl = typeScriptModuleUrl("src/lib/chunkDecisionEvidence.ts", {
  "@/lib/candidateSelectionEvidence": normalizerUrl,
  "@/lib/failedAttemptEvidence": failedAttemptNormalizerUrl,
});
const { deriveChunkDecisionEvidence } = await import(evidenceUrl);
const exportHelpersStubUrl = javascriptModuleUrl(`
  export function formatBatchRerunSummary(actionLabel, successCount, totalCount, failures, suffix = "") {
    return [actionLabel + " " + successCount + "/" + totalCount, failures.length ? "失败 " + failures.length : "", suffix]
      .filter(Boolean)
      .join("；");
  }
`);
const noticeUrl = typeScriptModuleUrl("src/lib/batchRerunNoticeHelpers.ts", {
  "@/lib/candidateSelectionEvidence": normalizerUrl,
  "@/lib/exportHelpers": exportHelpersStubUrl,
});
const {
  buildPreservedAttemptNotice,
  buildPreservedCandidateSelectionNotice,
  planBatchRerunFeedback,
} = await import(noticeUrl);

const BASELINE_HASH = "a".repeat(64);
const MODEL_HASH = "b".repeat(64);
const PROFILE_HASH = "c".repeat(64);
const OTHER_PROFILE_HASH = "d".repeat(64);
const RESULT_PROFILE_HASH = "e".repeat(64);
const CHUNKS_HASH = "f".repeat(64);

function lexicalRetention(score = 0.94) {
  return {
    name: "deterministic-lexical-retention-proxy",
    score,
    minimumScore: 0.72,
    sourceCoverage: 0.93,
    outputPrecision: 0.91,
    lengthSimilarity: 0.96,
    usesEmbedding: false,
    usesModel: false,
    claimsSemanticEquivalence: false,
    isAiDetector: false,
    claimsDetectionRate: false,
  };
}

function evidenceClaims() {
  return {
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
  };
}

function stylePatternSummary(kind, scope, {
  familyId = "",
  patternSha256 = "",
  blocking = false,
} = {}) {
  const patternId = kind === "opening_family" ? familyId : patternSha256;
  if (!patternId) {
    return {
      introducedPatternCount: 0,
      blockingPatternCount: 0,
      maxIntroducedCount: 0,
      maxDocumentAfterCount: 0,
      issueCodes: [],
      patterns: [],
    };
  }
  const inputCount = 0;
  const outputCount = blocking ? 3 : 1;
  const introducedCount = outputCount;
  const documentBeforeCount = scope === "document" ? (blocking ? 1 : 0) : null;
  const documentAfterCount = scope === "document"
    ? documentBeforeCount - inputCount + outputCount
    : null;
  const documentIntroducedCount = scope === "document"
    ? Math.max(0, documentAfterCount - documentBeforeCount)
    : null;
  const issueCode = kind === "opening_family"
    ? "repeated_opening_family_introduced"
    : "repeated_sentence_skeleton_introduced";
  return {
    introducedPatternCount: 1,
    blockingPatternCount: blocking ? 1 : 0,
    maxIntroducedCount: introducedCount,
    maxDocumentAfterCount: documentAfterCount ?? 0,
    issueCodes: blocking ? [issueCode] : [],
    patterns: [{
      kind,
      inputCount,
      outputCount,
      introducedCount,
      documentBeforeCount,
      documentAfterCount,
      documentIntroducedCount,
      ...(kind === "opening_family" ? { familyId } : { patternSha256 }),
    }],
  };
}

function sourceRelativeEvidence(candidateTextSha256, {
  scope = "document",
  baselineTextSha256 = BASELINE_HASH,
  sourceProfileSha256 = scope === "document" ? PROFILE_HASH : "",
  openingFamilyId = "",
  openingBlocking = false,
  passedOverride,
  blockingIssueCodesOverride,
  advisoryIssueCodesOverride,
} = {}) {
  const openingFamilyDelta = stylePatternSummary("opening_family", scope, {
    familyId: openingFamilyId,
    blocking: openingBlocking,
  });
  const sentenceSkeletonDelta = stylePatternSummary("sentence_skeleton", scope);
  const boundaryIssueCodes = [];
  const expectedBlockingCodes = [
    ...(scope === "invalid" ? ["source_pattern_profile_invalid"] : []),
    ...(openingBlocking ? ["repeated_opening_family_introduced"] : []),
    ...boundaryIssueCodes,
  ];
  const blockingIssueCodes = blockingIssueCodesOverride ?? expectedBlockingCodes;
  const advisoryIssueCodes = advisoryIssueCodesOverride ?? [
    ...(openingFamilyId && !openingBlocking ? ["opening_family_delta_observed"] : []),
  ];
  return {
    schema: "fyadr.source-relative-style-delta",
    schemaVersion: 1,
    ready: scope !== "invalid",
    passed: passedOverride ?? blockingIssueCodes.length === 0,
    contextScope: scope,
    binding: {
      sourceProfileSha256,
      baselineTextSha256,
      candidateTextSha256,
    },
    openingFamilyDelta,
    sentenceSkeletonDelta,
    sentenceBoundaryDelta: {
      inputSentenceCount: 2,
      outputSentenceCount: 2,
      inputShortSentenceCount: 0,
      outputShortSentenceCount: 0,
      collapseCount: 0,
      fragmentIncrease: 0,
      collapsed: false,
      fragmented: false,
      issueCodes: boundaryIssueCodes,
    },
    blockingIssueCodes,
    advisoryIssueCodes,
    claims: evidenceClaims(),
  };
}

function readabilityEvidence(ok = true, issueCodes = []) {
  return {
    schema: "fyadr.academic-readability-delta",
    schemaVersion: 1,
    ok,
    issueCodes,
  };
}

function candidate({
  candidateId,
  origin,
  attempt,
  textSha256,
  sourceRelativeStyleDelta,
  changedFromBaseline = origin === "model",
  sourceRelativeStyleGuardPassed = sourceRelativeStyleDelta.passed,
  safetyEligible = sourceRelativeStyleGuardPassed,
  rejectionReasonCodes = [],
}) {
  return {
    candidateId,
    origin,
    attempt,
    textSha256,
    charCount: 100,
    changedFromBaseline,
    hardValid: true,
    hardValidationError: "",
    hardValidationIssueCodes: [],
    academicReadabilityDelta: readabilityEvidence(),
    readabilityGuardPassed: true,
    readabilityIssueCodes: [],
    sourceRelativeStyleDelta,
    sourceRelativeStyleGuardPassed,
    factualGuardPassed: true,
    factualIssueCodes: [],
    deterministicLexicalRetentionProxy: lexicalRetention(),
    sameDimensionDirection: {
      dimensionId: "transitions",
      direction: "decrease_connector_density",
      primaryMetric: "connectorDensity",
      before: origin === "baseline" ? 0.52 : 0.52,
      after: origin === "baseline" ? 0.52 : 0.31,
      ok: origin === "model",
      satisfied: origin === "model",
      note: origin === "model" ? "公式化连接词信号下降。" : "baseline。",
    },
    stylePenalty: origin === "baseline" ? 4.2 : 3.1,
    safetyEligible,
    rejectionReasonCodes,
  };
}

function baselineCandidate(sourceRelativeStyleDelta = sourceRelativeEvidence(BASELINE_HASH)) {
  return candidate({
    candidateId: "baseline",
    origin: "baseline",
    attempt: 0,
    textSha256: BASELINE_HASH,
    sourceRelativeStyleDelta,
    changedFromBaseline: false,
    safetyEligible: sourceRelativeStyleDelta.passed,
  });
}

function modelCandidate(sourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH), overrides = {}) {
  return candidate({
    candidateId: "model-attempt-1",
    origin: "model",
    attempt: 1,
    textSha256: MODEL_HASH,
    sourceRelativeStyleDelta,
    ...overrides,
  });
}

function generatedSelection() {
  const baseline = baselineCandidate();
  const model = modelCandidate();
  return {
    schema: "fyadr.chunk-candidate-selection",
    schemaVersion: 2,
    decision: "generated_selected",
    publishedRewrite: true,
    runFailed: false,
    selectedCandidateId: model.candidateId,
    selectedOrigin: "model",
    selectedTextSha256: MODEL_HASH,
    resultTextSha256: MODEL_HASH,
    publishedTextSha256: MODEL_HASH,
    selectedCharCount: 100,
    resultCharCount: 100,
    publishedCharCount: 100,
    postprocessApplied: false,
    resultSourceRelativeStyleDelta: sourceRelativeEvidence(MODEL_HASH),
    reasonCodes: ["same_dimension_converged"],
    modelAttemptCount: 1,
    conditionalRetryCount: 0,
    candidateLimit: 3,
    modelAttemptLimit: 2,
    retentionAssessment: {
      name: "deterministic-lexical-retention-proxy",
      usesEmbedding: false,
      usesModel: false,
      claimsSemanticEquivalence: false,
      isAiDetector: false,
      claimsDetectionRate: false,
    },
    candidates: [baseline, model],
  };
}

function invalidProfilePreservedSelection() {
  const baselineDelta = sourceRelativeEvidence(BASELINE_HASH, { scope: "invalid" });
  const modelDelta = sourceRelativeEvidence(MODEL_HASH, { scope: "invalid" });
  const baseline = baselineCandidate(baselineDelta);
  const model = modelCandidate(modelDelta, {
    sourceRelativeStyleGuardPassed: false,
    safetyEligible: false,
    rejectionReasonCodes: ["source_relative_style_delta_failed"],
  });
  return {
    ...generatedSelection(),
    decision: "preserved_baseline",
    publishedRewrite: false,
    selectedCandidateId: "baseline",
    selectedOrigin: "baseline",
    selectedTextSha256: BASELINE_HASH,
    resultTextSha256: BASELINE_HASH,
    selectedCharCount: 100,
    resultCharCount: 100,
    postprocessApplied: false,
    resultSourceRelativeStyleDelta: clone(baselineDelta),
    reasonCodes: ["source_pattern_profile_invalid", "no_safe_changed_generated_candidate"],
    candidates: [baseline, model],
    publishedTextSha256: undefined,
    publishedCharCount: undefined,
  };
}

function failedDocumentDelta() {
  return {
    schema: "fyadr.source-relative-document-style-delta",
    schemaVersion: 1,
    ready: true,
    passed: false,
    binding: {
      chunkCount: 2,
      baselineProfileSha256: PROFILE_HASH,
      resultProfileSha256: RESULT_PROFILE_HASH,
      baselineChunksSha256: CHUNKS_HASH,
      resultChunksSha256: OTHER_PROFILE_HASH,
    },
    openingFamilyDelta: {
      introducedPatternCount: 1,
      blockingPatternCount: 1,
      maxIntroducedCount: 4,
      maxResultCount: 4,
      issueCodes: ["repeated_opening_family_introduced"],
      patterns: [{
        kind: "opening_family",
        familyId: "cn.based_on",
        baselineCount: 0,
        resultCount: 4,
        introducedCount: 4,
      }],
    },
    sentenceSkeletonDelta: {
      introducedPatternCount: 0,
      blockingPatternCount: 0,
      maxIntroducedCount: 0,
      maxResultCount: 0,
      issueCodes: [],
      patterns: [],
    },
    blockingIssueCodes: ["repeated_opening_family_introduced"],
    advisoryIssueCodes: [],
    claims: {
      ...evidenceClaims(),
      preservesChunkBoundaries: true,
    },
  };
}

function documentArbitrationPreservedSelection() {
  const baseline = baselineCandidate();
  const model = modelCandidate();
  return {
    ...generatedSelection(),
    decision: "preserved_baseline",
    publishedRewrite: false,
    selectedCandidateId: "baseline",
    selectedOrigin: "baseline",
    selectedTextSha256: BASELINE_HASH,
    resultTextSha256: BASELINE_HASH,
    selectedCharCount: 100,
    resultCharCount: 100,
    postprocessApplied: false,
    resultSourceRelativeStyleDelta: sourceRelativeEvidence(BASELINE_HASH),
    reasonCodes: ["document_pattern_delta_accumulation_blocked"],
    candidates: [baseline, model],
    documentArbitration: {
      decision: "baseline_preserved",
      reasonCode: "document_pattern_delta_accumulation_blocked",
      rejectedDocumentDelta: failedDocumentDelta(),
    },
    publishedTextSha256: undefined,
    publishedCharCount: undefined,
  };
}

const validSelection = generatedSelection();
const normalizedValidSelection = normalizeChunkCandidateSelection(validSelection);
check(
  normalizedValidSelection?.schemaVersion === 2
  && normalizedValidSelection.publishedRewrite
  && normalizedValidSelection.candidates[1]?.sourceRelativeStyleGuardPassed,
  "a canonical v2 candidate-selection envelope with source-relative evidence normalizes",
);

check(
  normalizeChunkCandidateSelection({ ...validSelection, schemaVersion: 1 }) === null,
  "legacy v1 candidate-selection evidence is rejected instead of being guessed",
);

const missingSourceRelative = clone(validSelection);
delete missingSourceRelative.candidates[1].sourceRelativeStyleDelta;
check(
  normalizeChunkCandidateSelection(missingSourceRelative) === null,
  "a candidate without source-relative evidence is rejected",
);

const topLevelContradiction = clone(validSelection);
topLevelContradiction.candidates[1].sourceRelativeStyleDelta.blockingIssueCodes = [
  "repeated_opening_family_introduced",
];
check(
  normalizeChunkCandidateSelection(topLevelContradiction) === null,
  "passed=true with a top-level blocking code is rejected",
);

const nestedContradiction = clone(validSelection);
nestedContradiction.candidates[1].sourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH, {
  openingFamilyId: "cn.based_on",
  openingBlocking: true,
  passedOverride: true,
  blockingIssueCodesOverride: [],
  advisoryIssueCodesOverride: [],
});
nestedContradiction.candidates[1].sourceRelativeStyleGuardPassed = true;
check(
  normalizeChunkCandidateSelection(nestedContradiction) === null,
  "a forged top-level pass cannot hide a blocking pattern in nested evidence",
);

const selectedFailed = clone(validSelection);
selectedFailed.candidates[1].sourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH, {
  openingFamilyId: "cn.based_on",
  openingBlocking: true,
});
selectedFailed.candidates[1].sourceRelativeStyleGuardPassed = false;
selectedFailed.candidates[1].safetyEligible = false;
selectedFailed.candidates[1].rejectionReasonCodes = ["source_relative_style_delta_failed"];
const resultFailed = clone(validSelection);
resultFailed.resultSourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH, {
  openingFamilyId: "cn.based_on",
  openingBlocking: true,
});
check(
  normalizeChunkCandidateSelection(selectedFailed) === null
  && normalizeChunkCandidateSelection(resultFailed) === null,
  "published rewrites are rejected when either selected or result source-relative evidence failed",
);

const missingDocumentProfile = clone(validSelection);
missingDocumentProfile.candidates[1].sourceRelativeStyleDelta.binding.sourceProfileSha256 = "";
const forgedDocumentProfile = clone(validSelection);
forgedDocumentProfile.candidates[1].sourceRelativeStyleDelta.binding.sourceProfileSha256 = OTHER_PROFILE_HASH;
check(
  normalizeChunkCandidateSelection(missingDocumentProfile) === null
  && normalizeChunkCandidateSelection(forgedDocumentProfile) === null,
  "document-scope evidence requires one consistent non-empty source profile hash",
);

const localScopeWithProfile = clone(validSelection);
localScopeWithProfile.candidates[1].sourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH, {
  scope: "local",
  sourceProfileSha256: PROFILE_HASH,
});
check(
  normalizeChunkCandidateSelection(localScopeWithProfile) === null,
  "local-scope evidence cannot pretend to be bound to a document profile",
);

const invalidProfileSelection = invalidProfilePreservedSelection();
const normalizedInvalidProfileSelection = normalizeChunkCandidateSelection(invalidProfileSelection);
const invalidProfileView = deriveChunkDecisionEvidence({
  chunkId: "invalid-profile",
  paragraphIndex: 0,
  chunkIndex: 0,
  inputText: "原审核正文",
  outputText: "原审核正文",
  candidateSelection: invalidProfileSelection,
}, "source", false);
check(
  normalizedInvalidProfileSelection?.publishedRewrite === false
  && normalizedInvalidProfileSelection.resultSourceRelativeStyleDelta.contextScope === "invalid"
  && invalidProfileView?.candidateSelection?.candidates[0]?.documentImpactLabel.includes("未降级为本块判断"),
  "an invalid supplied profile remains a safe, explainable soft no-op instead of falling back silently",
);

const unknownOpeningFamily = clone(validSelection);
unknownOpeningFamily.candidates[1].sourceRelativeStyleDelta = sourceRelativeEvidence(MODEL_HASH, {
  openingFamilyId: "cn.unknown_family",
});
check(
  normalizeChunkCandidateSelection(unknownOpeningFamily) === null,
  "unknown opening-family enum values are rejected",
);

const resultHashContradiction = clone(validSelection);
resultHashContradiction.resultSourceRelativeStyleDelta.binding.candidateTextSha256 = OTHER_PROFILE_HASH;
const baselineHashContradiction = clone(validSelection);
baselineHashContradiction.candidates[1].sourceRelativeStyleDelta.binding.baselineTextSha256 = OTHER_PROFILE_HASH;
check(
  normalizeChunkCandidateSelection(resultHashContradiction) === null
  && normalizeChunkCandidateSelection(baselineHashContradiction) === null,
  "result and baseline hash contradictions fail closed",
);

const arbitrationSelection = documentArbitrationPreservedSelection();
const normalizedArbitration = normalizeChunkCandidateSelection(arbitrationSelection);
const arbitrationView = deriveChunkDecisionEvidence({
  chunkId: "document-arbitration",
  paragraphIndex: 0,
  chunkIndex: 1,
  inputText: "原稿",
  outputText: "原稿",
  candidateSelection: arbitrationSelection,
}, "source", false);
check(
  normalizedArbitration?.documentArbitration?.rejectedDocumentDelta.passed === false
  && arbitrationView?.candidateSelection?.reasonLabels.some((label) => label.includes("全文累计模式达到阻断线")),
  "failed document arbitration is normalized and shown with a stable Chinese reason",
);

const privateTextSelection = clone(validSelection);
privateTextSelection.inputText = "PRIVATE_INPUT_BODY";
privateTextSelection.outputText = "PRIVATE_OUTPUT_BODY";
privateTextSelection.candidates[1]._text = "PRIVATE_CANDIDATE_BODY";
privateTextSelection.candidates[1].candidateText = "PRIVATE_NESTED_BODY";
privateTextSelection.candidates[1].sourceRelativeStyleDelta.matchedText = "PRIVATE_MATCH";
privateTextSelection.documentPreview = "PRIVATE_PREVIEW";
const privateProjection = normalizeChunkCandidateSelection(privateTextSelection);
const privateProjectionJson = JSON.stringify(privateProjection);
check(
  privateProjection !== null
  && !privateProjectionJson.includes("PRIVATE_")
  && !containsExactKey(privateProjection, new Set([
    "_text",
    "inputText",
    "outputText",
    "candidateText",
    "matchedText",
    "documentPreview",
  ])),
  "private body fields never enter the normalized frontend projection",
);

const singleNotice = buildPreservedCandidateSelectionNotice(invalidProfileSelection);
const singlePlan = planBatchRerunFeedback({
  actionLabel: "重跑块 p0_c0",
  result: {
    successCount: 1,
    totalCount: 1,
    canceled: false,
    preservedAttempts: [{
      chunkId: "p0_c0",
      candidateSelectionAttempt: invalidProfileSelection,
    }],
  },
  failures: [],
});
check(
  singleNotice.includes("没有模型候选胜出")
  && singleNotice.includes("原审核正文、自定义文本与审核决定均保持不变")
  && singleNotice.includes("未把 baseline 冒充为新改写")
  && singleNotice.includes("全文原稿模式基线无效")
  && singlePlan.message.includes(singleNotice)
  && singlePlan.runtimeStep.includes("候选未胜出，原审核状态保持不变"),
  "single-chunk reruns consume candidateSelectionAttempt and explain a zero-mutation soft no-op",
);

const batchNotice = buildPreservedAttemptNotice({
  totalCount: 3,
  preservedAttempts: [
    { chunkId: "p0_c0", candidateSelectionAttempt: invalidProfileSelection },
    { chunkId: "p1_c0", candidateSelectionAttempt: arbitrationSelection },
  ],
});
check(
  batchNotice.includes("其中 2 块没有模型候选胜出")
  && batchNotice.includes("全文原稿模式基线无效")
  && batchNotice.includes("全文累计模式达到阻断线")
  && buildPreservedCandidateSelectionNotice(validSelection) === "",
  "batch soft-noop notices aggregate only valid unpublished v2 attempts and their stable reasons",
);

const evidencePanelSource = readFileSync(
  resolve(APP_DIR, "src/components/RewriteDiffDecisionEvidence.tsx"),
  "utf8",
);
const evidenceSource = readFileSync(
  resolve(APP_DIR, "src/lib/chunkDecisionEvidence.ts"),
  "utf8",
);
check(
  evidencePanelSource.includes("原稿模式")
  && evidencePanelSource.includes("全文影响")
  && evidencePanelSource.includes("句界稳定"),
  "the Diff candidate card renders original-pattern, document-impact, and sentence-boundary states",
);
check(
  evidenceSource.includes("不是第三方 AI 检测器、检测率或通过率")
  && evidenceSource.includes("不判断作者身份")
  && evidenceSource.includes("不证明语义等价"),
  "the UI explicitly states that source-relative heuristics are not an AI detector or detection rate",
);

const appSource = readFileSync(resolve(APP_DIR, "src/App.tsx"), "utf8");
const singleHandlerStart = appSource.indexOf("async function handleRerunChunk");
const singleHandlerEnd = appSource.indexOf("async function handleExecuteRateAuditStrategy", singleHandlerStart);
const singleHandlerSource = appSource.slice(singleHandlerStart, singleHandlerEnd);
const materializeSource = readFileSync(
  resolve(APP_DIR, "src/lib/batchRerunMaterializeHandlers.ts"),
  "utf8",
);
check(
  singleHandlerStart >= 0
  && singleHandlerSource.includes("buildSingleChunkBatchRerunTargets")
  && singleHandlerSource.includes("runBatchRerunTask")
  && materializeSource.includes("planBatchRerunFeedback({ actionLabel, result, failures, suffix })"),
  "the visible single-chunk action uses the resumable batch protocol and the same preserved-attempt formatter",
);

console.log(JSON.stringify({ ok: true, checks }, null, 2));
