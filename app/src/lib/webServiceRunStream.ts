import type { RoundProgress, RoundResult } from "@/types/app";
import { WEB_API_BASE } from "@/lib/webServiceHttp";
import {
  cleanupRunStream,
  runStreams,
  settleRunStreamWithError,
  settleRunStreamWithResult,
  startRunStatusPolling,
  type RunStream,
} from "@/lib/webServiceRunStreamLifecycle";

export {
  cleanupRunStream,
  settleRunStreamWithResult,
  settleRunStreamWithError,
  startRunStatusPolling,
} from "@/lib/webServiceRunStreamLifecycle";

function parseStreamPayload<T>(data: string, label: string): T {
  try {
    const payload = JSON.parse(data) as unknown;
    if (!payload || typeof payload !== "object") {
      throw new Error("响应不是对象");
    }
    return payload as T;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label}数据格式无效：${reason}`);
  }
}

export function ensureRunStream(runToken: string): RunStream {
  const existingStream = runStreams.get(runToken);
  if (existingStream) {
    return existingStream;
  }

  let resolveResult!: (value: RoundResult) => void;
  let rejectResult!: (error: Error) => void;
  const resultPromise = new Promise<RoundResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const eventSource = new EventSource(`${WEB_API_BASE}/api/run-round-events/${runToken}`, { withCredentials: true });
  const stream: RunStream = {
    eventSource,
    progressListeners: new Set(),
    resultPromise,
    resolveResult,
    rejectResult,
    settled: false,
    sseDisconnected: false,
    statusFailureCount: 0,
  };

  eventSource.addEventListener("progress", (event) => {
    const message = event as MessageEvent;
    try {
      const payload = parseStreamPayload<RoundProgress>(message.data, "运行进度");
      stream.progressListeners.forEach((listener) => listener(payload));
    } catch (error) {
      settleRunStreamWithError(runToken, stream, error instanceof Error ? error : new Error(String(error)));
    }
  });

  eventSource.addEventListener("result", (event) => {
    const message = event as MessageEvent;
    try {
      settleRunStreamWithResult(runToken, stream, parseStreamPayload<RoundResult>(message.data, "运行结果"));
    } catch (error) {
      settleRunStreamWithError(runToken, stream, error instanceof Error ? error : new Error(String(error)));
    }
  });

  eventSource.addEventListener("run-error", (event) => {
    const message = event as MessageEvent;
    try {
      const payload = parseStreamPayload<{ message?: string }>(message.data, "运行错误");
      settleRunStreamWithError(runToken, stream, new Error(payload.message || "当前改写轮次运行失败。"));
    } catch (error) {
      settleRunStreamWithError(runToken, stream, error instanceof Error ? error : new Error(String(error)));
    }
  });

  eventSource.onerror = () => {
    if (stream.settled) {
      return;
    }
    if (eventSource.readyState !== EventSource.CLOSED) {
      return;
    }
    stream.sseDisconnected = true;
    eventSource.close();
  };

  runStreams.set(runToken, stream);
  startRunStatusPolling(runToken, stream);
  return stream;
}
