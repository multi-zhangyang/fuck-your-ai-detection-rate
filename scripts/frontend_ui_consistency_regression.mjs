import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const MODEL_CONFIG_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCard.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const GLOBAL_CSS_PATH = resolve(ROOT_DIR, "app", "src", "styles", "global.css");
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
  const combinedSource = [appSource, modelConfigCardSource, resultCardSource, historyCardSource, cssSource].join("\n");
  const componentSource = [appSource, modelConfigCardSource, resultCardSource, historyCardSource].join("\n");

  if (cssSource) {
    [
      ".fy-app-shell",
      ".fy-sidebar",
      ".fy-panel",
      ".fy-section",
      ".fy-soft-section",
      ".fy-sticky-toolbar",
      ".fy-inline-toolbar",
      ".fy-tile",
      ".fy-overlay",
      ".fy-drawer",
      ".fy-drawer-wide",
      ".fy-empty-state",
      ".fy-callout",
      ".fy-filter-tabs",
      ".fy-stat-card",
      ".fy-input",
    ].forEach((className) => {
      assertIncludes(cssSource, className, `Missing shared UI utility ${className}.`, failures);
    });
  }

  if (appSource) {
    assertIncludes(appSource, "fy-app-shell", "App shell must use the shared app shell utility.", failures);
    assertIncludes(appSource, "fy-sidebar", "Sidebar must use the shared sidebar utility.", failures);
    assertIncludes(appSource, "fy-sticky-toolbar", "Home operation header must use the shared sticky toolbar utility.", failures);
    assertIncludes(appSource, "fy-drawer", "Setup editor and notification center must use the shared drawer utility.", failures);
    assertIncludes(appSource, "fy-drawer-wide", "Model-route drawer must use the wider drawer utility for readable per-round routes.", failures);
    assertIncludes(appSource, "读取全部服务商", "Model-route drawer must expose one-click provider model refresh.", failures);
    assertIncludes(appSource, "model: model || provider.defaultModel || provider.models?.[0] || \"\"", "Provider route selection must not silently reuse the global default model.", failures);
    assertIncludes(appSource, "fy-banner-primary", "Prominent report/analysis banners must use the shared banner utility.", failures);
    assertIncludes(appSource, "fy-filter-tabs", "Segment filters must use the shared filter tab utility.", failures);
    assertIncludes(appSource, "rainbow-marquee-card", "Current document must keep the distinctive active-document treatment.", failures);
    assertIncludes(appSource, "h-full min-h-0 overflow-hidden pr-2", "Model config page must keep the outer page fixed and delegate scrolling to inner panes.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "fy-panel flex min-h-[28rem] flex-[1_0_28rem] flex-col", "Diff result area must use the shared panel utility and keep a stable minimum height.", failures);
    assertIncludes(resultCardSource, "fy-empty-state", "Diff empty state must use the shared empty-state utility.", failures);
    assertIncludes(resultCardSource, "fy-inline-toolbar", "Diff controls must use a horizontal toolbar instead of wrapping over adjacent panels.", failures);
    assertIncludes(resultCardSource, "min-h-[28rem] flex-[1_0_28rem]", "Diff panel must keep enough height when export statistics are expanded.", failures);
    assertIncludes(resultCardSource, "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto", "Result content must scroll instead of letting expanded details overlap Diff controls.", failures);
  }

  if (historyCardSource) {
    assertIncludes(historyCardSource, "fy-section p-4", "History governance panels must use the shared section utility.", failures);
    assertIncludes(historyCardSource, "fy-callout", "History impact warnings must use the shared callout utility.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "读取全部模型列表", "Model provider repository must support batch model catalog refresh.", failures);
    assertIncludes(modelConfigCardSource, "saveProviderConfig", "Disabled providers must be savable without forced connection tests.", failures);
    assertIncludes(modelConfigCardSource, "请求限速", "Provider editor must show the effective rate-limit controls.", failures);
    assertIncludes(modelConfigCardSource, "fy-panel flex h-full min-h-0 flex-col overflow-hidden", "Model config card must be a fixed-height panel instead of growing the page.", failures);
    assertIncludes(modelConfigCardSource, "TabsContent value=\"providers\" className=\"min-h-0 flex-1 overflow-hidden\"", "Provider tab must keep page-level scrolling disabled.", failures);
    assertIncludes(modelConfigCardSource, "min-h-0 flex-1 space-y-2 overflow-auto p-3", "Provider list must scroll inside its own column.", failures);
    assertIncludes(modelConfigCardSource, "h-full space-y-4 overflow-auto pr-1", "Provider editor must scroll inside its own detail pane.", failures);
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
