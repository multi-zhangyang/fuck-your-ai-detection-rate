import type { AppService, PickedDocument } from "./appService";
import type {
  DeleteHistoryResult,
  DeleteHistoryOptions,
  DetectionReport,
  DetectionReportProvider,
  DocumentHistory,
  DocumentProtectionMap,
  DocumentStatus,
  EnvironmentDiagnostics,
  ExportIssueSample,
  ExportResult,
  FormatRules,
  FormatRulesResult,
  HistoryDeleteImpact,
  HistoryOrphanDeleteResult,
  HistoryOrphanScanResult,
  HistoryListResponse,
  ModelCatalogResult,
  ModelConfig,
  OutputPreview,
  PromptId,
  PromptPreviewItem,
  PromptPreviewResponse,
  ReviewDecision,
  RoundCompareData,
  RoundProgress,
  RoundProgressStatus,
  RunRoundStatus,
  RoundResult,
  TaskStateCleanupResult,
  TestConnectionResult,
  BatchRerunStatus,
  BatchRerunTarget,
} from "../types/app";

const WEB_API_GLOBALS = globalThis as { __FYADR_WEB_API__?: string };
const WEB_API_BASE = WEB_API_GLOBALS.__FYADR_WEB_API__ ?? import.meta.env.VITE_FYADR_API_BASE ?? "";
const FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_MS = 300_000;
const FORMAT_RULE_PARSE_MAX_TIMEOUT_MS = 1_815_000;
const PROMPT_PREVIEW_FALLBACKS: Array<{ id: PromptId; label: string; description: string; relativePath: string }> = [
  { id: "prewrite", label: "预改写", description: "保守自然化", relativePath: "prompts/fyadr-cn-prewrite.md" },
  { id: "classical", label: "经典改写", description: "解释性慢节奏", relativePath: "prompts/fyadr-cn-classical.md" },
  { id: "round1", label: "一轮", description: "主体改写", relativePath: "prompts/fyadr-cn-round1.md" },
  { id: "round2", label: "二轮", description: "最终降痕", relativePath: "prompts/fyadr-cn-round2.md" },
];

type RequestJsonInit = RequestInit & {
  timeoutMs?: number;
};
const MODEL_CONFIG_BACKUP_KEY = "fyadr.modelConfig.backup";

const defaultModelConfig: ModelConfig = {
  baseUrl: "",
  apiKey: "",
  model: "",
  apiType: "chat_completions",
  temperature: 0.7,
  offlineMode: false,
  promptProfile: "cn_prewrite",
  promptSequence: ["prewrite", "round1", "round2"],
  rewriteCandidateMode: "economy",
  requestTimeoutSeconds: 600,
  maxRetries: 3,
};


function readModelConfigBackup(): Partial<ModelConfig> {
  try {
    const raw = globalThis.localStorage?.getItem(MODEL_CONFIG_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as Partial<ModelConfig>) : {};
  } catch {
    return {};
  }
}

function writeModelConfigBackup(config: ModelConfig): void {
  try {
    globalThis.localStorage?.setItem(MODEL_CONFIG_BACKUP_KEY, JSON.stringify(config));
  } catch {
    // Ignore local backup failures; backend config remains authoritative.
  }
}

function mergeModelConfig(...configs: Array<Partial<ModelConfig> | undefined>): ModelConfig {
  const merged = configs.reduce<Partial<ModelConfig>>((current, item) => ({ ...current, ...(item ?? {}) }), { ...defaultModelConfig });
  const roundModels = configs.reduce<Record<string, NonNullable<ModelConfig["roundModels"]>[string]>>((current, item) => ({
    ...current,
    ...((item?.roundModels ?? {}) as NonNullable<ModelConfig["roundModels"]>),
  }), {});
  const promptSequence = Array.isArray(merged.promptSequence) && merged.promptSequence.length
    ? merged.promptSequence
    : defaultModelConfig.promptSequence;
  return { ...defaultModelConfig, ...merged, promptSequence, roundModels };
}

