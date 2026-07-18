// Regression: the history-db maintenance endpoints (maintenance/backups/backup/
// compact/recover) must stay wired end-to-end through the frontend.
//
// Before this change, the backend exposed these five governance endpoints but
// the frontend only wired /check and /repair — the rest were orphans. This
// script locks the wiring: the service layer declares all five methods, the
// handler module wires them, the maintenance panel renders the controls, and
// App.tsx passes the new props into the HistoryCard.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const APP_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appService.ts");
const WEB_SERVICE_HISTORY_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHistoryApi.ts");
const HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDatabaseMaintenanceHandlers.ts");
const RECOVERY_MESSAGE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDatabaseRecoveryMessage.ts");
const ORPHAN_REPAIR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanRepairHandlers.ts");
const INTERFACE_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerInterfaceTypes.ts");
const DEPS_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerDepsTypes.ts");
const PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDatabaseMaintenancePanel.tsx");
const MAINTENANCE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardMaintenanceSection.tsx");
const CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const CARD_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBody.tsx");
const CARD_BODY_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBodyTypes.ts");
const CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardProps.ts");
const TYPES_PATH = resolve(ROOT_DIR, "app", "src", "types", "app.ts");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_history_db_maintenance_regression_report.json");

const ENDPOINTS = [
  { method: "getHistoryDatabaseMaintenance", url: "/api/history-db/maintenance" },
  { method: "listHistoryDatabaseBackups", url: "/api/history-db/backups" },
  { method: "backupHistoryDatabase", url: "/api/history-db/backup" },
  { method: "compactHistoryDatabase", url: "/api/history-db/compact" },
  { method: "recoverHistoryDatabase", url: "/api/history-db/recover" },
];

const HANDLER_EXPORTS = [
  "refreshHistoryDatabaseMaintenance",
  "refreshHistoryDatabaseBackups",
  "handleBackupHistoryDatabase",
  "handleCompactHistoryDatabase",
  "handleRecoverHistoryDatabase",
];

function read(path) {
  return readFileSync(path, "utf8");
}

