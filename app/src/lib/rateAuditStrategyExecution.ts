import type {
  RateAuditReport,
  RateAuditStrategyExecutionRequest,
} from "@/types/app";

const SHA256_RE = /^[a-f0-9]{64}$/i;

const STRATEGY_BINDING_REASON_COPY: Record<string, string> = {
  review_pending_target: "当前已有定点候选等待确认，请先回到 Diff 逐段采用或保留原文。",
  review_locked_target: "目标段落已有明确审阅决定；如需再次处理，请先在 Diff 中调整该决定。",
  strategy_attempt_limit: "本维度已达到安全尝试上限，系统已保留原文，请转人工复核。",
  prompt_unavailable: "注册的修复提示词当前不可用，请恢复提示词后重新诊断。",
  docx_body_map_missing: "Word 正文映射证据缺失，请重新载入文档建立格式锁。",
  docx_manifest_missing: "Word 冻结分块清单缺失，请重新载入文档建立正文契约。",
};

export function describeRateAuditStrategyBindingBlock(reason: unknown): string {
  const code = String(reason || "").trim();
  if (!code) return "当前报告缺少服务端签发的策略绑定，请重新诊断。";
  return STRATEGY_BINDING_REASON_COPY[code]
    ?? "当前策略绑定未通过安全校验，请刷新降检报告后再试。";
}

function sameStringList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export type RateAuditStrategyExecutionState = {
  ready: boolean;
  reason: string;
  request: RateAuditStrategyExecutionRequest | null;
};

export function isStaleRateAuditStrategyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; payload?: unknown };
  if (candidate.status !== 409 || !candidate.payload || typeof candidate.payload !== "object") return false;
  return String((candidate.payload as { code?: unknown }).code || "") === "stale_strategy_plan";
}

/**
 * Convert a displayed RateAudit plan into the exact optimistic-concurrency
 * token accepted by the backend.  This intentionally fails closed: a legacy
 * report may still be useful as a diagnosis, but it cannot start model work
 * without a server-issued binding to the current compare/body/format state.
 */
export function deriveRateAuditStrategyExecutionState(
  report: RateAuditReport | null | undefined,
): RateAuditStrategyExecutionState {
  if (!report) {
    return { ready: false, reason: "尚未取得降检诊断。", request: null };
  }
  const plan = report.strategyPlan;
  if (plan.decision !== "targeted_rerun") {
    return { ready: false, reason: "当前诊断不需要执行定点策略。", request: null };
  }
  if (!plan.canExecute
    || plan.dimensionCanExecute !== true
    || plan.directionEvaluator === "manual_review"
    || plan.promptSelectionSource !== "dimension_registry") {
    return { ready: false, reason: "当前维度没有可验证的自动修复闭环。", request: null };
  }
  if (!report.contentContract?.ready
    || !report.contentContract.scopeReady
    || !report.contentContract.formatLockReady
    || !report.readiness.contentContractReady
    || !report.readiness.scopeContractReady
    || !report.readiness.formatContractReady
    || !report.readiness.preExportReady
    || !plan.contentContractReady
    || !plan.scopeContractReady
    || !plan.formatContractReady) {
    return { ready: false, reason: "正文范围或格式锁契约未通过。", request: null };
  }
  const binding = report.strategyBinding;
  if (!binding?.ready) {
    return {
      ready: false,
      reason: describeRateAuditStrategyBindingBlock(binding?.blockedReason),
      request: null,
    };
  }

  const sourcePath = String(report.sourcePath || "").trim();
  const outputPath = String(report.currentOutputPath || "").trim();
  const dimensionId = String(plan.dimensionId || "").trim();
  const recommendedPromptId = String(plan.recommendedPromptId || "").trim();
  const compareRevision = String(binding.compareRevision || "").trim();
  const sourceSha256 = String(binding.sourceSha256 || "").trim();
  const scopeDigest = String(binding.scopeDigest || "").trim();
  const formatDigest = String(binding.formatDigest || "").trim();
  const planDigest = String(binding.planDigest || "").trim();
  const targetChunkIds = plan.targetChunkIds.map((value) => String(value || "").trim()).filter(Boolean);

  const bindingMatchesPlan = binding.dimensionId === dimensionId
    && binding.recommendedPromptId === recommendedPromptId
    && sameStringList(binding.targetChunkIds, targetChunkIds);
  const bindingMatchesContract = binding.sourceSha256 === report.contentContract.sourceSha256
    && binding.scopeDigest === report.contentContract.scopeDigest
    && binding.formatDigest === report.contentContract.formatDigest;
  const uniqueTargets = new Set(targetChunkIds);

  if (!sourcePath || !outputPath || !dimensionId || !recommendedPromptId || !compareRevision) {
    return { ready: false, reason: "策略绑定缺少文档、输出或 revision 身份。", request: null };
  }
  if (!SHA256_RE.test(sourceSha256) || !SHA256_RE.test(scopeDigest) || !SHA256_RE.test(planDigest)) {
    return { ready: false, reason: "策略绑定的内容摘要不完整，请重新诊断。", request: null };
  }
  if (report.contentContract.formatLockApplicable && !SHA256_RE.test(formatDigest)) {
    return { ready: false, reason: "原 Word 格式摘要缺失，请重新建立格式锁。", request: null };
  }
  if (!bindingMatchesPlan || !bindingMatchesContract) {
    return { ready: false, reason: "报告策略与正文契约已经不一致，请重新诊断。", request: null };
  }
  if (!targetChunkIds.length
    || targetChunkIds.length > 8
    || uniqueTargets.size !== targetChunkIds.length
    || targetChunkIds.some((chunkId) => chunkId.startsWith("paragraph-"))) {
    return { ready: false, reason: "策略目标不是当前 Diff 中可验证的真实块。", request: null };
  }

  return {
    ready: true,
    reason: "",
    request: {
      sourcePath,
      outputPath,
      dimensionId,
      recommendedPromptId,
      compareRevision,
      scopeDigest,
      formatDigest,
      sourceSha256,
      targetChunkIds,
      planDigest,
    },
  };
}
