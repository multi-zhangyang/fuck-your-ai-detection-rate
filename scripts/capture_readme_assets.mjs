import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = resolve(ROOT_DIR, "docs", "assets", "readme");
const TARGET_URL = process.env.FYADR_CAPTURE_URL || "http://127.0.0.1:8765";
const DEFAULT_TIMEOUT_MS = 45_000;
const WEBP_QUALITY = 88;

const DOCUMENT_PATH = "demo/智能制造系统优化研究（演示稿）.docx";
const DOC_ID = "readme-synthetic-thesis";
const ROUND_ONE_OUTPUT = "demo/智能制造系统优化研究（演示稿）-round1.txt";
const ROUND_TWO_OUTPUT = "demo/智能制造系统优化研究（演示稿）-round2.txt";
const COMPARE_REVISION = "2026-07-18T20:30:00.000000Z";
const REVIEW_UPDATED_AT = "2026-07-18T20:32:00.000000Z";
const SAVED_SECRET_PLACEHOLDER = "__FYADR_SAVED_SECRET__";
const EXAMPLE_BASE_URL = "https://example.com/v1";

const sha = (character) => character.repeat(64);

function makePromptItem(id, label, description, fileName, content) {
  return {
    id,
    label,
    description,
    fileName,
    relativePath: `prompts/${fileName}`,
    sizeBytes: Buffer.byteLength(content, "utf8"),
    updatedAt: "2026-07-18T18:00:00.000000Z",
    content,
    builtIn: true,
    editable: true,
    defaultAvailable: true,
  };
}

function makeStageMetrics(overrides = {}) {
  return {
    language: "zh",
    charCount: 3820,
    sentenceCount: 96,
    paragraphCount: 75,
    sentenceLengthVariation: 0.42,
    burstinessRatio: 0.31,
    shortSentenceRate: 0.14,
    connectorDensity: 0.022,
    templateDensity: 0.009,
    abstractPaddingDensity: 0.006,
    passiveDensity: 0.018,
    chengyuDensity: 0.004,
    nestedNumberDensity: 0.005,
    colonParallelDensity: 0.004,
    structureConcentration: 0.21,
    paragraphLengthCv: 0.47,
    adjacentParagraphUniformity: 0.19,
    ...overrides,
  };
}

function makeScopeUnit({
  unitIndex,
  textPreview,
  editable,
  structuralRole,
  protectReason,
  styleName = "正文",
  flags = {},
  ...extra
}) {
  return {
    unitIndex,
    targetKind: "paragraph",
    styleName,
    editable,
    protectReason,
    structuralRole,
    editEligibility: editable ? "eligible" : "protected",
    editEligibilityReasonCodes: editable ? ["body_prose_positive_evidence"] : [protectReason],
    textLength: textPreview.length,
    textPreview,
    hasFieldCode: false,
    hasDrawing: false,
    hasMath: false,
    hasComplexInline: false,
    hasNumbering: false,
    numberingLevel: null,
    outlineLevel: null,
    flags,
    ...extra,
  };
}

