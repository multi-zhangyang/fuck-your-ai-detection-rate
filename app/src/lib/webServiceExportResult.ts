import type { ExportResult } from "@/types/app";
import { roundArtifactPathsMatch } from "@/lib/roundArtifactSnapshot";
import {
  assertExportArtifactMatchesEvidence,
  assertExportEvidenceCanDownload,
  parseExportEvidence,
} from "@/lib/exportEvidence";
import { createHttpRequestError } from "@/lib/webServiceHttp";
import {
  decodeHeaderValue,
  downloadBlob,
  extractDownloadFilename,
  parseExportIssueSamples,
} from "@/lib/webServiceExportHeaders";

type ExportResponseExpectation = {
  outputPath: string;
  expectedDocId?: string;
  expectedRound?: number;
  expectedCompareRevision?: string;
  expectedContentRevision?: string;
  expectedArtifactSnapshotDigest?: string;
};

function assertExportResponseIdentity(
  headers: Headers,
  expected: ExportResponseExpectation,
): {
  outputPath: string;
  docId: string;
  round: number | undefined;
  compareRevision: string;
  contentRevision: string;
  artifactSnapshotDigest: string;
} {
  const outputPath = decodeHeaderValue(headers.get("X-Export-Output-Path"));
  const docId = decodeHeaderValue(headers.get("X-Export-Doc-Id"));
  const rawRound = String(headers.get("X-Export-Round") ?? "").trim();
  const round = rawRound ? Number(rawRound) : undefined;
  const compareRevision = decodeHeaderValue(headers.get("X-Export-Compare-Revision"));
  const contentRevision = String(headers.get("X-Export-Content-Revision") ?? "").trim();
  const artifactSnapshotDigest = String(headers.get("X-Export-Artifact-Snapshot-Digest") ?? "").trim();
  const mismatch = !outputPath
    || !roundArtifactPathsMatch(outputPath, expected.outputPath)
    || (expected.expectedDocId !== undefined && docId !== expected.expectedDocId)
    || (expected.expectedRound !== undefined && round !== expected.expectedRound)
    || (expected.expectedCompareRevision !== undefined && compareRevision !== expected.expectedCompareRevision)
    || (expected.expectedContentRevision !== undefined && contentRevision !== expected.expectedContentRevision)
    || (
      expected.expectedArtifactSnapshotDigest !== undefined
      && artifactSnapshotDigest !== expected.expectedArtifactSnapshotDigest
    );
  if (mismatch) {
    throw new Error("导出已阻断：服务端证据不属于请求的论文轮次或正文版本，文件未下载。");
  }
  return {
    outputPath,
    docId,
    round,
    compareRevision,
    contentRevision,
    artifactSnapshotDigest,
  };
}

