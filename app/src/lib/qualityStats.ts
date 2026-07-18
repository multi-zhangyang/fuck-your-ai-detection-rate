import type { ExportResult, RoundCompareData, RoundResult, RunAuditSummary, PromptOption, PromptWorkflow, ModelConfig, ReviewDecision } from "@/types/app";
import { hasTrustedExportEvidence } from "@/lib/exportEvidence";
import { hasFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";
import { normalizePromptSequence } from "@/lib/promptRegistry";
import { isReviewDecisionConfirmed } from "@/lib/resultCardDecisionHelpers";

export function buildQualityStats(
  compareData: RoundCompareData | null,
  exportResult: ExportResult | null,
  reviewDecisions: Record<string, ReviewDecision> = {},
) {
  const chunks = compareData?.chunks ?? [];
  const reviewChunks = chunks.filter(
    (chunk) => chunk.quality?.needsReview || (
      chunk.rateAuditStrategyReviewRequired === true
      && !isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId] ?? "rewrite")
    ),
  );
  const highRiskChunkCount = chunks.filter((chunk) => {
    const flags = new Set((chunk.quality?.flags ?? []).map((flag) => String(flag)));
    return (
      chunk.fallbackMode === "source"
      || flags.has("source_fallback")
      || flags.has("targeted_rerun_fallback")
      || chunk.rerunStatus === "fallback"
      || Boolean(chunk.rerunFallbackMode)
      || (hasFailedAttemptEvidence(chunk) && Boolean(chunk.quality?.needsReview))
    );
  }).length;
  const missingCitationCount = chunks.reduce((total, chunk) => total + (chunk.quality?.missingCitationCount ?? 0), 0);
  const protectedTokenCount = chunks.reduce((total, chunk) => total + (chunk.quality?.protectedTokenCount ?? 0), 0);
  const machineLikeRiskCount = chunks.reduce((total, chunk) => total + (chunk.quality?.machineLikeRiskCount ?? 0), 0);
  const contentContractIssueCount = Number(exportResult?.contentContractIssueCount ?? 0) || 0;
  const editableHeadingCount = Number(exportResult?.editableHeadingCount ?? 0) || 0;
  const contractStateIssue = exportResult?.contentContractPath && !exportResult.contentContractReady ? 1 : 0;
  const exportEvidenceBlockingCount = exportResult && !hasTrustedExportEvidence(exportResult) ? 1 : 0;
  return {
    chunkCount: chunks.length,
    reviewChunkCount: reviewChunks.length,
    highRiskChunkCount,
    missingCitationCount,
    protectedTokenCount,
    machineLikeRiskCount,
    guardIssueCount: exportResult?.guardIssueCount ?? 0,
    preflightIssueCount: exportResult?.preflightIssueCount ?? 0,
    auditIssueCount: exportResult?.auditIssueCount ?? 0,
    ooxmlAuditIssueCount: exportResult?.ooxmlAuditIssueCount ?? 0,
    formatLockIssueCount: exportResult?.formatLockIssueCount ?? 0,
    contentContractIssueCount,
    editableHeadingCount,
    contentContractBlockingCount: Math.max(
      contentContractIssueCount,
      editableHeadingCount > 0 ? 1 : 0,
      contractStateIssue,
    ),
    contentContractReady: exportResult?.contentContractReady ?? false,
    exportEvidenceBlockingCount,
    exportSourceKind: exportResult?.sourceKind ?? "unknown",
  };
}

export function buildCurrentRunAudit(
  roundResult: RoundResult | null,
  compareData: RoundCompareData | null,
  modelConfig: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): RunAuditSummary {
  const qualitySummary = (roundResult?.qualitySummary ?? compareData?.qualitySummary ?? {}) as NonNullable<RoundResult["qualitySummary"]>;
  const paragraphSplitSummary = compareData?.paragraphSplitSummary ?? qualitySummary.paragraphSplitSummary;
  const chunkCount = compareData?.chunkCount ?? qualitySummary.paragraphSplitSummary?.chunkCount ?? roundResult?.inputSegmentCount ?? null;
  const promptProfile = compareData?.promptProfile ?? modelConfig.promptProfile;
  return {
    ...(roundResult?.runAudit ?? {}),
    promptProfile,
    promptSequence: normalizePromptSequence(compareData?.promptSequence ?? modelConfig.promptSequence, promptOptions, promptProfile, promptWorkflows),
    estimatedApiCalls: qualitySummary.estimatedApiCalls ?? chunkCount,
    chunkCount,
    paragraphCount: compareData?.paragraphCount ?? qualitySummary.paragraphSplitSummary?.paragraphCount ?? roundResult?.paragraphCount ?? null,
    splitParagraphCount: paragraphSplitSummary?.splitParagraphCount ?? null,
    validationRetryCount: qualitySummary.validationRetryCount ?? 0,
    sourceFallbackCount: qualitySummary.sourceFallbackCount ?? 0,
    validationEventCount: qualitySummary.validationEventCount ?? compareData?.validationEvents?.length ?? 0,
    machineLikeRiskCount: qualitySummary.machineLikeRiskCount ?? null,
    protectedTokenCount: qualitySummary.protectedTokenCount ?? null,
  };
}

export function buildExportRiskMessages(
  compareData: RoundCompareData | null,
  exportResult: ExportResult | null,
  reviewDecisions: Record<string, ReviewDecision> = {},
): string[] {
  const stats = buildQualityStats(compareData, exportResult, reviewDecisions);
  const messages: string[] = [];
  if (stats.reviewChunkCount > 0) messages.push(`${stats.reviewChunkCount} 个 Diff 块仍标记为需处理`);
  if (stats.highRiskChunkCount > 0) messages.push(`${stats.highRiskChunkCount} 个高风险块默认将导出原文，请先在 Diff 中确认`);
  if (stats.missingCitationCount > 0) messages.push(`${stats.missingCitationCount} 处引用可能缺失`);
  if (stats.machineLikeRiskCount > 0) messages.push(`${stats.machineLikeRiskCount} 条表达提示`);
  if (stats.exportEvidenceBlockingCount > 0) messages.push("导出证据缺失或不完整，不能视为结构通过");
  if (
    exportResult?.format === "docx"
    && !(exportResult.checksPerformed ?? []).includes("format_preflight")
  ) {
    messages.push("本次 Word 导出未执行排版预检");
  }
  if (stats.guardIssueCount > 0) messages.push(`${stats.guardIssueCount} 个导出硬审计问题`);
  if (stats.preflightIssueCount > 0) messages.push(`${stats.preflightIssueCount} 个排版预检问题`);
  if (stats.auditIssueCount > 0) messages.push(`${stats.auditIssueCount} 个保护区审计问题`);
  if (stats.ooxmlAuditIssueCount > 0) messages.push(`${stats.ooxmlAuditIssueCount} 个 Word 结构审计问题`);
  if (stats.formatLockIssueCount > 0) messages.push(`${stats.formatLockIssueCount} 个格式保真问题`);
  if (stats.contentContractIssueCount > 0) {
    const headingDetail = stats.editableHeadingCount > 0 ? `（含 ${stats.editableHeadingCount} 个误入标题）` : "";
    messages.push(`${stats.contentContractIssueCount} 个正文范围契约问题${headingDetail}`);
  } else if (stats.editableHeadingCount > 0) {
    messages.push(`${stats.editableHeadingCount} 个标题误入可编辑正文`);
  } else if (stats.contentContractBlockingCount > 0) {
    messages.push("正文范围契约未通过");
  }
  return messages;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
