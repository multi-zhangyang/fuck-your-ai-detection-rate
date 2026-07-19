#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function importTypeScript(relativePath) {
  return import(pathToFileURL(resolve(ROOT_DIR, relativePath)).href);
}

function provider(id, patch = {}) {
  return {
    id,
    name: `Provider ${id}`,
    enabled: true,
    baseUrl: `https://example.com/v1/${id}`,
    apiKey: `key-${id}`,
    apiType: "chat_completions",
    defaultModel: "",
    models: [],
    ...patch,
  };
}

function config(modelProviders, patch = {}) {
  return {
    baseUrl: "https://example.com/v1/default",
    apiKey: "default-key",
    model: "default-model",
    apiType: "chat_completions",
    streaming: true,
    temperature: 0.3,
    promptProfile: "default",
    promptSequence: ["rewrite"],
    requestTimeoutSeconds: 120,
    maxRetries: 2,
    rewriteConcurrency: 4,
    modelProviders,
    roundModels: {},
    ...patch,
  };
}

const providerRequests = await importTypeScript("app/src/lib/modelConfigProviderCatalogRequestHelpers.ts");
const defaultRequests = await importTypeScript("app/src/lib/modelCatalogRequestHelpers.ts");
const providerMerge = await importTypeScript("app/src/lib/modelConfigProviderCatalogMergeHelpers.ts");
const configMerge = await importTypeScript("app/src/lib/providerModelCatalogPatchCore.ts");
const cardHelpers = await importTypeScript("app/src/lib/modelConfigCardHelpers.ts");
const catalogOwnership = await importTypeScript("app/src/lib/modelCatalogOwnership.ts");
const configOperations = await importTypeScript("app/src/lib/modelConfigOperationGeneration.ts");

{
  const original = config([]);
  assert.equal(providerMerge.sameCatalogConnection(original, { ...original, model: "edited" }), true);
  assert.equal(providerMerge.sameCatalogConnection(original, { ...original, baseUrl: "https://example.com/v1/other" }), false);
  assert.equal(providerMerge.sameCatalogConnection(original, { ...original, apiKey: "other-key" }), false);
}

{
  const registry = configOperations.createModelConfigOperationGeneration();
  const first = configOperations.beginModelConfigOperation(registry);
  const second = configOperations.beginModelConfigOperation(registry);
  assert.equal(configOperations.isCurrentModelConfigOperation(registry, first), false);
  assert.equal(configOperations.isCurrentModelConfigOperation(registry, second), true);
}

{
  const original = config([]);
  const catalog = catalogOwnership.bindModelCatalogToConfig({
    ok: true,
    message: "ok",
    endpoint: "https://example.com/v1/default/models",
    total: 1,
    models: [{ id: "m1" }],
  }, original);
  assert.equal(catalogOwnership.modelCatalogBelongsToConfig(catalog, original), true);
  assert.equal(catalogOwnership.modelCatalogBelongsToConfig(catalog, { ...original, model: "other" }), true);
  assert.equal(catalogOwnership.modelCatalogBelongsToConfig(catalog, { ...original, apiKey: "new-key" }), false);
  assert.equal(JSON.stringify(catalog).includes(original.apiKey), false);
}

{
  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;
  try {
    const first = cardHelpers.createModelProvider(config([]));
    const second = cardHelpers.createModelProvider(config([first]));
    assert.notEqual(first.id, second.id);
  } finally {
    Date.now = originalNow;
  }
}

{
  const p1 = provider("p1");
  const p2 = provider("p2");
  const value = config([p1, p2], {
    roundModels: {
      "1": { enabled: true, providerId: "p1", providerName: p1.name, baseUrl: p1.baseUrl, apiKey: p1.apiKey, model: "m1", apiType: p1.apiType },
      "2": { enabled: true, providerId: "p2", providerName: p2.name, baseUrl: p2.baseUrl, apiKey: p2.apiKey, model: "m2", apiType: p2.apiType },
    },
  });
  const removed = cardHelpers.removeModelProvider(value, "p1");
  assert.deepEqual(removed.modelProviders.map((item) => item.id), ["p2"]);
  assert.equal(removed.roundModels["1"], undefined);
  assert.equal(removed.roundModels["2"].providerId, "p2");
}

// A newer default-catalog request invalidates and aborts the older generation.
// Finishing out of order cannot make the old request current again, while the
// registry still counts every unresolved promise until its own finally block.
{
  const registry = defaultRequests.createModelCatalogRequestRegistry();
  const first = defaultRequests.beginModelCatalogRequest(registry);
  const second = defaultRequests.beginModelCatalogRequest(registry);
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(defaultRequests.isModelCatalogRequestCurrent(registry, first.controller), false);
  assert.equal(defaultRequests.isModelCatalogRequestCurrent(registry, second.controller), true);
  assert.equal(registry.activeRequests.size, 2);
  defaultRequests.finishModelCatalogRequest(registry, second.controller);
  assert.equal(registry.activeRequests.size, 1);
  assert.equal(defaultRequests.isModelCatalogRequestCurrent(registry, first.controller), false);
  defaultRequests.finishModelCatalogRequest(registry, first.controller);
  assert.equal(registry.activeRequests.size, 0);
}

