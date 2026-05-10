import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_batch_rerun_regression_report.json");

function extractFunctionSource(source, functionName) {
  const signature = `async function ${functionName}(`;
  const start = source.indexOf(signature);
  if (start < 0) {
    throw new Error(`Unable to locate ${functionName}.`);
  }
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) {
    throw new Error(`Unable to locate ${functionName} body.`);
  }
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unable to close ${functionName} body.`);
}

function assertIncludes(source, pattern, message, failures) {
  if (!source.includes(pattern)) {
    failures.push(message);
  }
}

function assertNotIncludes(source, pattern, message, failures) {
  if (source.includes(pattern)) {
    failures.push(message);
  }
}

function assertRegex(source, pattern, message, failures) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

function checkPartialFailureContract(source, functionName, failures) {
  const functionSource = extractFunctionSource(source, functionName);
  assertIncludes(functionSource, "runBatchRerunTask(", `${functionName} must delegate batch rerun to the backend task API.`, failures);
  if (functionSource.includes("service.rerunChunk")) {
    failures.push(`${functionName} must not keep the old frontend per-chunk rerun loop.`);
  }
  if (functionName === "handleRerunRiskyChunks") {
    assertIncludes(functionSource, "!unresolvedFailureChunkIds.has(chunk.chunkId)", "Bulk needs-review rerun must not mix unresolved failed chunks into the request.", failures);
    assertIncludes(functionSource, "!isHighRiskFailedOutputChunk(chunk)", "Bulk needs-review rerun must not mix high-risk failed outputs into ordinary needs-review requests.", failures);
  }
}

function checkBackendTaskContract(appSource, resultCardSource, failures) {
  assertIncludes(appSource, "service.startBatchRerun(outputPath, targets, modelConfig)", "Batch rerun must start a backend task.", failures);
  assertIncludes(appSource, "service.getBatchRerunStatus(runId)", "Batch rerun must poll backend task status.", failures);
  assertIncludes(appSource, "service.cancelBatchRerun(session.runId)", "Batch rerun must expose backend cancellation.", failures);
  assertIncludes(appSource, "function attachActiveBatchRerun", "Frontend must be able to re-attach active batch reruns after refresh.", failures);
  assertIncludes(appSource, "result.activeBatchReruns ?? []", "Frontend health probing must inspect active batch reruns.", failures);
  assertIncludes(appSource, "void attachActiveBatchRerun(activeBatch)", "Frontend must auto attach matching active batch reruns.", failures);
  assertIncludes(appSource, "function applyBatchRerunResult", "Batch rerun completion must converge through one result applier.", failures);
  assertIncludes(appSource, "result.failures.map", "Batch rerun failures must be promoted into visible Diff state.", failures);
  assertIncludes(appSource, "result.successChunkIds ?? []", "Batch rerun completion must preserve successful chunk decisions after refresh.", failures);
  assertIncludes(appSource, "batchRerunRunning={Boolean(currentBatchRerunToken)}", "Home ResultCard must receive batch rerun running state.", failures);
  assertIncludes(appSource, "onCancelBatchRerun={() => void handleCancelBatchRerun()}", "Home ResultCard must wire batch rerun cancellation.", failures);
  assertIncludes(appSource, "activeBatchReruns", "Diagnostics/task center must keep active batch rerun fallback data.", failures);
  assertIncludes(appSource, "recentBatchReruns", "Diagnostics must keep persisted batch rerun fallback data after backend restart.", failures);
  assertIncludes(appSource, "function buildDiagnosticTaskItems", "Diagnostics must normalize backend and fallback task summaries together.", failures);
  assertIncludes(appSource, "function DiagnosticTaskAlert", "Diagnostics must render persisted task summaries through one user-facing task component.", failures);
  assertIncludes(appSource, "后台任务", "Diagnostics must label persisted task summaries as one task area.", failures);
  assertIncludes(appSource, "未完成", "Persisted unfinished task summaries must keep a clear status.", failures);
  assertIncludes(resultCardSource, "batchRerunRunning?: boolean;", "ResultCard must expose batch rerun running prop.", failures);
  assertIncludes(resultCardSource, "onCancelBatchRerun?: () => void;", "ResultCard must expose batch rerun cancel prop.", failures);
  assertIncludes(resultCardSource, "停止重跑", "ResultCard must show a stop action during batch rerun.", failures);
}

function checkTargetedRerunFeedbackContract(appSource, resultCardSource, failures) {
  assertIncludes(resultCardSource, "onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)}", "Diff chunk rerun button must forward manual feedback.", failures);
  assertIncludes(resultCardSource, "onClick={() => onRerun(feedback)}", "Chunk quality action must send textbox feedback to the rerun callback.", failures);
  assertRegex(
    appSource,
    /onRerunChunk=\{\(chunkId,\s*userFeedback\)\s*=>\s*void handleRerunChunk\(chunkId,\s*userFeedback\)\}/,
    "Home ResultCard wiring must preserve manual rerun feedback.",
    failures,
  );
  const singleRerunSource = extractFunctionSource(appSource, "handleRerunChunk");
  assertIncludes(singleRerunSource, "service.rerunChunk(outputPath, chunkId, modelConfig, userFeedback)", "Single chunk rerun must send manual feedback to the backend.", failures);
}

function checkRerunFailureVisibilityContract(appSource, resultCardSource, failures) {
  assertIncludes(appSource, "const [rerunFailures, setRerunFailures] = useState<BatchRerunFailure[]>([]);", "App must keep visible rerun failure state.", failures);
  assertIncludes(appSource, "scopeKey?: string;", "Rerun failure records must carry a Diff scope.", failures);
  assertIncludes(appSource, "function getRerunFailureScopeKey", "App must derive a stable Diff scope for rerun failures.", failures);
  assertIncludes(appSource, "function scopeRerunFailures", "Batch failures must be scoped before display.", failures);
  assertIncludes(appSource, "failure.scopeKey === activeRerunFailureScopeKey && activeChunkIds.has(failure.chunkId)", "App must scope rerun failures to the active Diff.", failures);
  assertIncludes(appSource, "function upsertRerunFailure(failure: BatchRerunFailure)", "Single rerun failures must be recorded for the Diff UI.", failures);
  assertIncludes(appSource, "function extractRerunFailureExtras(error: unknown)", "Single rerun failures must extract backend failure details.", failures);
  assertNotIncludes(appSource, "normalizeFailureRejectedCandidates", "Frontend rerun failures must not keep removed candidate payload normalization.", failures);
  assertIncludes(appSource, "upsertRerunFailure({ chunkId, error: message, ...extractRerunFailureExtras(appError) });", "Single rerun failures must preserve concise failure metadata.", failures);
  assertIncludes(appSource, "result.failures.map((failure) => ({ ...failure }))", "Batch rerun failures must preserve backend failure records.", failures);
  assertIncludes(appSource, "setRerunFailures(scopeRerunFailures(failures, latestCompare ?? activeCompareData));", "Batch rerun failures must be promoted into visible scoped Diff state.", failures);
  assertIncludes(appSource, "rerunFailures={activeRerunFailures}", "Home ResultCard must receive active rerun failures.", failures);
  assertIncludes(appSource, "batchRerunStatusText={runtimeLabel}", "Home ResultCard must show live batch rerun status text.", failures);
  assertIncludes(resultCardSource, "rerunFailures?: RerunFailure[];", "ResultCard must expose rerun failure input.", failures);
  assertIncludes(resultCardSource, "batchRerunStatusText?: string;", "ResultCard must expose batch rerun status text.", failures);
  assertNotIncludes(resultCardSource, "rejectedCandidates?: NonNullable<RoundCompareData[\"chunks\"][number][\"rejectedCandidates\"]>;", "ResultCard rerun failures must not carry removed candidate payloads.", failures);
  assertIncludes(resultCardSource, "type DiffFilterMode = \"all\" | \"review\" | \"highRisk\" | \"failed\";", "Diff panel filters must keep high-risk as a compact first-class mode.", failures);
  assertIncludes(resultCardSource, "const [filterMode, setFilterMode] = useState<DiffFilterMode>(\"all\");", "Diff panel must keep filter mode as a typed state.", failures);
  assertIncludes(resultCardSource, "const previousFailedCountRef = useRef(0);", "Diff panel must detect newly appeared failed chunks.", failures);
  assertIncludes(resultCardSource, "setFilterMode(\"failed\");", "Diff panel must auto-focus failed chunks when new failures appear.", failures);
  assertNotIncludes(resultCardSource, "previousCandidateCountRef", "Diff panel must not keep removed candidate-focus state.", failures);
  assertNotIncludes(resultCardSource, "setFilterMode(\"candidate\")", "Diff panel must not auto-focus removed candidate filters.", failures);
  assertIncludes(resultCardSource, "const rerunFailureByChunk = new Map", "Diff panel must map failures by chunk id.", failures);
  assertNotIncludes(resultCardSource, "failureCandidateChunkIdSet", "Diff panel must not keep removed failure-candidate maps.", failures);
  assertNotIncludes(resultCardSource, "failureRejectedCandidates", "Diff panel must not merge removed failure-level candidates.", failures);
  assertNotIncludes(resultCardSource, "const candidateChunkIds = allChunks.filter", "Diff panel must not map removed candidate-only chunks.", failures);
  assertIncludes(resultCardSource, "const changedChunkIds = allChunks.filter", "Diff panel must map chunks with source/rewrite changes.", failures);
  assertIncludes(resultCardSource, "const numberRiskChunkIds = allChunks.filter", "Diff panel must map chunks with numeric risks.", failures);
  assertIncludes(resultCardSource, "const citationRiskChunkIds = allChunks.filter", "Diff panel must map chunks with citation risks.", failures);
  assertIncludes(resultCardSource, "function hasChunkNumberRisk", "Diff panel must detect numeric risk for rewrites.", failures);
  assertIncludes(resultCardSource, "function hasChunkCitationRisk", "Diff panel must detect citation risk for rewrites.", failures);
  assertIncludes(resultCardSource, "function getDiffFilterEmptyState", "Diff panel must keep concise empty states.", failures);
  assertIncludes(resultCardSource, "value=\"failed\" aria-label=\"只看失败\"", "Diff panel must expose the failed-only action when failures exist.", failures);
  assertNotIncludes(resultCardSource, "T.candidateOnly", "Diff panel must not expose candidate-only action.", failures);
  assertIncludes(resultCardSource, "T.changedChunks", "Diff panel must keep source/rewrite change badges.", failures);
  assertIncludes(resultCardSource, "T.numberRisk", "Diff panel must keep numeric risk badges.", failures);
  assertIncludes(resultCardSource, "T.citationRisk", "Diff panel must keep citation risk badges.", failures);
  assertNotIncludes(resultCardSource, "filterMode === \"number\"", "Diff panel must not keep hidden numeric-only filters.", failures);
  assertNotIncludes(resultCardSource, "filterMode === \"citation\"", "Diff panel must not keep hidden citation-only filters.", failures);
  assertNotIncludes(resultCardSource, "T.rerunFailureSummary", "Failed chunks must not show verbose summary copy.", failures);
  assertNotIncludes(resultCardSource, "T.rerunFailureHint", "Failed chunks must not show verbose helper copy.", failures);
  assertIncludes(resultCardSource, "批量重跑进行中", "ResultCard must keep batch rerun status visible in the main result area.", failures);
  assertNotIncludes(resultCardSource, "function inspectRejectedCandidate", "Rejected candidate inspection must stay removed from the UI.", failures);
  assertNotIncludes(resultCardSource, "function getRejectedCandidateReasons", "Rejected candidate reasons must stay removed from the UI.", failures);
  assertNotIncludes(resultCardSource, "function buildRejectedCandidatesRerunFeedback", "Rejected candidate rerun helpers must stay removed from the UI.", failures);
  assertNotIncludes(resultCardSource, "function getLatestRejectedCandidate", "Rejected candidate previews must stay removed.", failures);
  assertNotIncludes(resultCardSource, "function buildRejectedCandidateDecision", "Rejected candidate adoption helpers must stay removed.", failures);
  assertNotIncludes(resultCardSource, "T.adoptRejected", "Rejected candidate UI must not expose one-click adoption.", failures);
  assertNotIncludes(resultCardSource, "T.adoptAllRejected", "Output action row must not expose removed candidate adoption.", failures);
  assertNotIncludes(resultCardSource, "TriangleAlert", "Rejected candidate warning action icon must stay removed with the action.", failures);
  assertNotIncludes(resultCardSource, "T.highRiskCandidate", "Rejected candidate high-risk surfaces must stay removed.", failures);
  assertNotIncludes(resultCardSource, "candidateAdoptableCount", "Bulk candidate adoption state must stay removed.", failures);
  assertNotIncludes(appSource, "function collectAdoptableRejectedCandidates", "Bulk candidate adoption must stay removed.", failures);
  assertNotIncludes(appSource, "function handleAdoptAllRejectedCandidates", "Bulk candidate adoption handler must stay removed.", failures);
  assertNotIncludes(appSource, "buildRejectedCandidateReviewDecision", "Bulk candidate adoption decision builder must stay removed.", failures);
  assertIncludes(resultCardSource, "function getChunkReviewReasons", "Needs-review chunks must expose visible quality reasons.", failures);
  assertNotIncludes(resultCardSource, "<AlertTitle>报错</AlertTitle>", "Ordinary user UI must not expose raw fallback errors.", failures);
  assertNotIncludes(resultCardSource, "compactFeedbackText(chunk.fallbackError", "Fallback error detail must stay out of the review UI.", failures);
  assertNotIncludes(resultCardSource, "读取本块原因与当前轮配置", "Targeted rerun UI must not repeat verbose helper copy.", failures);
  assertNotIncludes(resultCardSource, "右侧仅预览，默认不导出。", "Rejected candidate UI must not repeat preview/export helper copy.", failures);
  assertNotIncludes(resultCardSource, "模型连续输出未通过硬校验，本块没有采用不合格改写。", "Fallback UI must avoid duplicate hard-check boilerplate.", failures);
  assertNotIncludes(resultCardSource, "重跑指令", "Manual rerun panel must not render redundant headings.", failures);
  assertNotIncludes(resultCardSource, "candidateFeedback", "Candidate rerun feedback plumbing must stay removed.", failures);
  assertNotIncludes(resultCardSource, "candidateReasons", "Candidate reason plumbing must stay removed.", failures);
  assertNotIncludes(resultCardSource, "onRerun(candidateFeedback)", "Candidate cards must not expose one-click rerun.", failures);
  assertIncludes(resultCardSource, "forceNeedsReview={needsReview}", "Diff-level review state must be passed into the chunk quality bar.", failures);
  assertIncludes(resultCardSource, "const reviewToolsVisible = !isConfirmed && (qualityNeedsReview || isValidationFallback);", "Confirmed chunks and candidate-only chunks should not open the manual feedback panel.", failures);
  assertIncludes(resultCardSource, "!isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk))", "Diff review and high-risk counts must only include unresolved chunks.", failures);
  assertIncludes(resultCardSource, "!failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId)", "Ordinary needs-review counts must not double-count failed or high-risk outputs.", failures);
  assertIncludes(appSource, "function normalizeReviewDecisionsForSave", "Review decision saves must not collapse default and confirmed choices together.", failures);
  assertIncludes(appSource, "isFailedOutputDecision(decision) && decision.confirmed !== true", "Failed-output decisions must not clear unresolved high-risk counts.", failures);
  assertIncludes(resultCardSource, "flags.includes(\"targeted_rerun_fallback\")", "Targeted rerun fallback outputs must be visible through the high-risk Diff lane.", failures);
  assertIncludes(appSource, "function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision", "Rerun completion must derive default decisions from the latest compare data.", failures);
  assertIncludes(appSource, "[chunkId]: nextDecision", "Single rerun fallback chunks must keep safe-source defaults.", failures);
  assertIncludes(appSource, "getDefaultReviewDecisionForChunk(confirmedCompare, target.chunkId)", "Batch rerun fallback chunks must keep safe-source defaults.", failures);
  assertNotIncludes(appSource, "[chunkId]: \"rewrite\" }));", "Single rerun must not force fallback chunks back to default rewrite.", failures);
  assertNotIncludes(appSource, "completedTargets.map((target) => [target.chunkId, \"rewrite\" as ReviewDecision])", "Batch rerun must not force fallback chunks back to default rewrite.", failures);
  assertNotIncludes(appSource, "if (decision === \"source\" || decision === \"source_confirmed\")", "Default source choices must not be persisted as confirmed decisions.", failures);
  assertIncludes(appSource, "function normalizeSavedReviewDecisionsForCompare", "Loading saved decisions must recover legacy hidden high-risk chunks.", failures);
  assertNotIncludes(appSource, "if (decision === \"rewrite\") return [chunkId, \"rewrite_confirmed\" as ReviewDecision];", "Reloading saved default rewrites must not mark review items resolved.", failures);
  assertNotIncludes(resultCardSource, "needsReview || rejectedCandidates.length", "Candidate-only chunks must not reappear.", failures);
  assertNotIncludes(resultCardSource, "原因：", "Rejected candidate interception reason UI must stay removed.", failures);
  assertNotIncludes(resultCardSource, "候选不展示、不导出", "Rejected candidate UI must not show generic filler copy.", failures);
  assertNotIncludes(resultCardSource, "重跑本块", "Rejected candidate action label must stay concise.", failures);
  assertNotIncludes(resultCardSource, "function CandidateInspectionPanel", "Rejected candidate detail inspection panel must stay removed.", failures);
  assertNotIncludes(resultCardSource, "function CandidateDiffPanel", "Rejected candidate local diff panel must stay removed.", failures);
  assertNotIncludes(resultCardSource, "function buildCandidateDiffView", "Rejected candidate local diff computation must stay removed from the UI layer.", failures);
  assertNotIncludes(resultCardSource, "pendingAdoptCandidateKey", "Rejected candidates must not expose risky manual adoption flow.", failures);
  assertNotIncludes(resultCardSource, "确认采用候选", "Rejected candidates must not expose manual adoption copy.", failures);
  assertNotIncludes(resultCardSource, "<Accordion type=\"single\" collapsible>", "Rejected candidates must not render expandable detail blocks.", failures);
  assertNotIncludes(resultCardSource, "extractNumberTokens(sourceText)", "Candidate inspection numeric comparison must stay removed.", failures);
  assertNotIncludes(resultCardSource, "英文段落被改成中文", "Candidate inspection language checks must stay removed from UI.", failures);
  assertNotIncludes(resultCardSource, "已保留 {failureRejectedCandidates.length} 个模型候选", "Failed chunk banner must not mention removed model candidates.", failures);
}

function checkRequestErrorPayloadContract(webServiceSource, failures) {
  assertIncludes(webServiceSource, "requestError.payload = errorPayload;", "Web request errors must retain backend JSON payloads.", failures);
  assertIncludes(webServiceSource, "requestError.status = response.status;", "Web request errors must retain HTTP status.", failures);
}

function checkExportIssueSampleContract(webServiceSource, failures) {
  assertIncludes(webServiceSource, "function parseExportIssueSamples", "Export response parser must decode issue samples from response headers.", failures);
  assertIncludes(webServiceSource, "X-Export-Path", "Export response parser must preserve the backend export artifact path.", failures);
  assertIncludes(webServiceSource, "path: exportPath,", "Export result path must be the backend artifact path, not only the download name.", failures);
  assertIncludes(webServiceSource, "X-Export-Guard-Issue-Samples", "Export response parser must read guard issue samples.", failures);
  assertIncludes(webServiceSource, "X-Export-Audit-Issue-Samples", "Export response parser must read audit issue samples.", failures);
  assertIncludes(webServiceSource, "X-Export-Preflight-Issue-Samples", "Export response parser must read preflight issue samples.", failures);
  assertIncludes(webServiceSource, "guardIssueSamples,", "Export result must carry guard issue samples.", failures);
  assertIncludes(webServiceSource, "auditIssueSamples,", "Export result must carry audit issue samples.", failures);
  assertIncludes(webServiceSource, "preflightIssueSamples,", "Export result must carry preflight issue samples.", failures);
}

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  if (!existsSync(RESULT_CARD_PATH)) {
    failures.push(`Missing ResultCard.tsx: ${RESULT_CARD_PATH}`);
  }
  if (!existsSync(WEB_SERVICE_PATH)) {
    failures.push(`Missing webService.ts: ${WEB_SERVICE_PATH}`);
  }
  const source = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const resultCardSource = failures.length ? "" : readFileSync(RESULT_CARD_PATH, "utf-8");
  const webServiceSource = failures.length ? "" : readFileSync(WEB_SERVICE_PATH, "utf-8");
  if (source) {
    assertIncludes(source, "type BatchRerunFailure = {", "Batch rerun failure type should exist.", failures);
    assertIncludes(source, "function formatBatchRerunSummary(", "Batch rerun summary formatter should exist.", failures);
    checkBackendTaskContract(source, resultCardSource, failures);
    checkTargetedRerunFeedbackContract(source, resultCardSource, failures);
    checkRerunFailureVisibilityContract(source, resultCardSource, failures);
    checkRequestErrorPayloadContract(webServiceSource, failures);
    checkExportIssueSampleContract(webServiceSource, failures);
    checkPartialFailureContract(source, "handleRerunRiskyChunks", failures);
    assertNotIncludes(source, "handleRerunDetectionMatchedChunks", "Removed external detection-report rerun handler must stay absent.", failures);
    assertNotIncludes(source, "detectionMatches", "Removed external detection-report match state must stay absent.", failures);
    assertNotIncludes(resultCardSource, "DetectionReport", "Removed external detection-report UI must stay absent.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "batch rerun uses backend task API",
      "batch rerun status polling updates runtime state",
      "batch rerun cancellation is wired to the UI",
      "batch rerun can be re-attached after refresh",
      "task center includes active batch reruns",
      "persisted batch rerun summaries are visible after restart",
      "backend task result promotes partial failures",
      "manual targeted-rerun feedback reaches the backend",
      "batch rerun failures are visible and filterable in Diff",
      "removed candidate UI and adoption paths stay absent",
      "rerun failure markers are scoped per active Diff",
      "new failures auto-focus the failed-only view",
      "diff panel keeps compact user-facing filters",
      "batch rerun status stays visible in result area",
      "export audit samples stay available in service payload",
      "external detection-report rerun entry stays removed",
    ],
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  return report;
}

const report = runRegression();
const output = JSON.stringify(report, null, 2);
if (report.ok) {
  console.log(output);
} else {
  console.error(output);
}
process.exit(report.ok ? 0 : 1);
