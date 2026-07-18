import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptPreviewDraftActionFactory.ts");
const SETUP_EDITOR_DIALOG_BODY_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialogBodyProps.ts");
const MODEL_CONFIG_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCardProps.ts");
const USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAutoSnapshotRestoreRefs.ts");
const DOCUMENT_RESTORE_EFFECT_RUNNER_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreEffectRunner.ts");
const USE_PROMPT_PREVIEW_FORM_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "usePromptPreviewFormState.ts");
const APPEND_ROUND_CONTROL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appendRoundControlHelpers.ts");
const USE_RUN_SESSION_BATCH_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionBatchControls.ts");
const USE_RUN_SESSION_RUN_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionRunControls.ts");
const WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModelConfigSecrets.ts");
const AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunFailureRefreshHandlers.ts");
const AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunScheduleCoreHandlers.ts");
const EXPORT_EXECUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportExecuteHandlers.ts");
const EXPORT_RESOLVE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportResolveHandlers.ts");
const HISTORY_CARD_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBody.tsx");
const USE_DOCUMENT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDocumentRestoreRefs.ts");
const REWRITE_DIFF_TEXT_PANE_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffTextPane.tsx");
const HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentDeleteActionHelpers.ts");
const APPEND_ROUND_DIALOG_FIELDS_PATH = resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialogFields.tsx");
const ROUND_RUN_STATUS_STATS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RoundRunStatusStats.tsx");
const ROUND_RUN_STATUS_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundRunStatusViewModel.ts");
const HOME_RUN_APPEND_DRAFT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendDraftHelpers.ts");
const HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendRouteOptionHelpers.ts");
const USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useModelConfigProviderCatalog.ts");
const SETUP_EDITOR_DIALOG_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialogBody.tsx");
const SCHOOL_FORMAT_PARSER_TEXT_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SchoolFormatParserTextActions.tsx");
const SCHOOL_FORMAT_PARSER_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SchoolFormatParserControls.tsx");
const DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionFailureHelpers.ts");
const DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionSuccessHelpers.ts");
const HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryActionDeriveHelpers.ts");
const HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryButtonHelpers.ts");
const DIFF_REVIEW_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiffReviewCard.tsx");
const RESULT_CARD_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardCopy.ts");
const AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreEffectHelpers.ts");
const DOCUMENT_RESTORE_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreEffectHelpers.ts");
const HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunAppendRoundDialogShell.tsx");
const HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunSetupEditorDialogShell.tsx");
const ACTIVE_RUN_PROBE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "activeRunProbeHelpers.ts");
const DOCUMENT_STATUS_RESET_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusResetNoticeHelpers.ts");
const DOCUMENT_STATUS_RESET_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusResetPlanHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreRouteHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestorePlanHelpers.ts");
const MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteDefaultIssueHelpers.ts");
const MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteRoundProviderHelpers.ts");
const PROTECTION_MAP_EMPTY_STATE_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapEmptyState.tsx");
const SIDEBAR_RUNTIME_PROGRESS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SidebarRuntimeProgress.tsx");
const MODEL_DEFAULT_CONNECTION_FORM_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelDefaultConnectionForm.tsx");
const HOME_RUN_CONTROL_ACTION_BUTTONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlActionButtons.tsx");
const HOME_RUN_CONTROL_STATUS_BLOCK_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlStatusBlock.tsx");
const SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteSection.tsx");
const SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteRoundCard.tsx");
const SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteSummary.tsx");
const HOME_RUN_APPEND_ISSUE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendIssueHelpers.ts");
const MODEL_ROUTE_PROVIDER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteProviderHelpers.ts");
const MODEL_ROUTE_SEQUENCE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteSequenceHelpers.ts");
const APPEND_ROUND_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialog.tsx");
const SETUP_EDITOR_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialog.tsx");
const HOME_RUN_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanel.tsx");
const HOME_RUN_PANEL_DIALOGS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanelDialogs.tsx");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const GLOBAL_CSS_PATH = resolve(ROOT_DIR, "app", "src", "styles", "global.css");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_home_layout_regression_report.json");

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

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }

  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const homePanelSource = failures.length ? "" : [
    existsSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH, "utf-8") : "",
    existsSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
    existsSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH, "utf-8") : "",
    existsSync(MODEL_ROUTE_PROVIDER_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_PROVIDER_HELPERS_PATH, "utf-8") : "",
    existsSync(MODEL_ROUTE_SEQUENCE_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_SEQUENCE_HELPERS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_PANEL_PATH) ? readFileSync(HOME_RUN_PANEL_PATH, "utf-8") : "",
    existsSync(HOME_RUN_PANEL_DIALOGS_PATH) ? readFileSync(HOME_RUN_PANEL_DIALOGS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH, "utf-8") : "",
    existsSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_DIALOG_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
    existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
    existsSync(APPEND_ROUND_DIALOG_PATH) ? readFileSync(APPEND_ROUND_DIALOG_PATH, "utf-8") : "",
    existsSync(APPEND_ROUND_DIALOG_FIELDS_PATH) ? readFileSync(APPEND_ROUND_DIALOG_FIELDS_PATH, "utf-8") : "",
  ].join("\n");
  const homeSource = `${appSource}\n${homePanelSource}`;
  const cssSource = existsSync(GLOBAL_CSS_PATH) ? readFileSync(GLOBAL_CSS_PATH, "utf-8") : "";
  if (appSource) {
    assertIncludes(appSource, "SidebarProvider defaultOpen className=\"h-svh min-h-0 overflow-hidden\"", "Workbench shell must stay viewport-bound through shadcn SidebarProvider.", failures);
    assertIncludes(appSource, "<SidebarInset id=\"fyadr-main-content\" tabIndex={-1} className=\"h-svh overflow-hidden outline-none md:h-[calc(100svh-1rem)]\">", "Main workbench inset must keep its height, overflow boundary, and skip-link target.", failures);
    assertIncludes(appSource, "<header className=\"shrink-0 border-b border-border/80 bg-background/80 backdrop-blur-md\">", "Global top status area must stay visible above every view.", failures);
    assertIncludes(appSource, "openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)", "Top status area must jump directly into focused inline Diff review.", failures);
    assertIncludes(appSource, "activeView === \"home\"", "Home route must remain the first-class workbench view.", failures);
    assertIncludes(appSource, "grid min-h-full min-w-0 max-w-full gap-4 overflow-visible min-[1180px]:h-full", "Home layout must scroll naturally below 1180px and become viewport-bound on wide screens.", failures);
    assertIncludes(appSource, "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]", "Wide home layout must keep a readable bounded operation column.", failures);
    assertNotIncludes(appSource, "xl:grid-cols-[minmax(0,1fr)_440px]", "Home layout must not return to the fixed-width right column that caused overflow.", failures);
    assertIncludes(appSource, "order-2 flex min-h-[36rem] min-w-0 flex-col gap-4 overflow-visible", "Primary work area must follow the mobile operation controls and retain useful canvas height.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-operation-scroll\"", "Right operation stack must use a shadcn ScrollArea marker.", failures);
    assertIncludes(appSource, "<ScrollArea\n                    className=\"shadcn-home-operation-scroll shadcn-scroll-bound order-1 h-auto", "Operation controls must be first and page-scrollable on narrow screens while retaining the shadcn ScrollArea.", failures);
    assertIncludes(appSource, "flex min-h-0 w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden pb-2", "Right operation stack content must keep compact shadcn gap spacing and width bounds.", failures);
    assertIncludes(homeSource, "shadcn-control-panel w-full min-w-0 max-w-full", "Right operation card must not grow beyond the fixed operation column.", failures);
    assertIncludes(appSource, "<ResultCard", "Home result/report summary must sit in the primary left work area.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "Home page must embed the full Diff workbench in the primary work area.", failures);
    assertIncludes(appSource, "<HomeRunPanel", "Home run controls must stay in the right operation stack.", failures);
    assertNotIncludes(appSource, "<DetectionReportPanel", "External detection report controls must stay removed.", failures);
    assertIncludes(homeSource, "<Dialog open={open}", "Home setup editors must open as centered shadcn Dialogs.", failures);
    assertNotIncludes(homeSource, "<Sheet open={Boolean(setupEditor)}", "Home setup editors must not reopen as right-side Sheets.", failures);
    assertNotIncludes(appSource, "onOpenDiffWorkbench", "Home must not keep a redundant open-Diff entry now that Diff is embedded.", failures);
    assertNotIncludes(appSource, "HOME_TOOLS_COLLAPSED_KEY", "Home page must not persist a separate right-side panel state.", failures);
    assertNotIncludes(appSource, "homeToolsCollapsed", "Home page must not keep the old right-side tool panel model.", failures);
    assertNotIncludes(appSource, "<PanelRightOpen", "Home page must not use right-panel open affordances after shadcn layout migration.", failures);
    assertNotIncludes(appSource, "<PanelRightClose", "Home page must not use right-panel close affordances after shadcn layout migration.", failures);
    assertNotIncludes(appSource, "fy-home-", "Home page must not reintroduce the old fy-* layout classes.", failures);
    assertNotIncludes(appSource, "fy-global-", "Global status must not reintroduce the old fy-* layout classes.", failures);
  }
  if (cssSource) {
    assertIncludes(cssSource, "html {\n    @apply h-svh overflow-hidden", "Document root must prevent whole-page scrolling.", failures);
    assertIncludes(cssSource, "body {\n    @apply h-svh overflow-hidden bg-background", "Body must stay viewport-bound and use semantic shadcn background tokens.", failures);
    assertIncludes(cssSource, "#root {\n    @apply h-svh overflow-hidden;", "React root must keep the workbench height constrained.", failures);
    assertIncludes(cssSource, ".shadcn-control-panel", "Shared custom utilities must be shadcn-scoped, not legacy fy-scoped.", failures);
    assertIncludes(cssSource, ".shadcn-choice-card", "Option cards must use the shadcn utility namespace.", failures);
    assertIncludes(cssSource, ".shadcn-config-dialog", "Configuration overlays must use the shadcn utility namespace.", failures);
    assertNotIncludes(cssSource, ".fy-home-", "CSS must not reintroduce old fy-home layout utilities.", failures);
    assertNotIncludes(cssSource, ".fy-global-", "CSS must not reintroduce old fy-global status utilities.", failures);
    assertNotIncludes(cssSource, "grid-template-rows: auto minmax(0, 1fr);", "Home side stack must not force the detection report to stretch into a blank card.", failures);
    assertNotIncludes(cssSource, "2xl:grid-cols-2", "Home side stack must not split status/report horizontally and leave a large blank column.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    cssPath: GLOBAL_CSS_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "home uses shadcn viewport shell",
      "top status row links into inline Diff",
      "home result and Diff stay in the left work area",
      "run controls stay in the right operation stack",
      "old right-side panel state is removed",
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
