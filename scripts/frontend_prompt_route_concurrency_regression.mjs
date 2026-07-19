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
        if (!options?.shouldCommit || options.shouldCommit()) committed.push("history");
        return items;
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
  export const mergePromptSaveResultIntoPreviews = (current) => current;
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
  "@/lib/promptRouteRequestGeneration": coordinatorUrl,
  "@/lib/storageKeys": storageKeysUrl,
  "@/lib/safeStorage": safeStorageUrl,
});

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
    "prompt route generation survives handler recreation",
    "reverse-order prompt route responses only commit the latest status/history/Diff",
    "prompt deletion immediately normalizes the active registry route",
    "document picking blocks duplicate actions and propagates a late-response guard",
  ],
}, null, 2));
