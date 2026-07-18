import { getRoundModelKey } from "@/lib/promptRegistry";
import type { ModelConfig, PromptWorkflow } from "@/types/app";

export function withDefaultModelRoutes(
  config: ModelConfig,
  promptProfile: ModelConfig["promptProfile"],
  activeFlowSequenceLength: number,
  promptWorkflows?: PromptWorkflow[],
): ModelConfig {
  const nextRoundModels = { ...(config.roundModels ?? {}) };
  for (let index = 0; index < activeFlowSequenceLength; index += 1) {
    const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
    if (!roundKey) {
      continue;
    }
    nextRoundModels[roundKey] = {
      ...(nextRoundModels[roundKey] ?? {
        providerName: "默认连接",
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        apiType: config.apiType,
        streaming: config.streaming,
        temperature: config.temperature,
        requestTimeoutSeconds: config.requestTimeoutSeconds,
        maxRetries: config.maxRetries,
      }),
      enabled: false,
    };
  }
  return { ...config, roundModels: nextRoundModels };
}

export function getRoundRouteIssues(
  modelConfig: ModelConfig,
  selectedProviderId: string,
  provider: { baseUrl?: string; apiKey?: string } | null | undefined,
  selectedModelValue: string,
): string[] {
  if (selectedProviderId === "__default") {
    return [
      !modelConfig.baseUrl?.trim() ? "默认 API 地址未填" : "",
      !modelConfig.apiKey?.trim() ? "默认 API Key 未填" : "",
      !modelConfig.model?.trim() ? "默认模型未填" : "",
    ].filter(Boolean);
  }
  return [
    !provider?.baseUrl?.trim() ? "服务商 API 地址未填" : "",
    !provider?.apiKey?.trim() ? "服务商 API Key 未填" : "",
    !String(selectedModelValue ?? "").trim() ? "本轮模型未选" : "",
  ].filter(Boolean);
}
