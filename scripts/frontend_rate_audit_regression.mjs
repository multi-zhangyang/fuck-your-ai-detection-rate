import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const APP_DIR = resolve(ROOT, "app");
const requireFromApp = createRequire(resolve(APP_DIR, "package.json"));
const ts = requireFromApp("typescript");
const files = {
  app: readFileSync(resolve(ROOT, "app/src/App.tsx"), "utf8"),
  nav: readFileSync(resolve(ROOT, "app/src/lib/workbenchNav.ts"), "utf8"),
  serviceInterface: readFileSync(resolve(ROOT, "app/src/lib/appService.ts"), "utf8"),
  webService: readFileSync(resolve(ROOT, "app/src/lib/webServiceDocuments.ts"), "utf8"),
  hook: readFileSync(resolve(ROOT, "app/src/hooks/useRateAudit.ts"), "utf8"),
  compatibility: readFileSync(resolve(ROOT, "app/src/lib/rateAuditCompat.ts"), "utf8"),
  autoNextGate: readFileSync(resolve(ROOT, "app/src/lib/rateAuditAutoNextGate.ts"), "utf8"),
  roundSuccess: readFileSync(resolve(ROOT, "app/src/lib/runRoundSuccessCompletionHandlers.ts"), "utf8"),
  autoRunGuard: readFileSync(resolve(ROOT, "app/src/lib/autoRunGuardPlanning.ts"), "utf8"),
  autoRunPerform: readFileSync(resolve(ROOT, "app/src/lib/autoRunPerformHandlers.ts"), "utf8"),
  autoRunTypes: readFileSync(resolve(ROOT, "app/src/lib/autoRunTypes.ts"), "utf8"),
  roundInputGate: readFileSync(resolve(ROOT, "app/src/lib/roundInputRevisionGate.ts"), "utf8"),
  runRoundApi: readFileSync(resolve(ROOT, "app/src/lib/webServiceRunRoundApi.ts"), "utf8"),
  strategyExecution: readFileSync(resolve(ROOT, "app/src/lib/rateAuditStrategyExecution.ts"), "utf8"),
  batchAttach: readFileSync(resolve(ROOT, "app/src/lib/batchRerunAttachHandlers.ts"), "utf8"),
  page: readFileSync(resolve(ROOT, "app/src/components/QualityReportPage.tsx"), "utf8"),
  dashboard: readFileSync(resolve(ROOT, "app/src/components/RateAuditDashboard.tsx"), "utf8"),
  types: readFileSync(resolve(ROOT, "app/src/types/app.ts"), "utf8"),
  exportParser: readFileSync(resolve(ROOT, "app/src/lib/webServiceExportResult.ts"), "utf8"),
  exportHealth: readFileSync(resolve(ROOT, "app/src/lib/exportHealthViewModel.ts"), "utf8"),
  qualityStats: readFileSync(resolve(ROOT, "app/src/lib/qualityStats.ts"), "utf8"),
  reviewDefaults: readFileSync(resolve(ROOT, "app/src/lib/reviewDecisionDefaults.ts"), "utf8"),
  reviewRefresh: readFileSync(resolve(ROOT, "app/src/lib/appReviewRefreshHandlers.ts"), "utf8"),
  resultDecisions: readFileSync(resolve(ROOT, "app/src/lib/resultCardDecisionHelpers.ts"), "utf8"),
  chunkDecisionState: readFileSync(resolve(ROOT, "app/src/lib/chunkQualityDecisionHelpers.ts"), "utf8"),
  chunkViewState: readFileSync(resolve(ROOT, "app/src/lib/rewriteDiffPanelChunkViewModel.ts"), "utf8"),
  diffDashboard: readFileSync(resolve(ROOT, "app/src/lib/diffDashboard.ts"), "utf8"),
  chunkAlerts: readFileSync(resolve(ROOT, "app/src/components/RewriteDiffChunkAlerts.tsx"), "utf8"),
  chunkMeta: readFileSync(resolve(ROOT, "app/src/components/ChunkQualityMeta.tsx"), "utf8"),
  chunkCopy: readFileSync(resolve(ROOT, "app/src/lib/chunkQualityBarCopy.ts"), "utf8"),
  resultFormat: readFileSync(resolve(ROOT, "app/src/lib/resultCardFormatHelpers.ts"), "utf8"),
  resultReview: readFileSync(resolve(ROOT, "app/src/lib/resultCardReviewHelpers.ts"), "utf8"),
  sidebar: readFileSync(resolve(ROOT, "app/src/components/AppSidebar.tsx"), "utf8"),
  index: readFileSync(resolve(ROOT, "app/index.html"), "utf8"),
};

const checks = [];
function check(condition, message) {
  if (!condition) throw new Error(message);
  checks.push(message);
}

function buildTypeScriptModuleUrl(relativePath, dependencyUrls = {}) {
  const source = readFileSync(resolve(APP_DIR, relativePath), "utf8");
  let { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
  });
  for (const [specifier, dependencyUrl] of Object.entries(dependencyUrls)) {
    const quotedSpecifier = JSON.stringify(specifier);
    if (!outputText.includes(quotedSpecifier)) {
      throw new Error(`Runtime dependency ${specifier} was not emitted by ${relativePath}`);
    }
    outputText = outputText.replaceAll(quotedSpecifier, JSON.stringify(dependencyUrl));
  }
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

