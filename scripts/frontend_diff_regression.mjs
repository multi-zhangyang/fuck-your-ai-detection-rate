import assert from "node:assert/strict";

import { createTextDiff, tokenizeForDiff } from "../app/src/lib/textDiff.ts";

function rebuild(parts, side) {
  return parts
    .filter((part) => side === "original" ? part.kind !== "added" : part.kind !== "removed")
    .map((part) => part.value)
    .join("");
}

const original = "本文使用 Transformer 模型，实验值为 10，引用见[1]。";
const rewritten = "本文采用 Transformer 模型，实验值仍为 10，相关引用见[1]。";
const parts = createTextDiff(original, rewritten);

assert.equal(rebuild(parts, "original"), original, "diff must reconstruct the original text exactly");
assert.equal(rebuild(parts, "rewritten"), rewritten, "diff must reconstruct the rewritten text exactly");
assert.ok(parts.some((part) => part.kind === "removed" && part.value.includes("使")), "Chinese removals should be visible");
assert.ok(parts.some((part) => part.kind === "added" && part.value.includes("采")), "Chinese additions should be visible");
assert.ok(tokenizeForDiff("GPT-4o API 与中文").includes("GPT-4o"), "technical English identifiers should stay readable");

const whitespaceOriginal = "First sentence.  Second line\n第三行";
const whitespaceRewrite = "First sentence.  Revised second line\n第三行";
const whitespaceParts = createTextDiff(whitespaceOriginal, whitespaceRewrite);
assert.equal(rebuild(whitespaceParts, "original"), whitespaceOriginal);
assert.equal(rebuild(whitespaceParts, "rewritten"), whitespaceRewrite);

assert.deepEqual(createTextDiff("完全相同", "完全相同"), [{ kind: "equal", value: "完全相同" }]);

console.log("frontend diff regression passed");
