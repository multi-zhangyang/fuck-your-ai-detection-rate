import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const MODEL_CONFIG_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCard.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const APP_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appService.ts");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const GLOBAL_CSS_PATH = resolve(ROOT_DIR, "app", "src", "styles", "global.css");
const BUTTON_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "button.tsx");
const BADGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "badge.tsx");
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
  const modelConfigCardSource = loadSource(MODEL_CONFIG_CARD_PATH, failures);
  const resultCardSource = loadSource(RESULT_CARD_PATH, failures);
  const historyCardSource = loadSource(HISTORY_CARD_PATH, failures);
  const appServiceSource = loadSource(APP_SERVICE_PATH, failures);
  const webServiceSource = loadSource(WEB_SERVICE_PATH, failures);
  const cssSource = loadSource(GLOBAL_CSS_PATH, failures);
  const buttonSource = loadSource(BUTTON_PATH, failures);
  const badgeSource = loadSource(BADGE_PATH, failures);
  const combinedSource = [appSource, modelConfigCardSource, resultCardSource, historyCardSource, appServiceSource, webServiceSource, cssSource, buttonSource, badgeSource].join("\n");

  if (cssSource) {
    assertIncludes(cssSource, "html {\n    @apply h-svh overflow-hidden", "Document root must keep the app viewport-bound.", failures);
    assertIncludes(cssSource, "body {\n    @apply h-svh overflow-hidden bg-background", "Body must use semantic shadcn tokens and prevent whole-page scroll.", failures);
    assertIncludes(cssSource, "#root {\n    @apply h-svh overflow-hidden;", "React root must preserve fixed workbench height.", failures);
    assertIncludes(cssSource, ".shadcn-control-panel", "Shared utilities must be shadcn-scoped.", failures);
    assertIncludes(cssSource, ".shadcn-choice-card", "Choice cards must use shared shadcn utility semantics.", failures);
    assertIncludes(cssSource, ".shadcn-config-sheet", "Configuration sheets must use shared shadcn utility semantics.", failures);
    assertNotIncludes(cssSource, ".fy-", "Old fy-* utility classes must not return after the shadcn migration.", failures);
  }

  if (appSource) {
    assertIncludes(appSource, "SidebarProvider defaultOpen className=\"h-svh min-h-0 overflow-hidden\"", "App shell must use shadcn SidebarProvider with fixed viewport height.", failures);
    assertIncludes(appSource, "SidebarMenuButton", "Sidebar items must use the shadcn Sidebar menu button primitive.", failures);
    assertIncludes(appSource, "isActive={activeView === item.view}", "Sidebar active state must be delegated to the shadcn Sidebar item.", failures);
    assertIncludes(appSource, "<Breadcrumb", "Top status area must use shadcn Breadcrumb composition.", failures);
    assertIncludes(appSource, "aria-label=\"打开通知与任务中心\"", "Notification status action must remain accessible.", failures);
    assertIncludes(appSource, "notificationStatusLabel", "Notification status must label operation feedback clearly.", failures);
    assertIncludes(appSource, "操作反馈", "Successful operation notices must be visually distinguishable from passive notifications.", failures);
    assertIncludes(appSource, "aria-live=\"polite\"", "Status feedback must be announced as live feedback.", failures);
    assertIncludes(appSource, "openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)", "Top status area must route directly into focused Diff review.", failures);
    assertIncludes(appSource, "<ResultCard", "Home must keep output/export summary in the main work area.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "Home must embed the full Diff review surface.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-operation-scroll\"", "Home right operation stack must use shadcn ScrollArea scrolling.", failures);
    assertIncludes(appSource, "<HomeRunPanel", "Run controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "<DetectionReportPanel", "External report controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "<Sheet open={Boolean(setupEditor)}", "Setup editors must use shadcn Sheet.", failures);
    assertIncludes(appSource, "<SheetContent side=\"right\" className={`shadcn-config-sheet", "Setup editors must share the shadcn sheet utility.", failures);
    assertIncludes(appSource, "<AlertDialog open", "Risky actions must use the shadcn AlertDialog confirmation flow.", failures);
    assertIncludes(appSource, "function UnifiedConfirmDialog", "Native confirms must stay replaced by the unified app dialog.", failures);
    assertIncludes(appSource, "requestConfirm", "Risky actions must route through the async confirmation flow.", failures);
    assertIncludes(appSource, "role=\"dialog\"", "Notification center Sheet must expose dialog semantics.", failures);
    assertIncludes(appSource, "aria-labelledby=\"notification-center-title\"", "Notification center must expose an accessible title.", failures);
    assertIncludes(appSource, "data-ui-section=\"runtime-task-center\"", "Notification center must separate active runtime tasks from notification history.", failures);
    assertIncludes(appSource, "taskItems={runtimeTaskItems}", "Runtime task center items must be passed into the notification center.", failures);
    assertIncludes(appSource, "function openTaskTargetView", "Task-center navigation must be centralized.", failures);
    assertIncludes(appSource, "function openDiffTaskTarget", "Task center must support direct navigation into focused Diff filters.", failures);
    assertIncludes(appSource, "diffFocusRequest={diffFocusRequest}", "Focused Diff requests must flow into the Diff review card.", failures);
    assertIncludes(appSource, "data-ui-section=\"model-route-compact\"", "Model route Sheet must use a compact shadcn summary bar before per-round controls.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-active-model-route\"", "Home model route card must show the active per-round route, not only the default model.", failures);
    assertIncludes(appSource, "modelConfigRef.current", "Model route edits must save the latest selected provider/model without waiting for a React rerender.", failures);
    assertIncludes(appSource, "modelRouteLines", "Model route summary must list effective providers and models per round.", failures);
    assertNotIncludes(appSource, "默认 {modelConfig.model || \"未选\"} · {activeFlowSequence.length} 轮", "Home model route summary must not keep showing the default model after custom per-round routes are selected.", failures);
    assertIncludes(appSource, "rotateModelRoute", "Model route batch assignment must support any enabled provider count with deterministic rotation.", failures);
    assertNotIncludes(appSource, "RouteOverviewCard", "Model route Sheet must not reintroduce verbose overview cards.", failures);
    assertIncludes(appSource, "provider.enabled !== false", "Provider selection must treat legacy providers without an enabled flag as enabled.", failures);
    assertIncludes(appSource, "beginTask(\"loading-models\"", "Model catalog refresh must enter the shared task state flow.", failures);
    assertNotIncludes(appSource, "window.confirm", "App must not use native browser confirmation popups.", failures);
    assertNotIncludes(appSource, "window.alert", "App must not use native browser alert popups.", failures);
    assertNoLegacyFyClassTokens(appSource, "App must not reintroduce old fy-* UI classes.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "export function DiffReviewCard", "ResultCard module must export the full-height Diff review surface.", failures);
    assertIncludes(resultCardSource, "sm:grid-cols-3", "Output export actions should be compressed to three buttons above Diff.", failures);
    assertNotIncludes(resultCardSource, "onExportReviewed", "Reviewed export props must be removed from the output card.", failures);
    assertNotIncludes(resultCardSource, "审阅 Word", "Reviewed Word export button must not return.", failures);
    assertNotIncludes(resultCardSource, "审阅 TXT", "Reviewed TXT export button must not return.", failures);
    assertCountEquals(resultCardSource, "<RewriteDiffPanel", 1, "Full Diff panel must only be mounted by DiffReviewCard.", failures);
    assertIncludes(resultCardSource, "Card className=\"flex h-full min-h-0", "Diff review card must use a fixed-height shadcn Card shell.", failures);
    assertIncludes(resultCardSource, "sticky top-0 z-20", "Inline Diff toolbar must stay pinned while chunks scroll.", failures);
    assertIncludes(resultCardSource, "ToggleGroup", "Diff filters must use shadcn ToggleGroup.", failures);
    assertIncludes(resultCardSource, "Empty className=\"min-h-0 flex-1 border bg-background/70\"", "Diff empty state must use shadcn Empty.", failures);
    assertIncludes(resultCardSource, "overflow-auto whitespace-pre-wrap break-words", "Diff text panes must constrain and wrap long paragraph content.", failures);
    assertIncludes(resultCardSource, "function getRejectedCandidateReasons", "Rejected candidates must render concise interception reasons.", failures);
    assertIncludes(resultCardSource, "function buildRejectedCandidatesRerunFeedback", "Rejected candidates must generate rerun feedback without rendering their content.", failures);
    assertIncludes(resultCardSource, "function getChunkReviewReasons", "Needs-review chunks must render concise visible reasons.", failures);
    assertIncludes(resultCardSource, "forceNeedsReview={needsReview}", "Diff-level review state must drive the visible quality badge.", failures);
    assertIncludes(resultCardSource, "读取本块原因与当前轮配置", "Targeted rerun UI must explain scope and inputs.", failures);
    assertIncludes(resultCardSource, "onRerun(candidateFeedback)", "Rejected candidate cards must expose a direct rerun action.", failures);
    assertIncludes(resultCardSource, "原因：", "Rejected candidate UI must show the reason instead of generic helper copy.", failures);
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
    assertIncludes(historyCardSource, "data-ui-section=\"history-governance-boundary\"", "History page must expose a clear governance boundary section.", failures);
    assertIncludes(historyCardSource, "Card className=\"min-h-full overflow-visible\"", "History page must use shadcn Card composition.", failures);
    assertIncludes(historyCardSource, "ImpactCard", "History cleanup impact must stay summarized in reusable cards.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "Tabs defaultValue=\"default\"", "Model config must use shadcn Tabs for major panes.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"default\"", "Model config must expose default connection as the first pane.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"providers\"", "Model config must expose provider repository as the second pane.", failures);
    assertIncludes(modelConfigCardSource, "ScrollArea className=\"min-h-0 flex-1\"", "Model config panes must delegate scrolling to inner panes.", failures);
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
    modelConfigCardPath: MODEL_CONFIG_CARD_PATH,
    resultCardPath: RESULT_CARD_PATH,
    historyCardPath: HISTORY_CARD_PATH,
    cssPath: GLOBAL_CSS_PATH,
    buttonPath: BUTTON_PATH,
    badgePath: BADGE_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "shadcn shell and primitives are used",
      "home embeds output and Diff review together",
      "drawers and confirmations use shadcn overlays",
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
