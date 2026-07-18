import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = resolve(ROOT, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");

const files = {
  types: readFileSync(resolve(APP_DIR, "src/types/app.ts"), "utf8"),
  selectionNormalizer: readFileSync(resolve(APP_DIR, "src/lib/candidateSelectionEvidence.ts"), "utf8"),
  failedAttemptNormalizer: readFileSync(resolve(APP_DIR, "src/lib/failedAttemptEvidence.ts"), "utf8"),
  evidence: readFileSync(resolve(APP_DIR, "src/lib/chunkDecisionEvidence.ts"), "utf8"),
  evidencePanel: readFileSync(resolve(APP_DIR, "src/components/RewriteDiffDecisionEvidence.tsx"), "utf8"),
  chunkViewModel: readFileSync(resolve(APP_DIR, "src/lib/rewriteDiffPanelChunkViewModel.ts"), "utf8"),
  chunkCard: readFileSync(resolve(APP_DIR, "src/components/RewriteDiffChunkCard.tsx"), "utf8"),
  chunkAlerts: readFileSync(resolve(APP_DIR, "src/components/RewriteDiffChunkAlerts.tsx"), "utf8"),
  resultDecision: readFileSync(resolve(APP_DIR, "src/lib/resultCardDecisionHelpers.ts"), "utf8"),
  batchFailureFormatter: readFileSync(resolve(APP_DIR, "src/lib/exportRerunHelpers.ts"), "utf8"),
  scopePanel: readFileSync(resolve(APP_DIR, "src/components/ScopeDiagnosticsPanel.tsx"), "utf8"),
  scopeParts: readFileSync(resolve(APP_DIR, "src/components/ScopeDiagnosticsParts.tsx"), "utf8"),
  protectionHelpers: readFileSync(resolve(APP_DIR, "src/lib/protectionMapHelpers.ts"), "utf8"),
  rateDashboard: readFileSync(resolve(APP_DIR, "src/components/RateAuditDashboard.tsx"), "utf8"),
  rateCompat: readFileSync(resolve(APP_DIR, "src/lib/rateAuditCompat.ts"), "utf8"),
  exportFailure: readFileSync(resolve(APP_DIR, "src/components/ExportFailurePanels.tsx"), "utf8"),
  exportHealth: readFileSync(resolve(APP_DIR, "src/components/ExportHealthDetailsDialog.tsx"), "utf8"),
};

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

async function importTypeScriptModule(relativePath, replacements = {}) {
  return import(typeScriptModuleUrl(relativePath, replacements));
}

check(
  files.types.includes("export type RerunDimensionDirection")
  && files.types.includes("rerunDimensionConvergeDirections")
  && files.types.includes("rerunDimensionConverged")
  && files.types.includes("rerunAttemptCount"),
  "frontend types retain the backend same-dimension decision evidence",
);
check(
  files.types.includes("export type ChunkCandidateSelection")
  && files.types.includes('schema: "fyadr.chunk-candidate-selection"')
  && files.types.includes("export type AcademicReadabilityDeltaEvidence")
  && files.types.includes("readabilityGuardPassed?: boolean")
  && files.types.includes("readabilityIssueCodes?: string[]")
  && files.types.includes("deterministicLexicalRetentionProxy")
  && files.types.includes("sameDimensionDirection")
  && files.types.includes("candidateSelection?: ChunkCandidateSelection"),
  "frontend types retain the exact candidate-selection v2 source-relative contract without candidate text",
);
check(
  files.selectionNormalizer.includes('value.schema !== CANDIDATE_SELECTION_SCHEMA')
  && files.selectionNormalizer.includes("value.schemaVersion !== CANDIDATE_SELECTION_VERSION")
  && files.selectionNormalizer.includes("value.usesEmbedding !== false")
  && files.selectionNormalizer.includes("modelCandidates.length !== modelAttemptCount")
  && !files.selectionNormalizer.includes("outputText:"),
  "candidate-selection normalization rejects unknown or contradictory evidence and drops text fields",
);
check(
  files.types.includes("export type FailedAttemptEvidence")
  && files.types.includes('schema: "fyadr.failed-attempt-evidence"')
  && files.types.includes("schemaVersion: 1")
  && files.types.includes("textStored: false")
  && files.types.includes("errorStored: false")
  && files.types.includes("reasoningSuppressed: true")
  && files.types.includes("providerContentStored: false")
  && files.failedAttemptNormalizer.includes("normalizeFailedAttemptEvidence")
  && files.failedAttemptNormalizer.includes("FAILED_ATTEMPT_PRIVACY_NOTICE")
  && !files.resultDecision.includes("failedAttempt.outputText")
  && !files.evidence.includes("attempts[index]?.error")
  && !files.chunkAlerts.includes("rerunFailure.error")
  && !files.batchFailureFormatter.includes("failure.error"),
  "failed-attempt consumers use the text-free v1 contract and never read failed prose or raw errors",
);
check(
  files.evidencePanel.includes("候选为何接受 / 为何保留上一版")
  && files.evidencePanel.includes("同维 before / after")
  && files.evidencePanel.includes("内容保留与硬门禁"),
  "Diff exposes candidate acceptance, preservation, same-dimension, and hard-gate evidence",
);
check(
  files.evidencePanel.includes("有界候选选择")
  && files.evidencePanel.includes("candidate.readabilityLabel")
  && files.evidence.includes("新增口语化或非正式表达")
  && files.evidence.includes("新增学术动宾搭配冲突")
  && files.evidence.includes("新增谓语不完整或介词结构悬空")
  && files.evidence.includes("新增电报式无主语谓语串联")
  && files.evidence.includes("新增因果或论证指代不清")
  && files.evidence.includes("没有可测的净收益，保留 baseline")
  && files.evidencePanel.includes("确定性词汇保留代理")
  && files.evidence.includes("次模型调用 / 上限")
  && files.evidence.includes("不证明语义等价")
  && files.evidence.includes("不使用向量嵌入或模型裁判")
  && files.evidence.includes("也不是第三方 AI 检测器、检测率或通过率")
  && files.evidencePanel.includes("原稿模式")
  && files.evidencePanel.includes("全文影响")
  && files.evidencePanel.includes("句界稳定"),
  "Diff explains bounded calls, candidate selection, lexical retention, and the non-semantic disclaimer",
);
check(
  files.chunkViewModel.includes("deriveChunkDecisionEvidence")
  && files.chunkCard.includes("<RewriteDiffDecisionEvidence value={decisionEvidence}"),
  "the evidence view model is wired into every Diff chunk card",
);
check(
  files.types.includes("formatAnchorCount?: number")
  && files.types.includes("formatAnchorAmbiguous?: boolean")
  && files.scopePanel.includes("Word 局部格式锚点已纳入冻结")
  && files.scopePanel.includes("不可改占位符保护")
  && files.scopePanel.includes("已整段移出可编辑范围，不会发送给模型")
  && files.scopeParts.includes("锚点歧义 · 整段保护"),
  "DOCX scope UI explains format-anchor protection and ambiguous-unit freezing",
);
check(
  files.types.includes("hasSemanticRangeAnchor?: boolean")
  && files.types.includes("insideSemanticRange?: boolean")
  && files.types.includes("insideBookmarkRange?: boolean")
  && files.types.includes("insideCommentRange?: boolean")
  && files.types.includes("hasSemanticPointReference?: boolean")
  && files.types.includes("semanticRangeTopologyValid: boolean")
  && files.types.includes("semanticRangeCoveredUnitCount: number")
  && files.types.includes("protectedSemanticRangeCoveredUnitCount: number")
  && files.types.includes("protectedSemanticRangeAnchorUnitCount: number")
  && files.types.includes("protectedSemanticPointReferenceUnitCount: number")
  && files.scopePanel.includes("Word 书签与批注范围已分类保护")
  && files.scopePanel.includes("跨段批注内部冻结")
  && files.scopePanel.includes("无标记书签内部")
  && files.scopePanel.includes("Word 语义范围拓扑异常，已阻断处理")
  && files.scopePanel.includes("脚注/尾注/批注落点整段冻结")
  && files.scopePanel.includes("不显示批注正文")
  && files.scopeParts.includes("书签边界 · 锚点段冻结")
  && files.scopeParts.includes("批注边界 · 锚点段冻结")
  && files.scopeParts.includes("跨段批注内部 · 整段冻结")
  && files.scopeParts.includes("书签内部 · 边界节点保留")
  && files.scopeParts.includes("脚注/尾注/批注落点 · 整段冻结")
  && files.protectionHelpers.includes('semantic_range_anchor: "书签/批注范围"')
  && files.protectionHelpers.includes('semantic_range_span: "跨段批注范围"')
  && files.protectionHelpers.includes('semantic_range_topology_invalid: "书签/批注范围拓扑异常"')
  && files.protectionHelpers.includes('semantic_point_reference: "脚注/尾注/批注落点"')
  && files.rateDashboard.includes("content-contract-semantic-boundaries")
  && files.rateDashboard.includes("范围拓扑有效")
  && files.rateDashboard.includes("范围拓扑异常")
  && files.rateDashboard.includes("跨段批注范围保护")
  && files.rateDashboard.includes("书签内安全正文")
  && files.rateDashboard.includes("契约已阻断模型与导出"),
  "snapshot v22 distinguishes safe marker-free bookmark interiors from frozen comment ranges and endpoints without exposing comment text",
);
check(
  files.rateCompat.includes("semanticRangeTopologyValid: rawContract.semanticRangeTopologyValid === true")
  && files.rateCompat.includes("semanticRangeCoveredUnitCount: nonnegativeInteger")
  && files.rateCompat.includes("editableSemanticRangeCoveredUnitCount: nonnegativeInteger")
  && files.rateCompat.includes("bookmarkRangeInteriorUnitCount: nonnegativeInteger")
  && files.rateCompat.includes("editableBookmarkRangeInteriorUnitCount: nonnegativeInteger")
  && files.rateCompat.includes("semanticRangeAnchorUnitCount: nonnegativeInteger")
  && files.rateCompat.includes("editableSemanticPointReferenceUnitCount: nonnegativeInteger"),
  "content contracts normalize v22 semantic-range topology and covered-unit evidence fail closed",
);
check(
  files.types.includes("templateInstructionUnitCount?: number")
  && files.types.includes("templateInstruction?: boolean")
  && files.scopePanel.includes("模板撰写指导语已冻结")
  && files.scopePanel.includes("不会进入模型、比较正文或改写回填")
  && files.protectionHelpers.includes('template_instruction: "模板撰写指导语"')
  && files.protectionHelpers.includes('acknowledgement_guidance: "致谢模板指导语"')
  && files.protectionHelpers.includes('adjacent_structural_heading: "紧邻结构标题"'),
  "snapshot v22 template-instruction evidence is visible in the strict DOCX scope UI",
);
check(
  files.exportFailure.includes("导出拦截详情")
  && files.exportFailure.includes("formatExportIssueSample")
  && files.exportHealth.includes("section.samples.map"),
  "existing export UI retains human-readable blocking samples instead of count-only failures",
);

const selectionNormalizerUrl = typeScriptModuleUrl("src/lib/candidateSelectionEvidence.ts");
const failedAttemptNormalizerUrl = typeScriptModuleUrl("src/lib/failedAttemptEvidence.ts");
const { normalizeChunkCandidateSelection } = await import(selectionNormalizerUrl);
const {
  formatFailedAttemptEvidence,
  normalizeFailedAttemptEvidence,
} = await import(failedAttemptNormalizerUrl);
const { deriveChunkDecisionEvidence } = await importTypeScriptModule(
  "src/lib/chunkDecisionEvidence.ts",
  {
    "@/lib/candidateSelectionEvidence": selectionNormalizerUrl,
    "@/lib/failedAttemptEvidence": failedAttemptNormalizerUrl,
  },
);
const reviewDecisionDefaultsStubUrl = `data:text/javascript;base64,${Buffer.from(
  'export function deriveDefaultReviewDecision() { return "source"; }',
).toString("base64")}`;
const { getDecisionDisplayOutput } = await importTypeScriptModule(
  "src/lib/resultCardDecisionHelpers.ts",
  {
    "@/lib/reviewDecisionDefaults": reviewDecisionDefaultsStubUrl,
    "@/lib/failedAttemptEvidence": failedAttemptNormalizerUrl,
  },
);
const { formatBatchRerunFailures } = await importTypeScriptModule(
  "src/lib/exportRerunHelpers.ts",
  { "@/lib/failedAttemptEvidence": failedAttemptNormalizerUrl },
);

function failedAttemptEvidence({
  attempt = 1,
  guardCategory = "local_validation",
  issueCodes = ["validation_rejected_unspecified"],
} = {}) {
  return {
    schema: "fyadr.failed-attempt-evidence",
    schemaVersion: 1,
    attempt,
    outputCharCount: 24,
    outputTextSha256: "d".repeat(64),
    truncated: false,
    guardCategory,
    issueCodes,
    textStored: false,
    errorStored: false,
    reasoningSuppressed: true,
    providerContentStored: false,
  };
}

const forbiddenFailedBody = "FORGED_FAILED_OUTPUT_MUST_NOT_RENDER";
const forbiddenRawError = "FORGED_PROVIDER_ERROR_MUST_NOT_RENDER";
const forbiddenReasoning = "FORGED_REASONING_MUST_NOT_RENDER";
const forgedFailedAttempt = {
  ...failedAttemptEvidence({
    guardCategory: "structure",
    issueCodes: ["citation_preservation"],
  }),
  outputText: forbiddenFailedBody,
  preview: forbiddenFailedBody,
  error: forbiddenRawError,
  providerMessage: forbiddenRawError,
  reasoning: forbiddenReasoning,
  thinking: forbiddenReasoning,
};
const projectedFailedAttempt = normalizeFailedAttemptEvidence(forgedFailedAttempt);
const projectedFailedAttemptJson = JSON.stringify(projectedFailedAttempt);
const forgedFailureDetail = formatFailedAttemptEvidence({ failedAttempts: [forgedFailedAttempt] });
check(
  projectedFailedAttempt?.issueCodes[0] === "citation_preservation"
  && Object.keys(projectedFailedAttempt).length === 12
  && !projectedFailedAttemptJson.includes(forbiddenFailedBody)
  && !projectedFailedAttemptJson.includes(forbiddenRawError)
  && !projectedFailedAttemptJson.includes(forbiddenReasoning)
  && forgedFailureDetail.includes("引用标记未完整保留")
  && forgedFailureDetail.includes("失败正文与原始错误未保存")
  && !forgedFailureDetail.includes(forbiddenFailedBody)
  && !forgedFailureDetail.includes(forbiddenRawError)
  && !forgedFailureDetail.includes(forbiddenReasoning)
  && normalizeFailedAttemptEvidence({
    attempt: 1,
    outputText: forbiddenFailedBody,
    error: forbiddenRawError,
  }) === null,
  "forged failed prose, provider errors, and reasoning are projected out while stable v1 reasons remain actionable",
);

const migratedFailureDetail = formatFailedAttemptEvidence({
  rerunFallbackGuardCategory: "factual",
  rerunFallbackIssueCodes: ["factual_relation_preservation"],
  rerunFallbackError: forbiddenRawError,
});
const scopeQualifierFailureDetail = formatFailedAttemptEvidence({
  guardCategory: "factual",
  issueCodes: ["factual_scope_qualifier_changed"],
});
const safeBatchFailureText = formatBatchRerunFailures([{
  chunkId: "chunk-privacy",
  error: forbiddenRawError,
  rerunFallbackError: forbiddenRawError,
  guardCategory: "provider",
  issueCodes: ["provider_timeout"],
  errorStored: false,
  reasoningSuppressed: true,
  providerContentStored: false,
  rerunFallbackErrorStored: false,
}]);
check(
  migratedFailureDetail.includes("事实、关系或顺序未稳定保留")
  && scopeQualifierFailureDetail.includes("事实范围限定词发生新增、删除或类型变化")
  && !migratedFailureDetail.includes(forbiddenRawError)
  && safeBatchFailureText.includes("模型服务响应超时")
  && safeBatchFailureText.includes("失败正文与原始错误未保存")
  && !safeBatchFailureText.includes(forbiddenRawError),
  "migrated fallback metadata, scope-qualifier failures, and batch failures show stable Chinese reasons without forwarding legacy raw errors",
);

const safeFailedOutputPane = getDecisionDisplayOutput({
  chunkId: "chunk-forged-output",
  paragraphIndex: 0,
  chunkIndex: 0,
  inputText: "safe source",
  outputText: "safe accepted body",
  fallbackMode: "source",
  failedAttempts: [forgedFailedAttempt],
}, "source", false);
check(
  safeFailedOutputPane.text === "safe accepted body"
  && safeFailedOutputPane.title.includes("安全正文保持不变")
  && !JSON.stringify(safeFailedOutputPane).includes(forbiddenFailedBody),
  "the Diff output pane keeps the authoritative safe body and cannot render a forged failed candidate",
);
const { normalizeRateAuditReport } = await importTypeScriptModule("src/lib/rateAuditCompat.ts");
const legacyContractReport = normalizeRateAuditReport({
  sourceOnly: false,
  contentContract: {
    ready: true,
    scopeReady: true,
    modelInputMatchesEditableUnits: true,
    formatLockApplicable: true,
    formatLockReady: true,
    issues: [],
  },
  strategyPlan: { decision: "stop", canExecute: false, targetChunkIds: [] },
});
check(
  legacyContractReport.contentContract?.semanticRangeAnchorUnitCount === 0
  && legacyContractReport.contentContract?.protectedSemanticRangeAnchorUnitCount === 0
  && legacyContractReport.contentContract?.editableSemanticRangeAnchorUnitCount === 0
  && legacyContractReport.contentContract?.semanticRangeCount === 0
  && legacyContractReport.contentContract?.semanticRangeTopologyValid === false
  && legacyContractReport.contentContract?.semanticRangeIssueCount === 0
  && legacyContractReport.contentContract?.semanticRangeCoveredUnitCount === 0
  && legacyContractReport.contentContract?.protectedSemanticRangeCoveredUnitCount === 0
  && legacyContractReport.contentContract?.editableSemanticRangeCoveredUnitCount === 0
  && legacyContractReport.contentContract?.semanticPointReferenceUnitCount === 0
  && legacyContractReport.contentContract?.protectedSemanticPointReferenceUnitCount === 0
  && legacyContractReport.contentContract?.editableSemanticPointReferenceUnitCount === 0,
  "legacy contracts gain zero semantic-boundary defaults and fail-closed unknown range topology without fabricated protected units",
);

function lexicalRetentionProxy(score = 0.94) {
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

const BASELINE_HASH = "a".repeat(64);
const MODEL_HASH = "b".repeat(64);
const PROFILE_HASH = "c".repeat(64);

function sourceRelativeEvidence(candidateTextSha256, {
  passed = true,
  blockingIssueCodes = [],
  collapsed = false,
  fragmented = false,
} = {}) {
  return {
    schema: "fyadr.source-relative-style-delta",
    schemaVersion: 1,
    ready: true,
    passed,
    contextScope: "document",
    binding: {
      sourceProfileSha256: PROFILE_HASH,
      baselineTextSha256: BASELINE_HASH,
      candidateTextSha256,
    },
    openingFamilyDelta: {
      introducedPatternCount: 0,
      blockingPatternCount: 0,
      maxIntroducedCount: 0,
      maxDocumentAfterCount: 0,
      issueCodes: [],
      patterns: [],
    },
    sentenceSkeletonDelta: {
      introducedPatternCount: 0,
      blockingPatternCount: 0,
      maxIntroducedCount: 0,
      maxDocumentAfterCount: 0,
      issueCodes: [],
      patterns: [],
    },
    sentenceBoundaryDelta: {
      inputSentenceCount: 2,
      outputSentenceCount: collapsed ? 1 : 2,
      inputShortSentenceCount: 0,
      outputShortSentenceCount: fragmented ? 2 : 0,
      collapseCount: collapsed ? 1 : 0,
      fragmentIncrease: fragmented ? 2 : 0,
      collapsed,
      fragmented,
      issueCodes: [
        ...(collapsed ? ["sentence_boundary_collapse_introduced"] : []),
        ...(fragmented ? ["sentence_fragmentation_introduced"] : []),
      ],
    },
    blockingIssueCodes,
    advisoryIssueCodes: [],
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

function selectionCandidate({
  candidateId,
  origin,
  attempt,
  before = 0.52,
  after = 0.31,
  directionOk = true,
  score = 0.94,
  changedFromBaseline = true,
  hardValid = true,
  hardValidationIssueCodes = [],
  readabilityGuardPassed = true,
  readabilityIssueCodes = [],
  factualGuardPassed = true,
  safetyEligible = true,
  rejectionReasonCodes = [],
}) {
  const textSha256 = origin === "baseline" ? BASELINE_HASH : MODEL_HASH;
  const sourceRelativeStyleDelta = sourceRelativeEvidence(textSha256);
  return {
    candidateId,
    origin,
    attempt,
    textSha256,
    charCount: 100,
    changedFromBaseline,
    hardValid,
    hardValidationError: hardValid ? "" : "引用标记缺失",
    hardValidationIssueCodes,
    academicReadabilityDelta: {
      schema: "fyadr.academic-readability-delta",
      schemaVersion: 1,
      ok: readabilityGuardPassed,
      issueCodes: readabilityIssueCodes,
      counts: { input: 0, output: readabilityIssueCodes.length, introduced: readabilityIssueCodes.length },
      claims: { storesInputText: false, storesOutputText: false, storesMatchedText: false },
    },
    readabilityGuardPassed,
    readabilityIssueCodes,
    sourceRelativeStyleDelta,
    sourceRelativeStyleGuardPassed: sourceRelativeStyleDelta.passed,
    factualGuardPassed,
    factualIssueCodes: factualGuardPassed ? [] : ["entity_order_changed"],
    deterministicLexicalRetentionProxy: lexicalRetentionProxy(score),
    sameDimensionDirection: {
      dimensionId: "transitions",
      direction: "decrease_connector_density",
      primaryMetric: "connectorDensity",
      before,
      after,
      ok: directionOk,
      satisfied: directionOk,
      note: directionOk ? "公式化连接词信号已下降。" : "同维方向没有可靠改善。",
    },
    stylePenalty: hardValid ? (origin === "baseline" ? 4.2 : 3.1 + attempt / 10) : null,
    safetyEligible,
    rejectionReasonCodes,
    _text: "不得进入前端归一化结果的内部正文",
    outputText: "不得进入前端归一化结果的候选正文",
  };
}

const baselineCandidate = selectionCandidate({
  candidateId: "baseline",
  origin: "baseline",
  attempt: 0,
  changedFromBaseline: false,
  directionOk: false,
  score: 1,
});
const selectedModelCandidate = selectionCandidate({
  candidateId: "model-attempt-1",
  origin: "model",
  attempt: 1,
});
const oneCallSelection = {
  schema: "fyadr.chunk-candidate-selection",
  schemaVersion: 2,
  decision: "generated_selected",
  publishedRewrite: true,
  runFailed: false,
  selectedCandidateId: "model-attempt-1",
  selectedOrigin: "model",
  selectedTextSha256: MODEL_HASH,
  resultTextSha256: MODEL_HASH,
  publishedTextSha256: MODEL_HASH,
  selectedCharCount: 100,
  resultCharCount: 100,
  publishedCharCount: 100,
  postprocessApplied: false,
  resultSourceRelativeStyleDelta: sourceRelativeEvidence(MODEL_HASH),
  reasonCodes: ["same_dimension_converged", "style_regression_within_safety_tolerance"],
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
  candidates: [baselineCandidate, selectedModelCandidate],
};
const normalizedOneCallSelection = normalizeChunkCandidateSelection(oneCallSelection);
check(
  normalizedOneCallSelection?.selectedCandidateId === "model-attempt-1"
  && normalizedOneCallSelection?.modelAttemptCount === 1
  && normalizedOneCallSelection?.candidates.length === 2
  && !JSON.stringify(normalizedOneCallSelection).includes("不得进入前端归一化结果"),
  "v2 normalization keeps metadata-only source-relative evidence and discards every unknown text field",
);

const boundedSelection = deriveChunkDecisionEvidence({
  chunkId: "bounded-selection",
  paragraphIndex: 0,
  chunkIndex: 0,
  inputText: "source",
  outputText: "selected output",
  candidateSelection: oneCallSelection,
}, "rewrite", false);
check(
  boundedSelection?.outcomeLabel === "有界选择采用 模型候选 1"
  && boundedSelection?.attemptCount === 1
  && boundedSelection?.metricValue === "0.52 → 0.31"
  && boundedSelection?.candidateSelection?.decisionLabel === "选择 模型候选 1"
  && boundedSelection?.candidateSelection?.callLabel === "1 次模型调用 / 上限 2 次"
  && boundedSelection?.candidateSelection?.comparisonLabel === "比较 2 个版本（上限 3，含 baseline）"
  && boundedSelection?.candidateSelection?.candidates[1]?.retentionScore === "0.940"
  && boundedSelection?.candidateSelection?.candidates[1]?.retentionMinimum === "0.720"
  && boundedSelection?.candidateSelection?.disclaimer.includes("不证明语义等价")
  && boundedSelection?.candidateSelection?.disclaimer.includes("不是第三方 AI 检测器、检测率或通过率"),
  "one-call generated selection exposes the chosen candidate, exact call bound, direction, and proxy disclaimer",
);

const registerRetrySelection = {
  ...oneCallSelection,
  selectedCandidateId: "model-attempt-2",
  reasonCodes: ["hard_and_factual_guards_passed", "combined_style_penalty_not_worse"],
  modelAttemptCount: 2,
  conditionalRetryCount: 0,
  candidates: [
    baselineCandidate,
    selectionCandidate({
      candidateId: "model-attempt-1",
      origin: "model",
      attempt: 1,
      hardValid: false,
      hardValidationIssueCodes: ["academic_register_drift"],
      safetyEligible: false,
      rejectionReasonCodes: ["hard_validation_failed"],
    }),
    selectionCandidate({
      candidateId: "model-attempt-2",
      origin: "model",
      attempt: 2,
    }),
  ],
};
const registerRetryEvidence = deriveChunkDecisionEvidence({
  chunkId: "register-retry",
  paragraphIndex: 0,
  chunkIndex: 1,
  inputText: "formal source",
  outputText: "formal repaired candidate",
  failedAttempts: [failedAttemptEvidence({
    attempt: 1,
    guardCategory: "readability",
    issueCodes: ["academic_register_stability"],
  })],
  candidateSelection: registerRetrySelection,
}, "rewrite", false);
check(
  registerRetryEvidence?.hardGateLabel === "本地硬门禁已通过"
  && registerRetryEvidence?.candidateSelection?.candidates[1]?.hardGateLabel === "学术语域硬门禁失败"
  && registerRetryEvidence?.candidateSelection?.candidates[1]?.rejectionLabels.includes(
    "学术语域偏移：候选新引入口语化表达",
  )
  && registerRetryEvidence?.candidateSelection?.candidates[2]?.hardGateLabel === "硬门禁通过",
  "a repaired second candidate keeps the first academic-register rejection reason visible without mislabeling the selected candidate",
);

const readabilityRetrySelection = {
  ...oneCallSelection,
  selectedCandidateId: "model-attempt-2",
  reasonCodes: ["hard_and_factual_guards_passed", "combined_style_penalty_improved"],
  modelAttemptCount: 2,
  conditionalRetryCount: 1,
  candidates: [
    baselineCandidate,
    selectionCandidate({
      candidateId: "model-attempt-1",
      origin: "model",
      attempt: 1,
      readabilityGuardPassed: false,
      readabilityIssueCodes: [
        "colloquial_register_introduced",
        "academic_collocation_conflict_introduced",
        "predicate_completeness_regression",
        "telegraphic_clause_chain_introduced",
        "vague_causal_reference_introduced",
      ],
      safetyEligible: false,
      rejectionReasonCodes: ["academic_readability_delta_failed"],
    }),
    selectionCandidate({
      candidateId: "model-attempt-2",
      origin: "model",
      attempt: 2,
    }),
  ],
};
const readabilityRetryEvidence = deriveChunkDecisionEvidence({
  chunkId: "readability-retry",
  paragraphIndex: 0,
  chunkIndex: 2,
  inputText: "formal source",
  outputText: "formal repaired candidate",
  candidateSelection: readabilityRetrySelection,
}, "rewrite", false);
const unreadableCandidateView = readabilityRetryEvidence?.candidateSelection?.candidates[1];
check(
  unreadableCandidateView?.hardGateLabel === "硬门禁通过"
  && unreadableCandidateView?.readabilityLabel === "学术可读性 5 项退化"
  && unreadableCandidateView?.safetyLabel === "不可选择"
  && unreadableCandidateView?.rejectionLabels.includes("学术可读性增量门禁未通过")
  && unreadableCandidateView?.rejectionLabels.includes("新增口语化或非正式表达")
  && unreadableCandidateView?.rejectionLabels.includes("新增学术动宾搭配冲突")
  && unreadableCandidateView?.rejectionLabels.includes("新增谓语不完整或介词结构悬空")
  && unreadableCandidateView?.rejectionLabels.includes("新增电报式无主语谓语串联")
  && unreadableCandidateView?.rejectionLabels.includes("新增因果或论证指代不清")
  && readabilityRetryEvidence?.candidateSelection?.candidates[2]?.readabilityLabel === "学术可读性增量通过",
  "readability-delta rejection remains explicit while a repaired candidate can be selected",
);

const secondRejectedCandidate = selectionCandidate({
  candidateId: "model-attempt-2",
  origin: "model",
  attempt: 2,
  after: 0.5,
  directionOk: false,
});
const twoCallBaselineSelection = {
  ...oneCallSelection,
  decision: "preserved_baseline",
  publishedRewrite: false,
  selectedCandidateId: "baseline",
  selectedOrigin: "baseline",
  selectedTextSha256: BASELINE_HASH,
  resultTextSha256: BASELINE_HASH,
  publishedTextSha256: undefined,
  selectedCharCount: 100,
  resultCharCount: 100,
  publishedCharCount: undefined,
  resultSourceRelativeStyleDelta: sourceRelativeEvidence(BASELINE_HASH),
  reasonCodes: ["no_same_dimension_converged_candidate"],
  modelAttemptCount: 2,
  conditionalRetryCount: 1,
  candidates: [
    baselineCandidate,
    selectionCandidate({
      candidateId: "model-attempt-1",
      origin: "model",
      attempt: 1,
      changedFromBaseline: false,
      directionOk: false,
      rejectionReasonCodes: ["no_material_change"],
    }),
    secondRejectedCandidate,
  ],
};
const boundedBaseline = deriveChunkDecisionEvidence({
  chunkId: "bounded-baseline",
  paragraphIndex: 0,
  chunkIndex: 1,
  inputText: "source",
  outputText: "source",
  candidateSelection: twoCallBaselineSelection,
}, "source", false);
check(
  boundedBaseline?.outcomeLabel === "没有模型候选胜出，保留 baseline"
  && boundedBaseline?.previousTextPreserved === true
  && boundedBaseline?.candidateSelection?.decisionLabel === "保留 baseline"
  && boundedBaseline?.candidateSelection?.callLabel === "2 次模型调用 / 上限 2 次"
  && boundedBaseline?.candidateSelection?.retryLabel.includes("追加 1 次有界重试")
  && boundedBaseline?.candidateSelection?.reasonLabels.includes("没有模型候选通过同维复评分")
  && boundedBaseline?.candidateSelection?.candidates.length === 3
  && boundedBaseline?.candidateSelection?.candidates[1]?.rejectionLabels.includes("与 baseline 没有有效变化"),
  "two-call selection explains why no model candidate displaced baseline",
);

check(
  normalizeChunkCandidateSelection({ ...oneCallSelection, schemaVersion: 1 }) === null
  && normalizeChunkCandidateSelection({
    ...oneCallSelection,
    retentionAssessment: { ...oneCallSelection.retentionAssessment, usesModel: true },
  }) === null
  && normalizeChunkCandidateSelection({ ...oneCallSelection, selectedOrigin: "baseline" }) === null
  && normalizeChunkCandidateSelection({
    ...oneCallSelection,
    candidates: [
      baselineCandidate,
      {
        ...selectedModelCandidate,
        readabilityGuardPassed: true,
        readabilityIssueCodes: ["predicate_completeness_regression"],
      },
    ],
  }) === null
  && deriveChunkDecisionEvidence({
    chunkId: "unknown-selection",
    paragraphIndex: 0,
    chunkIndex: 2,
    inputText: "source",
    outputText: "output",
    candidateSelection: { ...oneCallSelection, schemaVersion: 99 },
  }, "rewrite", false) === null,
  "unknown versions and contradictory retention or selected-origin claims fail closed without UI evidence",
);

const accepted = deriveChunkDecisionEvidence({
  chunkId: "accepted",
  paragraphIndex: 0,
  chunkIndex: 0,
  inputText: "source",
  outputText: "candidate",
  rerunAttemptCount: 2,
  rerunDimensionConverged: true,
  rerunDimensionConvergeDirections: [{
    dimensionId: "transitions",
    primaryMetric: "connectorDensity",
    before: 0.52,
    after: 0.31,
    ok: true,
    satisfied: true,
    riskCodesBefore: ["connector_overuse"],
    riskCodesAfter: [],
    note: "公式化连接词信号已降到阈值以下。",
  }],
  rateAuditStrategyReviewRequired: true,
  rateAuditStrategyEvaluatorDimensionId: "transitions",
}, "source", true);
check(
  accepted?.outcomeLabel === "候选通过，待人工确认"
  && accepted?.previousTextPreserved === true
  && accepted?.attemptCount === 2
  && accepted?.dimensionLabel === "衔接脚手架"
  && accepted?.metricLabel === "公式化连接词密度"
  && accepted?.metricValue === "0.52 → 0.31"
  && accepted?.metricStatus === "满足接收条件"
  && accepted?.riskCodeChange === "同类风险项 1 → 0"
  && accepted?.hardGateLabel === "本地硬门禁已通过"
  && accepted?.hardGateDetail.includes("学术语义仍需人工确认"),
  "accepted candidates show exact before/after evidence while remaining review-gated",
);

const confirmedSource = deriveChunkDecisionEvidence({
  chunkId: "confirmed-source",
  paragraphIndex: 0,
  chunkIndex: 1,
  inputText: "source",
  outputText: "candidate",
  rerunDimensionConverged: true,
  rerunDimensionConvergeDirections: [{
    dimensionId: "transitions",
    primaryMetric: "connectorDensity",
    before: 0.52,
    after: 0.31,
    ok: true,
    note: "同维度已改善。",
  }],
}, "source_confirmed", false);
check(
  confirmedSource?.outcomeLabel === "已确认保留上一版"
  && confirmedSource?.previousTextPreserved === true
  && confirmedSource?.outcomeDetail.includes("导出不会采用该候选"),
  "explicit source confirmation remains understandable after the pending marker is cleared",
);

const nonConverged = deriveChunkDecisionEvidence({
  chunkId: "non-converged",
  paragraphIndex: 1,
  chunkIndex: 0,
  inputText: "source",
  outputText: "previous accepted",
  rerunAttemptCount: 2,
  rerunStatus: "non_converged",
  rerunNonConvergedReason: "dimension_attempt_limit",
  rerunDimensionConverged: false,
  rerunDimensionConvergeDirections: [{
    dimensionId: "template_expression",
    primaryMetric: "templateDensity",
    before: 0.28,
    after: 0.27,
    ok: false,
    satisfied: false,
    note: "模板表达没有出现可靠改善。",
  }],
}, "source", false);
check(
  nonConverged?.outcomeLabel === "未收敛，已保留上一版"
  && nonConverged?.previousTextPreserved === true
  && nonConverged?.metricValue === "0.28 → 0.27"
  && nonConverged?.metricStatus === "未满足接收条件"
  && nonConverged?.hardGateLabel === "本地硬门禁已通过"
  && nonConverged?.hardGateDetail.includes("仅因同维改善不足而未接收"),
  "dimension plateaus distinguish a passed hard gate from insufficient same-dimension gain",
);

const hardGateFailure = deriveChunkDecisionEvidence({
  chunkId: "hard-gate",
  paragraphIndex: 2,
  chunkIndex: 0,
  inputText: "source [3]",
  outputText: "previous accepted [3]",
  rerunAttemptCount: 2,
  rerunStatus: "non_converged",
  rerunNonConvergedReason: "hard_validation_attempt_limit",
  rerunDimensionConverged: false,
  failedAttempts: [failedAttemptEvidence({
    guardCategory: "structure",
    issueCodes: ["citation_preservation"],
  })],
}, "source", false);
check(
  hardGateFailure?.outcomeLabel === "未接收，已保留上一版"
  && hardGateFailure?.hardGateLabel === "硬门禁未通过"
  && hardGateFailure?.hardGateTone === "danger"
  && hardGateFailure?.hardGateDetail.includes("引用标记未完整保留")
  && hardGateFailure?.hardGateDetail.includes("失败正文与原始错误未保存")
  && hardGateFailure?.metricStatus === "未提供数值证据",
  "hard-validation failures explain why no candidate replaced the accepted text",
);

check(
  deriveChunkDecisionEvidence({
    chunkId: "plain",
    paragraphIndex: 3,
    chunkIndex: 0,
    inputText: "source",
    outputText: "output",
  }, "rewrite", false) === null,
  "ordinary chunks without server decision evidence do not receive invented claims",
);

console.log(JSON.stringify({ ok: true, checks }, null, 2));
