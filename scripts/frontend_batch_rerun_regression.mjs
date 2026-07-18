import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");
const PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptPreviewDraftActionFactory.ts");
const RESULT_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardProps.ts");
const USE_REWRITE_DIFF_PANEL_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRewriteDiffPanelModel.ts");
const REWRITE_DIFF_PANEL_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelProps.ts");
const USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAutoSnapshotRestoreRefs.ts");
const DOCUMENT_RESTORE_EFFECT_RUNNER_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreEffectRunner.ts");
const APPEND_ROUND_CONTROL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appendRoundControlHelpers.ts");
const REWRITE_DIFF_PANEL_CHUNK_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelChunkList.tsx");
const USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useActiveBatchRerunProbeEffect.ts");
const USE_ACTIVE_RUN_PROBE_EFFECT_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useActiveRunProbeEffect.ts");
const USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelFocusScrollEffects.ts");
const USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollRestoreEffects.ts");
const USE_RUN_SESSION_BATCH_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionBatchControls.ts");
const USE_RUN_SESSION_RUN_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionRunControls.ts");
const CHUNK_QUALITY_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityActions.tsx");
const CHUNK_QUALITY_META_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityMeta.tsx");
const WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModelConfigSecrets.ts");
const WEB_SERVICE_HTTP_ERROR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHttpErrorHelpers.ts");
const RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionAwaitHandlers.ts");
const RUN_ROUND_SESSION_START_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionStartHandlers.ts");
const AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunFailureRefreshHandlers.ts");
const AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunScheduleCoreHandlers.ts");
const EXPORT_EXECUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportExecuteHandlers.ts");
const EXPORT_RESOLVE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportResolveHandlers.ts");
const HISTORY_CARD_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBody.tsx");
const USE_DOCUMENT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDocumentRestoreRefs.ts");
const ROUND_RUN_STATUS_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundRunStatusViewModel.ts");
const REWRITE_DIFF_TEXT_PANE_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffTextPane.tsx");
const USE_DIFF_PANEL_SCROLL_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollEffects.ts");
const USE_DIFF_PANEL_FILTER_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelFilterEffects.ts");
const HISTORY_ARTIFACT_REPAIR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactRepairHelpers.ts");
const HISTORY_ARTIFACT_QUERY_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactQueryHelpers.ts");
const DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionFailureHelpers.ts");
const DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionSuccessHelpers.ts");
const DIAGNOSTICS_PAGE_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPageHeader.tsx");
const AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreEffectHelpers.ts");
const RESULT_CARD_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardCopy.ts");
const DIFF_REVIEW_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiffReviewCard.tsx");
const REWRITE_DIFF_CHUNK_ALERTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffChunkAlerts.tsx");
const DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelFocusEffectHelpers.ts");
const DIFF_PANEL_SCROLL_POSITION_STORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelScrollPositionStore.ts");
const REWRITE_DIFF_PANEL_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelEmpty.tsx");
const REWRITE_DIFF_PANEL_ALERTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelAlerts.tsx");
const DIAGNOSTICS_TASK_BUILD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskBuildHelpers.ts");
const DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskAccessHelpers.ts");
const ACTIVE_RUN_PROBE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "activeRunProbeHelpers.ts");
const BATCH_RERUN_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunNoticeHelpers.ts");
const BATCH_RERUN_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunDecisionHelpers.ts");
const HISTORY_ORPHAN_SCAN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanScanHandlers.ts");
const WEB_SERVICE_ROUND_IO_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRoundIoApi.ts");
const WEB_SERVICE_RUN_ROUND_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunRoundApi.ts");
const HISTORY_DELETE_PREVIEW_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeletePreviewHandlers.ts");
const HISTORY_DELETE_APPLY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteApplyHandlers.ts");
const CHUNK_QUALITY_BAR_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "chunkQualityBarCopy.ts");
const APP_REVIEW_REFRESH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appReviewRefreshHandlers.ts");
const APP_TASK_LIFECYCLE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appTaskLifecycleHandlers.ts");
const RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressFeedbackPrep.ts");
const RUN_ROUND_PROGRESS_VIEW_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressViewPrep.ts");
const BATCH_RERUN_WAIT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunWaitHandlers.ts");
const BATCH_RERUN_MATERIALIZE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunMaterializeHandlers.ts");
const DIAGNOSTICS_SHARE_CORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareCoreHelpers.ts");
const RUN_SESSION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "runSessionHelpers.ts");
const DIAGNOSTICS_SHARE_RUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareRunHelpers.ts");
const AUTO_RUN_ACTION_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunActionFormatHelpers.ts");
const RESULT_CARD_SM_WRAPPERS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardSmWrappers.tsx");
const APP_CLEAR_PENDING_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appClearPendingHandlers.ts");
const RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSuccessCompletionHandlers.ts");
const RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundFailureCompletionHandlers.ts");
const APP_WORKBENCH_SHELL_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appWorkbenchShellHandlers.ts");
const RUN_FAILURE_SCHEDULE_PLAN_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureSchedulePlan.ts");
const RUN_FAILURE_SCHEDULE_BUILDERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureScheduleBuilders.ts");
const RESULT_CARD_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardDecisionHelpers.ts");
const RESULT_CARD_REVIEW_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardReviewHelpers.ts");
const RESULT_CARD_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardFormatHelpers.ts");
const RESULT_CARD_TOKEN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardTokenHelpers.ts");
const REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelChunkViewModel.ts");
const REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelFilterViewModel.ts");
const REWRITE_DIFF_PANEL_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelCopy.ts");
const CHUNK_QUALITY_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "chunkQualityDecisionHelpers.ts");
const REWRITE_DIFF_PANEL_TOOLBAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelToolbar.tsx");
const RESULT_CARD_EXPORT_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardExportActions.tsx");
const DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelScrollFocusHelpers.ts");
const EXPORT_NOTICE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeActionHelpers.ts");
const EXPORT_NOTICE_ERROR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeErrorHelpers.ts");
const EXPORT_NOTICE_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeFormatHelpers.ts");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const RUNTIME_TASK_CENTER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterHelpers.ts");
const RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterPhaseHelpers.ts");
const RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterActiveHelpers.ts");
const RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterBackgroundHelpers.ts");
const RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterDiffHelpers.ts");
const BATCH_RERUN_STATUS_ALERT_PATH = resolve(ROOT_DIR, "app", "src", "components", "BatchRerunStatusAlert.tsx");
const AUTO_SNAPSHOT_RESTORE_SESSION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreSessionHelpers.ts");
const WEB_SERVICE_EXPORT_RESULT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportResult.ts");
const WEB_SERVICE_EXPORT_HEADERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportHeaders.ts");
const EXPORT_LIVE_HINT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportLiveHint.tsx");
const EXPORT_FAILURE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportFailurePanels.tsx");
const EXPORT_HEALTH_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthPanel.tsx");
const EXPORT_HEALTH_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHealthViewModel.ts");
const DIAGNOSTICS_PAGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPage.tsx");
const DIAGNOSTICS_PAGE_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsPageViewModel.ts");
const DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsProblemAndChecksSection.tsx");
const DIAGNOSTICS_RUNTIME_SECTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsRuntimeSections.tsx");
const EXPORT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHelpers.ts");
const EXPORT_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportFailureHelpers.ts");
const EXPORT_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportRerunHelpers.ts");
const EXPORT_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeHelpers.ts");
const DIAGNOSTICS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsHelpers.ts");
const DIAGNOSTICS_TASK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskHelpers.ts");
const DIAGNOSTICS_SHARE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareHelpers.ts");
const DIAGNOSTICS_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsFeedbackHelpers.ts");
const BATCH_RERUN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHandlers.ts");
const BATCH_RERUN_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunCoreHandlers.ts");
const BATCH_RERUN_ACTION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunActionHandlers.ts");
const BATCH_RERUN_ATTACH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunAttachHandlers.ts");
const BATCH_RERUN_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHandlerTypes.ts");
const BATCH_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHelpers.ts");
const BATCH_RERUN_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunFeedbackHelpers.ts");
const BATCH_RERUN_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunSelectionHelpers.ts");
const SINGLE_CHUNK_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "singleChunkRerunHelpers.ts");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const RESULT_CARD_OUTPUT_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardOutputViewModel.ts");
const REWRITE_DIFF_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanel.tsx");
const REWRITE_DIFF_PANEL_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelViewModel.ts");
const REWRITE_DIFF_CHUNK_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffChunkCard.tsx");
const CHUNK_QUALITY_BAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityBar.tsx");
const REVIEW_DECISION_DEFAULTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisionDefaults.ts");
const DIFF_FILTER_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffFilterModel.ts");
const DIFF_PANEL_SCROLL_FOCUS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollFocus.ts");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const WEB_SERVICE_HTTP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHttp.ts");
const WEB_SERVICE_EXPORT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExport.ts");
const WEB_SERVICE_ROUNDS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRounds.ts");
const WEB_SERVICE_FORMAT_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFormat.ts");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_batch_rerun_regression_report.json");

