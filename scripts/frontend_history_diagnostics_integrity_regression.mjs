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
  restoreSuccess: resolve(APP_DIR, "src", "lib", "documentRestoreSessionSuccessHelpers.ts"),
  restoreRunner: resolve(APP_DIR, "src", "lib", "documentRestoreEffectRunner.ts"),
  bootstrapHistory: resolve(APP_DIR, "src", "lib", "appBootstrapHistoryHelpers.ts"),
  maintenance: resolve(APP_DIR, "src", "lib", "historyDatabaseMaintenanceHandlers.ts"),
  diagnostics: resolve(APP_DIR, "src", "lib", "documentDiagnosticsHandlers.ts"),
  feedback: resolve(APP_DIR, "src", "lib", "diagnosticsFeedbackHelpers.ts"),
  lazyViews: resolve(APP_DIR, "src", "hooks", "useLazyWorkbenchViews.ts"),
  diagnosticsPage: resolve(APP_DIR, "src", "components", "DiagnosticsPage.tsx"),
  maintenancePanel: resolve(APP_DIR, "src", "components", "HistoryDatabaseMaintenancePanel.tsx"),
  artifactBody: resolve(APP_DIR, "src", "components", "HistoryArtifactGovernanceBody.tsx"),
  appDocument: resolve(APP_DIR, "src", "lib", "appDocumentHandlers.ts"),
  historyRoute: resolve(APP_DIR, "src", "lib", "historyDocumentRouteHandlers.ts"),
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
  const waitingListGeneration = generation.beginHistoryRequest(generationKey, "list");
  let latestListWaitSettled = false;
  const latestListWait = generation.waitForLatestHistoryRequest(generationKey, "list").then((value) => {
    latestListWaitSettled = true;
    return value;
  });
  const replacementListGeneration = generation.beginHistoryRequest(generationKey, "list");
  generation.finishHistoryRequest(generationKey, "list", waitingListGeneration);
  await Promise.resolve();
  assert(!latestListWaitSettled, "a waiter must follow the replacement list request instead of settling with its superseded owner");
  generation.finishHistoryRequest(generationKey, "list", replacementListGeneration);
  assert(await latestListWait === replacementListGeneration, "a list waiter must settle with the latest completed generation");
  const obsoleteOrphanGeneration = generation.beginHistoryRequest(generationKey, "orphan");
  generation.invalidateHistoryRequest(generationKey, "orphan");
  assert(!generation.isCurrentHistoryRequest(generationKey, "orphan", obsoleteOrphanGeneration), "state-changing cleanup must invalidate an in-flight orphan scan");
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
  const historyListRequests = [];
  const orphanScanRequests = [];
  let artifactMode = "missing";
  let artifactQuery = { old: true };
  let artifactLoading = false;
  const committedHistoryLists = [];
  const committedOrphanScans = [];
  const setArtifactQuery = (value) => { artifactQuery = value; };
  const historyDeps = {
    service: {
      queryHistoryArtifacts(filters) {
        const request = { ...deferred(), filters };
        artifactRequests.push(request);
        return request.promise;
      },
      listDocumentHistories() {
        const request = deferred();
        historyListRequests.push(request);
        return request.promise;
      },
      scanHistoryOrphans() {
        const request = deferred();
        orphanScanRequests.push(request);
        return request.promise;
      },
    },
    getHistoryArtifactMode: () => artifactMode,
    getDocumentStatus: () => ({ docId: "doc-current" }),
    getRoundResult: () => null,
    getActiveCompareData: () => null,
    getLastExportResult: () => null,
    getHistoryItems: () => [],
    setHistoryArtifactMode: (value) => { artifactMode = value; },
    setHistoryArtifactQuery: setArtifactQuery,
    setHistoryArtifactLoading: (value) => { artifactLoading = value; },
    setHistoryItems: (value) => { committedHistoryLists.push(value); },
    setHistoryOrphanScan: (value) => { committedOrphanScans.push(value); },
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
  const oldListPromise = firstHistoryHandlers.refreshHistoryList();
  const latestListPromise = secondHistoryHandlers.refreshHistoryList();
  historyListRequests[1].resolve({ items: [{ docId: "latest-list" }] });
  const latestItems = await latestListPromise;
  assert(latestItems.status === "current", "the latest history request must return a current result");
  assert(latestItems.items[0].docId === "latest-list", "the latest history request must return its fetched items");
  assert(latestItems.isCurrent(), "the latest history result must still own the list before a replacement starts");
  assert(committedHistoryLists.length === 1 && committedHistoryLists[0][0].docId === "latest-list", "the latest history response must commit");
  historyListRequests[0].resolve({ items: [{ docId: "stale-list" }] });
  const staleItems = await oldListPromise;
  assert(staleItems.status === "stale", "a superseded history request must return an explicit stale result");
  assert(!("items" in staleItems), "a stale history request must not expose payload data");
  assert(committedHistoryLists.length === 1 && committedHistoryLists[0][0].docId === "latest-list", "a late history response must not overwrite the latest list");
  const guardedPromise = secondHistoryHandlers.refreshHistoryList({ shouldCommit: () => false });
  historyListRequests[2].resolve({ items: [{ docId: "guarded-list" }] });
  const guardedItems = await guardedPromise;
  assert(guardedItems.status === "stale" && committedHistoryLists.length === 1, "history list commit guard must return stale without UI commit");
  checks.push("reverse-order artifact responses cannot overwrite the latest mode/query/loading state");
  checks.push("reverse-order history list responses are latest-wins across handler recreation");
  checks.push("history list commit guards return explicit stale results without stale UI writes");

  const appDocumentModule = await importTypeScript(paths.appDocument, {
    "@/lib/appOptionalUiFeedbackHelpers": dataModule("export const planOptionalUiFeedbackApply = (value) => value;"),
    "@/lib/errorText": errorTextUrl,
    "@/lib/historyLoadHelpers": dataModule(`
      export const buildHistoryDocumentLoadingRuntimeStep = () => 'loading-history';
      export const buildHistoryDocumentLoadFailureRuntimeStep = () => 'history-load-failed';
    `),
  });
  {
    let currentTaskTicket = 0;
    const historyLoads = [];
    const committedNotices = [];
    const committedRuntimeSteps = [];
    const committedErrors = [];
    const selectionHandlers = appDocumentModule.createAppDocumentHandlers({
      getModelConfig: () => ({}),
      setError: (value) => { committedErrors.push(value); },
      setNotice: (value) => { committedNotices.push(value); },
      setRuntimeStep: (value) => { committedRuntimeSteps.push(value); },
      setRoundResult: () => undefined,
      setProgress: () => undefined,
      setPreview: () => undefined,
      setCompareData: () => undefined,
      setLastExportResult: () => undefined,
      setRoundProgressStatus: () => undefined,
      setRerunFailures: () => undefined,
      setReviewDecisions: () => undefined,
      liveCompareRef: { current: null },
      beginTask: () => { currentTaskTicket += 1; return currentTaskTicket; },
      isTaskCurrent: (ticket) => ticket === currentTaskTicket,
      finishTask: () => undefined,
      clearAutoSnapshotSuppression: () => undefined,
      invalidateRoundArtifactSnapshotRequests: () => undefined,
      clearPendingAutoActionForManualContextChange: () => undefined,
      loadSelectedHistoryDocument: (item, _config, options) => {
        const request = { ...deferred(), item, options };
        historyLoads.push(request);
        return request.promise;
      },
    });
    const staleSelection = selectionHandlers.handleSelectHistory({ docId: "old" });
    const currentSelection = selectionHandlers.handleSelectHistory({ docId: "new" });
    assert(historyLoads[0].options.shouldCommit() === false, "a newer history selection must immediately stale the older task guard");
    assert(historyLoads[1].options.shouldCommit() === true, "the latest history selection must own its task guard");
    historyLoads[1].resolve({ notice: "new-notice", runtimeStep: "new-runtime" });
    await currentSelection;
    historyLoads[0].reject(new Error("stale history failure"));
    await staleSelection;
    assert(committedNotices.join(",") === "new-notice", "stale history feedback must not overwrite the latest selection notice");
    assert(committedRuntimeSteps.at(-1) === "new-runtime" && !committedRuntimeSteps.includes("history-load-failed"), "stale history completion and failure must not overwrite runtime state");
    assert(committedErrors.length === 0, "a superseded history failure must stay hidden");
  }
  checks.push("reverse-order manual history selections commit feedback only for the current task ticket");

  const historyRouteModule = await importTypeScript(paths.historyRoute, {
    "@/lib/documentStatusCopy": dataModule(`
      export const describeDocumentProgress = () => 'ready';
      export const formatDocumentLoadStep = () => 'loaded';
    `),
    "@/lib/historyHelpers": dataModule(`
      export const buildConfigForHistorySelection = (item, config) => ({ ...config, selectedDocId: item.docId });
      export const buildHistoryRouteStatusResult = (status, statusConfig) => ({ status, statusConfig });
      export const planHistoryDocumentLoadFeedback = () => ({ notice: 'loaded', runtimeStep: 'ready' });
      export const resolveLoadedHistoryRoute = ({ selectedConfig }) => ({
        shouldResync: true,
        statusConfig: { ...selectedConfig, resynced: true },
      });
      export const shouldSyncHistorySelectionConfig = () => true;
    `),
  });
  {
    const refreshGuards = [];
    const snapshotGuards = [];
    const syncedConfigs = [];
    const routeHandlers = historyRouteModule.createHistoryDocumentRouteHandlers({
      getPromptOptions: () => [],
      getPromptWorkflows: () => [],
      getModelConfig: () => ({}),
      refreshDocumentState: async (sourcePath, _config, options) => {
        refreshGuards.push(options?.shouldCommit);
        return { sourcePath };
      },
      loadLatestRoundSnapshot: async (_status, _config, options) => {
        snapshotGuards.push(options?.shouldCommit);
        return { compareData: {} };
      },
    }, {
      syncHistorySelectionConfigToUi: (value) => { syncedConfigs.push(value); },
    });
    const shouldCommit = () => true;
    await routeHandlers.loadSelectedHistoryDocument(
      { docId: "current", sourcePath: "/current.docx" },
      {},
      { shouldCommit },
    );
    assert(refreshGuards.length === 2 && refreshGuards.every((guard) => guard === shouldCommit), "history status load and route resync must share the selection commit guard");
    assert(snapshotGuards.length === 1 && snapshotGuards[0] === shouldCommit, "history snapshot loading must receive the selection commit guard");
    assert(syncedConfigs.length === 2 && syncedConfigs.at(-1).resynced === true, "a current history selection may synchronize its selected and restored routes");

    let stale = false;
    let staleSnapshotCalls = 0;
    const staleSyncedConfigs = [];
    const staleRouteHandlers = historyRouteModule.createHistoryDocumentRouteHandlers({
      getPromptOptions: () => [],
      getPromptWorkflows: () => [],
      getModelConfig: () => ({}),
      refreshDocumentState: async (sourcePath, _config, options) => {
        assert(options?.shouldCommit?.() === true, "a history request must start while it owns the selection");
        stale = true;
        return { sourcePath };
      },
      loadLatestRoundSnapshot: async () => {
        staleSnapshotCalls += 1;
        return null;
      },
    }, {
      syncHistorySelectionConfigToUi: (value) => { staleSyncedConfigs.push(value); },
    });
    await staleRouteHandlers.loadSelectedHistoryDocument(
      { docId: "stale", sourcePath: "/stale.docx" },
      {},
      { shouldCommit: () => !stale },
    );
    assert(staleSnapshotCalls === 0, "a selection superseded during status loading must not continue into snapshot loading");
    assert(staleSyncedConfigs.length === 1 && !staleSyncedConfigs[0].resynced, "a stale selection must not resynchronize its old model route");
  }
  checks.push("history selection guards cover status, snapshot, route resync, and downstream feedback");

  const staleOrphanPromise = firstHistoryHandlers.refreshHistoryOrphanScan();
  const currentOrphanPromise = secondHistoryHandlers.refreshHistoryOrphanScan();
  const currentOrphanScan = { totalOrphanFiles: 2, orphanStats: { bytes: 20 } };
  orphanScanRequests[1].resolve(currentOrphanScan);
  const currentOrphanResult = await currentOrphanPromise;
  assert(currentOrphanResult.status === "current" && currentOrphanResult.scan === currentOrphanScan, "the latest orphan scan must return its current payload");
  const replacementOrphanPromise = firstHistoryHandlers.refreshHistoryOrphanScan();
  assert(!currentOrphanResult.isCurrent(), "a replacement orphan scan must invalidate the prior result before downstream feedback");
  orphanScanRequests[0].reject(new Error("stale orphan failure"));
  const staleOrphanResult = await staleOrphanPromise;
  assert(staleOrphanResult.status === "stale" && !("scan" in staleOrphanResult), "a stale orphan failure must be absorbed without exposing old data");
  const replacementOrphanScan = { totalOrphanFiles: 0, orphanStats: { bytes: 0 } };
  orphanScanRequests[2].resolve(replacementOrphanScan);
  const replacementOrphanResult = await replacementOrphanPromise;
  assert(replacementOrphanResult.status === "current" && committedOrphanScans.length === 2 && committedOrphanScans[1] === replacementOrphanScan, "only current orphan scans may publish state");
  checks.push("orphan scans and failures are latest-wins and stale payloads stay hidden from downstream feedback");

  const restoreSuccessModule = await importTypeScript(paths.restoreSuccess, {
    "@/lib/documentRestoreHelpers": dataModule(`
      export const buildRestoredSnapshotRuntimeStep = () => 'restored';
      export const buildRestoredSuppressedSnapshotRuntimeStep = () => 'suppressed';
      export const persistRestoredPromptRoute = () => undefined;
      export const resolveLoadedSnapshotPromptRoute = () => ({ shouldSync: false });
    `),
    "@/lib/autoSnapshot": dataModule("export const shouldSuppressAutoSnapshotRestore = () => false;"),
  });
  const restoreListKey = {};
  const restoreListGeneration = generation.beginHistoryRequest(restoreListKey, "list");
  const restoreSnapshotStartedSignal = deferred();
  const restoreSnapshotRelease = deferred();
  let restoreSnapshotStarted = false;
  let restoreSnapshotCommitted = false;
  const restoreRuntimeSteps = [];
  const restorePromise = restoreSuccessModule.runDocumentRestoreSuccessPath({
    sourcePath: "doc-restore",
    nextConfig: {},
    promptOptions: [],
    promptWorkflows: [],
    taskTicket: 1,
    taskTicketRef: { current: 1 },
    refreshDocumentState: async (_sourcePath, _config, options) => {
      assert(options?.shouldCommit?.() !== false, "restore status read must start with its task guard");
      return { sourcePath: "doc-restore" };
    },
    refreshHistoryList: async (options) => {
      assert(options?.shouldCommit?.() !== false, "restore history read must start with its task guard");
      generation.finishHistoryRequest(restoreListKey, "list", restoreListGeneration);
      return {
        status: "current",
        items: [],
        isCurrent: () => generation.isCurrentHistoryRequest(restoreListKey, "list", restoreListGeneration),
      };
    },
    clearLoadedRoundSnapshot: () => undefined,
    loadLatestRoundSnapshot: async (_status, _config, options) => {
      restoreSnapshotStarted = true;
      restoreSnapshotStartedSignal.resolve();
      await restoreSnapshotRelease.promise;
      if (options?.shouldCommit && !options.shouldCommit()) return null;
      restoreSnapshotCommitted = true;
      return { compareData: null };
    },
    setModelConfig: () => undefined,
    setRuntimeStep: (step) => { restoreRuntimeSteps.push(step); },
  });
  // The snapshot is intentionally held open while a newer list request takes ownership.
  await restoreSnapshotStartedSignal.promise;
  assert(restoreSnapshotStarted, "restore must reach the async snapshot read");
  const replacementRestoreListGeneration = generation.beginHistoryRequest(restoreListKey, "list");
  restoreSnapshotRelease.resolve();
  await restorePromise;
  assert(!restoreSnapshotCommitted && restoreRuntimeSteps.length === 0, "a list replacement during restore snapshot must block the old snapshot and feedback");
  generation.finishHistoryRequest(restoreListKey, "list", replacementRestoreListGeneration);
  checks.push("history replacement during document restore blocks the old async snapshot commit");

  const bootstrapHistoryModule = await importTypeScript(paths.bootstrapHistory, {
    "@/lib/errorText": errorTextUrl,
    "@/lib/historyRequestGeneration": generationUrl,
  });
  const bootstrapListRequest = deferred();
  const replacementBootstrapListRequest = deferred();
  const bootstrapHistoryCommits = [];
  const bootstrapArtifactCommits = [];
  let bootstrapReady = false;
  const sharedBootstrapListSetter = (items) => { bootstrapHistoryCommits.push(items); };
  const bootstrapPromise = bootstrapHistoryModule.bootstrapAppHistories({
    service: {
      listDocumentHistories: () => bootstrapListRequest.promise,
      queryHistoryArtifacts: async () => ({ ok: true, filters: {}, items: [] }),
    },
    cancelled: () => false,
    setError: () => undefined,
    setHistoryItems: sharedBootstrapListSetter,
    setHistoryArtifactQuery: (value) => { bootstrapArtifactCommits.push(value); },
    setHistoryListReady: (value) => { bootstrapReady = value; },
  });
  const replacementBootstrapHandlers = historyModule.createHistoryListGovernanceHandlers({
    service: { listDocumentHistories: () => replacementBootstrapListRequest.promise },
    setHistoryItems: sharedBootstrapListSetter,
  });
  const replacementBootstrapPromise = replacementBootstrapHandlers.refreshHistoryList();
  bootstrapListRequest.resolve({ items: [{ docId: "stale-bootstrap" }] });
  await new Promise((resolveValue) => setImmediate(resolveValue));
  assert(bootstrapHistoryCommits.length === 0, "a superseded bootstrap list must not commit");
  assert(!bootstrapReady, "bootstrap readiness must wait until the replacement list request settles");
  replacementBootstrapListRequest.resolve({ items: [{ docId: "latest-after-bootstrap" }] });
  await Promise.all([bootstrapPromise, replacementBootstrapPromise]);
  assert(bootstrapHistoryCommits.length === 1 && bootstrapHistoryCommits[0][0].docId === "latest-after-bootstrap", "the post-bootstrap refresh must own the visible list");
  assert(bootstrapReady, "bootstrap readiness must become true after the latest list request settles");
  assert(bootstrapArtifactCommits.length === 1, "bootstrap artifact loading must still complete normally");
  checks.push("bootstrap history loading shares list ownership and waits for a replacement refresh before declaring readiness");

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

  assertIncludes(paths.generation, ["\"list\"", "finishHistoryRequest", "waitForLatestHistoryRequest"]);
  assertIncludes(paths.history, ["isCurrentHistoryRequest", "setHistoryArtifactQuery(null)", "options.shouldCommit", "\"list\""]);
  assertIncludes(paths.restoreRunner, ["refreshHistoryList: (...args) => input.refreshHistoryListRef.current(...args)"]);
  assertIncludes(paths.bootstrapHistory, ["beginHistoryRequest", "waitForLatestHistoryRequest", "setHistoryListReady(true)"]);
  assertIncludes(paths.maintenance, ["isCurrentHistoryRequest", "\"maintenance\"", "\"backups\""]);
  assertIncludes(paths.lazyViews, ["diagnosticsRequestStartedRef", "refreshDiagnosticsRef.current({ silent: true })"]);
  assertIncludes(paths.diagnosticsPage, ["复制诊断失败", "copyError"]);
  assertIncludes(paths.maintenancePanel, [
    "busy || summaryLoading",
    "busy || backupsLoading",
    "尚未读取维护概览",
    "尚未读取备份列表",
    "暂无历史库备份",
    '\"history-db-repair\": \"修复历史索引\"',
    '\"manual-review\": \"人工检查历史记录\"',
    "HISTORY_CHECK_ACTION_LABELS[normalized] ?? normalized",
  ]);
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
