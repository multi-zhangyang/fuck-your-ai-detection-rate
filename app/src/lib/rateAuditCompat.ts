import type {
  DocumentEditContract,
  RateAuditBlockingManualDimension,
  RateAuditExecutableQueueItem,
  RateAuditPlateau,
  RateAuditReadiness,
  RateAuditReport,
  RateAuditStrategyBinding,
  RateAuditStrategyPlan,
} from "@/types/app";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function nonnegativeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeBlockingManualDimension(value: unknown): RateAuditBlockingManualDimension | null {
  if (!isRecord(value)) return null;
  const dimensionId = String(value.dimensionId || "").trim();
  if (!dimensionId) return null;
  const targetChunkIds = stringList(value.targetChunkIds);
  return {
    dimensionId,
    label: String(value.label || dimensionId),
    trend: String(value.trend || "stable"),
    riskCount: nonnegativeInteger(value.riskCount),
    highRiskCount: nonnegativeInteger(value.highRiskCount),
    riskPoints: nonnegativeInteger(value.riskPoints),
    targetScope: String(value.targetScope || "manual_review"),
    targetChunkIds,
    targetChunkCount: targetChunkIds.length,
    manualReviewReason: String(value.manualReviewReason || ""),
    action: String(value.action || ""),
  };
}

function normalizeExecutableQueueItem(value: unknown): RateAuditExecutableQueueItem | null {
  if (!isRecord(value)) return null;
  const dimensionId = String(value.dimensionId || "").trim();
  if (!dimensionId) return null;
  const targetChunkIds = stringList(value.targetChunkIds);
  return {
    dimensionId,
    label: String(value.label || dimensionId),
    priority: String(value.priority || "medium"),
    trend: String(value.trend || "stable"),
    riskCount: nonnegativeInteger(value.riskCount),
    highRiskCount: nonnegativeInteger(value.highRiskCount),
    riskPoints: nonnegativeInteger(value.riskPoints),
    repairPromptId: String(value.repairPromptId || ""),
    evaluatorDimensionId: String(value.evaluatorDimensionId || ""),
    primaryMetric: String(value.primaryMetric || ""),
    targetScope: String(value.targetScope || ""),
    maxAttempts: nonnegativeInteger(value.maxAttempts),
    plateauPolicy: String(value.plateauPolicy || ""),
    targetChunkIds,
    targetChunkCount: targetChunkIds.length,
  };
}

const COMPATIBILITY_REASON = "当前诊断数据未包含完整的正文与格式契约，已禁止继续执行策略。";

