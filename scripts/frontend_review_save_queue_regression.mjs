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

async function importTypeScriptModule(relativePath) {
  const source = readFileSync(resolve(APP_DIR, relativePath), "utf-8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

function createFakeTimers() {
  let nextId = 1;
  const callbacks = new Map();
  return {
    setTimer(callback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    clearTimer(id) {
      callbacks.delete(id);
    },
    get size() {
      return callbacks.size;
    },
  };
}

function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

const { createReviewDecisionSaveQueue } = await importTypeScriptModule("src/lib/reviewDecisionSaveQueue.ts");
const {
  isStaleReviewDecisionSaveError,
  isTerminalReviewDecisionSaveError,
} = await importTypeScriptModule("src/lib/reviewDecisionSaveConflict.ts");

async function testPerDocumentDebounce() {
  const timers = createFakeTimers();
  const writes = [];
  const queue = createReviewDecisionSaveQueue({
    save: async (path, value) => writes.push([path, value]),
    setTimer: (callback) => timers.setTimer(callback),
    clearTimer: (id) => timers.clearTimer(id),
  });
  queue.schedule("round-a.json", { chunk: "source" });
  queue.schedule("round-b.json", { chunk: "rewrite_confirmed" });
  queue.schedule("round-a.json", { chunk: "source_confirmed" });
  assert(timers.size === 2, "each output document must retain its own debounce timer");
  await queue.flushAll();
  assert(writes.length === 2, "flushAll must persist every pending document");
  assert(writes.some(([path, value]) => path === "round-a.json" && value.chunk === "source_confirmed"), "the newest snapshot must win within one document");
  assert(writes.some(([path]) => path === "round-b.json"), "switching documents must not discard the previous document save");
  assert(queue.pendingCount() === 0, "successful writes must leave no pending snapshot");
}

async function testSerializationAndStaleFailureSuppression() {
  const first = deferred();
  const second = deferred();
  const starts = [];
  const errors = [];
  const queue = createReviewDecisionSaveQueue({
    save: async (_path, value) => {
      starts.push(value.version);
      return value.version === 1 ? first.promise : second.promise;
    },
    onError: (error) => errors.push(String(error)),
    retryDelaysMs: [1],
  });

  queue.schedule("same.json", { version: 1 });
  const firstFlush = queue.flush("same.json");
  await Promise.resolve();
  queue.schedule("same.json", { version: 2 });
  const secondFlush = queue.flush("same.json");
  await Promise.resolve();
  assert(starts.join(",") === "1", "a second write for the same document must wait for the first");
  first.reject(new Error("old request failed"));
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert(starts.join(",") === "1,2", "the newest snapshot must run after the older request settles");
  second.resolve();
  await Promise.all([firstFlush, secondFlush]);
  assert(errors.length === 1, "save errors must remain observable");
  assert(queue.pendingCount() === 0, "an obsolete failed snapshot must never be retried over a newer success");
}

async function testLatestFailureCanRetry() {
  let attempts = 0;
  const errors = [];
  const timers = createFakeTimers();
  const queue = createReviewDecisionSaveQueue({
    save: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("temporary outage");
    },
    onError: (error) => errors.push(String(error)),
    retryDelaysMs: [25],
    setTimer: (callback) => timers.setTimer(callback),
    clearTimer: (id) => timers.clearTimer(id),
  });
  queue.schedule("retry.json", { version: 1 });
  await queue.flush("retry.json");
  assert(queue.pendingCount() === 1 && timers.size === 1, "the latest failed snapshot must remain pending for retry");
  await queue.flush("retry.json");
  assert(attempts === 2 && errors.length === 1, "a transient failure must be recoverable without another user edit");
  assert(queue.pendingCount() === 0 && timers.size === 0, "a successful retry must clear pending state and its timer");
}

async function testSuccessfulRevisionChainsIntoAlreadyQueuedSnapshot() {
  const first = deferred();
  let currentRevision = "revision-0";
  const expectedRevisions = [];
  const queue = createReviewDecisionSaveQueue({
    save: async (_path, value) => {
      expectedRevisions.push([value.version, currentRevision]);
      if (value.version === 1) await first.promise;
      currentRevision = `revision-${value.version}`;
    },
  });
  queue.schedule("same.json", { version: 1 });
  const firstFlush = queue.flush("same.json");
  await Promise.resolve();
  queue.schedule("same.json", { version: 2 });
  const secondFlush = queue.flush("same.json");
  first.resolve();
  await Promise.all([firstFlush, secondFlush]);
  assert(
    JSON.stringify(expectedRevisions) === JSON.stringify([[1, "revision-0"], [2, "revision-1"]]),
    "an already queued save must use the predecessor's successful response revision when it executes",
  );
}

async function testTerminalConflictInvalidatesQueuedGeneration() {
  const first = deferred();
  const starts = [];
  const queue = createReviewDecisionSaveQueue({
    save: async (_path, value) => {
      starts.push(value.version);
      if (value.version === 1) await first.promise;
    },
    isTerminalError: (error) => isStaleReviewDecisionSaveError(error),
  });
  queue.schedule("same.json", { version: 1 });
  const firstFlush = queue.flush("same.json");
  await Promise.resolve();
  queue.schedule("same.json", { version: 2 });
  const secondFlush = queue.flush("same.json");
  const conflict = new Error("stale");
  conflict.status = 409;
  conflict.payload = { code: "stale_review_decisions" };
  first.reject(conflict);
  await Promise.all([firstFlush, secondFlush]);
  assert(starts.join(",") === "1", "a CAS conflict must invalidate every chained snapshot from the old generation");
  assert(queue.pendingCount("same.json") === 0, "a CAS conflict must leave no retryable stale snapshot");
  const missingRevision = new Error("missing precondition");
  missingRevision.status = 428;
  missingRevision.payload = { code: "review_revision_required" };
  const inconsistent = new Error("broken linkage");
  inconsistent.status = 409;
  inconsistent.payload = { code: "review_state_inconsistent" };
  assert(isTerminalReviewDecisionSaveError(missingRevision), "HTTP 428 review precondition failure must be terminal");
  assert(isTerminalReviewDecisionSaveError(inconsistent), "review linkage inconsistency must be terminal");
}

async function testPerDocumentRevisionSurvivesVisibleDocumentSwitch() {
  const revisionByOutput = new Map([
    ["round-a.json", "revision-a"],
    ["round-b.json", "revision-b"],
  ]);
  const writes = [];
  const queue = createReviewDecisionSaveQueue({
    save: async (path, value) => writes.push([path, revisionByOutput.get(path), value]),
  });
  queue.schedule("round-a.json", { choice: "rewrite_confirmed" });
  queue.schedule("round-b.json", { choice: "source_confirmed" });
  await queue.flushAll();
  assert(writes.some(([path, revision]) => path === "round-a.json" && revision === "revision-a"), "queued A must retain A's token after switching to B");
  assert(writes.some(([path, revision]) => path === "round-b.json" && revision === "revision-b"), "B must keep an independent revision token");
}

function testUnloadWiring() {
  const appSource = readFileSync(resolve(APP_DIR, "src/App.tsx"), "utf-8");
  const apiSource = readFileSync(resolve(APP_DIR, "src/lib/webServiceRoundIoApi.ts"), "utf-8");
  const reviewHandlersSource = readFileSync(resolve(APP_DIR, "src/lib/appReviewRefreshHandlers.ts"), "utf-8");
  const exportSource = readFileSync(resolve(APP_DIR, "src/lib/exportExecuteHandlers.ts"), "utf-8");
  const batchAttachSource = readFileSync(resolve(APP_DIR, "src/lib/batchRerunAttachHandlers.ts"), "utf-8");
  const batchWaitSource = readFileSync(resolve(APP_DIR, "src/lib/batchRerunWaitHandlers.ts"), "utf-8");
  const batchMaterializeSource = readFileSync(resolve(APP_DIR, "src/lib/batchRerunMaterializeHandlers.ts"), "utf-8");
  const rerunStart = appSource.indexOf("async function handleRerunChunk");
  const rerunEnd = appSource.indexOf("async function handleExecuteRateAuditStrategy", rerunStart);
  const rerunSource = appSource.slice(rerunStart, rerunEnd);
  assert(appSource.includes('window.addEventListener("pagehide", flushReviewDecisions)'), "pagehide must flush debounced review decisions");
  assert(appSource.includes("reviewSaveQueueRef.current?.flushAll()"), "component teardown must flush every document queue");
  assert(rerunSource.includes("flushReviewDecisionsBeforeRerun(outputPath)"), "single reruns must fail closed while review saves are unresolved");
  assert(rerunSource.includes("buildSingleChunkRerunIdentity("), "single reruns must validate source/output/document/round identity before launch");
  assert(rerunSource.includes("compareDataMatchesDocument(visibleCompare, visibleDocument, promptOptions, promptWorkflows)"), "single reruns must reject stale compares from another document or prompt route");
  assert(rerunSource.includes("runBatchRerunTask("), "single reruns must launch the resumable background task after review and identity gates");
  assert(
    rerunSource.indexOf("flushReviewDecisionsBeforeRerun(outputPath)") < rerunSource.indexOf("buildSingleChunkRerunIdentity(")
      && rerunSource.indexOf("buildSingleChunkRerunIdentity(") < rerunSource.indexOf("runBatchRerunTask("),
    "single reruns must flush review saves and validate identity before the backend task starts",
  );
  assert(!rerunSource.includes("service.rerunChunk"), "product UI must not wait on the synchronous rerun HTTP request");
  assert(!appSource.includes("loadIdentityBoundLegacyRerunRefresh({"), "single reruns must not keep the obsolete synchronous-failure refresh branch");
  assert(batchAttachSource.includes("startBatchRerun(outputPath, targets"), "single reruns must receive a background run id");
  assert(batchAttachSource.includes("beginBatchRerunSession({"), "single rerun run ids must be retained for cancellation and refresh recovery");
  assert(batchWaitSource.includes("getBatchRerunStatus(runId)"), "single reruns must poll background task status");
  assert(batchMaterializeSource.includes("service.readRoundSnapshot(result.outputPath"), "single rerun completion must reload one revision-consistent round snapshot");
  assert(batchMaterializeSource.includes("guardRoundArtifactSnapshotCommit("), "single rerun completion must retain the snapshot CAS/identity commit guard");
  assert(batchMaterializeSource.includes("expectedCompareRevision: result.compare?.compareRevision || result.compare?.updatedAt"), "single rerun completion must bind snapshot application to the task's compare revision");
  assert(apiSource.includes('requestJson<RerunChunkResult>("/api/rerun-chunk"'), "the synchronous rerun endpoint must remain available to compatibility callers");
  assert(!appSource.includes("service.readCompare(outputPath)"), "single rerun failures must not reconstruct state from an independent compare read");
  assert(!appSource.includes("service.loadReviewDecisions(outputPath)"), "single rerun failures must not reconstruct state from an independent review read");
  assert(apiSource.includes("keepalive: true"), "review writes flushed during page teardown must use a keepalive request");
  assert(apiSource.includes("expectedCompareRevision"), "review POSTs must carry a compare CAS precondition");
  assert(reviewHandlersSource.includes("saved.currentCompareRevision || saved.compareRevision || saved.updatedAt"), "successful saves must chain the returned revision token");
  assert(reviewHandlersSource.includes("loadRevisionBoundReviewSnapshot"), "CAS conflicts must refresh revision-linked compare/review state");
  assert(reviewHandlersSource.includes("service.readRoundSnapshot(outputPath"), "CAS conflicts must read compare, review and effective preview atomically");
  assert(exportSource.includes("await deps.flushReviewDecisionSaves(outputPath)"), "export must flush review decisions before reading export state");
  assert(
    exportSource.indexOf("await deps.flushReviewDecisionSaves(outputPath)") < exportSource.indexOf("deps.beginTask"),
    "review flush must finish before an export task or download request begins",
  );
  assert(
    exportSource.includes("if (!(await deps.flushReviewDecisionSaves(outputPath)))")
      && exportSource.indexOf("await deps.flushReviewDecisionSaves(outputPath)") < exportSource.indexOf("deps.service.exportRound"),
    "a failed/conflicted flush must return before the backend export call",
  );
}

await testPerDocumentDebounce();
await testSerializationAndStaleFailureSuppression();
await testLatestFailureCanRetry();
await testSuccessfulRevisionChainsIntoAlreadyQueuedSnapshot();
await testTerminalConflictInvalidatesQueuedGeneration();
await testPerDocumentRevisionSurvivesVisibleDocumentSwitch();
testUnloadWiring();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "review decisions debounce independently per output document",
    "same-document writes are serialized and stale failures cannot overwrite newer decisions",
    "the latest failed snapshot remains retryable",
    "successful CAS responses chain into already queued saves",
    "stale CAS conflicts invalidate their entire queued generation",
    "per-document revision tokens survive visible document switches",
    "single reruns flush review saves and validate source/output/document/round identity before launch",
    "single reruns use resumable run-id polling while keeping snapshot identity and CAS commit guards",
    "the synchronous rerun endpoint remains available only for compatibility callers",
    "page teardown flushes pending decisions with a keepalive request",
  ],
}, null, 2));