async function importTypeScriptModule(relativePath, dependencyUrls = {}) {
  return import(buildTypeScriptModuleUrl(relativePath, dependencyUrls));
}

async function importCompatibilityModule() {
  return importTypeScriptModule("src/lib/rateAuditCompat.ts");
}

async function importReviewDecisionDefaultsModule() {
  const failedAttemptEvidenceUrl = buildTypeScriptModuleUrl("src/lib/failedAttemptEvidence.ts");
  const diffDashboardUrl = buildTypeScriptModuleUrl("src/lib/diffDashboard.ts", {
    "@/lib/failedAttemptEvidence": failedAttemptEvidenceUrl,
  });
  return importTypeScriptModule("src/lib/reviewDecisionDefaults.ts", {
    "@/lib/diffDashboard": diffDashboardUrl,
    "@/lib/failedAttemptEvidence": failedAttemptEvidenceUrl,
  });
}

check(files.serviceInterface.includes("getRateAudit(sourcePath: string, outputPath?: string): Promise<RateAuditReport>"), "AppService exposes the rate-audit contract");
check(files.serviceInterface.includes("startRateAuditStrategy(request: RateAuditStrategyExecutionRequest, modelConfig: ModelConfig): Promise<string>"), "AppService exposes the verified strategy execution contract");
check(files.webService.includes('"/api/rate-audit') || files.webService.includes("`/api/rate-audit?"), "web service calls the rate-audit endpoint");
check(files.webService.includes('"/api/rate-audit/execute"') && files.webService.includes("{ ...strategy, modelConfig }"), "strategy execution uses a dedicated POST endpoint with the server binding fields");
check(files.hook.includes("requestIdRef") && files.hook.includes("requestIdRef.current !== requestId"), "stale audit responses cannot overwrite the selected document");
check(
  files.hook.includes("setValue(null)")
  && files.page.includes("rateAudit.loading")
  && files.page.includes("Boolean(rateAudit.error)"),
  "an old executable report is removed and its action disabled throughout every identity/revision refresh",
);
check(
  files.page.includes("compareData?.updatedAt, reviewRevision")
  && files.hook.includes("compareRevision?: string | null")
  && files.hook.includes("[compareRevision, outputPath, service, sourcePath]"),
  "compare or saved-review revision changes refresh the rate audit even when document paths stay unchanged",
);
check(
  files.reviewRefresh.includes("saved.updatedAt")
  && files.reviewRefresh.includes("setReviewRevision"),
  "persisted review decisions invalidate the materialized RateAudit result",
);
check(files.hook.includes("normalizeRateAuditReport(nextValue)") && files.compatibility.includes("contractGateReady"), "rate-audit responses are normalized before entering React state");
check(
  files.compatibility.includes('"manual_review"')
  && files.dashboard.includes('["targeted_rerun", "manual_review"]'),
  "manual-review strategies remain visible as attention states instead of being misclassified",
);
check(files.nav.includes('label: "降检报告"'), "navigation uses the product-aligned rate-audit label");
check(files.app.includes("sourcePath={documentStatus?.sourcePath}") && files.app.includes('openDiffTaskTarget("all", chunkId)'), "App wires the selected document and Diff targeting into the report");
check(files.page.includes("<RateAuditDashboard") && files.page.includes("内容与导出完整性"), "quality page composes rate signals with hard integrity checks");
check(files.dashboard.includes("分轮轨迹") && files.dashboard.includes("维度变化") && files.dashboard.includes("问题段落热区"), "dashboard renders trajectory, dimensions, and ranked hotspots");
check(files.dashboard.includes("降检策略 × 正文与格式硬约束") && files.dashboard.includes("正文范围已锁定") && files.dashboard.includes("误入标题"), "dashboard renders the dual strategy/content contract gate");
check(files.dashboard.includes("复评分：") && files.dashboard.includes("可同维度复评分") && files.dashboard.includes("仅人工复核"), "dashboard discloses which dimensions have a real evaluator and which remain manual-only");
check(
  files.types.includes("RateAuditBlockingManualDimension")
  && files.types.includes("RateAuditExecutableQueueItem")
  && files.types.includes("RateAuditPlateau")
  && files.types.includes("blockingManualDimensions")
  && files.types.includes("executableQueue")
  && files.types.includes("plateauAttemptLimit"),
  "frontend types expose executable, manual-review, and terminal plateau evidence",
);
check(
  files.compatibility.includes("normalizeBlockingManualDimension")
  && files.compatibility.includes("normalizeExecutableQueueItem")
  && files.compatibility.includes("manualReviewStillRequired"),
  "legacy and untrusted RateAudit payloads normalize the dual-track strategy fields",
);
check(
  files.dashboard.includes("自动队列与人工复核状态")
  && files.dashboard.includes("可执行维度先处理，但人工风险仍未解除")
  && files.dashboard.includes("不会把人工维度标记为已解决"),
  "mixed strategies disclose that executable progress does not clear manual risks",
);
check(
  files.dashboard.includes("自动策略尝试上限")
  && files.dashboard.includes("已达到自动尝试上限")
  && files.dashboard.includes("不会继续调用模型")
  && files.dashboard.includes("已保留上一版正文")
  && files.dashboard.includes("后续必须人工复核"),
  "terminal plateaus visibly stop model work, preserve accepted text, and require manual review",
);
check(
  files.dashboard.includes("执行定点策略")
  && files.dashboard.includes("通过同维度复评分的修复候选")
  && files.dashboard.includes("不会自动确认导出"),
  "dashboard offers an explicitly review-gated strategy action instead of silently adopting model output",
);
check(
  files.strategyExecution.includes("compareRevision")
  && files.strategyExecution.includes("scopeDigest")
  && files.strategyExecution.includes("formatDigest")
  && files.strategyExecution.includes("sourceSha256")
  && files.strategyExecution.includes("planDigest")
  && files.strategyExecution.includes("sameStringList(binding.targetChunkIds, targetChunkIds)"),
  "the browser submits the complete optimistic-concurrency and frozen-format strategy binding",
);
check(
  files.batchAttach.includes("runPreparedBatchRerunTask")
  && files.app.includes("service.startRateAuditStrategy(request, modelConfig)"),
  "verified strategy tasks reuse the observable batch lifecycle without falling back to the legacy chunk endpoint",
);
check(
  files.app.includes("isStaleRateAuditStrategyError(appError)")
  && files.app.includes("reviewRefreshHandlers.refreshRevisionBoundReviewState(")
  && files.app.includes("旧策略未执行；已刷新 Diff，正在生成新策略"),
  "a stale strategy is never retried and instead refreshes compare, review decisions, and the report revision",
);
check(
  files.app.includes("if (!await reviewRefreshHandlers.flushReviewDecisionSaves(strategyOutputPath))")
  && files.app.includes("normalizeRateAuditReport(await service.getRateAudit")
  && files.app.includes("setLastExportResult(null)"),
  "execution flushes pending review state, freshens the plan, and invalidates old export evidence before model work",
);
check(
  files.app.includes('taskPhaseRef.current !== "idle"')
  && files.app.includes("latestDocumentStatusRef.current?.sourcePath")
  && files.app.includes("liveCompareRef.current?.outputPath")
  && files.reviewRefresh.includes("compareIdentityMatches(visible, expectedIdentity)")
  && files.reviewRefresh.includes('`${snapshot.compareRevision}|${Date.now()}`'),
  "confirmation-time task/document guards and a unique refresh nonce prevent stale UI state from being applied or reused",
);
check(
  files.types.includes("rateAuditStrategyReviewRequired?: boolean")
  && files.resultDecisions.includes("chunk.rateAuditStrategyReviewRequired === true")
  && files.diffDashboard.includes("chunk.rateAuditStrategyReviewRequired === true")
  && files.qualityStats.includes("chunk.rateAuditStrategyReviewRequired === true")
  && files.reviewDefaults.includes("hasPendingRateAuditStrategyCandidate")
  && files.qualityStats.includes("isReviewDecisionConfirmed(reviewDecisions[chunk.chunkId]")
  && files.app.includes("reviewDecisions={reviewDecisions}")
  && files.page.includes("hasPendingRateAuditStrategyCandidate(compareData, reviewDecisions)")
  && files.chunkDecisionState.includes("input.chunk.rateAuditStrategyReviewRequired === true && !isConfirmed")
  && files.chunkViewState.includes("strategyReviewPending")
  && files.chunkAlerts.includes("定点策略候选待确认")
  && files.chunkAlerts.includes("RateAudit 与导出仍使用本轮安全原文"),
  "a converged strategy candidate stays visible, enters review filters, and cannot masquerade as the exported effective text",
);
check(files.dashboard.includes("不映射第三方检测概率") && files.dashboard.includes("不是第三方 AIGC 检测结果") === false, "frontend avoids presenting heuristic points as a detector probability");
check(files.types.includes("export type RateAuditReport") && files.types.includes("isAiDetector: false"), "frontend types lock the honest non-detector contract");
check(files.types.includes("export type DocumentEditContract") && files.types.includes("export type RateAuditStrategyPlan"), "frontend types expose executable strategy and body-only contracts");
check(files.exportParser.includes("X-Export-Content-Contract-Ready") && files.exportParser.includes("X-Export-Format-Lock-Path"), "export response parser retains contract and format-lock evidence");
check(files.exportHealth.includes('label: "格式锁"') && files.exportHealth.includes('label: "正文契约"'), "export health surfaces both format and scope gates");
check(files.exportHealth.includes("contentContractBlockingCount") && !files.exportHealth.includes("contentContractIssueCount + editableHeadingCount"), "export health does not double-count editable headings already reported by the contract");
check(files.page.includes("deriveExportHealthPanelState(exportResult)") && files.qualityStats.includes("contentContractBlockingCount: Math.max"), "quality report uses evidence-aware export health and the normalized content-contract blocking count");
check(
  files.sidebar.includes(">论文 AI 降检平台<")
  && files.app.includes('id="fyadr-active-view-title"')
  && files.app.includes("{activeViewMeta.label}")
  && files.app.includes("document.title = `${viewLabel} | FYADR`")
  && files.index.includes("<title>论文 AI 降检平台 | FYADR</title>"),
  "sidebar identity, active page heading, and browser metadata use the product-aligned name",
);
check(
  files.roundSuccess.includes("runRateAuditGatedAutoNext")
  && files.roundSuccess.includes("input.result.outputPath")
  && files.roundSuccess.includes("deps.service.getRateAudit(requestSourcePath, requestOutputPath)"),
  "successful rounds request RateAudit for the completed source/output pair before scheduling",
);
check(
  files.autoRunTypes.includes("rateAuditApproval: RateAuditAutoNextApproval")
  && files.autoRunGuard.includes("validateStoredRateAuditAutoNextApproval")
  && files.autoRunGuard.includes("expectedOutputPath: status.latestOutputPath")
  && files.autoRunPerform.includes("runRevalidatedRateAuditAutoNext")
  && files.autoRunPerform.includes("getRateAudit: deps.getRateAudit"),
  "the countdown action retains and freshly revalidates the RateAudit generation before launch",
);
check(
  files.roundInputGate.includes("expectedPreviousReviewRevision")
  && files.roundInputGate.includes("expectedPreviousContentRevision")
  && files.roundInputGate.includes("expectedPreviousArtifactSnapshotDigest")
  && files.roundInputGate.includes("expectedPreviousEffectiveTextSha256")
  && files.runRoundApi.includes("...previousRoundBinding"),
  "the final start gate submits all five parent-generation preconditions instead of compare alone",
);
check(
  files.app.includes('pending?.kind === "next-round"')
  && files.app.includes("审阅决定已变化，旧的 RateAudit 自动下一轮批准已取消")
  && files.app.includes("clearPendingAutoActionForManualContextChange"),
  "review decisions and manual route changes clear pending auto-next approval before their async saves",
);

