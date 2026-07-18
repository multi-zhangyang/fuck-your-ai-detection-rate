import type {
  ExportResult,
  ExportRoundOptions,
  FormatRules,
  FormatRulesResult,
  ModelConfig,
} from "@/types/app";
import { exportResponseToResult } from "@/lib/webServiceExport";
import { fetchWithFriendlyError, requestJson } from "@/lib/webServiceHttp";
const FORMAT_RULE_PARSE_DEFAULT_TIMEOUT_MS = 300_000;
const FORMAT_RULE_PARSE_MAX_TIMEOUT_MS = 1_815_000;


export const webServiceFormatApi = {
  async exportRound(
    outputPath: string,
    targetFormat: "txt" | "docx",
    options?: ExportRoundOptions,
  ): Promise<ExportResult> {
    const response = await fetchWithFriendlyError(
      "/api/export-round",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outputPath, targetFormat, ...options }),
      },
    );
    return exportResponseToResult(response, targetFormat, {
      outputPath,
      ...options,
    });
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
