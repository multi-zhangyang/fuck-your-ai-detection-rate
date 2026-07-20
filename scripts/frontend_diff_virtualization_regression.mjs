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

async function testVirtualizationPolicy() {
  const policy = await importAppModule("src/lib/diffVirtualization.ts");
  assert(policy.DIFF_VIRTUALIZATION_THRESHOLD === 40, "the short-document full-render threshold must remain explicit");
  assert(!policy.shouldVirtualizeDiffChunks(40), "documents at the threshold must keep the simple renderer");
  assert(policy.shouldVirtualizeDiffChunks(41), "documents above the threshold must use windowing");

  const chunks = Array.from({ length: 1_000 }, (_, index) => ({
    chunkId: `chunk-${index + 1}`,
  }));
  assert(policy.shouldVirtualizeDiffChunks(chunks.length), "a 1,000-chunk document must use windowing");
  assert(policy.findDiffChunkIndex(chunks, "chunk-900") === 899, "deep focus targets must resolve to their exact virtual index");
  assert(policy.findDiffChunkIndex(chunks, "missing") === -1, "unknown focus targets must fail closed");
  assert(policy.findDiffChunkIndex(chunks, "") === -1, "empty focus targets must fail closed");
}

function testWiring() {
  const app = readAppSource("src/App.tsx");
  const panel = readAppSource("src/components/RewriteDiffPanel.tsx");
  const list = readAppSource("src/components/RewriteDiffPanelChunkList.tsx");
  const card = readAppSource("src/components/RewriteDiffChunkCard.tsx");
  const model = readAppSource("src/hooks/useRewriteDiffPanelModel.ts");
  const focus = readAppSource("src/hooks/useDiffPanelFocusScrollEffects.ts");
  const focusPlan = readAppSource("src/lib/diffPanelFocusEffectHelpers.ts");

  assert(app.includes('useShallow') && app.includes('useAppState(useShallow((state)'), "the app store subscription must use an explicit shallow selector");
  assert(!app.includes("} = useAppState();"), "the app must not return to an unbounded whole-store subscription");
  assert(model.includes("const filterState = useMemo("), "Diff filter Sets and Maps must be memoized across progress renders");

  assert(list.includes('from "@tanstack/react-virtual"'), "the long-document list must use the maintained virtualizer");
  assert(list.includes("shouldVirtualizeDiffChunks(shownChunks.length)"), "windowing must be governed by the shared threshold");
  assert(list.includes("virtualizer.getVirtualItems().map"), "the long-document path must mount only the active virtual window");
  assert(list.includes("ref={virtualizer.measureElement}"), "dynamic-height Diff rows must be measured");
  assert(list.includes("overscan: DIFF_VIRTUAL_OVERSCAN"), "the window must retain a deliberate overscan buffer");
  assert(list.includes("virtualizer.scrollToIndex(index"), "unmounted focus targets must be addressable by virtual index");
  assert(list.includes("shownChunks.map(renderChunk)"), "short documents must retain the low-complexity full renderer");

  assert(focus.includes("virtualScrollToChunkRef.current?.(action.targetId)"), "focus handling must fall back to virtual scrolling for unmounted chunks");
  assert(focusPlan.includes("targetIsShown"), "a valid unmounted target must not be mistaken for a missing chunk");
  assert(card.includes("memo(") && card.includes("areRewriteDiffChunkCardPropsEqual"), "Diff cards must skip unrelated progress and review renders");
  assert(list.includes("streamChunkId === chunk.chunkId") && list.includes("focusedChunkId === chunk.chunkId"), "stream and focus changes must invalidate only their affected cards");
  assert(panel.includes("reviewDecisionChangeRef.current") && panel.includes("rerunChunkRef.current"), "card action callbacks must stay referentially stable");

  for (const interaction of [
    "onReviewDecisionChange",
    "onRerunChunk",
    "reviewDecisions",
    "rerunFailureByChunk",
    "focusedChunkId",
    "streamChunkId",
  ]) {
    assert(list.includes(interaction), `virtualized rows must preserve the ${interaction} interaction contract`);
  }
}

await testVirtualizationPolicy();
testWiring();

console.log(JSON.stringify({
  ok: true,
  checks: [
    "40-chunk virtualization threshold",
    "1,000-chunk index lookup",
    "dynamic-height virtual window wiring",
    "unmounted focus navigation",
    "memoized card and filter state",
    "review, rerun, focus, and stream interaction preservation",
  ],
}, null, 2));
