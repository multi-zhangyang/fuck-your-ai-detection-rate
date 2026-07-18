import {
  buildProviderModelsPatch,
  formatProviderModelsRefreshFailure,
} from "@/lib/providerModelCatalogHelpers";
import type { ModelProviderConfig } from "@/types/app";

export function createEmptyProviderModelRefreshState(): {
  providerPatches: Map<string, Partial<ModelProviderConfig>>;
  failures: string[];
} {
  return {
    providerPatches: new Map<string, Partial<ModelProviderConfig>>(),
    failures: [],
  };
}

export function recordProviderModelsConnectionFailure(
  failures: string[],
  connectionIssue: string,
): string[] {
  return [...failures, connectionIssue];
}

export function recordProviderModelsRefreshSuccess(
  providerPatches: Map<string, Partial<ModelProviderConfig>>,
  provider: ModelProviderConfig,
  modelIds: string[],
): Map<string, Partial<ModelProviderConfig>> {
  const next = new Map(providerPatches);
  next.set(provider.id, buildProviderModelsPatch(provider, modelIds));
  return next;
}

export function recordProviderModelsRefreshError(
  failures: string[],
  provider: ModelProviderConfig,
  errorText: string,
): string[] {
  return [...failures, formatProviderModelsRefreshFailure(provider, errorText)];
}

export function buildProviderModelsSingleLoadingRuntimeStep(providerName?: string): string {
  return `正在读取 ${providerName || "服务商"} 的模型列表。`;
}

export function buildProviderModelsSingleSuccessRuntimeStep(): string {
  return "服务商模型列表已更新";
}

export function buildProviderModelsSingleAbortFeedback(): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: "已停止读取服务商模型列表。",
    runtimeStep: "服务商模型列表读取已停止",
  };
}

export function buildProviderModelsSingleFailureRuntimeStep(): string {
  return "读取服务商模型列表失败";
}

export function buildProviderMissingNotice(): string {
  return "没有找到这个服务商，请先到模型配置页添加。";
}
