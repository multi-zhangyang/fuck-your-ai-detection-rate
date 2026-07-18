import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_SRC = resolve(ROOT, "app", "src");

function read(relativePath) {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

function collectSource(root) {
  return readdirSync(root, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(root, entry.name);
      if (entry.isDirectory()) return collectSource(path);
      return [".ts", ".tsx"].includes(extname(entry.name)) ? [readFileSync(path, "utf8")] : [];
    })
    .join("\n");
}

const files = {
  types: read("app/src/types/app.ts"),
  defaults: read("app/src/lib/webServiceModelConfig.ts"),
  secrets: read("app/src/lib/webServiceModelConfigSecrets.ts"),
  route: read("app/src/lib/modelRoute.ts"),
  cardHelpers: read("app/src/lib/modelConfigCardHelpers.ts"),
  defaultRoute: read("app/src/lib/modelRouteDefaultIssueHelpers.ts"),
  roundRoute: read("app/src/lib/modelRouteRoundProviderHelpers.ts"),
  appendRoute: read("app/src/lib/homeRunAppendConfigState.ts"),
  defaultForm: read("app/src/components/ModelDefaultConnectionForm.tsx"),
  providerForm: read("app/src/components/ModelProviderParamFields.tsx"),
  chunkView: read("app/src/lib/rewriteDiffPanelChunkViewModel.ts"),
  streamBanner: read("app/src/lib/rewriteDiffPanelFilterViewModel.ts"),
  runtime: read("app/src/lib/runtimeProgress.ts"),
  statusCard: read("app/src/components/RoundRunStatusCard.tsx"),
  backend: read("scripts/app_service.py"),
};
const allFrontendSource = collectSource(APP_SRC);

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

check(
  (files.types.match(/streaming\??:\s*boolean/g) ?? []).length >= 3,
  "ModelConfig, provider and round-route types carry the canonical streaming boolean",
);
check(
  files.defaults.includes("streaming: true,")
  && files.defaults.includes('typeof merged.streaming === "boolean"')
  && files.defaults.includes(": defaultModelConfig.streaming"),
  "frontend config defaults legacy/missing streaming to true without model heuristics",
);
check(
  files.secrets.includes("...config,")
  && files.secrets.includes("...provider,")
  && files.secrets.includes("...route,")
  && !files.secrets.includes("delete sanitized.streaming"),
  "secret projection preserves non-secret streaming policy across top/provider/round configs",
);
check(
  files.route.includes("streaming: provider.streaming ?? fallback.streaming")
  && files.cardHelpers.includes("streaming: value.streaming")
  && files.cardHelpers.includes("streaming: provider.streaming ?? value.streaming")
  && files.defaultRoute.includes("streaming: config.streaming")
  && files.roundRoute.includes("streaming: config.streaming")
  && files.appendRoute.includes("streaming: input.currentConfig.streaming"),
  "default, provider, round and appended routes retain their effective streaming policy",
);
check(
  files.defaultForm.includes("流式接收")
  && files.defaultForm.includes("checked={value.streaming}")
  && files.defaultForm.includes("仅消费最终回答，思考字段不会进入论文/日志")
  && files.providerForm.includes("checked={selectedProvider.streaming ?? value.streaming}")
  && files.providerForm.includes("接收期间不展示任何模型片段"),
  "default and provider editors expose streaming with the final-answer/reasoning isolation contract",
);
check(
  !files.chunkView.includes("streamPreview")
  && files.chunkView.includes("const displayOutput = getDecisionDisplayOutput(chunk, decision)")
  && files.chunkView.includes("finished answer passes")
  && files.streamBanner.includes("思考内容已隔离")
  && files.streamBanner.includes("完整回答通过门禁后才会进入 Diff"),
  "Diff never promotes a partial stream to candidate text and shows metadata-only progress",
);
check(
  !allFrontendSource.includes("streamPreview")
  && !files.backend.includes('"streamPreview"')
  && files.runtime.includes("思考内容已隔离")
  && files.statusCard.includes("思考内容已隔离"),
  "partial provider text is absent from backend progress and every frontend display path",
);
check(
  files.backend.includes('stream=streaming')
  || files.backend.includes('stream=streaming_enabled'),
  "backend generation passes the canonical streaming decision into the existing LLM client",
);

console.log(`frontend model streaming regression passed (${checks.length} checks)`);
