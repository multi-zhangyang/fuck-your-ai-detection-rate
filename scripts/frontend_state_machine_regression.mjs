import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
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
  if (!existsSync(RESULT_CARD_PATH)) {
    failures.push(`Missing ResultCard.tsx: ${RESULT_CARD_PATH}`);
  }
  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const resultCardSource = failures.length ? "" : readFileSync(RESULT_CARD_PATH, "utf-8");
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
    assertIncludes(appSource, "function isManualContinuationRound(", "Frontend must distinguish manual continuation rounds after the selected workflow.", failures);
    assertIncludes(appSource, "type RoundResetTarget = {", "Round reset must model whether it is clearing a checkpoint or a completed round.", failures);
    assertIncludes(appSource, "function getRoundResetTarget(", "Round reset must derive the target round instead of blindly using nextRound.", failures);
    assertIncludes(appSource, "function getAutoRunScopeKeyForStatus(", "Pending automatic actions must be scoped to the active document route.", failures);
    assertIncludes(appSource, "function clearPendingAutoActionForManualContextChange(", "Manual document or route changes must cancel pending automatic actions.", failures);
    assertIncludes(appSource, "function rejectPendingAutoAction(", "Users must be able to reject pending automatic actions.", failures);
    assertIncludes(appSource, "function AutoRunSignal(", "Home run panel must render a visible countdown signal.", failures);
    assertIncludes(appSource, "const canAppendRound = Boolean(", "Completed custom workflows must expose an explicit append action.", failures);
    assertIncludes(appSource, "const appendRoundLimit = Math.max(sequenceLengthLimit, getPromptRoundLimit", "Append capacity must be separate from the 1/2/3 main workflow selector.", failures);
    assertIncludes(appSource, "Math.min(getPromptSequenceLimit(promptProfile, promptWorkflows), DEFAULT_PROMPT_SEQUENCE.length)", "Main workflow selector must stay on the simple 1/2/3 choices.", failures);
    assertIncludes(appSource, "const [appendDraft, setAppendDraft] = useState<null | {", "Append rounds must use a dedicated single-round draft instead of mutating the main workflow picker.", failures);
    assertIncludes(appSource, "openAppendRoundDialog();", "Append action must open the single-round config dialog before starting.", failures);
    assertIncludes(appSource, "<Dialog open={Boolean(appendDraft)}", "Append round configuration must use a centered Dialog.", failures);
    assertIncludes(appSource, "开始追加", "Append dialog must expose a single confirm action.", failures);
    assertIncludes(appSource, "promptSequence: nextSequence", "Append action must extend the custom prompt sequence before starting a run.", failures);
    assertIncludes(appSource, "const lastRoundKey = getRoundModelKey(promptProfile, activeSequence.length, promptWorkflows);", "Append default route must read the active prompt profile, not a hard-coded editable profile.", failures);
    assertIncludes(appSource, "const roundKey = getRoundModelKey(promptProfile, nextRound, promptWorkflows);", "Append round model key must be scoped to the active prompt profile.", failures);
    assertNotIncludes(appSource, "getRoundModelKey(editablePromptProfile", "Append route logic must not use the editor default profile.", failures);
    assertNotIncludes(appSource, "promptProfile: editablePromptProfile", "Append action must not rewrite the active prompt profile implicitly.", failures);
    assertIncludes(appSource, "onRunRound(nextConfig);", "Append action must start with the extended prompt route, not the stale completed route.", failures);
    assertIncludes(appSource, "function createCheckpointProgress(", "Resumable checkpoints must seed visible progress.", failures);
    assertIncludes(appSource, "function buildRunRecoveryPanelState(", "Run recovery state must be derived by one helper.", failures);
    assertIncludes(appSource, "function RunRecoveryPanel(", "Home page must expose a visible run recovery panel.", failures);
    assertIncludes(appSource, "resumeStage === \"finalize_output\"", "100% checkpoint recovery must be displayed as finalization, not chunk rerun.", failures);
    assertIncludes(appSource, "resumeActionLabel", "Run recovery panel must show the backend-provided resume action.", failures);
    assertIncludes(appSource, "nextChunkId", "Run recovery panel must show the next chunk when available.", failures);
    assertIncludes(appSource, "不会重跑已完成分块", "Run recovery copy must explain that completed chunks are not rerun.", failures);
    assertIncludes(appSource, "next.phase === \"cancel-requested\"", "Cancel progress events must not reset visible round progress.", failures);
    assertIncludes(appSource, "正在中断当前轮次，已完成分块会保留。", "Cancel progress needs a stable runtime message.", failures);
    assertIncludes(appSource, "return progress.completedChunks ?? progress.currentChunk ?? 0;", "Parallel chunk completion must drive visible progress by completed count, not chunk index.", failures);
    assertIncludes(appSource, "剩余 ${remainingChunks}${concurrencyText}", "Runtime copy must prioritize remaining chunk countdown over duplicate active worker counts.", failures);
    assertIncludes(appSource, "function RoundRunStatusCard(", "Home must replace the Diff area with a run status card while a round is active.", failures);
    assertIncludes(appSource, "showRoundRunStatus ? (", "Diff review must be hidden during active round execution.", failures);
    assertIncludes(appSource, "function formatProviderErrorBrief(", "Provider request failures must be summarized by category in the running status UI.", failures);
    assertIncludes(appSource, "progress.errorCategory", "Parallel provider failures must carry structured error category fields into the UI.", failures);
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
    assertIncludes(appSource, "const selectedConfig = buildConfigForHistorySelection(item, configOverride, promptOptions, promptWorkflows);", "History selection must not keep using a stale global prompt route.", failures);
    assertIncludes(appSource, "!promptSequencesEqual(loadedSequence, nextConfig.promptSequence, promptOptions, loadedPromptProfile, promptWorkflows)", "Auto-restore must sync custom prompt sequence changes, not only profile changes.", failures);
    assertIncludes(appSource, "const statusPromptProfile = status.promptProfile ?? config.promptProfile;", "Checkpoint status refresh must use the document status route.", failures);
    assertIncludes(appSource, "const statusPromptSequence = normalizePromptSequence(status.promptSequence ?? config.promptSequence, promptOptions, statusPromptProfile, promptWorkflows);", "Checkpoint status refresh must use the document status prompt sequence.", failures);
    assertIncludes(appSource, "requestId === roundProgressRequestRef.current", "Checkpoint status refresh must ignore stale responses.", failures);
    assertNotIncludes(appSource, "流程已完成，可追加第 ${status.nextRound} 轮。", "Completed selected workflows must not expose an automatic append round.", failures);
    assertIncludes(appSource, "流程已完成，可导出。", "Completed selected workflows must be presented as exportable.", failures);
    assertIncludes(appSource, "autoSnapshotRestoreKeyRef", "Completed results must have a guarded automatic Diff restore path after refresh or interrupted restoration.", failures);
    assertIncludes(appSource, "loadLatestRoundSnapshot(documentStatus, restoreConfig", "Missing visible Diff should be restored from the latest persisted round instead of leaving the home page empty.", failures);
    assertIncludes(appSource, "latestOutputKey && documentRefsMatch(latestOutputKey, outputKey)", "Diff ownership must accept the latest output path instead of relying only on docId.", failures);
    assertIncludes(appSource, "function promptSequenceCoversSelectedRoute(", "Diff and history route matching must support appended custom workflows without treating unrelated routes as active.", failures);
    assertIncludes(appSource, "comparePromptProfile !== documentPromptProfile", "Diff ownership must reject compare payloads from another prompt profile before trusting docId.", failures);
    assertIncludes(appSource, "promptSequenceCoversSelectedRoute(\n      compareData.promptSequence,\n      document.promptSequence,", "Diff ownership must reject stale compare payloads from another custom prompt sequence.", failures);
    assertIncludes(appSource, "compareDataMatchesDocument(compareData, documentStatus, promptOptions, promptWorkflows)", "Active Diff selection must pass route metadata into compare ownership checks.", failures);
    assertIncludes(appSource, "function isCompleteRoundCompareData(", "Frontend must reject zero-chunk compare payloads before treating a round as completed.", failures);
    assertIncludes(appSource, "!isCompleteRoundCompareData(compareData) || !document", "Diff ownership must reject incomplete compare payloads before trusting document identity.", failures);
    assertIncludes(appSource, "throw new Error(\"本轮结果不完整，不能载入为已完成 Diff。\")", "Snapshot restore must not load empty compare data as a completed Diff.", failures);
    assertIncludes(appSource, "const latestRoundCompareReady = Boolean(", "Append eligibility must depend on a loaded complete compare payload.", failures);
    assertIncludes(appSource, "const completedButDiffMissing = Boolean(", "Completed status without Diff must surface as incomplete instead of export-ready.", failures);
    assertIncludes(appSource, "promptSequenceCoversSelectedRoute(roundItem.promptSequence, promptSequence, roundItem.round", "History lookup must keep prefix rounds visible after a user appends one more custom round.", failures);
    assertIncludes(appSource, "const loadedCompletedResultRound = roundResult?.round ?? null;", "Home run panel must only treat completed round results as loaded results.", failures);
    assertIncludes(appSource, "loadedResultRound={loadedCompletedResultRound}", "Checkpoint Diff snapshots must not be passed to the run panel as completed results.", failures);
    assertIncludes(appSource, "function roundCheckpointMatchesDocument", "Current-round checkpoints must be detected separately from completed results.", failures);
    assertIncludes(appSource, "const checkpointPendingForCurrentDocument = roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows) && !showRoundRunStatus;", "Incomplete checkpoints must keep export and output status guarded after refresh.", failures);
    assertIncludes(appSource, "checkpoint.promptProfile === status.promptProfile", "Checkpoint matching must reject stale checkpoints from another prompt route.", failures);
    assertIncludes(appSource, "promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows)", "Checkpoint matching must include the current custom prompt sequence.", failures);
    assertIncludes(appSource, "const waitingForStatusSync = Boolean(resultAheadOfStatus && !resumableCheckpoint && !checkpointOnCurrentRound);", "Current-round checkpoints must not strand the primary button in status-sync mode.", failures);
    assertIncludes(appSource, "放弃已完成结果", "Reset copy must distinguish completed results from resumable in-progress checkpoints.", failures);

    const handleRunRoundSource = extractFunctionSource(appSource, "handleRunRound");
    assertIncludes(handleRunRoundSource, "configOverride?: ModelConfig", "Starting a round must accept the latest run-panel config instead of stale React state.", failures);
    assertIncludes(handleRunRoundSource, "const baseModelConfig = normalizeActiveModelConfig(configOverride ?? latestModelConfigRef.current ?? modelConfig", "Starting a round must prefer the latest selected model config.", failures);
    assertIncludes(handleRunRoundSource, "const selectedPromptSequence = normalizePromptSequence(baseModelConfig.promptSequence, promptOptions, selectedPromptProfile, promptWorkflows);", "Starting a round must keep the user-selected workflow route.", failures);
    assertNotIncludes(handleRunRoundSource, "documentStatus.promptSequence ?? baseModelConfig.promptSequence", "Starting a round must not collapse the selected workflow to a stale document route.", failures);
    assertIncludes(handleRunRoundSource, "launchStatus = await refreshDocumentState(documentStatus.sourcePath, runConfig);", "Starting a round must refresh document state with the selected route before deciding the next round.", failures);
    assertIncludes(handleRunRoundSource, "launchStatus.nextRound > launchPlannedRounds", "Starting a round must reject backend continuation beyond the selected workflow.", failures);
    assertIncludes(handleRunRoundSource, "await service.saveModelConfig(runConfig);", "Starting a round must persist the selected run settings before creating the backend run.", failures);
    assertIncludes(handleRunRoundSource, "promptSequencesEqual(runConfig.promptSequence, modelConfig.promptSequence, promptOptions, runConfig.promptProfile, promptWorkflows)", "Starting a round must sync route state before creating a backend run.", failures);
    assertIncludes(handleRunRoundSource, "roundProgressStatus.promptProfile === runConfig.promptProfile", "Checkpoint reuse must reject checkpoints from another prompt profile.", failures);
    assertIncludes(handleRunRoundSource, "promptSequencesEqual(roundProgressStatus.promptSequence, runConfig.promptSequence, promptOptions, runConfig.promptProfile, promptWorkflows)", "Checkpoint reuse must reject checkpoints from another custom prompt sequence.", failures);
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

    const scheduleAutoNextRoundSource = extractFunctionSource(appSource, "scheduleAutoNextRound");
    assertIncludes(scheduleAutoNextRoundSource, "isManualContinuationRound(status, config, promptOptions, promptWorkflows)", "Automatic next-round countdown must stop once the selected workflow is complete.", failures);

    const performPendingAutoActionSource = extractFunctionSource(appSource, "performPendingAutoAction");
    assertIncludes(performPendingAutoActionSource, "const activeScopeKey = getAutoRunScopeKeyForStatus(status, activeConfig, action.round, promptOptions, promptWorkflows);", "Automatic actions must recheck the active prompt route before running.", failures);
    assertIncludes(performPendingAutoActionSource, "activeScopeKey !== action.scopeKey", "Automatic actions from a stale prompt route must be cancelled.", failures);

    const getRoundResetTargetSource = extractFunctionSource(appSource, "getRoundResetTarget");
    assertIncludes(getRoundResetTargetSource, "checkpoint.round === status.nextRound", "Reset should prefer the current resumable checkpoint only when it matches the active next round.", failures);
    assertIncludes(getRoundResetTargetSource, "status.completedRounds ?? []", "Reset must fall back to completed rounds when there is no current checkpoint.", failures);
    assertIncludes(getRoundResetTargetSource, ".sort((left, right) => left - right)", "Reset must pick the latest completed round deterministically.", failures);
    assertIncludes(getRoundResetTargetSource, "return { round: latestCompletedRound, mode: \"completed\" };", "Resetting after a completed first round must clear round 1, not append round 2.", failures);

    const handleResetCurrentRoundSource = extractFunctionSource(appSource, "handleResetCurrentRound");
    assertIncludes(handleResetCurrentRoundSource, "const resetTarget = getRoundResetTarget(documentStatus, roundProgressStatus, promptOptions, promptWorkflows);", "Reset action must use the derived reset target.", failures);
    assertIncludes(handleResetCurrentRoundSource, "const resetRoundNumber = resetTarget.round;", "Reset action must call the backend with the derived round number.", failures);
    assertIncludes(handleResetCurrentRoundSource, "const resetPromptProfile = documentStatus.promptProfile ?? modelConfig.promptProfile;", "Reset action must use the current document route, not stale global config.", failures);
    assertIncludes(handleResetCurrentRoundSource, "await service.resetRoundProgress(documentStatus.sourcePath, resetPromptProfile, resetRoundNumber, resetPromptSequence);", "Reset action must clear the active document route and derived round number.", failures);
    assertNotIncludes(handleResetCurrentRoundSource, "documentStatus.nextRound", "Reset action must not treat the next runnable round as the round to discard.", failures);

    const handleExportCurrentSource = extractFunctionSource(appSource, "handleExportCurrent");
    assertIncludes(handleExportCurrentSource, "roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows)", "Export guard must only block for checkpoints on the active prompt route.", failures);
    assertIncludes(handleExportCurrentSource, "const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;", "Current export must use persisted compare output when roundResult has not been rebuilt yet.", failures);
    assertIncludes(handleExportCurrentSource, "service.exportRound(outputPath, format)", "Current export must call the backend with the recovered output path.", failures);
    assertNotIncludes(handleExportCurrentSource, "if (!roundResult)", "Current export must not disappear just because roundResult is missing after refresh.", failures);

    const handleSelectHistorySource = extractFunctionSource(appSource, "handleSelectHistory");
    assertIncludes(handleSelectHistorySource, "clearPendingAutoActionForManualContextChange();", "Selecting history must cancel pending automatic runs instead of carrying them into the selected record.", failures);
    assertNotIncludes(handleSelectHistorySource, "service.startRunRound", "Selecting history must only load state and snapshots, not start a rewrite run.", failures);

    const handlePickFileSource = extractFunctionSource(appSource, "handlePickFile");
    assertIncludes(handlePickFileSource, "clearPendingAutoActionForManualContextChange();", "Picking a new document must cancel pending automatic runs.", failures);

    assertIncludes(appSource, "sameWorkspacePath(roundProgressStatus.sourcePath, value?.sourcePath)", "Home run panel must not show a resume checkpoint from another history document.", failures);

    const cancelSource = extractFunctionSource(appSource, "handleCancelRunRound");
    assertIncludes(cancelSource, "const runSession = runSessionRef.current;", "Cancel must target the current run session.", failures);
    assertIncludes(cancelSource, "transitionTask(runSession.taskTicket, \"canceling-run\"", "Cancel must transition the matching task ticket.", failures);
    assertIncludes(cancelSource, "await service.cancelRunRound(runSession.runId);", "Cancel must call the backend with the session run id.", failures);
    assertIncludes(appSource, "const runRecoveryState = buildRunRecoveryPanelState", "Home run panel must use the shared recovery state helper.", failures);
    assertIncludes(appSource, "<RunRecoveryPanel state={running ? null : runRecoveryState} />", "Home run panel must not duplicate the main running progress card.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "const compareReady = Boolean(", "Result card must derive output readiness from compare data, not result metadata alone.", failures);
    assertIncludes(resultCardSource, "compareData.chunkCount === compareData.chunks.length", "Result card must reject empty or partial compare data before enabling export.", failures);
    assertNotIncludes(resultCardSource, "const hasOutput = Boolean(result || compareData?.chunks.length);", "Result card must not show export controls from result metadata alone.", failures);
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
      "zero-chunk compare data cannot become an export-ready completed result",
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
