import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
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

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  const source = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  if (source) {
    assertIncludes(source, "type BatchRerunFailure = {", "Batch rerun failure type should exist.", failures);
    assertIncludes(source, "function formatBatchRerunSummary(", "Batch rerun summary formatter should exist.", failures);
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
