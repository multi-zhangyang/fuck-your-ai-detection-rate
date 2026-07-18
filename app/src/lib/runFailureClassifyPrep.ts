import { isInterruptedRunMessage, isResumableRunMessage } from "@/lib/autoRunScope";
import type { ClassifiedRunFailure } from "@/lib/runFailurePrepTypes";

export function classifyRunFailure(runMessage: string, userCanceled: boolean, mode: "start" | "attach" = "start"): ClassifiedRunFailure {
  const interrupted = isInterruptedRunMessage(runMessage);
  const resumable = isResumableRunMessage(runMessage);
  if (mode === "attach") {
    return {
      interrupted,
      resumable,
      userCanceled,
      errorText: resumable ? "" : runMessage,
      runtimeStep: runMessage.includes("Unknown run id")
        ? "后台任务已结束，请刷新文档状态"
        : resumable
          ? "后台轮次中断，准备恢复"
          : "后台轮次监听失败",
    };
  }
  if (interrupted) {
    return {
      interrupted: true,
      resumable,
      userCanceled,
      errorText: "",
      runtimeStep: "当前轮次已中断，可继续执行",
      noticeText: runMessage,
    };
  }
  return {
    interrupted: false,
    resumable,
    userCanceled,
    errorText: runMessage,
    runtimeStep: resumable ? "执行中断，可尝试续跑" : "执行轮次失败",
  };
}

export function materializeRunFailureUi(failure: {
  errorText: string;
  runtimeStep: string;
  noticeText?: string;
}): {
  error: string;
  notice?: string;
  runtimeStep: string;
  clearError: boolean;
} {
  if (failure.noticeText) {
    return {
      error: "",
      notice: failure.noticeText,
      runtimeStep: failure.runtimeStep,
      clearError: true,
    };
  }
  return {
    error: failure.errorText,
    runtimeStep: failure.runtimeStep,
    clearError: false,
  };
}
