import type { Dispatch, SetStateAction } from "react";

import { AppendRoundDialog } from "@/components/AppendRoundDialog";
import type { AppendRoundDraft } from "@/lib/homeRunPanelState";
import type {
  ModelConfig,
  ModelProviderConfig,
  PromptOption,
} from "@/types/app";

export function HomeRunAppendRoundDialogShell({
  appendDraft,
  setAppendDraft,
  appendRoundNumber,
  appendPromptOptions,
  providerOptions,
  modelConfig,
  appendModelOptions,
  appendRouteIssues,
  appendConfirmDisabled,
  updateAppendProvider,
  confirmAppendRound,
}: {
  appendDraft: AppendRoundDraft | null;
  setAppendDraft: Dispatch<SetStateAction<AppendRoundDraft | null>>;
  appendRoundNumber: number;
  appendPromptOptions: Array<Pick<PromptOption, "id" | "label">>;
  providerOptions: ModelProviderConfig[];
  modelConfig: ModelConfig;
  appendModelOptions: string[];
  appendRouteIssues: string[];
  appendConfirmDisabled: boolean;
  updateAppendProvider: (providerId: string) => void;
  confirmAppendRound: () => void;
}) {
  return (
    <AppendRoundDialog
      open={Boolean(appendDraft)}
      appendDraft={appendDraft}
      appendRoundNumber={appendRoundNumber}
      appendPromptOptions={appendPromptOptions}
      providerOptions={providerOptions}
      modelConfig={modelConfig}
      appendModelOptions={appendModelOptions}
      appendRouteIssues={appendRouteIssues}
      appendConfirmDisabled={appendConfirmDisabled}
      onOpenChange={(open) => {
        if (!open) setAppendDraft(null);
      }}
      onDraftChange={setAppendDraft}
      onProviderChange={updateAppendProvider}
      onConfirm={confirmAppendRound}
    />
  );
}
