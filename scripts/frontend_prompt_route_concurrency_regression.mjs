import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = resolve(ROOT_DIR, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");

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

function transpile(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    fileName: path,
  }).outputText;
}

async function importTypeScript(path, imports = {}) {
  let source = transpile(path);
  for (const [specifier, target] of Object.entries(imports)) {
    source = source.replaceAll(JSON.stringify(specifier), JSON.stringify(target));
  }
  return import(dataModule(source));
}

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  }
  throw new Error(message);
}

const coordinatorPath = resolve(APP_DIR, "src", "lib", "promptRouteRequestGeneration.ts");
const coordinatorSource = transpile(coordinatorPath);
const coordinatorUrl = dataModule(coordinatorSource);
const coordinatorModule = await import(coordinatorUrl);
const promptPreviewGenerationPath = resolve(APP_DIR, "src", "lib", "promptPreviewRequestGeneration.ts");
const promptPreviewGenerationSource = transpile(promptPreviewGenerationPath);
const promptPreviewGenerationUrl = dataModule(promptPreviewGenerationSource);
const promptPreviewGeneration = await import(promptPreviewGenerationUrl);

{
  const registry = promptPreviewGeneration.createPromptPreviewRequestRegistry();
  const firstRead = promptPreviewGeneration.beginPromptPreviewRead(registry);
  const secondRead = promptPreviewGeneration.beginPromptPreviewRead(registry);
  assert(firstRead !== null && secondRead !== null, "prompt preview reads must receive generations");
  assert(!promptPreviewGeneration.isCurrentPromptPreviewRequest(registry, firstRead), "a newer read must stale an older read");
  assert(promptPreviewGeneration.isCurrentPromptPreviewRequest(registry, secondRead), "the newest read must own the registry");
  promptPreviewGeneration.finishPromptPreviewRequest(registry, firstRead);
  assert(promptPreviewGeneration.isPromptPreviewRequestBusy(registry), "a stale read must not clear the current busy operation");
  promptPreviewGeneration.finishPromptPreviewRequest(registry, secondRead);
  const mutation = promptPreviewGeneration.beginPromptPreviewMutation(registry);
  assert(mutation !== null, "a prompt mutation must receive a generation");
  assert(promptPreviewGeneration.beginPromptPreviewRead(registry) === null, "reads must be rejected during a prompt mutation");
  assert(promptPreviewGeneration.beginPromptPreviewMutation(registry) === null, "duplicate prompt mutations must be rejected");
  promptPreviewGeneration.finishPromptPreviewRequest(registry, mutation);
}

const workflowDraftHelpers = await importTypeScript(resolve(APP_DIR, "src", "lib", "promptWorkflowDraftHelpers.ts"));
{
  const options = [
    { id: "prewrite", label: "预写" },
    { id: "round1", label: "第一轮" },
    { id: "round2", label: "第二轮" },
  ];
  const draft = {
    label: "可编辑流程",
    description: "回归流程",
    defaultSequence: ["round1", "round2"],
    sequenceLimit: 2,
    roundLimit: 4,
  };
  assert(workflowDraftHelpers.validatePromptWorkflowDraft(draft, options) === "", "a valid workflow draft must pass client validation");
  assert(workflowDraftHelpers.validatePromptWorkflowDraft({ ...draft, roundLimit: 1 }, options).includes("不能小于"), "workflow validation must keep the runtime round limit above the default sequence limit");
  assert(workflowDraftHelpers.validatePromptWorkflowDraft({ ...draft, defaultSequence: ["round1", "round1"] }, options).includes("重复"), "workflow validation must reject duplicate prompt rounds");
  assert(workflowDraftHelpers.validatePromptWorkflowDraft({ ...draft, defaultSequence: ["round1", "round2", "prewrite"] }, options).includes("上限"), "workflow validation must enforce the sequence limit");
  assert(workflowDraftHelpers.movePromptWorkflowSequenceItem(["round1", "round2"], 1, -1).join(",") === "round2,round1", "workflow sequence controls must preserve explicit ordering");
  assert(workflowDraftHelpers.replacePromptWorkflowSequenceItem(["round1", "round2"], 1, "prewrite").join(",") === "round1,prewrite", "workflow sequence controls must replace one unique round");
}

