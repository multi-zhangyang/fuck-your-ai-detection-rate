import type { PromptHandlersDeps } from "@/lib/promptHandlerTypes";
import { createPromptCrudHandlers } from "@/lib/promptCrudHandlers";
import { createPromptRouteHandlers } from "@/lib/promptRouteHandlers";

export type {
  ApplyPromptRouteSwitchInput,
  PromptCrudHandlers,
  PromptHandlersDeps,
  PromptRouteHandlers,
} from "@/lib/promptHandlerTypes";

export function createPromptHandlers(deps: PromptHandlersDeps) {
  const crud = createPromptCrudHandlers(deps);
  const route = createPromptRouteHandlers(deps, crud);
  return {
    ...crud,
    ...route,
  };
}
