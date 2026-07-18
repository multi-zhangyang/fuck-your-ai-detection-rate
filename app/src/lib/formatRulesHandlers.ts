import { createFormatRulesActionHandlers } from "@/lib/formatRulesActionHandlers";
import type { FormatRulesHandlersDeps } from "@/lib/formatRulesHandlerTypes";
import { createFormatRulesRouteHandlers } from "@/lib/formatRulesRouteHandlers";

export type {
  ApplyFormatRulesPlanInput,
  FormatRulesActionHandlers,
  FormatRulesHandlersDeps,
  FormatRulesRouteHandlers,
} from "@/lib/formatRulesHandlerTypes";

export function createFormatRulesHandlers(deps: FormatRulesHandlersDeps) {
  const route = createFormatRulesRouteHandlers(deps);
  const action = createFormatRulesActionHandlers(deps, route);
  return {
    ...route,
    ...action,
  };
}