export function normalizeRateAuditReport(value: RateAuditReport): RateAuditReport {
  const raw = value as RateAuditReport & Record<string, unknown>;
  const rawContract = isRecord(raw.contentContract) ? raw.contentContract : null;
  const contentContract = rawContract
    ? ({
        ...rawContract,
        issues: Array.isArray(rawContract.issues) ? rawContract.issues : [],
        semanticRangeCount: nonnegativeInteger(rawContract.semanticRangeCount),
        bookmarkRangeCount: nonnegativeInteger(rawContract.bookmarkRangeCount),
        commentRangeCount: nonnegativeInteger(rawContract.commentRangeCount),
        semanticRangeTopologyValid: rawContract.semanticRangeTopologyValid === true,
        semanticRangeIssueCount: nonnegativeInteger(rawContract.semanticRangeIssueCount),
        semanticRangeIssueCodes: stringList(rawContract.semanticRangeIssueCodes),
        semanticRangeAnchorUnitCount: nonnegativeInteger(rawContract.semanticRangeAnchorUnitCount),
        protectedSemanticRangeAnchorUnitCount: nonnegativeInteger(rawContract.protectedSemanticRangeAnchorUnitCount),
        editableSemanticRangeAnchorUnitCount: nonnegativeInteger(rawContract.editableSemanticRangeAnchorUnitCount),
        semanticRangeCoveredUnitCount: nonnegativeInteger(rawContract.semanticRangeCoveredUnitCount),
        protectedSemanticRangeCoveredUnitCount: nonnegativeInteger(rawContract.protectedSemanticRangeCoveredUnitCount),
        editableSemanticRangeCoveredUnitCount: nonnegativeInteger(rawContract.editableSemanticRangeCoveredUnitCount),
        bookmarkRangeInteriorUnitCount: nonnegativeInteger(rawContract.bookmarkRangeInteriorUnitCount),
        protectedBookmarkRangeInteriorUnitCount: nonnegativeInteger(rawContract.protectedBookmarkRangeInteriorUnitCount),
        editableBookmarkRangeInteriorUnitCount: nonnegativeInteger(rawContract.editableBookmarkRangeInteriorUnitCount),
        semanticPointReferenceUnitCount: nonnegativeInteger(rawContract.semanticPointReferenceUnitCount),
        protectedSemanticPointReferenceUnitCount: nonnegativeInteger(rawContract.protectedSemanticPointReferenceUnitCount),
        editableSemanticPointReferenceUnitCount: nonnegativeInteger(rawContract.editableSemanticPointReferenceUnitCount),
      } as DocumentEditContract)
    : null;
  const contentContractReady = Boolean(contentContract?.ready);
  const scopeContractReady = Boolean(
    contentContractReady
    && contentContract?.scopeReady
    && contentContract?.modelInputMatchesEditableUnits
    && contentContract?.semanticRangeTopologyValid
    && contentContract?.editableSemanticRangeCoveredUnitCount === 0
  );
  const formatContractReady = Boolean(
    contentContract
    && (!contentContract.formatLockApplicable || contentContract.formatLockReady),
  );

  const rawStrategy = isRecord(raw.strategyPlan) ? raw.strategyPlan : null;
  const rawPlateau = isRecord(raw.plateau) ? raw.plateau : null;
  const strategyPlateauTargets = stringList(rawStrategy?.plateauTargetChunkIds);
  const reportPlateauTargets = stringList(rawPlateau?.targetChunkIds);
  const plateauTargetChunkIds = strategyPlateauTargets.length
    ? strategyPlateauTargets
    : reportPlateauTargets;
  const plateauReached = Boolean(rawStrategy?.plateauReached || rawPlateau?.reached);
  const plateauHardStop = Boolean(rawStrategy?.hardStop || rawPlateau?.hardStop);
  const plateauActive = plateauReached || plateauHardStop;
  const plateauReason = String(rawStrategy?.plateauReason || rawPlateau?.reason || "");
  const plateauDimensionId = String(rawStrategy?.plateauDimensionId || rawPlateau?.dimensionId || "");
  const plateauAttemptLimit = Math.max(
    nonnegativeInteger(rawStrategy?.plateauAttemptLimit),
    nonnegativeInteger(rawPlateau?.attemptLimit),
  );
  const plateauTargetChunkCount = Math.max(
    plateauTargetChunkIds.length,
    nonnegativeInteger(rawStrategy?.plateauTargetChunkCount),
    nonnegativeInteger(rawPlateau?.targetChunkCount),
  );
  const plateau: RateAuditPlateau = {
    reached: plateauActive,
    reason: plateauReason,
    hardStop: plateauActive,
    dimensionId: plateauDimensionId,
    targetChunkIds: plateauTargetChunkIds,
    targetChunkCount: plateauTargetChunkCount,
    attemptLimit: plateauAttemptLimit,
    preservedPreviousText: Boolean(rawPlateau?.preservedPreviousText),
    manualReviewRequired: Boolean(rawPlateau?.manualReviewRequired || plateauActive),
  };
  const rawTargetChunkIds = rawStrategy?.targetChunkIds;
  const targetChunkIds = Array.isArray(rawTargetChunkIds)
    ? rawTargetChunkIds.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const blockingManualDimensions = Array.isArray(rawStrategy?.blockingManualDimensions)
    ? rawStrategy.blockingManualDimensions
      .map(normalizeBlockingManualDimension)
      .filter((item): item is RateAuditBlockingManualDimension => item !== null)
    : [];
  const executableQueue = Array.isArray(rawStrategy?.executableQueue)
    ? rawStrategy.executableQueue
      .map(normalizeExecutableQueueItem)
      .filter((item): item is RateAuditExecutableQueueItem => item !== null)
    : [];
  const blockingManualDimensionCount = Math.max(
    blockingManualDimensions.length,
    nonnegativeInteger(rawStrategy?.blockingManualDimensionCount),
  );
  const normalizedExecutableQueueCount = Math.max(
    executableQueue.length,
    nonnegativeInteger(rawStrategy?.executableQueueCount),
  );
  const rawBinding = isRecord(raw.strategyBinding) ? raw.strategyBinding : null;
  const rawBindingTargets = rawBinding?.targetChunkIds;
  const strategyBinding: RateAuditStrategyBinding | null = rawBinding
    ? {
        ...(rawBinding as Partial<RateAuditStrategyBinding>),
        version: Number(rawBinding.version ?? 1) || 1,
        ready: Boolean(rawBinding.ready),
        compareRevision: String(rawBinding.compareRevision || ""),
        sourceSha256: String(rawBinding.sourceSha256 || ""),
        scopeDigest: String(rawBinding.scopeDigest || ""),
        formatDigest: String(rawBinding.formatDigest || ""),
        dimensionId: String(rawBinding.dimensionId || ""),
        recommendedPromptId: String(rawBinding.recommendedPromptId || ""),
        targetChunkIds: Array.isArray(rawBindingTargets)
          ? rawBindingTargets.map((item) => String(item || "").trim()).filter(Boolean)
          : [],
        planDigest: String(rawBinding.planDigest || ""),
        reviewRevision: String(rawBinding.reviewRevision || ""),
        contentRevision: String(rawBinding.contentRevision || ""),
        artifactSnapshotDigest: String(rawBinding.artifactSnapshotDigest || ""),
        effectiveTextSha256: String(rawBinding.effectiveTextSha256 || ""),
        blockedReason: String(rawBinding.blockedReason || ""),
      }
    : null;
  const contractGateReady = Boolean(contentContractReady && scopeContractReady && formatContractReady);
  const strategyDecision = String(rawStrategy?.decision || "blocked");
  const effectiveStrategyDecision = plateauActive ? "manual_review" : strategyDecision;
  const targetedBindingReady = effectiveStrategyDecision !== "targeted_rerun" || Boolean(strategyBinding?.ready);
  const strategyCanExecute = Boolean(
    !plateauActive
    && rawStrategy?.canExecute
    && contractGateReady
    && targetedBindingReady
  );
  const strategyPlan: RateAuditStrategyPlan = {
    ...(rawStrategy as Partial<RateAuditStrategyPlan> | null),
    version: Number(rawStrategy?.version ?? 1) || 1,
    decision: rawStrategy && contractGateReady ? effectiveStrategyDecision : "blocked",
    label: String(
      rawStrategy && contractGateReady
        ? plateauActive
          ? "达到尝试上限，转人工复核"
          : rawStrategy.label || strategyDecision
        : "契约待更新"
    ),
    recommendedPromptId: plateauActive ? "" : String(rawStrategy?.recommendedPromptId || ""),
    currentPromptId: String(rawStrategy?.currentPromptId || ""),
    nextPromptId: String(rawStrategy?.nextPromptId || ""),
    dimensionId: String(rawStrategy?.dimensionId || ""),
    dimensionLabel: String(rawStrategy?.dimensionLabel || ""),
    reason: String(rawStrategy && contentContract ? rawStrategy.reason || COMPATIBILITY_REASON : COMPATIBILITY_REASON),
    action: String(rawStrategy && contractGateReady ? rawStrategy.action || "" : "重新诊断或重启本地服务后再执行下一轮。"),
    targetChunkIds,
    targetChunkCount: targetChunkIds.length,
    blockingManualDimensions,
    blockingManualDimensionCount,
    executableQueue: plateauActive ? [] : executableQueue,
    executableQueueCount: plateauActive ? 0 : normalizedExecutableQueueCount,
    selectedExecutableDimensionId: plateauActive ? "" : String(rawStrategy?.selectedExecutableDimensionId || ""),
    manualReviewRequired: Boolean(
      plateauActive
      || rawPlateau?.manualReviewRequired
      || rawStrategy?.manualReviewRequired
      || blockingManualDimensionCount > 0
      || effectiveStrategyDecision === "manual_review"
    ),
    manualReviewStillRequired: Boolean(
      plateauActive
      || rawStrategy?.manualReviewStillRequired
      || blockingManualDimensionCount > 0
    ),
    hardStop: plateauActive,
    plateauReached: plateauActive,
    plateauReason,
    plateauDimensionId,
    plateauTargetChunkIds,
    plateauTargetChunkCount,
    plateauAttemptLimit,
    contentContractReady,
    scopeContractReady,
    formatContractReady,
    canExecute: strategyCanExecute,
  };

  const rawReadiness = isRecord(raw.readiness) ? raw.readiness : null;
  const strategyDecisionReady = ["stop", "targeted_rerun", "next_dimension", "manual_review"].includes(strategyPlan.decision);
  const inferredRunReady = rawReadiness
    ? Boolean(rawReadiness.runReady && contractGateReady)
    : Boolean(raw.sourceOnly && contractGateReady);
  const inferredPreExportReady = rawReadiness
    ? Boolean(rawReadiness.preExportReady && contractGateReady)
    : Boolean(!raw.sourceOnly && contractGateReady);
  const readiness: RateAuditReadiness = {
    ...(rawReadiness as Partial<RateAuditReadiness> | null),
    status: contractGateReady
      ? String(rawReadiness?.status || (["targeted_rerun", "manual_review"].includes(strategyPlan.decision) ? "attention" : "ready"))
      : "blocked",
    strategyDecisionReady,
    contentContractReady,
    scopeContractReady,
    formatContractReady,
    runReady: inferredRunReady,
    preExportReady: inferredPreExportReady,
    blockedReason: contractGateReady ? String(rawReadiness?.blockedReason || "") : COMPATIBILITY_REASON,
  };

  return {
    ...value,
    strategyPlan,
    plateau,
    strategyBinding,
    contentContract,
    readiness,
  };
}
