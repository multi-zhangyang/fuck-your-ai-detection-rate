import type { RoundResult, RunRoundStatus } from "@/types/app";
import { requestJson } from "@/lib/webServiceHttp";

export type RunStream = {
  eventSource: EventSource;
  progressListeners: Set<(payload: import("@/types/app").RoundProgress) => void>;
  resultPromise: Promise<RoundResult>;
  resolveResult: (value: RoundResult) => void;
  rejectResult: (error: Error) => void;
  settled: boolean;
  sseDisconnected: boolean;
  statusPollTimer?: number;
  statusFailureCount: number;
};

export const runStreams = new Map<string, RunStream>();

export function cleanupRunStream(runToken: string): void {
  const stream = runStreams.get(runToken);
  if (!stream) {
    return;
  }
  if (stream.statusPollTimer !== undefined) {
    window.clearInterval(stream.statusPollTimer);
  }
  stream.eventSource.close();
  runStreams.delete(runToken);
}

export function settleRunStreamWithResult(runToken: string, stream: RunStream, result: RoundResult): void {
  if (stream.settled) {
    return;
  }
  stream.settled = true;
  stream.resolveResult(result);
  cleanupRunStream(runToken);
}

export function settleRunStreamWithError(runToken: string, stream: RunStream, error: Error): void {
  if (stream.settled) {
    return;
  }
  stream.settled = true;
  stream.rejectResult(error);
  cleanupRunStream(runToken);
}

export function startRunStatusPolling(runToken: string, stream: RunStream): void {
  stream.statusPollTimer = window.setInterval(async () => {
    if (stream.settled) {
      cleanupRunStream(runToken);
      return;
    }
    try {
      const status = await requestJson<RunRoundStatus>(`/api/run-round-status/${encodeURIComponent(runToken)}`, {
        timeoutMs: 8_000,
      });
      stream.statusFailureCount = 0;
      if (!status.completed) {
        return;
      }
      if (status.error) {
        settleRunStreamWithError(runToken, stream, new Error(status.error));
        return;
      }
      if (status.result) {
        settleRunStreamWithResult(runToken, stream, status.result);
        return;
      }
      settleRunStreamWithError(runToken, stream, new Error(`运行已结束，但服务未返回结果。状态：${status.status}`));
    } catch (error) {
      stream.statusFailureCount += 1;
      if (stream.statusFailureCount >= 12 && (stream.sseDisconnected || stream.eventSource.readyState === EventSource.CLOSED)) {
        settleRunStreamWithError(
          runToken,
          stream,
          error instanceof Error ? error : new Error("进度通道已断开，状态同步也未能恢复。"),
        );
      }
    }
  }, 5_000);
}
