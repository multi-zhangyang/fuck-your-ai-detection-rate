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

async function testWorkbenchRoutes() {
  const route = await importAppModule("src/lib/workbenchRoute.ts");
  assert(route.readWorkbenchViewFromSearch("?view=model") === "model", "known deep links must select their view");
  assert(route.readWorkbenchViewFromSearch("?view=unknown") === "home", "unknown deep links must fall back to home");
  assert(route.readWorkbenchViewFromSearch("") === "home", "missing deep links must select home");
  assert(
    route.buildWorkbenchViewUrl("history", "https://example.test/workbench?source=recent&view=model#asset")
      === "/workbench?source=recent&view=history#asset",
    "view navigation must preserve unrelated query parameters and hashes",
  );
  assert(
    route.buildWorkbenchViewUrl("home", "https://example.test/workbench?source=recent&view=bad#asset")
      === "/workbench?source=recent#asset",
    "home navigation must canonicalize and remove the view parameter",
  );

  const state = route.withWorkbenchHistoryMarker({ external: "kept" }, { index: 3, view: "prompts" });
  assert(state.external === "kept", "history markers must preserve unrelated history state");
  assert(route.readWorkbenchHistoryMarker(state)?.index === 3, "valid history markers must round trip");
  assert(route.readWorkbenchHistoryMarker({ [route.WORKBENCH_HISTORY_STATE_KEY]: { index: -1, view: "home" } }) === null, "negative history indexes must be rejected");
  assert(route.readWorkbenchHistoryMarker({ [route.WORKBENCH_HISTORY_STATE_KEY]: { index: 1, view: "invalid" } }) === null, "invalid marker views must be rejected");
}

async function testSidebarCookie() {
  const state = await importAppModule("src/lib/sidebarState.ts");
  assert(state.readSidebarOpenCookie("theme=dark; sidebar_state=false", true) === false, "collapsed sidebar cookies must be restored");
  assert(state.readSidebarOpenCookie("sidebar_state=true; theme=dark", false) === true, "expanded sidebar cookies must be restored");
  assert(state.readSidebarOpenCookie("sidebar_state=invalid", false) === false, "invalid sidebar cookies must use the caller fallback");
  assert(state.createSidebarCookie(false).includes("sidebar_state=false"), "sidebar cookie writes must persist the collapsed state");
}

function testWiring() {
  const app = readAppSource("src/App.tsx");
  const appSidebar = readAppSource("src/components/AppSidebar.tsx");
  const sidebar = readAppSource("src/components/ui/sidebar.tsx");
  const runtimeProgress = readAppSource("src/components/SidebarRuntimeProgress.tsx");

  assert(app.includes("readWorkbenchViewFromSearch(window.location.search)"), "initial render must read the URL view");
  assert(app.includes("window.history.pushState("), "direct navigation must create browser history entries");
  assert(app.includes('window.addEventListener("popstate", handleWorkbenchPopState)'), "back and forward navigation must be observed");
  assert(app.includes("window.history.go(sourceIndex - targetMarker.index)"), "cancelled guarded traversal must restore the prior entry");
  assert(app.includes('document.getElementById("fyadr-main-content")?.focus({ preventScroll: true })'), "completed navigation must focus the main landmark");
  assert(app.includes("async function runAfterPromptDraftGuard"), "dirty prompt guards must return an awaited navigation decision");
  assert(!app.includes("<SidebarRail />"), "the sidebar rail must not be a provider-level sibling");

  const decisionIndex = appSidebar.indexOf("const allowed = await onViewChange(view)");
  const closeIndex = appSidebar.indexOf("setOpenMobile(false)", decisionIndex);
  assert(decisionIndex >= 0 && closeIndex > decisionIndex, "mobile navigation must wait for guard approval before closing");
  assert(appSidebar.includes("<SidebarRail />"), "the sidebar rail must be nested inside the sidebar");
  assert(appSidebar.includes('aria-labelledby="fyadr-sidebar-group-primary"'), "sidebar groups must be labelled");

  assert(sidebar.includes("readSidebarOpenCookie(document.cookie, defaultOpen)"), "the provider must restore its desktop open state from the cookie");
  assert(sidebar.includes('aria-controls={sidebarId}'), "the sidebar trigger must reference the controlled navigation");
  assert(sidebar.includes('aria-expanded={isMobile ? openMobile : open}'), "the sidebar trigger must expose its current state");
  assert(sidebar.includes('role="navigation"'), "the sidebar body must be a navigation landmark");
  assert(sidebar.includes('isMobile || open ? "expanded" : "collapsed"'), "mobile layout must not inherit desktop collapse state");
  assert(sidebar.includes('if (!isMobile) setOpenMobile(false)'), "leaving mobile layout must clear stale drawer state");
  assert(runtimeProgress.includes('if (!isMobile && state === "collapsed")'), "mobile runtime status must stay expanded");
}

await testWorkbenchRoutes();
await testSidebarCookie();
testWiring();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "deep-link parsing and canonical URLs",
    "history marker validation and state preservation",
    "sidebar cookie restoration",
    "back-forward and guarded-navigation wiring",
    "mobile drawer approval ordering",
    "sidebar navigation accessibility semantics",
  ],
}, null, 2));
