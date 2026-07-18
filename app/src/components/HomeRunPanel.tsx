import { HomeDocumentEntryCard } from "@/components/HomeDocumentEntryCard";
import { HomeRunControlSection } from "@/components/HomeRunControlSection";
import { HomeRunPanelDialogs } from "@/components/HomeRunPanelDialogs";
import { HomeSetupChoiceCards } from "@/components/HomeSetupChoiceCards";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHomeRunPanelModel, type HomeRunPanelProps } from "@/hooks/useHomeRunPanelModel";
import { Command } from "lucide-react";

export function HomeRunPanel(props: HomeRunPanelProps) {
  const m = useHomeRunPanelModel(props);

  return (
    <>
      <Card className="shadcn-control-panel w-full min-w-0 max-w-full shrink-0 overflow-hidden">
        <CardHeader className="min-w-0 border-b border-border/70 bg-muted/20 p-4 pb-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="vercel-icon-frame size-9">
                <Command className="size-4" />
              </span>
              <div className="min-w-0">
                <div className="vercel-kicker mb-1">Run configuration</div>
                <CardTitle className="truncate text-base">任务控制台</CardTitle>
              </div>
            </div>
            <Badge variant={m.hasDocument ? "default" : "outline"} className="mt-1 shrink-0 gap-1.5">
              <span className="size-1.5 rounded-full bg-current opacity-70" />
              {m.hasDocument ? "已载入" : "待上传"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden p-4 pt-0">
          <HomeDocumentEntryCard
            hasDocument={m.hasDocument}
            sourceKind={m.value?.sourceKind}
            busy={m.busy}
            running={m.running}
            onPickFile={m.onPickFile}
          />

          <HomeSetupChoiceCards
            busy={m.busy}
            setupEditor={m.setupEditor}
            promptSummary={m.promptSummary}
            activeFlowSequence={m.activeFlowSequence}
            promptSelectOptions={m.promptSelectOptions}
            unavailableRouteCount={m.unavailableRouteCount}
            modelRouteStatus={m.modelRouteStatus}
            modelRouteTitle={m.modelRouteTitle}
            modelRouteLines={m.modelRouteLines}
            onTogglePromptEditor={() => {
              if (m.promptProfile !== m.editablePromptProfile) {
                m.onPromptProfileChange(m.editablePromptProfile);
              }
              m.setSetupEditor(m.setupEditor === "prompt" ? null : "prompt");
            }}
            onToggleModelEditor={() => m.setSetupEditor(m.setupEditor === "model" ? null : "model")}
          />

          <HomeRunControlSection
            hasDocument={m.hasDocument}
            running={m.running}
            busy={m.busy}
            hasPendingRound={m.hasPendingRound}
            nextRound={m.value?.nextRound}
            runRecoveryState={m.runRecoveryState}
            pendingAutoAction={m.pendingAutoAction}
            hasVisibleResult={m.hasVisibleResult}
            visibleResultRound={m.visibleResultRound}
            rewriteConcurrency={m.rewriteConcurrency}
            progress={m.progress}
            currentRunProgressPercent={m.currentRunProgressPercent}
            waitingForStatusSync={m.waitingForStatusSync}
            primaryRunButtonVariant={m.primaryRunButtonVariant}
            primaryRunButtonDisabled={m.primaryRunButtonDisabled}
            runButtonText={m.runButtonText}
            canResetRound={m.canResetRound}
            latestCompletedRound={m.latestCompletedRound}
            resumableCheckpoint={Boolean(m.resumableCheckpoint)}
            onRejectAutoAction={m.onRejectAutoAction}
            onRewriteConcurrencyChange={m.updateRewriteConcurrency}
            onPrimaryRunAction={() => { void m.handlePrimaryRunAction(); }}
            onCancelRun={m.onCancelRun}
            onResetRound={m.onResetRound}
          />
        </CardContent>
      </Card>
      <HomeRunPanelDialogs
        setupEditor={m.setupEditor}
        setSetupEditor={m.setSetupEditor}
        appendDraft={m.appendDraft}
        setAppendDraft={m.setAppendDraft}
        modelConfigRef={m.modelConfigRef}
        busy={m.busy}
        activeSequence={m.activeSequence}
        activeFlowSequence={m.activeFlowSequence}
        sequenceLengthOptions={m.sequenceLengthOptions}
        promptSelectOptions={m.promptSelectOptions}
        promptProfile={m.promptProfile}
        promptWorkflows={m.promptWorkflows}
        modelConfig={m.modelConfig}
        providerOptions={m.providerOptions}
        providers={m.providers}
        customizedRouteCount={m.customizedRouteCount}
        unavailableRouteCount={m.unavailableRouteCount}
        modelRouteStatus={m.modelRouteStatus}
        modelRouteHealthLabel={m.modelRouteHealthLabel}
        modelRouteTitle={m.modelRouteTitle}
        activeModelRouteReady={m.activeModelRouteReady}
        appendRoundNumber={m.appendRoundNumber}
        appendPromptOptions={m.appendPromptOptions}
        appendModelOptions={m.appendModelOptions}
        appendRouteIssues={m.appendRouteIssues}
        appendConfirmDisabled={m.appendConfirmDisabled}
        onSaveModelConfig={m.onSaveModelConfig}
        onRefreshAllProviderModels={m.onRefreshAllProviderModels}
        onRefreshProviderModels={m.onRefreshProviderModels}
        updateSequenceLength={m.updateSequenceLength}
        updateSequenceRound={m.updateSequenceRound}
        resetModelRouteToDefault={m.resetModelRouteToDefault}
        updateRoundProvider={m.updateRoundProvider}
        updateRoundModel={m.updateRoundModel}
        updateAppendProvider={m.updateAppendProvider}
        confirmAppendRound={m.confirmAppendRound}
      />
    </>
  );
}
