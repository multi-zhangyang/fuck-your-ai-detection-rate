import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = resolve(ROOT, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");

function transpileModule(relativePath) {
  const source = readFileSync(resolve(APP_DIR, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  return {
    source,
    moduleUrl: `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`,
  };
}

function headers(values) {
  return new Headers(values);
}

function expectBlocked(action, message) {
  let blocked = false;
  try {
    action();
  } catch (error) {
    blocked = String(error?.message ?? error).includes("文件未下载");
  }
  if (!blocked) throw new Error(message);
}

async function expectBlockedAsync(action, message) {
  let blocked = false;
  try {
    await action();
  } catch (error) {
    blocked = String(error?.message ?? error).includes("文件未下载");
  }
  if (!blocked) throw new Error(message);
}

const evidenceSource = transpileModule("src/lib/exportEvidence.ts");
const evidenceModule = await import(evidenceSource.moduleUrl);
const parserSource = readFileSync(resolve(APP_DIR, "src/lib/webServiceExportResult.ts"), "utf8");
const healthSource = readFileSync(resolve(APP_DIR, "src/lib/exportHealthViewModel.ts"), "utf8");
const noticeSource = readFileSync(resolve(APP_DIR, "src/lib/exportNoticeFormatHelpers.ts"), "utf8");
const qualityPageSource = readFileSync(resolve(APP_DIR, "src/components/QualityReportPage.tsx"), "utf8");
const exportHandlerSource = readFileSync(resolve(APP_DIR, "src/lib/exportExecuteHandlers.ts"), "utf8");
const historyExportHandlerSource = readFileSync(resolve(APP_DIR, "src/lib/historyDocumentLoadHandlers.ts"), "utf8");
const webServiceExportSource = readFileSync(resolve(APP_DIR, "src/lib/webServiceExport.ts"), "utf8");
const appSource = readFileSync(resolve(APP_DIR, "src/App.tsx"), "utf8");
const historyRoundCardSource = readFileSync(resolve(APP_DIR, "src/components/HistoryDocumentRoundCard.tsx"), "utf8");

const originalDocxHeaders = headers({
  "X-Export-Evidence-Version": "1",
  "X-Export-Overall-Status": "passed",
  "X-Export-Source-Kind": "original_docx",
  "X-Export-Content-Contract-Status": "passed",
  "X-Export-Format-Lock-Status": "passed",
  "X-Export-Attempt-Id": "attempt-1",
  "X-Export-Artifact-Sha256": "a".repeat(64),
  "X-Export-Evidence-Manifest-Path": encodeURIComponent("/tmp/attempt-1.evidence.json"),
  "X-Export-Checks-Performed": [
    "document_generation",
    "pre_export_guard",
    "content_contract",
    "text_integrity",
    "protected_text_audit",
    "ooxml_integrity",
    "format_lock",
    "post_export_contract",
  ].join(","),
});
const originalEvidence = evidenceModule.parseExportEvidence(originalDocxHeaders);
evidenceModule.assertExportEvidenceCanDownload(originalEvidence, "docx");
if (originalEvidence.certification !== null) {
  throw new Error("existing certified export responses must remain compatible when certification is absent");
}
const certifiedBlob = new Blob([Uint8Array.of(0x50, 0x4b, 0x03, 0x04), "certified-docx-bytes"]);
const certifiedDigest = await crypto.subtle.digest("SHA-256", await certifiedBlob.arrayBuffer());
const certifiedSha256 = Array.from(new Uint8Array(certifiedDigest), (value) => value.toString(16).padStart(2, "0")).join("");
await evidenceModule.assertExportArtifactMatchesEvidence(
  { ...originalEvidence, artifactSha256: certifiedSha256 },
  certifiedBlob,
  "docx",
);
await expectBlockedAsync(
  () => evidenceModule.assertExportArtifactMatchesEvidence(originalEvidence, certifiedBlob, "docx"),
  "a DOCX body whose bytes do not match the certified SHA-256 must be blocked",
);

const generatedDocxHeaders = headers({
  "X-Export-Evidence-Version": "1",
  "X-Export-Overall-Status": "passed",
  "X-Export-Source-Kind": "generated_docx",
  "X-Export-Content-Contract-Status": "not_applicable",
  "X-Export-Format-Lock-Status": "not_applicable",
  "X-Export-Attempt-Id": "attempt-2",
  "X-Export-Artifact-Sha256": "b".repeat(64),
  "X-Export-Evidence-Manifest-Path": encodeURIComponent("/tmp/attempt-2.evidence.json"),
  "X-Export-Checks-Performed": "document_generation",
});
evidenceModule.assertExportEvidenceCanDownload(
  evidenceModule.parseExportEvidence(generatedDocxHeaders),
  "docx",
);

const plainUncertifiedHeaders = new Headers(generatedDocxHeaders);
plainUncertifiedHeaders.set("X-Export-Certification", "plain_uncertified");
const plainUncertifiedEvidence = evidenceModule.parseExportEvidence(plainUncertifiedHeaders);
if (plainUncertifiedEvidence.certification !== "plain_uncertified") {
  throw new Error("plain_uncertified export certification was not preserved from the response header");
}
evidenceModule.assertExportEvidenceCanDownload(plainUncertifiedEvidence, "docx");

const plainUncertifiedTxtEvidence = evidenceModule.parseExportEvidence(headers({
  "X-Export-Evidence-Version": "1",
  "X-Export-Overall-Status": "passed",
  "X-Export-Certification": "plain_uncertified",
  "X-Export-Source-Kind": "plain_text",
  "X-Export-Content-Contract-Status": "not_applicable",
  "X-Export-Format-Lock-Status": "not_applicable",
  "X-Export-Checks-Performed": "text_export",
}));
evidenceModule.assertExportEvidenceCanDownload(plainUncertifiedTxtEvidence, "txt");
if (plainUncertifiedTxtEvidence.certification !== "plain_uncertified") {
  throw new Error("plain_uncertified TXT certification was not preserved");
}

const unknownCertificationHeaders = new Headers(generatedDocxHeaders);
unknownCertificationHeaders.set("X-Export-Certification", "unsupported-certification");
expectBlocked(
  () => evidenceModule.assertExportEvidenceCanDownload(
    evidenceModule.parseExportEvidence(unknownCertificationHeaders),
    "docx",
  ),
  "unknown export certification values must fail closed before download",
);

expectBlocked(
  () => evidenceModule.assertExportEvidenceCanDownload(evidenceModule.parseExportEvidence(headers({})), "docx"),
  "legacy DOCX responses without versioned evidence must be blocked",
);

const incompleteOriginalHeaders = new Headers(originalDocxHeaders);
incompleteOriginalHeaders.set(
  "X-Export-Checks-Performed",
  "document_generation,pre_export_guard,content_contract,text_integrity,protected_text_audit,ooxml_integrity,post_export_contract",
);
expectBlocked(
  () => evidenceModule.assertExportEvidenceCanDownload(
    evidenceModule.parseExportEvidence(incompleteOriginalHeaders),
    "docx",
  ),
  "original DOCX responses without the format-lock check must be blocked",
);

const assertionIndex = parserSource.indexOf("assertExportEvidenceCanDownload(evidence, targetFormat)");
const identityIndex = parserSource.indexOf("assertExportResponseIdentity(response.headers, expected)");
const blobIndex = parserSource.indexOf("await response.blob()");
const hashIndex = parserSource.indexOf("assertExportArtifactMatchesEvidence(evidence, blob, targetFormat)");
const downloadIndex = parserSource.indexOf("downloadBlob(blob, filename)");
if (!(assertionIndex >= 0 && identityIndex > assertionIndex && blobIndex > identityIndex && hashIndex > blobIndex && downloadIndex > hashIndex)) {
  throw new Error("export evidence, round identity, and response bytes must be verified before downloading the body");
}
if (!healthSource.includes("hasTrustedExportEvidence") || !healthSource.includes('"证据缺失"')) {
  throw new Error("historical exports without evidence must not render as structure-passed");
}
if (
  !parserSource.includes("certification: evidence.certification ?? undefined")
  || !healthSource.includes('"未认证轮次"')
  || !healthSource.includes("文件生成成功，但不属于 FYADR 认证轮次。")
) {
  throw new Error("plain_uncertified certification must reach the export result and health UI");
}
if (!healthSource.includes('value: "不适用"') || !healthSource.includes('value: "未执行"') || !healthSource.includes('value: "未知"')) {
  throw new Error("export health must distinguish passed, not-applicable, not-performed, and unknown checks");
}
if (
  !noticeSource.includes("没有原版式基线")
  || !noticeSource.includes("版本化导出证据已通过")
  || !noticeSource.includes("文件生成成功，但不属于 FYADR 认证轮次。")
  || !noticeSource.includes('"body_scope_style_only"')
) {
  throw new Error("generated Word notices must distinguish missing original-format applicability");
}
if (!qualityPageSource.includes("尚未执行导出") || !qualityPageSource.includes("不把“未运行”折算成 0 个问题")) {
  throw new Error("quality report must not display unexecuted export checks as green zeroes");
}
if (!(exportHandlerSource.indexOf("setLastExportResult(null)") >= 0 && exportHandlerSource.indexOf("setLastExportResult(null)") < exportHandlerSource.indexOf("service.exportRound"))) {
  throw new Error("current export attempts must clear stale success evidence before a new request");
}
const historyFlushIndex = historyExportHandlerSource.indexOf("await deps.flushReviewDecisionSaves(item.outputPath)");
const historySnapshotIndex = historyExportHandlerSource.indexOf("await deps.service.readRoundSnapshot(item.outputPath)");
const historyIdentityIndex = historyExportHandlerSource.indexOf("historyExportSelectionMatchesSnapshot(item, snapshot)");
const historyRequestIndex = historyExportHandlerSource.indexOf("await deps.service.exportRound(");
if (!(historyFlushIndex >= 0 && historySnapshotIndex > historyFlushIndex && historyIdentityIndex > historySnapshotIndex && historyRequestIndex > historyIdentityIndex)) {
  throw new Error("history export must flush review saves and verify one identity-bound snapshot before download");
}
if (
  !historyExportHandlerSource.includes("buildRevisionBoundExportOptions(snapshot)")
  || !historyExportHandlerSource.includes("if (affectsActiveEvidence)")
  || !historyRoundCardSource.includes("docId: item.docId")
  || !historyRoundCardSource.includes("sourcePath: item.sourcePath")
) {
  throw new Error("history export must retain parent document identity and isolate non-active evidence state");
}
if (
  !appSource.includes("exportResultMatchesCompare(lastExportResult, activeCompareData)")
  || !appSource.includes("exportResult={activeExportResult}")
) {
  throw new Error("export evidence panels must only receive evidence for the active output path");
}
if (
  !webServiceExportSource.includes('"/api/export-round"')
  || !webServiceExportSource.includes('method: "POST"')
  || webServiceExportSource.includes("/api/export-round?outputPath=")
  || !webServiceExportSource.includes("body: JSON.stringify({ outputPath, targetFormat, ...options })")
) {
  throw new Error("non-idempotent export creation must use a revision-bound POST");
}

console.log(JSON.stringify({
  ok: true,
  checks: [
    "valid original-DOCX evidence is accepted",
    "valid generated-DOCX evidence is accepted as not-applicable to original format lock",
    "plain_uncertified TXT/Word evidence is preserved and disclosed without breaking existing certified rounds",
    "unknown certification values fail closed before download",
    "legacy responses without evidence are blocked before download",
    "missing mandatory original-DOCX checks are blocked",
    "DOCX response bytes must match the certified SHA-256 before download",
    "download responses must match the requested output/document/round revisions",
    "export health, quality report, and notices expose evidence truthfully",
    "history exports flush review state and keep non-active evidence isolated",
    "active evidence panels reject another output path",
    "frontend creates revision-bound immutable export bundles through POST",
  ],
}, null, 2));
