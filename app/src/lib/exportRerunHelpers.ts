import { formatFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";
import type { BatchRerunFailure, RoundCompareData } from "@/types/app";

export function getRerunFailureScopeKey(compareData: RoundCompareData | null | undefined): string {
  if (!compareData) {
    return "";
  }
  return compareData.outputPath || compareData.manifestPath || `${compareData.docId}:${compareData.round}`;
}

export function scopeRerunFailures(failures: BatchRerunFailure[], compareData: RoundCompareData | null | undefined): BatchRerunFailure[] {
  const scopeKey = getRerunFailureScopeKey(compareData);
  if (!scopeKey) {
    return [];
  }
  return failures
    .filter((failure) => failure.chunkId !== "预览刷新")
    .map((failure) => ({ ...failure, scopeKey }));
}

export function formatBatchRerunFailures(failures: BatchRerunFailure[], limit = 3): string {
  if (!failures.length) {
    return "";
  }
  const preview = failures
    .slice(0, limit)
    .map((failure) => `${failure.chunkId}：${formatFailedAttemptEvidence(
      failure,
      "重跑未完成；原始错误未展示。",
    )}`)
    .join("；");
  const more = failures.length > limit ? `；另有 ${failures.length - limit} 个失败` : "";
  return `${preview}${more}`;
}

export function formatBatchRerunSummary(actionLabel: string, successCount: number, totalCount: number, failures: BatchRerunFailure[], suffix = ""): string {
  if (!failures.length) {
    return `已${actionLabel} ${successCount}/${totalCount} 个块。${suffix}`;
  }
  if (successCount > 0) {
    return `已${actionLabel} ${successCount}/${totalCount} 个块；失败 ${failures.length} 个：${formatBatchRerunFailures(failures)}。${suffix}`;
  }
  return `${actionLabel}全部失败：${formatBatchRerunFailures(failures)}。`;
}