async function importTypeScriptModule(relativePath) {
  const source = readFileSync(resolve(APP_DIR, relativePath), "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const {
  buildSingleChunkBatchRerunTargets,
  buildSingleChunkRerunIdentity,
} = await importTypeScriptModule(
  "src/lib/singleChunkRerunHelpers.ts",
);

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
    assertIncludes(functionSource, "selectRiskyRerunChunkIds(", "Bulk needs-review rerun must not mix unresolved failed chunks into the request.", failures);
    assertIncludes(functionSource, "unresolvedFailureChunkIds", "Bulk needs-review rerun must not mix unresolved failed chunks into the request.", failures);
    assertIncludes(functionSource, "isHighRiskFailedOutputChunk", "Bulk needs-review rerun must not mix high-risk failed outputs into ordinary needs-review requests.", failures);
    const riskyHelperSource = [
      existsSync(BATCH_RERUN_HELPERS_PATH) ? readFileSync(BATCH_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH) ? readFileSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_NOTICE_HELPERS_PATH) ? readFileSync(BATCH_RERUN_NOTICE_HELPERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_DECISION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_SELECTION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_SELECTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n");
    assertIncludes(riskyHelperSource, "!input.unresolvedFailureChunkIds.has(chunk.chunkId)", "Bulk needs-review rerun must not mix unresolved failed chunks into the request.", failures);
    assertIncludes(riskyHelperSource, "!input.isHighRiskFailedOutputChunk(chunk)", "Bulk needs-review rerun must not mix high-risk failed outputs into ordinary needs-review requests.", failures);
    assertIncludes(riskyHelperSource, "chunk.rateAuditStrategyReviewRequired !== true", "Bulk rerun must not replace an unconfirmed RateAudit strategy candidate.", failures);
  }
}

