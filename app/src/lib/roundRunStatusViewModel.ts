import { normalizeRewriteConcurrency } from "@/lib/modelRoute";
import { clampPercent } from "@/lib/qualityStats";
import { formatProviderErrorBrief } from "@/lib/runtimeProgress";
import type { RoundProgress } from "@/types/app";

export function deriveRoundRunStatusViewState(input: {
  progress: RoundProgress | null;
  configuredConcurrency: number;
  cancelRequested: boolean;
}) {
  const totalChunks = Math.max(0, Number(input.progress?.totalChunks ?? 0) || 0);
  const completedSource = input.progress?.completedChunks ?? (input.progress?.phase === "chunk-complete" ? input.progress.currentChunk : 0) ?? 0;
  const completedChunks = Math.max(0, Number(completedSource) || 0);
  const safeCompletedChunks = totalChunks ? Math.min(completedChunks, totalChunks) : completedChunks;
  const activeChunks = Math.max(0, Number(input.progress?.activeChunks ?? 0) || 0);
  const queuedChunks = Math.max(0, Number(input.progress?.queuedChunks ?? 0) || 0);
  const remainingChunks = totalChunks ? Math.max(0, totalChunks - safeCompletedChunks) : activeChunks + queuedChunks;
  const configuredConcurrencyValue = normalizeRewriteConcurrency(input.progress?.configuredConcurrency ?? input.configuredConcurrency);
  const actualConcurrency = input.progress?.concurrency ? normalizeRewriteConcurrency(input.progress.concurrency, configuredConcurrencyValue) : null;
  const concurrencyLabel = String(configuredConcurrencyValue);
  const concurrencyDetail = actualConcurrency && actualConcurrency !== configuredConcurrencyValue ? `实际 ${actualConcurrency}` : "已配置";
  const percent = totalChunks ? clampPercent(Math.round((safeCompletedChunks / totalChunks) * 100)) : 0;
  const failed = input.progress?.phase === "chunk-failed";
  const errorBrief = input.progress ? formatProviderErrorBrief(input.progress) : "";
  const restoring = input.progress?.phase === "restoring-output";
  const streaming = input.progress?.phase === "provider-stream";
  const streamChars = Math.max(0, Number(input.progress?.finalTextChars ?? 0) || 0);
  const statusLabel = input.cancelRequested || input.progress?.phase === "cancel-requested"
    ? "中断中"
    : failed
      ? "异常"
      : restoring
        ? "收尾"
        : streaming
          ? "流式生成"
          : "运行中";
  return {
    totalChunks,
    safeCompletedChunks,
    remainingChunks,
    concurrencyLabel,
    concurrencyDetail,
    percent,
    failed,
    errorBrief,
    streaming,
    streamChars,
    statusLabel,
    chunkId: input.progress?.chunkId,
  };
}
