import type { RoundProgress, RoundProgressStatus } from "@/types/app";

export type RunRecoveryPanelState = {
  title: string;
  message: string;
  tone: "blue" | "amber" | "red";
  phaseLabel: string;
  actionHint: string;
  resumeActionLabel?: string;
  resumeExplanation?: string;
  nextChunkId?: string;
  nextChunkIndex?: number;
  remainingChunks?: number;
  completedChunks: number;
  totalChunks: number;
  percent: number;
  eventCount?: number;
  error?: string;
};

export function buildRunRecoveryPanelState(input: {
  running: boolean;
  progress: RoundProgress | null;
  activeRunStatus: NonNullable<RoundProgressStatus["activeRun"]> | null;
  resumableCheckpoint: RoundProgressStatus | null;
  nextRound?: number | null;
}): RunRecoveryPanelState | null {
  const activeProgress = input.progress ?? input.activeRunStatus?.lastEvent ?? null;
  const checkpoint = input.resumableCheckpoint;
  const completedChunks = Number(
    activeProgress?.currentChunk
    ?? activeProgress?.completedChunks
    ?? checkpoint?.completedChunks
    ?? 0,
  ) || 0;
  const totalChunks = Number(activeProgress?.totalChunks ?? checkpoint?.totalChunks ?? 0) || 0;
  const percent = totalChunks ? Math.max(0, Math.min(100, Math.round((completedChunks / totalChunks) * 100))) : 0;
  const phaseLabel = activeProgress?.phase || input.activeRunStatus?.status || (checkpoint ? "checkpoint" : "");
  if (input.running) {
    const canceling = activeProgress?.phase === "cancel-requested" || input.activeRunStatus?.cancelRequested;
    return {
      title: canceling ? "正在中断当前轮" : "当前轮次运行中",
      message: canceling ? "等待安全点落盘。" : "进度同步中。",
      tone: canceling ? "red" : "blue",
      phaseLabel,
      actionHint: "",
      resumeActionLabel: activeProgress?.resumeActionLabel,
      resumeExplanation: activeProgress?.resumeExplanation,
      nextChunkId: activeProgress?.nextChunkId,
      nextChunkIndex: activeProgress?.nextChunkIndex,
      remainingChunks: activeProgress?.remainingChunks,
      completedChunks,
      totalChunks,
      percent,
      eventCount: input.activeRunStatus?.eventCount,
      error: activeProgress?.error || input.activeRunStatus?.error || undefined,
    };
  }
  if (input.activeRunStatus) {
    return {
      title: "检测到后台运行",
      message: "后端仍有同一文档的活跃任务，前端会优先接管它，避免重复启动。",
      tone: input.activeRunStatus.cancelRequested ? "red" : "blue",
      phaseLabel,
      actionHint: "等待自动接管；如果长时间不动，刷新状态后再判断是否继续。",
      completedChunks,
      totalChunks,
      percent,
      eventCount: input.activeRunStatus.eventCount,
      error: input.activeRunStatus.error || undefined,
    };
  }
  if (checkpoint) {
    const allChunksDone = checkpoint.resumeStage === "finalize_output";
    const resumeActionLabel = checkpoint.resumeActionLabel || (allChunksDone ? "继续收尾" : "继续当前轮");
    return {
      title: allChunksDone ? `第 ${checkpoint.round ?? input.nextRound ?? ""} 轮等待收尾` : `发现第 ${checkpoint.round ?? input.nextRound ?? ""} 轮断点`,
      message: allChunksDone ? "等待合并输出。" : "可从断点继续。",
      tone: checkpoint.lastError ? "amber" : "blue",
      phaseLabel,
      actionHint: "",
      resumeActionLabel,
      resumeExplanation: checkpoint.resumeExplanation,
      nextChunkId: checkpoint.nextChunkId,
      nextChunkIndex: checkpoint.nextChunkIndex,
      remainingChunks: checkpoint.remainingChunks,
      completedChunks,
      totalChunks,
      percent: checkpoint.progressPercent || percent,
      error: checkpoint.lastError || undefined,
    };
  }
  return null;
}
