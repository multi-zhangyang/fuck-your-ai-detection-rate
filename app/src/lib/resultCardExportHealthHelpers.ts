import type { ExportIssueSample } from "@/types/app";

export type ExportHealthBadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";
export type ExportHealthSection = {
  label: string;
  value: string;
  variant: ExportHealthBadgeVariant;
  path?: string;
  samples: string[];
  emptyText: string;
};

export function buildExportHealthSection(label: string, issueCount: number, warningCount: number, path: string | undefined, samples: ExportIssueSample[] | undefined): ExportHealthSection {
  return {
    label,
    value: formatExportIssueCount(issueCount, warningCount),
    variant: getExportIssueVariant(issueCount, warningCount),
    path,
    samples: (samples ?? []).map(formatExportIssueSample).filter(Boolean).slice(0, 3),
    emptyText: "暂无问题",
  };
}

export function formatExportIssueSample(sample: ExportIssueSample): string {
  return [sample.code, sample.message, sample.location, sample.sample].filter(Boolean).join(" · ");
}

export function getExportIssueVariant(issueCount: number, warningCount: number): ExportHealthBadgeVariant {
  if (issueCount > 0) return "danger";
  return warningCount > 0 ? "warning" : "secondary";
}

export function formatExportIssueCount(issueCount: number, warningCount: number): string {
  if (issueCount > 0) return `${issueCount} 项`;
  return warningCount > 0 ? `${warningCount} 条提示` : "通过";
}