function buildFixtures() {
  const promptSequence = ["prewrite", "round1", "round2"];
  const promptWorkflows = [
    {
      id: "cn_custom",
      label: "自定义组合",
      description: "当前改写流程。",
      defaultSequence: promptSequence,
      customizable: true,
      sequenceLimit: 3,
      roundLimit: 12,
      chunkMetric: "char",
      legacy: false,
      visible: true,
    },
  ];
  const promptItems = [
    makePromptItem(
      "prewrite",
      "润色改写",
      "先做保守自然化与结构预热。",
      "prewrite.md",
      "在不改变事实、数字、术语和引用的前提下，使中文学术表达自然、清晰。",
    ),
    makePromptItem(
      "round1",
      "规范改写",
      "正文主体降痕与语气调整。",
      "rewrite-pass-1.md",
      "仅处理可编辑正文，保留原文事实范围、论证关系和 Word 结构。",
    ),
    makePromptItem(
      "round2",
      "专家改写",
      "最终降痕与连贯性修整。",
      "rewrite-pass-2.md",
      "对已通过硬门禁的正文作保守修整，不输出解释、标签或思考过程。",
    ),
  ];

  const modelConfig = {
    baseUrl: EXAMPLE_BASE_URL,
    apiKey: SAVED_SECRET_PLACEHOLDER,
    model: "academic-rewrite-demo",
    apiType: "chat_completions",
    streaming: true,
    temperature: 0.7,
    promptProfile: "cn_custom",
    promptSequence,
    requestTimeoutSeconds: 600,
    maxRetries: 3,
    rewriteConcurrency: 4,
    modelProviders: [
      {
        id: "demo-compatible",
        name: "OpenAI 兼容接口（演示）",
        enabled: true,
        baseUrl: EXAMPLE_BASE_URL,
        apiKey: SAVED_SECRET_PLACEHOLDER,
        apiType: "chat_completions",
        streaming: true,
        temperature: 0.7,
        requestTimeoutSeconds: 600,
        maxRetries: 3,
        rateLimitWindowMinutes: 0,
        rateLimitMaxRequests: 0,
        models: ["academic-rewrite-demo", "general-chat-demo", "reasoning-demo"],
        defaultModel: "academic-rewrite-demo",
        updatedAt: "2026-07-18T18:00:00.000000Z",
      },
    ],
    roundModels: {},
  };

  const artifactStats = {
    total: 18,
    existing: 18,
    intermediate: 10,
    exports: 3,
    reports: 4,
    sources: 1,
    external: 0,
    missing: 0,
    bytes: 2867200,
  };

  const qualitySummary = {
    label: "学术表达与内容完整性检查",
    isAiDetector: false,
    hardValidationRules: ["事实范围", "数字与术语", "引用标记", "Word 结构"],
    reviewRules: ["可读性", "学术语域", "来源相对变化"],
    paragraphSplitSummary: {
      paragraphCount: 4,
      chunkCount: 4,
      splitParagraphCount: 0,
      keptParagraphCount: 4,
    },
    validationRetryCount: 1,
    sourceFallbackCount: 1,
    sourceFallbackChunkIds: ["p002-c01"],
    validationEventCount: 4,
    citationInputCount: 1,
    citationOutputCount: 1,
    protectedTokenCount: 5,
    protectedTokenTypes: { number: 2, citation: 1, latin_term: 2 },
    introducedTemplatePhraseCount: 0,
    introducedTemplatePhrases: [],
    introducedColloquialPhraseCount: 0,
    introducedColloquialPhrases: [],
    styleValidationIssueCount: 0,
    styleValidationIssues: [],
    machineLikeRiskCount: 0,
    machineLikeRisks: [],
    estimatedApiCalls: 6,
  };

  const chunks = [
    {
      chunkId: "p001-c01",
      paragraphIndex: 0,
      chunkIndex: 0,
      inputText: "本章主要介绍系统总体架构，并分析控制层、通信层与执行层之间的数据交互关系。",
      outputText: "本章先说明系统总体架构，再分析控制层、通信层和执行层之间的数据交互关系。",
      inputCharCount: 41,
      outputCharCount: 40,
      quality: {
        expansionRatio: 0.98,
        missingCitationCount: 0,
        protectedTokenCount: 0,
        machineLikeRiskCount: 0,
        reviewReasons: [],
        rewriteAdvice: [],
        flags: [],
        advisoryFlags: [],
        needsReview: false,
      },
    },
    {
      chunkId: "p002-c01",
      paragraphIndex: 1,
      chunkIndex: 0,
      inputText: "实验采样周期设为 10 ms，控制总线采用 CANopen 协议[12]。",
      outputText: "实验采样周期设为 10 ms，控制总线采用 CANopen 协议[12]。",
      inputCharCount: 39,
      outputCharCount: 39,
      fallbackMode: "source",
      fallbackReason: "候选改变了事实范围限定，已安全保留原文。",
      fallbackGuardCategory: "factual_guard",
      fallbackIssueCodes: ["factual_scope_qualifier_changed"],
      fallbackErrorStored: false,
      fallbackAttempts: 2,
      quality: {
        expansionRatio: 1,
        missingCitationCount: 0,
        protectedTokenCount: 4,
        protectedTokenTypes: { number: 2, citation: 1, latin_term: 1 },
        machineLikeRiskCount: 0,
        reviewReasons: [],
        rewriteAdvice: [],
        flags: ["source_fallback"],
        advisoryFlags: [],
        needsReview: false,
      },
    },
    {
      chunkId: "p003-c01",
      paragraphIndex: 2,
      chunkIndex: 0,
      inputText: "为保证控制过程的稳定性，系统在通信异常时将当前状态写入本地缓存，并在链路恢复后继续执行。",
      outputText: "为维持控制过程稳定，通信异常时系统会将当前状态写入本地缓存，待链路恢复后继续执行。",
      inputCharCount: 49,
      outputCharCount: 45,
      quality: {
        expansionRatio: 0.92,
        missingCitationCount: 0,
        protectedTokenCount: 0,
        machineLikeRiskCount: 0,
        reviewReasons: [],
        rewriteAdvice: [],
        flags: [],
        advisoryFlags: [],
        needsReview: false,
      },
    },
    {
      chunkId: "p004-c01",
      paragraphIndex: 3,
      chunkIndex: 0,
      inputText: "测试结果表明，各模块能够按照既定时序完成信息交换，系统功能满足设计要求。",
      outputText: "测试结果表明，各模块能够按照既定时序完成信息交换，系统功能满足设计要求。",
      inputCharCount: 40,
      outputCharCount: 40,
      quality: {
        expansionRatio: 1,
        missingCitationCount: 0,
        protectedTokenCount: 1,
        protectedTokenTypes: { relation: 1 },
        machineLikeRiskCount: 0,
        reviewReasons: [],
        rewriteAdvice: [],
        flags: [],
        advisoryFlags: [],
        needsReview: false,
      },
    },
  ];

  const compare = {
    version: 3,
    docId: DOC_ID,
    round: 2,
    promptProfile: "cn_custom",
    promptSequence,
    inputPath: ROUND_ONE_OUTPUT,
    outputPath: ROUND_TWO_OUTPUT,
    manifestPath: "demo/智能制造系统优化研究（演示稿）.manifest.json",
    paragraphCount: 4,
    chunkCount: chunks.length,
    paragraphSplitSummary: qualitySummary.paragraphSplitSummary,
    validationEvents: [],
    qualitySummary,
    updatedAt: COMPARE_REVISION,
    reviewUpdatedAt: REVIEW_UPDATED_AT,
    compareRevision: COMPARE_REVISION,
    chunks,
  };

  const decisions = {
    "p001-c01": "rewrite_confirmed",
    "p002-c01": "source_confirmed",
    "p003-c01": "rewrite_confirmed",
    "p004-c01": "source_confirmed",
  };
  const effectiveText = chunks.map((chunk) => chunk.outputText).join("\n\n");

  const roundSnapshot = {
    version: 1,
    materializationSource: "review_materialized_compare",
    outputPath: ROUND_TWO_OUTPUT,
    docId: DOC_ID,
    round: 2,
    compareRevision: COMPARE_REVISION,
    reviewRevision: sha("b"),
    contentRevision: sha("c"),
    artifactSnapshotDigest: sha("d"),
    compareSha256: sha("e"),
    reviewSha256: sha("b"),
    effectiveTextSha256: sha("f"),
    outputSha256: sha("1"),
    bodyMapSha256: sha("2"),
    manifestSha256: sha("3"),
    rawOutputMatchesEffective: true,
    bodyMapMatchesEffective: true,
    compare,
    review: {
      path: "demo/智能制造系统优化研究（演示稿）-round2.review.json",
      outputPath: ROUND_TWO_OUTPUT,
      docId: DOC_ID,
      round: 2,
      decisions,
      updatedAt: REVIEW_UPDATED_AT,
      compareRevision: COMPARE_REVISION,
      currentCompareRevision: COMPARE_REVISION,
      reviewBaseCompareRevision: COMPARE_REVISION,
      reviewLinkReady: true,
      reviewLinkStatus: "linked",
    },
    effectivePreview: {
      path: ROUND_TWO_OUTPUT,
      text: effectiveText,
      truncated: false,
      totalChars: effectiveText.length,
      previewChars: effectiveText.length,
    },
  };

  const historyRounds = [
    {
      round: 1,
      prompt: "规范改写",
      promptProfile: "cn_custom",
      promptSequence,
      inputPath: DOCUMENT_PATH,
      outputPath: ROUND_ONE_OUTPUT,
      manifestPath: "demo/智能制造系统优化研究（演示稿）.manifest.json",
      comparePath: "demo/智能制造系统优化研究（演示稿）-round1.compare.json",
      qualityPath: "demo/智能制造系统优化研究（演示稿）-round1.quality.json",
      bodyMapPath: "demo/智能制造系统优化研究（演示稿）-round1.body-map.json",
      validationPath: "demo/智能制造系统优化研究（演示稿）-round1.validation.json",
      qualitySummary: { ...qualitySummary, validationRetryCount: 0, sourceFallbackCount: 0 },
      scoreTotal: null,
      chunkLimit: 2800,
      inputSegmentCount: 4,
      outputSegmentCount: 4,
      timestamp: "2026-07-18T19:10:00.000000Z",
      artifactStats: { ...artifactStats, total: 8, existing: 8, bytes: 1216000 },
    },
    {
      round: 2,
      prompt: "专家改写",
      promptProfile: "cn_custom",
      promptSequence,
      inputPath: ROUND_ONE_OUTPUT,
      outputPath: ROUND_TWO_OUTPUT,
      manifestPath: "demo/智能制造系统优化研究（演示稿）.manifest.json",
      comparePath: "demo/智能制造系统优化研究（演示稿）-round2.compare.json",
      qualityPath: "demo/智能制造系统优化研究（演示稿）-round2.quality.json",
      bodyMapPath: "demo/智能制造系统优化研究（演示稿）-round2.body-map.json",
      validationPath: "demo/智能制造系统优化研究（演示稿）-round2.validation.json",
      qualitySummary,
      scoreTotal: null,
      chunkLimit: 2800,
      inputSegmentCount: 4,
      outputSegmentCount: 4,
      timestamp: "2026-07-18T20:30:00.000000Z",
      artifactStats: { ...artifactStats, total: 10, existing: 10, bytes: 1651200 },
    },
  ];

  const historyItem = {
    docId: DOC_ID,
    sourcePath: DOCUMENT_PATH,
    originPath: DOCUMENT_PATH,
    completedRounds: [1, 2],
    latestOutputPath: ROUND_TWO_OUTPUT,
    lastTimestamp: "2026-07-18T20:30:00.000000Z",
    artifactStats,
    rounds: historyRounds,
  };

  const protectionMap = {
    sourcePath: DOCUMENT_PATH,
    sourceKind: "docx",
    available: true,
    message: "Synthetic README fixture: protection map ready.",
    snapshotPath: "demo/智能制造系统优化研究（演示稿）.snapshot.json",
    summary: {
      totalUnits: 396,
      editableUnits: 75,
      protectedUnits: 321,
      tableUnits: 94,
      topLevelParagraphUnits: 302,
      structuralRolePolicyVersion: 6,
      structuralInventoryVersion: 3,
      ambiguousUnits: 0,
      roleCounts: {
        front_matter: 43,
        body_prose: 75,
        heading: 42,
        table_content: 94,
        reference_entry: 60,
        template_instruction: 3,
        back_matter: 79,
      },
      semanticRangeCount: 14,
      bookmarkRangeCount: 14,
      commentRangeCount: 0,
      bookmarkRangeInteriorUnits: 60,
      editableBookmarkRangeInteriorUnits: 60,
      commentRangeInteriorUnits: 0,
      semanticRangeTopologyValid: true,
      semanticRangeCoveredUnits: 0,
      protectionReasons: [
        { reason: "heading_or_structure", label: "标题与结构", count: 42 },
        { reason: "table_content", label: "表格内容", count: 94 },
        { reason: "field_drawing_math", label: "域、图形与公式", count: 55 },
        { reason: "references", label: "参考文献", count: 60 },
        { reason: "back_matter", label: "声明、致谢与后置内容", count: 67 },
        { reason: "template_instruction", label: "模板撰写指导语", count: 3 },
      ],
    },
    sections: [
      {
        key: "cover-toc",
        editable: false,
        reason: "front_matter",
        label: "封面、声明与目录",
        structuralRole: "front_matter",
        structuralRoleLabel: "前置结构",
        editEligibility: "protected",
        eligibilityReasonCodes: ["front_matter"],
        startUnit: 0,
        endUnit: 42,
        count: 43,
        samples: ["论文题目（演示）", "目录"],
      },
      {
        key: "abstract-heading",
        editable: false,
        reason: "heading",
        label: "摘要标题",
        structuralRole: "heading",
        structuralRoleLabel: "标题",
        editEligibility: "protected",
        eligibilityReasonCodes: ["heading"],
        startUnit: 43,
        endUnit: 44,
        count: 2,
        samples: ["摘 要", "Abstract"],
      },
      {
        key: "abstract-body",
        editable: true,
        reason: "body_prose",
        label: "摘要正文",
        structuralRole: "body_prose",
        structuralRoleLabel: "正文",
        editEligibility: "eligible",
        eligibilityReasonCodes: ["body_prose_positive_evidence"],
        startUnit: 45,
        endUnit: 54,
        count: 10,
        samples: ["本文围绕智能制造系统的协同控制展开研究……"],
      },
      {
        key: "body-prose",
        editable: true,
        reason: "body_prose",
        label: "论文正文",
        structuralRole: "body_prose",
        structuralRoleLabel: "正文",
        editEligibility: "eligible",
        eligibilityReasonCodes: ["body_prose_positive_evidence"],
        startUnit: 55,
        endUnit: 119,
        count: 65,
        samples: ["本章先说明系统总体架构……", "实验采样周期设为 10 ms……"],
      },
      {
        key: "headings",
        editable: false,
        reason: "heading_or_structure",
        label: "章节标题与编号结构",
        structuralRole: "heading",
        structuralRoleLabel: "章节标题",
        editEligibility: "protected",
        eligibilityReasonCodes: ["heading"],
        startUnit: 120,
        endUnit: 159,
        count: 40,
        samples: ["3 系统总体设计", "3.1 控制器架构"],
      },
      {
        key: "tables-formulas",
        editable: false,
        reason: "table_content",
        label: "表格、题注、公式与图形",
        structuralRole: "table_content",
        structuralRoleLabel: "复杂结构",
        editEligibility: "protected",
        eligibilityReasonCodes: ["table_or_complex_inline"],
        startUnit: 160,
        endUnit: 259,
        count: 100,
        samples: ["表 3-1 控制参数", "式（3-2）"],
      },
      {
        key: "references",
        editable: false,
        reason: "references",
        label: "参考文献",
        structuralRole: "reference_entry",
        structuralRoleLabel: "参考文献",
        editEligibility: "protected",
        eligibilityReasonCodes: ["references"],
        startUnit: 260,
        endUnit: 319,
        count: 60,
        samples: ["[1] 示例作者. 示例文献……"],
      },
      {
        key: "back-matter",
        editable: false,
        reason: "back_matter",
        label: "致谢、模板指导语与后置结构",
        structuralRole: "back_matter",
        structuralRoleLabel: "后置结构",
        editEligibility: "protected",
        eligibilityReasonCodes: ["back_matter", "template_instruction"],
        startUnit: 320,
        endUnit: 395,
        count: 76,
        samples: ["致谢", "注意：此处为模板撰写说明（演示）"],
      },
    ],
  };

  const bodyStartUnit = makeScopeUnit({
    unitIndex: 45,
    textPreview: "本文围绕智能制造系统的协同控制展开研究。",
    editable: true,
    structuralRole: "body_prose",
    protectReason: "",
    flags: { abstractStart: true, bodyStart: true, bookmarkRangeInterior: true },
    insideBookmarkRange: true,
    formatAnchorCount: 0,
  });
  const bodyEndUnit = makeScopeUnit({
    unitIndex: 259,
    textPreview: "上述测试结果验证了系统设计的可行性。",
    editable: true,
    structuralRole: "body_prose",
    protectReason: "",
    flags: { bookmarkRangeInterior: true },
    insideBookmarkRange: true,
    formatAnchorCount: 0,
  });
  const acknowledgementUnit = makeScopeUnit({
    unitIndex: 320,
    textPreview: "致谢",
    editable: false,
    structuralRole: "heading",
    protectReason: "acknowledgement_heading",
    styleName: "标题 1",
    flags: { acknowledgementHeading: true, heading: true },
    hasSemanticRangeAnchor: true,
    hasBookmarkRangeAnchor: true,
    formatAnchorCount: 8,
  });
  const templateInstructionUnit = makeScopeUnit({
    unitIndex: 321,
    textPreview: "注意：此处为模板撰写说明（演示）。",
    editable: false,
    structuralRole: "template_instruction",
    protectReason: "template_instruction",
    flags: { templateInstruction: true },
    formatAnchorCount: 12,
  });
  const referenceUnit = makeScopeUnit({
    unitIndex: 260,
    textPreview: "参考文献",
    editable: false,
    structuralRole: "heading",
    protectReason: "references_heading",
    styleName: "标题 1",
    flags: { referencesHeading: true, heading: true },
    hasSemanticRangeAnchor: true,
    hasBookmarkRangeAnchor: true,
    formatAnchorCount: 8,
  });
  const postBoundaryUnit = makeScopeUnit({
    unitIndex: 395,
    textPreview: "附录说明（演示）",
    editable: false,
    structuralRole: "back_matter",
    protectReason: "back_matter",
    flags: { backMatterHeading: true },
    formatAnchorCount: 0,
  });
  const scopeUnits = [
    bodyStartUnit,
    bodyEndUnit,
    acknowledgementUnit,
    templateInstructionUnit,
    referenceUnit,
    postBoundaryUnit,
  ];

  const scopeDiagnostics = {
    available: true,
    ok: true,
    version: 5,
    sourcePath: DOCUMENT_PATH,
    sourceKind: "docx",
    snapshotPath: "demo/智能制造系统优化研究（演示稿）.snapshot.json",
    path: "demo/智能制造系统优化研究（演示稿）.scope-diagnostics.json",
    message: "Synthetic README fixture: scope diagnostics ready.",
    totalTextUnitCount: 396,
    editableUnitCount: 75,
    protectedUnitCount: 321,
    semanticRangeCount: 14,
    bookmarkRangeCount: 14,
    commentRangeCount: 0,
    semanticRangeTopologyValid: true,
    semanticRangeIssueCount: 0,
    semanticRangeIssueCodes: [],
    semanticRangeCoveredUnitCount: 0,
    editableSemanticRangeCoveredUnitCount: 0,
    bookmarkRangeInteriorUnitCount: 60,
    editableBookmarkRangeInteriorUnitCount: 60,
    commentRangeInteriorUnitCount: 0,
    editableCommentRangeInteriorUnitCount: 0,
    semanticRangeAnchorUnitCount: 24,
    editableSemanticRangeAnchorUnitCount: 0,
    bookmarkRangeAnchorUnitCount: 24,
    commentRangeAnchorUnitCount: 0,
    structuralRolePolicyVersion: 6,
    structuralInventoryVersion: 3,
    protectedStructuralUnitCount: 321,
    protectedTableParagraphCount: 94,
    templateInstructionUnitCount: 3,
    editableTemplateInstructionUnitCount: 0,
    reasonCounts: {
      heading_or_structure: 42,
      table_content: 94,
      references: 60,
      back_matter: 67,
      template_instruction: 3,
    },
    scope: {
      startIndex: 45,
      startReason: "摘要正文起点",
      startUnit: bodyStartUnit,
      endIndex: 259,
      endReason: "参考文献前的最后正文",
      endUnit: bodyEndUnit,
      acknowledgementIndex: 320,
      acknowledgementUnit,
      postAcknowledgementBoundaryIndex: 395,
      postAcknowledgementBoundaryUnit: postBoundaryUnit,
    },
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
    issues: [],
    truncatedIssues: 0,
    units: scopeUnits,
  };

  const baselineRisks = [
    { code: "template_connector", level: "high", message: "模板化衔接较集中", points: 3, dimensionId: "template" },
    { code: "sentence_uniformity", level: "high", message: "句式长度较均一", points: 3, dimensionId: "sentence" },
    { code: "paragraph_uniformity", level: "medium", message: "相邻段落结构相似", points: 2, dimensionId: "paragraph" },
    { code: "abstract_padding", level: "medium", message: "抽象填充表达偏多", points: 2, dimensionId: "abstract" },
  ];
  const currentRisks = [
    { code: "template_connector", level: "medium", message: "少量模板化衔接", points: 2, dimensionId: "template" },
    { code: "paragraph_uniformity", level: "low", message: "个别段落结构仍接近", points: 1, dimensionId: "paragraph" },
  ];
  const baselineDimensions = [
    { id: "template", label: "模板化衔接", description: "衔接表达的重复与集中程度", action: "减少固定连接词堆叠", riskCount: 6, highRiskCount: 2, riskPoints: 20, status: "focus", riskCodes: ["template_connector"] },
    { id: "sentence", label: "句式均一", description: "句长和句法节奏是否过于一致", action: "按语义自然调整句式", riskCount: 5, highRiskCount: 2, riskPoints: 18, status: "focus", riskCodes: ["sentence_uniformity"] },
    { id: "paragraph", label: "段落结构", description: "相邻段落组织方式是否重复", action: "根据论证关系调整展开方式", riskCount: 4, highRiskCount: 1, riskPoints: 14, status: "watch", riskCodes: ["paragraph_uniformity"] },
    { id: "abstract", label: "抽象填充", description: "缺少信息增量的抽象表达", action: "保留具体事实并压缩空泛表达", riskCount: 5, highRiskCount: 1, riskPoints: 16, status: "watch", riskCodes: ["abstract_padding"] },
  ];
  const currentDimensions = [
    { ...baselineDimensions[0], riskCount: 2, highRiskCount: 0, riskPoints: 8, status: "watch" },
    { ...baselineDimensions[1], riskCount: 2, highRiskCount: 0, riskPoints: 7, status: "watch" },
    { ...baselineDimensions[2], riskCount: 2, highRiskCount: 0, riskPoints: 9, status: "watch" },
    { ...baselineDimensions[3], riskCount: 2, highRiskCount: 0, riskPoints: 10, status: "watch" },
  ];
  const baselineStage = {
    id: "source",
    label: "原文基线",
    round: null,
    originalCharCount: 3820,
    analyzedCharCount: 3820,
    truncated: false,
    riskCount: 20,
    highRiskCount: 6,
    riskPoints: 68,
    risks: baselineRisks,
    dimensions: baselineDimensions,
    metrics: makeStageMetrics({ sentenceLengthVariation: 0.18, burstinessRatio: 0.12, adjacentParagraphUniformity: 0.48 }),
  };
  const roundOneStage = {
    id: "round-1",
    label: "第 1 轮",
    round: 1,
    originalCharCount: 3820,
    analyzedCharCount: 3760,
    truncated: false,
    riskCount: 14,
    highRiskCount: 2,
    riskPoints: 46,
    risks: currentRisks,
    dimensions: currentDimensions.map((item) => ({ ...item, riskPoints: item.riskPoints + 3 })),
    metrics: makeStageMetrics({ charCount: 3760, sentenceLengthVariation: 0.34, burstinessRatio: 0.24, adjacentParagraphUniformity: 0.31 }),
  };
  const currentStage = {
    id: "round-2",
    label: "第 2 轮",
    round: 2,
    originalCharCount: 3820,
    analyzedCharCount: 3715,
    truncated: false,
    riskCount: 8,
    highRiskCount: 0,
    riskPoints: 34,
    risks: currentRisks,
    dimensions: currentDimensions,
    metrics: makeStageMetrics({ charCount: 3715 }),
  };

  const contentContract = {
    version: 3,
    policy: "docx-fixed-format-body-only",
    stage: "rate-audit",
    createdAt: "2026-07-18T20:35:00.000000Z",
    sourceKind: "docx",
    sourcePath: DOCUMENT_PATH,
    sourceSha256: sha("4"),
    snapshotPath: "demo/智能制造系统优化研究（演示稿）.snapshot.json",
    snapshotVersion: 22,
    snapshotCurrent: true,
    scopeDigest: sha("5"),
    formatDigest: sha("6"),
    formatLockPolicy: "source-ooxml-lock",
    formatLockApplicable: true,
    formatLockReady: true,
    scopeReady: true,
    editableUnitCount: 75,
    protectedUnitCount: 321,
    headingCount: 42,
    protectedHeadingCount: 42,
    editableHeadingCount: 0,
    semanticRangeCount: 14,
    bookmarkRangeCount: 14,
    commentRangeCount: 0,
    semanticRangeTopologyValid: true,
    semanticRangeIssueCount: 0,
    semanticRangeIssueCodes: [],
    semanticRangeAnchorUnitCount: 24,
    protectedSemanticRangeAnchorUnitCount: 24,
    editableSemanticRangeAnchorUnitCount: 0,
    semanticRangeCoveredUnitCount: 0,
    protectedSemanticRangeCoveredUnitCount: 0,
    editableSemanticRangeCoveredUnitCount: 0,
    bookmarkRangeInteriorUnitCount: 60,
    protectedBookmarkRangeInteriorUnitCount: 0,
    editableBookmarkRangeInteriorUnitCount: 60,
    semanticPointReferenceUnitCount: 8,
    protectedSemanticPointReferenceUnitCount: 8,
    editableSemanticPointReferenceUnitCount: 0,
    modelInputUnitCount: 75,
    modelInputMatchesEditableUnits: true,
    extractedTextPath: "demo/智能制造系统优化研究（演示稿）.txt",
    extractedTextMatchesEditableUnits: true,
    bodyMapPresent: true,
    bodyMapReady: true,
    scopeDiagnosticsOk: true,
    exportPath: "",
    exportSha256: "",
    exportEvidence: {},
    ready: true,
    issueCount: 0,
    warningCount: 0,
    issues: [],
    truncatedIssues: 0,
    reportPath: "demo/智能制造系统优化研究（演示稿）.content-contract.json",
  };

  const rateAudit = {
    version: 3,
    label: "写作信号诊断",
    isAiDetector: false,
    disclaimer: "本报告是离线、可解释的写作信号诊断，不是第三方 AI 检测器，也不承诺任何平台的通过率；最终仍需结合事实、引用、可读性和用户所在机构要求人工复核。",
    createdAt: "2026-07-18T20:36:00.000000Z",
    sourcePath: DOCUMENT_PATH,
    currentOutputPath: ROUND_TWO_OUTPUT,
    sourceOnly: false,
    stageCount: 3,
    baseline: baselineStage,
    current: currentStage,
    stages: [baselineStage, roundOneStage, currentStage],
    delta: {
      beforeRiskPoints: 68,
      afterRiskPoints: 34,
      riskPointChange: -34,
      beforeRiskCount: 20,
      afterRiskCount: 8,
      relativeRiskChangePercent: -50,
      improvedDimensionCount: 4,
      regressedDimensionCount: 0,
      stableDimensionCount: 0,
      dimensions: [
        { id: "template", label: "模板化衔接", beforeRiskPoints: 20, afterRiskPoints: 8, riskPointChange: -12, trend: "improved" },
        { id: "sentence", label: "句式均一", beforeRiskPoints: 18, afterRiskPoints: 7, riskPointChange: -11, trend: "improved" },
        { id: "paragraph", label: "段落结构", beforeRiskPoints: 14, afterRiskPoints: 9, riskPointChange: -5, trend: "improved" },
        { id: "abstract", label: "抽象填充", beforeRiskPoints: 16, afterRiskPoints: 10, riskPointChange: -6, trend: "improved" },
      ],
    },
    hotspotCount: 2,
    hotspots: [
      {
        chunkId: "p001-c01",
        paragraphIndex: 0,
        chunkIndex: 0,
        excerpt: "本章先说明系统总体架构，再分析控制层、通信层和执行层之间的数据交互关系。",
        riskCount: 1,
        highRiskCount: 0,
        riskPoints: 2,
        dimensionIds: ["template"],
        risks: [currentRisks[0]],
      },
      {
        chunkId: "p003-c01",
        paragraphIndex: 2,
        chunkIndex: 0,
        excerpt: "为维持控制过程稳定，通信异常时系统会将当前状态写入本地缓存，待链路恢复后继续执行。",
        riskCount: 1,
        highRiskCount: 0,
        riskPoints: 1,
        dimensionIds: ["paragraph"],
        risks: [currentRisks[1]],
      },
    ],
    recommendations: [
      {
        dimensionId: "template",
        label: "模板化衔接",
        priority: "low",
        trend: "improved",
        riskCount: 2,
        highRiskCount: 0,
        riskPoints: 8,
        reason: "该维度相对原文已经明显下降，不建议继续对自然段落施压。",
        action: "仅人工抽查剩余热区，事实和可读性稳定时保留当前文本。",
        targetChunkIds: ["p001-c01"],
        targetScope: "hotspots",
        maxAttempts: 2,
        canExecute: false,
        manualReviewReason: "当前信号较低，继续自动改写的收益不足。",
      },
      {
        dimensionId: "paragraph",
        label: "段落结构",
        priority: "low",
        trend: "improved",
        riskCount: 2,
        highRiskCount: 0,
        riskPoints: 9,
        reason: "相邻段落差异已经扩大，剩余提示不构成自动重写依据。",
        action: "结合上下文人工确认段落衔接，不为降低统计值机械改写。",
        targetChunkIds: ["p003-c01"],
        targetScope: "hotspots",
        maxAttempts: 2,
        canExecute: false,
        manualReviewReason: "需要结合论文上下文判断。",
      },
    ],
    strategyPlan: {
      version: 3,
      decision: "stop",
      label: "当前结果稳定",
      recommendedPromptId: "",
      currentPromptId: "round2",
      nextPromptId: "",
      dimensionId: "",
      dimensionLabel: "",
      blockingManualDimensions: [],
      blockingManualDimensionCount: 0,
      executableQueue: [],
      executableQueueCount: 0,
      selectedExecutableDimensionId: "",
      manualReviewRequired: false,
      manualReviewStillRequired: false,
      hardStop: false,
      plateauReached: false,
      plateauReason: "",
      reason: "四个主要维度均相对原文改善，当前没有必须继续自动处理的退化维度。",
      action: "转入 Diff 人工审阅与 Word 导出完整性检查。",
      targetChunkIds: [],
      targetChunkCount: 0,
      contentContractReady: true,
      scopeContractReady: true,
      formatContractReady: true,
      canExecute: false,
    },
    plateau: {
      reached: false,
      reason: "",
      hardStop: false,
      dimensionId: "",
      targetChunkIds: [],
      targetChunkCount: 0,
      attemptLimit: 2,
      preservedPreviousText: true,
      manualReviewRequired: false,
    },
    strategyBinding: null,
    contentContract,
    readiness: {
      status: "ready",
      strategyDecisionReady: true,
      contentContractReady: true,
      scopeContractReady: true,
      formatContractReady: true,
      runReady: true,
      preExportReady: true,
      blockedReason: "",
    },
  };

  return {
    authStatus: {
      ok: true,
      enabled: false,
      authenticated: true,
      username: "",
      csrfToken: "",
      sessionExpiresAt: "",
    },
    backendRuntime: {
      ok: true,
      service: "fyadr-web",
      createdAt: "2026-07-18T18:00:00.000000Z",
      maxRewriteConcurrency: 16,
    },
    health: {
      ok: true,
      createdAt: "2026-07-18T18:00:00.000000Z",
      workspace: "demo/runtime",
      activeRunCount: 0,
      checks: [
        { key: "frontend", label: "生产前端", ok: true, level: "success", message: "Synthetic fixture ready." },
        { key: "storage", label: "本地存储", ok: true, level: "success", message: "Synthetic fixture ready." },
      ],
      paths: [],
      activeRuns: [],
      activeBatchRerunCount: 0,
      activeBatchReruns: [],
      recentRunCount: 0,
      recentRuns: [],
      recentBatchRerunCount: 0,
      recentBatchReruns: [],
      taskCount: 0,
      tasks: [],
      recentTaskCount: 0,
      recentTasks: [],
      config: {
        path: "demo/runtime/model-config.json",
        exists: true,
        hasBaseUrl: true,
        hasApiKey: true,
        model: "academic-rewrite-demo",
        apiType: "chat_completions",
        promptProfile: "cn_custom",
        promptSequence,
        rewriteConcurrency: 4,
        maxRewriteConcurrency: 16,
        requestTimeoutSeconds: 600,
        effectiveRewriteTimeoutSeconds: 600,
        maxRetries: 3,
        providerCount: 1,
        enabledProviderCount: 1,
        customRoundCount: 0,
      },
      runtime: {
        pythonVersion: "3.x (synthetic)",
        pythonExecutable: "demo/python",
        platform: "synthetic",
      },
    },
    modelConfig,
    modelCatalog: {
      ok: true,
      message: "Synthetic catalog ready.",
      endpoint: `${EXAMPLE_BASE_URL}/models`,
      status: 200,
      total: 3,
      models: [
        { id: "academic-rewrite-demo", ownedBy: "synthetic" },
        { id: "general-chat-demo", ownedBy: "synthetic" },
        { id: "reasoning-demo", ownedBy: "synthetic" },
      ],
    },
    prompts: {
      ok: true,
      promptDir: "prompts",
      items: promptItems,
      workflows: promptWorkflows,
    },
    historyList: { items: [historyItem], total: 1 },
    historyArtifacts: {
      ok: true,
      source: "synthetic",
      filters: { exists: "missing", limit: 8, offset: 0, kinds: [] },
      items: [],
      total: 0,
      limit: 8,
      offset: 0,
      hasMore: false,
      stats: artifactStats,
    },
    documentStatus: {
      docId: DOC_ID,
      promptProfile: "cn_custom",
      promptSequence,
      sourcePath: DOCUMENT_PATH,
      sourceKind: "docx",
      completedRounds: [1, 2],
      nextRound: 3,
      plannedRounds: 3,
      maxRounds: 12,
      hasNextRound: true,
      isComplete: false,
      currentInputPath: ROUND_TWO_OUTPUT,
      currentOutputPath: "",
      manifestPath: "demo/智能制造系统优化研究（演示稿）.manifest.json",
      latestOutputPath: ROUND_TWO_OUTPUT,
      extractedFromDocx: true,
    },
    documentHistory: {
      docId: DOC_ID,
      sourcePath: DOCUMENT_PATH,
      artifactStats,
      rounds: historyRounds,
    },
    protectionMap,
    scopeDiagnostics,
    roundProgressStatus: {
      sourcePath: DOCUMENT_PATH,
      promptProfile: "cn_custom",
      promptSequence,
      round: 3,
      checkpointExists: false,
      canResume: false,
      completedChunks: 0,
      totalChunks: 0,
      remainingChunks: 0,
      progressPercent: 0,
      checkpointPath: "",
      lastError: "",
      updatedAt: "2026-07-18T20:40:00.000000Z",
      validationEventCount: 0,
      message: "第 2 轮已完成，可按需继续第 3 轮。",
      activeRun: null,
    },
    roundSnapshot,
    rateAudit,
  };
}

