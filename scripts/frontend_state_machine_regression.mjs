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
    assertIncludes(appSource, "const roundProgressRequestRef = useRef(0);", "Checkpoint status refreshes must be sequenced so stale history requests cannot overwrite the current document.", failures);
    assertIncludes(appSource, "type PendingAutoAction", "Frontend must model pending auto retry/next-round actions explicitly.", failures);
    assertIncludes(appSource, "AUTO_RUN_RETRY_DELAY_SECONDS = 10", "Interrupted runs must use the requested 10 second retry countdown.", failures);
    assertIncludes(appSource, "AUTO_RUN_RETRY_MAX_ATTEMPTS = 3", "Interrupted runs must stop after three automatic retry attempts.", failures);
    assertIncludes(appSource, "AUTO_NEXT_ROUND_DELAY_SECONDS = 60", "Multi-round continuation must use the requested 60 second countdown.", failures);
    assertIncludes(appSource, "function scheduleAutoRetry(", "Interrupted resumable runs must schedule automatic retry.", failures);
    assertIncludes(appSource, "function scheduleAutoNextRound(", "Completed rounds must schedule automatic next-round continuation.", failures);
    assertIncludes(appSource, "function rejectPendingAutoAction(", "Users must be able to reject pending automatic actions.", failures);
    assertIncludes(appSource, "function AutoRunSignal(", "Home run panel must render a visible countdown signal.", failures);
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
    assertIncludes(appSource, "function buildDiagnosticTaskItems", "Diagnostics task center should normalize backend task summaries.", failures);
    assertIncludes(appSource, "function DiagnosticTaskAlert", "Diagnostics task center should render run and rerun summaries through one component.", failures);
    assertIncludes(appSource, "后台任务", "Diagnostics task center should expose one unified user-facing task area.", failures);
    assertIncludes(appSource, "未完成", "Interrupted task snapshots need a clear user-facing label.", failures);
    assertIncludes(appSource, "任务快照治理", "Diagnostics must expose task snapshot governance.", failures);
    assertIncludes(appSource, "cleanupTaskStateSnapshots", "Frontend must call backend task snapshot cleanup.", failures);
    assertIncludes(appSource, "beginTask(\"restoring-document\"", "Restoring the previous document must enter the shared task lifecycle.", failures);
    assertIncludes(appSource, "taskTicket !== taskTicketRef.current", "Async restoration must ignore stale task tickets.", failures);
    assertIncludes(appSource, "finishTask(taskTicket);", "Restoration and other task flows must release their task ticket.", failures);
    assertIncludes(appSource, "function buildConfigForHistorySelection", "Selecting a history document must derive the active route from that history record.", failures);
    assertIncludes(appSource, "const selectedConfig = buildConfigForHistorySelection(item, configOverride);", "History selection must not keep using a stale global prompt route.", failures);
    assertIncludes(appSource, "!promptSequencesEqual(loadedSequence, nextConfig.promptSequence)", "Auto-restore must sync custom prompt sequence changes, not only profile changes.", failures);
    assertIncludes(appSource, "const statusPromptProfile = status.promptProfile ?? config.promptProfile;", "Checkpoint status refresh must use the document status route.", failures);
    assertIncludes(appSource, "const statusPromptSequence = normalizePromptSequence(status.promptSequence ?? config.promptSequence);", "Checkpoint status refresh must use the document status prompt sequence.", failures);
    assertIncludes(appSource, "requestId === roundProgressRequestRef.current", "Checkpoint status refresh must ignore stale responses.", failures);

    const handleRunRoundSource = extractFunctionSource(appSource, "handleRunRound");
    assertIncludes(handleRunRoundSource, "const statusPromptSequence = normalizePromptSequence(documentStatus.promptSequence ?? modelConfig.promptSequence);", "Starting a round must bind to the loaded document route.", failures);
    assertIncludes(handleRunRoundSource, "promptSequencesEqual(runConfig.promptSequence, modelConfig.promptSequence)", "Starting a round must sync route state before creating a backend run.", failures);
    assertIncludes(handleRunRoundSource, "roundProgressStatus.promptProfile === runConfig.promptProfile", "Checkpoint reuse must reject checkpoints from another prompt profile.", failures);
    assertIncludes(handleRunRoundSource, "promptSequencesEqual(roundProgressStatus.promptSequence, runConfig.promptSequence)", "Checkpoint reuse must reject checkpoints from another custom prompt sequence.", failures);
    assertIncludes(handleRunRoundSource, "const checkpointProgress = createCheckpointProgress", "Starting a round must seed UI from checkpoint status.", failures);
    assertIncludes(handleRunRoundSource, "scheduleAutoRetry({", "Resumable forced interruption must enqueue auto retry.", failures);
    assertIncludes(handleRunRoundSource, "scheduleAutoNextRound(status, nextResult.round, runConfig);", "Successful rounds must enqueue auto next-round countdown.", failures);
    assertIncludes(handleRunRoundSource, "userCanceled", "Manual cancel must not be treated as a forced interruption auto-retry.", failures);
    assertIncludes(handleRunRoundSource, "checkpointProgress.resumeExplanation", "Resume notices must prefer backend checkpoint explanations.", failures);
    assertIncludes(handleRunRoundSource, "runSession = beginRunSession", "Started runs must be bound to a run session.", failures);
    assertRegex(handleRunRoundSource, /if \(!isActiveRunSession\(runSession\)\)\s*\{\s*return;\s*\}/, "Run result handling must ignore stale sessions.", failures);
    assertIncludes(handleRunRoundSource, "clearRunSession(runSession);", "Run finalization must clear the matching session.", failures);

    const attachActiveRunSource = extractFunctionSource(appSource, "attachActiveRun");
    assertIncludes(attachActiveRunSource, "mode: \"attach\"", "Attached backend runs must use attach-mode sessions.", failures);
    assertIncludes(attachActiveRunSource, "if (!isActiveRunSession(runSession))", "Attached progress/result callbacks must ignore stale sessions.", failures);

    assertIncludes(appSource, "sameWorkspacePath(roundProgressStatus.sourcePath, value?.sourcePath)", "Home run panel must not show a resume checkpoint from another history document.", failures);

    const cancelSource = extractFunctionSource(appSource, "handleCancelRunRound");
    assertIncludes(cancelSource, "const runSession = runSessionRef.current;", "Cancel must target the current run session.", failures);
    assertIncludes(cancelSource, "transitionTask(runSession.taskTicket, \"canceling-run\"", "Cancel must transition the matching task ticket.", failures);
    assertIncludes(cancelSource, "await service.cancelRunRound(runSession.runId);", "Cancel must call the backend with the session run id.", failures);
    assertIncludes(appSource, "const runRecoveryState = buildRunRecoveryPanelState", "Home run panel must use the shared recovery state helper.", failures);
    assertIncludes(appSource, "<RunRecoveryPanel state={runRecoveryState} />", "Home run panel must render recovery state near run actions.", failures);
  }

  if (webServiceSource) {
    const ensureRunStreamSource = extractFunctionSource(webServiceSource, "ensureRunStream");
    const pickSingleFileSource = extractFunctionSource(webServiceSource, "pickSingleFile");
    assertIncludes(webServiceSource, "sseDisconnected: boolean;", "Run streams must track SSE disconnection separately from run failure.", failures);
    assertIncludes(ensureRunStreamSource, "stream.sseDisconnected = true;", "SSE close should mark the stream degraded.", failures);
    assertNotIncludes(ensureRunStreamSource, "new Error(\"Progress channel disconnected.\")", "SSE close must not immediately fail an active run.", failures);
    assertIncludes(webServiceSource, "stream.statusFailureCount >= 12 && (stream.sseDisconnected || stream.eventSource.readyState === EventSource.CLOSED)", "Polling must remain the authoritative fallback after SSE loss.", failures);
    assertIncludes(pickSingleFileSource, "document.addEventListener(\"pointerdown\", handleUserReturnedToPage, true);", "File picker must release if the user returns to the page after cancel.", failures);
    assertIncludes(pickSingleFileSource, "document.removeEventListener(\"pointerdown\", handleUserReturnedToPage, true);", "File picker fallback listeners must be cleaned up.", failures);
    assertIncludes(pickSingleFileSource, "userReturnArmed = true;", "File picker return-to-page fallback must arm after the initial click.", failures);
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
      "history selection restores the route used by the selected record",
      "run start rejects checkpoints from other prompt routes",
      "cancel targets the active run session",
      "SSE disconnect no longer equals run failure",
      "diagnostics exposes persisted run task summaries",
      "diagnostics exposes task snapshot governance",
      "document restoration participates in the shared task lifecycle",
      "file picker cancellation has a return-to-page fallback",
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