const homeRunRouteViewModel = await importTypeScript(
  resolve(APP_DIR, "src", "lib", "homeRunPanelRouteViewModel.ts"),
  {
    "@/lib/promptRegistry": dataModule(`
      export const formatPromptSequence = (sequence) => sequence.join(',');
      export const getDefaultPromptProfile = () => 'default';
      export const getPromptProfileLabel = () => 'Default';
      export const getPromptRoundLimit = (_profile, workflows) => workflows[0].roundLimit;
      export const getPromptSequenceLimit = (_profile, workflows) => workflows[0].sequenceLimit;
      export const isPromptSequenceCustomizable = () => true;
    `),
    "@/lib/modelRoute": dataModule("export const normalizeRewriteConcurrency = (value) => value;"),
    "@/lib/qualityStats": dataModule("export const clampPercent = (value) => value;"),
    "@/lib/modelRouteSummary": dataModule(`
      export const buildModelRouteSummary = () => [];
      export const summarizeModelRoute = () => ({
        customizedRouteCount: 0,
        unavailableRouteCount: 0,
        modelRouteStatus: 'default',
        modelRouteHealthLabel: 'ready',
        modelRouteTitle: 'default',
        modelRouteLines: [],
        activeModelRouteReady: true,
      });
    `),
  },
);
{
  const routeState = homeRunRouteViewModel.deriveHomeRunPanelRouteState({
    modelConfig: { modelProviders: [], rewriteConcurrency: 2 },
    promptProfile: "custom",
    promptWorkflows: [{ id: "custom", sequenceLimit: 6, roundLimit: 9 }],
    promptOptions: [
      { id: "p1", label: "P1" },
      { id: "p2", label: "P2" },
      { id: "p3", label: "P3" },
      { id: "p4", label: "P4" },
    ],
    activeFlowSequence: ["p1", "p2", "p3", "p4"],
    progress: null,
    currentRunCompletedChunks: 0,
  });
  assert(routeState.sequenceLengthLimit === 6, "the workbench must honor workflow sequence limits above the legacy three-round default");
  assert(routeState.sequenceLengthOptions.join(",") === "1,2,3,4,5,6", "the setup editor must expose every configured default-sequence length");
  assert(routeState.appendRoundLimit === 9, "the continuation limit must remain independent from the default sequence limit");
}

const bootstrapPromptRegistryUrl = dataModule(`
  export const getPromptOptionsFromPreviews = () => { throw new Error('stale prompt options must not be read'); };
  export const getPromptWorkflowsFromPreviews = () => { throw new Error('stale prompt workflows must not be read'); };
`);
const bootstrapStateHelpers = await importTypeScript(resolve(APP_DIR, "src", "lib", "bootstrapHelpers.ts"), {
  "@/lib/promptRegistry": bootstrapPromptRegistryUrl,
});
{
  const loadedConfig = { baseUrl: "https://example.com", apiKey: "key", promptProfile: "saved", promptSequence: ["saved"] };
  const preserved = bootstrapStateHelpers.buildBootstrapModelConfigState({
    loadedConfig,
    loadedPrompts: null,
    normalizePromptRegistry: false,
    normalizeActiveModelConfig: () => { throw new Error("stale prompt normalization must not run"); },
  });
  assert(preserved.config === loadedConfig && preserved.loadedPrompts === null, "stale prompt ownership must preserve loaded model config without registry derivation");
}

const bootstrapHelpersUrl = dataModule(`
  let lastLoadedPrompts = undefined;
  let lastNormalizePromptRegistry = undefined;
  export const getLastLoadedPrompts = () => lastLoadedPrompts;
  export const getLastNormalizePromptRegistry = () => lastNormalizePromptRegistry;
  export const buildBootstrapModelConfigState = ({ loadedConfig, loadedPrompts, normalizePromptRegistry }) => {
    lastLoadedPrompts = loadedPrompts;
    lastNormalizePromptRegistry = normalizePromptRegistry;
    return {
    config: loadedConfig,
    loadedPrompts,
    shouldRefreshCatalog: Boolean(loadedConfig.baseUrl && loadedConfig.apiKey),
    };
  };
`);
const bootstrapModelRouteUrl = dataModule("export const normalizeActiveModelConfig = (config) => config;");
const bootstrapErrorTextUrl = dataModule("export const stringifyError = (value) => value instanceof Error ? value.message : String(value);");
const bootstrap = await importTypeScript(resolve(APP_DIR, "src", "lib", "appBootstrapConfigHelpers.ts"), {
  "@/lib/bootstrapHelpers": bootstrapHelpersUrl,
  "@/lib/errorText": bootstrapErrorTextUrl,
  "@/lib/modelRoute": bootstrapModelRouteUrl,
  "@/lib/promptPreviewRequestGeneration": promptPreviewGenerationUrl,
});
const bootstrapHelpers = await import(bootstrapHelpersUrl);

