import type { PromptId } from "@/types/app";

export type AppendRoundDraft = {
  promptId: PromptId;
  providerId: string;
  model: string;
};

export function buildAppendDraftFromRoute(input: {
  fallbackPromptId: PromptId;
  providerId: string;
  model: string;
  defaultModelFallback?: string;
}): AppendRoundDraft {
  return {
    promptId: input.fallbackPromptId,
    providerId: input.providerId,
    model: input.model || input.defaultModelFallback || "",
  };
}

export function buildOpenAppendDraft(input: {
  activeSequence: PromptId[];
  promptSelectOptions: Array<{ id: PromptId; label: string }>;
  defaultRoute: { providerId: string; model: string };
  defaultModelFallback?: string;
}): AppendRoundDraft {
  const fallbackPromptId = input.activeSequence[input.activeSequence.length - 1]
    ?? input.promptSelectOptions[0]?.id
    ?? ("round1" as PromptId);
  return buildAppendDraftFromRoute({
    fallbackPromptId,
    providerId: input.defaultRoute.providerId,
    model: input.defaultRoute.model || input.defaultModelFallback || "",
  });
}