const { normalizeRateAuditReport } = await importCompatibilityModule();
const {
  describeRateAuditStrategyBindingBlock,
  deriveRateAuditStrategyExecutionState,
  isStaleRateAuditStrategyError,
} = await importTypeScriptModule("src/lib/rateAuditStrategyExecution.ts");
const {
  deriveDefaultReviewDecision,
  hasPendingRateAuditStrategyCandidate,
} = await importReviewDecisionDefaultsModule();
const pendingCandidateCompare = {
  chunks: [{ chunkId: "p0001-c00", rateAuditStrategyReviewRequired: true }],
};
const failedOutputDecision = {
  choice: "custom",
  customText: "isolated failed candidate",
  source: "failed_output",
  confirmed: true,
};
const rejectedCandidateDecision = {
  choice: "custom",
  customText: "isolated rejected candidate",
  source: "rejected_candidate",
  confirmed: true,
};
check(
  hasPendingRateAuditStrategyCandidate(pendingCandidateCompare, { "p0001-c00": "rewrite" }) === true
  && hasPendingRateAuditStrategyCandidate(pendingCandidateCompare, { "p0001-c00": "rewrite_confirmed" }) === false
  && hasPendingRateAuditStrategyCandidate(pendingCandidateCompare, { "p0001-c00": "source_confirmed" }) === false
  && hasPendingRateAuditStrategyCandidate(pendingCandidateCompare, { "p0001-c00": failedOutputDecision }) === true
  && hasPendingRateAuditStrategyCandidate(pendingCandidateCompare, { "p0001-c00": rejectedCandidateDecision }) === true,
  "a strategy candidate blocks repeat execution until a safe explicit decision; failed and rejected candidates remain unresolved",
);
check(
  deriveDefaultReviewDecision({ chunkId: "pending", rateAuditStrategyReviewRequired: true }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "pending-stale-default", rateAuditStrategyReviewRequired: true, rerunDefaultDecision: "rewrite" }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "fallback", fallbackMode: "source" }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "citation", quality: { flags: ["citation_missing"] } }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "register", rerunDefaultDecision: "rewrite", quality: { flags: ["academic_register_drift"] } }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "style-hard", rerunDefaultDecision: "rewrite", quality: { flags: ["machine_style_drift"] } }) === "source"
  && deriveDefaultReviewDecision({ chunkId: "stable", quality: { flags: [] } }) === "rewrite"
  && deriveDefaultReviewDecision({ chunkId: "server", rerunDefaultDecision: "source", quality: { flags: [] } }) === "source",
  "browser default decisions match the backend safe-source rules and prefer persisted rerun evidence",
);
check(
  files.resultFormat.includes('flag === "academic_register_drift"')
  && files.resultFormat.includes('return "学术语域偏移"')
  && files.resultReview.includes("quality?.reviewReasons")
  && files.chunkMeta.includes("introducedColloquialPhrases.join")
  && files.chunkMeta.includes("T.colloquialIntroduced")
  && files.chunkCopy.includes('colloquialIntroduced: "新增口语"'),
  "academic-register drift has a Chinese label, exact phrase evidence, and a visible review reason instead of a raw internal code",
);
check(
  describeRateAuditStrategyBindingBlock("review_pending_target").includes("Diff")
  && describeRateAuditStrategyBindingBlock("strategy_attempt_limit").includes("人工复核")
  && !describeRateAuditStrategyBindingBlock("unknown_internal_code").includes("unknown_internal_code"),
  "server binding block codes are rendered as actionable Chinese guidance instead of raw internal identifiers",
);
const legacyReport = normalizeRateAuditReport({ sourceOnly: true });
check(
  legacyReport.strategyPlan.decision === "blocked"
  && legacyReport.strategyPlan.canExecute === false
  && legacyReport.strategyPlan.executableQueue.length === 0
  && legacyReport.strategyPlan.blockingManualDimensions.length === 0
  && legacyReport.strategyPlan.manualReviewStillRequired === false
  && legacyReport.strategyPlan.plateauReached === false
  && legacyReport.strategyPlan.hardStop === false
  && legacyReport.plateau.reached === false
  && legacyReport.plateau.targetChunkIds.length === 0
  && legacyReport.readiness.status === "blocked"
  && legacyReport.contentContract === null,
  "legacy rate-audit payloads fail closed with an empty dual-track queue instead of crashing",
);
const currentReport = normalizeRateAuditReport({
  sourceOnly: false,
  contentContract: {
    ready: true,
    scopeReady: true,
    modelInputMatchesEditableUnits: true,
    semanticRangeTopologyValid: true,
    editableSemanticRangeCoveredUnitCount: 0,
    formatLockApplicable: true,
    formatLockReady: true,
    issues: [],
  },
  strategyPlan: {
    version: 1,
    decision: "stop",
    label: "停止自动改写",
    reason: "没有可执行的局部目标。",
    action: "",
    targetChunkIds: [],
    targetChunkCount: 0,
    canExecute: false,
  },
  readiness: {
    status: "ready",
    runReady: false,
    preExportReady: true,
  },
});
check(
  currentReport.strategyPlan.decision === "stop"
  && currentReport.strategyPlan.canExecute === false
  && currentReport.readiness.status === "ready"
  && currentReport.readiness.preExportReady === true,
  "a valid stop decision remains ready without becoming executable",
);
const manualReviewReport = normalizeRateAuditReport({
  sourceOnly: false,
  contentContract: {
    ready: true,
    scopeReady: true,
    modelInputMatchesEditableUnits: true,
    semanticRangeTopologyValid: true,
    editableSemanticRangeCoveredUnitCount: 0,
    formatLockApplicable: true,
    formatLockReady: true,
    issues: [],
  },
  strategyPlan: {
    version: 3,
    decision: "manual_review",
    label: "转人工复核",
    reason: "当前维度没有真实同维度评估器。",
    action: "打开热区逐段确认。",
    targetChunkIds: ["p0_c0"],
    targetChunkCount: 1,
    canExecute: false,
  },
  readiness: {
    status: "attention",
    strategyDecisionReady: true,
    runReady: false,
    preExportReady: false,
  },
});
check(
  manualReviewReport.strategyPlan.decision === "manual_review"
  && manualReviewReport.strategyPlan.canExecute === false
  && manualReviewReport.readiness.strategyDecisionReady === true
  && manualReviewReport.readiness.status === "attention",
  "manual-review dimensions fail closed while preserving their diagnostic evidence",
);

