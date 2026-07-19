import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_history_diagnostics_integrity_regression_report.json");

const paths = {
  generation: resolve(APP_DIR, "src", "lib", "historyRequestGeneration.ts"),
  history: resolve(APP_DIR, "src", "lib", "historyListGovernanceHandlers.ts"),
  maintenance: resolve(APP_DIR, "src", "lib", "historyDatabaseMaintenanceHandlers.ts"),
  diagnostics: resolve(APP_DIR, "src", "lib", "documentDiagnosticsHandlers.ts"),
  feedback: resolve(APP_DIR, "src", "lib", "diagnosticsFeedbackHelpers.ts"),
  lazyViews: resolve(APP_DIR, "src", "hooks", "useLazyWorkbenchViews.ts"),
  diagnosticsPage: resolve(APP_DIR, "src", "components", "DiagnosticsPage.tsx"),
  maintenancePanel: resolve(APP_DIR, "src", "components", "HistoryDatabaseMaintenancePanel.tsx"),
  artifactBody: resolve(APP_DIR, "src", "components", "HistoryArtifactGovernanceBody.tsx"),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function importTypeScript(path, imports = {}) {
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
    fileName: path,
  });
  let rewritten = outputText;
  for (const [specifier, target] of Object.entries(imports)) {
    rewritten = rewritten.replaceAll(JSON.stringify(specifier), JSON.stringify(target));
  }
  return import(dataModule(rewritten));
}

function assertIncludes(path, needles) {
  const source = readFileSync(path, "utf8");
  for (const needle of needles) {
    assert(source.includes(needle), `${path} must include ${needle}`);
  }
}

