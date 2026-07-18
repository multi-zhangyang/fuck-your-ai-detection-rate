import { formatBytes } from "@/lib/formatters";
import type { EnvironmentDiagnostics } from "@/types/app";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function formatShortTaskId(runId: string | null | undefined): string | undefined {
  if (!runId) {
    return undefined;
  }
  return `任务 ${runId.slice(0, 8)}`;
}

export function planDiagnosticsSuccessFeedback(result: EnvironmentDiagnostics): {
  notice: string;
  runtimeStep: string;
} {
  const warningCount = result.checks.filter((item) => item.level === "warning").length;
  const errorCount = result.checks.filter((item) => item.level === "error").length;
  return {
    notice: errorCount
      ? `启动诊断发现 ${errorCount} 个错误。`
      : warningCount
        ? `启动诊断完成，有 ${warningCount} 个提示项。`
        : "启动诊断通过。",
    runtimeStep: errorCount ? "启动诊断发现错误" : "启动诊断完成",
  };
}

export function planDiagnosticsFailureFeedback(): {
  runtimeStep: string;
} {
  return { runtimeStep: "启动诊断失败" };
}

export function planPromptPreviewsSuccessNotice(): string {
  return "提示词已刷新。";
}

export function planPromptPreviewsUnavailableMessage(status?: number, fallback = ""): string {
  if (status === 405) {
    return "本地后端还没有加载提示词接口，请停止当前 Web 服务后重新运行一键启动脚本。";
  }
  return fallback;
}

export function planTaskStateSnapshotCleanupSuccessFeedback(result: {
  deletedCount: number;
  deletedBytes: number;
  failedFiles: unknown[];
}): { notice: string; runtimeStep: string } {
  const failedText = result.failedFiles.length ? `，${result.failedFiles.length} 个文件未能删除` : "";
  return {
    notice: `已清理 ${result.deletedCount} 个过期任务快照，释放 ${formatBytes(result.deletedBytes)}${failedText}。正在运行的任务快照不会被删除。`,
    runtimeStep: "过期任务快照清理完成",
  };
}
