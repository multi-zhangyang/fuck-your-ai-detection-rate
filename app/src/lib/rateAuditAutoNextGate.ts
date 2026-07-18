import type { RateAuditReport } from "@/types/app";

export type RateAuditAutoNextApproval = {
  decision: "next_dimension";
  recommendedPromptId: string;
  sourcePath: string;
  outputPath: string;
  docId: string;
  completedRound: number;
  compareRevision: string;
  reviewRevision: string;
  contentRevision: string;
  artifactSnapshotDigest: string;
  effectiveTextSha256: string;
  bindingPlanDigest: string;
  bindingVersion: number;
  createdAt: string;
  reportVersion: number;
  strategyVersion: number;
};

export type RateAuditAutoNextGateResult =
  | {
    allowed: true;
    approval: RateAuditAutoNextApproval;
    notice: string;
    runtimeStep: string;
  }
  | {
    allowed: false;
    code:
      | "blocked"
      | "stop"
      | "targeted_rerun"
      | "manual_review"
      | "prompt_mismatch"
      | "not_ready"
      | "request_failed"
      | "stale_approval"
      | "invalid_report";
    notice: string;
    runtimeStep: string;
  };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function positiveVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function sha256(value: unknown): string {
  const text = cleanText(value).toLowerCase();
  return /^[0-9a-f]{64}$/.test(text) ? text : "";
}

function normalizePath(value: unknown): string {
  const text = cleanText(value).replace(/\\/g, "/");
  return text.length > 1 ? text.replace(/\/+$/, "") : text;
}

function pathsMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizePath(left);
  const normalizedRight = normalizePath(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function detailOrFallback(value: unknown, fallback: string): string {
  return cleanText(value) || fallback;
}

function blockedResult(
  code: Exclude<RateAuditAutoNextGateResult, { allowed: true }>["code"],
  notice: string,
  runtimeStep: string,
): RateAuditAutoNextGateResult {
  return { allowed: false, code, notice, runtimeStep };
}

export function evaluateRateAuditAutoNextGate(input: {
  report: RateAuditReport | unknown;
  expectedSourcePath: string;
  expectedOutputPath: string;
  expectedDocId: string;
  expectedPromptId: string;
  completedRound: number;
  nextRound: number;
}): RateAuditAutoNextGateResult {
  const report = input.report;
  if (!isRecord(report) || !isRecord(report.strategyPlan) || !isRecord(report.readiness)) {
    return blockedResult(
      "invalid_report",
      "RateAudit 未返回完整的策略与契约证据，已为安全起见暂停自动下一轮。",
      "本轮已完成；RateAudit 证据不完整，等待人工确认。",
    );
  }

  const strategy = report.strategyPlan;
  const readiness = report.readiness;
  const binding = isRecord(report.strategyBinding) ? report.strategyBinding : null;
  const decision = cleanText(strategy.decision);
  const reason = detailOrFallback(strategy.reason, "RateAudit 未提供详细原因。");

  if (decision === "stop") {
    return blockedResult(
      "stop",
      `RateAudit 建议停止自动改写：${reason} 已保留第 ${input.completedRound} 轮结果，不会自动进入下一轮。`,
      `第 ${input.completedRound} 轮已完成；RateAudit 已收敛并停止自动流程。`,
    );
  }
  if (decision === "blocked") {
    const blockedReason = detailOrFallback(readiness.blockedReason, reason);
    return blockedResult(
      "blocked",
      `RateAudit 契约未通过：${blockedReason} 已暂停普通下一轮。`,
      `第 ${input.completedRound} 轮已完成；正文或格式契约阻止自动继续。`,
    );
  }
  if (decision === "targeted_rerun") {
    return blockedResult(
      "targeted_rerun",
      `RateAudit 建议仅处理命中段落：${reason} 已暂停普通整轮流程，未调用旧定点重跑接口。`,
      `第 ${input.completedRound} 轮已完成；等待按诊断热区处理，不进入普通下一轮。`,
    );
  }
  if (decision === "manual_review") {
    return blockedResult(
      "manual_review",
      `RateAudit 要求人工复核：${reason} 已暂停普通下一轮。`,
      `第 ${input.completedRound} 轮已完成；等待人工复核。`,
    );
  }
  if (decision !== "next_dimension") {
    return blockedResult(
      "invalid_report",
      "RateAudit 决策缺失或无法识别，已为安全起见暂停自动下一轮。",
      "本轮已完成；RateAudit 决策无效，等待人工确认。",
    );
  }

  const expectedPromptId = cleanText(input.expectedPromptId);
  const recommendedPromptId = cleanText(strategy.recommendedPromptId);
  const declaredNextPromptId = cleanText(strategy.nextPromptId);
  if (
    !expectedPromptId
    || recommendedPromptId !== expectedPromptId
    || declaredNextPromptId !== expectedPromptId
  ) {
    return blockedResult(
      "prompt_mismatch",
      `RateAudit 推荐提示词“${recommendedPromptId || "未提供"}”，但流程第 ${input.nextRound} 轮实际提示词为“${expectedPromptId || "无法确定"}”，已阻止自动调度。`,
      `第 ${input.completedRound} 轮已完成；RateAudit 与流程提示词不一致。`,
    );
  }

  const reportVersion = positiveVersion(report.version);
  const strategyVersion = positiveVersion(strategy.version);
  const bindingVersion = positiveVersion(binding?.version);
  const compareRevision = cleanText(binding?.compareRevision);
  const reviewRevision = sha256(binding?.reviewRevision);
  const contentRevision = sha256(binding?.contentRevision);
  const artifactSnapshotDigest = sha256(binding?.artifactSnapshotDigest);
  const effectiveTextSha256 = sha256(binding?.effectiveTextSha256);
  const bindingPlanDigest = sha256(binding?.planDigest);
  const contentContract = report.contentContract;
  const contentContractReady = isRecord(contentContract)
    && contentContract.ready === true
    && contentContract.scopeReady === true
    && contentContract.modelInputMatchesEditableUnits === true
    && (contentContract.formatLockApplicable !== true || contentContract.formatLockReady === true);
  const evidenceReady = Boolean(
    reportVersion
    && strategyVersion
    && bindingVersion
    && compareRevision
    && reviewRevision
    && contentRevision
    && artifactSnapshotDigest
    && effectiveTextSha256
    && bindingPlanDigest
    && cleanText(input.expectedDocId)
    && cleanText(report.createdAt)
    && report.sourceOnly === false
    && pathsMatch(report.sourcePath, input.expectedSourcePath)
    && pathsMatch(report.currentOutputPath, input.expectedOutputPath)
    && cleanText(strategy.currentPromptId)
    && cleanText(strategy.promptSelectionSource) === "workflow_sequence"
    && cleanText(binding?.recommendedPromptId) === expectedPromptId
    && strategy.canExecute === true
    && strategy.contentContractReady === true
    && strategy.scopeContractReady === true
    && strategy.formatContractReady === true
    && readiness.status === "ready"
    && readiness.strategyDecisionReady === true
    && readiness.contentContractReady === true
    && readiness.scopeContractReady === true
    && readiness.formatContractReady === true
    && readiness.preExportReady === true
    && !cleanText(readiness.blockedReason)
    && contentContractReady
  );
  if (
    !evidenceReady
    || reportVersion === null
    || strategyVersion === null
    || bindingVersion === null
  ) {
    return blockedResult(
      "not_ready",
      "RateAudit 尚未给出可执行且完整的正文范围、格式锁与流程准备证据，已暂停自动下一轮。",
      `第 ${input.completedRound} 轮已完成；RateAudit 契约证据未就绪。`,
    );
  }

  return {
    allowed: true,
    approval: {
      decision: "next_dimension",
      recommendedPromptId,
      sourcePath: cleanText(report.sourcePath),
      outputPath: cleanText(report.currentOutputPath),
      docId: cleanText(input.expectedDocId),
      completedRound: input.completedRound,
      compareRevision,
      reviewRevision,
      contentRevision,
      artifactSnapshotDigest,
      effectiveTextSha256,
      bindingPlanDigest,
      bindingVersion,
      createdAt: cleanText(report.createdAt),
      reportVersion,
      strategyVersion,
    },
    notice: `RateAudit 已确认进入下一维度，将按提示词“${recommendedPromptId}”准备第 ${input.nextRound} 轮。`,
    runtimeStep: `第 ${input.completedRound} 轮已完成；RateAudit 已批准第 ${input.nextRound} 轮。`,
  };
}

export function validateStoredRateAuditAutoNextApproval(input: {
  approval: RateAuditAutoNextApproval | null | undefined;
  expectedSourcePath: string;
  expectedOutputPath: string;
  expectedDocId: string;
  expectedCompletedRound: number;
  expectedPromptId: string;
}): boolean {
  const approval = input.approval;
  return Boolean(
    approval
    && approval.decision === "next_dimension"
    && positiveVersion(approval.reportVersion)
    && positiveVersion(approval.strategyVersion)
    && cleanText(approval.createdAt)
    && cleanText(approval.docId) === cleanText(input.expectedDocId)
    && positiveInteger(approval.completedRound) === input.expectedCompletedRound
    && cleanText(approval.compareRevision)
    && sha256(approval.reviewRevision)
    && sha256(approval.contentRevision)
    && sha256(approval.artifactSnapshotDigest)
    && sha256(approval.effectiveTextSha256)
    && sha256(approval.bindingPlanDigest)
    && positiveVersion(approval.bindingVersion)
    && cleanText(approval.recommendedPromptId) === cleanText(input.expectedPromptId)
    && pathsMatch(approval.sourcePath, input.expectedSourcePath)
    && pathsMatch(approval.outputPath, input.expectedOutputPath)
  );
}

function approvalsBindSameGeneration(
  stored: RateAuditAutoNextApproval,
  fresh: RateAuditAutoNextApproval,
): boolean {
  return stored.decision === fresh.decision
    && stored.recommendedPromptId === fresh.recommendedPromptId
    && pathsMatch(stored.sourcePath, fresh.sourcePath)
    && pathsMatch(stored.outputPath, fresh.outputPath)
    && stored.docId === fresh.docId
    && stored.completedRound === fresh.completedRound
    && stored.compareRevision === fresh.compareRevision
    && stored.reviewRevision === fresh.reviewRevision
    && stored.contentRevision === fresh.contentRevision
    && stored.artifactSnapshotDigest === fresh.artifactSnapshotDigest
    && stored.effectiveTextSha256 === fresh.effectiveTextSha256
    && stored.bindingPlanDigest === fresh.bindingPlanDigest
    && stored.bindingVersion === fresh.bindingVersion
    && stored.reportVersion === fresh.reportVersion
    && stored.strategyVersion === fresh.strategyVersion;
}

export function revalidateRateAuditAutoNextApproval(input: {
  approval: RateAuditAutoNextApproval;
  report: RateAuditReport | unknown;
  expectedSourcePath: string;
  expectedOutputPath: string;
  expectedDocId: string;
  expectedPromptId: string;
  completedRound: number;
  nextRound: number;
}): RateAuditAutoNextGateResult {
  const freshGate = evaluateRateAuditAutoNextGate({
    report: input.report,
    expectedSourcePath: input.expectedSourcePath,
    expectedOutputPath: input.expectedOutputPath,
    expectedDocId: input.expectedDocId,
    expectedPromptId: input.expectedPromptId,
    completedRound: input.completedRound,
    nextRound: input.nextRound,
  });
  if (!freshGate.allowed) return freshGate;
  if (!approvalsBindSameGeneration(input.approval, freshGate.approval)) {
    return blockedResult(
      "stale_approval",
      "倒计时期间 RateAudit 决策、审阅版本或正文快照已经变化，旧批准已取消；未启动下一轮模型任务。",
      `第 ${input.completedRound} 轮证据已变化，等待重新诊断。`,
    );
  }
  return freshGate;
}

export async function runRevalidatedRateAuditAutoNext(input: {
  getRateAudit: (sourcePath: string, outputPath?: string) => Promise<RateAuditReport>;
  launch: (approval: RateAuditAutoNextApproval) => Promise<void>;
  approval: RateAuditAutoNextApproval;
  sourcePath: string;
  outputPath: string;
  expectedDocId: string;
  expectedPromptId: string;
  completedRound: number;
  nextRound: number;
}): Promise<RateAuditAutoNextGateResult> {
  let report: RateAuditReport;
  try {
    report = await input.getRateAudit(input.sourcePath, input.outputPath);
  } catch {
    return blockedResult(
      "request_failed",
      "倒计时结束时无法重新获取 RateAudit 统一快照证据，已取消自动下一轮；未启动模型任务。",
      `第 ${input.completedRound} 轮复核失败，等待人工确认。`,
    );
  }
  const gate = revalidateRateAuditAutoNextApproval({
    approval: input.approval,
    report,
    expectedSourcePath: input.sourcePath,
    expectedOutputPath: input.outputPath,
    expectedDocId: input.expectedDocId,
    expectedPromptId: input.expectedPromptId,
    completedRound: input.completedRound,
    nextRound: input.nextRound,
  });
  if (gate.allowed) await input.launch(input.approval);
  return gate;
}

export async function runRateAuditGatedAutoNext(input: {
  getRateAudit: (sourcePath: string, outputPath?: string) => Promise<RateAuditReport>;
  schedule: (approval: RateAuditAutoNextApproval) => void;
  sourcePath: string;
  outputPath: string;
  expectedPromptId: string;
  expectedDocId: string;
  completedRound: number;
  nextRound: number;
}): Promise<RateAuditAutoNextGateResult> {
  let report: RateAuditReport;
  try {
    report = await input.getRateAudit(input.sourcePath, input.outputPath);
  } catch {
    return blockedResult(
      "request_failed",
      "RateAudit 诊断请求失败，已为安全起见暂停自动下一轮；可在质量报告确认后手动继续。",
      `第 ${input.completedRound} 轮已完成；RateAudit 请求失败，等待人工确认。`,
    );
  }
  const gate = evaluateRateAuditAutoNextGate({
    report,
    expectedSourcePath: input.sourcePath,
    expectedOutputPath: input.outputPath,
    expectedDocId: input.expectedDocId,
    expectedPromptId: input.expectedPromptId,
    completedRound: input.completedRound,
    nextRound: input.nextRound,
  });
  if (gate.allowed) {
    input.schedule(gate.approval);
  }
  return gate;
}
