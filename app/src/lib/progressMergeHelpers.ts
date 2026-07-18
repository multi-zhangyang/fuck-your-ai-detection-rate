import { normalizeRewriteConcurrency } from "@/lib/modelRoute";
import type { RoundCompareData, RoundProgress, RoundProgressStatus } from "@/types/app";

export function mergeProgressIntoCompareData(current: RoundCompareData | null, progress: RoundProgress, fallback: RoundCompareData): RoundCompareData {
  if (!progress.compareInputText || !progress.compareOutputText || !progress.chunkId) {
    return current ?? fallback;
  }

  const base = current ?? fallback;
  const nextChunk = {
    chunkId: progress.chunkId,
    paragraphIndex: progress.paragraphIndex ?? 0,
    chunkIndex: progress.chunkIndex ?? 0,
    inputText: progress.compareInputText,
    outputText: progress.compareOutputText,
    inputCharCount: progress.compareInputText.length,
    outputCharCount: progress.compareOutputText.length,
  };
  const chunks = [...base.chunks];
  const existingIndex = chunks.findIndex((chunk) => chunk.chunkId === nextChunk.chunkId);
  if (existingIndex >= 0) {
    chunks[existingIndex] = { ...chunks[existingIndex], ...nextChunk };
  } else {
    chunks.push(nextChunk);
  }
  chunks.sort((left, right) => left.paragraphIndex - right.paragraphIndex || left.chunkIndex - right.chunkIndex);

  return {
    ...base,
    outputPath: progress.outputPath || base.outputPath,
    paragraphCount: Math.max(base.paragraphCount, progress.paragraphCount ?? 0),
    chunkCount: Math.max(base.chunkCount, progress.totalChunks ?? chunks.length),
    updatedAt: new Date().toISOString(),
    chunks,
  };
}

export function getProgressPosition(progress: RoundProgress | null): number {
  if (!progress) {
    return 0;
  }
  return progress.completedChunks ?? progress.currentChunk ?? 0;
}

export function mergeVisibleProgress(current: RoundProgress | null, next: RoundProgress): RoundProgress {
  if (!current) {
    return next;
  }
  if (next.phase === "cancel-requested") {
    return {
      ...current,
      phase: "cancel-requested",
    };
  }
  if (!next.totalChunks && current.totalChunks && next.round === current.round) {
    return {
      ...current,
      ...next,
      currentChunk: next.currentChunk ?? current.currentChunk,
      totalChunks: current.totalChunks,
      completedChunks: next.completedChunks ?? current.completedChunks,
      activeChunks: next.activeChunks ?? current.activeChunks,
      queuedChunks: next.queuedChunks ?? current.queuedChunks,
      concurrency: next.concurrency ?? current.concurrency,
      configuredConcurrency: next.configuredConcurrency ?? current.configuredConcurrency,
      estimatedApiCalls: next.estimatedApiCalls ?? current.estimatedApiCalls,
    };
  }
  if (current.round !== next.round || current.totalChunks !== next.totalChunks) {
    return next;
  }
  const currentPosition = getProgressPosition(current);
  const nextPosition = getProgressPosition(next);
  if (currentPosition > 0 && next.phase === "chunking-ready") {
    return current;
  }
  if (next.phase === "chunk-complete" && nextPosition > 0 && nextPosition < currentPosition) {
    return current;
  }
  return next;
}

export function createCheckpointProgress(status: RoundProgressStatus | null, configuredConcurrency?: number): RoundProgress | null {
  if (!status?.canResume || !status.round) {
    return null;
  }
  const seededConcurrency = normalizeRewriteConcurrency(
    configuredConcurrency ?? status.activeRun?.lastEvent?.configuredConcurrency ?? status.activeRun?.lastEvent?.concurrency,
  );
  return {
    phase: "resuming-from-checkpoint",
    round: status.round,
    currentChunk: status.completedChunks,
    completedChunks: status.completedChunks,
    totalChunks: status.totalChunks || undefined,
    concurrency: status.activeRun?.lastEvent?.concurrency ?? seededConcurrency,
    configuredConcurrency: seededConcurrency,
    checkpointPath: status.checkpointPath,
    error: status.lastError || undefined,
    nextChunkId: status.nextChunkId,
    nextChunkIndex: status.nextChunkIndex,
    remainingChunks: status.remainingChunks,
    resumeStage: status.resumeStage,
    resumeActionLabel: status.resumeActionLabel,
    resumeExplanation: status.resumeExplanation,
    estimatedApiCalls: status.totalChunks || undefined,
  };
}