class BrowserProcess {
  constructor(executable, args) {
    this.logs = [];
    this.exitCode = null;
    this.process = spawn(executable, args, {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const append = (stream, chunk) => {
      this.logs.push(`[${stream}] ${String(chunk || "")}`);
      if (this.logs.length > 100) this.logs.splice(0, this.logs.length - 100);
    };
    this.process.stdout?.on("data", (chunk) => append("stdout", chunk));
    this.process.stderr?.on("data", (chunk) => append("stderr", chunk));
    this.process.on("exit", (code) => {
      this.exitCode = code;
    });
  }

  tail() {
    return this.logs.join("").slice(-8000);
  }

  async stop() {
    if (!this.process || this.exitCode !== null) return;
    this.process.kill("SIGTERM");
    const exited = await Promise.race([
      new Promise((resolveExit) => this.process.once("exit", () => resolveExit(true))),
      wait(3000).then(() => false),
    ]);
    if (!exited && this.exitCode === null) {
      this.process.kill("SIGKILL");
      await Promise.race([
        new Promise((resolveExit) => this.process.once("exit", () => resolveExit(true))),
        wait(2000),
      ]);
    }
  }
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.callbacks = new Map();
    this.eventHandlers = new Map();
  }

  connect() {
    return new Promise((resolveConnect, rejectConnect) => {
      this.socket = new WebSocket(this.webSocketUrl);
      this.socket.addEventListener("open", () => resolveConnect());
      this.socket.addEventListener(
        "error",
        () => rejectConnect(new Error("Failed to connect to browser CDP websocket.")),
        { once: true },
      );
      this.socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data || "{}"));
        if (message.id && this.callbacks.has(message.id)) {
          const callbacks = this.callbacks.get(message.id);
          this.callbacks.delete(message.id);
          if (message.error) callbacks.reject(new Error(message.error.message || JSON.stringify(message.error)));
          else callbacks.resolve(message.result || {});
          return;
        }
        if (message.method) {
          for (const handler of this.eventHandlers.get(message.method) || []) handler(message.params || {});
        }
      });
    });
  }

  on(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(`Browser CDP socket is not open for ${method}.`));
    }
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      this.callbacks.set(id, { resolve: resolveSend, reject: rejectSend });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.socket?.close();
    } catch {
      // Best-effort close; the browser process is terminated in finally.
    }
  }
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