async function run() {
  const checks = [];
  const generation = await importTypeScript(paths.generation);
  const generationKey = {};
  const oldArtifactGeneration = generation.beginHistoryRequest(generationKey, "artifact");
  const newArtifactGeneration = generation.beginHistoryRequest(generationKey, "artifact");
  assert(!generation.isCurrentHistoryRequest(generationKey, "artifact", oldArtifactGeneration), "old artifact generation must be stale");
  assert(generation.isCurrentHistoryRequest(generationKey, "artifact", newArtifactGeneration), "new artifact generation must be current");
  const maintenanceGeneration = generation.beginHistoryRequest(generationKey, "maintenance");
  assert(generation.isCurrentHistoryRequest(generationKey, "maintenance", maintenanceGeneration), "channels must advance independently");
  generation.setCurrentHistoryArtifactMode(generationKey, "large");
  assert(generation.getCurrentHistoryArtifactMode(generationKey, "missing") === "large", "latest artifact mode must survive handler recreation");
  checks.push("history request generations persist per App setter and stay isolated by channel");

  const errorTextUrl = dataModule("export const stringifyError = (value) => value instanceof Error ? value.message : String(value);");
  const artifactHelpersUrl = dataModule(`
    export const buildProtectedHistoryArtifactPaths = () => [];
    export const buildHistoryArtifactFilters = ({ mode, currentDocId, fallbackDocId }) =>
      mode === "current" ? ((currentDocId || fallbackDocId) ? { docId: currentDocId || fallbackDocId, exists: "existing", limit: 8 } : null)
      : mode === "large" ? { exists: "existing", minBytes: 65536, limit: 8 }
      : { exists: "missing", limit: 8 };
    export const createEmptyHistoryArtifactQuery = (error) => ({ ok: false, filters: {}, items: [], error });
    export const createFailedHistoryArtifactQuery = (filters, error) => ({ ok: false, filters, items: [], error });
  `);
  const storageKeysUrl = dataModule("export const ACTIVE_PROMPT_PROFILE_KEY = 'profile'; export const ACTIVE_PROMPT_SEQUENCE_KEY = 'sequence';");
  const safeStorageUrl = dataModule("export const writeStorageValue = () => undefined;");
  const generationUrl = dataModule(ts.transpileModule(readFileSync(paths.generation, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const historyModule = await importTypeScript(paths.history, {
    "@/lib/errorText": errorTextUrl,
    "@/lib/historyArtifactHelpers": artifactHelpersUrl,
    "@/lib/storageKeys": storageKeysUrl,
    "@/lib/safeStorage": safeStorageUrl,
    "@/lib/historyRequestGeneration": generationUrl,
  });

  const artifactRequests = [];
  let artifactMode = "missing";
  let artifactQuery = { old: true };
  let artifactLoading = false;
  const committedHistoryLists = [];
  const setArtifactQuery = (value) => { artifactQuery = value; };
  const historyDeps = {
    service: {
      queryHistoryArtifacts(filters) {
        const request = { ...deferred(), filters };
        artifactRequests.push(request);
        return request.promise;
      },
      async listDocumentHistories() { return { items: [{ docId: "new-list" }] }; },
    },
    getHistoryArtifactMode: () => artifactMode,
    getDocumentStatus: () => ({ docId: "doc-current" }),
    getHistoryItems: () => [],
    setHistoryArtifactMode: (value) => { artifactMode = value; },
    setHistoryArtifactQuery: setArtifactQuery,
    setHistoryArtifactLoading: (value) => { artifactLoading = value; },
    setHistoryItems: (value) => { committedHistoryLists.push(value); },
    setError: () => undefined,
  };
  const firstHistoryHandlers = historyModule.createHistoryListGovernanceHandlers(historyDeps);
  const firstArtifactPromise = firstHistoryHandlers.refreshHistoryArtifactGovernance("missing");
  const secondHistoryHandlers = historyModule.createHistoryListGovernanceHandlers({ ...historyDeps, getHistoryArtifactMode: () => artifactMode });
  const secondArtifactPromise = secondHistoryHandlers.refreshHistoryArtifactGovernance("large");
  artifactRequests[0].resolve({ ok: true, filters: artifactRequests[0].filters, items: [{ path: "old" }] });
  await firstArtifactPromise;
  assert(artifactQuery === null, "stale artifact response must not replace the latest loading state");
  assert(artifactLoading, "stale artifact completion must not clear latest loading");
  artifactRequests[1].resolve({ ok: true, filters: artifactRequests[1].filters, items: [{ path: "latest" }] });
  await secondArtifactPromise;
  assert(artifactQuery.items[0].path === "latest", "latest artifact response must commit");
  assert(artifactQuery.filters.minBytes === 65536 && artifactMode === "large", "mode and committed query filters must match");
  assert(!artifactLoading, "latest artifact completion must clear loading");
  const guardedItems = await secondHistoryHandlers.refreshHistoryList({ shouldCommit: () => false });
  assert(guardedItems[0].docId === "new-list" && committedHistoryLists.length === 0, "history list guard must skip UI commit but return items");
  checks.push("reverse-order artifact responses cannot overwrite the latest mode/query/loading state");
  checks.push("history list commit guard preserves returned data without stale UI writes");

  const recoveryMessageUrl = dataModule("export const buildHistoryDatabaseRecoverySuccessMessage = () => 'recovered';");
  const maintenanceModule = await importTypeScript(paths.maintenance, {
    "@/lib/errorText": errorTextUrl,
    "@/lib/historyDatabaseRecoveryMessage": recoveryMessageUrl,
    "@/lib/historyRequestGeneration": generationUrl,
  });
  const summaryRequests = [];
  const backupRequests = [];
  let summary = { old: true };
  let summaryLoading = false;
  let backups = { old: true };
  let backupsLoading = false;
  const setSummary = (value) => { summary = value; };
  const setBackups = (value) => { backups = value; };
  const maintenanceDeps = {
    service: {
      getHistoryDatabaseMaintenance() {
        const request = deferred();
        summaryRequests.push(request);
        return request.promise;
      },
      listHistoryDatabaseBackups() {
        const request = deferred();
        backupRequests.push(request);
        return request.promise;
      },
    },
    setHistoryDatabaseMaintenance: setSummary,
    setHistoryDatabaseMaintenanceLoading: (value) => { summaryLoading = value; },
    setHistoryDatabaseBackups: setBackups,
    setHistoryDatabaseBackupsLoading: (value) => { backupsLoading = value; },
    setError: () => undefined,
  };
  const unusedCore = {};
  const firstMaintenanceHandlers = maintenanceModule.createHistoryDatabaseMaintenanceHandlers(maintenanceDeps, unusedCore);
  const oldSummaryPromise = firstMaintenanceHandlers.refreshHistoryDatabaseMaintenance();
  const secondMaintenanceHandlers = maintenanceModule.createHistoryDatabaseMaintenanceHandlers({ ...maintenanceDeps }, unusedCore);
  const newSummaryPromise = secondMaintenanceHandlers.refreshHistoryDatabaseMaintenance();
  summaryRequests[0].resolve({ ok: true, path: "old" });
  await oldSummaryPromise;
  assert(summary === null && summaryLoading, "stale summary response must leave the latest request loading");
  summaryRequests[1].resolve({ ok: true, path: "latest" });
  await newSummaryPromise;
  assert(summary.path === "latest" && !summaryLoading, "latest summary response must commit and finish loading");
  const oldBackupsPromise = firstMaintenanceHandlers.refreshHistoryDatabaseBackups(false);
  const newBackupsPromise = secondMaintenanceHandlers.refreshHistoryDatabaseBackups(true);
  backupRequests[0].resolve({ ok: true, total: 1, items: [{ name: "old" }] });
  await oldBackupsPromise;
  assert(backups === null && backupsLoading, "stale backup response must leave the latest request loading");
  backupRequests[1].resolve({ ok: true, total: 1, items: [{ name: "latest" }] });
  await newBackupsPromise;
  assert(backups.items[0].name === "latest" && !backupsLoading, "latest backup response must commit and finish loading");
  checks.push("reverse-order maintenance and backup responses keep exact independent loading state");

  const formatterUrl = dataModule("export const formatBytes = (value) => String(value);");
  const feedbackModule = await importTypeScript(paths.feedback, { "@/lib/formatters": formatterUrl });
  const feedbackUrl = dataModule(
    ts.transpileModule(readFileSync(paths.feedback, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText.replaceAll(JSON.stringify("@/lib/formatters"), JSON.stringify(formatterUrl)),
  );
  const diagnosticsModule = await importTypeScript(paths.diagnostics, {
    "@/lib/diagnosticsHelpers": feedbackUrl,
    "@/lib/errorText": errorTextUrl,
  });
  const healthRequests = [];
  let diagnosticsValue = null;
  let visibleError = "";
  const setDiagnostics = (value) => {
    diagnosticsValue = typeof value === "function" ? value(diagnosticsValue) : value;
  };
  const diagnosticsDeps = {
    service: {
      getHealth() {
        const request = deferred();
        healthRequests.push(request);
        return request.promise;
      },
    },
    setDiagnostics,
    setError: (value) => { visibleError = value; },
    setRuntimeStep: () => undefined,
    beginTask: () => 1,
    finishTask: () => undefined,
    applyOptionalUiFeedback: () => undefined,
  };
  const firstDiagnosticsHandlers = diagnosticsModule.createDocumentDiagnosticsHandlers(diagnosticsDeps);
  const oldHealthPromise = firstDiagnosticsHandlers.refreshDiagnostics({ silent: true });
  const secondDiagnosticsHandlers = diagnosticsModule.createDocumentDiagnosticsHandlers({ ...diagnosticsDeps });
  const newHealthPromise = secondDiagnosticsHandlers.refreshDiagnostics({ silent: true });
  healthRequests[0].resolve({ ok: true, createdAt: "old", checks: [] });
  await oldHealthPromise;
  assert(diagnosticsValue === null, "stale health response must not commit");
  healthRequests[1].reject(new Error("health unavailable"));
  await newHealthPromise;
  assert(diagnosticsValue?.ok === false, "latest failed health request must create a visible failure snapshot");
  assert(diagnosticsValue.checks[0]?.key === "health_request", "failure snapshot must expose a diagnostic error check");
  assert(visibleError === "health unavailable", "silent initial failure must surface a visible global error");
  checks.push("stale diagnostics are ignored and silent initial failure becomes a retryable error snapshot");

  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  let removed = false;
  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { clipboard: { writeText: async () => { throw new Error("denied"); } } },
    });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: {
        body: { appendChild: () => undefined },
        createElement: () => ({
          value: "",
          style: {},
          focus: () => undefined,
          select: () => undefined,
          remove: () => { removed = true; },
        }),
        execCommand: () => false,
      },
    });
    let copyFailed = false;
    try {
      await feedbackModule.copyTextToClipboard("diagnostics");
    } catch (error) {
      copyFailed = String(error).includes("剪贴板");
    }
    assert(copyFailed && removed, "clipboard failure must reject visibly and always remove the fallback textarea");
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator);
    else delete globalThis.navigator;
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  }
  checks.push("clipboard rejection propagates to visible UI feedback and cleans compatibility DOM state");

  assertIncludes(paths.history, ["isCurrentHistoryRequest", "setHistoryArtifactQuery(null)", "options.shouldCommit"]);
  assertIncludes(paths.maintenance, ["isCurrentHistoryRequest", "\"maintenance\"", "\"backups\""]);
  assertIncludes(paths.lazyViews, ["diagnosticsRequestStartedRef", "refreshDiagnosticsRef.current({ silent: true })"]);
  assertIncludes(paths.diagnosticsPage, ["复制诊断失败", "copyError"]);
  assertIncludes(paths.maintenancePanel, ["busy || summaryLoading", "busy || backupsLoading", "尚未读取维护概览", "尚未读取备份列表", "暂无历史库备份"]);
  assertIncludes(paths.artifactBody, ["尚未读取资产", "无资产", "读取中"]);
  checks.push("history and diagnostics surfaces distinguish loading, unrequested, empty, and failed states");

  return { ok: true, createdAt: new Date().toISOString(), checks };
}

let report;
try {
  report = await run();
} catch (error) {
  report = { ok: false, createdAt: new Date().toISOString(), error: error instanceof Error ? error.stack : String(error) };
}
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (report.ok) console.log(JSON.stringify(report, null, 2));
else {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
