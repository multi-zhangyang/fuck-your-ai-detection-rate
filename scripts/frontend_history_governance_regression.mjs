import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_history_governance_regression_report.json");

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
  if (!existsSync(HISTORY_CARD_PATH)) {
    failures.push(`Missing HistoryCard.tsx: ${HISTORY_CARD_PATH}`);
  }

  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const historySource = failures.length ? "" : readFileSync(HISTORY_CARD_PATH, "utf-8");

  if (historySource) {
    assertIncludes(historySource, "onPreviewDelete: (docId: string, options?: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null>;", "HistoryCard must expose a delete-impact preview callback.", failures);
    assertIncludes(historySource, "function makeDeleteActionKey", "History delete actions must have stable preview keys.", failures);
  assertIncludes(historySource, "function AssetImpactPanel", "History page must render a structured impact panel.", failures);
  assertIncludes(historySource, "function HistoryDeleteAction", "History destructive actions must be split into preview and execute controls.", failures);
  assertIncludes(historySource, "function HistoryGovernanceBoundary", "History page must explain governance boundaries before destructive controls.", failures);
  assertIncludes(historySource, "data-ui-section=\"history-governance-boundary\"", "History governance boundary must expose a stable UI section.", failures);
  assertIncludes(historySource, "预览不会删除任何文件", "Impact preview must clearly state it is non-destructive.", failures);
  assertIncludes(historySource, "源文档策略", "Impact preview must explain source document handling.", failures);
  assertIncludes(historySource, "浏览器下载目录或外部路径文件", "Impact preview must distinguish project files from user downloads/external paths.", failures);
  assertIncludes(historySource, "浏览器下载目录、外部原始路径和用户自己保存的 Word/PDF 不会被删除。", "History boundary must clearly say external downloads and user files are untouched.", failures);
  assertIncludes(historySource, "先看影响", "Delete controls must encourage preview before execution.", failures);
    assertIncludes(historySource, "documentImpactPreview ? <AssetImpactPanel", "Document-level delete preview must render inline.", failures);
    assertIncludes(historySource, "roundImpactPreview ? <div className=\"mt-4\"><AssetImpactPanel", "Round-level delete preview must render inline.", failures);
  }

  if (appSource) {
    assertIncludes(appSource, "async function handlePreviewHistoryDelete", "App must provide a safe history delete preview handler.", failures);
    assertIncludes(appSource, "service.previewDocumentHistoryDelete(docId, options)", "Preview handler must call backend impact endpoint.", failures);
    assertIncludes(appSource, "onPreviewDelete={(docId, options) => handlePreviewHistoryDelete(docId, options)}", "HistoryCard must receive the preview handler.", failures);
    assertIncludes(appSource, "已生成删除前影响预览", "Preview handler must notify users without deleting files.", failures);
    assertIncludes(appSource, "result.failedFiles?.length", "History deletion must surface files that failed to delete.", failures);
    assertIncludes(appSource, "已保留在项目目录中", "History deletion notice must explain failed files are retained.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    historyCardPath: HISTORY_CARD_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "delete actions separate preview from execution",
      "source document policy is visible",
      "project artifacts and browser downloads are distinguished",
      "document and round previews render inline",
      "delete failures are surfaced without hiding cleanup results",
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
