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
    assertNotIncludes(historySource, "function HistoryGovernanceBoundary", "History page must not keep removed verbose governance copy.", failures);
    assertIncludes(historySource, "function HistoryArtifactGovernancePanel", "History page must expose the SQL-backed asset governance panel.", failures);
    assertIncludes(historySource, "function getMaintenanceStateLabel", "History maintenance summary must collapse backend details into one concise state.", failures);
    assertNotIncludes(historySource, "data-ui-section=\"history-governance-boundary\"", "History governance boundary section must stay removed.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-asset-governance\"", "Asset governance panel must expose a stable UI section.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-user-summary\"", "History default view must expose a user-centered summary section.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-advanced-maintenance\"", "History maintenance tools must stay behind an advanced section.", failures);
    assertIncludes(historySource, "继续处理与导出", "History default title must speak in user workflow terms.", failures);
    assertIncludes(historySource, "可继续", "History summary must show continuable documents.", failures);
    assertIncludes(historySource, "可导出", "History summary must show exportable documents.", failures);
    assertIncludes(historySource, "可释放", "History summary must show cleanup as a simple space outcome.", failures);
    assertIncludes(historySource, "资产需检查", "History rows must flag records with missing generated assets before export.", failures);
    assertIncludes(historySource, "需检查", "History export state must warn when generated assets are incomplete.", failures);
    assertNotIncludes(historySource, "项目体检、空间清理和异常修复都收在这里", "Advanced maintenance must not reintroduce verbose helper copy.", failures);
    assertNotIncludes(historySource, "文档与生成物管理", "History page must not return to a backend-governance title.", failures);
    assertNotIncludes(historySource, "清理、索引修复和未归属文件扫描默认收起", "Collapsed maintenance copy must avoid leading with implementation details.", failures);
    assertNotIncludes(historySource, "function ArtifactGovernanceMap", "Removed history helper must not return as unused UI clutter.", failures);
    assertNotIncludes(historySource, "function RoundAuditStrip", "Round audit detail strip must stay out of the user history view.", failures);
    assertIncludes(historySource, "ToggleGroup", "Asset governance view must use shadcn ToggleGroup for mode selection.", failures);
    assertIncludes(historySource, "缺失资产", "Asset governance must keep user-facing modes concise.", failures);
    assertIncludes(historySource, "当前文档", "Asset governance must support a current-document view.", failures);
    assertIncludes(historySource, "大文件", "Asset governance must support a simple large-file view.", failures);
    assertIncludes(historySource, "修复索引", "Missing-asset governance must offer a safe index repair action.", failures);
    assertIncludes(historySource, "onRepairHistoryDatabase", "HistoryCard must receive a safe database repair callback.", failures);
    assertIncludes(historySource, "先看影响", "Delete controls must encourage preview before execution.", failures);
    assertIncludes(historySource, "documentImpactPreview ? <AssetImpactPanel", "Document-level delete preview must render inline.", failures);
    assertIncludes(historySource, "roundImpactPreview ? <div className=\"mt-4\"><AssetImpactPanel", "Round-level delete preview must render inline.", failures);
  }

  if (appSource) {
    assertIncludes(appSource, "async function handlePreviewHistoryDelete", "App must provide a safe history delete preview handler.", failures);
    assertIncludes(appSource, "service.previewDocumentHistoryDelete(docId, options)", "Preview handler must call backend impact endpoint.", failures);
    assertIncludes(appSource, "service.queryHistoryArtifacts", "App must query SQL-backed history artifact governance data.", failures);
    assertIncludes(appSource, "service.repairHistoryDatabase", "App must call the backend repair endpoint from governance UI.", failures);
    assertIncludes(appSource, "async function handleRepairHistoryDatabase", "App must provide a history database repair handler.", failures);
    assertIncludes(appSource, "HistoryArtifactGovernanceMode", "App must keep asset governance modes typed.", failures);
    assertIncludes(appSource, "onPreviewDelete={(docId, options) => handlePreviewHistoryDelete(docId, options)}", "HistoryCard must receive the preview handler.", failures);
    assertIncludes(appSource, "onArtifactModeChange={(mode) => void refreshHistoryArtifactGovernance(mode)}", "HistoryCard must receive asset governance mode changes.", failures);
    assertIncludes(appSource, "onRepairHistoryDatabase={() => void handleRepairHistoryDatabase()}", "HistoryCard must receive the database repair handler.", failures);
    assertIncludes(appSource, "已生成删除前影响预览", "Preview handler must notify users without deleting files.", failures);
    assertIncludes(appSource, "result.failedFiles?.length", "History deletion must surface files that failed to delete.", failures);
    assertIncludes(appSource, "已保留在项目目录中", "History deletion notice must explain failed files are retained.", failures);
    assertIncludes(appSource, "Output file does not exist", "Export errors must recognize history records whose output file is gone.", failures);
    assertIncludes(appSource, "修复索引或清理缺失资产", "Missing-output export errors must point users back to history governance.", failures);
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
      "document and round previews render inline",
      "SQL asset governance is surfaced behind advanced tools",
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
