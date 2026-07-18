import {
  buildDefaultFormatRulesApplyInput,
  buildFormatDefaultRulesFailureRuntimeStep,
  buildFormatDefaultRulesLoadingRuntimeStep,
  buildFormatParseAbortFeedback,
  buildFormatParseBusyNotice,
  buildFormatParseFailureRuntimeStep,
  buildFormatParseRequestSetup,
  buildFormatParseSuccessApplyInput,
} from "@/lib/formatParseHelpers";
import type {
  FormatRulesHandlersDeps,
  FormatRulesRouteHandlers,
} from "@/lib/formatRulesHandlerTypes";
import { FORMAT_PARSER_DEFAULT_PROVIDER_ID } from "@/lib/storageKeys";

export function createFormatRulesParseHandlers(
  deps: FormatRulesHandlersDeps,
  route: FormatRulesRouteHandlers,
) {
  async function handleParseFormatRules(text: string) {
    if (deps.getFormatParseAbortRef()) {
      deps.setNotice(buildFormatParseBusyNotice());
      return;
    }
    if (!text.trim()) {
      const taskTicket = deps.beginTask("applying-format", {
        runtimeStep: buildFormatDefaultRulesLoadingRuntimeStep(),
      });
      try {
        route.applyFormatRulesPlan(
          buildDefaultFormatRulesApplyInput((await deps.service.resetFormatRules()).rules),
        );
      } catch (appError) {
        deps.applyErrorRuntimeStep(appError, buildFormatDefaultRulesFailureRuntimeStep());
      } finally {
        deps.finishTask(taskTicket);
      }
      return;
    }
    const taskTicket = deps.beginTask("parsing-format");
    const abortController = new AbortController();
    deps.setFormatParseAbortRef(abortController);
    try {
      const setup = buildFormatParseRequestSetup({
        modelConfig: deps.getModelConfig(),
        formatParserRoute: deps.getFormatParserRoute(),
        defaultProviderId: FORMAT_PARSER_DEFAULT_PROVIDER_ID,
      });
      deps.setRuntimeStep(setup.loadingRuntimeStep);
      route.applyFormatRulesPlan(
        buildFormatParseSuccessApplyInput(
          (await deps.service.parseFormatRules(text, setup.parserModelConfig, abortController.signal)).rules,
        ),
      );
    } catch (appError) {
      if (abortController.signal.aborted) {
        deps.applyOptionalUiFeedback(buildFormatParseAbortFeedback());
      } else {
        deps.applyErrorRuntimeStep(appError, buildFormatParseFailureRuntimeStep());
      }
    } finally {
      if (deps.getFormatParseAbortRef() === abortController) {
        deps.setFormatParseAbortRef(null);
      }
      deps.finishTask(taskTicket);
    }
  }

  function handleCancelFormatRulesParse() {
    const controller = deps.getFormatParseAbortRef();
    if (!controller) {
      return;
    }
    deps.setRuntimeStep("正在停止学校规范解析…");
    controller.abort("fyadr-user-cancel");
  }

  return {
    handleParseFormatRules,
    handleCancelFormatRulesParse,
  };
}
