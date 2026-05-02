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
    assertIncludes(appSource, "SidebarProvider defaultOpen className=\"h-svh min-h-0 overflow-hidden\"", "Workbench shell must stay viewport-bound through shadcn SidebarProvider.", failures);
    assertIncludes(appSource, "<SidebarInset className=\"h-svh overflow-hidden md:h-[calc(100svh-1rem)]\">", "Main workbench inset must keep its own height and overflow.", failures);
    assertIncludes(appSource, "<header className=\"shrink-0 border-b bg-background/95\">", "Global top status area must stay visible above every view.", failures);
    assertIncludes(appSource, "openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)", "Top status area must jump directly into focused inline Diff review.", failures);
    assertIncludes(appSource, "activeView === \"home\"", "Home route must remain the first-class workbench view.", failures);
    assertIncludes(appSource, "grid h-full min-h-0 gap-4 overflow-hidden xl:grid-cols-[minmax(0,1fr)_360px]", "Home layout must keep a wide left work area and a right operation column.", failures);
    assertIncludes(appSource, "flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden", "Primary home work column must own its height without pushing page scroll.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-operation-scroll\"", "Right operation stack must use a shadcn ScrollArea marker.", failures);
    assertIncludes(appSource, "<ScrollArea\n                    className=\"h-full min-h-0 min-w-0 pr-1\"\n                    data-ui-section=\"home-operation-scroll\"", "Right operation stack must scroll internally through shadcn ScrollArea.", failures);
    assertIncludes(appSource, "flex min-h-0 min-w-0 flex-col gap-4 pb-2", "Right operation stack content must keep compact shadcn gap spacing.", failures);
    assertIncludes(appSource, "<ResultCard", "Home result/report summary must sit in the primary left work area.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "Home page must embed the full Diff workbench in the primary work area.", failures);
    assertIncludes(appSource, "<HomeRunPanel", "Home run controls must stay in the right operation stack.", failures);
    assertIncludes(appSource, "<DetectionReportPanel", "External report controls must stay in the right operation stack.", failures);
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
    assertIncludes(cssSource, ".shadcn-config-sheet", "Configuration overlays must use the shadcn utility namespace.", failures);
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
      "run/report controls stay in the right operation stack",
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
