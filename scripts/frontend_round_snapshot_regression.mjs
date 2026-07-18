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

function readAppSource(relativePath) {
  return readFileSync(resolve(APP_DIR, relativePath), "utf-8");
}

async function importStandaloneTypeScriptModule(relativePath) {
  const source = readAppSource(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

function clone(value) {
  return structuredClone(value);
}

function createSnapshot(overrides = {}) {
  const outputPath = "/root/fyadr/finish/intermediate/doc-a-round1.txt";
  const compareRevision = "2026-07-18T06:30:00.000000Z";
  const text = "有效改写文本";
  return {
    version: 1,
    materializationSource: "review_materialized_compare",
    outputPath,
    docId: "doc-a",
    round: 1,
    compareRevision,
    reviewRevision: "a".repeat(64),
    contentRevision: "b".repeat(64),
    artifactSnapshotDigest: "c".repeat(64),
    compareSha256: "2".repeat(64),
    reviewSha256: "a".repeat(64),
    effectiveTextSha256: "d".repeat(64),
    outputSha256: "e".repeat(64),
    bodyMapSha256: null,
    manifestSha256: "f".repeat(64),
    rawOutputMatchesEffective: false,
    bodyMapMatchesEffective: null,
    compare: {
      version: 1,
      docId: "doc-a",
      round: 1,
      promptProfile: "default",
      inputPath: "/root/fyadr/finish/intermediate/doc-a-round0.txt",
      outputPath,
      manifestPath: "/root/fyadr/finish/intermediate/doc-a.manifest.json",
      paragraphCount: 1,
      chunkCount: 1,
      updatedAt: compareRevision,
      reviewUpdatedAt: "review-r1",
      compareRevision,
      chunks: [{
        chunkId: "p0001-c01",
        paragraphIndex: 0,
        chunkIndex: 0,
        inputText: "原始文本",
        outputText: text,
      }],
    },
    review: {
      path: "/root/fyadr/finish/intermediate/doc-a-round1.review.json",
      outputPath,
      docId: "doc-a",
      round: 1,
      decisions: { "p0001-c01": "rewrite_confirmed" },
      updatedAt: "review-r1",
      compareRevision,
      currentCompareRevision: compareRevision,
      // A strategy commit may advance the current compare while preserving a
      // still-linked review sidecar from an older compare generation.
      reviewBaseCompareRevision: "2026-07-18T06:20:00.000000Z",
      reviewLinkReady: true,
      reviewLinkStatus: "linked",
    },
    effectivePreview: {
      path: outputPath,
      text,
      truncated: false,
      totalChars: text.length,
      previewChars: text.length,
    },
    ...overrides,
  };
}

function expectValidationFailure(validateRoundArtifactSnapshot, snapshot, field) {
  let thrown = null;
  try {
    validateRoundArtifactSnapshot(snapshot);
  } catch (error) {
    thrown = error;
  }
  assert(thrown?.code === "invalid_round_artifact_snapshot", `${field} drift must fail with the snapshot validation code`);
  assert(thrown?.field === field, `${field} drift must identify its exact field; got ${thrown?.field}`);
}

function testStaticContract() {
  const typesSource = readAppSource("src/types/app.ts");
  const appSource = readAppSource("src/App.tsx");
  const appServiceSource = readAppSource("src/lib/appService.ts");
  const roundIoSource = readAppSource("src/lib/webServiceRoundIoApi.ts");
  const snapshotSource = readAppSource("src/lib/roundArtifactSnapshot.ts");
  const sessionStartSource = readAppSource("src/lib/runRoundSessionStartHandlers.ts");
  const runRoundApiSource = readAppSource("src/lib/webServiceRunRoundApi.ts");
  const runRoundHandlersSource = readAppSource("src/lib/runRoundHandlers.ts");
  const runRoundFinishSource = readAppSource("src/lib/runRoundFinishHandlers.ts");
  const batchHandlersSource = readAppSource("src/lib/batchRerunHandlers.ts");
  const batchCoreSource = readAppSource("src/lib/batchRerunCoreHandlers.ts");
  const batchActionSource = readAppSource("src/lib/batchRerunActionHandlers.ts");

  for (const field of [
    "RoundArtifactSnapshot",
    "effectivePreview",
    "reviewRevision",
    "contentRevision",
    "artifactSnapshotDigest",
    "compareSha256",
    "reviewSha256",
    "rawOutputMatchesEffective",
    "bodyMapMatchesEffective",
  ]) {
    assert(typesSource.includes(field), `frontend snapshot types must expose ${field}`);
  }
  assert(appServiceSource.includes("readRoundSnapshot("), "AppService must expose readRoundSnapshot");
  assert(roundIoSource.includes("/api/round-snapshot?"), "web service must call the atomic round-snapshot endpoint");
  assert(roundIoSource.includes('cache: "no-store"'), "round snapshots must bypass browser HTTP caches");
  assert(roundIoSource.includes("signal: options.signal"), "round snapshot reads must forward AbortSignal");
  assert(roundIoSource.includes("validateRoundArtifactSnapshot(payload"), "HTTP payloads must be validated before returning");
  const methodStart = roundIoSource.indexOf("async readRoundSnapshot(");
  const methodEnd = roundIoSource.indexOf("async readCompare(", methodStart);
  const methodSource = roundIoSource.slice(methodStart, methodEnd);
  assert(!methodSource.includes("readOutput("), "round snapshot reads must not fall back to raw output");
  assert(!methodSource.includes("readCompare("), "round snapshot reads must not rebuild a snapshot from compare");
  assert(!methodSource.includes("loadReviewDecisions("), "round snapshot reads must not rebuild a snapshot from review state");
  assert(snapshotSource.includes("requestIntent.epoch === currentIntent.epoch"), "commit guards must bind every response to its request epoch");
  for (const path of [
    "src/lib/runRoundSnapshotApplyHandlers.ts",
    "src/lib/historyDocumentLoadHandlers.ts",
    "src/lib/appReviewRefreshHandlers.ts",
    "src/lib/batchRerunMaterializeHandlers.ts",
  ]) {
    const source = readAppSource(path);
    assert(source.includes("readRoundSnapshot("), `${path} must consume the atomic round snapshot API`);
    assert(!source.includes("service.readOutput("), `${path} must not mix a raw output generation into UI state`);
    assert(!source.includes("service.readCompare("), `${path} must not read compare independently`);
    assert(!source.includes("service.loadReviewDecisions("), `${path} must not read review decisions independently`);
  }
  assert(
    appSource.includes("createRunRoundHandlers({")
      && appSource.includes("fetchCompleteRoundSnapshot")
      && appSource.includes("loadLatestRoundSnapshot"),
    "App must consume the composed atomic round-snapshot handlers",
  );
  assert(
    runRoundHandlersSource.includes("createRunRoundFinishHandlers")
      && runRoundFinishSource.includes("createRunRoundSnapshotHandlers"),
    "the run handler composition must retain the atomic snapshot implementation",
  );
  assert(
    batchHandlersSource.includes("createBatchRerunCoreHandlers")
      && batchCoreSource.includes("createBatchRerunMaterializeHandlers")
      && batchActionSource.includes("createBatchRerunAttachHandlers"),
    "batch actions must reach the atomic snapshot materializer through the composed core",
  );
  for (const [label, source] of [
    ["src/App.tsx", appSource],
    ["src/lib/batchRerunActionHandlers.ts", batchActionSource],
  ]) {
    assert(!source.includes("service.readOutput("), `${label} must not mix a raw output generation into UI state`);
    assert(!source.includes("service.readCompare("), `${label} must not read compare independently`);
    assert(!source.includes("service.loadReviewDecisions("), `${label} must not read review decisions independently`);
  }
  assert(sessionStartSource.includes("startRevisionBoundRound({"), "every new round task must pass through the parent revision gate");
  assert(sessionStartSource.includes("flushReviewDecisionSaves"), "downstream rounds must flush parent review decisions before snapshotting");
  assert(sessionStartSource.includes("beginRoundArtifactSnapshotIntent"), "parent snapshot reads must register an epoch before I/O");
  for (const field of [
    "expectedPreviousCompareRevision",
    "expectedPreviousReviewRevision",
    "expectedPreviousContentRevision",
    "expectedPreviousArtifactSnapshotDigest",
    "expectedPreviousEffectiveTextSha256",
  ]) {
    assert(typesSource.includes(field), `run-round requests must type ${field}`);
  }
  assert(runRoundApiSource.includes("...previousRoundBinding"), "run-round requests must submit the complete parent generation binding");
  assert(!runRoundApiSource.includes("expectedPreviousCompareRevision: \"\""), "round 1 must omit, rather than forge, parent revision fields");
}

async function testValidationAndCanonicalPreview(snapshotModule) {
  const {
    selectRoundArtifactEffectivePreview,
    validateRoundArtifactSnapshot,
  } = snapshotModule;
  const valid = createSnapshot();
  const parsed = validateRoundArtifactSnapshot(valid, {
    expectedOutputPath: "finish/intermediate/doc-a-round1.txt",
  });
  assert(parsed === valid, "a valid response should retain the server payload without lossy rebuilding");
  assert(parsed.review.reviewBaseCompareRevision !== parsed.compareRevision, "an older review base remains legal after a strategy compare commit");

  const preview = selectRoundArtifactEffectivePreview(parsed);
  assert(parsed.rawOutputMatchesEffective === false, "the fixture must exercise a stale raw artifact");
  assert(preview === parsed.effectivePreview, "stale raw artifacts must still select the canonical effective preview");
  assert(preview.text === "有效改写文本", "canonical review materialization must remain visible");

  const truncated = clone(valid);
  truncated.effectivePreview = {
    ...truncated.effectivePreview,
    text: "有\n\n[预览已截断，导出文件可查看完整内容]",
    truncated: true,
    totalChars: valid.effectivePreview.totalChars,
    previewChars: 24,
  };
  validateRoundArtifactSnapshot(truncated);

  const withoutReviewSidecar = clone(valid);
  withoutReviewSidecar.compare.reviewUpdatedAt = null;
  withoutReviewSidecar.review = {
    ...withoutReviewSidecar.review,
    decisions: {},
    updatedAt: "",
    reviewBaseCompareRevision: "",
    reviewLinkStatus: "none",
  };
  withoutReviewSidecar.reviewSha256 = null;
  validateRoundArtifactSnapshot(withoutReviewSidecar);

  const wrongExpectedPath = clone(valid);
  let wrongRequestError = null;
  try {
    validateRoundArtifactSnapshot(wrongExpectedPath, { expectedOutputPath: "finish/another.txt" });
  } catch (error) {
    wrongRequestError = error;
  }
  assert(wrongRequestError?.field === "outputPath", "a response for another requested output must fail closed");

  const comparePathDrift = clone(valid);
  comparePathDrift.compare.outputPath = "/tmp/unrelated.txt";
  expectValidationFailure(validateRoundArtifactSnapshot, comparePathDrift, "compare.outputPath");

  const compareDocDrift = clone(valid);
  compareDocDrift.compare.docId = "doc-b";
  expectValidationFailure(validateRoundArtifactSnapshot, compareDocDrift, "compare.docId");

  const reviewRoundDrift = clone(valid);
  reviewRoundDrift.review.round = 2;
  expectValidationFailure(validateRoundArtifactSnapshot, reviewRoundDrift, "review.round");

  const compareRevisionDrift = clone(valid);
  compareRevisionDrift.compare.compareRevision = "another-revision";
  expectValidationFailure(validateRoundArtifactSnapshot, compareRevisionDrift, "compare.compareRevision");

  const compareUpdatedAtDrift = clone(valid);
  compareUpdatedAtDrift.compare.updatedAt = "another-revision";
  expectValidationFailure(validateRoundArtifactSnapshot, compareUpdatedAtDrift, "compare.updatedAt");

  const reviewRevisionDrift = clone(valid);
  reviewRevisionDrift.review.currentCompareRevision = "another-revision";
  expectValidationFailure(validateRoundArtifactSnapshot, reviewRevisionDrift, "review.currentCompareRevision");

  const brokenReviewLink = clone(valid);
  brokenReviewLink.review.reviewLinkReady = false;
  expectValidationFailure(validateRoundArtifactSnapshot, brokenReviewLink, "review.reviewLinkReady");

  const mismatchedReviewLink = clone(valid);
  mismatchedReviewLink.compare.reviewUpdatedAt = "review-r2";
  expectValidationFailure(validateRoundArtifactSnapshot, mismatchedReviewLink, "review.updatedAt");

  const malformedContentRevision = clone(valid);
  malformedContentRevision.contentRevision = "not-a-digest";
  expectValidationFailure(validateRoundArtifactSnapshot, malformedContentRevision, "contentRevision");

  const malformedSnapshotDigest = clone(valid);
  malformedSnapshotDigest.artifactSnapshotDigest = "A".repeat(64);
  expectValidationFailure(validateRoundArtifactSnapshot, malformedSnapshotDigest, "artifactSnapshotDigest");

  const mismatchedReviewDigest = clone(valid);
  mismatchedReviewDigest.reviewSha256 = "3".repeat(64);
  expectValidationFailure(validateRoundArtifactSnapshot, mismatchedReviewDigest, "reviewRevision");

  const foreignReviewChunk = clone(valid);
  foreignReviewChunk.review.decisions = { "p9999-c99": "rewrite_confirmed" };
  expectValidationFailure(validateRoundArtifactSnapshot, foreignReviewChunk, "review.decisions.p9999-c99");
}

async function testLegacyCompareRevision(snapshotModule) {
  const { validateRoundArtifactSnapshot } = snapshotModule;
  const legacyRevision = `sha256:${"1".repeat(64)}`;
  const legacy = createSnapshot({
    compareRevision: legacyRevision,
    compareSha256: "1".repeat(64),
  });
  delete legacy.compare.updatedAt;
  legacy.compare.compareRevision = legacyRevision;
  legacy.review.compareRevision = legacyRevision;
  legacy.review.currentCompareRevision = legacyRevision;
  const parsed = validateRoundArtifactSnapshot(legacy);
  assert(parsed.compareRevision === legacyRevision, "legacy compare files must retain a stable sha256: CAS revision");

  const malformedLegacy = clone(legacy);
  malformedLegacy.compareRevision = "sha256:short";
  expectValidationFailure(validateRoundArtifactSnapshot, malformedLegacy, "compareRevision");

  const mismatchedLegacySha = clone(legacy);
  mismatchedLegacySha.compareSha256 = "2".repeat(64);
  expectValidationFailure(validateRoundArtifactSnapshot, mismatchedLegacySha, "compareSha256");
}

function deferred() {
  let resolvePromise;
  const promise = new Promise((resolveValue) => {
    resolvePromise = resolveValue;
  });
  return { promise, resolve: resolvePromise };
}

async function testIntentEpochGuards(snapshotModule) {
  const {
    guardRoundArtifactSnapshotCommit,
    nextRoundArtifactSnapshotIntent,
    validateRoundArtifactSnapshot,
  } = snapshotModule;
  const snapshotA = validateRoundArtifactSnapshot(createSnapshot());
  const identityA = { outputPath: snapshotA.outputPath, docId: snapshotA.docId, round: snapshotA.round };
  const identityB = { outputPath: "/root/fyadr/finish/intermediate/doc-b-round1.txt", docId: "doc-b", round: 1 };

  let currentIntent = nextRoundArtifactSnapshotIntent(null, identityA);
  const requestA = currentIntent;
  const pendingA = deferred();
  const guardedA = pendingA.promise.then((payload) => guardRoundArtifactSnapshotCommit(
    requestA,
    currentIntent,
    validateRoundArtifactSnapshot(payload),
  ));
  currentIntent = nextRoundArtifactSnapshotIntent(currentIntent, identityB);
  pendingA.resolve(createSnapshot());
  assert((await guardedA).status === "stale", "a deferred A response must not commit after the visible intent switches to B");

  currentIntent = nextRoundArtifactSnapshotIntent(currentIntent, identityA);
  const olderSameIdentityRequest = currentIntent;
  const newerSameIdentityRequest = nextRoundArtifactSnapshotIntent(currentIntent, identityA);
  currentIntent = newerSameIdentityRequest;
  assert(
    guardRoundArtifactSnapshotCommit(olderSameIdentityRequest, currentIntent, snapshotA).status === "stale",
    "an older response for the same identity must lose to the newer epoch",
  );
  assert(
    guardRoundArtifactSnapshotCommit(newerSameIdentityRequest, currentIntent, snapshotA).status === "ready",
    "only the latest epoch for the matching identity may commit",
  );
}

async function expectRejected(promise, message) {
  let rejected = false;
  try {
    await promise;
  } catch {
    rejected = true;
  }
  assert(rejected, message);
}

async function testRoundInputRevisionGate(gateModule) {
  const { startRevisionBoundRound } = gateModule;
  const parentGeneration = {
    compareRevision: "parent-r1",
    reviewRevision: "1".repeat(64),
    contentRevision: "2".repeat(64),
    artifactSnapshotDigest: "3".repeat(64),
    effectiveTextSha256: "4".repeat(64),
  };
  const readyParent = (overrides = {}) => ({ status: "ready", ...parentGeneration, ...overrides });
  const baseLaunch = {
    sourcePath: "/origin/paper-a.docx",
    docId: "doc-a",
    nextRound: 2,
    parentOutputPath: "/finish/doc-a-round1.txt",
  };

  const callOrder = [];
  let current = true;
  const goodToken = await startRevisionBoundRound({
    launch: baseLaunch,
    isCurrent: () => current,
    flushReviewDecisionSaves: async (path) => {
      callOrder.push(["flush", path]);
      return true;
    },
    loadParentSnapshot: async (path, round) => {
      callOrder.push(["snapshot", path, round]);
      return readyParent();
    },
    startRunRound: async (binding) => {
      callOrder.push(["start", binding]);
      return "run-1";
    },
    cancelRunRound: async () => undefined,
  });
  assert(goodToken === "run-1", "a current downstream launch should return its run token");
  assert(
    JSON.stringify(callOrder) === JSON.stringify([
      ["flush", baseLaunch.parentOutputPath],
      ["snapshot", baseLaunch.parentOutputPath, 1],
      ["start", {
        expectedPreviousCompareRevision: parentGeneration.compareRevision,
        expectedPreviousReviewRevision: parentGeneration.reviewRevision,
        expectedPreviousContentRevision: parentGeneration.contentRevision,
        expectedPreviousArtifactSnapshotDigest: parentGeneration.artifactSnapshotDigest,
        expectedPreviousEffectiveTextSha256: parentGeneration.effectiveTextSha256,
      }],
    ]),
    "a downstream launch must flush, snapshot and only then POST all five exact parent-generation fields",
  );

  let missingRevisionStarts = 0;
  await expectRejected(startRevisionBoundRound({
    launch: baseLaunch,
    isCurrent: () => true,
    flushReviewDecisionSaves: async () => true,
    loadParentSnapshot: async () => readyParent({ compareRevision: "" }),
    startRunRound: async () => {
      missingRevisionStarts += 1;
      return "must-not-start";
    },
    cancelRunRound: async () => undefined,
  }), "a missing parent revision must reject the launch");
  assert(missingRevisionStarts === 0, "a missing parent revision must make zero start-run calls");

  const slowParent = deferred();
  let staleStarts = 0;
  current = true;
  const staleLaunch = startRevisionBoundRound({
    launch: baseLaunch,
    isCurrent: () => current,
    flushReviewDecisionSaves: async () => true,
    loadParentSnapshot: () => slowParent.promise,
    startRunRound: async () => {
      staleStarts += 1;
      return "must-not-start";
    },
    cancelRunRound: async () => undefined,
  });
  await Promise.resolve();
  current = false;
  slowParent.resolve(readyParent({ compareRevision: "paper-a-r1" }));
  await expectRejected(staleLaunch, "a slow paper-A snapshot must reject after switching to paper B");
  assert(staleStarts === 0, "a slow stale paper-A snapshot must never start a model task");

  let roundOneFlushes = 0;
  let roundOneReads = 0;
  const roundOneStartArgs = [];
  current = true;
  await startRevisionBoundRound({
    launch: { ...baseLaunch, nextRound: 1, parentOutputPath: "" },
    isCurrent: () => current,
    flushReviewDecisionSaves: async () => {
      roundOneFlushes += 1;
      return true;
    },
    loadParentSnapshot: async () => {
      roundOneReads += 1;
      return { status: "stale" };
    },
    startRunRound: async (revision) => {
      roundOneStartArgs.push(revision);
      return "run-round-1";
    },
    cancelRunRound: async () => undefined,
  });
  assert(roundOneFlushes === 0 && roundOneReads === 0, "round 1 must not fabricate or read a parent snapshot");
  assert(roundOneStartArgs.length === 1 && roundOneStartArgs[0] === undefined, "round 1 must omit the parent revision token");

  const delayedPost = deferred();
  const canceled = [];
  let postStarted = false;
  current = true;
  const switchedDuringPost = startRevisionBoundRound({
    launch: baseLaunch,
    isCurrent: () => current,
    flushReviewDecisionSaves: async () => true,
    loadParentSnapshot: async () => readyParent({ compareRevision: "parent-r2" }),
    startRunRound: () => {
      postStarted = true;
      return delayedPost.promise;
    },
    cancelRunRound: async (token) => { canceled.push(token); },
  });
  while (!postStarted) await Promise.resolve();
  current = false;
  delayedPost.resolve("run-stale-after-post");
  await expectRejected(switchedDuringPost, "a document switch during POST must detach the returned task");
  assert(canceled.includes("run-stale-after-post"), "a task returned after switching documents must be canceled");

  for (const [field, replacement] of [
    ["compareRevision", "parent-r2"],
    ["reviewRevision", "5".repeat(64)],
    ["contentRevision", "6".repeat(64)],
    ["artifactSnapshotDigest", "7".repeat(64)],
    ["effectiveTextSha256", "8".repeat(64)],
  ]) {
    let starts = 0;
    await expectRejected(startRevisionBoundRound({
      launch: baseLaunch,
      approvedParentGeneration: parentGeneration,
      isCurrent: () => true,
      flushReviewDecisionSaves: async () => true,
      loadParentSnapshot: async () => readyParent({ [field]: replacement }),
      startRunRound: async () => {
        starts += 1;
        return "must-not-start";
      },
      cancelRunRound: async () => undefined,
    }), `${field} drift must invalidate the approved parent generation`);
    assert(starts === 0, `${field} drift must make zero start-run POSTs`);
  }
}

testStaticContract();
const snapshotModule = await importStandaloneTypeScriptModule("src/lib/roundArtifactSnapshot.ts");
const gateModule = await importStandaloneTypeScriptModule("src/lib/roundInputRevisionGate.ts");
await testValidationAndCanonicalPreview(snapshotModule);
await testLegacyCompareRevision(snapshotModule);
await testIntentEpochGuards(snapshotModule);
await testRoundInputRevisionGate(gateModule);

console.log(JSON.stringify({
  ok: true,
  checks: [
    "AppService reads the atomic no-store endpoint without a legacy three-request fallback",
    "untrusted snapshot responses validate output/doc/round/revision/linkage/digest chains",
    "workspace-relative and canonical output paths are compared safely",
    "legacy sha256 compare revisions remain valid CAS tokens",
    "a deferred document A response is rejected after switching to B",
    "reverse-order responses for one identity are gated by intent epoch",
    "stale raw artifacts never replace the canonical effective preview",
    "round > 1 launches flush review state and bind all five parent-generation fields",
    "any missing/stale approved parent revision or hash makes zero model-start calls",
    "round 1 omits parent revision binding and stale in-flight POSTs are canceled",
  ],
}, null, 2));