{
  const configRequest = deferred();
  const promptRequest = deferred();
  const registry = promptPreviewGeneration.createPromptPreviewRequestRegistry();
  const busyStates = [];
  let ownedByUser = false;
  let appliedConfig = null;
  let appliedPrompts = null;
  let catalogRefreshes = 0;
  const boot = bootstrap.bootstrapAppConfig({
    service: {
      loadModelConfig: () => configRequest.promise,
      getPromptPreviews: () => promptRequest.promise,
    },
    cancelled: () => false,
    setError: () => undefined,
    setModelConfig: (value) => { appliedConfig = value; },
    setModelConfigReady: () => undefined,
    setPromptPreviews: (value) => { appliedPrompts = value; },
    setPromptPreviewBusy: (value) => { busyStates.push(value); },
    promptPreviewRequestRegistry: registry,
    shouldCommitModelConfig: () => !ownedByUser,
    refreshModelCatalog: async () => { catalogRefreshes += 1; },
  });
  ownedByUser = true;
  const newerLazyRead = promptPreviewGeneration.beginPromptPreviewRead(registry);
  assert(newerLazyRead !== null, "a lazy prompt read must supersede bootstrap ownership");
  configRequest.resolve({ baseUrl: "https://example.com", apiKey: "key", model: "model" });
  promptRequest.resolve({ ok: true, promptDir: "prompts", items: [{ id: "new", label: "New" }], workflows: [] });
  await boot;
  assert(appliedConfig === null, "bootstrap must not overwrite a user-owned model config");
  assert(appliedPrompts === null, "a stale bootstrap prompt response must not overwrite a newer lazy read");
  assert(bootstrapHelpers.getLastLoadedPrompts() === null, "a stale bootstrap prompt response must not participate in model config normalization");
  assert(bootstrapHelpers.getLastNormalizePromptRegistry() === false, "bootstrap must explicitly preserve loaded config when prompt ownership is stale");
  assert(catalogRefreshes === 0, "a stale bootstrap config must not trigger a model catalog refresh");
  assert(busyStates.at(-1) === true, "a stale bootstrap finalizer must preserve newer prompt-read busy state");
  promptPreviewGeneration.finishPromptPreviewRequest(registry, newerLazyRead);
}

{
  const configRequest = deferred();
  const registry = promptPreviewGeneration.createPromptPreviewRequestRegistry();
  const mutation = promptPreviewGeneration.beginPromptPreviewMutation(registry);
  assert(mutation !== null, "a pre-existing prompt mutation must own bootstrap when present");
  const boot = bootstrap.bootstrapAppConfig({
    service: {
      loadModelConfig: () => configRequest.promise,
      getPromptPreviews: async () => { throw new Error("bootstrap must not start a read while mutation owns the registry"); },
    },
    cancelled: () => false,
    setError: () => undefined,
    setModelConfig: () => undefined,
    setModelConfigReady: () => undefined,
    setPromptPreviews: () => undefined,
    setPromptPreviewBusy: () => undefined,
    promptPreviewRequestRegistry: registry,
    refreshModelCatalog: async () => undefined,
  });
  promptPreviewGeneration.finishPromptPreviewRequest(registry, mutation);
  configRequest.resolve({ baseUrl: "", apiKey: "", model: "" });
  await boot;
  assert(bootstrapHelpers.getLastNormalizePromptRegistry() === false, "bootstrap must not normalize from an empty prompt payload after a mutation-owned start");
}

{
  const ref = { current: 0 };
  const firstFactory = coordinatorModule.createPromptRouteRequestCoordinator(ref);
  const first = firstFactory.begin();
  const firstGuard = firstFactory.guard(first);
  const secondFactory = coordinatorModule.createPromptRouteRequestCoordinator(ref);
  const second = secondFactory.begin();
  assert(!firstGuard(), "a prompt route guard must remain stale across handler recreation");
  assert(secondFactory.isCurrent(second), "the latest prompt route generation must stay current");
}

