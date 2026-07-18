import type { RoundProgress } from "@/types/app";

export function formatProviderErrorBrief(progress: RoundProgress): string {
  const category = String(progress.errorCategory || "").trim();
  const statusCode = progress.statusCode ? `HTTP ${progress.statusCode}` : "";
  const attempts = progress.attempts ? `${progress.attempts}${progress.maxAttempts ? `/${progress.maxAttempts}` : ""} 次` : "";
  const cooldown = progress.cooldownSeconds ? `冷却 ${Math.ceil(Number(progress.cooldownSeconds) || 0)}s` : "";
  const label = category === "rate_limit"
    ? "限流"
    : category === "server"
      ? "服务端异常"
      : category === "timeout"
        ? "超时"
        : category === "network"
          ? "网络异常"
          : category === "auth"
            ? "鉴权失败"
            : category === "endpoint"
              ? "接口不匹配"
              : category === "response_parse"
                ? "响应解析失败"
                : "";
  return [label, statusCode, attempts, cooldown].filter(Boolean).join("，");
}

export function formatRuntimeStep(progress: RoundProgress | null, fallback: string): string {
  if (!progress) {
    return fallback;
  }
  const completedChunks = progress.completedChunks ?? (progress.phase === "chunk-complete" ? progress.currentChunk : 0) ?? 0;
  const remainingChunks = progress.totalChunks ? Math.max(0, progress.totalChunks - completedChunks) : 0;
  const configuredConcurrency = progress.configuredConcurrency ?? progress.concurrency;
  const concurrencyText = progress.concurrency
    ? `，并发 ${progress.concurrency}${configuredConcurrency && configuredConcurrency !== progress.concurrency ? `/${configuredConcurrency}` : ""}`
    : "";
  if (progress.phase === "chunking-ready" && progress.totalChunks) {
    const estimateText = progress.estimatedApiCalls
      ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用`
      : "";
    return `已完成切块，共 ${progress.totalChunks} 个分块${estimateText}${concurrencyText}。`;
  }
  if (progress.phase === "resuming-from-checkpoint" && progress.completedChunks && progress.totalChunks) {
    if (progress.resumeStage === "finalize_output") {
      return `检测到第 ${progress.round} 轮所有分块已落盘，正在继续收尾，不会重跑已完成分块。`;
    }
    if (progress.resumeActionLabel) {
      return `检测到断点续跑，${progress.resumeActionLabel}，已复用 ${progress.completedChunks}/${progress.totalChunks} 个分块结果。`;
    }
    return `检测到断点续跑，已复用 ${progress.completedChunks}/${progress.totalChunks} 个分块结果。`;
  }
  if (progress.phase === "processing-chunk" && progress.totalChunks) {
    const callText = progress.estimatedApiCalls ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用` : "";
    return `正在执行第 ${progress.round} 轮，已完成 ${completedChunks}/${progress.totalChunks}，剩余 ${remainingChunks}${concurrencyText}${callText}。`;
  }
  if (progress.phase === "provider-retry-wait") {
    const retryDelay = Math.ceil(Number(progress.retryDelaySeconds ?? 0) || 0);
    const retryText = progress.attempts && progress.maxAttempts ? `第 ${progress.attempts}/${progress.maxAttempts} 次失败` : "请求失败";
    const statusText = progress.statusCode ? `HTTP ${progress.statusCode}` : formatProviderErrorBrief(progress);
    return `分块 ${progress.chunkId || "-"} 上游${statusText ? ` ${statusText}` : ""}，${retryText}，${retryDelay}s 后重试。`;
  }
  if (progress.phase === "provider-stream") {
    const eventCount = Math.max(0, Number(progress.streamEventCount ?? 0) || 0);
    return progress.streamDone
      ? `分块 ${progress.chunkId || "-"} 已完成上游传输，正在执行本地校验；思考内容已隔离，模型片段不实时展示。`
      : `分块 ${progress.chunkId || "-"} 正在流式生成${eventCount ? `（已接收 ${eventCount} 个安全进度事件）` : ""}；思考内容已隔离，模型片段不实时展示。`;
  }
  if (progress.phase === "chunk-complete" && progress.totalChunks) {
    return `第 ${progress.round} 轮已完成 ${completedChunks}/${progress.totalChunks} 个分块。`;
  }
  if (progress.phase === "chunk-failed" && progress.totalChunks) {
    const errorBrief = formatProviderErrorBrief(progress);
    return `第 ${progress.round} 轮有分块失败，已完成 ${completedChunks}/${progress.totalChunks} 个分块${errorBrief ? `；${errorBrief}` : ""}。`;
  }
  if (progress.phase === "cancel-requested") {
    return "正在中断当前轮次，已完成分块会保留。";
  }
  if (progress.phase === "restoring-output") {
    return `第 ${progress.round} 轮分块处理完成，正在合并输出。`;
  }
  return fallback;
}