function typeScriptModuleUrl(path) {
  const source = read(path);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: path,
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

async function main() {
  const failures = [];
  const checks = [];

  for (const path of [
    APP_PATH,
    APP_SERVICE_PATH,
    WEB_SERVICE_HISTORY_API_PATH,
    HANDLERS_PATH,
    RECOVERY_MESSAGE_PATH,
    ORPHAN_REPAIR_HANDLERS_PATH,
    INTERFACE_TYPES_PATH,
    DEPS_TYPES_PATH,
    PANEL_PATH,
    MAINTENANCE_SECTION_PATH,
    CARD_PATH,
    CARD_BODY_PATH,
    CARD_BODY_TYPES_PATH,
    CARD_PROPS_PATH,
    TYPES_PATH,
  ]) {
    if (!existsSync(path)) {
      failures.push(`expected file exists: ${path}`);
    }
  }
  if (!failures.length) checks.push("all wiring files exist");

  const serviceApi = read(WEB_SERVICE_HISTORY_API_PATH);
  for (const { method, url } of ENDPOINTS) {
    if (!serviceApi.includes(`async ${method}(`)) {
      failures.push(`webServiceHistoryApi declares ${method}`);
    }
    if (!serviceApi.includes(url)) {
      failures.push(`webServiceHistoryApi targets ${url} for ${method}`);
    }
  }
  if (ENDPOINTS.every((e) => serviceApi.includes(`async ${e.method}(`))) {
    checks.push("service layer declares all five maintenance endpoints with correct URLs");
  }

  const appService = read(APP_SERVICE_PATH);
  for (const { method } of ENDPOINTS) {
    if (!appService.includes(`${method}(`)) {
      failures.push(`AppService interface declares ${method}`);
    }
  }
  if (ENDPOINTS.every((e) => appService.includes(`${e.method}(`))) {
    checks.push("AppService interface exposes all five maintenance methods");
  }

  const handlers = read(HANDLERS_PATH);
  for (const name of HANDLER_EXPORTS) {
    if (!handlers.includes(name)) {
      failures.push(`maintenance handlers export ${name}`);
    }
  }
  if (HANDLER_EXPORTS.every((name) => handlers.includes(name))) {
    checks.push("maintenance handlers export refresh/backup/compact/recover actions");
  }
  if (!handlers.includes("requestConfirm")) {
    failures.push("recover handler must confirm before restoring the history index");
  } else {
    checks.push("recover handler gates history-index recovery behind a confirm dialog");
  }
  for (const safeCopy of [
    "SQLite 仅用于历史查询索引",
    "保留 JSON",
    "不会用旧备份回退历史",
    "JSON 无效时",
    "正在安全恢复历史索引",
  ]) {
    if (!handlers.includes(safeCopy)) {
      failures.push(`recover handler explains safe reconciliation: ${safeCopy}`);
    }
  }
  for (const unsafeCopy of [
    "恢复将用备份覆盖当前历史库",
    "历史库已从备份恢复",
  ]) {
    if (handlers.includes(unsafeCopy)) {
      failures.push(`recover handler removes misleading copy: ${unsafeCopy}`);
    }
  }
  if (
    [
      "SQLite 仅用于历史查询索引",
      "保留 JSON",
      "不会用旧备份回退历史",
      "JSON 无效时",
    ].every((copy) => handlers.includes(copy))
    && !handlers.includes("恢复将用备份覆盖当前历史库")
    && !handlers.includes("历史库已从备份恢复")
  ) {
    checks.push("recover confirmation preserves authoritative JSON and removes overwrite semantics");
  }

  const orphanRepair = read(ORPHAN_REPAIR_HANDLERS_PATH);
  if (!orphanRepair.includes("createHistoryDatabaseMaintenanceHandlers")) {
    failures.push("orphan-repair handlers compose the maintenance handlers");
  } else {
    checks.push("maintenance handlers are composed into the history handler tree");
  }

  const interfaceTypes = read(INTERFACE_TYPES_PATH);
  for (const name of HANDLER_EXPORTS) {
    if (!interfaceTypes.includes(name)) {
      failures.push(`HistoryDeleteHandlers type declares ${name}`);
    }
  }
  if (HANDLER_EXPORTS.every((name) => interfaceTypes.includes(name))) {
    checks.push("handler interface types declare the maintenance actions");
  }

  const depsTypes = read(DEPS_TYPES_PATH);
  for (const setter of [
    "setHistoryDatabaseMaintenance",
    "setHistoryDatabaseMaintenanceLoading",
    "setHistoryDatabaseBackups",
    "setHistoryDatabaseBackupsLoading",
  ]) {
    if (!depsTypes.includes(setter)) {
      failures.push(`HistoryHandlersDeps declares ${setter}`);
    }
  }
  if (["setHistoryDatabaseMaintenance", "setHistoryDatabaseMaintenanceLoading", "setHistoryDatabaseBackups", "setHistoryDatabaseBackupsLoading"].every((s) => depsTypes.includes(s))) {
    checks.push("handler deps expose maintenance/backups state setters");
  }

  const panel = read(PANEL_PATH);
  for (const label of ["立即备份", "压缩", "备份列表", "概览", "恢复索引"]) {
    if (!panel.includes(label)) {
      failures.push(`maintenance panel renders control: ${label}`);
    }
  }
  if (!panel.includes("onRecover") || !panel.includes("HistoryDatabaseMaintenancePanel")) {
    failures.push("maintenance panel wires recover callback");
  } else {
    checks.push("maintenance panel renders backup/compact/recover controls");
  }

  const section = read(MAINTENANCE_SECTION_PATH);
  if (!section.includes("HistoryDatabaseMaintenancePanel")) {
    failures.push("maintenance section renders HistoryDatabaseMaintenancePanel");
  } else {
    checks.push("maintenance section embeds the database maintenance panel");
  }

  const card = read(CARD_PATH);
  const cardBody = read(CARD_BODY_PATH);
  const cardBodyTypes = read(CARD_BODY_TYPES_PATH);
  const cardProps = read(CARD_PROPS_PATH);
  for (const prop of ["dbMaintenanceSummary", "dbBackups", "onBackupDatabase", "onCompactDatabase", "onRecoverDatabase"]) {
    if (!cardProps.includes(prop)) failures.push(`HistoryCardProps declares ${prop}`);
    if (!cardBodyTypes.includes(prop)) failures.push(`HistoryCardBodyTypes declares ${prop}`);
    if (!card.includes(prop)) failures.push(`HistoryCard threads ${prop}`);
    if (!cardBody.includes(prop)) failures.push(`HistoryCardBody threads ${prop}`);
  }
  if (["dbMaintenanceSummary", "dbBackups", "onBackupDatabase", "onCompactDatabase", "onRecoverDatabase"].every((p) => cardProps.includes(p) && cardBodyTypes.includes(p) && card.includes(p) && cardBody.includes(p))) {
    checks.push("maintenance props thread through HistoryCard → HistoryCardBody");
  }

  const app = read(APP_PATH);
  for (const binding of [
    "refreshHistoryDatabaseMaintenance",
    "refreshHistoryDatabaseBackups",
    "handleBackupHistoryDatabase",
    "handleCompactHistoryDatabase",
    "handleRecoverHistoryDatabase",
    "historyDatabaseMaintenance",
    "historyDatabaseBackups",
  ]) {
    if (!app.includes(binding)) failures.push(`App.tsx binds ${binding}`);
  }
  if (["refreshHistoryDatabaseMaintenance", "refreshHistoryDatabaseBackups", "handleBackupHistoryDatabase", "handleCompactHistoryDatabase", "handleRecoverHistoryDatabase", "historyDatabaseMaintenance", "historyDatabaseBackups"].every((b) => app.includes(b))) {
    checks.push("App.tsx binds maintenance state and handlers into the HistoryCard");
  }

  const types = read(TYPES_PATH);
  for (const type of [
    "HistoryDatabaseMaintenanceSummary",
    "HistoryDatabaseBackupListResult",
    "HistoryDatabaseBackupResult",
    "HistoryDatabaseCompactResult",
    "HistoryDatabaseRecoverResult",
  ]) {
    if (!types.includes(type)) failures.push(`types/app declares ${type}`);
  }
  if (["HistoryDatabaseMaintenanceSummary", "HistoryDatabaseBackupListResult", "HistoryDatabaseBackupResult", "HistoryDatabaseCompactResult", "HistoryDatabaseRecoverResult"].every((t) => types.includes(t))) {
    checks.push("types/app declares all five maintenance response shapes");
  }
  for (const field of [
    "HistoryDatabaseRecoveryReconciliation",
    "reconciliation?: HistoryDatabaseRecoveryReconciliation",
    "source: string",
    "action: string",
    "jsonExisted: boolean",
    "jsonValid: boolean",
    "jsonRecordsHash: string",
    "jsonDocumentCount: number",
    "jsonRoundCount: number",
    "jsonGenerationChangedDuringRecovery: boolean",
    "recoveredRecordsHash: string",
    "recoveredDocumentCount: number",
    "recoveredRoundCount: number",
  ]) {
    if (!types.includes(field)) failures.push(`recovery reconciliation type declares ${field}`);
  }
  if (
    [
      "HistoryDatabaseRecoveryReconciliation",
      "reconciliation?: HistoryDatabaseRecoveryReconciliation",
      "jsonRecordsHash: string",
      "jsonGenerationChangedDuringRecovery: boolean",
      "recoveredRecordsHash: string",
    ].every((field) => types.includes(field))
  ) {
    checks.push("recover result retains the backend reconciliation evidence contract");
  }

  const recoveryMessages = await import(typeScriptModuleUrl(RECOVERY_MESSAGE_PATH));
  const buildMessage = recoveryMessages.buildHistoryDatabaseRecoverySuccessMessage;
  const recoveryCases = [
    ["rebuild-index-from-preserved-json", "已保留较新历史并重建索引"],
    ["json-and-recovered-index-aligned", "JSON 历史与恢复索引一致，历史索引已恢复"],
    ["hydrate-missing-json-from-recovered-index", "原 JSON 历史缺失，已从健康备份恢复历史并重建索引"],
    ["future-safe-action", "历史索引恢复完成；JSON 历史仍是权威数据源"],
  ];
  for (const [action, expected] of recoveryCases) {
    const actual = buildMessage({ ok: true, reconciliation: { action } });
    if (actual !== expected) {
      failures.push(`recovery action ${action} maps to ${JSON.stringify(expected)}; received ${JSON.stringify(actual)}`);
    }
  }
  if (recoveryCases.every(([action, expected]) => (
    buildMessage({ ok: true, reconciliation: { action } }) === expected
  ))) {
    checks.push("recovery success messages distinguish preserved JSON, aligned index, hydration, and safe fallback");
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    failures,
    checks,
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return failures.length ? 1 : 0;
}

process.exit(await main());
