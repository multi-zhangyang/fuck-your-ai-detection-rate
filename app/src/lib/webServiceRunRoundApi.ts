import type {
  ModelConfig,
  PreviousRoundRevisionBinding,
  RoundProgress,
  RoundProgressStatus,
  RoundResult,
  RunRoundStatus,
} from "@/types/app";
import { ensureRunStream, cleanupRunStream } from "@/lib/webServiceRunStream";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceRunRoundApi = {
  async startRunRound(
    sourcePath: string,
    modelConfig: ModelConfig,
    previousRoundBinding?: PreviousRoundRevisionBinding,
  ): Promise<string | null> {
    const payload = {
      sourcePath,
      modelConfig,
      ...previousRoundBinding,
    };
    const { runId } = await requestJson<{ runId: string; alreadyActive?: boolean }>("/api/run-round", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return runId;
  },

  async getRunRoundStatus(runToken: string): Promise<RunRoundStatus> {
    return requestJson<RunRoundStatus>(`/api/run-round-status/${encodeURIComponent(runToken)}`);
  },

  async cancelRunRound(runToken: string): Promise<void> {
    await requestJson(`/api/run-round/${encodeURIComponent(runToken)}/cancel`, { method: "POST" });
  },

  async getRoundProgressStatus(sourcePath: string, promptProfile: ModelConfig["promptProfile"], roundNumber?: number | null, promptSequence?: ModelConfig["promptSequence"]): Promise<RoundProgressStatus> {
    const query = new URLSearchParams({ sourcePath, promptProfile });
    if (roundNumber) {
      query.set("roundNumber", String(roundNumber));
    }
    if (promptSequence?.length) {
      query.set("promptSequence", promptSequence.join(","));
    }
    return requestJson<RoundProgressStatus>(`/api/round-progress-status?${query.toString()}`);
  },

  async resetRoundProgress(sourcePath: string, promptProfile: ModelConfig["promptProfile"], roundNumber: number, promptSequence?: ModelConfig["promptSequence"]): Promise<void> {
    await requestJson("/api/round-progress", {
      method: "DELETE",
      body: JSON.stringify({ sourcePath, promptProfile, roundNumber, promptSequence: promptSequence ?? [] }),
    });
  },

  async awaitRunRound(_: string, __: ModelConfig, runToken?: string | null): Promise<RoundResult> {
    if (!runToken) {
      throw new Error("Web 模式缺少运行标识，无法继续等待结果。");
    }
    const stream = ensureRunStream(runToken);
    return stream.resultPromise;
  },

  async listenRoundProgress(onProgress: (payload: RoundProgress) => void, runToken?: string | null): Promise<() => void> {
    if (!runToken) {
      return async () => undefined;
    }
    const stream = ensureRunStream(runToken);
    stream.progressListeners.add(onProgress);
    return async () => {
      stream.progressListeners.delete(onProgress);
      if (stream.settled && stream.progressListeners.size === 0) {
        cleanupRunStream(runToken);
      }
    };
  },
};