async function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, rejectTimeout) => {
    timer = setTimeout(() => rejectTimeout(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function requestOk(url, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await requestOk(url)) return;
    await wait(300);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function getBrowserCandidates() {
  return [
    process.env.FYADR_CAPTURE_BROWSER,
    "/snap/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/microsoft-edge-stable",
  ].filter((candidate, index, values) => candidate && values.indexOf(candidate) === index);
}

function findBrowserExecutable() {
  const executable = getBrowserCandidates().find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("未找到 Chromium / Chrome；可设置 FYADR_CAPTURE_BROWSER 后重试。");
  }
  return executable;
}

function getFreePort() {
  return new Promise((resolvePort, rejectPort) => {
    const server = net.createServer();
    server.unref();
    server.on("error", rejectPort);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
  });
}

async function evaluate(client, expression, timeoutMs = 6000) {
  const result = await withTimeout(
    client.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      timeout: timeoutMs,
    }),
    timeoutMs + 1000,
    `Runtime.evaluate timed out: ${expression.slice(0, 100)}`,
  );
  if (result.exceptionDetails) {
    throw new Error(`Browser evaluation failed: ${JSON.stringify(result.exceptionDetails)}`);
  }
  return result.result?.value;
}

async function waitForExpression(client, expression, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression, 4000)) return;
    await wait(200);
  }
  const body = await evaluate(client, "document.body?.innerText?.slice(0, 3000) ?? ''", 4000);
  throw new Error(`Timed out waiting for ${label}.\nCurrent page text:\n${body}`);
}