{
  const registry = defaultRequests.createModelCatalogRequestRegistry();
  const request = defaultRequests.beginModelCatalogRequest(registry);
  defaultRequests.invalidateModelCatalogRequests(registry);
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(defaultRequests.isModelCatalogRequestLatest(registry, request.controller), false);
  defaultRequests.finishModelCatalogRequest(registry, request.controller);
}

// Provider single/batch requests have the same generation contract.  User
// cancellation invalidates writes but does not lie about the unresolved busy
// count before each request settles.
{
  const registry = providerRequests.createProviderCatalogRequestRegistry();
  const first = providerRequests.beginProviderCatalogRequest(registry, ["p1", "p2"]);
  const second = providerRequests.beginProviderCatalogRequest(registry, ["p1"]);
  assert.equal(first.abortController.signal.aborted, true);
  assert.equal(providerRequests.isProviderCatalogRequestCurrent(registry, first), false);
  assert.equal(providerRequests.isProviderCatalogRequestCurrent(registry, second), true);
  assert.equal(registry.activeRequests.size, 2);
  assert.deepEqual([...providerRequests.getActiveProviderCatalogIds(registry)].sort(), ["p1", "p2"]);
  providerRequests.stopProviderCatalogRequests(registry);
  assert.equal(second.abortController.signal.aborted, true);
  assert.equal(providerRequests.isProviderCatalogRequestCurrent(registry, second), false);
  assert.equal(providerRequests.isProviderCatalogRequestLatest(registry, second), true);
  providerRequests.finishProviderCatalogRequest(registry, second);
  assert.equal(registry.activeRequests.size, 1);
  assert.deepEqual([...providerRequests.getActiveProviderCatalogIds(registry)].sort(), ["p1", "p2"]);
  providerRequests.finishProviderCatalogRequest(registry, first);
  assert.equal(registry.activeRequests.size, 0);
  assert.deepEqual([...providerRequests.getActiveProviderCatalogIds(registry)], []);
}

// Merge catalog-owned fields into the provider collection that exists when the
// request completes: p2 was deleted, p3 was added, and p1 was edited in flight.
{
  const latest = config([
    provider("p1", { name: "Edited name", baseUrl: "https://example.com/v1/edited", defaultModel: "manual-choice" }),
    provider("p3", { name: "Added while loading", models: ["keep-me"] }),
  ], { temperature: 0.9 });
  const { config: merged, appliedProviderIds } = providerMerge.mergeProviderCatalogResults(latest, [
    { providerId: "p1", modelIds: ["remote-a", "remote-b"] },
    { providerId: "p2", modelIds: ["must-not-return"] },
  ], "2026-01-02T03:04:05.000Z", [
    provider("p1", { name: "Original name", defaultModel: "old-choice" }),
    provider("p2"),
  ]);
  assert.deepEqual(merged.modelProviders.map((item) => item.id), ["p1", "p3"]);
  assert.deepEqual(appliedProviderIds, ["p1"]);
  assert.equal(merged.modelProviders[0].name, "Edited name");
  assert.equal(merged.modelProviders[0].baseUrl, "https://example.com/v1/edited");
  assert.equal(merged.modelProviders[0].defaultModel, "manual-choice");
  assert.deepEqual(merged.modelProviders[0].models, ["remote-a", "remote-b"]);
  assert.deepEqual(merged.modelProviders[1].models, ["keep-me"]);
  assert.equal(merged.temperature, 0.9);
}

// Empty defaults may be filled from a result, without changing unrelated
// provider fields.
{
  const latest = config([provider("p1", { name: "Still current" })]);
  const { config: merged } = providerMerge.mergeProviderCatalogResults(
    latest,
    [{ providerId: "p1", modelIds: ["first-model"] }],
    "2026-01-02T03:04:05.000Z",
    [provider("p1")],
  );
  assert.equal(merged.modelProviders[0].defaultModel, "first-model");
  assert.equal(merged.modelProviders[0].name, "Still current");
}

{
  const latest = config([provider("p1", { defaultModel: "" })]);
  const { config: merged } = providerMerge.mergeProviderCatalogResults(
    latest,
    [{ providerId: "p1", modelIds: ["stale-model"] }],
    "2026-01-02T03:04:05.000Z",
    [provider("p1", { defaultModel: "old-choice" })],
  );
  assert.equal(merged.modelProviders[0].defaultModel, "");
}

