import { createFormatRulesConfirmHandlers } from "@/lib/formatRulesConfirmHandlers";
import { createFormatRulesParseHandlers } from "@/lib/formatRulesParseHandlers";
import type {
  FormatRulesActionHandlers,
  FormatRulesHandlersDeps,
  FormatRulesRouteHandlers,
} from "@/lib/formatRulesHandlerTypes";

export function createFormatRulesActionHandlers(
  deps: FormatRulesHandlersDeps,
  route: FormatRulesRouteHandlers,
): FormatRulesActionHandlers {
  return {
    ...createFormatRulesParseHandlers(deps, route),
    ...createFormatRulesConfirmHandlers(deps),
  };
}