async function waitForText(client, text, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return waitForExpression(
    client,
    `document.body?.innerText?.includes(${JSON.stringify(text)}) ?? false`,
    `text: ${text}`,
    timeoutMs,
  );
}

async function clickByText(client, text, timeoutMs = 12_000) {
  const expression = `(() => {
    const needle = ${JSON.stringify(text)};
    const selector = 'button,a,[role="button"],[data-sidebar="menu-button"],summary';
    const candidates = Array.from(document.querySelectorAll(selector)).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
        && !element.disabled && element.getAttribute('aria-disabled') !== 'true';
    });
    const label = (element) => [element.innerText, element.getAttribute('aria-label'), element.title]
      .filter(Boolean).join(' ').replace(/\\s+/g, ' ').trim();
    const target = candidates.find((element) => label(element) === needle)
      || candidates.find((element) => label(element).includes(needle));
    if (!target) return false;
    target.scrollIntoView({ block: 'center', inline: 'center' });
    if (target.getAttribute('role') === 'tab') {
      target.focus();
    } else {
      target.click();
    }
    return true;
  })()`;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(client, expression, 4000)) {
      await wait(200);
      return;
    }
    await wait(200);
  }
  throw new Error(`Unable to click visible control containing: ${text}`);
}

async function activateTabByText(client, text, timeoutMs = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const state = await evaluate(client, `(() => {
      const target = Array.from(document.querySelectorAll('[role="tab"]'))
        .find((element) => element.textContent?.trim() === ${JSON.stringify(text)});
      if (!(target instanceof HTMLElement) || target.hasAttribute('disabled')) return { found: false, selected: false };
      target.focus();
      return { found: true, selected: target.getAttribute('aria-selected') === 'true' };
    })()`, 4000);
    if (state?.selected) return;
    if (state?.found) {
      await client.send("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
        text: "\r",
      });
      await client.send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    }
    await wait(200);
  }
  throw new Error(`Unable to activate visible tab: ${text}`);
}