const mixedStrategyReport = normalizeRateAuditReport({
  sourceOnly: false,
  contentContract: {
    ready: true,
    scopeReady: true,
    modelInputMatchesEditableUnits: true,
    semanticRangeTopologyValid: true,
    editableSemanticRangeCoveredUnitCount: 0,
    formatLockApplicable: true,
    formatLockReady: true,
    issues: [],
  },
  strategyPlan: {
    version: 3,
    decision: "targeted_rerun",
    label: "定点重跑",
    reason: "先处理可执行维度。",
    action: "删除冗余衔接语。",
    targetChunkIds: ["transition-target"],
    canExecute: true,
    selectedExecutableDimensionId: "transitions",
    executableQueueCount: 1,
    executableQueue: [{
      dimensionId: "transitions",
      label: "衔接脚手架",
      priority: "high",
      trend: "regressed",
      riskCount: 1,
      highRiskCount: 1,
      riskPoints: 3,
      repairPromptId: "template-repair",
      evaluatorDimensionId: "transitions",
      primaryMetric: "connectorDensity",
      targetScope: "chunks",
      maxAttempts: 2,
      plateauPolicy: "manual_review",
      targetChunkIds: ["transition-target", ""],
    }],
    blockingManualDimensionCount: 1,
    blockingManualDimensions: [{
      dimensionId: "structure",
      label: "段落与枚举结构",
      trend: "stable",
      riskCount: 2,
      highRiskCount: 1,
      riskPoints: 6,
      targetScope: "manual_review",
      targetChunkIds: ["structure-review"],
      manualReviewReason: "结构边界需结合论文语义判断。",
      action: "人工核对必要编号结构。",
    }],
    manualReviewRequired: true,
    manualReviewStillRequired: true,
  },
  strategyBinding: {
    version: 2,
    ready: true,
    compareRevision: "compare-revision-mixed",
    sourceSha256: "a".repeat(64),
    scopeDigest: "b".repeat(64),
    formatDigest: "c".repeat(64),
    dimensionId: "transitions",
    recommendedPromptId: "template-repair",
    targetChunkIds: ["transition-target"],
    planDigest: "d".repeat(64),
    blockedReason: "",
  },
  readiness: {
    status: "attention",
    strategyDecisionReady: true,
    runReady: false,
    preExportReady: true,
  },
});
check(
  mixedStrategyReport.strategyPlan.decision === "targeted_rerun"
  && mixedStrategyReport.strategyPlan.canExecute === true
  && mixedStrategyReport.strategyPlan.executableQueue[0]?.dimensionId === "transitions"
  && mixedStrategyReport.strategyPlan.executableQueue[0]?.targetChunkCount === 1
  && mixedStrategyReport.strategyPlan.blockingManualDimensions[0]?.dimensionId === "structure"
  && mixedStrategyReport.strategyPlan.manualReviewRequired === true
  && mixedStrategyReport.strategyPlan.manualReviewStillRequired === true,
  "an executable dimension remains actionable while its independent manual risk stays explicit",
);

