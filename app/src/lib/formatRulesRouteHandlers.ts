import {
  normalizeFormatParserRoute,
  saveStoredFormatParserRoute,
  saveStoredFormatRules,
  saveStoredText,
} from "@/lib/formatStorage";
import type {
  ApplyFormatRulesPlanInput,
  FormatRulesHandlersDeps,
  FormatRulesRouteHandlers,
} from "@/lib/formatRulesHandlerTypes";
import { FORMAT_PARSER_DEFAULT_PROVIDER_ID, FORMAT_RULE_ACTIVE_KEY, FORMAT_RULE_DRAFT_KEY, FORMAT_RULE_PENDING_KEY } from "@/lib/storageKeys";
import type { FormatParserModelRoute, ModelProviderConfig } from "@/types/app";

export function createFormatRulesRouteHandlers(deps: FormatRulesHandlersDeps): FormatRulesRouteHandlers {
  function setFormatRuleText(nextText: string) {
    deps.setFormatRuleTextState(nextText);
    deps.setPendingFormatRules(null);
    saveStoredText(FORMAT_RULE_DRAFT_KEY, nextText);
    saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
  }

  function setFormatParserModelRoute(route: FormatParserModelRoute) {
    const normalized = normalizeFormatParserRoute(route);
    deps.setFormatParserRoute(normalized);
    saveStoredFormatParserRoute(normalized);
  }

  function handleFormatParserProviderChange(providerId: string) {
    if (providerId === FORMAT_PARSER_DEFAULT_PROVIDER_ID) {
      setFormatParserModelRoute({ providerId, model: "" });
      return;
    }
    const provider = deps.getModelConfig().modelProviders?.find((item: ModelProviderConfig) => item.id === providerId);
    setFormatParserModelRoute({
      providerId,
      model: provider?.defaultModel || provider?.models?.[0] || "",
    });
  }

  function applyFormatRulesPlan(input: ApplyFormatRulesPlanInput) {
    if (input.activeRules !== undefined) {
      deps.setActiveFormatRules(input.activeRules);
      if (input.persistActive) saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, input.activeRules);
    }
    if (input.pendingRules !== undefined) {
      deps.setPendingFormatRules(input.pendingRules);
      if (input.persistPending) saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, input.pendingRules);
    }
    deps.setNotice(input.feedback.notice);
    deps.setRuntimeStep(input.feedback.runtimeStep);
  }

  return {
    setFormatRuleText,
    setFormatParserModelRoute,
    handleFormatParserProviderChange,
    applyFormatRulesPlan,
  };
}
