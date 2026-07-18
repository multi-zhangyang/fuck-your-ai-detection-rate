import {
  normalizeFailedAttemptEvidenceList,
  normalizeFailedAttemptReasonFields,
} from "@/lib/failedAttemptEvidence";
import type {
  BatchRerunFailure,
  ExportFailureDetails,
  ExportIssueSample,
} from "@/types/app";

export function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function normalizeExportIssueSample(value: unknown): ExportIssueSample | null {
  const record = asPlainRecord(value);
  if (!record) return null;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const severity = typeof record.severity === "string" ? record.severity.trim() : "";
  const location = typeof record.location === "string" ? record.location.trim() : "";
  const sample = typeof record.sample === "string" ? record.sample.trim() : "";
  if (!message && !code && !sample) return null;
  return {
    code: code || undefined,
    severity: severity || undefined,
    message: message || code || "检查项",
    location: location || undefined,
    sample: sample || undefined,
  };
}

export function normalizeExportFailureDetails(value: unknown): ExportFailureDetails | null {
  const record = asPlainRecord(value);
  if (!record) return null;
  const samples = Array.isArray(record.samples)
    ? record.samples.map(normalizeExportIssueSample).filter((item): item is ExportIssueSample => Boolean(item))
    : [];
  const message = typeof record.message === "string" ? record.message.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  if (!message && !label && !samples.length) return null;
  return {
    stage: typeof record.stage === "string" ? record.stage : undefined,
    label: label || undefined,
    message: message || label || "导出被拦截",
    reportPath: typeof record.reportPath === "string" ? record.reportPath : undefined,
    issueCount: Number(record.issueCount) || 0,
    warningCount: Number(record.warningCount) || 0,
    samples,
  };
}

export function extractExportFailure(error: unknown): ExportFailureDetails | null {
  const payload = asPlainRecord((error as { payload?: unknown } | null)?.payload);
  return normalizeExportFailureDetails(payload?.exportFailure);
}

export function extractRerunFailureExtras(error: unknown): Partial<BatchRerunFailure> {
  const payload = asPlainRecord((error as { payload?: unknown } | null)?.payload);
  const failure = asPlainRecord(payload?.failure);
  if (!failure) {
    return {};
  }
  const quality = asPlainRecord(failure.quality) as BatchRerunFailure["quality"] | null;
  const failedAttempts = normalizeFailedAttemptEvidenceList(failure.failedAttempts);
  const failureReason = normalizeFailedAttemptReasonFields(
    failure.guardCategory,
    failure.issueCodes,
  );
  const rerunFallbackReason = normalizeFailedAttemptReasonFields(
    failure.rerunFallbackGuardCategory,
    failure.rerunFallbackIssueCodes,
  );
  return {
    ...(failureReason ? {
      guardCategory: failureReason.guardCategory,
      issueCodes: failureReason.issueCodes,
      errorStored: false as const,
      reasoningSuppressed: true as const,
      providerContentStored: false as const,
    } : {}),
    ...(failedAttempts.length ? { failedAttempts } : {}),
    ...(typeof failure.rerunStatus === "string" ? { rerunStatus: failure.rerunStatus } : {}),
    ...(typeof failure.rerunFallbackMode === "string" ? { rerunFallbackMode: failure.rerunFallbackMode } : {}),
    ...(rerunFallbackReason ? {
      rerunFallbackGuardCategory: rerunFallbackReason.guardCategory,
      rerunFallbackIssueCodes: rerunFallbackReason.issueCodes,
      rerunFallbackErrorStored: false as const,
    } : {}),
    ...(quality ? { quality } : {}),
  };
}
