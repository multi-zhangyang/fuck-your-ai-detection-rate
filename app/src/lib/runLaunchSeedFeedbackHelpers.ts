import { createCheckpointProgress } from "@/lib/progressHelpers";
import { createLiveCompareData } from "@/lib/roundResultHelpers";
import { formatRuntimeStep } from "@/lib/runtimeProgress";
import type {
  DocumentStatus,
  ModelConfig,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
} from "@/types/app";

export function pickLiveCompareSeed(
  activeCompareData: RoundCompareData | null | undefined,
  launchStatus: DocumentStatus,
  nextRound: number,
): RoundCompareData {
  return activeCompareData?.round === nextRound
    ? activeCompareData
    : createLiveCompareData(launchStatus, nextRound);
}

export function buildInitialRunProgress(
  checkpointStatus: RoundProgressStatus | null,
  nextRound: number,
  rewriteConcurrency: number,
): RoundProgress {
  return createCheckpointProgress(checkpointStatus, rewriteConcurrency) ?? {
    phase: "run-starting",
    round: nextRound,
    completedChunks: 0,
    activeChunks: 0,
    queuedChunks: 0,
    concurrency: rewriteConcurrency,
    configuredConcurrency: rewriteConcurrency,
  };
}

export function buildWorkflowCompleteFeedback(): { notice: string; runtimeStep: string } {
  return {
    notice: "当前流程已完成，可导出；需要继续请先在改写流程里增加轮次。",
    runtimeStep: "流程已完成",
  };
}

export function isWorkflowAlreadyComplete(status: DocumentStatus, plannedRounds: number): boolean {
  if (status.nextRound && status.nextRound > plannedRounds) {
    return true;
  }
  return !status.hasNextRound || status.isComplete || !status.nextRound;
}

export function buildRunStartFeedback(input: {
  checkpointProgress: RoundProgress | null;
  nextRound: number;
  promptProfileLabel: string;
}): { runtimeStep: string; notice: string } {
  if (input.checkpointProgress) {
    return {
      runtimeStep: formatRuntimeStep(input.checkpointProgress, `准备续跑第 ${input.nextRound} 轮。`),
      notice: input.checkpointProgress.resumeExplanation || "已识别断点，本次会从已完成分块后继续，不会重头跑。",
    };
  }
  return {
    runtimeStep: `准备执行第 ${input.nextRound} 轮。`,
    notice: `本次运行将使用 ${input.promptProfileLabel}，中途失败时会优先尝试断点续跑。`,
  };
}

export function buildAttachActiveRunNotice(): string {
  return "已接管后台运行中的轮次；刷新页面后会继续监听，不会再误开新任务。";
}

export function buildBusyRunNotice(): string {
  return "当前轮次正在运行中；如需停止，请先点击中断当前轮。";
}

export function buildMissingDocumentNotice(): string {
  return "请先上传一个 txt 或 docx 文档。";
}
