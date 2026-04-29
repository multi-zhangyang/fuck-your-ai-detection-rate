import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "detection_matching_regression_report.json");

function loadTypescript() {
  const requireFromApp = createRequire(pathToFileURL(resolve(ROOT_DIR, "app", "package.json")));
  return requireFromApp("typescript");
}

function extractMatchingSource() {
  const source = readFileSync(APP_PATH, "utf-8");
  const start = source.indexOf("type DetectionMatchCandidate =");
  const end = source.indexOf("function buildDetectionRerunFeedback", start);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("Unable to locate detection matching block in app/src/App.tsx.");
  }
  return source.slice(start, end);
}

function loadMatchingModule() {
  const ts = loadTypescript();
  const extracted = extractMatchingSource();
  const moduleSource = `${extracted}

module.exports = {
  normalizeForDetectionMatch,
  scoreDetectionMatch,
  buildDetectionMatches,
  groupDetectionMatchesByChunk,
  groupRiskyDetectionMatches,
  isDetectionRerunRisk,
};
`;
  const transpiled = ts.transpileModule(moduleSource, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const sandbox = { module: { exports: {} }, exports: {}, console };
  vm.runInNewContext(transpiled, sandbox, { filename: "detectionMatching.vm.js" });
  return sandbox.module.exports;
}

function makeReport(segments) {
  return {
    provider: "paperpass",
    providerLabel: "PaperPass",
    sourcePath: "fixture.pdf",
    pageCount: 1,
    summary: {
      title: "",
      author: "",
      reportId: "",
      checkedAt: "",
      model: "",
      totalWords: null,
      overallRiskProbability: 35,
      weightedOverallRiskProbability: null,
      segmentCount: segments.length,
      checkedScopeNotes: [],
      riskBuckets: { high: null, medium: null, low: null, none: null },
    },
    segments,
  };
}

function makeSegment(index, content, probability = 70) {
  return {
    index,
    content,
    matchText: content,
    probability,
    riskLevel: probability >= 70 ? "高风险" : "中风险",
    charCount: content.length,
    sourceProvider: "paperpass",
  };
}

function makeCompare(chunks) {
  return {
    version: 1,
    docId: "fixture-doc",
    round: 2,
    promptProfile: "cn_prewrite",
    inputPath: "",
    outputPath: "",
    manifestPath: "",
    paragraphCount: chunks.length,
    chunkCount: chunks.length,
    chunks,
  };
}

function makeChunk(chunkId, paragraphIndex, outputText, inputText = outputText) {
  return {
    chunkId,
    paragraphIndex,
    chunkIndex: 0,
    inputText,
    outputText,
  };
}

function assertCondition(condition, message, failures) {
  if (!condition) failures.push(message);
}

function runRegression() {
  const matching = loadMatchingModule();
  const failures = [];

  const directSegment = "针对电商场景，如果把用户行为序列当作核心来构建一个兼具高精度、可解释性以及工程可落地性的购买意图预测模型，那么无论是在研究方面还是在实际应用当中，都会有很高的价值。";
  const directCompare = makeCompare([
    makeChunk("p1_c0", 1, "本段讨论数据清洗流程，与购买意图预测模型没有直接重合。"),
    makeChunk("p2_c0", 2, "针对电商场景，如果把用户行为序列当作核心来构建一个兼具高精度、可解释性以及工程可落地性的购买意图预测模型，那么无论是在研究方面还是在实际应用当中，都会有很高的价值。"),
  ]);
  const directMatches = matching.buildDetectionMatches(makeReport([makeSegment(1, directSegment, 70)]), directCompare);
  assertCondition(directMatches.some((match) => match.chunkId === "p2_c0" && match.confidence === "strong"), "direct Chinese segment should strongly match p2_c0", failures);

  const spacedSegment = "近年来， 伴随互联网技术的快速普及以及数字经济的持续深化， 电子商务已经成为居民消费以及商业流通当中的重要形式。";
  const spacedCompare = makeCompare([
    makeChunk("p3_c0", 3, "近年来，伴随互联网技术的快速普及以及数字经济的持续深化，电子商务已经成为居民消费以及商业流通当中的重要形式。"),
  ]);
  const spacedMatches = matching.buildDetectionMatches(makeReport([makeSegment(2, spacedSegment, 69)]), spacedCompare);
  assertCondition(spacedMatches.some((match) => match.chunkId === "p3_c0" && ["strong", "review"].includes(match.confidence)), "PDF spacing noise should still match the right chunk", failures);

  const englishSegment = "According to the experimental results, the accuracy of LSTM, Bi-LSTM, XGBoost, and Random Forest remained stable.";
  const englishCompare = makeCompare([
    makeChunk("p4_c0", 4, "According to the experimental results retained in the project, the accuracy of LSTM, Bi-LSTM, XGBoost, and Random Forest remained stable under the same dataset split."),
    makeChunk("p5_c0", 5, "This paragraph only explains frontend deployment and does not mention the model accuracy comparison."),
  ]);
  const englishMatches = matching.buildDetectionMatches(makeReport([makeSegment(3, englishSegment, 90)]), englishCompare);
  assertCondition(englishMatches.some((match) => match.chunkId === "p4_c0" && match.confidence === "strong"), "English technical segment should strongly match p4_c0", failures);

  const coveredChunkOne = "近年来，伴随互联网技术的快速普及以及数字经济的持续深化，电子商务已经成为居民消费以及商业流通当中的重要形式。在日常购物过程中，平台持续积累用户浏览、收藏、加购和购买等行为数据。";
  const coveredChunkTwo = "与此同时，机器学习、深度学习与序列建模技术的发展，为处理时序行为数据提供了有效手段。以LSTM、Transformer和XGBoost为代表的模型，能够从用户行为序列中提取购买意图线索。";
  const multiChunkSegment = `${coveredChunkOne}${coveredChunkTwo}`;
  const multiChunkMatches = matching.buildDetectionMatches(
    makeReport([makeSegment(5, multiChunkSegment, 70)]),
    makeCompare([
      makeChunk("p7_c0", 7, coveredChunkOne),
      makeChunk("p8_c0", 8, coveredChunkTwo),
      makeChunk("p9_c0", 9, "本段讨论导出排版审计、页边距、目录生成和表格边框，与电商行为序列检测报告片段不属于同一内容。"),
    ]),
  );
  const multiChunkStrongIds = multiChunkMatches.filter((match) => match.confidence === "strong").map((match) => match.chunkId);
  assertCondition(multiChunkStrongIds.includes("p7_c0") && multiChunkStrongIds.includes("p8_c0"), "one report segment covering adjacent paragraphs should strongly match both covered chunks", failures);
  assertCondition(!multiChunkStrongIds.includes("p9_c0"), "multi-chunk coverage must not pull unrelated chunks into strong matches", failures);

  const genericContainedMatches = matching.buildDetectionMatches(
    makeReport([makeSegment(6, "研究背景和方法具有一定价值，但仍需要进一步分析。", 70)]),
    makeCompare([makeChunk("p10_c0", 10, "研究背景和方法")]),
  );
  assertCondition(genericContainedMatches.filter((match) => match.confidence === "strong").length === 0, "short generic contained text must not become a strong match", failures);

  const unrelatedMatches = matching.buildDetectionMatches(
    makeReport([makeSegment(4, "这是一段完全不同的报告内容，讨论水稻病害识别和无人机航拍流程。", 70)]),
    makeCompare([makeChunk("p6_c0", 6, "本文围绕电商用户购买意图预测展开，重点分析序列行为和模型部署。")]),
  );
  assertCondition(unrelatedMatches.filter((match) => match.confidence === "strong").length === 0, "unrelated segment must not become a strong match", failures);

  const grouped = matching.groupDetectionMatchesByChunk(directMatches);
  assertCondition(Array.isArray(grouped.p2_c0) && grouped.p2_c0.length >= 1, "groupDetectionMatchesByChunk should group by chunk id", failures);

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    reportPath: REPORT_PATH,
    failures,
    cases: {
      directMatchCount: directMatches.length,
      spacedMatchCount: spacedMatches.length,
      englishMatchCount: englishMatches.length,
      multiChunkStrongCount: multiChunkStrongIds.length,
      genericContainedStrongCount: genericContainedMatches.filter((match) => match.confidence === "strong").length,
      unrelatedMatchCount: unrelatedMatches.length,
    },
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  return report;
}

try {
  if (!existsSync(APP_PATH)) {
    throw new Error(`Missing App.tsx: ${APP_PATH}`);
  }
  const report = runRegression();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} catch (error) {
  const report = {
    ok: false,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    reportPath: REPORT_PATH,
    failures: [error instanceof Error ? error.message : String(error)],
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