const plateauReport = normalizeRateAuditReport({
  sourceOnly: false,
  contentContract: {
    ready: true,
    scopeReady: true,
    modelInputMatchesEditableUnits: true,
    semanticRangeTopologyValid: true,
    editableSemanticRangeCoveredUnitCount: 0,
    formatLockApplicable: true,
    formatLockReady: true,
    issues: [],
  },
  strategyPlan: {
    version: 3,
    decision: "targeted_rerun",
    label: "定点重跑",
    recommendedPromptId: "template-repair",
    reason: "旧客户端仍可能看到可执行描述。",
    action: "继续自动重试。",
    dimensionId: "transitions",
    dimensionLabel: "衔接脚手架",
    targetChunkIds: ["plateau-target"],
    canExecute: true,
    selectedExecutableDimensionId: "transitions",
    executableQueueCount: 1,
    executableQueue: [{
      dimensionId: "transitions",
      label: "衔接脚手架",
      targetChunkIds: ["plateau-target"],
    }],
    hardStop: true,
    plateauReached: true,
    plateauReason: "strategy_attempt_limit",
    plateauDimensionId: "transitions",
    plateauTargetChunkIds: ["plateau-target", ""],
    plateauTargetChunkCount: 1,
    plateauAttemptLimit: 2,
  },
  plateau: {
    reached: true,
    reason: "strategy_attempt_limit",
    hardStop: true,
    dimensionId: "transitions",
    targetChunkIds: ["plateau-target"],
    targetChunkCount: 1,
    attemptLimit: 2,
    preservedPreviousText: true,
    manualReviewRequired: true,
  },
  strategyBinding: {
    version: 2,
    ready: false,
    blockedReason: "strategy_attempt_limit",
    targetChunkIds: ["plateau-target"],
  },
  readiness: {
    status: "attention",
    strategyDecisionReady: true,
    runReady: false,
    preExportReady: true,
  },
});
check(
  plateauReport.strategyPlan.decision === "manual_review"
  && plateauReport.strategyPlan.label === "达到尝试上限，转人工复核"
  && plateauReport.strategyPlan.recommendedPromptId === ""
  && plateauReport.strategyPlan.canExecute === false
  && plateauReport.strategyPlan.executableQueue.length === 0
  && plateauReport.strategyPlan.executableQueueCount === 0
  && plateauReport.strategyPlan.selectedExecutableDimensionId === ""
  && plateauReport.strategyPlan.hardStop === true
  && plateauReport.strategyPlan.plateauReached === true
  && plateauReport.strategyPlan.plateauReason === "strategy_attempt_limit"
  && plateauReport.strategyPlan.plateauDimensionId === "transitions"
  && plateauReport.strategyPlan.plateauTargetChunkIds?.length === 1
  && plateauReport.strategyPlan.plateauAttemptLimit === 2
  && plateauReport.strategyPlan.manualReviewRequired === true
  && plateauReport.strategyPlan.manualReviewStillRequired === true
  && plateauReport.plateau.preservedPreviousText === true,
  "attempt exhaustion normalizes to one non-executable hard stop with preserved-text evidence",
);

