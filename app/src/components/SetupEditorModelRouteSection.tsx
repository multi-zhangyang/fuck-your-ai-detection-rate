import { SetupEditorModelRouteRoundCard } from "@/components/SetupEditorModelRouteRoundCard";
import { SetupEditorModelRouteSummary } from "@/components/SetupEditorModelRouteSummary";
import { deriveSetupEditorRoundRouteState } from "@/lib/setupEditorDialogViewModel";
import type { ModelConfig, ModelProviderConfig, PromptId, PromptOption, PromptWorkflow } from "@/types/app";

export function SetupEditorModelRouteSection({
  busy,
  activeFlowSequence,
  promptSelectOptions,
  promptProfile,
  promptWorkflows,
  modelConfig,
  providerOptions,
  providers,
  customizedRouteCount,
  unavailableRouteCount,
  modelRouteStatus,
  modelRouteHealthLabel,
  modelRouteTitle,
  activeModelRouteReady,
  onResetModelRouteToDefault,
  onRefreshAllProviderModels,
  onSaveModelConfig,
  onUpdateRoundProvider,
  onUpdateRoundModel,
  onRefreshProviderModels,
}: {
  busy: boolean;
  activeFlowSequence: PromptId[];
  promptSelectOptions: Array<Pick<PromptOption, "id" | "label">>;
  promptProfile: ModelConfig["promptProfile"];
  promptWorkflows: PromptWorkflow[];
  modelConfig: ModelConfig;
  providerOptions: ModelProviderConfig[];
  providers: ModelProviderConfig[];
  customizedRouteCount: number;
  unavailableRouteCount: number;
  modelRouteStatus: string;
  modelRouteHealthLabel: string;
  modelRouteTitle: string;
  activeModelRouteReady: boolean;
  onResetModelRouteToDefault: () => void;
  onRefreshAllProviderModels: () => void;
  onSaveModelConfig: () => void;
  onUpdateRoundProvider: (roundIndex: number, providerId: string) => void;
  onUpdateRoundModel: (roundIndex: number, model: string) => void;
  onRefreshProviderModels: (providerId: string) => void;
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
      <SetupEditorModelRouteSummary
        busy={busy}
        providerOptionCount={providerOptions.length}
        providerCount={providers.length}
        activeFlowSequenceLength={activeFlowSequence.length}
        customizedRouteCount={customizedRouteCount}
        unavailableRouteCount={unavailableRouteCount}
        modelRouteStatus={modelRouteStatus}
        modelRouteHealthLabel={modelRouteHealthLabel}
        modelRouteTitle={modelRouteTitle}
        activeModelRouteReady={activeModelRouteReady}
        onResetModelRouteToDefault={onResetModelRouteToDefault}
        onRefreshAllProviderModels={onRefreshAllProviderModels}
        onSaveModelConfig={onSaveModelConfig}
      />
      <div className="grid min-w-0 gap-3">
        {activeFlowSequence.map((promptId, index) => {
          const {
            promptOption,
            selectedProviderId,
            selectedModels,
            selectedModelValue,
            routeIssues,
            provider,
            roundModel,
          } = deriveSetupEditorRoundRouteState({
            promptId,
            index,
            promptSelectOptions,
            promptProfile,
            promptWorkflows,
            modelConfig,
          });
          return (
            <SetupEditorModelRouteRoundCard
              key={`${promptId}-${index}-model`}
              index={index}
              promptId={promptId}
              promptLabel={promptOption?.label ?? promptId}
              busy={busy}
              modelConfig={modelConfig}
              providerOptions={providerOptions}
              selectedProviderId={selectedProviderId}
              selectedModels={selectedModels}
              selectedModelValue={selectedModelValue}
              routeIssues={routeIssues}
              provider={provider}
              roundModel={roundModel}
              onUpdateRoundProvider={onUpdateRoundProvider}
              onUpdateRoundModel={onUpdateRoundModel}
              onRefreshProviderModels={onRefreshProviderModels}
            />
          );
        })}
      </div>
    </div>
  );
}
