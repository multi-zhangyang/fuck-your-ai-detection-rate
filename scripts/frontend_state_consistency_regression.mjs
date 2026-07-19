import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
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

function listSourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) return listSourceFiles(absolutePath);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

async function importAppModule(relativePath) {
  const source = readAppSource(relativePath);
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
  return import(moduleUrl);
}

function installLocalStorage(valueOrGetter) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const descriptor = typeof valueOrGetter === "function"
    ? { configurable: true, get: valueOrGetter }
    : { configurable: true, value: valueOrGetter };
  Object.defineProperty(globalThis, "localStorage", descriptor);
  return () => {
    if (original) {
      Object.defineProperty(globalThis, "localStorage", original);
    } else {
      delete globalThis.localStorage;
    }
  };
}

async function testSafeStorage() {
  const {
    readStorageValue,
    removeStorageValue,
    writeStorageValue,
  } = await importAppModule("src/lib/safeStorage.ts");
  const values = new Map();
  let restore = installLocalStorage({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  });
  try {
    assert(writeStorageValue("draft", "本地草稿"), "safe storage should report a successful write");
    assert(readStorageValue("draft") === "本地草稿", "safe storage should read the stored draft");
    assert(removeStorageValue("draft"), "safe storage should report a successful remove");
    assert(readStorageValue("draft") === null, "safe storage should remove the stored draft");
  } finally {
    restore();
  }

  restore = installLocalStorage(() => {
    throw new Error("storage blocked");
  });
  try {
    assert(readStorageValue("draft") === null, "blocked storage reads must degrade to null");
    assert(writeStorageValue("draft", "x") === false, "blocked storage writes must not throw");
    assert(removeStorageValue("draft") === false, "blocked storage removals must not throw");
  } finally {
    restore();
  }
}

async function testPromptDirtyModel() {
  const { hasPromptPreviewUnsavedChanges } = await importAppModule("src/lib/promptPreviewDraftHelpers.ts");
  const clean = {
    dirty: false,
    metaDirty: false,
    createMode: false,
    newLabel: "",
    newDescription: "",
    newContent: "",
  };
  assert(!hasPromptPreviewUnsavedChanges(clean), "an untouched prompt must remain clean");
  assert(hasPromptPreviewUnsavedChanges({ ...clean, dirty: true }), "content edits must mark an existing prompt dirty");
  assert(hasPromptPreviewUnsavedChanges({ ...clean, metaDirty: true }), "metadata edits must mark an existing prompt dirty");
  assert(!hasPromptPreviewUnsavedChanges({ ...clean, createMode: true }), "an empty create form must remain clean");
  assert(hasPromptPreviewUnsavedChanges({ ...clean, createMode: true, newContent: "新提示词" }), "new prompt content must be guarded");
  assert(hasPromptPreviewUnsavedChanges({ ...clean, createMode: true, newLabel: "名称" }), "new prompt metadata must be guarded");
}

async function testCompatibilityClassification() {
  const { isEndpointCompatibilityError } = await importAppModule("src/lib/webServiceCompat.ts");
  assert(isEndpointCompatibilityError({ status: 404 }), "HTTP 404 must allow the legacy prompt fallback");
  assert(isEndpointCompatibilityError({ status: 405 }), "HTTP 405 must allow the legacy prompt fallback");
  assert(!isEndpointCompatibilityError({ status: 500 }), "HTTP 500 must not use the legacy prompt fallback");
  assert(!isEndpointCompatibilityError(new TypeError("network failed")), "network failures must not use the legacy prompt fallback");
}

function testWiring() {
  const appSource = readAppSource("src/App.tsx");
  const promptServiceSource = readAppSource("src/lib/webServicePromptCoreApi.ts");
  const promptPageSource = readAppSource("src/components/PromptPreviewPage.tsx");
  const promptCrudSource = readAppSource("src/lib/promptCrudHandlers.ts");
  const directStorageUsers = listSourceFiles(resolve(APP_DIR, "src"))
    .filter((path) => path !== resolve(APP_DIR, "src/lib/safeStorage.ts"))
    .filter((path) => /\blocalStorage\b/.test(readFileSync(path, "utf-8")))
    .map((path) => relative(APP_DIR, path).replaceAll("\\", "/"));

  const removedFormatModules = [
    "src/lib/formatStorage.ts",
    "src/lib/formatRulesRouteHandlers.ts",
    "src/components/SchoolFormatCard.tsx",
    "src/lib/webServiceFormat.ts",
  ];
  assert(removedFormatModules.every((path) => !existsSync(resolve(APP_DIR, path))), "removed school-format modules must stay absent");
  assert(!appSource.includes("SchoolFormat") && !appSource.includes('activeView === "format"'), "the workbench must not restore the removed school-format route");

  assert(promptServiceSource.includes("isEndpointCompatibilityError(error)"), "prompt fallback must check endpoint compatibility");
  assert(promptServiceSource.includes("throw error;"), "prompt network and server failures must be rethrown");
  assert(promptPageSource.includes('window.addEventListener("beforeunload", handleBeforeUnload)'), "dirty prompt drafts must guard browser unload");
  assert(promptPageSource.includes("confirmDiscardIfNeeded"), "prompt item transitions must share the dirty confirmation guard");
  assert(appSource.includes("runAfterPromptDraftGuard"), "workbench navigation must guard dirty prompt drafts");
  assert(appSource.includes("onViewChange={navigateToWorkbenchView}"), "sidebar navigation must use the dirty-aware view change handler");
  assert(promptCrudSource.includes('title: "恢复默认提示词"'), "restoring a default prompt must request confirmation");
  assert(promptCrudSource.indexOf('title: "恢复默认提示词"') < promptCrudSource.indexOf("deps.service.restoreDefaultPrompt(promptId)"), "default restore confirmation must run before the destructive request");
  assert(directStorageUsers.length === 0, `all browser storage access must use the safe adapter; direct users: ${directStorageUsers.join(", ")}`);
}

await testSafeStorage();
await testPromptDirtyModel();
await testCompatibilityClassification();
testWiring();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "safe storage tolerates unavailable browser storage",
    "removed school-format modules and route stay absent",
    "prompt fallback is limited to HTTP 404/405 compatibility",
    "prompt dirty state covers existing and create drafts",
    "prompt transitions, workbench navigation, unload, and default restore are guarded",
    "all browser storage consumers tolerate unavailable or throwing localStorage",
  ],
}, null, 2));
