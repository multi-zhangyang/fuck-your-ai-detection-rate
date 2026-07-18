import { FORMAT_PARSER_DEFAULT_PROVIDER_ID } from "@/lib/storageKeys";
import type { FormatRules, ModelCatalogResult, ModelConfig } from "@/types/app";

export function deriveSchoolFormatCardState(input: {
  formatRuleText: string;
  activeFormatRules: FormatRules | null;
  modelConfig: ModelConfig;
  modelCatalog: ModelCatalogResult | null;
  parserProviderId: string;
  parserModel: string;
  pendingFormatRules: FormatRules | null;
}) {
  const displayRules = input.pendingFormatRules ?? input.activeFormatRules;
  const hasInput = Boolean(input.formatRuleText.trim());
  const usingDefault = !input.pendingFormatRules && (input.activeFormatRules?.schoolName === "default" || !input.activeFormatRules);
  const parserProviderValue = input.parserProviderId || FORMAT_PARSER_DEFAULT_PROVIDER_ID;
  const providers = input.modelConfig.modelProviders ?? [];
  const selectedParserProvider = providers.find((provider) => provider.id === parserProviderValue) ?? null;
  const providerModelOptions = selectedParserProvider?.models ?? [];
  const defaultModelOptions = input.modelCatalog?.models.map((item) => item.id) ?? [];
  const effectiveParserModel = input.parserModel.trim()
    || selectedParserProvider?.defaultModel
    || selectedParserProvider?.models?.[0]
    || input.modelConfig.model;
  const parserModelOptions = Array.from(new Set([
    effectiveParserModel,
    ...(selectedParserProvider ? providerModelOptions : defaultModelOptions),
  ].filter(Boolean)));
  return {
    displayRules,
    hasInput,
    usingDefault,
    parserProviderValue,
    providers,
    selectedParserProvider,
    effectiveParserModel,
    parserModelOptions,
  };
}
