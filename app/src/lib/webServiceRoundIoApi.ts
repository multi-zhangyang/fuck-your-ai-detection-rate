import type {
  BatchRerunStatus,
  BatchRerunTarget,
  ModelConfig,
  OutputPreview,
  ReviewDecision,
  ReviewDecisionsResult,
  RoundArtifactSnapshot,
  RoundArtifactSnapshotReadOptions,
  RoundCompareData,
  RerunChunkResult,
} from "@/types/app";
import { validateRoundArtifactSnapshot } from "@/lib/roundArtifactSnapshot";
import { requestJson } from "@/lib/webServiceHttp";

export const webServiceRoundIoApi = {
  async readOutput(outputPath: string, maxChars?: number): Promise<OutputPreview> {
    const query = new URLSearchParams({ outputPath });
    if (typeof maxChars === "number" && maxChars > 0) {
      query.set("maxChars", String(maxChars));
    }
    return requestJson<OutputPreview>(`/api/read-output?${query.toString()}`);
  },

  async readRoundSnapshot(
    outputPath: string,
    options: RoundArtifactSnapshotReadOptions = {},
  ): Promise<RoundArtifactSnapshot> {
    const query = new URLSearchParams({ outputPath });
    if (
      typeof options.maxChars === "number"
      && Number.isFinite(options.maxChars)
      && options.maxChars > 0
    ) {
      query.set("maxChars", String(Math.floor(options.maxChars)));
    }
    const payload = await requestJson<unknown>(`/api/round-snapshot?${query.toString()}`, {
      cache: "no-store",
      signal: options.signal,
    });
    return validateRoundArtifactSnapshot(payload, { expectedOutputPath: outputPath });
  },

  async readCompare(outputPath: string): Promise<RoundCompareData> {
    return requestJson<RoundCompareData>(`/api/read-compare?outputPath=${encodeURIComponent(outputPath)}`);
  },

  async loadReviewDecisions(outputPath: string): Promise<ReviewDecisionsResult> {
    return requestJson<ReviewDecisionsResult>(`/api/review-decisions?outputPath=${encodeURIComponent(outputPath)}`);
  },

  async saveReviewDecisions(
    outputPath: string,
    decisions: Record<string, ReviewDecision>,
    expectedCompareRevision: string,
  ): Promise<ReviewDecisionsResult> {
    return requestJson<ReviewDecisionsResult>("/api/review-decisions", {
      method: "POST",
      keepalive: true,
      body: JSON.stringify({ outputPath, decisions, expectedCompareRevision }),
    });
  },

  async rerunChunk(outputPath: string, chunkId: string, modelConfig: ModelConfig, userFeedback?: string): Promise<RerunChunkResult> {
    return requestJson<RerunChunkResult>("/api/rerun-chunk", {
      method: "POST",
      body: JSON.stringify({ outputPath, chunkId, modelConfig, userFeedback }),
    });
  },

  async startBatchRerun(outputPath: string, targets: BatchRerunTarget[], modelConfig: ModelConfig): Promise<string> {
    const { runId } = await requestJson<{ runId: string; alreadyActive?: boolean }>("/api/batch-rerun", {
      method: "POST",
      body: JSON.stringify({ outputPath, targets, modelConfig }),
    });
    return runId;
  },

  async getBatchRerunStatus(runToken: string): Promise<BatchRerunStatus> {
    return requestJson<BatchRerunStatus>(`/api/batch-rerun-status/${encodeURIComponent(runToken)}`);
  },

  async cancelBatchRerun(runToken: string): Promise<void> {
    await requestJson(`/api/batch-rerun/${encodeURIComponent(runToken)}/cancel`, { method: "POST" });
  },
};
