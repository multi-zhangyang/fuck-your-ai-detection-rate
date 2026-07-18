import { Settings, Wand2 } from "lucide-react";

import { SetupEditorModelRouteSection } from "@/components/SetupEditorModelRouteSection";
import { SetupEditorPromptSection } from "@/components/SetupEditorPromptSection";
import type { SetupEditorDialogBodyProps } from "@/components/SetupEditorDialogBodyProps";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { deriveSetupEditorDialogChrome } from "@/lib/setupEditorDialogViewModel";
import { cn } from "@/lib/utils";

export function SetupEditorDialogBody({
  setupEditor,
  busy,
  activeSequence,
  activeFlowSequence,
  sequenceLengthOptions,
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
  onUpdateSequenceLength,
  onUpdateSequenceRound,
  onResetModelRouteToDefault,
  onRefreshAllProviderModels,
  onSaveModelConfig,
  onUpdateRoundProvider,
  onUpdateRoundModel,
  onRefreshProviderModels,
}: SetupEditorDialogBodyProps) {
  const chrome = deriveSetupEditorDialogChrome({ setupEditor });
  return (
    <DialogContent className={cn("shadcn-config-dialog grid max-h-[min(88svh,52rem)] min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-0", chrome.dialogMaxWidthClass)}>
      <DialogHeader className="bg-muted/20 px-6 pb-5 pt-6">
        <div className="flex items-start gap-3 pr-8">
          <span className="vercel-icon-frame size-10">
            {setupEditor === "prompt" ? <Wand2 className="size-5" /> : <Settings className="size-5" />}
          </span>
          <div className="min-w-0">
            <div className="vercel-kicker mb-1">Workspace setup</div>
            <DialogTitle>{chrome.title}</DialogTitle>
            <DialogDescription className="mt-1 text-xs leading-5">{chrome.description}</DialogDescription>
          </div>
        </div>
      </DialogHeader>
      <Separator />

      <ScrollArea className="shadcn-scroll-bound h-full min-h-0 min-w-0 overflow-x-hidden px-6 pb-6">
        <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
          {setupEditor === "prompt" ? (
            <SetupEditorPromptSection
              busy={busy}
              activeSequence={activeSequence}
              sequenceLengthOptions={sequenceLengthOptions}
              promptSelectOptions={promptSelectOptions}
              onUpdateSequenceLength={onUpdateSequenceLength}
              onUpdateSequenceRound={onUpdateSequenceRound}
            />
          ) : (
            <SetupEditorModelRouteSection
              busy={busy}
              activeFlowSequence={activeFlowSequence}
              promptSelectOptions={promptSelectOptions}
              promptProfile={promptProfile}
              promptWorkflows={promptWorkflows}
              modelConfig={modelConfig}
              providerOptions={providerOptions}
              providers={providers}
              customizedRouteCount={customizedRouteCount}
              unavailableRouteCount={unavailableRouteCount}
              modelRouteStatus={modelRouteStatus}
              modelRouteHealthLabel={modelRouteHealthLabel}
              modelRouteTitle={modelRouteTitle}
              activeModelRouteReady={activeModelRouteReady}
              onResetModelRouteToDefault={onResetModelRouteToDefault}
              onRefreshAllProviderModels={onRefreshAllProviderModels}
              onSaveModelConfig={onSaveModelConfig}
              onUpdateRoundProvider={onUpdateRoundProvider}
              onUpdateRoundModel={onUpdateRoundModel}
              onRefreshProviderModels={onRefreshProviderModels}
            />
          )}
        </div>
      </ScrollArea>
    </DialogContent>
  );
}
