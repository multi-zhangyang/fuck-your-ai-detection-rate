import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
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

function assertRegex(source, pattern, message, failures) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

function checkPartialFailureContract(source, functionName, failures) {
  const functionSource = extractFunctionSource(source, functionName);
  assertIncludes(functionSource, "let successCount = 0;", `${functionName} must track successful chunk reruns.`, failures);
  assertIncludes(functionSource, "const failures: BatchRerunFailure[] = [];", `${functionName} must collect per-chunk failures.`, failures);
  assertRegex(functionSource, /for\s*\([^)]*index\s*=\s*0[\s\S]*?\)\s*\{[\s\S]*?try\s*\{[\s\S]*?service\.rerunChunk[\s\S]*?successCount \+= 1;[\s\S]*?\}\s*catch\s*\(appError\)\s*\{[\s\S]*?failures\.push\(\{ chunkId, error: stringifyError\(appError\) \}\);/m, `${functionName} must catch individual rerun failures inside the loop.`, failures);
  assertIncludes(functionSource, "if (latestCompare && successCount > 0)", `${functionName} should refresh preview only after at least one success.`, failures);
  assertRegex(functionSource, /failures\.push\(\{ chunkId: ["']预览刷新["'], error: stringifyError\(appError\) \}\);/, `${functionName} should report preview refresh failure without discarding rerun successes.`, failures);
  assertIncludes(functionSource, "if (successCount === 0 && failures.length)", `${functionName} must distinguish all-failed batches from partial success.`, failures);
  assertRegex(functionSource, /setRuntimeStep\(failures\.length \? ["'][^"']*部分完成["'] : ["'][^"']*完成["']\);/, `${functionName} must surface partial completion state.`, failures);
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
  assertIncludes(appSource, "setRerunFailures(scopeRerunFailures(failures, latestCompare));", "Batch rerun failures must be promoted into visible scoped Diff state.", failures);
  assertIncludes(appSource, "rerunFailures={activeRerunFailures}", "Home ResultCard must receive active rerun failures.", failures);
  assertIncludes(resultCardSource, "rerunFailures?: RerunFailure[];", "ResultCard must expose rerun failure input.", failures);
  assertIncludes(resultCardSource, "const [filterMode, setFilterMode] = useState<\"all\" | \"review\" | \"failed\" | \"candidate\">(\"all\");", "Diff panel must support failed and candidate filters.", failures);
  assertIncludes(resultCardSource, "const previousFailedCountRef = useRef(0);", "Diff panel must detect newly appeared failed chunks.", failures);
  assertIncludes(resultCardSource, "setFilterMode(\"failed\");", "Diff panel must auto-focus failed chunks when new failures appear.", failures);
  assertIncludes(resultCardSource, "const previousCandidateCountRef = useRef(0);", "Diff panel must detect newly appeared rejected candidates.", failures);
  assertIncludes(resultCardSource, "setFilterMode(\"candidate\");", "Diff panel must auto-focus rejected candidates when no failed chunk is present.", failures);
  assertIncludes(resultCardSource, "const rerunFailureByChunk = new Map", "Diff panel must map failures by chunk id.", failures);
  assertIncludes(resultCardSource, "const candidateChunkIds = allChunks.filter", "Diff panel must map rejected candidate chunks.", failures);
  assertIncludes(resultCardSource, "T.failedOnly", "Diff panel must expose the failed-only action.", failures);
  assertIncludes(resultCardSource, "T.candidateOnly", "Diff panel must expose the candidate-only action.", failures);
  assertIncludes(resultCardSource, "T.rerunFailureSummary", "Failed chunks must have a visible summary banner.", failures);
  assertIncludes(resultCardSource, "T.rerunFailureHint", "Failed chunks must explain the next action.", failures);
  assertIncludes(resultCardSource, "T.rejectedCandidateHint", "Rejected model candidates must explain safe manual adoption.", failures);
}

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  if (!existsSync(RESULT_CARD_PATH)) {
    failures.push(`Missing ResultCard.tsx: ${RESULT_CARD_PATH}`);
  }
  const source = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const resultCardSource = failures.length ? "" : readFileSync(RESULT_CARD_PATH, "utf-8");
  if (source) {
    assertIncludes(source, "type BatchRerunFailure = {", "Batch rerun failure type should exist.", failures);
    assertIncludes(source, "function formatBatchRerunSummary(", "Batch rerun summary formatter should exist.", failures);
    checkTargetedRerunFeedbackContract(source, resultCardSource, failures);
    checkRerunFailureVisibilityContract(source, resultCardSource, failures);
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
      "per-chunk rerun failures are isolated",
      "partial successes update state immediately",
      "preview refresh failures are summarized",
      "all-failed and partial-complete states are distinct",
      "manual targeted-rerun feedback reaches the backend",
      "batch rerun failures are visible and filterable in Diff",
      "rerun failure markers are scoped per active Diff",
      "new failures auto-focus the failed-only view",
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
