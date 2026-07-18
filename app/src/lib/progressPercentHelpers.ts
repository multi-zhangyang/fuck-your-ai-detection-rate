import { clampPercent } from "@/lib/qualityStats";
import type { TaskPhase } from "@/lib/taskState";
import type { RuntimeTaskTone } from "@/lib/uiTypes";
import type { BatchRerunStatus, RoundProgress } from "@/types/app";

export function getProgressPercent(progress: RoundProgress | null, completedRounds: number, plannedRounds: number): number {
  if (progress?.totalChunks) {
    const current = progress.currentChunk ?? progress.completedChunks ?? 0;
    return Math.max(6, Math.min(100, Math.round((current / progress.totalChunks) * 100)));
  }
  if (plannedRounds > 0) {
    return Math.round((Math.min(completedRounds, plannedRounds) / plannedRounds) * 100);
  }
  return 0;
}

export function getRoundTaskPercent(progress: RoundProgress | null, fallbackPercent = 0): number | undefined {
  if (progress?.totalChunks) {
    const current = progress.currentChunk ?? progress.completedChunks ?? 0;
    return clampPercent((current / progress.totalChunks) * 100);
  }
  return fallbackPercent > 0 ? clampPercent(fallbackPercent) : undefined;
}

export function getBatchTaskPercent(status: BatchRerunStatus | null | undefined): number | undefined {
  if (!status?.totalCount) {
    return undefined;
  }
  return clampPercent((status.completedCount / status.totalCount) * 100);
}

export function getPhaseTaskTone(phase: TaskPhase): RuntimeTaskTone {
  if (phase.includes("canceling")) {
    return "red";
  }
  if (phase.includes("parsing") || phase.includes("loading") || phase.includes("saving")) {
    return "blue";
  }
  if (phase.includes("exporting") || phase.includes("applying")) {
    return "emerald";
  }
  if (phase.includes("deleting") || phase.includes("resetting")) {
    return "amber";
  }
  return "slate";
}