const digest = "a".repeat(64);
const verifiedStrategyReport = {
  sourcePath: "/workspace/origin/paper.docx",
  currentOutputPath: "/workspace/finish/paper_round2.txt",
  contentContract: {
    ready: true,
    scopeReady: true,
    formatLockApplicable: true,
    formatLockReady: true,
    sourceSha256: digest,
    scopeDigest: digest,
    formatDigest: digest,
  },
  readiness: {
    contentContractReady: true,
    scopeContractReady: true,
    formatContractReady: true,
    preExportReady: true,
  },
  strategyPlan: {
    decision: "targeted_rerun",
    canExecute: true,
    dimensionCanExecute: true,
    directionEvaluator: "sentence_structure:burstinessRatio",
    promptSelectionSource: "dimension_registry",
    contentContractReady: true,
    scopeContractReady: true,
    formatContractReady: true,
    dimensionId: "rhythm",
    recommendedPromptId: "round1",
    targetChunkIds: ["p0001-c00"],
  },
  strategyBinding: {
    version: 1,
    ready: true,
    compareRevision: "compare-revision-1",
    sourceSha256: digest,
    scopeDigest: digest,
    formatDigest: digest,
    dimensionId: "rhythm",
    recommendedPromptId: "round1",
    targetChunkIds: ["p0001-c00"],
    planDigest: digest,
    blockedReason: "",
  },
};
const verifiedExecution = deriveRateAuditStrategyExecutionState(verifiedStrategyReport);
check(
  verifiedExecution.ready === true
  && verifiedExecution.request?.compareRevision === "compare-revision-1"
  && verifiedExecution.request?.targetChunkIds[0] === "p0001-c00"
  && verifiedExecution.request?.planDigest === digest,
  "a fully bound targeted strategy becomes an exact backend execution request",
);
check(
  deriveRateAuditStrategyExecutionState({ ...verifiedStrategyReport, strategyBinding: null }).ready === false,
  "a legacy targeted strategy without a server binding remains diagnostic-only",
);
check(
  deriveRateAuditStrategyExecutionState({
    ...verifiedStrategyReport,
    strategyBinding: { ...verifiedStrategyReport.strategyBinding, targetChunkIds: ["p0002-c00"] },
  }).ready === false,
  "a target-list mismatch fails closed before the execution request leaves the browser",
);
check(
  isStaleRateAuditStrategyError({ status: 409, payload: { code: "stale_strategy_plan" } }) === true
  && isStaleRateAuditStrategyError({ status: 409, payload: { code: "strategy_execution_conflict" } }) === false
  && isStaleRateAuditStrategyError({ status: 500, payload: { code: "stale_strategy_plan" } }) === false,
  "only the explicit HTTP 409 stale-plan contract enters the refresh path",
);

