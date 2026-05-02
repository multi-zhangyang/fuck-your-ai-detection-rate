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
  assertIncludes(appSource, "activeBatchReruns", "Diagnostics/task center must render active batch rerun tasks.", failures);
  assertIncludes(appSource, "recentBatchReruns", "Diagnostics must render persisted batch rerun summaries after backend restart.", failures);
  assertIncludes(appSource, "近期任务摘要", "Diagnostics must label persisted task summaries clearly.", failures);
  assertIncludes(appSource, "重跑未完成", "Persisted batch rerun summaries must keep a clear rerun-specific status.", failures);
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
  assertIncludes(appSource, "normalizeFailureRejectedCandidates(failure.rejectedCandidates)", "Single rerun failures must normalize rejected candidate output.", failures);
  assertIncludes(appSource, "upsertRerunFailure({ chunkId, error: message, ...extractRerunFailureExtras(appError) });", "Single rerun failure UI must preserve rejected candidates.", failures);
  assertIncludes(appSource, "result.failures.map((failure) => ({ ...failure }))", "Batch rerun failures must preserve rejected candidate details from the backend.", failures);
  assertIncludes(appSource, "setRerunFailures(scopeRerunFailures(failures, latestCompare ?? activeCompareData));", "Batch rerun failures must be promoted into visible scoped Diff state.", failures);
  assertIncludes(appSource, "rerunFailures={activeRerunFailures}", "Home ResultCard must receive active rerun failures.", failures);
  assertIncludes(appSource, "batchRerunStatusText={runtimeLabel}", "Home ResultCard must show live batch rerun status text.", failures);
  assertIncludes(resultCardSource, "rerunFailures?: RerunFailure[];", "ResultCard must expose rerun failure input.", failures);
  assertIncludes(resultCardSource, "batchRerunStatusText?: string;", "ResultCard must expose batch rerun status text.", failures);
  assertIncludes(resultCardSource, "rejectedCandidates?: NonNullable<RoundCompareData[\"chunks\"][number][\"rejectedCandidates\"]>;", "Visible rerun failures must carry rejected model candidates.", failures);
  assertIncludes(resultCardSource, "type DiffFilterMode = \"all\" | \"review\" | \"failed\" | \"candidate\" | \"changed\" | \"number\" | \"citation\";", "Diff panel must support review, failure, candidate and risk-specific filters.", failures);
  assertIncludes(resultCardSource, "const [filterMode, setFilterMode] = useState<DiffFilterMode>(\"all\");", "Diff panel must keep filter mode as a typed state.", failures);
  assertIncludes(resultCardSource, "const previousFailedCountRef = useRef(0);", "Diff panel must detect newly appeared failed chunks.", failures);
  assertIncludes(resultCardSource, "setFilterMode(\"failed\");", "Diff panel must auto-focus failed chunks when new failures appear.", failures);
  assertIncludes(resultCardSource, "const previousCandidateCountRef = useRef(0);", "Diff panel must detect newly appeared rejected candidates.", failures);
  assertIncludes(resultCardSource, "setFilterMode(\"candidate\");", "Diff panel must auto-focus rejected candidates when no failed chunk is present.", failures);
  assertIncludes(resultCardSource, "const rerunFailureByChunk = new Map", "Diff panel must map failures by chunk id.", failures);
  assertIncludes(resultCardSource, "const failureCandidateChunkIdSet = new Set", "Diff panel must include failed chunks that only have failure-level candidates.", failures);
  assertIncludes(resultCardSource, "const displayChunk = failureRejectedCandidates.length", "Diff panel must merge failure-level candidates into the chunk card.", failures);
  assertIncludes(resultCardSource, "chunk={displayChunk}", "Chunk quality panel must display failure-level rejected candidates.", failures);
  assertIncludes(resultCardSource, "const candidateChunkIds = allChunks.filter", "Diff panel must map rejected candidate chunks.", failures);
  assertIncludes(resultCardSource, "const changedChunkIds = allChunks.filter", "Diff panel must map chunks with source/rewrite changes.", failures);
  assertIncludes(resultCardSource, "const numberRiskChunkIds = allChunks.filter", "Diff panel must map chunks with numeric risks.", failures);
  assertIncludes(resultCardSource, "const citationRiskChunkIds = allChunks.filter", "Diff panel must map chunks with citation risks.", failures);
  assertIncludes(resultCardSource, "function hasChunkNumberRisk", "Diff panel must detect numeric risk for rewrites and rejected candidates.", failures);
  assertIncludes(resultCardSource, "function hasChunkCitationRisk", "Diff panel must detect citation risk for rewrites and rejected candidates.", failures);
  assertIncludes(resultCardSource, "function getDiffFilterEmptyState", "Diff panel must explain empty risk-specific filters.", failures);
  assertIncludes(resultCardSource, "T.failedOnly", "Diff panel must expose the failed-only action.", failures);
  assertIncludes(resultCardSource, "T.candidateOnly", "Diff panel must expose the candidate-only action.", failures);
  assertIncludes(resultCardSource, "T.changedChunks", "Diff panel must expose the source/rewrite change filter.", failures);
  assertIncludes(resultCardSource, "T.numberRisk", "Diff panel must expose the numeric risk filter.", failures);
  assertIncludes(resultCardSource, "T.citationRisk", "Diff panel must expose the citation risk filter.", failures);
  assertIncludes(resultCardSource, "filterMode === \"number\"", "Diff panel must render numeric-risk-only state.", failures);
  assertIncludes(resultCardSource, "filterMode === \"citation\"", "Diff panel must render citation-risk-only state.", failures);
  assertIncludes(resultCardSource, "T.rerunFailureSummary", "Failed chunks must have a visible summary banner.", failures);
  assertIncludes(resultCardSource, "T.rerunFailureHint", "Failed chunks must explain the next action.", failures);
  assertIncludes(resultCardSource, "批量重跑进行中", "ResultCard must keep batch rerun status visible in the main result area.", failures);
  assertIncludes(resultCardSource, "function inspectRejectedCandidate", "Rejected candidates must be inspected for rerun feedback.", failures);
  assertIncludes(resultCardSource, "function getRejectedCandidateReasons", "Rejected candidates must expose concise visible interception reasons.", failures);
  assertIncludes(resultCardSource, "function buildRejectedCandidatesRerunFeedback", "Rejected candidates must generate reusable rerun feedback without rendering their content.", failures);
  assertIncludes(resultCardSource, "function getChunkReviewReasons", "Needs-review chunks must expose visible quality reasons.", failures);
  assertIncludes(resultCardSource, "读取本块原因与当前轮配置", "Targeted rerun help must explain the exact rerun scope and inputs.", failures);
  assertIncludes(resultCardSource, "const candidateFeedback = rejectedCandidates.length ? buildRejectedCandidatesRerunFeedback", "Candidate rerun feedback must be prepared at chunk level.", failures);
  assertIncludes(resultCardSource, "const candidateReasons = rejectedCandidates.length ? getRejectedCandidateReasons", "Candidate reason labels must be prepared at chunk level.", failures);
  assertIncludes(resultCardSource, "onRerun(candidateFeedback)", "Candidate cards must expose one-click rerun using generated feedback.", failures);
  assertIncludes(resultCardSource, "forceNeedsReview={needsReview}", "Diff-level review state must be passed into the chunk quality bar.", failures);
  assertIncludes(resultCardSource, "const reviewToolsVisible = qualityNeedsReview || isSourceFallback;", "Candidate-only chunks should not open the manual feedback panel.", failures);
  assertNotIncludes(resultCardSource, "needsReview || rejectedCandidates.length", "Candidate-only chunks must stay as a compact interception notice.", failures);
  assertIncludes(resultCardSource, "原因：", "Rejected candidate UI must show the interception reason.", failures);
  assertNotIncludes(resultCardSource, "候选不展示、不导出", "Rejected candidate UI must not show generic filler copy.", failures);
  assertNotIncludes(resultCardSource, "重跑本块", "Rejected candidate action label must stay concise.", failures);
  assertNotIncludes(resultCardSource, "function CandidateInspectionPanel", "Rejected candidate detail inspection panel must stay removed.", failures);
  assertNotIncludes(resultCardSource, "function CandidateDiffPanel", "Rejected candidate local diff panel must stay removed.", failures);
  assertNotIncludes(resultCardSource, "function buildCandidateDiffView", "Rejected candidate local diff computation must stay removed from the UI layer.", failures);
  assertNotIncludes(resultCardSource, "pendingAdoptCandidateKey", "Rejected candidates must not expose risky manual adoption flow.", failures);
  assertNotIncludes(resultCardSource, "确认采用候选", "Rejected candidates must not expose manual adoption copy.", failures);
  assertNotIncludes(resultCardSource, "<Accordion type=\"single\" collapsible>", "Rejected candidates must not render expandable detail blocks.", failures);
  assertIncludes(resultCardSource, "extractNumberTokens(sourceText)", "Candidate inspection must compare numeric tokens.", failures);
  assertIncludes(resultCardSource, "英文段落被改成中文", "Candidate inspection must flag language inversion.", failures);
  assertIncludes(resultCardSource, "已保留 {failureRejectedCandidates.length} 个模型候选", "Failed chunk banner must point users to preserved model candidates.", failures);
}

function checkRequestErrorPayloadContract(webServiceSource, failures) {
  assertIncludes(webServiceSource, "requestError.payload = errorPayload;", "Web request errors must retain backend JSON payloads.", failures);
  assertIncludes(webServiceSource, "requestError.status = response.status;", "Web request errors must retain HTTP status.", failures);
}

function checkExportIssueSampleContract(webServiceSource, failures) {
  assertIncludes(webServiceSource, "function parseExportIssueSamples", "Export response parser must decode issue samples from response headers.", failures);
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
    checkPartialFailureContract(source, "handleRerunDetectionMatchedChunks", failures);
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
      "single rerun failure payload preserves model candidates",
      "rejected candidates stay as compact interception notices",
      "rejected candidate detail panels stay removed",
      "rejected candidate rerun feedback is generated without rendering content",
      "rerun failure markers are scoped per active Diff",
      "new failures auto-focus the failed-only view",
      "diff panel supports risk-specific filters",
      "batch rerun status stays visible in result area",
      "export audit samples stay available in service payload",
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
