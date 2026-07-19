import type { RuntimeTaskTone } from "@/lib/uiTypes";
import type { WorkbenchView } from "@/lib/workbenchNav";

export function getErrorRecoveryPlan(message: string): { target: WorkbenchView; actionLabel: string; tone: RuntimeTaskTone } {
  const lowered = message.toLowerCase();
  if (message.includes("中断") || message.includes("断点") || message.includes("Unknown run id") || message.includes("运行通道")) {
    return {
      target: "home",
      actionLabel: "回主页续跑",
      tone: "blue",
    };
  }
  if (message.includes("模型配置") || message.includes("接口") || message.includes("API Key") || message.includes("Base URL") || lowered.includes("model")) {
    return {
      target: "model",
      actionLabel: "检查模型配置",
      tone: "amber",
    };
  }
  if (message.includes("导出") || message.includes("Word") || message.includes("审计")) {
    return {
      target: "quality",
      actionLabel: "查看降检报告",
      tone: "red",
    };
  }
  return {
    target: "diagnostics",
    actionLabel: "查看诊断",
    tone: "red",
  };
}

export function isDiscardableRestoreError(message: string): boolean {
  return message.includes("Source file must stay under allowed workspace directories")
    || message.includes("sourcePath must stay under allowed workspace directories")
    || message.includes("Source path is required")
    || message.includes("sourcePath is required");
}
