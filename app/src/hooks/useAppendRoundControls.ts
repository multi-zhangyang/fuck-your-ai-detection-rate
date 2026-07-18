import { useMemo, useState } from "react";
import type { MutableRefObject } from "react";

import { createAppendRoundControlHelpers } from "@/lib/appendRoundControlHelpers";
import {
  buildAppendRouteIssues,
  buildAppendPromptOptions,
  resolveAppendProvider,
  type AppendRoundDraft,
} from "@/lib/homeRunPanelState";
import type {
  ModelConfig,
  ModelProviderConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

type Input = {
  modelConfig: ModelConfig;
  modelConfigRef: MutableRefObject<ModelConfig>;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  activeSequence: PromptId[];
  promptSelectOptions: PromptOption[];
  providerOptions: ModelProviderConfig[];
  busy: boolean;
  running: boolean;
  appendRoundLimit: number;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
  onRunRound: (modelConfig?: ModelConfig) => void;
};

export function useAppendRoundControls({
  modelConfig,
  modelConfigRef,
  promptProfile,
  promptWorkflows,
  activeSequence,
  promptSelectOptions,
  providerOptions,
  busy,
  running,
  appendRoundLimit,
  onModelConfigChange,
  onRunRound,
}: Input) {
  const [appendDraft, setAppendDraft] = useState<AppendRoundDraft | null>(null);
  const helpers = useMemo(() => createAppendRoundControlHelpers({
    getModelConfig: () => modelConfigRef.current,
    promptProfile,
    promptWorkflows,
    activeSequence,
    promptSelectOptions,
    providerOptions,
    appendRoundLimit,
  }), [
    modelConfigRef,
    promptProfile,
    promptWorkflows,
    activeSequence,
    promptSelectOptions,
    providerOptions,
    appendRoundLimit,
  ]);
  const openAppendRoundDialog = () => {
    setAppendDraft(helpers.buildOpenDraft());
  };
  const updateAppendProvider = (providerId: string) => {
    setAppendDraft((draft) => {
      if (!draft) return draft;
      return helpers.buildProviderDraftPatch(draft, providerId);
    });
  };
  const appendProvider = resolveAppendProvider(appendDraft, providerOptions);
  const appendPromptOptions = buildAppendPromptOptions(promptSelectOptions);
  const appendModelOptions = appendDraft ? helpers.getAppendModelOptionsFor(appendDraft.providerId, appendDraft.model) : [];
  const appendRouteIssues = buildAppendRouteIssues(modelConfig, appendDraft, appendProvider);
  const appendConfirmDisabled = !appendDraft || busy || running || appendRouteIssues.length > 0 || !appendDraft.promptId;
  const confirmAppendRound = () => {
    if (!appendDraft || appendConfirmDisabled) {
      return;
    }
    const nextConfig = helpers.buildConfirmedConfig(appendDraft);
    if (!nextConfig) {
      return;
    }
    modelConfigRef.current = nextConfig;
    setAppendDraft(null);
    onModelConfigChange(nextConfig);
    onRunRound(nextConfig);
  };
  return {
    appendDraft,
    setAppendDraft,
    openAppendRoundDialog,
    updateAppendProvider,
    appendPromptOptions,
    appendModelOptions,
    appendRouteIssues,
    appendConfirmDisabled,
    confirmAppendRound,
  };
}