function buildInitScript(fixtures) {
  return `(() => {
    const fixtures = ${JSON.stringify(fixtures)};
    const nativeFetch = globalThis.fetch.bind(globalThis);
    const response = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-FYADR-Synthetic-Fixture': 'readme',
      },
    });
    const records = [];
    const unknown = [];
    globalThis.__FYADR_README_MOCK__ = { records, unknown, synthetic: true };
    try {
      localStorage.setItem('fyadr.activeDocument', ${JSON.stringify(DOCUMENT_PATH)});
      localStorage.setItem('fyadr.activePromptProfile', 'cn_custom');
      localStorage.setItem('fyadr.activePromptSequence', JSON.stringify(['prewrite', 'round1', 'round2']));
      localStorage.setItem('fyadr.themeMode', 'dark');
      localStorage.setItem('fyadr.themeMode.defaultDarkMigrated', '1');
    } catch (error) {
      throw new Error('Unable to seed isolated README fixture storage: ' + String(error));
    }
    globalThis.fetch = async (input, init) => {
      const rawUrl = typeof input === 'string' || input instanceof URL ? String(input) : String(input?.url || '');
      const url = new URL(rawUrl, location.href);
      if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
      const method = String(init?.method || (typeof input === 'object' && input?.method) || 'GET').toUpperCase();
      records.push({ method, path: url.pathname, query: url.search });
      switch (url.pathname) {
        case '/api/auth/status': return response(fixtures.authStatus);
        case '/api/ping': return response(fixtures.backendRuntime);
        case '/api/health': return response(fixtures.health);
        case '/api/model-config': return response(fixtures.modelConfig);
        case '/api/list-models': return response(fixtures.modelCatalog);
        case '/api/prompts': return response(fixtures.prompts);
        case '/api/history-documents': return response(fixtures.historyList);
        case '/api/history-artifacts': return response(fixtures.historyArtifacts);
        case '/api/document-status': return response(fixtures.documentStatus);
        case '/api/document-history': return response(fixtures.documentHistory);
        case '/api/document-protection-map': return response(fixtures.protectionMap);
        case '/api/document-scope-diagnostics': return response(fixtures.scopeDiagnostics);
        case '/api/round-progress-status': return response(fixtures.roundProgressStatus);
        case '/api/round-snapshot': return response(fixtures.roundSnapshot);
        case '/api/rate-audit': return response(fixtures.rateAudit);
        default:
          unknown.push({ method, path: url.pathname, query: url.search });
          return response({ ok: false, error: 'Synthetic README fixture has no route for this API.' }, 404);
      }
    };
    const installCaptureStyle = () => {
      if (document.getElementById('fyadr-readme-capture-style')) return;
      const style = document.createElement('style');
      style.id = 'fyadr-readme-capture-style';
      style.textContent = '*{animation:none!important;transition:none!important;caret-color:transparent!important}';
      (document.head || document.documentElement).appendChild(style);
    };
    installCaptureStyle();
    document.addEventListener('DOMContentLoaded', installCaptureStyle, { once: true });
  })()`;
}