const documentCopyUrl = dataModule(`
  export const buildPromptProfileSwitchFailureRuntimeStep = () => 'profile-failed';
  export const buildPromptProfileSwitchLoadingRuntimeStep = () => 'profile-loading';
  export const buildPromptProfileSwitchSuccessRuntimeStep = (loaded) => loaded ? 'profile-loaded' : 'profile-empty';
  export const buildPromptSequenceSwitchFailureRuntimeStep = () => 'sequence-failed';
  export const buildPromptSequenceSwitchLoadingRuntimeStep = () => 'sequence-loading';
  export const buildPromptSequenceSwitchSuccessRuntimeStep = (loaded) => loaded ? 'sequence-loaded' : 'sequence-empty';
`);
const promptRegistryUrl = dataModule(`
  export const getDefaultPromptProfile = () => 'default';
  export const normalizePromptProfile = (value) => value;
  export const normalizePromptSequence = (value) => value;
  export const planDefaultPromptWorkflowConfigUpdate = () => ({ shouldApply: false, nextPromptOptions: [], nextPromptWorkflows: [] });
`);
const workflowUrl = dataModule(`
  export const createPromptWorkflowRouteHandlers = () => ({
    applyUpdatedDefaultPromptWorkflow: async () => undefined,
    handleUpdatePromptWorkflow: async () => undefined,
  });
`);
const promptRoute = await importTypeScript(resolve(APP_DIR, "src", "lib", "promptRouteHandlers.ts"), {
  "@/lib/documentStatusCopy": documentCopyUrl,
  "@/lib/promptRegistry": promptRegistryUrl,
  "@/lib/promptRouteRequestGeneration": coordinatorUrl,
  "@/lib/promptWorkflowRouteHandlers": workflowUrl,
});

{
  const statusRequests = [];
  const historyRequests = [];
  const snapshotRequests = [];
  const committed = [];
  const runtimeSteps = [];
  let config = { promptProfile: "default", promptSequence: ["base"] };
  const requestRef = { current: 0 };
  const deps = {
    promptRouteRequestRef: requestRef,
    getModelConfig: () => config,
    getDocumentStatus: () => ({ sourcePath: "paper.docx" }),
    getPromptOptions: () => [],
    getPromptWorkflows: () => [],
    setModelConfig: (value) => { config = value; },
    setError: () => undefined,
    setNotice: () => undefined,
    setRuntimeStep: (value) => { runtimeSteps.push(value); },
    clearAutoSnapshotSuppression: () => undefined,
    clearPendingAutoActionForManualContextChange: () => undefined,
    applyErrorRuntimeStep: () => { throw new Error("latest route unexpectedly failed"); },
    refreshDocumentState: (sourcePath, nextConfig, options) => {
      const request = { ...deferred(), sourcePath, nextConfig, options };
      statusRequests.push(request);
      return request.promise.then((status) => {
        if (!options?.shouldCommit || options.shouldCommit()) committed.push(`status:${nextConfig.promptProfile}`);
        return status;
      });
    },
    refreshHistoryList: (options) => {
      const request = { ...deferred(), options };
      historyRequests.push(request);
      return request.promise.then((items) => {
        const isCurrent = () => !options?.shouldCommit || options.shouldCommit();
        if (isCurrent()) committed.push("history");
        return isCurrent()
          ? { status: "current", items, isCurrent }
          : { status: "stale" };
      });
    },
    loadLatestRoundSnapshot: (_status, nextConfig, options) => {
      const request = { ...deferred(), nextConfig, options };
      snapshotRequests.push(request);
      return request.promise.then((snapshot) => {
        if (!options?.shouldCommit || options.shouldCommit()) committed.push(`snapshot:${nextConfig.promptProfile}`);
        return snapshot;
      });
    },
  };
  const crud = { persistActivePromptRoute: () => undefined };
  const handlers = promptRoute.createPromptRouteHandlers(
    deps,
    crud,
    coordinatorModule.createPromptRouteRequestCoordinator(requestRef),
  );
  const firstRoute = handlers.handlePromptProfileChange("first");
  const secondRoute = handlers.handlePromptProfileChange("second");
  assert(statusRequests.length === 2, "rapid route changes must start two independently guarded requests");
  statusRequests[0].resolve({ sourcePath: "paper.docx", promptProfile: "first" });
  await firstRoute;
  assert(historyRequests.length === 0, "a stale status response must not continue into history or snapshot loading");
  statusRequests[1].resolve({ sourcePath: "paper.docx", promptProfile: "second" });
  await waitFor(() => historyRequests.length === 1, "latest route did not continue into history loading");
  historyRequests[0].resolve([{ docId: "latest" }]);
  await waitFor(() => snapshotRequests.length === 1, "latest route did not continue into snapshot loading");
  snapshotRequests[0].resolve({ outputPath: "latest.docx" });
  await secondRoute;
  assert(committed.join("|") === "status:second|history|snapshot:second", "only the latest route may commit document/history/Diff state");
  assert(runtimeSteps.at(-1) === "profile-loaded", "only the latest route may publish success feedback");
}

