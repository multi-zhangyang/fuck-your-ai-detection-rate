import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
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
  const cssSource = existsSync(GLOBAL_CSS_PATH) ? readFileSync(GLOBAL_CSS_PATH, "utf-8") : "";
  if (appSource) {
    assertIncludes(appSource, "label=\"主页 / 实时 Diff\"", "Home navigation should expose running controls and inline Diff review together.", failures);
    assertIncludes(appSource, "GlobalTaskStatusBar", "A global task dashboard must keep status visible across Home and Diff.", failures);
    assertNotIncludes(appSource, "activeView === \"home\" ? null : (", "Global top status bar must stay available; display bugs should be fixed in layout, not by removing it.", failures);
    assertIncludes(appSource, "<GlobalTaskStatusBar", "Home page must keep the global top status bar visible after layout repair.", failures);
    assertIncludes(appSource, "fy-home-page", "Home page must use a single scrollable canvas instead of a cramped side panel.", failures);
    assertIncludes(appSource, "fy-home-control-grid", "Home controls must be card-arranged inside the main home area.", failures);
    assertIncludes(appSource, "fy-home-side-stack", "Home run controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "fy-home-result-area", "Home result/report summary must sit in the primary left work area.", failures);
    assertNotIncludes(appSource, "onOpenDiffWorkbench", "Home must not keep a redundant open-Diff entry now that Diff is embedded.", failures);
    assertIncludes(appSource, "fy-home-diff-panel", "Home page must embed the full Diff workbench in the primary work area.", failures);
    assertIncludes(appSource, "onOpenDiff={() => openDiffTaskTarget", "Global status dashboard must bridge directly into focused inline Diff review.", failures);
    assertNotIncludes(appSource, "HOME_TOOLS_COLLAPSED_KEY", "Home page must not persist a separate right-side panel state.", failures);
    assertNotIncludes(appSource, "homeToolsCollapsed", "Home page must not keep the old right-side tool panel model.", failures);
    assertNotIncludes(appSource, "<PanelRightOpen", "Home page must not use right-panel open affordances after card-grid migration.", failures);
    assertNotIncludes(appSource, "<PanelRightClose", "Home page must not use right-panel close affordances after card-grid migration.", failures);
  }
  if (cssSource) {
    assertIncludes(cssSource, ".fy-global-statusbar", "Global status dashboard must use a dedicated compact status shell.", failures);
    assertIncludes(cssSource, ".fy-global-statusgrid", "Global status dashboard must align file, metrics, and notifications in one row.", failures);
    assertIncludes(cssSource, ".fy-global-metric-grid", "Global status dashboard must use readable metric cards instead of a cramped chip rail.", failures);
    assertIncludes(cssSource, ".fy-global-mini-card", "Global status detail cards must stay readable in the top status area.", failures);
    assertIncludes(cssSource, ".fy-home-side-stack", "Home side cards must use a dedicated stack utility.", failures);
    assertIncludes(cssSource, "xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.38fr)]", "Home layout must restore the wide left result area and right operation column.", failures);
    assertIncludes(cssSource, ".fy-home-result-area", "Home result area must be explicitly controlled by shared layout CSS.", failures);
    assertIncludes(cssSource, ".fy-home-diff-panel", "Home result area must reserve a readable inline Diff workbench region.", failures);
    assertIncludes(cssSource, "flex min-h-0 min-w-0 flex-1", "Inline Diff panel must fill remaining left-column height instead of pushing the whole column scroll.", failures);
    assertIncludes(cssSource, "sticky top-0 z-20", "Inline Diff toolbar must stay pinned while the Diff list scrolls.", failures);
    assertIncludes(cssSource, "overflow-hidden pr-0", "Home page must not make the whole page scroll when panels can scroll internally.", failures);
    assertIncludes(cssSource, "overflow-y-auto overscroll-contain", "Home columns must own overflow internally instead of pushing the whole page downward.", failures);
    assertIncludes(cssSource, "h-full max-h-full min-h-0", "Home columns must be height-constrained before enabling internal scroll.", failures);
    assertIncludes(cssSource, "min-h-0", "Home result area must not force a large blank panel height.", failures);
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
      "home controls use card grid",
      "home page links to dedicated Diff workbench",
      "global task bar remains visible without clipping",
      "home result/report stack sits beside operation controls",
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
