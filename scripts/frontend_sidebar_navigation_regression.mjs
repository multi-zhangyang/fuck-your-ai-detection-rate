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
  const protectionMap = readAppSource("src/components/ProtectionMapCard.tsx");
  const protectionReasons = readAppSource("src/components/ProtectionMapReasonGrid.tsx");
  const protectionEmpty = readAppSource("src/components/ProtectionMapEmptyState.tsx");

  assert(app.includes("readWorkbenchViewFromSearch(window.location.search)"), "initial render must read the URL view");
  assert(app.includes("window.history.pushState("), "direct navigation must create browser history entries");
  assert(app.includes('window.addEventListener("popstate", handleWorkbenchPopState)'), "back and forward navigation must be observed");
  assert(app.includes("window.history.go(sourceIndex - targetMarker.index)"), "cancelled guarded traversal must restore the prior entry");
  assert(app.includes('document.getElementById("fyadr-main-content")?.focus({ preventScroll: true })'), "completed navigation must focus the main landmark");
  assert(app.includes('document.title = `${viewLabel} | FYADR`'), "each URL-backed workspace must expose its active label in the document title");
  assert(app.includes('aria-labelledby="fyadr-active-view-title"') && app.includes('id="fyadr-active-view-title"'), "the focused main landmark must be labelled by the active workspace heading");
  assert(app.includes("async function runAfterPromptDraftGuard"), "dirty prompt guards must return an awaited navigation decision");
  const guardConfirmationIndex = app.indexOf("if (!await requestPromptPreviewDiscardConfirmation()) return false;");
  const guardCurrentIndex = app.indexOf("if (!shouldCommit()) return false;", guardConfirmationIndex);
  const guardDirtyClearIndex = app.indexOf("promptPreviewDirtyRef.current = false;", guardConfirmationIndex);
  assert(
    guardConfirmationIndex >= 0 && guardCurrentIndex > guardConfirmationIndex && guardDirtyClearIndex > guardCurrentIndex,
    "stale discard confirmations must be rejected before they clear the active prompt draft guard",
  );
  const popHandlerIndex = app.indexOf("const handleWorkbenchPopState = (event: PopStateEvent) => {");
  const popRevisionIndex = app.indexOf("const revision = ++workbenchNavigationRevisionRef.current;", popHandlerIndex);
  const sameViewIndex = app.indexOf("if (targetView === sourceView)", popHandlerIndex);
  assert(
    popHandlerIndex >= 0 && popRevisionIndex > popHandlerIndex && sameViewIndex > popRevisionIndex,
    "every popstate, including same-view traversal, must invalidate older guarded navigation",
  );
  assert(app.includes("runGuardedWorkbenchAction"), "sidebar and task navigation must share the navigation generation guard");
  assert(!app.includes("<SidebarRail />"), "the sidebar rail must not be a provider-level sibling");

  const decisionIndex = appSidebar.indexOf("const allowed = await onViewChange(view)");
  const closeIndex = appSidebar.indexOf("closeMobileForNavigation()", decisionIndex);
  assert(decisionIndex >= 0 && closeIndex > decisionIndex, "mobile navigation must wait for guard approval before closing");
  assert(appSidebar.includes("<SidebarRail />"), "the sidebar rail must be nested inside the sidebar");
  assert(appSidebar.includes('alt=""'), "the decorative brand logo must not duplicate the adjacent product name for screen readers");
  assert(appSidebar.includes('aria-labelledby="fyadr-sidebar-group-primary"'), "sidebar groups must be labelled");
  assert(appSidebar.includes("asChild"), "sidebar navigation must render real anchor elements");
  assert(appSidebar.includes("buildWorkbenchViewUrl"), "sidebar links must use canonical workbench URLs");
  assert(appSidebar.includes("data-workbench-view={item.view}"), "each workbench link must expose a stable view selector");
  assert(appSidebar.includes("event.button !== 0"), "modified and middle-click navigation must retain native link behavior");
  assert(appSidebar.includes("event.metaKey") && appSidebar.includes("event.ctrlKey") && appSidebar.includes("event.shiftKey") && appSidebar.includes("event.altKey"), "all common link modifiers must bypass the SPA guard");
  assert(sidebar.includes("closeMobileForNavigation") && sidebar.includes("onCloseAutoFocus={handleMobileCloseAutoFocus}"), "approved mobile navigation must own the final Sheet close autofocus");
  assert(sidebar.includes('document.getElementById("fyadr-main-content")') && sidebar.includes("target?.focus({ preventScroll: true })"), "approved mobile navigation must restore focus to the main landmark after Sheet close");
  assert(sidebar.includes("item.getAttribute(\"aria-controls\") === sidebarId"), "non-navigation mobile closes must restore focus to the controlling trigger");
  assert(sidebar.includes("group-data-[side=left]:-right-4 md:flex") && !sidebar.includes("group-data-[side=left]:-right-4 sm:flex"), "the desktop rail must stay hidden throughout the mobile Sheet breakpoint");

  assert(sidebar.includes("readSidebarOpenCookie(document.cookie, defaultOpen)"), "the provider must restore its desktop open state from the cookie");
  assert(sidebar.includes('aria-controls={sidebarId}'), "the sidebar trigger must reference the controlled navigation");
  assert(sidebar.includes('aria-expanded={isMobile ? openMobile : open}'), "the sidebar trigger must expose its current state");
  assert(sidebar.includes('role="navigation"'), "the sidebar body must be a navigation landmark");
  assert(sidebar.includes('isMobile || open ? "expanded" : "collapsed"'), "mobile layout must not inherit desktop collapse state");
  assert(sidebar.includes("if (!isMobile) {") && sidebar.includes("setOpenMobile(false);"), "leaving mobile layout must clear stale drawer state");
  assert(runtimeProgress.includes('if (!isMobile && state === "collapsed")'), "mobile runtime status must stay expanded");
  assert(runtimeProgress.includes('role="progressbar"'), "collapsed runtime progress must expose progressbar semantics");
  assert(runtimeProgress.includes("aria-valuenow={value}") && runtimeProgress.includes("aria-valuemax={100}"), "collapsed runtime progress must expose numeric bounds");
  assert(runtimeProgress.includes("<Progress value={value} aria-label={status}"), "expanded runtime progress must have an accessible label");
  assert(protectionMap.includes("onChooseFile") && protectionMap.includes("onGoHome"), "protection map must expose empty-state recovery actions");
  assert(protectionMap.includes('aria-label="可改写正文占比"'), "the protection summary progressbar must have an accessible name");
  assert(protectionReasons.includes('aria-label={`${item.label}占保护区比例`}'), "each protection-reason progressbar must have a distinct accessible name");
  assert(protectionEmpty.includes("选择文档") && protectionEmpty.includes("返回工作台"), "protection empty state must offer document and workbench actions");
  assert(app.includes("onChooseFile={() => void handlePickFile()}") && app.includes("onGoHome={() => void navigateToWorkbenchView(\"home\")}"), "protection recovery actions must be wired to real app handlers");
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
    "stale history confirmation generation guard",
    "mobile drawer approval ordering",
    "sidebar navigation accessibility semantics",
  ],
}, null, 2));
