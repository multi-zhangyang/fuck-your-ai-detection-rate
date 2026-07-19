import {
  buildExportHealthSection,
  type ExportHealthBadgeVariant,
  type ExportHealthSection,
} from "@/lib/resultCardHelpers";
import { hasTrustedExportEvidence } from "@/lib/exportEvidence";
import type { ExportIssueSample, ExportResult } from "@/types/app";

function buildUnavailableSection(
  label: string,
  state: "not_applicable" | "not_performed" | "unknown",
): ExportHealthSection {
  const copy = state === "not_applicable"
    ? { value: "不适用", variant: "outline" as const, emptyText: "当前导出没有原 Word 版式基线，此项不适用。" }
    : state === "not_performed"
      ? { value: "未执行", variant: "warning" as const, emptyText: "本次导出没有执行这一检查，不能按通过展示。" }
      : { value: "未知", variant: "danger" as const, emptyText: "缺少版本化证据，无法确认这一检查是否执行。" };
  return { label, path: undefined, samples: [], ...copy };
}

function buildEvidenceAwareSection({
  label,
  checkId,
  trustedEvidence,
  checksPerformed,
  sourceKind,
  issueCount,
  warningCount = 0,
  path,
  samples,
  explicitStatus,
}: {
  label: string;
  checkId: string;
  trustedEvidence: boolean;
  checksPerformed: Set<string>;
  sourceKind: ExportResult["sourceKind"];
  issueCount: number;
  warningCount?: number;
  path?: string;
  samples?: ExportIssueSample[];
  explicitStatus?: ExportResult["contentContractStatus"];
}): ExportHealthSection {
  if (!trustedEvidence) return buildUnavailableSection(label, "unknown");
  if (explicitStatus === "not_applicable") return buildUnavailableSection(label, "not_applicable");
  if (!checksPerformed.has(checkId)) {
    const originalDocxOnlyChecks = new Set([
      "pre_export_guard",
      "protected_text_audit",
      "ooxml_integrity",
      "format_lock",
      "content_contract",
    ]);
    return buildUnavailableSection(
      label,
      sourceKind === "generated_docx" && originalDocxOnlyChecks.has(checkId)
        ? "not_applicable"
        : "not_performed",
    );
  }
  const effectiveIssueCount = explicitStatus === "failed" ? Math.max(1, issueCount) : issueCount;
  return buildExportHealthSection(label, effectiveIssueCount, warningCount, path, samples);
}

export function deriveExportHealthPanelState(exportResult: ExportResult | null): {
  hasDocxExport: boolean;
  statusLabel: string;
  statusVariant: ExportHealthBadgeVariant;
  sections: ExportHealthSection[];
  blockingIssueCount: number;
} | null {
  const hasDocxExport = Boolean(exportResult?.format === "docx" && exportResult?.path);
  if (!hasDocxExport || !exportResult) {
    return null;
  }
  const plainUncertified = exportResult.certification === "plain_uncertified";
  const trustedEvidence = hasTrustedExportEvidence(exportResult);
  const evidenceBlockingCount = trustedEvidence ? 0 : 1;
  const checksPerformed = new Set(exportResult.checksPerformed ?? []);
  const guardIssueCount = Number(exportResult.guardIssueCount ?? 0) || 0;
  const guardWarningCount = Number(exportResult.guardWarningCount ?? 0) || 0;
  const auditIssueCount = Number(exportResult.auditIssueCount ?? 0) || 0;
  const ooxmlAuditIssueCount = Number(exportResult.ooxmlAuditIssueCount ?? 0) || 0;
  const formatLockIssueCount = Number(exportResult.formatLockIssueCount ?? 0) || 0;
  const contentContractIssueCount = Number(exportResult.contentContractIssueCount ?? 0) || 0;
  const editableHeadingCount = Number(exportResult.editableHeadingCount ?? 0) || 0;
  const contractStateIssue = exportResult.contentContractPath && !exportResult.contentContractReady ? 1 : 0;
  const contentContractBlockingCount = Math.max(
    contentContractIssueCount,
    editableHeadingCount > 0 ? 1 : 0,
    contractStateIssue,
  );
  const blockingIssueCount = evidenceBlockingCount
    + guardIssueCount
    + auditIssueCount
    + ooxmlAuditIssueCount
    + formatLockIssueCount
    + contentContractBlockingCount;
  const warningCount = guardWarningCount;
  const statusLabel = evidenceBlockingCount > 0
    ? "证据缺失"
    : blockingIssueCount > 0
      ? "需确认"
      : warningCount > 0
        ? "有提示"
        : plainUncertified
          ? "未认证轮次"
          : exportResult.sourceKind === "generated_docx"
            ? "新建 Word"
            : "结构通过";
  const statusVariant: ExportHealthBadgeVariant = blockingIssueCount > 0
    ? "danger"
    : warningCount > 0
      ? "warning"
      : plainUncertified
        ? "warning"
        : exportResult.sourceKind === "generated_docx"
          ? "outline"
          : "secondary";
  const sections: ExportHealthSection[] = [
    ...(plainUncertified
      ? [{
          label: "轮次认证",
          value: "未认证",
          variant: "warning" as const,
          path: undefined,
          samples: [],
          emptyText: "文件生成成功，但不属于 FYADR 认证轮次。",
        }]
      : []),
    trustedEvidence
      ? {
          label: "导出证据",
          value: "已绑定",
          variant: "secondary",
          path: exportResult.evidenceManifestPath,
          samples: [],
          emptyText: exportResult.artifactSha256 ? `成品哈希 ${exportResult.artifactSha256.slice(0, 12)}…` : "已绑定本次导出证据。",
        }
      : buildUnavailableSection("导出证据", "unknown"),
    buildEvidenceAwareSection({ label: "保护", checkId: "pre_export_guard", trustedEvidence, checksPerformed, sourceKind: exportResult.sourceKind, issueCount: guardIssueCount, warningCount: guardWarningCount, path: exportResult.guardPath, samples: exportResult.guardIssueSamples }),
    buildEvidenceAwareSection({ label: "审计", checkId: "protected_text_audit", trustedEvidence, checksPerformed, sourceKind: exportResult.sourceKind, issueCount: auditIssueCount, path: exportResult.auditPath, samples: exportResult.auditIssueSamples }),
    buildEvidenceAwareSection({ label: "结构", checkId: "ooxml_integrity", trustedEvidence, checksPerformed, sourceKind: exportResult.sourceKind, issueCount: ooxmlAuditIssueCount, path: exportResult.ooxmlAuditPath, samples: exportResult.ooxmlAuditIssueSamples }),
    buildEvidenceAwareSection({ label: "格式锁", checkId: "format_lock", trustedEvidence, checksPerformed, sourceKind: exportResult.sourceKind, issueCount: formatLockIssueCount, path: exportResult.formatLockPath, explicitStatus: exportResult.formatLockStatus }),
    buildEvidenceAwareSection({ label: "正文契约", checkId: "content_contract", trustedEvidence, checksPerformed, sourceKind: exportResult.sourceKind, issueCount: contentContractBlockingCount, path: exportResult.contentContractPath, explicitStatus: exportResult.contentContractStatus }),
  ];
  return {
    hasDocxExport,
    statusLabel,
    statusVariant,
    sections,
    blockingIssueCount,
  };
}
