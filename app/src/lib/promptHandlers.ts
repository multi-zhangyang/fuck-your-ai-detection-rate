import type { PromptHandlersDeps } from "@/lib/promptHandlerTypes";
import { createPromptCrudHandlers } from "@/lib/promptCrudHandlers";
import { createPromptRouteHandlers } from "@/lib/promptRouteHandlers";
import { createPromptRouteRequestCoordinator } from "@/lib/promptRouteRequestGeneration";

export type {
  ApplyPromptRouteSwitchInput,
  PromptCrudHandlers,
  PromptHandlersDeps,
  PromptRouteHandlers,
} from "@/lib/promptHandlerTypes";

export function createPromptHandlers(deps: PromptHandlersDeps) {
  const requestCoordinator = createPromptRouteRequestCoordinator(deps.promptRouteRequestRef);
  const crud = createPromptCrudHandlers(deps, requestCoordinator);
  const route = createPromptRouteHandlers(deps, crud, requestCoordinator);
  return {
    ...crud,
    ...route,
  };
}