async function getPageWebSocket(debugPort) {
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("Unable to find the Chromium page target.");
  return page.webSocketDebuggerUrl;
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
    screenWidth: width,
    screenHeight: height,
  });
  await wait(220);
}

async function prepareFrame(client) {
  await evaluate(client, `(() => {
    for (const element of document.querySelectorAll('*')) {
      if (element.scrollTop > 0) element.scrollTop = 0;
      if (element.scrollLeft > 0) element.scrollLeft = 0;
    }
    return true;
  })()`, 5000);
  await evaluate(client, "document.fonts?.ready?.then(() => true) ?? true", 8000);
  await wait(300);
}

async function visibleLeafText(client) {
  return evaluate(client, `(() => Array.from(document.querySelectorAll('body *'))
    .filter((element) => {
      if (element.children.length) return false;
      const text = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
      if (!text) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
        && rect.top < innerHeight && rect.left < innerWidth
        && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) !== 0;
    })
    .map((element) => (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim())
    .join(' | '))()`, 6000);
}

function assertWebp(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 16 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error(`Chromium did not produce a valid WebP asset: ${path}`);
  }
}

async function captureAsset(client, definition) {
  await setViewport(client, definition.width, definition.height);
  await prepareFrame(client);
  const text = await visibleLeafText(client);
  const missing = definition.expectedText.filter((needle) => !text.includes(needle));
  if (missing.length) {
    throw new Error(`${definition.fileName} is missing visible text: ${missing.join(", ")}\nVisible text:\n${text}`);
  }
  const result = await client.send("Page.captureScreenshot", {
    format: "webp",
    quality: WEBP_QUALITY,
    captureBeyondViewport: false,
    fromSurface: true,
  });
  if (!result.data) throw new Error(`No screenshot payload returned for ${definition.fileName}`);
  const outputPath = resolve(OUTPUT_DIR, definition.fileName);
  writeFileSync(outputPath, Buffer.from(result.data, "base64"));
  assertWebp(outputPath);
  return {
    fileName: definition.fileName,
    path: outputPath,
    width: definition.width,
    height: definition.height,
    bytes: statSync(outputPath).size,
    expectedText: definition.expectedText,
  };
}

