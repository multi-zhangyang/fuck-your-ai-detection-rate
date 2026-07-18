import type { FormatRules, ModelConfig, ModelProviderConfig } from "@/types/app";

export const NUMBER_FIELDS = new Set<keyof ModelConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rewriteConcurrency"]);
export const PROVIDER_NUMBER_FIELDS = new Set<keyof ModelProviderConfig>(["temperature", "requestTimeoutSeconds", "maxRetries", "rateLimitWindowMinutes", "rateLimitMaxRequests"]);

export const API_OPTIONS: Array<{ value: ModelConfig["apiType"]; label: string }> = [
  { value: "chat_completions", label: "chat/completions" },
  { value: "responses", label: "responses" },
];

export function createModelProvider(value: ModelConfig): ModelProviderConfig {
  const timestamp = Date.now().toString(36);
  return {
    id: `provider-${timestamp}`,
    name: `服务商 ${((value.modelProviders?.length ?? 0) + 1)}`,
    enabled: true,
    baseUrl: value.baseUrl,
    apiKey: value.apiKey,
    apiType: value.apiType,
    streaming: value.streaming,
    temperature: value.temperature,
    requestTimeoutSeconds: value.requestTimeoutSeconds,
    maxRetries: value.maxRetries,
    rateLimitWindowMinutes: 0,
    rateLimitMaxRequests: 0,
    models: value.model ? [value.model] : [],
    defaultModel: value.model,
    updatedAt: new Date().toISOString(),
  };
}

export function providerToModelConfig(value: ModelConfig, provider: ModelProviderConfig, model?: string): ModelConfig {
  return {
    ...value,
    baseUrl: provider.baseUrl.trim() || value.baseUrl,
    apiKey: provider.apiKey.trim() || value.apiKey,
    model: (model ?? provider.defaultModel ?? "").trim() || value.model,
    apiType: provider.apiType || value.apiType,
    streaming: provider.streaming ?? value.streaming,
    temperature: typeof provider.temperature === "number" ? provider.temperature : value.temperature,
    requestTimeoutSeconds: typeof provider.requestTimeoutSeconds === "number" ? provider.requestTimeoutSeconds : value.requestTimeoutSeconds,
    maxRetries: typeof provider.maxRetries === "number" ? provider.maxRetries : value.maxRetries,
  };
}

export const zh = (...codes: number[]) => String.fromCharCode(...codes);

export const ROLE_GROUPS: Array<{ title: string; roles: string[] }> = [
  { title: zh(0x9875, 0x9762, 0x4e0e, 0x76ee, 0x5f55), roles: ["toc_heading"] },
  { title: zh(0x6458, 0x8981, 0x4e0e, 0x5173, 0x952e, 0x8bcd), roles: ["cn_abstract_lead", "cn_abstract_body", "cn_keywords", "en_abstract_lead", "en_abstract_body", "en_keywords"] },
  { title: zh(0x6b63, 0x6587, 0x4e0e, 0x6807, 0x9898), roles: ["body_text", "heading_1", "heading_2", "heading_3", "heading_4"] },
  { title: zh(0x56fe, 0x8868, 0x4e0e, 0x6ce8, 0x91ca), roles: ["caption", "note", "table_text"] },
  { title: zh(0x6587, 0x732e, 0x4e0e, 0x81f4, 0x8c22), roles: ["references_heading", "references_body", "ack_heading", "ack_body"] },
];

export const ROLE_LABELS: Record<string, string> = {
  toc_heading: zh(0x76ee, 0x5f55, 0x6807, 0x9898),
  cn_abstract_lead: zh(0x4e2d, 0x6587, 0x6458, 0x8981, 0x6807, 0x9898),
  cn_abstract_body: zh(0x4e2d, 0x6587, 0x6458, 0x8981, 0x6b63, 0x6587),
  cn_keywords: zh(0x4e2d, 0x6587, 0x5173, 0x952e, 0x8bcd),
  en_abstract_lead: "Abstract",
  en_abstract_body: "Abstract body",
  en_keywords: "Key words",
  body_text: zh(0x8bba, 0x6587, 0x6b63, 0x6587),
  heading_1: zh(0x4e00, 0x7ea7, 0x6807, 0x9898),
  heading_2: zh(0x4e8c, 0x7ea7, 0x6807, 0x9898),
  heading_3: zh(0x4e09, 0x7ea7, 0x6807, 0x9898),
  heading_4: zh(0x56db, 0x7ea7, 0x6807, 0x9898),
  caption: zh(0x56fe, 0x8868, 0x9898, 0x540d),
  note: zh(0x56fe, 0x8868, 0x6ce8),
  table_text: zh(0x8868, 0x683c, 0x5185, 0x5bb9),
  references_heading: zh(0x53c2, 0x8003, 0x6587, 0x732e, 0x6807, 0x9898),
  references_body: zh(0x53c2, 0x8003, 0x6587, 0x732e, 0x5185, 0x5bb9),
  ack_heading: zh(0x81f4, 0x8c22, 0x6807, 0x9898),
  ack_body: zh(0x81f4, 0x8c22, 0x5185, 0x5bb9),
};

export function styleSummary(style?: Record<string, unknown>): string {
  if (!style) return "-";
  return `${String(style.cnFont ?? "-")} / ${String(style.fontSizePt ?? "-")}pt`;
}

export function styleSpacing(style?: Record<string, unknown>): string {
  if (!style) return "-";
  if (style.lineSpacingPt) return `${zh(0x884c, 0x8ddd)} ${String(style.lineSpacingPt)}pt`;
  if (style.lineSpacingMultiple) return `${String(style.lineSpacingMultiple)}x`;
  return "-";
}

export function formatAlignment(value: unknown): string {
  if (value === "center") return zh(0x5c45, 0x4e2d);
  if (value === "left") return zh(0x5c45, 0x5de6);
  if (value === "right") return zh(0x5c45, 0x53f3);
  if (value === "justify") return zh(0x4e24, 0x7aef, 0x5bf9, 0x9f50);
  return String(value ?? "-");
}
