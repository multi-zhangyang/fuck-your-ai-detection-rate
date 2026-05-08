import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const APP_INDEX_PATH = resolve(ROOT_DIR, "app", "index.html");
const MODEL_CONFIG_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCard.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const PROTECTION_MAP_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapCard.tsx");
const THEME_MODE_MENU_PATH = resolve(ROOT_DIR, "app", "src", "components", "ThemeModeMenu.tsx");
const THEME_MODE_HOOK_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useThemeMode.ts");
const APP_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appService.ts");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const GLOBAL_CSS_PATH = resolve(ROOT_DIR, "app", "src", "styles", "global.css");
const TAILWIND_CONFIG_PATH = resolve(ROOT_DIR, "app", "tailwind.config.ts");
const BUTTON_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "button.tsx");
const BADGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "badge.tsx");
const INPUT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "input.tsx");
const SELECT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "select.tsx");
const TEXTAREA_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "textarea.tsx");
const DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "dialog.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_ui_consistency_regression_report.json");

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

function assertCountEquals(source, pattern, expected, message, failures) {
  const count = source.split(pattern).length - 1;
  if (count !== expected) {
    failures.push(`${message} Found ${count}, expected ${expected}.`);
  }
}

function assertNoLegacyFyClassTokens(source, message, failures) {
  const matches = source.match(/(^|[\s"'`{])fy-[A-Za-z0-9_-]+/gm) ?? [];
  if (matches.length) {
    failures.push(`${message} Found ${matches.length}: ${matches.slice(0, 5).map((item) => item.trim()).join(", ")}.`);
  }
}

function loadSource(filePath, failures) {
  if (!existsSync(filePath)) {
    failures.push(`Missing file: ${filePath}`);
    return "";
  }
  return readFileSync(filePath, "utf-8");
}

function runRegression() {
  const failures = [];
  const appSource = loadSource(APP_PATH, failures);
  const appIndexSource = loadSource(APP_INDEX_PATH, failures);
  const modelConfigCardSource = loadSource(MODEL_CONFIG_CARD_PATH, failures);
  const resultCardSource = loadSource(RESULT_CARD_PATH, failures);
  const historyCardSource = loadSource(HISTORY_CARD_PATH, failures);
  const protectionMapCardSource = loadSource(PROTECTION_MAP_CARD_PATH, failures);
  const themeModeMenuSource = loadSource(THEME_MODE_MENU_PATH, failures);
  const themeModeHookSource = loadSource(THEME_MODE_HOOK_PATH, failures);
  const appServiceSource = loadSource(APP_SERVICE_PATH, failures);
  const webServiceSource = loadSource(WEB_SERVICE_PATH, failures);
  const cssSource = loadSource(GLOBAL_CSS_PATH, failures);
  const tailwindConfigSource = loadSource(TAILWIND_CONFIG_PATH, failures);
  const buttonSource = loadSource(BUTTON_PATH, failures);
  const badgeSource = loadSource(BADGE_PATH, failures);
  const inputSource = loadSource(INPUT_PATH, failures);
  const selectSource = loadSource(SELECT_PATH, failures);
  const textareaSource = loadSource(TEXTAREA_PATH, failures);
  const dialogSource = loadSource(DIALOG_PATH, failures);
  const combinedSource = [appSource, appIndexSource, modelConfigCardSource, resultCardSource, historyCardSource, protectionMapCardSource, themeModeMenuSource, themeModeHookSource, appServiceSource, webServiceSource, cssSource, tailwindConfigSource, buttonSource, badgeSource, inputSource, selectSource, textareaSource, dialogSource].join("\n");

  if (cssSource) {
    assertIncludes(cssSource, "html {\n    @apply h-svh overflow-hidden", "Document root must keep the app viewport-bound.", failures);
    assertIncludes(cssSource, "body {\n    @apply h-svh overflow-hidden bg-background", "Body must use semantic shadcn tokens and prevent whole-page scroll.", failures);
    assertIncludes(cssSource, "#root {\n    @apply h-svh overflow-hidden;", "React root must preserve fixed workbench height.", failures);
    assertIncludes(cssSource, ".shadcn-control-panel", "Shared utilities must be shadcn-scoped.", failures);
    assertIncludes(cssSource, ".shadcn-choice-card", "Choice cards must use shared shadcn utility semantics.", failures);
    assertIncludes(cssSource, "min-h-[4.25rem]", "Home route choice cards must stay compact and avoid blank vertical space.", failures);
    assertNotIncludes(cssSource, "min-h-[7rem]", "Home route choice cards must not return to the oversized blank layout.", failures);
    assertIncludes(cssSource, ".shadcn-config-dialog", "Home setup dialogs must use shared shadcn utility semantics.", failures);
    assertIncludes(cssSource, ".shadcn-scroll-bound [data-radix-scroll-area-viewport] > div", "Radix ScrollArea content must be width-bound inside shadcn overlays.", failures);
    assertIncludes(cssSource, "--success:", "Loading feedback must have a semantic green success token.", failures);
    assertNotIncludes(cssSource, ".fy-", "Old fy-* utility classes must not return after the shadcn migration.", failures);
  }

  if (tailwindConfigSource) {
    assertIncludes(tailwindConfigSource, "success: {", "Tailwind must expose the semantic success token for green loading icons.", failures);
    assertIncludes(tailwindConfigSource, "DEFAULT: \"hsl(var(--success))\"", "Tailwind success color must read from the shadcn CSS variable.", failures);
  }

  if (appSource) {
    assertIncludes(appSource, "SidebarProvider defaultOpen className=\"h-svh min-h-0 overflow-hidden\"", "App shell must use shadcn SidebarProvider with fixed viewport height.", failures);
    assertIncludes(appSource, "<ThemeModeMenu />", "Top header must expose the light/dark/system theme control.", failures);
    assertIncludes(appSource, "SidebarMenuButton", "Sidebar items must use the shadcn Sidebar menu button primitive.", failures);
    assertIncludes(appSource, "isActive={activeView === item.view}", "Sidebar active state must be delegated to the shadcn Sidebar item.", failures);
    assertIncludes(appSource, "<Breadcrumb", "Top status area must use shadcn Breadcrumb composition.", failures);
    assertIncludes(appSource, "data-ui-section=\"current-file-chip\"", "Top status area must keep the current-file chip identifiable.", failures);
    assertIncludes(appSource, "flex h-10 min-w-0 items-center gap-2 overflow-hidden border-t px-4 text-xs", "Top status bar must keep the original single-line arrangement.", failures);
    assertIncludes(appSource, "h-7 min-w-[22rem] max-w-[min(58vw,56rem)] shrink-0 justify-start overflow-x-auto px-2 text-xs", "Current document name must keep a base width and extend into available space.", failures);
    assertIncludes(appSource, "flex min-w-0 shrink-0 items-center gap-2", "Top route, Diff, and feedback controls must follow the current-file chip without a large blank gap.", failures);
    assertNotIncludes(appSource, "ml-auto flex min-w-0 shrink-0 items-center gap-2", "Top status bar must not push route, Diff, and feedback controls into a far-right island.", failures);
    assertNotIncludes(appSource, "max-w-[240px] truncate text-foreground", "Current document name must not be truncated in the top status bar.", failures);
    assertIncludes(appSource, "aria-label=\"打开通知与任务中心\"", "Notification status action must remain accessible.", failures);
    assertIncludes(appSource, "notificationStatusLabel", "Notification status must label operation feedback clearly.", failures);
    assertIncludes(appSource, "操作反馈", "Successful operation notices must be visually distinguishable from passive notifications.", failures);
    assertIncludes(appSource, "aria-live=\"polite\"", "Status feedback must be announced as live feedback.", failures);
    assertIncludes(appSource, "const hasActiveOperationFeedback = Boolean(activeRuntimeTaskCount || (uiBusy && !error));", "Global loading feedback must be collapsed into the top status action.", failures);
    assertNotIncludes(appSource, "data-ui-section=\"operation-feedback-bar\"", "Top status feedback must not be duplicated by a second operation bar.", failures);
    assertNotIncludes(appSource, "<OperationFeedbackBar", "The app shell must not render duplicate global loading surfaces.", failures);
    assertIncludes(appSource, "hasActiveOperationFeedback ? Loader2", "Top status feedback must use a spinner while work is running.", failures);
    assertIncludes(appSource, "const LOADING_ICON_CLASS_NAME = \"animate-spin text-success\";", "App loading spinners must render with the green success token.", failures);
    assertIncludes(appSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Frontend must expose the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(appSource, "const REWRITE_CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16] as const;", "Home concurrency selector must expose stable 1/2/3/4/6/8/12/16 tiers.", failures);
    assertIncludes(appSource, "assertBackendConcurrencyReady(runConfig.rewriteConcurrency)", "Round launch must verify the live backend supports the selected concurrency.", failures);
    assertIncludes(appSource, "runtime.maxRewriteConcurrency", "Round launch guard must read the backend-reported concurrency ceiling.", failures);
    assertIncludes(appSource, "const concurrencyLabel = String(configuredConcurrencyValue);", "Run status must show configured concurrency as the primary value.", failures);
    assertIncludes(appSource, "const concurrencyDetail = actualConcurrency && actualConcurrency !== configuredConcurrencyValue", "Run status must surface effective worker count separately when it differs.", failures);
    assertIncludes(appSource, "onRunRound(modelConfigRef.current);", "Home run button must start with the latest selected concurrency.", failures);
    assertIncludes(appSource, "configuredConcurrency", "Round progress UI must distinguish configured concurrency from effective active workers.", failures);
    assertNotIncludes(appSource, "progress?.concurrency ?? 2", "Round run status must not fall back to a hard-coded concurrency value.", failures);
    assertIncludes(appSource, "className={cn(hasActiveOperationFeedback && LOADING_ICON_CLASS_NAME)}", "Top status spinner must turn green while work is running.", failures);
    assertIncludes(appSource, "openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)", "Top status area must route directly into focused Diff review.", failures);
    assertIncludes(appSource, "function formatDiffDashboardLabel", "Top Diff status must format needs-review and high-risk counts separately.", failures);
    assertIncludes(appSource, "highRiskCount", "Global Diff dashboard stats must track high-risk chunks separately.", failures);
    assertIncludes(appSource, "failedChunkIds.length ? \"failed\" : highRiskChunkIds.length ? \"highRisk\"", "Global Diff focus must prefer high-risk chunks before ordinary review chunks.", failures);
    assertIncludes(appSource, "function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision", "Rerun completion must derive per-chunk default decisions from the latest compare data.", failures);
    assertIncludes(appSource, "[chunkId]: nextDecision", "Single rerun fallback chunks must not be forced back to default rewrite.", failures);
    assertIncludes(appSource, "getDefaultReviewDecisionForChunk(confirmedCompare, target.chunkId)", "Batch rerun fallback chunks must keep safe-source defaults.", failures);
    assertIncludes(appSource, "<ResultCard", "Home must keep output/export summary in the main work area.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "Home must embed the full Diff review surface.", failures);
    assertIncludes(appSource, "<RoundRunStatusCard", "Home must show a compact run status card instead of the Diff surface while a round is running.", failures);
    assertIncludes(appSource, "<Progress value={percent} className=\"h-2\" />", "Round run status card must use shadcn Progress for chunk progress.", failures);
    assertIncludes(appSource, "轮内并发", "Home run controls must expose the bounded rewrite concurrency setting.", failures);
    assertIncludes(appSource, "value.config.rewriteConcurrency ?? 2", "Diagnostics must show the active rewrite concurrency setting.", failures);
    assertIncludes(appSource, "value.config.effectiveRewriteTimeoutSeconds ?? value.config.requestTimeoutSeconds", "Diagnostics must show the effective long-thinking rewrite timeout.", failures);
    assertIncludes(appSource, "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]", "Home operation column must use a bounded responsive track instead of a hard fixed width.", failures);
    assertNotIncludes(appSource, "xl:grid-cols-[minmax(0,1fr)_440px]", "Home operation column must not return to the overflowing fixed 440px track.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-operation-scroll\"", "Home right operation stack must use shadcn ScrollArea scrolling.", failures);
    assertIncludes(appSource, "className=\"shadcn-scroll-bound h-full min-h-0 min-w-0 max-w-full overflow-x-hidden pr-1\"", "Home right ScrollArea must clamp horizontal overflow.", failures);
    assertIncludes(appSource, "<HomeRunPanel", "Run controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "? \"刷新轮次状态\"", "Stale round status must show an actionable refresh button instead of a dead sync state.", failures);
    assertIncludes(appSource, "? `继续第 ${value.nextRound} 轮`", "Selected multi-round workflows must present round 2+ as continuation, not append.", failures);
    assertIncludes(appSource, "onRefreshStatus={() => void handleRefreshCurrentDocumentStatus()}", "Home run panel must be able to refresh stale round status from the primary action.", failures);
    assertNotIncludes(appSource, "所选流程已完成，可追加", "Home run controls must not show verbose selected-workflow helper copy.", failures);
    assertNotIncludes(appSource, "左侧可查看 Diff 和导出", "Loaded result alert must stay compact and not repeat obvious actions.", failures);
    assertIncludes(appSource, "第 {visibleResultRound} 轮已完成", "Loaded result alert should use short completion wording.", failures);
    assertIncludes(appSource, "<DetectionReportPanel", "External report controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "<Dialog open={Boolean(setupEditor)}", "Setup editors must use centered shadcn Dialog.", failures);
    assertIncludes(appSource, "className={cn(\"shadcn-config-dialog", "Setup editors must share the shadcn dialog utility.", failures);
    assertNotIncludes(appSource, "<Sheet open={Boolean(setupEditor)}", "Setup editors must not reopen as right-side Sheets.", failures);
    assertIncludes(appSource, "<Dialog open={Boolean(appendDraft)}", "Append round route picker must use a centered shadcn Dialog.", failures);
    assertIncludes(appSource, "追加第 {appendRoundNumber} 轮", "Append dialog must clearly identify the single appended round.", failures);
    assertIncludes(appSource, "开始追加", "Append dialog must keep one clear confirm action.", failures);
    assertNotIncludes(appSource, "<Sheet open={Boolean(appendDraft)}", "Append round route picker must not open as a right-side Sheet.", failures);
    assertNotIncludes(appSource, "shadcn-config-sheet", "Setup editors must not use the removed config Sheet utility.", failures);
    assertIncludes(appSource, "const editablePromptProfile = getDefaultPromptProfile(promptWorkflows);", "Rewrite workflow action must derive the editable workflow from backend metadata.", failures);
    assertIncludes(appSource, "onPromptProfileChange(editablePromptProfile)", "Rewrite workflow action must switch to the editable workflow before editing.", failures);
    assertNotIncludes(appSource, "ToggleGroupItem value=\"cn_prewrite\"", "Rewrite workflow editor must not expose the legacy three-round preset.", failures);
    assertNotIncludes(appSource, "ToggleGroupItem value=\"cn\"", "Rewrite workflow editor must not expose the legacy two-round preset.", failures);
    assertNotIncludes(appSource, "data-ui-section=\"prompt-workflow-route-defaults\"", "Prompt library page must not duplicate home workflow/model-route settings.", failures);
    assertIncludes(appSource, "<Card className=\"flex h-full min-h-0 flex-col overflow-hidden\">", "Prompt library left panel must use a flex container for internal scrolling.", failures);
    assertIncludes(appSource, "<CardContent className=\"flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5\">", "Prompt library list must allocate remaining height to its ScrollArea.", failures);
    assertIncludes(appSource, "onDeletePrompt={(promptId) => handleDeletePrompt(promptId)}", "Prompt library must expose custom prompt delete in the main CRUD flow.", failures);
    assertNotIncludes(appSource, "保存内容", "Prompt library must not split one save action into content save.", failures);
    assertNotIncludes(appSource, "保存信息", "Prompt library must not split one save action into metadata save.", failures);
    assertNotIncludes(appSource, "restoreSelectedBackup", "Prompt library must keep backup restore out of the main UI.", failures);
    assertIncludes(appSource, "<AlertDialog open", "Risky actions must use the shadcn AlertDialog confirmation flow.", failures);
    assertIncludes(appSource, "function UnifiedConfirmDialog", "Native confirms must stay replaced by the unified app dialog.", failures);
    assertIncludes(appSource, "requestConfirm", "Risky actions must route through the async confirmation flow.", failures);
    assertIncludes(appSource, "<SheetTitle className=\"flex min-w-0 items-center gap-2\">", "Notification center must expose an accessible shadcn SheetTitle.", failures);
    assertIncludes(appSource, "<SheetDescription className=\"sr-only\">查看运行任务和最近通知。</SheetDescription>", "Notification center must expose a non-visual accessible description.", failures);
    assertNotIncludes(appSource, "aria-labelledby=\"notification-center-title\"", "Notification center must not override the Radix-generated title id.", failures);
    assertIncludes(appSource, "data-ui-section=\"runtime-task-center\"", "Notification center must separate active runtime tasks from notification history.", failures);
    assertIncludes(appSource, "taskItems={runtimeTaskItems}", "Runtime task center items must be passed into the notification center.", failures);
    assertIncludes(appSource, "className=\"flex w-[min(96vw,34rem)] min-w-0 max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-0 sm:max-w-none [&>button]:hidden\"", "Notification center sheet must clamp horizontal overflow with enough readable width.", failures);
    assertIncludes(appSource, "whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]", "Notification text must fully wrap long backend/provider messages inside the sheet.", failures);
    assertNotIncludes(appSource, "mt-1 line-clamp-3 min-w-0 break-words text-sm leading-6 text-muted-foreground", "Notification history must not clamp long notices horizontally or vertically.", failures);
    assertIncludes(appSource, "function isRawHtmlErrorText", "Notification history must detect stale raw backend HTML error pages.", failures);
    assertIncludes(appSource, "isRawHtmlErrorText(text)", "Notification history must filter raw HTML errors before rendering persisted history.", failures);
    assertIncludes(appSource, "setError(\"\")", "Stale backend method-mismatch errors must be cleared from hot-reloaded app state.", failures);
    assertIncludes(appSource, "本地后端接口方法不匹配（HTTP 405）", "App error display must translate raw 405 HTML pages into a user-facing local backend hint.", failures);
    assertIncludes(appSource, "function openTaskTargetView", "Task-center navigation must be centralized.", failures);
    assertIncludes(appSource, "function openDiffTaskTarget", "Task center must support direct navigation into focused Diff filters.", failures);
    assertIncludes(appSource, "diffFocusRequest={diffFocusRequest}", "Focused Diff requests must flow into the Diff review card.", failures);
    assertIncludes(appSource, "data-ui-section=\"model-route-compact\"", "Model route Dialog must use a compact shadcn summary bar before per-round controls.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-active-model-route\"", "Home model route card must show the active per-round route, not only the default model.", failures);
    assertIncludes(appSource, "sm:grid-cols-3", "Model route Dialog actions should stay limited to the necessary three operations.", failures);
    assertNotIncludes(appSource, "sm:grid-cols-2 xl:grid-cols-5", "Model route Dialog actions must not use viewport-xl columns inside the bounded overlay.", failures);
    assertIncludes(appSource, "modelConfigRef.current", "Model route edits must save the latest selected provider/model without waiting for a React rerender.", failures);
    assertIncludes(appSource, "modelRouteLines", "Model route summary must list effective providers and models per round.", failures);
    assertIncludes(appSource, "scopeDiagnostics", "Protection view must keep DOCX body-scope diagnostics in app state.", failures);
    assertIncludes(appSource, "service.getDocumentScopeDiagnostics(sourcePath)", "Document refresh must fetch DOCX body-scope diagnostics with the other document state.", failures);
    assertIncludes(appSource, "<ProtectionMapCard value={protectionMap} diagnostics={scopeDiagnostics} />", "Protection view must pass body-scope diagnostics into the protection map.", failures);
    assertIncludes(appSource, "if (!storedSourcePath)", "App restore must not auto-open an arbitrary first history item when the user has no active document.", failures);
    assertIncludes(appSource, "function isDiscardableRestoreError", "Invalid legacy active-document records must be skipped without leaving a startup error.", failures);
    assertNotIncludes(appSource, "const fallbackItem = historyItems[0]", "Startup restore must not fall back to the first history record.", failures);
    assertNotIncludes(appSource, "默认 {modelConfig.model || \"未选\"} · {activeFlowSequence.length} 轮", "Home model route summary must not keep showing the default model after custom per-round routes are selected.", failures);
    assertNotIncludes(appSource, "rotateModelRoute", "Model route Sheet must not keep the removed provider-rotation shortcut.", failures);
    assertNotIncludes(appSource, "轮换服务商", "Model route Sheet must not show the removed provider-rotation shortcut.", failures);
    assertNotIncludes(appSource, "读默认", "Model route Sheet must not duplicate default-model refresh from the full model configuration page.", failures);
    assertNotIncludes(appSource, "onRefreshDefaultModels", "Home route panel must not keep dead default-model refresh props.", failures);
    assertNotIncludes(appSource, "RouteOverviewCard", "Model route Sheet must not reintroduce verbose overview cards.", failures);
    assertIncludes(appSource, "provider.enabled !== false", "Provider selection must treat legacy providers without an enabled flag as enabled.", failures);
    assertIncludes(appSource, "beginTask(\"loading-models\"", "Model catalog refresh must enter the shared task state flow.", failures);
    assertNotIncludes(appSource, "window.confirm", "App must not use native browser confirmation popups.", failures);
    assertNotIncludes(appSource, "window.alert", "App must not use native browser alert popups.", failures);
    assertNoLegacyFyClassTokens(appSource, "App must not reintroduce old fy-* UI classes.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "const LOADING_ICON_CLASS_NAME = \"animate-spin text-success\";", "Model and format loading spinners must render with the green success token.", failures);
    assertIncludes(modelConfigCardSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Model config must expose the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(modelConfigCardSource, "max={MAX_REWRITE_CONCURRENCY}", "Model config concurrency input must use the shared 16-way ceiling.", failures);
  }

  if (inputSource && selectSource && textareaSource) {
    const fieldControlSource = [inputSource, selectSource, textareaSource].join("\n");
    assertIncludes(fieldControlSource, "focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.22)]", "Form controls must use a subtle inset shadcn focus treatment that cannot be clipped by right-panel bounds.", failures);
    assertIncludes(fieldControlSource, "focus-visible:border-ring/45", "Form controls must keep focus visible without heavy black borders.", failures);
    assertIncludes(selectSource, "[&>span]:truncate", "Select trigger text must stay truncated without widening route cards.", failures);
    assertNotIncludes(fieldControlSource, "focus-visible:ring-offset-2", "Form controls must not use external ring offsets that look clipped inside bounded panels.", failures);
    assertNotIncludes(selectSource, "focus:ring-2", "Select trigger must not use an always-on external focus ring.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "export function DiffReviewCard", "ResultCard module must export the full-height Diff review surface.", failures);
    assertIncludes(resultCardSource, "flex shrink-0 flex-wrap items-center gap-2", "Output export actions should stay compact and avoid dead spacing.", failures);
    assertNotIncludes(resultCardSource, "T.adoptAllRejected", "Output export actions must not expose removed candidate adoption.", failures);
    assertNotIncludes(appSource, "collectAdoptableRejectedCandidates", "Home must not compute removed candidate adoption state.", failures);
    assertIncludes(appSource, "buildDiffDashboardStats(activeCompareData, activeRerunFailures, detectionMatchesByChunk, reviewDecisions)", "Home Diff dashboard counts must follow review decisions.", failures);
    assertIncludes(appSource, "!failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved", "Home Diff dashboard must not double-count failed or high-risk chunks as ordinary needs-review.", failures);
    assertIncludes(appSource, "function normalizeReviewDecisionsForSave", "Review decisions must preserve explicit confirmation state when saved.", failures);
    assertIncludes(appSource, "return [chunkId, \"rewrite\" as ReviewDecision];", "Saved legacy default rewrites must reload as unresolved defaults.", failures);
    assertIncludes(appSource, "isFailedOutputDecision(decision) && decision.confirmed !== true", "Failed-output decisions must not hide unresolved high-risk chunks.", failures);
    assertIncludes(appSource, "return [[chunkId, \"rewrite_confirmed\" as ReviewDecision] as const];", "Explicit rewrite confirmations must be persisted distinctly from default rewrites.", failures);
    assertIncludes(appSource, "if (decision === \"source_confirmed\")", "Only explicit source confirmations should be persisted.", failures);
    assertNotIncludes(appSource, "if (decision === \"source\" || decision === \"source_confirmed\")", "Default safe-source choices must not be saved as confirmed.", failures);
    assertIncludes(appSource, "function normalizeSavedReviewDecisionsForCompare", "Saved review decisions must be scoped to the loaded compare data.", failures);
    assertIncludes(appSource, "const validChunkIds = new Set(data.chunks.map((chunk) => chunk.chunkId));", "Saved review decisions must drop stale chunks without reopening handled high-risk outputs.", failures);
    assertNotIncludes(appSource, "highRiskChunkIds.has(chunkId) && decision === \"source_confirmed\" ? \"source\"", "Confirmed source choices must not re-open handled high-risk failed outputs.", failures);
    assertNotIncludes(appSource, "[chunkId]: \"rewrite\" }));", "Single rerun must not force high-risk fallback chunks to default rewrite.", failures);
    assertNotIncludes(appSource, "completedTargets.map((target) => [target.chunkId, \"rewrite\" as ReviewDecision])", "Batch rerun must not force high-risk fallback chunks to default rewrite.", failures);
    assertNotIncludes(appSource, "buildRejectedCandidateReviewDecision", "Candidate adoption decision builders must stay removed from the frontend.", failures);
    assertNotIncludes(appSource, "if (decision === \"rewrite\") return [chunkId, \"rewrite_confirmed\" as ReviewDecision];", "Default rewrite choices must not be promoted to confirmed on reload.", failures);
    assertNotIncludes(appSource, "function handleAdoptAllRejectedCandidates", "Home must not wire removed all-candidate adoption actions.", failures);
    assertNotIncludes(resultCardSource, "onExportReviewed", "Reviewed export props must be removed from the output card.", failures);
    assertNotIncludes(resultCardSource, "审阅 Word", "Reviewed Word export button must not return.", failures);
    assertNotIncludes(resultCardSource, "审阅 TXT", "Reviewed TXT export button must not return.", failures);
    assertCountEquals(resultCardSource, "<RewriteDiffPanel", 1, "Full Diff panel must only be mounted by DiffReviewCard.", failures);
    assertIncludes(resultCardSource, "Card className=\"flex h-full min-h-0", "Diff review card must use a fixed-height shadcn Card shell.", failures);
    assertIncludes(resultCardSource, "sticky top-0 z-20", "Inline Diff toolbar must stay pinned while chunks scroll.", failures);
    assertIncludes(resultCardSource, "ToggleGroup", "Diff filters must use shadcn ToggleGroup.", failures);
    assertIncludes(resultCardSource, "type DiffFilterMode = \"all\" | \"review\" | \"highRisk\" | \"failed\";", "Diff filters must keep high-risk as a compact first-class mode.", failures);
    assertNotIncludes(resultCardSource, "\"candidate\"", "Diff filters must not reintroduce the removed candidate mode.", failures);
    assertIncludes(resultCardSource, "Empty className=\"min-h-0 flex-1 border bg-background/70\"", "Diff empty state must use shadcn Empty.", failures);
    assertIncludes(resultCardSource, "overflow-auto whitespace-pre-wrap break-words", "Diff text panes must constrain and wrap long paragraph content.", failures);
    assertNotIncludes(resultCardSource, "function getRejectedCandidateReasons", "Rejected candidate UI helpers must stay removed.", failures);
    assertNotIncludes(resultCardSource, "function buildRejectedCandidatesRerunFeedback", "Rejected candidate rerun helpers must stay removed from the UI layer.", failures);
    assertNotIncludes(resultCardSource, "function getLatestRejectedCandidate", "Rejected candidate previews must stay removed.", failures);
    assertNotIncludes(resultCardSource, "function buildRejectedCandidateDecision", "Rejected candidate adoption helpers must stay removed.", failures);
    assertNotIncludes(resultCardSource, "T.adoptRejected", "Rejected candidate one-click adoption must stay removed.", failures);
    assertNotIncludes(resultCardSource, "T.highRiskCandidate", "Rejected candidate high-risk UI must stay removed.", failures);
    assertNotIncludes(resultCardSource, "candidateAdoptableCount", "Bulk candidate adoption state must stay removed.", failures);
    assertIncludes(resultCardSource, "isHighRiskFailedOutputChunk", "Failed hard-validation outputs must keep a separate high-risk Diff state.", failures);
    assertIncludes(resultCardSource, "flags.includes(\"targeted_rerun_fallback\")", "Targeted rerun hard-validation fallbacks must also surface as high-risk failed outputs.", failures);
    assertIncludes(appSource, "flags.includes(\"targeted_rerun_fallback\")", "Home Diff counters must include targeted rerun hard-validation fallbacks as high risk.", failures);
    assertIncludes(resultCardSource, "!highRiskChunkIdSet.has(chunk.chunkId)", "Ordinary needs-review counts must not double-count high-risk failed outputs.", failures);
    assertIncludes(resultCardSource, "高风险 {highRiskChunkIds.length}", "Diff panel must expose a high-risk filter for failed model outputs.", failures);
    assertIncludes(resultCardSource, "source: \"failed_output\"", "Adopting a failed hard-validation output must save it as a confirmed failed-output decision.", failures);
    assertIncludes(resultCardSource, "确认采用后才会导出此改写", "High-risk failed outputs must warn that export changes only after confirmation.", failures);
    assertIncludes(resultCardSource, "function getChunkReviewReasons", "Needs-review chunks must render concise visible reasons.", failures);
    assertIncludes(resultCardSource, "forceNeedsReview={needsReview}", "Diff-level review state must drive the visible quality badge.", failures);
    assertNotIncludes(resultCardSource, "<AlertTitle>报错</AlertTitle>", "Ordinary user UI must not expose raw fallback errors.", failures);
    assertNotIncludes(resultCardSource, "compactFeedbackText(chunk.fallbackError", "Fallback error detail must stay out of the review UI.", failures);
    assertNotIncludes(resultCardSource, "读取本块原因与当前轮配置", "Targeted rerun UI must avoid verbose helper copy.", failures);
    assertNotIncludes(resultCardSource, "右侧仅预览，默认不导出。", "Rejected candidate UI must avoid generic preview helper copy.", failures);
    assertNotIncludes(resultCardSource, "模型连续输出未通过硬校验，本块没有采用不合格改写。", "Fallback UI must avoid duplicate hard-check boilerplate.", failures);
    assertNotIncludes(resultCardSource, "重跑指令", "Manual rerun panel must not render redundant headings.", failures);
    assertNotIncludes(resultCardSource, "候选不展示、不导出", "Rejected candidate UI must not show generic filler copy.", failures);
    assertNotIncludes(resultCardSource, "重跑本块", "Rejected candidate action label must stay concise.", failures);
    assertNotIncludes(resultCardSource, "function CandidateInspectionPanel", "Rejected candidate inspection panel must stay removed.", failures);
    assertNotIncludes(resultCardSource, "function CandidateDiffPanel", "Rejected candidate diff panel must stay removed.", failures);
    assertNotIncludes(resultCardSource, "<Accordion type=\"single\" collapsible>", "Rejected candidate details must not return as expandable blocks.", failures);
    assertNotIncludes(resultCardSource, "生成重跑意见", "Rejected candidate cards must not return to a vague feedback-generation button.", failures);
    assertNotIncludes(resultCardSource, "候选输出需要人工判断", "Rejected candidate helper copy must stay concise.", failures);
    assertNotIncludes(resultCardSource, "isDecisionForRejectedCandidate", "Rejected candidates must not expose manual adoption matching in the UI layer.", failures);
    assertNotIncludes(resultCardSource, "确认采用候选", "Rejected candidates must not expose manual adoption copy.", failures);
    assertIncludes(resultCardSource, "getDecisionDisplayOutput", "Main rewrite pane must render the selected review decision.", failures);
    assertIncludes(resultCardSource, "handledDiffFocusNonceRef", "Focused Diff navigation must consume each request once.", failures);
    assertIncludes(resultCardSource, "scrollIntoView({ behavior: \"smooth\", block: \"start\" })", "Focused Diff navigation must scroll to the target chunk.", failures);
    assertNotIncludes(resultCardSource, "function DiffWorkbenchEntryCard", "Home must not keep a redundant open-Diff card.", failures);
  }

  if (historyCardSource) {
    assertNotIncludes(historyCardSource, "data-ui-section=\"history-governance-boundary\"", "History page must not reintroduce verbose governance boundary copy.", failures);
    assertIncludes(historyCardSource, "data-ui-section=\"history-user-summary\"", "History page must lead with user workflow outcomes.", failures);
    assertIncludes(historyCardSource, "data-ui-section=\"history-advanced-maintenance\"", "History maintenance controls must stay grouped behind an advanced section.", failures);
    assertIncludes(historyCardSource, "Card className=\"min-h-full overflow-visible\"", "History page must use shadcn Card composition.", failures);
    assertIncludes(historyCardSource, "StatPill", "History cleanup impact must stay summarized with compact stats.", failures);
    assertNotIncludes(historyCardSource, "ImpactCard", "History page must not keep removed impact-card boilerplate.", failures);
    assertNotIncludes(historyCardSource, "<Card key={card.title}", "History governance boundary must not nest cards inside the page card.", failures);
  }

  if (themeModeMenuSource && themeModeHookSource && appIndexSource && cssSource) {
    assertIncludes(themeModeMenuSource, "DropdownMenuRadioGroup", "Theme control must use shadcn DropdownMenu radio composition.", failures);
    assertIncludes(themeModeMenuSource, "value=\"system\"", "Theme control must expose system mode.", failures);
    assertIncludes(themeModeMenuSource, "data-icon=\"inline-start\"", "Theme trigger icon must use the shadcn Button icon contract.", failures);
    assertIncludes(themeModeHookSource, "fyadr.themeMode", "Theme mode must persist in localStorage under a stable app key.", failures);
    assertIncludes(themeModeHookSource, "fyadr.themeMode.defaultDarkMigrated", "Theme mode must migrate the previous system-default preference once.", failures);
    assertIncludes(themeModeHookSource, "value === \"system\" && !migrated", "Legacy stored system theme must be treated as the old default and moved to dark.", failures);
    assertIncludes(themeModeHookSource, "const DEFAULT_THEME_MODE: ThemeMode = \"dark\"", "Theme mode must default to dark when no user preference exists.", failures);
    assertIncludes(themeModeHookSource, "prefers-color-scheme: dark", "System theme mode must listen to the OS color scheme.", failures);
    assertIncludes(themeModeHookSource, "classList.toggle(\"dark\"", "Theme mode must toggle Tailwind's dark class.", failures);
    assertIncludes(appIndexSource, "fyadr.themeMode", "Initial HTML must apply the saved/system theme before React mounts.", failures);
    assertIncludes(appIndexSource, "fyadr.themeMode.defaultDarkMigrated", "Initial HTML must migrate legacy system-default theme before React mounts.", failures);
    assertIncludes(appIndexSource, "const defaultMode = \"dark\"", "Initial HTML must default to dark before React mounts.", failures);
    assertIncludes(appIndexSource, "document.documentElement.classList.add(\"dark\")", "Initial HTML fallback must keep the app dark if theme storage throws.", failures);
    assertIncludes(cssSource, ".dark {", "Global CSS must define dark-mode semantic tokens.", failures);
    assertIncludes(cssSource, "--sidebar-background:", "Dark-mode variables must include sidebar tokens.", failures);
  }

  if (protectionMapCardSource) {
    assertIncludes(protectionMapCardSource, "data-ui-section=\"docx-scope-diagnostics\"", "Protection map must expose the body-scope diagnostics section for regression checks.", failures);
    assertIncludes(protectionMapCardSource, "<Sheet open={open}", "Full body-scope diagnostics must use a shadcn Sheet.", failures);
    assertIncludes(protectionMapCardSource, "<SheetTitle>正文边界完整诊断</SheetTitle>", "Body-scope diagnostics Sheet must have an accessible shadcn SheetTitle.", failures);
    assertIncludes(protectionMapCardSource, "BoundaryStrip", "Protection map must keep the visual body-scope boundary strip.", failures);
    assertIncludes(protectionMapCardSource, "ReasonGrid", "Protection map must keep compact protection reason distribution.", failures);
    assertNotIncludes(protectionMapCardSource, "普通段落和自动编号正文会参与改写。", "Protection map must not reintroduce verbose numbered-paragraph helper copy.", failures);
    assertNotIncludes(protectionMapCardSource, "只把摘要到致谢之间的正文交给模型处理", "Protection map must not reintroduce verbose rewrite-scope helper copy.", failures);
    assertNotIncludes(protectionMapCardSource, "<Card key={`${section.key}", "Protection map list rows must not nest shadcn Cards inside another Card.", failures);
    assertNotIncludes(protectionMapCardSource, "line-clamp-", "Protection map diagnostics should avoid optional Tailwind line-clamp dependencies.", failures);
  }

  if (appServiceSource && webServiceSource) {
    assertIncludes(appServiceSource, "getBackendRuntime(): Promise<BackendRuntimeInfo>;", "App service contract must expose fast backend runtime capability checks.", failures);
    assertIncludes(webServiceSource, "async getBackendRuntime(): Promise<BackendRuntimeInfo>", "Web service must implement fast backend runtime capability checks.", failures);
    assertIncludes(webServiceSource, "requestJson<BackendRuntimeInfo>(\"/api/ping\", { timeoutMs: 3_000 })", "Backend runtime check must use the fast ping endpoint instead of slow diagnostics.", failures);
    assertIncludes(appServiceSource, "getDocumentScopeDiagnostics(sourcePath: string): Promise<DocumentScopeDiagnostics>;", "App service contract must expose document-scope diagnostics.", failures);
    assertIncludes(webServiceSource, "/api/document-scope-diagnostics", "Web service must call the document-scope diagnostics API.", failures);
    assertIncludes(webServiceSource, "function formatHttpErrorMessage", "Web service must centralize HTTP error display text.", failures);
    assertIncludes(webServiceSource, "function isHtmlErrorPage", "Web service must detect HTML error pages returned by Flask or proxies.", failures);
    assertIncludes(webServiceSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Web service config merge must keep the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(webServiceSource, "buildUnavailableScopeDiagnostics", "Missing document-scope diagnostics endpoints must degrade without breaking document restore.", failures);
    assertIncludes(webServiceSource, "buildEmptyHistoryArtifactQueryResponse", "Missing history artifact endpoints must degrade without showing startup errors.", failures);
    assertIncludes(webServiceSource, "isEndpointCompatibilityError", "Web service must recognize old-backend 404/405 compatibility gaps.", failures);
    assertIncludes(webServiceSource, "HTTP 405", "Web service must provide a specific friendly message for method-mismatch responses.", failures);
    assertNotIncludes(webServiceSource, "errorPayload?.message || responseText ||", "Web service must not surface raw non-JSON responseText to users.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "Tabs defaultValue=\"default\"", "Model config must use shadcn Tabs for major panes.", failures);
    assertIncludes(modelConfigCardSource, "<Tabs defaultValue=\"default\" className=\"flex h-full min-h-0 flex-col\">", "Model config tabs must wrap the full card so tab controls can live in the header.", failures);
    assertIncludes(modelConfigCardSource, "<CardHeader className=\"shrink-0 border-b px-5 py-3\">", "Model config header must stay compact after moving tab controls into the title row.", failures);
    assertIncludes(modelConfigCardSource, "TabsList className=\"grid h-9 w-full shrink-0 grid-cols-2 lg:w-[360px]\"", "Model config tabs must be compact and aligned with the card title.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"default\"", "Model config must expose default connection as the first pane.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"providers\"", "Model config must expose provider repository as the second pane.", failures);
    assertIncludes(modelConfigCardSource, "ScrollArea className=\"min-h-0 flex-1\"", "Model config panes must delegate scrolling to inner panes.", failures);
    assertNotIncludes(modelConfigCardSource, "onCheckedChange={(offlineMode)", "Model config UI must not expose the removed offline-mode switch.", failures);
    assertIncludes(modelConfigCardSource, "refreshAllProviderCatalogs", "Model provider repository must support batch model catalog refresh.", failures);
    assertIncludes(modelConfigCardSource, "获取全部", "Model provider repository must expose batch model catalog refresh in the UI.", failures);
    assertIncludes(modelConfigCardSource, "providerCatalogAbortRef", "Provider model catalog loading must be cancellable.", failures);
    assertIncludes(modelConfigCardSource, "onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal)", "Provider catalog refresh must pass an AbortSignal to the service layer.", failures);
  }

  assertNoLegacyFyClassTokens(combinedSource, "Component sources must not reintroduce old fy-* UI class tokens.", failures);
  assertNotIncludes(combinedSource, "exportReviewedRound", "Reviewed export service API must stay removed.", failures);

  if (buttonSource) {
    [
      "neutral:",
      "brand:",
      "success:",
      "warning:",
      "outlineBrand:",
      "outlineSuccess:",
      "outlineWarning:",
      "outlineDanger:",
    ].forEach((variantName) => {
      assertIncludes(buttonSource, variantName, `Button component must expose semantic variant ${variantName}.`, failures);
    });
  }

  if (badgeSource) {
    [
      "neutral:",
      "brand:",
      "info:",
      "danger:",
    ].forEach((variantName) => {
      assertIncludes(badgeSource, variantName, `Badge component must expose semantic variant ${variantName}.`, failures);
    });
  }

  [
    "bg-white/92",
    "bg-white/94",
    "space-y-",
    "rounded-3xl",
    "rounded-2xl",
  ].forEach((pattern) => {
    assertNotIncludes(combinedSource, pattern, `Avoid stale or non-shadcn class pattern: ${pattern}`, failures);
  });

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    appIndexPath: APP_INDEX_PATH,
    modelConfigCardPath: MODEL_CONFIG_CARD_PATH,
    resultCardPath: RESULT_CARD_PATH,
    historyCardPath: HISTORY_CARD_PATH,
    protectionMapCardPath: PROTECTION_MAP_CARD_PATH,
    themeModeMenuPath: THEME_MODE_MENU_PATH,
    themeModeHookPath: THEME_MODE_HOOK_PATH,
    cssPath: GLOBAL_CSS_PATH,
    buttonPath: BUTTON_PATH,
    badgePath: BADGE_PATH,
    dialogPath: DIALOG_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "shadcn shell and primitives are used",
      "home embeds output and Diff review together",
      "dialogs, drawers, and confirmations use shadcn overlays",
      "model/history/result surfaces use shadcn composition",
      "old fy utilities and stale layout classes are absent",
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