function checkBackendTaskContract(appSource, resultCardSource, failures) {
  const batchRerunAttachSource = existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH)
    ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8")
    : "";
  const batchRerunHandlerTypesSource = existsSync(BATCH_RERUN_HANDLER_TYPES_PATH)
    ? readFileSync(BATCH_RERUN_HANDLER_TYPES_PATH, "utf-8")
    : "";
  const batchAppSource = `${appSource}\n${existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : ""}\n${(existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "")}\n${[
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? [
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n")}`;
  assertIncludes(batchAppSource, "startBatchRerun(outputPath, targets", "Batch rerun must start a backend task.", failures);
  assertIncludes(batchRerunHandlerTypesSource, "modelConfigOverride?: ModelConfig", "Batch rerun handler contract must type strategy-specific model overrides as ModelConfig.", failures);
  assertIncludes(batchRerunAttachSource, "modelConfigOverride?: ModelConfig", "Batch rerun implementation must use the same explicit ModelConfig override type as its public handler contract.", failures);
  assertIncludes(batchRerunAttachSource, "modelConfigOverride ?? deps.getModelConfig()", "Batch rerun must forward an explicit model override and otherwise preserve the configured default.", failures);
  assertIncludes(batchAppSource, "getBatchRerunStatus(runId)", "Batch rerun must poll backend task status.", failures);
  assertIncludes(batchAppSource, "cancelBatchRerun(session.runId)", "Batch rerun must expose backend cancellation.", failures);
  assertIncludes(batchAppSource, "function attachActiveBatchRerun", "Frontend must be able to re-attach active batch reruns after refresh.", failures);
  assertIncludes(appSource, "useActiveRunProbes({", "Frontend health probing must inspect active batch reruns.", failures);
  assertIncludes([[readFileSync(resolve(ROOT_DIR, "app", "src", "hooks", "useActiveRunProbes.ts"), "utf-8"), existsSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH, "utf-8") : "", existsSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH, "utf-8") : "", existsSync(ACTIVE_RUN_PROBE_HELPERS_PATH) ? readFileSync(ACTIVE_RUN_PROBE_HELPERS_PATH, "utf-8") : ""].join("\n"), existsSync(ACTIVE_RUN_PROBE_HELPERS_PATH) ? readFileSync(ACTIVE_RUN_PROBE_HELPERS_PATH, "utf-8") : ""].join("\n"), "result.activeBatchReruns ?? []", "Frontend health probing must inspect active batch reruns.", failures);
  assertIncludes([[readFileSync(resolve(ROOT_DIR, "app", "src", "hooks", "useActiveRunProbes.ts"), "utf-8"), existsSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH, "utf-8") : "", existsSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH, "utf-8") : "", existsSync(ACTIVE_RUN_PROBE_HELPERS_PATH) ? readFileSync(ACTIVE_RUN_PROBE_HELPERS_PATH, "utf-8") : ""].join("\n"), existsSync(ACTIVE_RUN_PROBE_HELPERS_PATH) ? readFileSync(ACTIVE_RUN_PROBE_HELPERS_PATH, "utf-8") : ""].join("\n"), "void attachActiveBatchRerunRef.current(activeBatch)", "Frontend must auto attach matching active batch reruns.", failures);
  assertIncludes(batchAppSource, "function applyBatchRerunResult", "Batch rerun completion must converge through one result applier.", failures);
  assertIncludes(batchAppSource, "result.failures.map", "Batch rerun failures must be promoted into visible Diff state.", failures);
  assertIncludes([
      existsSync(BATCH_RERUN_HELPERS_PATH) ? readFileSync(BATCH_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH) ? readFileSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_DECISION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_NOTICE_HELPERS_PATH) ? readFileSync(BATCH_RERUN_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_SELECTION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_SELECTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "result.successChunkIds ?? []", "Batch rerun completion must preserve successful chunk decisions after refresh.", failures);
  assertIncludes(appSource, "batchRerunRunning={Boolean(currentBatchRerunToken)}", "Home ResultCard must receive batch rerun running state.", failures);
  assertIncludes(appSource, "onCancelBatchRerun={() => void handleCancelBatchRerun()}", "Home ResultCard must wire batch rerun cancellation.", failures);
  assertIncludes(appSource, "activeBatchReruns", "Diagnostics/task center must keep active batch rerun fallback data.", failures);
  assertIncludes([
      existsSync(DIAGNOSTICS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_SHARE_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_HELPERS_PATH, "utf-8") : "",
    existsSync(DIAGNOSTICS_SHARE_CORE_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_CORE_HELPERS_PATH, "utf-8") : "",
    existsSync(DIAGNOSTICS_SHARE_RUN_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_RUN_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "recentBatchReruns", "Diagnostics must keep persisted batch rerun fallback data after backend restart.", failures);
  assertIncludes([
      existsSync(DIAGNOSTICS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_SHARE_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "export function buildDiagnosticTaskItems", "Diagnostics must normalize backend and fallback task summaries together.", failures);
  assertIncludes([
      existsSync(DIAGNOSTICS_PAGE_PATH) ? readFileSync(DIAGNOSTICS_PAGE_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_HEADER_PATH) ? readFileSync(DIAGNOSTICS_PAGE_HEADER_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH) ? readFileSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH) ? readFileSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH, "utf-8") : "",
    ].join("\n"), "function DiagnosticTaskAlert", "Diagnostics must render persisted task summaries through one user-facing task component.", failures);
  assertIncludes([
      existsSync(DIAGNOSTICS_PAGE_PATH) ? readFileSync(DIAGNOSTICS_PAGE_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_HEADER_PATH) ? readFileSync(DIAGNOSTICS_PAGE_HEADER_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH) ? readFileSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH) ? readFileSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH, "utf-8") : "",
    ].join("\n"), "后台任务", "Diagnostics must label persisted task summaries as one task area.", failures);
  assertIncludes([
      existsSync(DIAGNOSTICS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_SHARE_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_FEEDBACK_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "未完成", "Persisted unfinished task summaries must keep a clear status.", failures);
  assertIncludes(resultCardSource, "batchRerunRunning?: boolean;", "ResultCard must expose batch rerun running prop.", failures);
  assertIncludes(resultCardSource, "onCancelBatchRerun?: () => void;", "ResultCard must expose batch rerun cancel prop.", failures);
  assertIncludes(resultCardSource, "停止重跑", "ResultCard must show a stop action during batch rerun.", failures);
}

function checkTargetedRerunFeedbackContract(appSource, resultCardSource, failures) {
  const batchHandlersSource = [
    existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? [
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
  ].join("\n");
  const batchAppSource = `${appSource}\n${batchHandlersSource}`;
  assertIncludes(resultCardSource, "onRerun={(userFeedback) => onRerunChunk(chunk.chunkId, userFeedback)}", "Diff chunk rerun button must forward manual feedback.", failures);
  assertIncludes(resultCardSource, "onClick={() => onRerun(feedback)}", "Chunk quality action must send textbox feedback to the rerun callback.", failures);
  assertRegex(
    appSource,
    /onRerunChunk=\{\(chunkId,\s*userFeedback\)\s*=>\s*void handleRerunChunk\(chunkId,\s*userFeedback\)\}/,
    "Home ResultCard wiring must preserve manual rerun feedback.",
    failures,
  );
  const singleRerunSource = extractFunctionSource(appSource, "handleRerunChunk");
  const feedbackTargets = buildSingleChunkBatchRerunTargets("p7_c0", "保留技术因果关系");
  const emptyFeedbackTargets = buildSingleChunkBatchRerunTargets("p8_c0");
  const validIdentity = buildSingleChunkRerunIdentity("/papers/a.docx", {
    outputPath: "/finish/a/round1.txt",
    docId: "a",
    round: 1,
  });
  assertIncludes(
    readFileSync(SINGLE_CHUNK_RERUN_HELPERS_PATH, "utf-8"),
    "return [{ chunkId, userFeedback }]",
    "The single chunk target builder must not move manual feedback into progress metadata.",
    failures,
  );
  if (
    feedbackTargets.length !== 1
    || feedbackTargets[0]?.chunkId !== "p7_c0"
    || feedbackTargets[0]?.userFeedback !== "保留技术因果关系"
  ) {
    failures.push("Single chunk manual feedback must remain bound to its exact background-task target.");
  }
  if (emptyFeedbackTargets.length !== 1 || emptyFeedbackTargets[0]?.chunkId !== "p8_c0") {
    failures.push("Single chunk reruns without feedback must still create exactly one background-task target.");
  }
  if (!validIdentity || buildSingleChunkRerunIdentity("/papers/a.docx", { outputPath: "", docId: "a", round: 1 })) {
    failures.push("Single chunk background launch identity must require source/output/document/round fields.");
  }
  assertIncludes(singleRerunSource, "buildSingleChunkBatchRerunTargets(chunkId, userFeedback)", "Single chunk rerun must bind manual feedback into one batch target.", failures);
  assertIncludes(singleRerunSource, "buildSingleChunkRerunIdentity(", "Single chunk rerun must require complete source/output/document/round identity.", failures);
  assertIncludes(singleRerunSource, "compareDataMatchesDocument(visibleCompare, visibleDocument, promptOptions, promptWorkflows)", "Single chunk rerun must reject a compare that does not belong to the visible document and prompt route.", failures);
  assertIncludes(singleRerunSource, "runBatchRerunTask(`重跑块 ${chunkId}`, outputPath, targets)", "Single chunk UI reruns must use the resumable background-task chain.", failures);
  assertNotIncludes(singleRerunSource, "rerunChunkAtOutputPath", "Single chunk UI reruns must not call the removed synchronous frontend path.", failures);
  assertNotIncludes(singleRerunSource, "service.rerunChunk", "Single chunk UI reruns must not wait on the synchronous rerun HTTP request.", failures);
  assertNotIncludes(batchHandlersSource, "service.rerunChunk", "Product batch/single rerun handlers must not retain a synchronous rerun call.", failures);
  assertIncludes(batchAppSource, "startBatchRerun(outputPath, targets", "Single chunk UI reruns must receive a run id from the existing background endpoint.", failures);
  assertIncludes(batchAppSource, "getBatchRerunStatus(runId)", "Single chunk UI reruns must poll metadata-only background status.", failures);
  assertIncludes(batchAppSource, "cancelBatchRerun(session.runId)", "Single chunk UI reruns must remain cancelable.", failures);
  assertIncludes(batchAppSource, "attachActiveBatchRerun", "Single chunk UI reruns must remain re-attachable after refresh.", failures);
  assertNotIncludes(batchHandlersSource, "status.lastEvent", "Frontend polling must not render or consume provider event payloads.", failures);
  const compatibilityApiSource = readFileSync(WEB_SERVICE_ROUND_IO_API_PATH, "utf-8");
  assertIncludes(compatibilityApiSource, "async rerunChunk(", "The synchronous rerun service method must remain available for compatibility callers.", failures);
  assertIncludes(compatibilityApiSource, 'requestJson<RerunChunkResult>("/api/rerun-chunk"', "The legacy /api/rerun-chunk endpoint must remain wired for compatibility callers.", failures);
  const flushIndex = singleRerunSource.indexOf("flushReviewDecisionsBeforeRerun(outputPath)");
  const identityIndex = singleRerunSource.indexOf("buildSingleChunkRerunIdentity(");
  const launchIndex = singleRerunSource.indexOf("runBatchRerunTask(");
  if (!(flushIndex >= 0 && identityIndex > flushIndex && launchIndex > identityIndex)) {
    failures.push("Single chunk reruns must flush review saves and validate document/Diff identity before starting the background task.");
  }
}

function checkRerunFailureVisibilityContract(appSource, resultCardSource, failures) {
  const batchAppSource = `${appSource}\n${existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : ""}\n${(existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "")}\n${[
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? [
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n")}`;
  assertIncludes(appSource, "const [rerunFailures, setRerunFailures] = useState<BatchRerunFailure[]>([]);", "App must keep visible rerun failure state.", failures);
  assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "types", "app.ts"), "utf-8"), "scopeKey?: string;", "Rerun failure records must carry a Diff scope.", failures);
  assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
    existsSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH) ? readFileSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH, "utf-8") : "",
    existsSync(EXPORT_NOTICE_ACTION_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ACTION_HELPERS_PATH, "utf-8") : "",
    existsSync(EXPORT_NOTICE_ERROR_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ERROR_HELPERS_PATH, "utf-8") : "",
    existsSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "export function getRerunFailureScopeKey", "App must derive a stable Diff scope for rerun failures.", failures);
  assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "export function scopeRerunFailures", "Batch failures must be scoped before display.", failures);
  assertIncludes(appSource, "failure.scopeKey === activeRerunFailureScopeKey && activeChunkIds.has(failure.chunkId)", "App must scope rerun failures to the active Diff.", failures);
  assertIncludes(batchAppSource, "function upsertRerunFailure(failure: BatchRerunFailure)", "Rerun failures must be recorded for the Diff UI.", failures);
  assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "export function extractRerunFailureExtras(error: unknown)", "Compatibility error helpers must continue to understand backend failure details.", failures);
  assertNotIncludes(appSource, "normalizeFailureRejectedCandidates", "Frontend rerun failures must not keep removed candidate payload normalization.", failures);
  assertNotIncludes(appSource, "extractRerunFailureExtras(appError)", "Single chunk UI reruns must receive failures through the unified background result instead of a synchronous catch path.", failures);
  assertIncludes(batchAppSource, "result.failures.map((failure) => ({ ...failure }))", "Batch rerun failures must preserve backend failure records.", failures);
  assertIncludes(batchAppSource, "deps.setRerunFailures(scopeRerunFailures(failures, latestCompare))", "Batch rerun failures must be promoted into visible scoped Diff state.", failures);
  assertIncludes(appSource, "rerunFailures={activeRerunFailures}", "Home ResultCard must receive active rerun failures.", failures);
  assertIncludes(appSource, "batchRerunStatusText={runtimeLabel}", "Home ResultCard must show live batch rerun status text.", failures);
  assertIncludes(resultCardSource, "rerunFailures?: RerunFailure[];", "ResultCard must expose rerun failure input.", failures);
  assertIncludes(resultCardSource, "batchRerunStatusText?: string;", "ResultCard must expose batch rerun status text.", failures);
  assertNotIncludes(resultCardSource, "rejectedCandidates?: NonNullable<RoundCompareData[\"chunks\"][number][\"rejectedCandidates\"]>;", "ResultCard rerun failures must not carry removed candidate payloads.", failures);
  assertIncludes(resultCardSource, "type DiffFilterMode = \"all\" | \"review\" | \"highRisk\" | \"failed\";", "Diff panel filters must keep high-risk as a compact first-class mode.", failures);
  assertIncludes(resultCardSource, "const [filterMode, setFilterMode] = useState<DiffFilterMode>(\"all\");", "Diff panel must keep filter mode as a typed state.", failures);
  assertIncludes(resultCardSource, "const previousFailedCountRef = useRef(0);", "Diff panel must detect newly appeared failed chunks.", failures);
  assertIncludes(resultCardSource, "filterMode: \"failed\"", "Diff panel must auto-focus failed chunks when new failures appear.", failures);
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
  assertIncludes(resultCardSource, "后台重跑进行中", "ResultCard must keep single and batch rerun status visible with accurate shared copy.", failures);
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
  assertIncludes(
    readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8"),
    "disabled={busy || strategyReviewPending}",
    "Single rerun must require an explicit decision before replacing a pending RateAudit strategy candidate.",
    failures,
  );
  assertRegex(
    readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8"),
    /onClick=\{onAdoptRewrite\}\s+disabled=\{busy \|\| isHighRiskFailedOutput\}/,
    "Review adoption must be disabled while a rerun task can replace candidates or the candidate is a high-risk failed output.",
    failures,
  );
  assertRegex(
    readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8"),
    /onClick=\{onUseSource\} disabled=\{busy\}/,
    "Source confirmation must be disabled while a rerun task can replace candidates.",
    failures,
  );
  assertIncludes(resultCardSource, "!isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? getDefaultReviewDecisionForChunk(chunk))", "Diff review and high-risk counts must only include unresolved chunks.", failures);
  assertIncludes(resultCardSource, "!failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId)", "Ordinary needs-review counts must not double-count failed or high-risk outputs.", failures);
  assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function normalizeReviewDecisionsForSave", "Review decision saves must not collapse default and confirmed choices together.", failures);
  assertIncludes(readFileSync(RESULT_CARD_DECISION_HELPERS_PATH, "utf-8"), "return !isFailedOutputDecision(decision);", "Failed-output and rejected-candidate decisions must not clear unresolved high-risk counts, regardless of their legacy confirmed value.", failures);
  assertIncludes(resultCardSource, "flags.includes(\"targeted_rerun_fallback\")", "Targeted rerun fallback outputs must be visible through the high-risk Diff lane.", failures);
  assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision", "Rerun completion must derive default decisions from the latest compare data.", failures);
  const reviewDecisionDefaultsSource = readFileSync(REVIEW_DECISION_DEFAULTS_PATH, "utf-8");
  assertIncludes(reviewDecisionDefaultsSource, "chunk.rerunDefaultDecision", "Frontend defaults must prefer the backend-persisted rerun decision.", failures);
  assertIncludes(reviewDecisionDefaultsSource, "citation_missing", "Citation-risk candidates must default to safe source consistently with export.", failures);
  assertIncludes(reviewDecisionDefaultsSource, "chunk.rateAuditStrategyReviewRequired === true", "Pending strategy candidates must default to safe source consistently with export.", failures);
  assertIncludes(reviewDecisionDefaultsSource, "chunk.rerunStatus === \"fallback\"", "Fallback candidates must default to safe source consistently with export.", failures);
  assertIncludes(
    readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8"),
    "buildLoadedRoundSnapshotReviewDecisions(",
    "Single rerun completion must keep strategy-derived candidates review-gated through the authoritative snapshot.",
    failures,
  );
  assertIncludes(
    appSource,
    "flushReviewDecisionsBeforeRerun",
    "Single and batch reruns must flush pending review saves before replacing candidates.",
    failures,
  );
  assertIncludes(
    appSource,
    "if (!flushed)",
    "Reruns must use the output-bound flush result and fail closed on unsaved or conflicted review state.",
    failures,
  );
  assertNotIncludes(
    readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8"),
    "默认采用新改写",
    "Single rerun completion must not bypass snapshot-derived review defaults with a synchronous success claim.",
    failures,
  );
  assertIncludes(
    `${appSource}\n${existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : ""}\n${(existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "")}\n${[
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? [
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n")}`,
    "buildLoadedRoundSnapshotReviewDecisions(",
    "Single rerun defaults must be rebuilt from the revision-consistent compare/review snapshot.",
    failures,
  );
  assertIncludes(
    readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8"),
    "snapshot.review.decisions",
    "Single rerun fallback chunks must keep the server-authoritative safe-source defaults and saved decisions.",
    failures,
  );
  assertIncludes([
      existsSync(BATCH_RERUN_HELPERS_PATH) ? readFileSync(BATCH_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH) ? readFileSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_DECISION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_NOTICE_HELPERS_PATH) ? readFileSync(BATCH_RERUN_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_SELECTION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_SELECTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "getDefaultReviewDecisionForChunk(compareData, target.chunkId)", "Batch rerun fallback chunks must keep safe-source defaults.", failures);
  assertNotIncludes(appSource, "[chunkId]: \"rewrite\" }));", "Single rerun must not force fallback chunks back to default rewrite.", failures);
  assertNotIncludes(appSource, "completedTargets.map((target) => [target.chunkId, \"rewrite\" as ReviewDecision])", "Batch rerun must not force fallback chunks back to default rewrite.", failures);
  assertNotIncludes(appSource, "if (decision === \"source\" || decision === \"source_confirmed\")", "Default source choices must not be persisted as confirmed decisions.", failures);
  assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function normalizeSavedReviewDecisionsForCompare", "Loading saved decisions must recover legacy hidden high-risk chunks.", failures);
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
  const source = failures.length ? "" : [
    readFileSync(APP_PATH, "utf-8"),
    existsSync(APP_REVIEW_REFRESH_HANDLERS_PATH) ? readFileSync(APP_REVIEW_REFRESH_HANDLERS_PATH, "utf-8") : "",
    existsSync(APP_WORKBENCH_SHELL_HANDLERS_PATH) ? readFileSync(APP_WORKBENCH_SHELL_HANDLERS_PATH, "utf-8") : "",
    existsSync(APP_TASK_LIFECYCLE_HANDLERS_PATH) ? readFileSync(APP_TASK_LIFECYCLE_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH) ? readFileSync(RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_PROGRESS_VIEW_PREP_PATH) ? readFileSync(RUN_ROUND_PROGRESS_VIEW_PREP_PATH, "utf-8") : "",
    existsSync(APP_CLEAR_PENDING_HANDLERS_PATH) ? readFileSync(APP_CLEAR_PENDING_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUNTIME_TASK_CENTER_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_HELPERS_PATH, "utf-8") : "",
    existsSync(RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH, "utf-8") : "",
    existsSync(RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH, "utf-8") : "",
    existsSync(RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH, "utf-8") : "",
    existsSync(RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH, "utf-8") : "",
  ].join("\n");
  const resultCardSource = failures.length ? "" : [
    readFileSync(RESULT_CARD_PATH, "utf-8"),
    existsSync(RESULT_CARD_PROPS_PATH) ? readFileSync(RESULT_CARD_PROPS_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_SM_WRAPPERS_PATH) ? readFileSync(RESULT_CARD_SM_WRAPPERS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_STATUS_ALERT_PATH) ? readFileSync(BATCH_RERUN_STATUS_ALERT_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_EXPORT_ACTIONS_PATH) ? readFileSync(RESULT_CARD_EXPORT_ACTIONS_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_OUTPUT_VIEW_MODEL_PATH) ? readFileSync(RESULT_CARD_OUTPUT_VIEW_MODEL_PATH, "utf-8") : "",
  ].join("\n");
  const rewriteDiffPanelSource = failures.length || !existsSync(REWRITE_DIFF_PANEL_PATH) ? "" : [
      existsSync(REWRITE_DIFF_PANEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_COPY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_COPY_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_CHUNK_CARD_PATH) ? readFileSync(REWRITE_DIFF_CHUNK_CARD_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH) ? readFileSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH, "utf-8") : "",
    ].join("\n");
  const chunkQualityBarSource = failures.length || !existsSync(CHUNK_QUALITY_BAR_PATH) ? "" : [readFileSync(CHUNK_QUALITY_BAR_PATH, "utf-8"), existsSync(CHUNK_QUALITY_DECISION_HELPERS_PATH) ? readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8") : "", existsSync(CHUNK_QUALITY_META_PATH) ? readFileSync(CHUNK_QUALITY_META_PATH, "utf-8") : "", existsSync(CHUNK_QUALITY_ACTIONS_PATH) ? readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8") : "", existsSync(CHUNK_QUALITY_BAR_COPY_PATH) ? readFileSync(CHUNK_QUALITY_BAR_COPY_PATH, "utf-8") : ""].join("\n");
  const diffFilterModelSource = failures.length || !existsSync(DIFF_FILTER_MODEL_PATH) ? "" : readFileSync(DIFF_FILTER_MODEL_PATH, "utf-8");
  const resultDiffSource = `${resultCardSource}\n${rewriteDiffPanelSource}\n${chunkQualityBarSource}\n${diffFilterModelSource}\n${failures.length || !existsSync(DIFF_PANEL_SCROLL_FOCUS_PATH) ? "" : readFileSync(DIFF_PANEL_SCROLL_FOCUS_PATH, "utf-8")}\n${failures.length || !existsSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH) ? "" : readFileSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_EXPORT_ACTIONS_PATH) ? "" : readFileSync(RESULT_CARD_EXPORT_ACTIONS_PATH, "utf-8")}\n${failures.length || !existsSync(CHUNK_QUALITY_DECISION_HELPERS_PATH) ? "" : readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_COPY_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_COPY_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_TOKEN_HELPERS_PATH) ? "" : readFileSync(RESULT_CARD_TOKEN_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_FORMAT_HELPERS_PATH) ? "" : readFileSync(RESULT_CARD_FORMAT_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_REVIEW_HELPERS_PATH) ? "" : readFileSync(RESULT_CARD_REVIEW_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_DECISION_HELPERS_PATH) ? "" : readFileSync(RESULT_CARD_DECISION_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_SM_WRAPPERS_PATH) ? "" : readFileSync(RESULT_CARD_SM_WRAPPERS_PATH, "utf-8")}\n${failures.length || !existsSync(CHUNK_QUALITY_BAR_COPY_PATH) ? "" : readFileSync(CHUNK_QUALITY_BAR_COPY_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_ALERTS_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_ALERTS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_EMPTY_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_EMPTY_PATH, "utf-8")}\n${failures.length || !existsSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH) ? "" : readFileSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH, "utf-8")}\n${failures.length || !existsSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH) ? "" : readFileSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_CHUNK_ALERTS_PATH) ? "" : readFileSync(REWRITE_DIFF_CHUNK_ALERTS_PATH, "utf-8")}\n${failures.length || !existsSync(DIFF_REVIEW_CARD_PATH) ? "" : readFileSync(DIFF_REVIEW_CARD_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_COPY_PATH) ? "" : readFileSync(RESULT_CARD_COPY_PATH, "utf-8")}\n${failures.length || !existsSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH) ? "" : readFileSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH, "utf-8")}\n${failures.length || !existsSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH) ? "" : readFileSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_TEXT_PANE_PATH) ? "" : readFileSync(REWRITE_DIFF_TEXT_PANE_PATH, "utf-8")}\n${failures.length || !existsSync(CHUNK_QUALITY_META_PATH) ? "" : readFileSync(CHUNK_QUALITY_META_PATH, "utf-8")}\n${failures.length || !existsSync(CHUNK_QUALITY_ACTIONS_PATH) ? "" : readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8")}\n${failures.length || !existsSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH) ? "" : readFileSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH, "utf-8")}\n${failures.length || !existsSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH) ? "" : readFileSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH, "utf-8")}\n${failures.length || !existsSync(REWRITE_DIFF_PANEL_PROPS_PATH) ? "" : readFileSync(REWRITE_DIFF_PANEL_PROPS_PATH, "utf-8")}\n${failures.length || !existsSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH) ? "" : readFileSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH, "utf-8")}\n${failures.length || !existsSync(RESULT_CARD_PROPS_PATH) ? "" : readFileSync(RESULT_CARD_PROPS_PATH, "utf-8")}`;
  const webServiceMainSource = failures.length ? "" : readFileSync(WEB_SERVICE_PATH, "utf-8");
  const webServiceHttpSource = failures.length || !existsSync(WEB_SERVICE_HTTP_PATH) ? "" : [
    readFileSync(WEB_SERVICE_HTTP_PATH, "utf-8"),
    existsSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH) ? readFileSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH, "utf-8") : "",
  ].join("\n");
  const webServiceExportSource = failures.length || !existsSync(WEB_SERVICE_EXPORT_PATH) ? "" : [
    readFileSync(WEB_SERVICE_EXPORT_PATH, "utf-8"),
    existsSync(WEB_SERVICE_EXPORT_HEADERS_PATH) ? readFileSync(WEB_SERVICE_EXPORT_HEADERS_PATH, "utf-8") : "",
    existsSync(WEB_SERVICE_EXPORT_RESULT_PATH) ? readFileSync(WEB_SERVICE_EXPORT_RESULT_PATH, "utf-8") : "",
  ].join("\n");
  const webServiceRoundsSource = failures.length || !existsSync(WEB_SERVICE_ROUNDS_PATH) ? "" : readFileSync(WEB_SERVICE_ROUNDS_PATH, "utf-8");
  const webServiceFormatApiSource = failures.length || !existsSync(WEB_SERVICE_FORMAT_API_PATH) ? "" : readFileSync(WEB_SERVICE_FORMAT_API_PATH, "utf-8");
  const webServiceSource = `${webServiceMainSource}\n${webServiceHttpSource}\n${webServiceExportSource}\n${webServiceRoundsSource}\n${webServiceFormatApiSource}`;
  if (source) {
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "types", "app.ts"), "utf-8"), "export type BatchRerunFailure = {", "Batch rerun failure type should exist.", failures);
    assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "export function formatBatchRerunSummary(", "Batch rerun summary formatter should exist.", failures);
    checkBackendTaskContract(source, resultCardSource, failures);
    checkTargetedRerunFeedbackContract(source, resultDiffSource, failures);
    checkRerunFailureVisibilityContract(source, resultDiffSource, failures);
    checkRequestErrorPayloadContract(webServiceSource, failures);
    checkExportIssueSampleContract(webServiceSource, failures);
    checkPartialFailureContract(`${source}\n${existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : ""}\n${(existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "") + "\n" + (existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "")}\n${[
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? [
      existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(BATCH_RERUN_ATTACH_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ATTACH_HANDLERS_PATH, "utf-8") : "",
    ].join("\n")}`, "handleRerunRiskyChunks", failures);
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
      "batch rerun model overrides retain the explicit ModelConfig contract",
      "batch rerun status polling updates runtime state",
      "batch rerun cancellation is wired to the UI",
      "batch rerun can be re-attached after refresh",
      "task center includes active batch reruns",
      "persisted batch rerun summaries are visible after restart",
      "backend task result promotes partial failures",
      "single chunk UI reruns use the resumable batch task protocol",
      "manual targeted-rerun feedback remains bound to one batch target",
      "single chunk UI reruns remain cancelable and refresh-reconnectable",
      "synchronous /api/rerun-chunk remains available only as a compatibility service path",
      "frontend polling consumes task metadata instead of provider event payloads",
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