// A delayed save acknowledgement can apply server-normalized values only to
// fields that the user has not edited since submission.
{
  const submitted = config([provider("p1")]);
  const saved = config([provider("p1")], { temperature: 0.4, maxRetries: 3 });
  const latest = config([
    provider("p1", { name: "Edited after save" }),
    provider("p2", { name: "Added after save" }),
  ], { baseUrl: "https://example.com/v1/new-default" });
  const reconciled = configMerge.reconcileSavedModelConfig(submitted, saved, latest);
  assert.equal(reconciled.baseUrl, "https://example.com/v1/new-default");
  assert.deepEqual(reconciled.modelProviders, latest.modelProviders);
  assert.equal(reconciled.temperature, 0.4);
  assert.equal(reconciled.maxRetries, 3);
}

// Couple the pure contracts above to their production call sites so a later
// refactor cannot keep the tests while removing the actual stale-write guards.
{
  const defaultHandler = readFileSync(resolve(ROOT_DIR, "app/src/lib/modelCatalogListHandlers.ts"), "utf8");
  const providerHandler = readFileSync(resolve(ROOT_DIR, "app/src/lib/modelConfigProviderCatalogHandlers.ts"), "utf8");
  const providerTask = readFileSync(resolve(ROOT_DIR, "app/src/lib/modelCatalogProviderTaskHandlers.ts"), "utf8");
  const providerMutation = readFileSync(resolve(ROOT_DIR, "app/src/lib/modelConfigProviderMutationHandlers.ts"), "utf8");
  const providerHook = readFileSync(resolve(ROOT_DIR, "app/src/hooks/useModelConfigProviderCatalog.ts"), "utf8");
  const configHandler = readFileSync(resolve(ROOT_DIR, "app/src/lib/modelCatalogConfigHandlers.ts"), "utf8");
  const modelCard = readFileSync(resolve(ROOT_DIR, "app/src/components/ModelConfigCard.tsx"), "utf8");
  const providerEditor = readFileSync(resolve(ROOT_DIR, "app/src/components/ModelProviderEditorPanel.tsx"), "utf8");
  assert.match(defaultHandler, /if \(!isModelCatalogRequestCurrent\(abortController\)\) return null;/);
  assert.match(defaultHandler, /sameCatalogConnection\(config, latestConfig\)/);
  assert.match(defaultHandler, /setModelConfig\(\{ \.\.\.latestConfig, model: nextModel \}\)/);
  assert.match(providerHandler, /Promise\.all\(enabledProviders\.map/);
  assert.match(providerTask, /Promise\.all\(input\.enabledProviders\.map/);
  assert.match(providerTask, /if \(shouldCommit && !shouldCommit\(\)\) return nextConfig;/);
  assert.match(providerHandler, /if \(!mutation\.isProviderCatalogRequestCurrent\(handle\)\)/);
  assert.match(providerHandler, /sameCatalogConnection\(requestConfig, providerToModelConfig\(latestValue, latestProvider\)\)/);
  assert.match(providerHandler, /getProviderConnectionIssue/);
  assert.match(providerHandler, /const latestValue = input\.getValue\(\)/);
  assert.match(providerHandler, /mergeProviderCatalogResults\(\s*latestValue/);
  assert.doesNotMatch(providerHandler, /let nextProviders = \[\.\.\.providers\]/);
  assert.match(providerMutation, /globalThis\.confirm/);
  assert.match(providerMutation, /input\.onSave\(nextConfig\)/);
  assert.match(providerMutation, /connectionChanged/);
  assert.match(providerMutation, /connectionChanged \? \{ models: \[\] \}/);
  assert.match(providerHook, /valueRef\.current = nextValue/);
  assert.match(providerHook, /fyadr-view-unmounted/);
  assert.match(configHandler, /sameCatalogConnection\(onlineConfig, deps\.getModelConfig\(\)\)/);
  assert.match(configHandler, /MODEL_CONFIG_OPERATION_GENERATIONS/);
  assert.match(configHandler, /if \(!isCurrentModelConfigOperation\(operationGeneration, generation\)\) return;/);
  assert.match(modelCard, /modelCatalogBelongsToConfig\(modelCatalog, value\)/);
  assert.match(providerEditor, /providerCatalogRunning \? \(/);
  assert.ok(
    defaultHandler.indexOf("if (!isModelCatalogRequestCurrent(abortController)) return null;")
      < defaultHandler.indexOf("deps.setModelCatalog(ownedResult)"),
  );
  assert.ok(
    providerHandler.indexOf("if (!mutation.isProviderCatalogRequestCurrent(handle))")
      < providerHandler.lastIndexOf("input.onSave(config)"),
  );
}

console.log("model catalog concurrency regression: passed");