async function main() {
  if (!(await requestOk(TARGET_URL))) {
    throw new Error(`FYADR production frontend is not reachable at ${TARGET_URL}. Start the local-only service first.`);
  }
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const fixtures = buildFixtures();
  const executable = findBrowserExecutable();
  const debugPort = await getFreePort();
  const userDataDir = mkdtempSync(join(tmpdir(), "fyadr-readme-capture-"));
  let browser = null;
  let client = null;
  const assets = [];
  try {
    const args = [
      "--headless=new",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-features=Translate,MediaRouter,OptimizationHints",
      "--disable-gpu",
      "--disable-sync",
      "--hide-scrollbars",
      "--metrics-recording-only",
      "--mute-audio",
      "--window-size=1600,1100",
      "about:blank",
    ];
    if (typeof process.getuid === "function" && process.getuid() === 0) args.unshift("--no-sandbox");
    browser = new BrowserProcess(executable, args);
    await waitForHttp(`http://127.0.0.1:${debugPort}/json/version`, DEFAULT_TIMEOUT_MS);
    client = new CdpClient(await getPageWebSocket(debugPort));
    await client.connect();
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Page.addScriptToEvaluateOnNewDocument", { source: buildInitScript(fixtures) });
    await setViewport(client, 1600, 1100);
    await client.send("Page.navigate", { url: TARGET_URL });

    await waitForText(client, "智能制造系统优化研究（演示稿）.docx");
    await waitForText(client, "可导出");
    await waitForText(client, "改写对照");
    assets.push(await captureAsset(client, {
      fileName: "01-workbench.webp",
      width: 1600,
      height: 1000,
      expectedText: ["任务控制台", "输出与导出", "可导出", "新增/删除", "实验采样周期设为 10 ms"],
    }));

    await clickByText(client, "降检报告");
    await waitForText(client, "降检策略 × 正文与格式硬约束");
    await waitForText(client, "正文范围已锁定");
    assets.push(await captureAsset(client, {
      fileName: "02-quality-audit.webp",
      width: 1600,
      height: 1100,
      expectedText: ["降检诊断", "相对原文减少 34 个风险点", "降检策略 × 正文与格式硬约束", "正文范围已锁定", "书签内安全正文 60"],
    }));

    await clickByText(client, "保护区地图");
    await waitForText(client, "模板撰写指导语已冻结");
    await waitForText(client, "Word 书签与批注范围已分类保护");
    assets.push(await captureAsset(client, {
      fileName: "03-docx-protection.webp",
      width: 1600,
      height: 1100,
      expectedText: ["文档边界地图", "结构角色 v6", "模板指导语 3", "模板撰写指导语已冻结", "Word 书签与批注范围已分类保护"],
    }));

    await clickByText(client, "模型配置");
    await waitForText(client, "流式接收");
    assets.push(await captureAsset(client, {
      fileName: "04-model-routing.webp",
      width: 1600,
      height: 1000,
      expectedText: ["模型配置", "默认连接", "3 个模型", "流式接收", "思考字段不会进入论文/日志"],
    }));

    await clickByText(client, "历史记录");
    await waitForText(client, "继续处理与导出");
    const historyNeedsExpansion = await evaluate(
      client,
      `document.body?.innerText?.includes("展开（1）") ?? false`,
      4000,
    );
    if (historyNeedsExpansion) await clickByText(client, "展开（1）");
    await waitForText(client, "第 2 轮");
    assets.push(await captureAsset(client, {
      fileName: "05-history.webp",
      width: 1600,
      height: 1000,
      expectedText: ["继续处理与导出", "智能制造系统优化研究（演示稿）.docx", "第 2 轮", "导出 可导出", "已整理"],
    }));

    await clickByText(client, "提示词");
    await waitForText(client, "提示词库");
    await activateTabByText(client, "流程模板");
    await waitForText(client, "默认轮次编排");
    assets.push(await captureAsset(client, {
      fileName: "06-prompt-workflows.webp",
      width: 1600,
      height: 1100,
      expectedText: ["流程模板", "自定义组合", "可编辑", "流程名称", "默认编排上限", "运行轮次上限", "默认轮次编排", "润色改写", "规范改写", "专家改写", "保存流程"],
    }));

    const mockState = await evaluate(client, `({
      records: globalThis.__FYADR_README_MOCK__?.records ?? [],
      unknown: globalThis.__FYADR_README_MOCK__?.unknown ?? [],
      synthetic: globalThis.__FYADR_README_MOCK__?.synthetic === true,
    })`, 5000);
    if (!mockState?.synthetic) throw new Error("Synthetic API interceptor was not active.");
    if (mockState.unknown.length) {
      throw new Error(`Unexpected API calls were blocked by the synthetic interceptor: ${JSON.stringify(mockState.unknown)}`);
    }
    const apiPaths = Array.from(new Set(mockState.records.map((item) => item.path))).sort();
    console.log(JSON.stringify({
      ok: true,
      targetUrl: TARGET_URL,
      browserExecutable: executable,
      syntheticApiOnly: true,
      blockedUnknownApiCount: mockState.unknown.length,
      apiPaths,
      outputDir: OUTPUT_DIR,
      assets,
    }, null, 2));
  } catch (error) {
    const details = browser?.tail() || "";
    throw new Error(`${error instanceof Error ? error.message : String(error)}${details ? `\nBrowser log:\n${details}` : ""}`);
  } finally {
    client?.close();
    await browser?.stop();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

await main();
