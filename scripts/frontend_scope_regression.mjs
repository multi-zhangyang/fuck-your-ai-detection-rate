import assert from "node:assert/strict";

import {
  documentScopeCounts,
  documentScopeUnits,
  scopeCountsFromUnits,
} from "../app/src/lib/scopeModel.ts";

const paragraphs = [
  { id: "p-1", order: 0, text: "第一段正文", safe: true, selected: true },
  { id: "p-2", order: 1, text: "第二段正文", safe: true, selected: false },
  { id: "p-3", order: 2, text: "图 1-1 标题", safe: false, selected: false },
];
const units = [
  { unitIndex: 0, paragraphId: "p-1", selectable: true, text: "第一段正文" },
  { unitIndex: 1, paragraphId: "p-2", selectable: true, text: "第二段正文" },
  { unitIndex: 2, paragraphId: "p-3", selectable: false, text: "图 1-1 标题" },
  { unitIndex: 3, paragraphId: "", selectable: false, text: "" },
];
const document = {
  paragraphs,
  protectionMap: { units },
};
const selectedIds = new Set(["p-1"]);
const normalizedUnits = documentScopeUnits(document);
const sharedCounts = scopeCountsFromUnits(normalizedUnits, selectedIds);

assert.deepEqual(sharedCounts, { selected: 1, available: 1, locked: 2, total: 4 });
assert.deepEqual(documentScopeCounts(document, selectedIds), sharedCounts);

const changedSelection = new Set(["p-2"]);
assert.deepEqual(documentScopeCounts(document, changedSelection), {
  selected: 1,
  available: 1,
  locked: 2,
  total: 4,
});

console.log("frontend scope regression passed");
