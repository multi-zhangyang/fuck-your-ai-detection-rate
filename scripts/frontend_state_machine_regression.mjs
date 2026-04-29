import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_state_machine_regression_report.json");

function extractFunctionSource(source, functionName) {
  const signature = `function ${functionName}(`;
  const asyncSignature = `async function ${functionName}(`;
  const start = source.indexOf(signature) >= 0 ? source.indexOf(signature) : source.indexOf(asyncSignature);
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

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  if (!existsSync(WEB_SERVICE_PATH)) {
    failures.push(`Missing webService.ts: ${WEB_SERVICE_PATH}`);
  }
  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const webServiceSource = failures.length ? "" : readFileSync(WEB_SERVICE_PATH, "utf-8");

  if (appSource) {
    assertIncludes(appSource, "type RunSession = {", "Frontend must model active runs as explicit sessions.", failures);
    assertIncludes(appSource, "const runSessionRef = useRef<RunSession | null>(null);", "Active run session must be stored in a ref.", failures);
    assertIncludes(appSource, "function beginRunSession(", "Run start/attach must create a session.", failures);
    assertIncludes(appSource, "function isActiveRunSession(", "Async run callbacks must be able to reject stale sessions.", failures);
    assertIncludes(appSource, "function clearRunSession(", "Run finalization must clear only the matching active session.", failures);
    assertIncludes(appSource, "function createCheckpointProgress(", "Resumable checkpoints must seed visible progress.", failures);
    assertIncludes(appSource, "function buildRunRecoveryPanelState(", "Run recovery state must be derived by one helper.", failures);
    assertIncludes(appSource, "function RunRecoveryPanel(", "Home page must expose a visible run recovery panel.", failures);
    assertIncludes(appSource, "resumeStage === \"finalize_output\"", "100% checkpoint recovery must be displayed as finalization, not chunk rerun.", failures);
    assertIncludes(appSource, "resumeActionLabel", "Run recovery panel must show the backend-provided resume action.", failures);
    assertIncludes(appSource, "nextChunkId", "Run recovery panel must show the next chunk when available.", failures);
    assertIncludes(appSource, "不会重跑已完成分块", "Run recovery copy must explain that completed chunks are not rerun.", failures);
    assertIncludes(appSource, "next.phase === \"cancel-requested\"", "Cancel progress events must not reset visible round progress.", failures);
    assertIncludes(appSource, "正在中断当前轮次，已完成分块会保留。", "Cancel progress needs a stable runtime message.", failures);
    assertIncludes(appSource, "recentRunCount", "Diagnostics must count persisted run-round summaries.", failures);
    assertIncludes(appSource, "recentRuns", "Diagnostics must render/share persisted run-round summaries.", failures);
    assertIncludes(appSource, "近期任务摘要", "Diagnostics task center should unify recent run and rerun summaries.", failures);
    assertIncludes(appSource, "轮次未完成", "Interrupted run-round snapshots need a clear user-facing label.", failures);
    assertIncludes(appSource, "任务快照治理", "Diagnostics must expose task snapshot governance.", failures);
    assertIncludes(appSource, "cleanupTaskStateSnapshots", "Frontend must call backend task snapshot cleanup.", failures);

    const handleRunRoundSource = extractFunctionSource(appSource, "handleRunRound");
    assertIncludes(handleRunRoundSource, "const checkpointProgress = createCheckpointProgress", "Starting a round must seed UI from checkpoint status.", failures);
    assertIncludes(handleRunRoundSource, "checkpointProgress.resumeExplanation", "Resume notices must prefer backend checkpoint explanations.", failures);
    assertIncludes(handleRunRoundSource, "runSession = beginRunSession", "Started runs must be bound to a run session.", failures);
    assertRegex(handleRunRoundSource, /if \(!isActiveRunSession\(runSession\)\)\s*\{\s*return;\s*\}/, "Run result handling must ignore stale sessions.", failures);
    assertIncludes(handleRunRoundSource, "clearRunSession(runSession);", "Run finalization must clear the matching session.", failures);

    const attachActiveRunSource = extractFunctionSource(appSource, "attachActiveRun");
    assertIncludes(attachActiveRunSource, "mode: \"attach\"", "Attached backend runs must use attach-mode sessions.", failures);
    assertIncludes(attachActiveRunSource, "if (!isActiveRunSession(runSession))", "Attached progress/result callbacks must ignore stale sessions.", failures);

    const cancelSource = extractFunctionSource(appSource, "handleCancelRunRound");
    assertIncludes(cancelSource, "const runSession = runSessionRef.current;", "Cancel must target the current run session.", failures);
    assertIncludes(cancelSource, "transitionTask(runSession.taskTicket, \"canceling-run\"", "Cancel must transition the matching task ticket.", failures);
    assertIncludes(cancelSource, "await service.cancelRunRound(runSession.runId);", "Cancel must call the backend with the session run id.", failures);
    assertIncludes(appSource, "const runRecoveryState = buildRunRecoveryPanelState", "Home run panel must use the shared recovery state helper.", failures);
    assertIncludes(appSource, "<RunRecoveryPanel state={runRecoveryState} />", "Home run panel must render recovery state near run actions.", failures);
  }

  if (webServiceSource) {
    const ensureRunStreamSource = extractFunctionSource(webServiceSource, "ensureRunStream");
    assertIncludes(webServiceSource, "sseDisconnected: boolean;", "Run streams must track SSE disconnection separately from run failure.", failures);
    assertIncludes(ensureRunStreamSource, "stream.sseDisconnected = true;", "SSE close should mark the stream degraded.", failures);
    assertNotIncludes(ensureRunStreamSource, "new Error(\"Progress channel disconnected.\")", "SSE close must not immediately fail an active run.", failures);
    assertIncludes(webServiceSource, "stream.statusFailureCount >= 12 && (stream.sseDisconnected || stream.eventSource.readyState === EventSource.CLOSED)", "Polling must remain the authoritative fallback after SSE loss.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    webServicePath: WEB_SERVICE_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "active run identity is explicit",
      "stale async callbacks cannot reset a newer run",
      "checkpoint status seeds resume progress",
      "cancel targets the active run session",
      "SSE disconnect no longer equals run failure",
      "diagnostics exposes persisted run task summaries",
      "diagnostics exposes task snapshot governance",
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
