import type {
  OutputPreview,
  PromptBackupsResult,
  PromptDeleteResult,
  PromptPreviewItem,
  PromptPreviewResponse,
  PromptSaveResult,
} from "@/types/app";
import { DEFAULT_PROMPT_OPTIONS, DEFAULT_PROMPT_WORKFLOWS } from "@/lib/promptRegistry";
import { isEndpointCompatibilityError } from "@/lib/webServiceCompat";
import { getUtf8Size } from "@/lib/webServiceFiles";
import { requestJson } from "@/lib/webServiceHttp";

async function loadPromptPreviewsViaReadOutput(): Promise<PromptPreviewResponse> {
  const items = await Promise.all(
    DEFAULT_PROMPT_OPTIONS.map(async (meta): Promise<PromptPreviewItem> => {
      const relativePath = meta.relativePath ?? `prompts/${meta.id}.md`;
      const output = await requestJson<OutputPreview>(
        `/api/read-output?outputPath=${encodeURIComponent(relativePath)}&maxChars=100000`,
        { timeoutMs: 8_000 },
      );
      const content = output.text ?? "";
      const fileName = relativePath.split("/").pop() ?? relativePath;
      return {
        ...meta,
        description: meta.description ?? "",
        relativePath,
        fileName,
        sizeBytes: getUtf8Size(content),
        updatedAt: "",
        content,
        defaultAvailable: meta.defaultAvailable,
      };
    }),
  );
  return { ok: true, promptDir: "prompts", items, workflows: DEFAULT_PROMPT_WORKFLOWS };
}

export const webServicePromptCoreApi = {
  async getPromptPreviews(): Promise<PromptPreviewResponse> {
    try {
      return await requestJson<PromptPreviewResponse>("/api/prompts", { timeoutMs: 8_000 });
    } catch (error) {
      if (!isEndpointCompatibilityError(error)) {
        throw error;
      }
      return loadPromptPreviewsViaReadOutput();
    }
  },

  async savePrompt(promptId: string, content: string): Promise<PromptSaveResult> {
    return requestJson<PromptSaveResult>(`/api/prompts/${encodeURIComponent(promptId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
      timeoutMs: 15_000,
    });
  },

  async updatePromptMeta(promptId: string, payload: { label: string; description?: string }): Promise<PromptSaveResult> {
    return requestJson<PromptSaveResult>(`/api/prompts/${encodeURIComponent(promptId)}/meta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    });
  },

  async restoreDefaultPrompt(promptId: string): Promise<PromptSaveResult> {
    return requestJson<PromptSaveResult>(`/api/prompts/${encodeURIComponent(promptId)}/restore-default`, {
      method: "POST",
      timeoutMs: 15_000,
    });
  },

  async listPromptBackups(promptId: string): Promise<PromptBackupsResult> {
    return requestJson<PromptBackupsResult>(`/api/prompts/${encodeURIComponent(promptId)}/backups`, {
      timeoutMs: 15_000,
    });
  },

  async restorePromptBackup(promptId: string, relativePath: string): Promise<PromptSaveResult> {
    return requestJson<PromptSaveResult>(`/api/prompts/${encodeURIComponent(promptId)}/restore-backup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relativePath }),
      timeoutMs: 15_000,
    });
  },

  async createPrompt(payload: { label: string; description?: string; content: string }): Promise<PromptSaveResult> {
    return requestJson<PromptSaveResult>("/api/prompts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      timeoutMs: 15_000,
    });
  },

  async deletePrompt(promptId: string): Promise<PromptDeleteResult> {
    return requestJson<PromptDeleteResult>(`/api/prompts/${encodeURIComponent(promptId)}`, {
      method: "DELETE",
      timeoutMs: 15_000,
    });
  },
};