function getUtf8Size(value: string): number {
  try {
    return new TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
}

async function loadPromptPreviewsViaReadOutput(): Promise<PromptPreviewResponse> {
  const items = await Promise.all(
    PROMPT_PREVIEW_FALLBACKS.map(async (meta): Promise<PromptPreviewItem> => {
      const output = await requestJson<OutputPreview>(
        `/api/read-output?outputPath=${encodeURIComponent(meta.relativePath)}&maxChars=100000`,
        { timeoutMs: 8_000 },
      );
      const content = output.text ?? "";
      const fileName = meta.relativePath.split("/").pop() ?? meta.relativePath;
      return {
        ...meta,
        fileName,
        sizeBytes: getUtf8Size(content),
        updatedAt: "",
        content,
      };
    }),
  );
  return { ok: true, promptDir: "prompts", items };
}

type RunStream = {
  eventSource: EventSource;
  progressListeners: Set<(payload: RoundProgress) => void>;
  resultPromise: Promise<RoundResult>;
  resolveResult: (value: RoundResult) => void;
  rejectResult: (error: Error) => void;
  settled: boolean;
  sseDisconnected: boolean;
  statusPollTimer?: number;
  statusFailureCount: number;
};

const runStreams = new Map<string, RunStream>();

async function fetchWithFriendlyError(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${WEB_API_BASE}${input}`, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      const reason = String((init?.signal as AbortSignal & { reason?: unknown } | undefined)?.reason ?? "");
      if (reason === "fyadr-user-cancel") {
        throw new Error("操作已停止。");
      }
      throw new Error("请求超时：本次操作已自动停止，请换用响应更快的模型或稍后重试。");
    }
    throw new Error("无法连接到本地 Web 服务，请确认后端已启动并监听 http://127.0.0.1:8765。");
  }
}

async function requestJson<T>(input: string, init?: RequestJsonInit): Promise<T> {
  const { timeoutMs, signal, ...requestInit } = init ?? {};
  const controller = timeoutMs || signal ? new AbortController() : null;
  const abortFromExternalSignal = () => controller?.abort((signal as AbortSignal & { reason?: unknown }).reason ?? "fyadr-user-cancel");
  if (signal?.aborted) {
    abortFromExternalSignal();
  } else if (signal && controller) {
    signal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutId = timeoutMs && controller ? globalThis.setTimeout(() => controller.abort("fyadr-timeout"), timeoutMs) : null;
  try {
    const response = await fetchWithFriendlyError(input, {
      ...requestInit,
      signal: controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestInit.headers ?? {}),
      },
    });
    const responseText = await response.text();
    if (!response.ok) {
      const errorPayload = (() => {
        try {
          return JSON.parse(responseText) as Record<string, unknown> & { message?: string };
        } catch {
          return null;
        }
      })();
      const requestError = new Error(errorPayload?.message || responseText || `Request failed: ${response.status}`) as Error & {
        payload?: Record<string, unknown> | null;
        status?: number;
      };
      requestError.payload = errorPayload;
      requestError.status = response.status;
      throw requestError;
    }
    return JSON.parse(responseText) as T;
  } finally {
    if (timeoutId) {
      globalThis.clearTimeout(timeoutId);
    }
    if (signal && controller) {
      signal.removeEventListener("abort", abortFromExternalSignal);
    }
  }
}

function readFileWithFallback(file: File): Promise<string> {
  if (file.name.toLowerCase().endsWith(".txt")) {
    return file.text();
  }
  throw new Error("Unsupported text read for current file type.");
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file."));
        return;
      }
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function pickSingleFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.top = "0";
    input.tabIndex = -1;

    let settled = false;
    let opened = false;
    let sawDialogBlur = false;
    let userReturnArmed = false;
    let cancelCheckTimer: number | undefined;
    let watchdogTimer: number | undefined;
    let focusPollTimer: number | undefined;
    let armUserReturnTimer: number | undefined;

    const cleanup = () => {
      if (cancelCheckTimer !== undefined) {
        window.clearTimeout(cancelCheckTimer);
      }
      if (watchdogTimer !== undefined) {
        window.clearTimeout(watchdogTimer);
      }
      if (focusPollTimer !== undefined) {
        window.clearInterval(focusPollTimer);
      }
      if (armUserReturnTimer !== undefined) {
        window.clearTimeout(armUserReturnTimer);
      }
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("pointerdown", handleUserReturnedToPage, true);
      document.removeEventListener("keydown", handleUserReturnedToPage, true);
      input.remove();
    };

    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(file);
    };

    const scheduleCancelCheck = () => {
      if (!opened || settled) return;
      if (cancelCheckTimer !== undefined) {
        window.clearTimeout(cancelCheckTimer);
      }
      cancelCheckTimer = window.setTimeout(() => {
        if (!input.files?.length && (sawDialogBlur || document.hasFocus())) {
          finish(null);
        }
      }, 350);
    };

    function handleBlur() {
      sawDialogBlur = true;
    }

    function handleFocus() {
      scheduleCancelCheck();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        scheduleCancelCheck();
      }
    }

    function handleUserReturnedToPage() {
      if (!userReturnArmed || settled || input.files?.length || !document.hasFocus()) {
        return;
      }
      window.setTimeout(() => {
        if (!settled && !input.files?.length && document.hasFocus()) {
          finish(null);
        }
      }, 0);
    }

    input.addEventListener("change", () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener("cancel", () => finish(null), { once: true });
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("pointerdown", handleUserReturnedToPage, true);
    document.addEventListener("keydown", handleUserReturnedToPage, true);
    focusPollTimer = window.setInterval(() => {
      if (sawDialogBlur && document.visibilityState === "visible" && document.hasFocus()) {
        scheduleCancelCheck();
      }
    }, 500);
    watchdogTimer = window.setTimeout(() => finish(null), 5 * 60 * 1000);

    document.body.appendChild(input);
    opened = true;
    armUserReturnTimer = window.setTimeout(() => {
      userReturnArmed = true;
    }, 0);
    input.click();
  });
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function decodeHeaderValue(value: string | null): string {
  if (!value) {
    return "";
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeHeaderJson(value: string | null): unknown {
  const decoded = decodeHeaderValue(value);
  if (!decoded) {
    return null;
  }
  try {
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function parseExportIssueSamples(value: string | null): ExportIssueSample[] {
  const decoded = decodeHeaderJson(value);
  if (!Array.isArray(decoded)) {
    return [];
  }
  return decoded
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      code: typeof item.code === "string" ? item.code : undefined,
      severity: typeof item.severity === "string" ? item.severity : undefined,
      message: typeof item.message === "string" ? item.message : "检查项",
      location: typeof item.location === "string" ? item.location : undefined,
      sample: typeof item.sample === "string" ? item.sample : undefined,
    }))
    .slice(0, 5);
}


async function exportResponseToResult(response: Response, targetFormat: "txt" | "docx"): Promise<ExportResult> {
  if (!response.ok) {
    const responseText = await response.text();
    const errorPayload = (() => {
      try {
        return JSON.parse(responseText) as { message?: string };
      } catch {
        return null;
      }
    })();
    throw new Error(errorPayload?.message || responseText || `Export failed: ${response.status}`);
  }
  const blob = await response.blob();
  const filename = extractDownloadFilename(
    response.headers.get("Content-Disposition"),
    `current-round.${targetFormat}`,
  );
  const layoutMode = response.headers.get("X-Export-Layout-Mode") || "";
  const paragraphSource = response.headers.get("X-Export-Paragraph-Source") || "";
  const formatMode = response.headers.get("X-Export-Format-Mode") || "";
  const formatScope = response.headers.get("X-Export-Format-Scope") || "";
  const contentLockedStyleCount = Number(response.headers.get("X-Export-Content-Locked-Style-Count") || "0") || 0;
  const tableStyleCount = Number(response.headers.get("X-Export-Table-Style-Count") || "0") || 0;
  const tableBorderCount = Number(response.headers.get("X-Export-Table-Border-Count") || "0") || 0;
  const validationPath = decodeHeaderValue(response.headers.get("X-Export-Validation-Path"));
  const auditPath = decodeHeaderValue(response.headers.get("X-Export-Audit-Path"));
  const auditIssueCountHeader = response.headers.get("X-Export-Audit-Issue-Count") || "0";
  const auditIssueCount = Number(auditIssueCountHeader) || 0;
  const preflightPath = decodeHeaderValue(response.headers.get("X-Export-Preflight-Path"));
  const preflightIssueCountHeader = response.headers.get("X-Export-Preflight-Issue-Count") || "0";
  const preflightIssueCount = Number(preflightIssueCountHeader) || 0;
  const guardPath = decodeHeaderValue(response.headers.get("X-Export-Guard-Path"));
  const guardIssueCountHeader = response.headers.get("X-Export-Guard-Issue-Count") || "0";
  const guardIssueCount = Number(guardIssueCountHeader) || 0;
  const guardIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Guard-Issue-Samples"));
  const auditIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Audit-Issue-Samples"));
  const preflightIssueSamples = parseExportIssueSamples(response.headers.get("X-Export-Preflight-Issue-Samples"));
  downloadBlob(blob, filename);
  return {
    format: targetFormat,
    path: filename,
    layoutMode,
    paragraphSource,
    formatMode,
    formatScope,
    contentLockedStyleCount,
    tableStyleCount,
    tableBorderCount,
    validationPath,
    auditPath,
    auditIssueCount,
    preflightPath,
    preflightIssueCount,
    guardPath,
    guardIssueCount,
    guardIssueSamples,
    auditIssueSamples,
    preflightIssueSamples,
  };
}

function extractDownloadFilename(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeHeaderValue(utf8Match[1]);
  }

  const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  if (plainMatch?.[1]) {
    return decodeHeaderValue(plainMatch[1]);
  }

  return fallback;
}

function cleanupRunStream(runToken: string): void {
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

function settleRunStreamWithResult(runToken: string, stream: RunStream, result: RoundResult): void {
  if (stream.settled) {
    return;
  }
  stream.settled = true;
  stream.resolveResult(result);
  cleanupRunStream(runToken);
}

function settleRunStreamWithError(runToken: string, stream: RunStream, error: Error): void {
  if (stream.settled) {
    return;
  }
  stream.settled = true;
  stream.rejectResult(error);
  cleanupRunStream(runToken);
}

function startRunStatusPolling(runToken: string, stream: RunStream): void {
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
      settleRunStreamWithError(runToken, stream, new Error(`Run ended without a result. Status: ${status.status}`));
    } catch (error) {
      stream.statusFailureCount += 1;
      if (stream.statusFailureCount >= 12 && (stream.sseDisconnected || stream.eventSource.readyState === EventSource.CLOSED)) {
        settleRunStreamWithError(
          runToken,
          stream,
          error instanceof Error ? error : new Error("Progress channel disconnected and status polling failed."),
        );
      }
    }
  }, 5_000);
}

function ensureRunStream(runToken: string): RunStream {
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

  const eventSource = new EventSource(`${WEB_API_BASE}/api/run-round-events/${runToken}`);
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
    const payload = JSON.parse(message.data) as RoundProgress;
    stream.progressListeners.forEach((listener) => listener(payload));
  });

  eventSource.addEventListener("result", (event) => {
    const message = event as MessageEvent;
    settleRunStreamWithResult(runToken, stream, JSON.parse(message.data) as RoundResult);
  });

  eventSource.addEventListener("run-error", (event) => {
    const message = event as MessageEvent;
    const payload = JSON.parse(message.data) as { message?: string };
    settleRunStreamWithError(runToken, stream, new Error(payload.message || "Run round failed."));
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

export const webService: AppService = {
  async getHealth(): Promise<EnvironmentDiagnostics> {
    return requestJson<EnvironmentDiagnostics>("/api/health");
  },

  async getPromptPreviews(): Promise<PromptPreviewResponse> {
    try {
      return await requestJson<PromptPreviewResponse>("/api/prompts", { timeoutMs: 8_000 });
    } catch {
      return loadPromptPreviewsViaReadOutput();
    }
  },

  async cleanupTaskStateSnapshots(mode = "expired", maxAgeHours = 168): Promise<TaskStateCleanupResult> {
    return requestJson<TaskStateCleanupResult>("/api/task-state-snapshots/cleanup", {
      method: "POST",
      body: JSON.stringify({ mode, maxAgeHours }),
    });
  },

  async loadModelConfig(): Promise<ModelConfig> {
    const backup = readModelConfigBackup();
    const config = await requestJson<Partial<ModelConfig>>("/api/model-config");
    const merged = mergeModelConfig(backup, config);
    writeModelConfigBackup(merged);
    return merged;
  },

  async saveModelConfig(config: ModelConfig): Promise<ModelConfig> {
    const payload = mergeModelConfig(readModelConfigBackup(), config);
    writeModelConfigBackup(payload);
    const saved = await requestJson<Partial<ModelConfig>>("/api/model-config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const merged = mergeModelConfig(payload, saved);
    writeModelConfigBackup(merged);
    return merged;
  },

  async listModels(config: ModelConfig, signal?: AbortSignal): Promise<ModelCatalogResult> {
    return requestJson<ModelCatalogResult>("/api/list-models", {
      method: "POST",
      body: JSON.stringify(config),
      signal,
    });
  },

  async testModelConnection(config: ModelConfig): Promise<TestConnectionResult> {
    return requestJson<TestConnectionResult>("/api/test-connection", {
      method: "POST",
      body: JSON.stringify(config),
    });
  },

  async pickInputFile(): Promise<PickedDocument | null> {
    const file = await pickSingleFile(".txt,.docx");
    if (!file) {
      return null;
    }
    const lowerName = file.name.toLowerCase();
    const requestBody = lowerName.endsWith(".docx")
      ? {
          filename: file.name,
          encoding: "base64",
          contentBase64: await readFileAsBase64(file),
        }
      : {
          filename: file.name,
          encoding: "text",
          content: await readFileWithFallback(file),
        };
    return requestJson<PickedDocument>("/api/upload-document", {
      method: "POST",
      body: JSON.stringify(requestBody),
    });
  },

  async getDocumentStatus(sourcePath: string, modelConfig: ModelConfig): Promise<DocumentStatus> {
    const promptSequenceQuery = modelConfig.promptSequence?.length
      ? `&promptSequence=${encodeURIComponent(modelConfig.promptSequence.join(","))}`
      : "";
    return requestJson<DocumentStatus>(
      `/api/document-status?sourcePath=${encodeURIComponent(sourcePath)}&promptProfile=${encodeURIComponent(modelConfig.promptProfile)}${promptSequenceQuery}`,
    );
  },

  async pickDetectionReport(providerHint?: DetectionReportProvider): Promise<DetectionReport | null> {
    const file = await pickSingleFile(".pdf,application/pdf");
    if (!file) {
      return null;
    }
    return requestJson<DetectionReport>("/api/detection-report", {
      method: "POST",
      body: JSON.stringify({
        filename: file.name,
        contentBase64: await readFileAsBase64(file),
        providerHint,
      }),
    });
  },

  async getDocumentHistory(sourcePath: string): Promise<DocumentHistory> {
    return requestJson<DocumentHistory>(`/api/document-history?sourcePath=${encodeURIComponent(sourcePath)}`);
  },

  async getDocumentProtectionMap(sourcePath: string): Promise<DocumentProtectionMap> {
    return requestJson<DocumentProtectionMap>(`/api/document-protection-map?sourcePath=${encodeURIComponent(sourcePath)}`);
  },

  async listDocumentHistories(): Promise<HistoryListResponse> {
    return requestJson<HistoryListResponse>("/api/history-documents");
  },

  async deleteDocumentHistory(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<DeleteHistoryResult> {
    return requestJson<DeleteHistoryResult>("/api/document-history", {
      method: "DELETE",
      body: JSON.stringify({
        docId,
        fromRound: options?.fromRound ?? null,
        promptProfile: options?.promptProfile ?? null,
        promptSequence: options?.promptSequence ?? null,
        mode: options?.mode ?? "records_and_artifacts",
      }),
    });
  },

  async previewDocumentHistoryDelete(
    docId: string,
    options?: DeleteHistoryOptions,
  ): Promise<HistoryDeleteImpact> {
    return requestJson<HistoryDeleteImpact>("/api/document-history/impact", {
      method: "POST",
      body: JSON.stringify({
        docId,
        fromRound: options?.fromRound ?? null,
        promptProfile: options?.promptProfile ?? null,
        promptSequence: options?.promptSequence ?? null,
        mode: options?.mode ?? "records_and_artifacts",
      }),
    });
  },

  async scanHistoryOrphans(protectedPaths: string[] = []): Promise<HistoryOrphanScanResult> {
    return requestJson<HistoryOrphanScanResult>("/api/history-orphans", {
      method: "POST",
      body: JSON.stringify({ protectedPaths }),
    });
  },

  async deleteHistoryOrphans(protectedPaths: string[] = []): Promise<HistoryOrphanDeleteResult> {
    return requestJson<HistoryOrphanDeleteResult>("/api/history-orphans", {
      method: "DELETE",
      body: JSON.stringify({ protectedPaths }),
    });
  },

  async startRunRound(sourcePath: string, modelConfig: ModelConfig): Promise<string | null> {
    const { runId } = await requestJson<{ runId: string; alreadyActive?: boolean }>("/api/run-round", {
      method: "POST",
      body: JSON.stringify({ sourcePath, modelConfig }),
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
      throw new Error("runToken is required in web mode.");
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

  async readOutput(outputPath: string, maxChars?: number): Promise<OutputPreview> {
    const query = new URLSearchParams({ outputPath });
    if (typeof maxChars === "number" && maxChars > 0) {
      query.set("maxChars", String(maxChars));
    }
    return requestJson<OutputPreview>(`/api/read-output?${query.toString()}`);
  },

  async readCompare(outputPath: string): Promise<RoundCompareData> {
    return requestJson<RoundCompareData>(`/api/read-compare?outputPath=${encodeURIComponent(outputPath)}`);
  },

  async loadReviewDecisions(outputPath: string) {
    return requestJson(`/api/review-decisions?outputPath=${encodeURIComponent(outputPath)}`);
  },

  async saveReviewDecisions(outputPath: string, decisions) {
    return requestJson("/api/review-decisions", {
      method: "POST",
      body: JSON.stringify({ outputPath, decisions }),
    });
  },

  async rerunChunk(outputPath: string, chunkId: string, modelConfig: ModelConfig, userFeedback?: string) {
    return requestJson("/api/rerun-chunk", {
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

  async exportRound(outputPath: string, targetFormat: "txt" | "docx"): Promise<ExportResult> {
    const response = await fetchWithFriendlyError(
      `/api/export-round?outputPath=${encodeURIComponent(outputPath)}&targetFormat=${targetFormat}`,
    );
    return exportResponseToResult(response, targetFormat);
  },

  async loadFormatRules(): Promise<FormatRules> {
    return requestJson<FormatRules>("/api/format-rules");
  },

  async parseFormatRules(text: string, modelConfig: ModelConfig, signal?: AbortSignal): Promise<FormatRulesResult> {
    const configuredTimeoutMs = Math.max(15_000, Number(modelConfig.requestTimeoutSeconds || 0) * 1000);
    const parserTimeoutMs = Math.max(FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_MS, configuredTimeoutMs);
    return requestJson<FormatRulesResult>("/api/format-rules/parse", {
      method: "POST",
      body: JSON.stringify({ text, modelConfig }),
      signal,
      timeoutMs: Math.min(FORMAT_RULE_PARSE_MAX_TIMEOUT_MS, parserTimeoutMs + 15_000),
    });
  },

  async activateFormatRules(rules: FormatRules): Promise<FormatRulesResult> {
    return requestJson<FormatRulesResult>("/api/format-rules/activate", {
      method: "POST",
      body: JSON.stringify({ rules }),
    });
  },

  async resetFormatRules(): Promise<FormatRulesResult> {
    return requestJson<FormatRulesResult>("/api/format-rules/reset", {
      method: "POST",
    });
  },
};
