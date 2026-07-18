import { buildModelConfigFromProvider } from "@/lib/modelRoute";
import {
  buildFormatParseLoadingRuntimeStep,
  getFormatParserTimeoutSeconds,
  planFormatDefaultRulesApply,
  planFormatParsePendingApply,
} from "@/lib/formatParseFeedbackHelpers";
import type {
  FormatParserModelRoute,
  FormatRules,
  ModelConfig,
} from "@/types/app";

export function buildFormatParserModelConfig(input: {
  modelConfig: ModelConfig;
  formatParserRoute: FormatParserModelRoute;
  defaultProviderId: string;
}): ModelConfig {
  const providerId = input.formatParserRoute.providerId || input.defaultProviderId;
  if (providerId === input.defaultProviderId) {
    return {
      ...input.modelConfig,
      model: input.formatParserRoute.model?.trim() || input.modelConfig.model,
    };
  }
  const provider = input.modelConfig.modelProviders?.find((item) => item.id === providerId);
  if (!provider) {
    throw new Error("学校规范解析模型选择的服务商不存在，请重新选择。");
  }
  if (provider.enabled === false) {
    throw new Error("学校规范解析模型选择的服务商已关闭，请启用或切换服务商。");
  }
  return buildModelConfigFromProvider(provider, input.modelConfig, input.formatParserRoute.model);
}

export function buildFormatParseRequestSetup(input: {
  modelConfig: ModelConfig;
  formatParserRoute: FormatParserModelRoute;
  defaultProviderId: string;
}): {
  parserModelConfig: ModelConfig;
  parserTimeoutSeconds: number;
  loadingRuntimeStep: string;
} {
  const parserModelConfig = buildFormatParserModelConfig({
    modelConfig: input.modelConfig,
    formatParserRoute: input.formatParserRoute,
    defaultProviderId: input.defaultProviderId,
  });
  const parserTimeoutSeconds = getFormatParserTimeoutSeconds(parserModelConfig.requestTimeoutSeconds);
  return {
    parserModelConfig,
    parserTimeoutSeconds,
    loadingRuntimeStep: buildFormatParseLoadingRuntimeStep(parserTimeoutSeconds),
  };
}

export function buildDefaultFormatRulesApplyInput(rules: FormatRules) {
  const applied = planFormatDefaultRulesApply(rules);
  return {
    activeRules: applied.activeRules,
    pendingRules: applied.pendingRules,
    persistActive: true,
    persistPending: true,
    feedback: applied.feedback,
  };
}

export function buildFormatParseSuccessApplyInput(rules: FormatRules) {
  const applied = planFormatParsePendingApply(rules);
  return {
    pendingRules: applied.pendingRules,
    persistPending: true,
    feedback: applied.feedback,
  };
}