const errorTextUrl = dataModule("export const stringifyError = (value) => value instanceof Error ? value.message : String(value);");
const diagnosticsUrl = dataModule(`
  export const planPromptPreviewsSuccessNotice = () => 'loaded';
  export const planPromptPreviewsUnavailableMessage = (_status, message) => message;
`);
const deleteRegistryUrl = dataModule(`
  export const mergePromptSaveResultIntoPreviews = (current, result) => {
    const items = current?.items || [];
    const nextItems = items.some((item) => item.id === result.item.id)
      ? items.map((item) => item.id === result.item.id ? result.item : item)
      : [...items, result.item];
    return { ok: true, promptDir: result.promptDir || current?.promptDir || 'prompts', items: nextItems, workflows: result.workflows || current?.workflows || [] };
  };
  export const buildPromptPreviewsAfterDelete = (current, result) => ({ ok: true, promptDir: result.promptDir, items: result.items, workflows: result.workflows || current?.workflows });
  export const getPromptOptionsFromPreviews = (value) => value.items.map(({ id, label }) => ({ id, label }));
  export const getPromptWorkflowsFromPreviews = (value) => value.workflows || [];
  export const normalizePromptProfile = (value, workflows) => workflows.some((item) => item.id === value) ? value : null;
  export const getDefaultPromptProfile = (workflows) => workflows[0]?.id || 'default';
  export const normalizePromptSequence = (sequence, options) => sequence.filter((id) => options.some((item) => item.id === id));
`);
const storageKeysUrl = dataModule("export const ACTIVE_PROMPT_PROFILE_KEY = 'profile'; export const ACTIVE_PROMPT_SEQUENCE_KEY = 'sequence';");
const safeStorageUrl = dataModule("export const writeStorageValue = () => true;");
const promptCrud = await importTypeScript(resolve(APP_DIR, "src", "lib", "promptCrudHandlers.ts"), {
  "@/lib/errorText": errorTextUrl,
  "@/lib/diagnosticsHelpers": diagnosticsUrl,
  "@/lib/promptRegistry": deleteRegistryUrl,
  "@/lib/promptPreviewRequestGeneration": promptPreviewGenerationUrl,
  "@/lib/promptRouteRequestGeneration": coordinatorUrl,
  "@/lib/storageKeys": storageKeysUrl,
  "@/lib/safeStorage": safeStorageUrl,
});
const workflowRoute = await importTypeScript(resolve(APP_DIR, "src", "lib", "promptWorkflowRouteHandlers.ts"), {
  "@/lib/promptRegistry": promptRegistryUrl,
});

