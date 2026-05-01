import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const MODEL_CONFIG_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCard.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
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

function assertCountAtLeast(source, pattern, minimum, message, failures) {
  const count = source.split(pattern).length - 1;
  if (count < minimum) {
    failures.push(`${message} Found ${count}, expected at least ${minimum}.`);
  }
}

function assertCountEquals(source, pattern, expected, message, failures) {
  const count = source.split(pattern).length - 1;
  if (count !== expected) {
    failures.push(`${message} Found ${count}, expected ${expected}.`);
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
  const cssSource = loadSource(GLOBAL_CSS_PATH, failures);
  const buttonSource = loadSource(BUTTON_PATH, failures);
  const badgeSource = loadSource(BADGE_PATH, failures);
  const combinedSource = [appSource, modelConfigCardSource, resultCardSource, historyCardSource, cssSource, buttonSource, badgeSource].join("\n");
  const componentSource = [appSource, modelConfigCardSource, resultCardSource, historyCardSource].join("\n");

  if (cssSource) {
    [
      ".fy-app-shell",
      ".fy-sidebar",
      ".fy-nav-list",
      ".fy-nav-item",
      ".fy-sidebar-footer",
      ".fy-page-scroll",
      ".fy-page-fixed",
      ".fy-diff-page",
      ".fy-home-page",
      ".fy-home-control-grid",
      ".fy-home-side-stack",
      ".fy-global-statusbar",
      ".fy-global-statusgrid",
      ".fy-global-status-card",
      ".fy-global-document-card",
      ".fy-global-metric-grid",
      ".fy-global-mini-card",
      ".fy-global-progress-card",
      ".fy-panel",
      ".fy-panel-header",
      ".fy-section",
      ".fy-soft-section",
      ".fy-sticky-toolbar",
      ".fy-inline-toolbar",
      ".fy-tile",
      ".fy-home-result-area",
      ".fy-control-card",
      ".fy-overlay",
      ".fy-drawer",
      ".fy-drawer-wide",
      ".fy-modal",
      ".fy-modal-header",
      ".fy-modal-body",
      ".fy-modal-footer",
      ".fy-result-workbench",
      ".fy-home-result-card",
      ".fy-home-result-body",
      ".fy-result-header",
      ".fy-result-action-grid",
      ".fy-result-action",
      ".fy-diff-review-card",
      ".fy-diff-workbench",
      ".fy-diff-header",
      ".fy-diff-toolbar",
      ".fy-diff-alert",
      ".fy-diff-scroll",
      ".fy-diff-chunk",
      ".fy-diff-text-pane",
      ".fy-diff-text-body",
      ".fy-candidate-card",
      ".fy-candidate-actionbar",
      ".fy-empty-state",
      ".fy-callout",
      ".fy-filter-tabs",
      ".fy-stat-card",
      ".fy-kpi-chip",
      ".fy-disclosure",
      ".fy-input",
    ].forEach((className) => {
      assertIncludes(cssSource, className, `Missing shared UI utility ${className}.`, failures);
    });
  }

  if (appSource) {
    assertIncludes(appSource, "fy-app-shell", "App shell must use the shared app shell utility.", failures);
    assertIncludes(appSource, "fy-sidebar", "Sidebar must use the shared sidebar utility.", failures);
    assertIncludes(appSource, "fy-nav-list", "Sidebar must use the shared navigation list utility.", failures);
    assertIncludes(appSource, "fy-nav-item", "Sidebar items must use shared navigation semantics.", failures);
    assertIncludes(appSource, "aria-current={active ? \"page\" : undefined}", "Sidebar active item must expose aria-current for accessible navigation.", failures);
    assertIncludes(appSource, "aria-expanded={!sidebarCollapsed}", "Sidebar collapse button must expose expanded state.", failures);
    assertIncludes(appSource, "label=\"主页 / 实时 Diff\"", "Home navigation must combine running controls with inline Diff review.", failures);
    assertIncludes(appSource, "fy-home-diff-panel", "Home page must embed the full Diff review surface instead of splitting core review across pages.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "The full Diff review card must remain available inside the home canvas.", failures);
    assertIncludes(appSource, "setActiveView(\"home\");", "Diff focusing actions must return to Home instead of splitting review into a separate route.", failures);
    assertIncludes(appSource, "aria-label=\"打开通知与任务中心\"", "Notification status card must have an explicit accessible label.", failures);
    assertIncludes(appSource, "role=\"dialog\" aria-modal=\"true\"", "Overlay configuration drawers must be exposed as modal dialogs.", failures);
    assertIncludes(appSource, "aria-labelledby=\"notification-center-title\"", "Notification center drawer must have an accessible dialog label.", failures);
    assertIncludes(appSource, "id=\"notification-center-title\"", "Notification center drawer title must be addressable by aria-labelledby.", failures);
    assertCountAtLeast(appSource, "window.addEventListener(\"keydown\", handleKeyDown);", 3, "Unified confirm dialog, setup drawer, and notification center must all support Escape-close.", failures);
    assertIncludes(appSource, "function UnifiedConfirmDialog", "Native browser confirms must be replaced by the unified app confirmation dialog.", failures);
    assertIncludes(appSource, "requestConfirm", "Risky actions must route through the unified async confirmation flow.", failures);
    assertIncludes(appSource, "fy-page-scroll", "Scrollable secondary pages must use the shared page scroll boundary.", failures);
    assertIncludes(appSource, "fy-page-fixed", "Fixed-height secondary pages must use the shared page fixed boundary.", failures);
    assertIncludes(appSource, "GlobalTaskStatusBar", "All workbench pages must share a compact global task dashboard.", failures);
    assertIncludes(appSource, "diffStats={diffDashboardStats}", "Global status dashboard must expose Diff progress/risk counts.", failures);
    assertIncludes(appSource, "onOpenDiff={() => openDiffTaskTarget", "Global status dashboard must route directly into focused Diff review.", failures);
    assertIncludes(appSource, "fy-home-control-grid", "Home controls must live in the main home canvas as cards, not a narrow right sidebar.", failures);
    assertIncludes(appSource, "fy-home-side-stack", "Home run/report cards must stay in the right operation stack beside results.", failures);
    assertIncludes(appSource, "fy-home-result-area", "Home result and inline Diff summary must sit beside controls to avoid disconnected pages.", failures);
    assertIncludes(appSource, "fy-drawer", "Setup editor and notification center must use the shared drawer utility.", failures);
    assertIncludes(appSource, "fy-drawer-wide", "Model-route drawer must use the wider drawer utility for readable per-round routes.", failures);
    assertIncludes(appSource, "data-ui-section=\"model-route-overview\"", "Model-route drawer must present a clear overview before per-round controls.", failures);
    assertIncludes(appSource, "RouteOverviewCard", "Model-route drawer must use structured overview cards for default/provider/route state.", failures);
    assertIncludes(appSource, "先确认默认兜底，再为每轮指定服务商", "Model-route drawer must explain the route decision order.", failures);
    assertIncludes(appSource, "读取服务商模型", "Model-route drawer must expose one-click provider model refresh.", failures);
    assertIncludes(appSource, "model: model || provider.defaultModel || provider.models?.[0] || \"\"", "Provider route selection must not silently reuse the global default model.", failures);
    assertIncludes(appSource, "fy-banner-primary", "Prominent report/analysis banners must use the shared banner utility.", failures);
    assertIncludes(appSource, "fy-filter-tabs", "Segment filters must use the shared filter tab utility.", failures);
    assertIncludes(appSource, "rainbow-marquee-card", "Current document must keep a distinctive active-document treatment.", failures);
    assertIncludes(appSource, "fy-page-fixed", "Model config page must keep the outer page fixed and delegate scrolling to inner panes.", failures);
    assertIncludes(appSource, "fy-control-card", "Home operation cards must use shared control-card semantics.", failures);
    assertIncludes(appSource, "variant={hasDocument ? \"outlineWarning\" : \"default\"}", "Document replacement action must use semantic warning-outline button styling.", failures);
    assertIncludes(appSource, "variant=\"neutral\"", "Primary local-run actions must use the semantic neutral button variant.", failures);
    assertIncludes(appSource, "type RuntimeTaskCenterItem", "App must define a unified runtime task center item model.", failures);
    assertIncludes(appSource, "通知与任务中心", "Notification drawer must be upgraded into a notification and task center.", failures);
    assertIncludes(appSource, "data-ui-section=\"runtime-task-center\"", "Task center must expose a stable runtime task UI section.", failures);
    assertIncludes(appSource, "taskItems={runtimeTaskItems}", "Runtime task items must be passed into the notification center.", failures);
    assertIncludes(appSource, "运行任务 / 历史通知", "Notification center must separate active tasks from notification history.", failures);
    assertIncludes(appSource, "recoveryHint", "Runtime task cards must include standardized recovery guidance.", failures);
    assertIncludes(appSource, "下一步：", "Task center must show an explicit next-step hint.", failures);
    assertIncludes(appSource, "停止读取模型", "Long model catalog reads must be stoppable from the task center.", failures);
    assertIncludes(appSource, "function openTaskTargetView", "Task-center navigation must be centralized.", failures);
    assertIncludes(appSource, "function openDiffTaskTarget", "Task center must support direct navigation into focused Diff filters.", failures);
    assertIncludes(appSource, "diffFocusRequest={diffFocusRequest}", "Focused Diff requests must be passed from App into the ResultCard.", failures);
    assertIncludes(appSource, "Diff 有重跑失败", "Task center must surface failed Diff chunks as actionable work.", failures);
    assertIncludes(appSource, "查看候选块", "Task center must expose rejected model candidates for human review.", failures);
    assertIncludes(appSource, "provider.enabled !== false", "Provider selection must treat legacy providers without an enabled flag as enabled.", failures);
    assertIncludes(appSource, "setNotificationCenterOpen(false);", "Task-center actions must close the drawer after navigation.", failures);
    assertIncludes(appSource, "beginTask(\"loading-models\"", "Default model catalog refresh must enter the shared task state flow.", failures);
    assertNotIncludes(appSource, "window.confirm", "App must not use native browser confirmation popups.", failures);
    assertNotIncludes(appSource, "window.alert", "App must not use native browser alert popups.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "fy-result-workbench", "Result area must use the fixed workbench shell instead of nested page scrolling.", failures);
    assertIncludes(resultCardSource, "fy-result-action-grid", "Home result actions must be grouped as aligned action cards instead of crowding the header.", failures);
    assertNotIncludes(resultCardSource, "fy-diff-toolbar justify-start md:justify-end", "Result header must not keep a crowded export toolbar.", failures);
    assertNotIncludes(resultCardSource, "function DiffWorkbenchEntryCard", "Home must not keep a redundant open-Diff summary card after embedding the full Diff surface.", failures);
    assertNotIncludes(resultCardSource, "打开 Diff 工作台", "Home must not show a redundant open-Diff button after embedding the full Diff surface.", failures);
    assertIncludes(resultCardSource, "export function DiffReviewCard", "ResultCard module must export a dedicated full-height Diff review surface.", failures);
    assertCountEquals(resultCardSource, "<RewriteDiffPanel", 1, "Full Diff panel must only be mounted by the dedicated Diff review card, not the home result card.", failures);
    assertNotIncludes(resultCardSource, "改写对照已移到独立大屏", "Home Diff entry must not explain obvious layout choices with verbose copy.", failures);
    assertNotIncludes(resultCardSource, "T.viewCandidateChunks", "Diff workbench must not duplicate candidate filter actions in both toolbar and callout.", failures);
    assertNotIncludes(resultCardSource, "T.viewFailedChunks", "Diff workbench must not duplicate failed-filter actions in both toolbar and callout.", failures);
    assertIncludes(resultCardSource, "fy-diff-workbench", "Diff result area must be promoted to the primary full-height workbench.", failures);
    assertIncludes(resultCardSource, "fy-diff-scroll", "Diff chunks must scroll inside the Diff workbench only.", failures);
    assertIncludes(resultCardSource, "fy-diff-toolbar", "Diff controls must wrap instead of creating a horizontal scrollbar.", failures);
    assertIncludes(resultCardSource, "fy-diff-chunk", "Diff chunks must use the shared wide chunk layout.", failures);
    assertIncludes(resultCardSource, "fy-diff-text-pane", "Diff text panes must constrain and wrap long paragraph content.", failures);
    assertIncludes(resultCardSource, "fy-candidate-card", "Rejected candidate cards must use the shared readable candidate layout.", failures);
    assertIncludes(resultCardSource, "查看体检和差异", "Candidate diagnostics must be hidden behind a compact disclosure by default.", failures);
    assertNotIncludes(resultCardSource, "open={isSourceFallback || !needsReview}", "Rejected candidate diagnostics must not auto-expand stable candidates and overwhelm the Diff page.", failures);
    assertIncludes(resultCardSource, "候选 {index + 1}", "Rejected candidates must use visible list order instead of backend-local candidate ids that can repeat.", failures);
    assertNotIncludes(resultCardSource, "候选 {candidate.candidate", "Rejected candidate labels must not expose repeated backend-local candidate ids as the primary name.", failures);
    assertIncludes(resultCardSource, "isDecisionForRejectedCandidate", "Adopted candidate cards must use robust candidate matching instead of fragile text equality.", failures);
    assertIncludes(resultCardSource, "hasSameCandidateMeta", "Adopted candidate matching must prefer attempt/candidate metadata when available.", failures);
    assertIncludes(resultCardSource, "normalizeDiffText(decision.text || \"\") === normalizeDiffText(candidate.outputText ?? \"\")", "Adopted candidate matching must tolerate whitespace-normalized text differences.", failures);
    assertIncludes(resultCardSource, "isSelectedCandidate", "Adopted candidate cards must derive an explicit selected state.", failures);
    assertIncludes(resultCardSource, "已采用候选", "Adopted candidate action must switch to a clear selected label.", failures);
    assertIncludes(resultCardSource, "disabled={!canAdopt || isSelectedCandidate}", "Adopted candidate action must not remain clickable as if it still needs risk confirmation.", failures);
    assertIncludes(resultCardSource, "fy-empty-state", "Diff empty state must use the shared empty-state utility.", failures);
    assertIncludes(resultCardSource, "fy-home-result-body", "Home result body must use a dedicated layout class instead of inheriting the full-height Diff shell behavior.", failures);
    assertIncludes(cssSource, ".fy-home-result-body", "Home result body must let the page own scrolling instead of creating a competing fixed panel.", failures);
    assertIncludes(resultCardSource, "export type DiffFocusRequest", "ResultCard must expose a typed focus request for task-center Diff navigation.", failures);
    assertIncludes(resultCardSource, "handledDiffFocusNonceRef", "Focused Diff navigation must only consume each request once.", failures);
    assertIncludes(resultCardSource, "scrollIntoView({ behavior: \"smooth\", block: \"start\" })", "Focused Diff navigation must scroll directly to the target chunk.", failures);
    assertIncludes(resultCardSource, "getDecisionDisplayOutput", "Diff main rewrite pane must render the currently selected review decision.", failures);
    assertIncludes(resultCardSource, "text={displayOutput.text}", "Adopting a rejected candidate must immediately update the main rewrite pane.", failures);
    assertNotIncludes(resultCardSource, "<TextPane title={T.rewrite} text={chunk.outputText} tone=\"rewrite\" />", "Main rewrite pane must not stay pinned to the original model output after manual adoption.", failures);
  }

  if (historyCardSource) {
    assertIncludes(historyCardSource, "fy-section p-4", "History governance panels must use the shared section utility.", failures);
    assertIncludes(historyCardSource, "fy-callout", "History impact warnings must use the shared callout utility.", failures);
    assertIncludes(historyCardSource, "data-ui-section=\"history-governance-boundary\"", "History page must expose a clear governance boundary section.", failures);
    assertIncludes(historyCardSource, "外部文件不碰", "History page must explicitly distinguish project cleanup from external user files.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "读取全部模型列表", "Model provider repository must support batch model catalog refresh.", failures);
    assertIncludes(modelConfigCardSource, "saveProviderConfig", "Disabled providers must be savable without forced connection tests.", failures);
    assertIncludes(modelConfigCardSource, "请求限速", "Provider editor must show the effective rate-limit controls.", failures);
    assertIncludes(modelConfigCardSource, "providerCatalogAbortRef", "Provider model catalog loading must be cancellable inside the provider repository.", failures);
    assertIncludes(modelConfigCardSource, "停止读取", "Provider repository must expose a visible stop button while reading model catalogs.", failures);
    assertIncludes(modelConfigCardSource, "onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal)", "Provider catalog refresh must pass an AbortSignal to the service layer.", failures);
    assertIncludes(modelConfigCardSource, "fy-panel flex h-full min-h-0 flex-col overflow-hidden", "Model config card must be a fixed-height panel instead of growing the page.", failures);
    assertIncludes(modelConfigCardSource, "fy-panel-header", "Model config header must use the shared panel header utility.", failures);
    assertIncludes(modelConfigCardSource, "fy-kpi-chip", "Model config summary chips must use the shared KPI chip utility.", failures);
    assertIncludes(modelConfigCardSource, "模型配置中枢", "Model config page must use a single central configuration surface.", failures);
    assertIncludes(modelConfigCardSource, "data-ui-section=\"model-default-connection\"", "Model config must expose default connection as the first pane.", failures);
    assertIncludes(modelConfigCardSource, "data-ui-section=\"model-provider-repository\"", "Model config must expose provider repository as the second pane.", failures);
    assertIncludes(modelConfigCardSource, "data-ui-section=\"model-home-route-planner\"", "Model config must expose homepage route planning as the third pane.", failures);
    assertIncludes(modelConfigCardSource, "min-h-0 flex-1 space-y-2 overflow-auto p-3", "Provider list must scroll inside its own column.", failures);
    assertIncludes(modelConfigCardSource, "h-full space-y-4 overflow-auto pr-1", "Provider editor must scroll inside its own detail pane.", failures);
    assertIncludes(modelConfigCardSource, "去首页编排轮次", "Model config must provide a clear route-planner handoff to the homepage.", failures);
  }

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
  ].forEach((pattern) => {
    assertNotIncludes(combinedSource, pattern, `Avoid invalid Tailwind class pattern: ${pattern}`, failures);
  });

  [
    "absolute right-5 top-5 flex h-[calc(100vh-40px)]",
    "fixed inset-0 z-[60]",
  ].forEach((pattern) => {
    assertNotIncludes(componentSource, pattern, `Avoid raw UI class pattern outside shared CSS: ${pattern}`, failures);
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
      "shared UI utilities exist",
      "main app shell uses shared utilities",
      "drawers and overlays are centralized",
      "Diff/report/history surfaces share the same panel language",
      "invalid Tailwind opacity classes are not used",
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
