import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_home_layout_regression_report.json");

function assertIncludes(source, pattern, message, failures) {
  if (!source.includes(pattern)) {
    failures.push(message);
  }
}

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }

  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  if (appSource) {
    assertIncludes(appSource, "HOME_TOOLS_COLLAPSED_KEY", "Home tools collapsed state must be persisted.", failures);
    assertIncludes(appSource, "homeToolsCollapsed", "Home page must model right-side tool panel visibility.", failures);
    assertIncludes(appSource, "展开操作面板", "Collapsed home tools must provide a visible restore action.", failures);
    assertIncludes(appSource, "专注 Diff", "Home tools must offer a clear Diff focus action.", failures);
    assertIncludes(appSource, "grid-cols-1", "Diff focus mode must give the result area a full-width layout.", failures);
    assertIncludes(appSource, "操作面板", "Right-side controls must be grouped under a clear tool panel label.", failures);
    assertIncludes(appSource, "<PanelRightOpen", "Restore action must use the right-panel open affordance.", failures);
    assertIncludes(appSource, "<PanelRightClose", "Collapse action must use the right-panel close affordance.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "home tool panel can collapse",
      "Diff focus mode expands the main result area",
      "collapsed state survives refresh",
      "restore action remains visible",
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