{
  const staleRead = deferred();
  const workflowSave = deferred();
  const secondWorkflowSave = deferred();
  const registry = promptPreviewGeneration.createPromptPreviewRequestRegistry();
  let previews = {
    ok: true,
    promptDir: "prompts",
    items: [{ id: "round1", label: "第一轮", content: "one", builtIn: true }],
    workflows: [{ id: "default", label: "旧流程", description: "old", defaultSequence: ["round1"], sequenceLimit: 1, customizable: true }],
  };
  let workflowCalls = 0;
  const deps = {
    promptPreviewRequestRegistry: registry,
    service: {
      getPromptPreviews: () => staleRead.promise,
      updatePromptWorkflow: () => {
        workflowCalls += 1;
        return (workflowCalls === 1 ? workflowSave : secondWorkflowSave).promise;
      },
    },
    getPromptPreviews: () => previews,
    getActivePromptPreviewId: () => "round1",
    getModelConfig: () => ({ promptProfile: "default", promptSequence: ["round1"] }),
    getDocumentStatus: () => null,
    setPromptPreviewBusy: () => undefined,
    setPromptPreviewError: () => undefined,
    setPromptPreviews: (value) => { previews = typeof value === "function" ? value(previews) : value; },
    setActivePromptPreviewId: () => undefined,
    setModelConfig: () => undefined,
    setError: () => undefined,
    setNotice: () => undefined,
    setRuntimeStep: () => undefined,
    requestConfirm: async () => true,
    applyErrorRuntimeStep: () => undefined,
    clearAutoSnapshotSuppression: () => undefined,
    clearPendingAutoActionForManualContextChange: () => undefined,
    refreshDocumentState: async () => ({ sourcePath: "paper.docx" }),
    refreshHistoryList: async () => ({ status: "current", items: [], isCurrent: () => true }),
    loadLatestRoundSnapshot: async () => null,
  };
  const crud = promptCrud.createPromptCrudHandlers(deps);
  const refresh = crud.refreshPromptPreviews({ silent: true });
  const handlers = workflowRoute.createPromptWorkflowRouteHandlers(
    deps,
    crud,
    { begin: () => 1, guard: () => () => true },
    async () => false,
  );
  const save = handlers.handleUpdatePromptWorkflow("default", {
    label: "新流程",
    description: "edited",
    defaultSequence: ["round1"],
    sequenceLimit: 1,
  });
  assert(workflowCalls === 1, "workflow save must call the backend exactly once");
  const blockedSave = handlers.handleUpdatePromptWorkflow("default", {
    label: "重复保存",
    description: "blocked",
    defaultSequence: ["round1"],
    sequenceLimit: 1,
  });
  await blockedSave;
  assert(workflowCalls === 1, "duplicate workflow mutations must be rejected while the first owns the registry");
  workflowSave.resolve({ promptDir: "prompts", workflows: [{ ...previews.workflows[0], label: "新流程", description: "edited" }] });
  await save;
  staleRead.resolve({
    ok: true,
    promptDir: "prompts",
    items: previews.items,
    workflows: [{ ...previews.workflows[0], label: "旧响应" }],
  });
  await refresh;
  assert(previews.workflows[0].label === "新流程", "a stale prompt read must not overwrite a saved workflow");
}

{
  const staleRefresh = deferred();
  const firstSave = deferred();
  const secondSave = deferred();
  const saveRequests = [firstSave, secondSave];
  const registry = promptPreviewGeneration.createPromptPreviewRequestRegistry();
  const busyStates = [];
  let refreshCalls = 0;
  let saveCalls = 0;
  let previews = {
    ok: true,
    promptDir: "prompts",
    items: [{ id: "built-in", label: "Before", content: "before", builtIn: true }],
    workflows: [{ id: "default", defaultSequence: ["built-in"], sequenceLimit: 4 }],
  };
  const handlers = promptCrud.createPromptCrudHandlers({
    promptPreviewRequestRegistry: registry,
    service: {
      getPromptPreviews: () => {
        refreshCalls += 1;
        return staleRefresh.promise;
      },
      savePrompt: () => {
        const request = saveRequests[saveCalls];
        saveCalls += 1;
        return request.promise;
      },
    },
    getPromptPreviews: () => previews,
    getActivePromptPreviewId: () => "built-in",
    getModelConfig: () => ({ promptProfile: "default", promptSequence: ["built-in"] }),
    getDocumentStatus: () => null,
    setPromptPreviewBusy: (value) => { busyStates.push(value); },
    setPromptPreviewError: () => undefined,
    setPromptPreviews: (value) => {
      previews = typeof value === "function" ? value(previews) : value;
    },
    setActivePromptPreviewId: () => undefined,
    setModelConfig: () => undefined,
    setError: () => undefined,
    setNotice: () => undefined,
    clearAutoSnapshotSuppression: () => undefined,
    clearPendingAutoActionForManualContextChange: () => undefined,
    requestConfirm: async () => true,
  });

  const refresh = handlers.refreshPromptPreviews({ silent: true });
  const save = handlers.handleSavePromptDraft("built-in", {
    label: "After",
    content: "after",
    contentDirty: true,
    metaDirty: false,
  });
  assert(refreshCalls === 1 && saveCalls === 1, "a mutation must be allowed to supersede an older prompt read");
  firstSave.resolve({
    ok: true,
    promptDir: "prompts",
    item: { id: "built-in", label: "After", content: "after", builtIn: true },
    workflows: previews.workflows,
  });
  await save;
  staleRefresh.resolve({
    ok: true,
    promptDir: "prompts",
    items: [{ id: "built-in", label: "Stale", content: "stale", builtIn: true }],
    workflows: previews.workflows,
  });
  await refresh;
  assert(previews.items[0].content === "after", "a pre-save refresh must not restore stale prompt content after save");
  assert(busyStates.at(-1) === false, "stale refresh completion must leave prompt busy state cleared after the mutation");

  const activeSave = handlers.handleSavePromptDraft("built-in", {
    label: "Latest",
    content: "latest",
    contentDirty: true,
    metaDirty: false,
  });
  const blockedRefresh = await handlers.refreshPromptPreviews({ silent: true });
  const blockedDuplicateSave = await handlers.handleSavePromptDraft("built-in", {
    label: "Duplicate",
    content: "duplicate",
    contentDirty: true,
    metaDirty: false,
  });
  assert(blockedRefresh === null && blockedDuplicateSave === undefined, "prompt reads and duplicate writes must be rejected while a mutation owns the registry");
  assert(refreshCalls === 1 && saveCalls === 2, "blocked prompt operations must not call the service");
  secondSave.resolve({
    ok: true,
    promptDir: "prompts",
    item: { id: "built-in", label: "Latest", content: "latest", builtIn: true },
    workflows: previews.workflows,
  });
  await activeSave;
}

