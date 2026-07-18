import { buildRoundModelFromProvider } from "@/lib/modelRoute";
import type { AppendRoundDraft } from "@/lib/homeRunAppendRouteState";
import type { ModelConfig, PromptId, PromptWorkflow } from "@/types/app";

export function buildAppendRoundModelConfig(input: {
  currentConfig: ModelConfig;
  promptProfile: ModelConfig["promptProfile"];
  activeSequence: PromptId[];
  appendDraft: AppendRoundDraft;
  appendRoundLimit: number;
  promptWorkflows?: PromptWorkflow[];
  getRoundModelKey: (
    profile: ModelConfig["promptProfile"],
    round: number,
    workflows?: PromptWorkflow[],
  ) => string | null;
}): ModelConfig | null {
  const nextRound = input.activeSequence.length + 1;
  const nextSequence = [...input.activeSequence, input.appendDraft.promptId].slice(0, input.appendRoundLimit);
  const roundKey = input.getRoundModelKey(input.promptProfile, nextRound, input.promptWorkflows);
  const nextRoundModels = { ...(input.currentConfig.roundModels ?? {}) };
  if (roundKey) {
    if (input.appendDraft.providerId === "__default") {
      nextRoundModels[roundKey] = {
        ...(nextRoundModels[roundKey] ?? {
          providerName: "默认连接",
          baseUrl: input.currentConfig.baseUrl,
          apiKey: input.currentConfig.apiKey,
          model: input.currentConfig.model,
          apiType: input.currentConfig.apiType,
          streaming: input.currentConfig.streaming,
          temperature: input.currentConfig.temperature,
          requestTimeoutSeconds: input.currentConfig.requestTimeoutSeconds,
          maxRetries: input.currentConfig.maxRetries,
        }),
        enabled: false,
      };
    } else {
      const provider = (input.currentConfig.modelProviders ?? []).find(
        (item) => item.id === input.appendDraft.providerId && item.enabled !== false,
      );
      if (!provider) {
        return null;
      }
      nextRoundModels[roundKey] = buildRoundModelFromProvider(
        provider,
        input.appendDraft.model,
        input.currentConfig,
      );
    }
  }
  return {
    ...input.currentConfig,
    promptProfile: input.promptProfile,
    promptSequence: nextSequence,
    roundModels: nextRoundModels,
  };
}