const {
  runRevalidatedRateAuditAutoNext,
  runRateAuditGatedAutoNext,
  validateStoredRateAuditAutoNextApproval,
} = await importTypeScriptModule("src/lib/rateAuditAutoNextGate.ts");

const gateSourcePath = "/workspace/paper.docx";
const gateOutputPath = "/workspace/finish/paper_round1.txt";
const gatePromptId = "round2";
const gateDocId = "paper-doc";
const gateDigest = "b".repeat(64);
function buildAutoNextReport(decision, overrides = {}) {
  const base = {
    version: 3,
    createdAt: "2026-07-18T10:00:00Z",
    sourcePath: gateSourcePath,
    currentOutputPath: gateOutputPath,
    sourceOnly: false,
    contentContract: {
      ready: true,
      scopeReady: true,
      modelInputMatchesEditableUnits: true,
      formatLockApplicable: true,
      formatLockReady: true,
    },
    strategyPlan: {
      version: 3,
      decision,
      currentPromptId: "round1",
      nextPromptId: gatePromptId,
      recommendedPromptId: decision === "next_dimension" ? gatePromptId : "",
      promptSelectionSource: decision === "next_dimension" ? "workflow_sequence" : "none",
      reason: `decision=${decision}`,
      canExecute: decision === "next_dimension",
      contentContractReady: true,
      scopeContractReady: true,
      formatContractReady: true,
    },
    strategyBinding: {
      version: 2,
      ready: false,
      compareRevision: "compare-revision-1",
      reviewRevision: gateDigest,
      contentRevision: gateDigest,
      artifactSnapshotDigest: gateDigest,
      effectiveTextSha256: gateDigest,
      planDigest: gateDigest,
      recommendedPromptId: gatePromptId,
    },
    readiness: {
      status: decision === "blocked" ? "blocked" : decision === "next_dimension" || decision === "stop" ? "ready" : "attention",
      strategyDecisionReady: decision !== "blocked",
      contentContractReady: true,
      scopeContractReady: true,
      formatContractReady: true,
      runReady: false,
      preExportReady: true,
      blockedReason: decision === "blocked" ? "正文契约未通过。" : "",
    },
  };
  return {
    ...base,
    ...overrides,
    contentContract: { ...base.contentContract, ...(overrides.contentContract ?? {}) },
    strategyPlan: { ...base.strategyPlan, ...(overrides.strategyPlan ?? {}) },
    strategyBinding: { ...base.strategyBinding, ...(overrides.strategyBinding ?? {}) },
    readiness: { ...base.readiness, ...(overrides.readiness ?? {}) },
  };
}

async function runAutoNextCase({ name, report, requestError = false, expectedAllowed, expectedCode }) {
  const requests = [];
  const approvals = [];
  const result = await runRateAuditGatedAutoNext({
    getRateAudit: async (sourcePath, outputPath) => {
      requests.push([sourcePath, outputPath]);
      if (requestError) throw new Error("rate audit unavailable");
      return report;
    },
    schedule: (approval) => approvals.push(approval),
    sourcePath: gateSourcePath,
    outputPath: gateOutputPath,
    expectedDocId: gateDocId,
    expectedPromptId: gatePromptId,
    completedRound: 1,
    nextRound: 2,
  });
  check(requests.length === 1 && requests[0][0] === gateSourcePath && requests[0][1] === gateOutputPath, `${name}: RateAudit receives the completed source/output paths`);
  check(result.allowed === expectedAllowed, `${name}: scheduling permission is ${expectedAllowed ? "granted" : "denied"}`);
  check(approvals.length === (expectedAllowed ? 1 : 0), `${name}: schedule callback runs only when approved`);
  if (!expectedAllowed) {
    check(result.code === expectedCode, `${name}: fail-closed reason is ${expectedCode}`);
  }
  return { result, approvals };
}

