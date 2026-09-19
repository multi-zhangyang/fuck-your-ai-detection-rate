import type {
  CoreDocument,
  CoreRun,
  CoreSettings,
  ChunkPreset,
  ModelProfile,
  PromptPlan,
  PromptTemplate,
  RecentDocument,
  ReviewChoice,
  RunConfigurationInput,
  RunEvent,
  WarningSummary,
} from "@/types/core";

export class ApiError extends Error {
  status: number;
  code?: string;
  warningSummary?: WarningSummary;
  exportConfirmation?: WarningSummary;
  formatAudit?: unknown;

  constructor(message: string, status: number, payload?: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = typeof payload?.code === "string" ? payload.code : undefined;
    this.warningSummary = payload?.warningSummary as WarningSummary | undefined;
    this.exportConfirmation = payload?.exportConfirmation as WarningSummary | undefined;
    this.formatAudit = payload?.formatAudit;
  }
}

async function readError(response: Response): Promise<ApiError> {
  let payload: Record<string, unknown> = {};
  try {
    payload = (await response.json()) as Record<string, unknown>;
  } catch {
    // The HTTP status below remains useful when a proxy returns HTML.
  }
  const message = typeof payload.message === "string" ? payload.message : `请求失败（${response.status}）`;
  return new ApiError(message, response.status, payload);
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(path, { ...init, headers });
  if (!response.ok) throw await readError(response);
  return (await response.json()) as T;
}

function json(method: string, body?: unknown): RequestInit {
  return { method, body: body === undefined ? undefined : JSON.stringify(body) };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition") || "";
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeURIComponent(utf8[1]);
  const plain = disposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1] || fallback;
}

export const coreService = {
  getSettings: () => requestJson<CoreSettings>("/api/settings"),

  savePreferences: (value: {
    rewriteConcurrency: number;
    protectedTerms: string[];
    chunkPreset?: ChunkPreset;
    singleTemplateRounds?: number;
  }) =>
    requestJson<CoreSettings["preferences"]>("/api/settings/preferences", json("PUT", value)),

  createModelProfile: (value: Partial<ModelProfile> & { makeDefault?: boolean }) =>
    requestJson<ModelProfile>("/api/model-profiles", json("POST", value)),

  updateModelProfile: (id: string, value: Partial<ModelProfile> & { makeDefault?: boolean }) =>
    requestJson<ModelProfile>(`/api/model-profiles/${encodeURIComponent(id)}`, json("PUT", value)),

  deleteModelProfile: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/model-profiles/${encodeURIComponent(id)}`, json("DELETE")),

  listModels: (value: Partial<ModelProfile>) =>
    requestJson<{ models: string[] }>("/api/model-profiles/models", json("POST", value)),

  testModelProfile: (value: Partial<ModelProfile>) =>
    requestJson<{ ok: boolean; reply: string }>("/api/model-profiles/test", json("POST", value)),

  createTemplate: (value: Partial<PromptTemplate>) =>
    requestJson<PromptTemplate>("/api/prompt-templates", json("POST", value)),

  updateTemplate: (id: string, value: Partial<PromptTemplate>) =>
    requestJson<PromptTemplate>(`/api/prompt-templates/${encodeURIComponent(id)}`, json("PUT", value)),

  copyTemplate: (id: string) =>
    requestJson<PromptTemplate>(`/api/prompt-templates/${encodeURIComponent(id)}/copy`, json("POST")),

  deleteTemplate: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/prompt-templates/${encodeURIComponent(id)}`, json("DELETE")),

  createPlan: (value: Partial<PromptPlan> & { makeDefault?: boolean }) =>
    requestJson<PromptPlan>("/api/prompt-plans", json("POST", value)),

  updatePlan: (id: string, value: Partial<PromptPlan> & { makeDefault?: boolean }) =>
    requestJson<PromptPlan>(`/api/prompt-plans/${encodeURIComponent(id)}`, json("PUT", value)),

  copyPlan: (id: string) =>
    requestJson<PromptPlan>(`/api/prompt-plans/${encodeURIComponent(id)}/copy`, json("POST")),

  deletePlan: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/prompt-plans/${encodeURIComponent(id)}`, json("DELETE")),

  uploadDocument: async (file: File): Promise<CoreDocument> => {
    const body = new FormData();
    body.append("file", file);
    return requestJson<CoreDocument>("/api/documents", { method: "POST", body });
  },

  getDocument: (id: string) => requestJson<CoreDocument>(`/api/documents/${encodeURIComponent(id)}`),

  saveScope: (id: string, selectedParagraphIds: string[]) =>
    requestJson<CoreDocument>(`/api/documents/${encodeURIComponent(id)}/scope`, json("PUT", { selectedParagraphIds })),

  deleteDocument: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/documents/${encodeURIComponent(id)}`, json("DELETE")),

  getRecentDocuments: () => requestJson<{ items: RecentDocument[] }>("/api/recent-documents"),

  createRun: (value: RunConfigurationInput & { documentId: string }) =>
    requestJson<CoreRun>("/api/runs", json("POST", value)),

  getRun: (id: string) => requestJson<CoreRun>(`/api/runs/${encodeURIComponent(id)}`),

  cancelRun: (id: string) => requestJson<CoreRun>(`/api/runs/${encodeURIComponent(id)}/cancel`, json("POST")),

  resumeRun: (id: string, concurrency: number) =>
    requestJson<CoreRun>(`/api/runs/${encodeURIComponent(id)}/resume`, json("POST", { concurrency })),

  continueRun: (id: string, value: RunConfigurationInput) =>
    requestJson<CoreRun>(`/api/runs/${encodeURIComponent(id)}/continue`, json("POST", value)),

  retryParagraph: (runId: string, paragraphId: string) =>
    requestJson<CoreRun>(
      `/api/runs/${encodeURIComponent(runId)}/paragraphs/${encodeURIComponent(paragraphId)}/retry`,
      json("POST"),
    ),

  saveReview: (runId: string, paragraphId: string, decision: ReviewChoice, text = "") =>
    requestJson<CoreRun>(
      `/api/runs/${encodeURIComponent(runId)}/review/${encodeURIComponent(paragraphId)}`,
      json("PUT", { decision, text }),
    ),

  streamRun: (
    runId: string,
    onEvent: (event: RunEvent) => void,
    callbacks: { onOpen?: () => void; onError?: () => void } = {},
  ): (() => void) => {
    const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    const names = ["run-status", "chunk-status", "chunk-stream", "chunk-complete", "chunk-paused", "paragraph-warnings"];
    const listener = (raw: Event) => {
      const message = raw as MessageEvent<string>;
      try {
        onEvent(JSON.parse(message.data) as RunEvent);
      } catch {
        // A malformed individual event should not tear down the live task view.
      }
    };
    names.forEach((name) => source.addEventListener(name, listener));
    source.onopen = () => callbacks.onOpen?.();
    source.onerror = () => callbacks.onError?.();
    return () => source.close();
  },

  exportRun: async (
    runId: string,
    format: "docx" | "txt",
    options: {
      acknowledgeWarnings?: boolean;
      forceFormatRisk?: boolean;
      useOriginalForIncomplete?: boolean;
    } = {},
  ): Promise<void> => {
    const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/export`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ format, ...options }),
    });
    if (!response.ok) throw await readError(response);
    const blob = await response.blob();
    downloadBlob(blob, responseFilename(response, `FYADR-${runId}.${format}`));
  },
};
