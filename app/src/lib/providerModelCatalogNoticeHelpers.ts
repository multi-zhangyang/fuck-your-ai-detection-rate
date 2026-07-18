export function formatProviderModelsRefreshNotice(
  providerName: string | undefined,
  modelCount: number,
): string {
  return `已读取 ${providerName || "服务商"} 的模型列表：${modelCount} 个。`;
}

export function formatProviderModelsBatchNotice(successCount: number, failures: string[]): string {
  if (!failures.length) {
    return `已更新 ${successCount} 个服务商模型列表。`;
  }
  return `已更新 ${successCount} 个服务商模型列表，${failures.length} 个失败：${failures.slice(0, 2).join("；")}`;
}

export function buildModelCatalogMissingCredentialsFeedback(): {
  message: string;
  runtimeStep: string;
} {
  return {
    message: "请先填写 Base URL 和 API Key。",
    runtimeStep: "模型目录读取条件不足",
  };
}

export function buildModelCatalogLoadingRuntimeStep(): string {
  return "正在从 /v1/models 读取模型列表。";
}

export function buildModelCatalogSuccessFeedback(total: number): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: `已读取模型目录，共 ${total} 个模型。`,
    runtimeStep: "模型目录已更新",
  };
}

export function buildModelCatalogAbortFeedback(): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: "已停止读取模型列表。",
    runtimeStep: "模型目录读取已停止",
  };
}

export function buildModelCatalogFailureRuntimeStep(): string {
  return "模型目录读取失败";
}

export function buildProviderModelsBatchLoadingRuntimeStep(): string {
  return "正在批量读取已启用服务商的模型列表。";
}

export function buildProviderModelsBatchSuccessRuntimeStep(): string {
  return "服务商模型列表已批量更新";
}

export function buildProviderModelsBatchAbortFeedback(): {
  notice: string;
  runtimeStep: string;
} {
  return {
    notice: "已停止批量读取服务商模型列表。",
    runtimeStep: "批量读取已停止",
  };
}

export function buildProviderModelsBatchFailureRuntimeStep(): string {
  return "批量读取服务商模型失败";
}

export function buildNoEnabledProvidersNotice(): string {
  return "当前没有启用的服务商。";
}