for (const [decision, code] of [
  ["stop", "stop"],
  ["blocked", "blocked"],
  ["targeted_rerun", "targeted_rerun"],
  ["manual_review", "manual_review"],
]) {
  await runAutoNextCase({
    name: decision,
    report: buildAutoNextReport(decision),
    expectedAllowed: false,
    expectedCode: code,
  });
}
await runAutoNextCase({
  name: "prompt mismatch",
  report: buildAutoNextReport("next_dimension", {
    strategyPlan: { recommendedPromptId: "round3", nextPromptId: "round3" },
  }),
  expectedAllowed: false,
  expectedCode: "prompt_mismatch",
});
await runAutoNextCase({
  name: "request failure",
  report: null,
  requestError: true,
  expectedAllowed: false,
  expectedCode: "request_failed",
});
await runAutoNextCase({
  name: "missing readiness evidence",
  report: { strategyPlan: { decision: "next_dimension" } },
  expectedAllowed: false,
  expectedCode: "invalid_report",
});
const approvedAutoNext = await runAutoNextCase({
  name: "matching next dimension",
  report: buildAutoNextReport("next_dimension"),
  expectedAllowed: true,
});
check(
  validateStoredRateAuditAutoNextApproval({
    approval: approvedAutoNext.approvals[0],
    expectedSourcePath: gateSourcePath,
    expectedOutputPath: gateOutputPath,
    expectedDocId: gateDocId,
    expectedCompletedRound: 1,
    expectedPromptId: gatePromptId,
  }),
  "stored RateAudit approval remains valid for the unchanged countdown context",
);
check(
  !validateStoredRateAuditAutoNextApproval({
    approval: approvedAutoNext.approvals[0],
    expectedSourcePath: gateSourcePath,
    expectedOutputPath: gateOutputPath,
    expectedDocId: gateDocId,
    expectedCompletedRound: 1,
    expectedPromptId: "round3",
  })
  && !validateStoredRateAuditAutoNextApproval({
    approval: approvedAutoNext.approvals[0],
    expectedSourcePath: gateSourcePath,
    expectedOutputPath: "/workspace/finish/replaced.txt",
    expectedDocId: gateDocId,
    expectedCompletedRound: 1,
    expectedPromptId: gatePromptId,
  }),
  "countdown revalidation rejects changed prompts and replaced outputs",
);

check(
  approvedAutoNext.approvals[0].compareRevision === "compare-revision-1"
  && approvedAutoNext.approvals[0].reviewRevision === gateDigest
  && approvedAutoNext.approvals[0].contentRevision === gateDigest
  && approvedAutoNext.approvals[0].artifactSnapshotDigest === gateDigest
  && approvedAutoNext.approvals[0].effectiveTextSha256 === gateDigest,
  "the stored approval copies all five generation fields from backend RateAudit evidence",
);

const unchangedReport = buildAutoNextReport("next_dimension");
let unchangedLaunches = 0;
const unchangedRevalidation = await runRevalidatedRateAuditAutoNext({
  getRateAudit: async () => unchangedReport,
  launch: async () => { unchangedLaunches += 1; },
  approval: approvedAutoNext.approvals[0],
  sourcePath: gateSourcePath,
  outputPath: gateOutputPath,
  expectedDocId: gateDocId,
  expectedPromptId: gatePromptId,
  completedRound: 1,
  nextRound: 2,
});
check(
  unchangedRevalidation.allowed === true && unchangedLaunches === 1,
  "an unchanged fresh RateAudit generation launches exactly once",
);

for (const drift of [
  { label: "decision", mutate: (report) => { report.strategyPlan.decision = "manual_review"; } },
  { label: "recommended prompt", mutate: (report) => { report.strategyPlan.recommendedPromptId = "round3"; report.strategyPlan.nextPromptId = "round3"; } },
  { label: "compareRevision", mutate: (report) => { report.strategyBinding.compareRevision = "compare-revision-2"; } },
  { label: "reviewRevision", mutate: (report) => { report.strategyBinding.reviewRevision = "c".repeat(64); } },
  { label: "contentRevision", mutate: (report) => { report.strategyBinding.contentRevision = "d".repeat(64); } },
  { label: "artifactSnapshotDigest", mutate: (report) => { report.strategyBinding.artifactSnapshotDigest = "e".repeat(64); } },
  { label: "effectiveTextSha256", mutate: (report) => { report.strategyBinding.effectiveTextSha256 = "f".repeat(64); } },
]) {
  const freshReport = structuredClone(unchangedReport);
  drift.mutate(freshReport);
  let launchCount = 0;
  const result = await runRevalidatedRateAuditAutoNext({
    getRateAudit: async () => freshReport,
    launch: async () => { launchCount += 1; },
    approval: approvedAutoNext.approvals[0],
    sourcePath: gateSourcePath,
    outputPath: gateOutputPath,
    expectedDocId: gateDocId,
    expectedPromptId: gatePromptId,
    completedRound: 1,
    nextRound: 2,
  });
  check(
    result.allowed === false && launchCount === 0,
    `${drift.label} drift cancels the old approval with zero model-start calls`,
  );
}

console.log(JSON.stringify({ ok: true, checks }, null, 2));
