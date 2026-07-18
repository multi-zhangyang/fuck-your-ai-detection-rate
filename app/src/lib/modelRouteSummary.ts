import { findProviderForRoundModel } from "@/lib/modelRoute";
import { getRoundModelKey } from "@/lib/promptRegistry";
import type { ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export type ModelRouteSummaryItem = {
  index: number;
  promptId: PromptId;
  providerLabel: string;
  modelLabel: string;
  customized: boolean;
  providerUnavailable: boolean;
};

export function buildModelRouteSummary(
  modelConfig: ModelConfig,
  activeFlowSequence: PromptId[],
  promptProfile: ModelConfig["promptProfile"],
  promptWorkflows?: PromptWorkflow[],
): ModelRouteSummaryItem[] {
  return activeFlowSequence.map((promptId, index) => {
    const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
    const provider = findProviderForRoundModel(modelConfig, roundModel);
    const customRoute = Boolean(roundModel?.enabled);
    const effectiveCustomModel = roundModel?.model || provider?.defaultModel || provider?.models?.[0] || "";
    const providerUnavailable = Boolean(
      customRoute
        ? (
          !provider
          || provider.enabled === false
          || !provider.baseUrl?.trim()
          || !provider.apiKey?.trim()
          || !effectiveCustomModel.trim()
        )
        : (
          !modelConfig.baseUrl?.trim()
          || !modelConfig.apiKey?.trim()
          || !modelConfig.model?.trim()
        ),
    );
    return {
      index,
      promptId,
      providerLabel: roundModel?.enabled && provider ? provider.name : roundModel?.enabled ? "服务商不可用" : "默认连接",
      modelLabel: roundModel?.enabled && provider ? effectiveCustomModel || "未选模型" : modelConfig.model || "未选模型",
      customized: Boolean(roundModel?.enabled && provider && provider.enabled !== false),
      providerUnavailable,
    };
  });
}

export function summarizeModelRoute(
  modelRouteSummary: ModelRouteSummaryItem[],
  modelConfig: ModelConfig,
  activeFlowSequenceLength: number,
) {
  const customizedRouteCount = modelRouteSummary.filter((item) => item.customized).length;
  const unavailableRouteCount = modelRouteSummary.filter((item) => item.providerUnavailable).length;
  const modelRouteStatus = unavailableRouteCount
    ? `${unavailableRouteCount} 轮需处理`
    : customizedRouteCount
      ? `混用 ${customizedRouteCount}/${activeFlowSequenceLength}`
      : "全部继承默认";
  const activeModelRouteReady = unavailableRouteCount === 0;
  const modelRouteHealthLabel = unavailableRouteCount
    ? "路线不可启动"
    : activeModelRouteReady
      ? "路线可启动"
      : "默认连接待补全";
  const modelRouteTitle = customizedRouteCount
    ? customizedRouteCount === activeFlowSequenceLength
      ? `专属路线 ${customizedRouteCount}/${activeFlowSequenceLength}`
      : `混用路线 ${customizedRouteCount}/${activeFlowSequenceLength}`
    : `默认 ${modelConfig.model || "未选"} · ${activeFlowSequenceLength} 轮`;
  const modelRouteLines = modelRouteSummary.map((item) => `${item.index + 1}. ${item.providerLabel} · ${item.modelLabel}`);
  return {
    customizedRouteCount,
    unavailableRouteCount,
    modelRouteStatus,
    activeModelRouteReady,
    modelRouteHealthLabel,
    modelRouteTitle,
    modelRouteLines,
  };
}