export async function exportResponseToResult(
  response: Response,
  targetFormat: "txt" | "docx",
  expected: ExportResponseExpectation,
): Promise<ExportResult> {
  if (!response.ok) {
    const responseText = await response.text();
    throw createHttpRequestError(response, responseText);
  }
  const responseFormat = String(response.headers.get("X-Export-Format") ?? "").trim().toLowerCase();
  if (responseFormat !== targetFormat) {
    throw new Error("导出已阻断：服务端返回的文件格式与请求不一致，文件未下载。");
  }
  const contentType = String(response.headers.get("Content-Type") ?? "").toLowerCase();
  if (
    (targetFormat === "docx" && !contentType.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
    || (targetFormat === "txt" && !contentType.includes("text/plain"))
  ) {
    throw new Error("导出已阻断：服务端返回的内容类型与请求不一致，文件未下载。");
  }
  const evidence = parseExportEvidence(response.headers);
  assertExportEvidenceCanDownload(evidence, targetFormat);
  const responseIdentity = assertExportResponseIdentity(response.headers, expected);
  const filename = extractDownloadFilename(
    response.headers.get("Content-Disposition"),
    `current-round.${targetFormat}`,
  );
  const exportPath = decodeHeaderValue(response.headers.get("X-Export-Path")) || filename;
  const layoutMode = response.headers.get("X-Export-Layout-Mode") || "";
  const paragraphSource = response.headers.get("X-Export-Paragraph-Source") || "";
  const formatMode = response.headers.get("X-Export-Format-Mode") || "";
  const formatScope = response.headers.get("X-Export-Format-Scope") || "";
  const validationPath = decodeHeaderValue(response.headers.get("X-Export-Validation-Path"));
  const auditPath = decodeHeaderValue(response.headers.get("X-Export-Audit-Path"));
  const auditIssueCountHeader = response.headers.get("X-Export-Audit-Issue-Count") || "0";
  const auditIssueCount = Number(auditIssueCountHeader) || 0;
  const ooxmlAuditPath = decodeHeaderValue(response.headers.get("X-Export-Ooxml-Audit-Path"));
  const ooxmlAuditIssueCountHeader = response.headers.get("X-Export-Ooxml-Audit-Issue-Count") || "0";
  const ooxmlAuditIssueCount = Number(ooxmlAuditIssueCountHeader) || 0;
  const formatLockPath = decodeHeaderValue(response.headers.get("X-Export-Format-Lock-Path"));
  const formatLockIssueCount = Number(response.headers.get("X-Export-Format-Lock-Issue-Count") || "0") || 0;
  const formatLockEditableChecked = Number(response.headers.get("X-Export-Format-Lock-Editable-Checked") || "0") || 0;
  const contentContractPath = decodeHeaderValue(response.headers.get("X-Export-Content-Contract-Path"));
  const contentContractReady = response.headers.get("X-Export-Content-Contract-Ready") === "1";
  const contentContractIssueCount = Number(response.headers.get("X-Export-Content-Contract-Issue-Count") || "0") || 0;
  const editableUnitCount = Number(response.headers.get("X-Export-Editable-Unit-Count") || "0") || 0;
  const protectedUnitCount = Number(response.headers.get("X-Export-Protected-Unit-Count") || "0") || 0;
  const protectedHeadingCount = Number(response.headers.get("X-Export-Protected-Heading-Count") || "0") || 0;
  const editableHeadingCount = Number(response.headers.get("X-Export-Editable-Heading-Count") || "0") || 0;
  const modelInputMatchesEditableUnits = response.headers.get("X-Export-Model-Input-Scope-Match") === "1";
  const guardPath = decodeHeaderValue(response.headers.get("X-Export-Guard-Path"));
  const guardIssueCountHeader = response.headers.get("X-Export-Guard-Issue-Count") || "0";
  const guardIssueCount = Number(guardIssueCountHeader) || 0;
  const guardWarningCountHeader = response.headers.get("X-Export-Guard-Warning-Count") || "0";
  const guardWarningCount = Number(guardWarningCountHeader) || 0;
  const guardIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Guard-Issue-Samples"));
  const auditIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Audit-Issue-Samples"));
  const ooxmlAuditIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Ooxml-Audit-Issue-Samples"));
  const blob = await response.blob();
  await assertExportArtifactMatchesEvidence(evidence, blob, targetFormat);
  downloadBlob(blob, filename);
  return {
    format: targetFormat,
    path: exportPath,
    ...responseIdentity,
    evidenceVersion: evidence.version ?? undefined,
    overallStatus: evidence.overallStatus,
    certification: evidence.certification ?? undefined,
    sourceKind: evidence.sourceKind,
    contentContractStatus: evidence.contentContractStatus,
    formatLockStatus: evidence.formatLockStatus,
    checksPerformed: evidence.checksPerformed,
    exportAttemptId: evidence.exportAttemptId,
    artifactSha256: evidence.artifactSha256,
    evidenceManifestPath: evidence.evidenceManifestPath,
    layoutMode,
    paragraphSource,
    formatMode,
    formatScope,
    validationPath,
    auditPath,
    auditIssueCount,
    ooxmlAuditPath,
    ooxmlAuditIssueCount,
    formatLockPath,
    formatLockIssueCount,
    formatLockEditableChecked,
    contentContractPath,
    contentContractReady,
    contentContractIssueCount,
    editableUnitCount,
    protectedUnitCount,
    protectedHeadingCount,
    editableHeadingCount,
    modelInputMatchesEditableUnits,
    guardPath,
    guardIssueCount,
    guardWarningCount,
    guardIssueSamples,
    auditIssueSamples,
    ooxmlAuditIssueSamples,
  };
}
