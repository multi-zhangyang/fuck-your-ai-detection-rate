import {
  DEFAULT_PROMPT_SEQUENCE,
  formatPromptSequence,
  getDefaultPromptProfile,
  getPromptProfileLabel,
  getPromptRoundLimit,
  getPromptSequenceLimit,
  isPromptSequenceCustomizable,
} from "@/lib/promptRegistry";
import {
  normalizeRewriteConcurrency,
} from "@/lib/modelRoute";
import { clampPercent } from "@/lib/qualityStats";
import { buildModelRouteSummary, summarizeModelRoute } from "@/lib/modelRouteSummary";
import type {
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
  RoundProgress,
} from "@/types/app";

export function deriveHomeRunPanelRouteState(input: {
  modelConfig: ModelConfig;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  promptOptions: PromptOption[];
  activeFlowSequence: PromptId[];
  progress: RoundProgress | null;
  currentRunCompletedChunks: number;
}) {
  const {
    modelConfig,
    promptProfile,
    promptWorkflows,
    promptOptions,
    activeFlowSequence,
    progress,
    currentRunCompletedChunks,
  } = input;
  const editablePromptProfile = getDefaultPromptProfile(promptWorkflows);
  const promptSelectOptions = activeFlowSequence.reduce<PromptOption[]>((options, promptId) => {
    if (options.some((item) => item.id === promptId)) {
      return options;
    }
    return [...options, { id: promptId, label: promptId }];
  }, promptOptions);
  const sequenceLengthLimit = Math.max(1, Math.min(getPromptSequenceLimit(promptProfile, promptWorkflows), DEFAULT_PROMPT_SEQUENCE.length));
  const appendRoundLimit = Math.max(sequenceLengthLimit, getPromptRoundLimit(promptProfile, promptWorkflows));
  const sequenceLengthOptions = Array.from({ length: sequenceLengthLimit }, (_, index) => index + 1);
  const providers = modelConfig.modelProviders ?? [];
  const providerOptions = providers.filter((provider) => provider.enabled !== false);
  const promptSummary = isPromptSequenceCustomizable(promptProfile, promptWorkflows)
    ? formatPromptSequence(activeFlowSequence, promptSelectOptions)
    : getPromptProfileLabel(promptProfile, promptWorkflows);
  const modelRouteSummary = buildModelRouteSummary(modelConfig, activeFlowSequence, promptProfile, promptWorkflows);
  const {
    customizedRouteCount,
    unavailableRouteCount,
    modelRouteStatus,
    modelRouteHealthLabel,
    modelRouteTitle,
    modelRouteLines,
    activeModelRouteReady,
  } = summarizeModelRoute(modelRouteSummary, modelConfig, activeFlowSequence.length);
  const rewriteConcurrency = normalizeRewriteConcurrency(modelConfig.rewriteConcurrency);
  const currentRunProgressPercent = progress?.totalChunks
    ? clampPercent((currentRunCompletedChunks / Math.max(progress.totalChunks, 1)) * 100)
    : null;
  return {
    editablePromptProfile,
    promptSelectOptions,
    sequenceLengthLimit,
    appendRoundLimit,
    sequenceLengthOptions,
    providers,
    providerOptions,
    promptSummary,
    customizedRouteCount,
    unavailableRouteCount,
    modelRouteStatus,
    modelRouteHealthLabel,
    modelRouteTitle,
    modelRouteLines,
    activeModelRouteReady,
    rewriteConcurrency,
    currentRunProgressPercent,
  };
}