{
  const previews = {
    ok: true,
    promptDir: "prompts",
    items: [{ id: "built-in", label: "Built in", builtIn: true }, { id: "custom", label: "Custom", builtIn: false }],
    workflows: [{ id: "default", defaultSequence: ["built-in"], sequenceLimit: 4 }],
  };
  let config = { promptProfile: "removed-workflow", promptSequence: ["custom", "built-in"] };
  let appliedPreviews = previews;
  const handlers = promptCrud.createPromptCrudHandlers({
    service: {
      deletePrompt: async () => ({
        ok: true,
        promptDir: "prompts",
        deletedId: "custom",
        items: [previews.items[0]],
        workflows: previews.workflows,
      }),
    },
    getPromptPreviews: () => previews,
    getActivePromptPreviewId: () => "custom",
    getModelConfig: () => config,
    getDocumentStatus: () => null,
    setPromptPreviewBusy: () => undefined,
    setPromptPreviewError: () => undefined,
    setPromptPreviews: (value) => { appliedPreviews = value; },
    setActivePromptPreviewId: () => undefined,
    setModelConfig: (value) => { config = value; },
    setNotice: () => undefined,
    clearAutoSnapshotSuppression: () => undefined,
    clearPendingAutoActionForManualContextChange: () => undefined,
    requestConfirm: async () => true,
  });
  await handlers.handleDeletePrompt("custom");
  assert(appliedPreviews.items.every((item) => item.id !== "custom"), "delete must apply the returned prompt registry immediately");
  assert(config.promptProfile === "default", "delete must normalize a removed prompt workflow");
  assert(config.promptSequence.join(",") === "built-in", "delete must remove deleted prompt ids from the active sequence");
}

const taskState = await importTypeScript(resolve(APP_DIR, "src", "lib", "taskState.ts"));
assert(taskState.isTaskBlocking("picking-document"), "the file chooser phase must block duplicate document changes");

const documentPickSource = readFileSync(resolve(APP_DIR, "src", "lib", "documentPickHandlers.ts"), "utf8");
assert(documentPickSource.includes("{ shouldCommit }"), "document refresh and history loading must receive the upload ticket guard");
assert(documentPickSource.includes("if (!shouldCommit()) return false"), "late upload responses must stop before UI feedback commits");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "prompt preview reads and mutations enforce latest-wins ownership",
    "bootstrap ignores stale or mutation-owned prompt registry data",
    "prompt route generation survives handler recreation",
    "reverse-order prompt route responses only commit the latest status/history/Diff",
    "workflow saves share prompt mutation ownership and reject duplicate writes",
    "prompt deletion immediately normalizes the active registry route",
    "document picking blocks duplicate actions and propagates a late-response guard",
  ],
}, null, 2));
