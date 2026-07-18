import type { ModelConfig, ModelProviderConfig } from "@/types/app";

export type AppendRoundDraftLike = {
  promptId: string;
  providerId: string;
  model: string;
};

export function buildAppendRouteIssues(
  modelConfig: ModelConfig,
  appendDraft: AppendRoundDraftLike | null,
  appendProvider: ModelProviderConfig | null | undefined,
): string[] {
  if (!appendDraft) {
    return [];
  }
  if (appendDraft.providerId === "__default") {
    return [
      !modelConfig.baseUrl?.trim() ? "默认 API 地址未填" : "",
      !modelConfig.apiKey?.trim() ? "默认 API Key 未填" : "",
      !modelConfig.model?.trim() ? "默认模型未填" : "",
    ].filter(Boolean);
  }
  if (!appendProvider) {
    return ["服务商不可用"];
  }
  return [
    !appendProvider.baseUrl?.trim() ? "服务商 API 地址未填" : "",
    !appendProvider.apiKey?.trim() ? "服务商 API Key 未填" : "",
    !appendDraft.model.trim() ? "本轮模型未选" : "",
  ].filter(Boolean);
}
