import { buildExportRiskMessages } from "@/lib/qualityStats";
import type { ConfirmDialogOptions } from "@/lib/uiTypes";
import type {
  ExportResult,
  ReviewDecision,
  RoundCompareData,
} from "@/types/app";

export function buildExportRiskConfirmOptions(
  label: string,
  compareData: RoundCompareData | null,
  exportResult: ExportResult | null,
  reviewDecisions: Record<string, ReviewDecision> = {},
): ConfirmDialogOptions | null {
  const messages = buildExportRiskMessages(compareData, exportResult, reviewDecisions);
  if (!messages.length) return null;
  const highRisk = messages.some((message) => message.includes("高风险") || message.includes("硬审计"));
  return {
    title: highRisk ? `${label} 前存在高风险未确认项` : `${label} 前仍有风险`,
    description: highRisk
      ? "未确认的高风险块会优先导出原文，不会伪装成改写成功。请先到 Diff 处理，或明确确认后继续。"
      : "建议先确认下面的问题；如果你已经人工检查过，也可以继续导出。",
    details: messages,
    confirmLabel: highRisk ? "已知风险，继续导出" : "继续导出",
    cancelLabel: "先不导出",
    tone: highRisk ? "danger" : "warning",
  };
}

export function splitConfirmText(text: string): { description: string; details: string[] } {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    description: lines[0] ?? "",
    details: lines.slice(1).map((line) => line.replace(/^【(.+)】$/, "$1")),
  };
}

export function resolveExportOutputPath(input: {
  roundResultOutputPath?: string | null;
  compareOutputPath?: string | null;
}): string | null {
  return input.roundResultOutputPath || input.compareOutputPath || null;
}

export function buildExportCheckpointBlockedNotice(): string {
  return "当前轮还有断点未完成，先继续本轮再导出。";
}

export function buildExportMissingOutputNotice(): string {
  return "请先执行至少一轮处理，再导出结果。";
}

export function buildExportCancelledNotice(): string {
  return "已取消 Word 导出。";
}

export function buildExportLoadingRuntimeStep(format: string): string {
  return `正在导出 ${format.toUpperCase()}。`;
}

export function buildExportSuccessRuntimeStep(): string {
  return "导出完成";
}

export function buildExportFailureRuntimeStep(): string {
  return "导出失败";
}
