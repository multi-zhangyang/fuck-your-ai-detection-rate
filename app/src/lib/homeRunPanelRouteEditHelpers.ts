import {
  withDefaultModelRoutes,
  withRoundModel,
  withRoundProvider,
  withSequenceLength,
  withSequenceRound,
} from "@/lib/modelRouteEdit";
import { normalizeRewriteConcurrency } from "@/lib/modelRoute";
import type { ModelConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export function createHomeRunPanelRouteEditors(input: {
  getModelConfig: () => ModelConfig;
  setModelConfig: (next: ModelConfig) => void;
  activeSequence: PromptId[];
  activeFlowSequence: PromptId[];
  sequenceLengthLimit: number;
  promptSelectOptions: PromptOption[];
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  rewriteConcurrency: number;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void | Promise<void>;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
}) {
  const updateSequenceRound = (roundIndex: number, promptId: PromptId) => {
    input.onPromptSequenceChange(withSequenceRound(input.activeSequence, roundIndex, promptId));
  };
  const updateSequenceLength = (length: number) => {
    input.onPromptSequenceChange(withSequenceLength({
      activeSequence: input.activeSequence,
      activeFlowSequence: input.activeFlowSequence,
      length,
      sequenceLengthLimit: input.sequenceLengthLimit,
      promptSelectOptions: input.promptSelectOptions,
    }));
  };
  const updateRoundProvider = (roundIndex: number, providerId: string) => {
    const nextConfig = withRoundProvider(
      input.getModelConfig(),
      input.promptProfile,
      roundIndex,
      providerId,
      input.promptWorkflows,
    );
    input.setModelConfig(nextConfig);
    input.onModelConfigChange(nextConfig);
  };
  const updateRoundModel = (roundIndex: number, model: string) => {
    const nextConfig = withRoundModel(
      input.getModelConfig(),
      input.promptProfile,
      roundIndex,
      model,
      input.promptWorkflows,
    );
    input.setModelConfig(nextConfig);
    input.onModelConfigChange(nextConfig);
  };
  const resetModelRouteToDefault = () => {
    const nextConfig = withDefaultModelRoutes(
      input.getModelConfig(),
      input.promptProfile,
      input.activeFlowSequence.length,
      input.promptWorkflows,
    );
    input.setModelConfig(nextConfig);
    input.onModelConfigChange(nextConfig);
  };
  const updateRewriteConcurrency = (nextValue: string) => {
    const nextConcurrency = normalizeRewriteConcurrency(nextValue, input.rewriteConcurrency);
    const nextConfig = { ...input.getModelConfig(), rewriteConcurrency: nextConcurrency };
    input.setModelConfig(nextConfig);
    input.onModelConfigChange(nextConfig);
  };
  return {
    updateSequenceRound,
    updateSequenceLength,
    updateRoundProvider,
    updateRoundModel,
    resetModelRouteToDefault,
    updateRewriteConcurrency,
  };
}
