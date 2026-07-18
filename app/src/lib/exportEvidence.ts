export type ExportEvidenceCheckStatus = "passed" | "failed" | "unknown" | "not_applicable";
export type ExportSourceKind = "original_docx" | "generated_docx" | "plain_text" | "unknown";
export type ExportCertification = "plain_uncertified" | "unknown";

export type ExportEvidence = {
  version: number | null;
  overallStatus: "passed" | "failed" | "unknown";
  certification: ExportCertification | null;
  sourceKind: ExportSourceKind;
  contentContractStatus: ExportEvidenceCheckStatus;
  formatLockStatus: ExportEvidenceCheckStatus;
  checksPerformed: string[];
  exportAttemptId: string;
  artifactSha256: string;
  evidenceManifestPath: string;
};

const REQUIRED_ORIGINAL_DOCX_CHECKS = [
  "document_generation",
  "format_preflight",
  "pre_export_guard",
  "content_contract",
  "text_integrity",
  "protected_text_audit",
  "ooxml_integrity",
  "format_lock",
  "post_export_contract",
] as const;

function parseCheckStatus(value: string | null): ExportEvidenceCheckStatus {
  if (value === "passed" || value === "failed" || value === "not_applicable") return value;
  return "unknown";
}

function parseSourceKind(value: string | null): ExportSourceKind {
  if (value === "original_docx" || value === "generated_docx" || value === "plain_text") return value;
  return "unknown";
}

function parseCertification(value: string | null): ExportCertification | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  return normalized === "plain_uncertified" ? normalized : "unknown";
}

export function parseExportEvidence(headers: Headers): ExportEvidence {
  const rawVersion = headers.get("X-Export-Evidence-Version");
  const parsedVersion = rawVersion ? Number(rawVersion) : Number.NaN;
  const overallStatus = headers.get("X-Export-Overall-Status");
  return {
    version: Number.isInteger(parsedVersion) ? parsedVersion : null,
    overallStatus: overallStatus === "passed" || overallStatus === "failed" ? overallStatus : "unknown",
    certification: parseCertification(headers.get("X-Export-Certification")),
    sourceKind: parseSourceKind(headers.get("X-Export-Source-Kind")),
    contentContractStatus: parseCheckStatus(headers.get("X-Export-Content-Contract-Status")),
    formatLockStatus: parseCheckStatus(headers.get("X-Export-Format-Lock-Status")),
    checksPerformed: String(headers.get("X-Export-Checks-Performed") ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    exportAttemptId: String(headers.get("X-Export-Attempt-Id") ?? "").trim(),
    artifactSha256: String(headers.get("X-Export-Artifact-Sha256") ?? "").trim().toLowerCase(),
    evidenceManifestPath: (() => {
      const value = String(headers.get("X-Export-Evidence-Manifest-Path") ?? "").trim();
      if (!value) return "";
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    })(),
  };
}

function blockEvidenceDownload(reason: string): never {
  throw new Error(`导出已阻断：服务端缺少完整、可信的导出证据，文件未下载。${reason}`);
}

export function assertExportEvidenceCanDownload(
  evidence: ExportEvidence,
  targetFormat: "txt" | "docx",
): void {
  if (evidence.version !== 1) {
    blockEvidenceDownload("请刷新页面并确认本地服务已升级后重试。");
  }
  if (evidence.overallStatus !== "passed") {
    blockEvidenceDownload("服务端没有声明本次导出已通过全部硬检查。");
  }
  if (evidence.certification === "unknown") {
    blockEvidenceDownload("服务端返回了无法识别的轮次认证状态。");
  }

  const performedChecks = new Set(evidence.checksPerformed);
  if (targetFormat === "txt") {
    if (
      evidence.sourceKind !== "plain_text"
      || evidence.contentContractStatus !== "not_applicable"
      || evidence.formatLockStatus !== "not_applicable"
      || !performedChecks.has("text_export")
    ) {
      blockEvidenceDownload("TXT 导出的证据字段不完整。");
    }
    return;
  }

  if (
    !evidence.exportAttemptId
    || !/^[a-f0-9]{64}$/.test(evidence.artifactSha256)
    || !evidence.evidenceManifestPath
  ) {
    blockEvidenceDownload("Word 成品没有绑定不可变的导出尝试、文件哈希和证据清单。");
  }

  if (evidence.sourceKind === "original_docx") {
    if (evidence.contentContractStatus !== "passed" || evidence.formatLockStatus !== "passed") {
      blockEvidenceDownload("原格式 Word 的正文契约或格式锁没有明确通过。");
    }
    const missingChecks = REQUIRED_ORIGINAL_DOCX_CHECKS.filter((check) => !performedChecks.has(check));
    if (missingChecks.length > 0) {
      blockEvidenceDownload(`缺少硬检查：${missingChecks.join("、")}。`);
    }
    return;
  }

  if (evidence.sourceKind === "generated_docx") {
    if (
      evidence.contentContractStatus !== "not_applicable"
      || evidence.formatLockStatus !== "not_applicable"
      || !performedChecks.has("document_generation")
    ) {
      blockEvidenceDownload("新建 Word 的适用范围证据不完整。");
    }
    return;
  }

  blockEvidenceDownload("服务端没有说明该 Word 是否拥有原版式基线。");
}

export async function assertExportArtifactMatchesEvidence(
  evidence: ExportEvidence,
  blob: Blob,
  targetFormat: "txt" | "docx",
): Promise<void> {
  if (targetFormat !== "docx") return;
  if (!globalThis.crypto?.subtle) {
    blockEvidenceDownload("当前浏览器无法在保存前校验 Word 文件哈希。");
  }
  const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
  if (
    signature.length !== 4
    || signature[0] !== 0x50
    || signature[1] !== 0x4b
    || signature[2] !== 0x03
    || signature[3] !== 0x04
  ) {
    blockEvidenceDownload("响应内容不是有效的 DOCX/ZIP 文件。");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const actualSha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
  if (actualSha256 !== evidence.artifactSha256) {
    blockEvidenceDownload("响应文件与服务端证据清单的 SHA-256 不一致。");
  }
}

export function hasTrustedExportEvidence(value: {
  format?: string;
  evidenceVersion?: number;
  overallStatus?: string;
  certification?: string;
  sourceKind?: string;
  contentContractStatus?: string;
  formatLockStatus?: string;
  checksPerformed?: string[];
  exportAttemptId?: string;
  artifactSha256?: string;
  evidenceManifestPath?: string;
}): boolean {
  try {
    assertExportEvidenceCanDownload(
      {
        version: value.evidenceVersion ?? null,
        overallStatus: value.overallStatus === "passed" || value.overallStatus === "failed" ? value.overallStatus : "unknown",
        certification: parseCertification(value.certification ?? null),
        sourceKind: parseSourceKind(value.sourceKind ?? null),
        contentContractStatus: parseCheckStatus(value.contentContractStatus ?? null),
        formatLockStatus: parseCheckStatus(value.formatLockStatus ?? null),
        checksPerformed: Array.isArray(value.checksPerformed) ? value.checksPerformed : [],
        exportAttemptId: String(value.exportAttemptId ?? ""),
        artifactSha256: String(value.artifactSha256 ?? "").toLowerCase(),
        evidenceManifestPath: String(value.evidenceManifestPath ?? ""),
      },
      value.format === "txt" ? "txt" : "docx",
    );
    return true;
  } catch {
    return false;
  }
}
