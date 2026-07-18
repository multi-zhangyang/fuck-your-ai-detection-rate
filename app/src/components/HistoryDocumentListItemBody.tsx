import type { ComponentType } from "react";

import { HistoryDocumentCleanupActions } from "@/components/HistoryDocumentCleanupActions";
import { HistoryDocumentListItemHeader } from "@/components/HistoryDocumentListItemHeader";
import { HistoryDocumentRoundList } from "@/components/HistoryDocumentRoundList";
import type {
  HistoryDeleteActionComponent,
  HistoryImpactPreviewState,
} from "@/components/HistoryDocumentSharedTypes";
import type { HistoryDocumentListItemState } from "@/lib/historyDocumentListViewTypes";
import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function HistoryDocumentListItemBody({
  item,
  busy,
  impactPreview,
  impactLoadingKey,
  makeDeleteActionKey,
  onSelect,
  onToggleCleanup,
  onPreviewDelete,
  onDelete,
  onDownload,
  AssetImpactPanel,
  HistoryDeleteAction,
  promptSequence,
  promptOptions,
  promptWorkflows,
  state,
}: {
  item: HistoryDocumentSummary;
  busy: boolean;
  impactPreview: HistoryImpactPreviewState;
  impactLoadingKey: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  onSelect: (item: HistoryDocumentSummary) => void;
  onToggleCleanup: (docId: string) => void;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  AssetImpactPanel: ComponentType<{ impact: HistoryDeleteImpact }>;
  HistoryDeleteAction: HistoryDeleteActionComponent;
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  state: HistoryDocumentListItemState;
}) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <HistoryDocumentListItemHeader
          docName={state.docName}
          isActive={state.isActive}
          roundStateText={state.roundStateText}
          missingAssets={state.missingAssets}
          lastTimestampText={state.lastTimestampText}
          nextStepText={state.nextStepText}
          latestResultText={state.latestResultText}
          exportStateText={state.exportStateText}
          cleanupStateText={state.cleanupStateText}
          pathScopeText={state.pathScopeText}
          cleanupOpen={state.cleanupOpen}
          busy={busy}
          onToggleCleanup={() => onToggleCleanup(item.docId)}
          onSelect={() => onSelect(item)}
        />
        {state.cleanupOpen ? (
          <HistoryDocumentCleanupActions
            item={item}
            documentDeleteActions={state.documentDeleteActions}
            busy={busy}
            impactLoadingKey={impactLoadingKey}
            makeDeleteActionKey={makeDeleteActionKey}
            onPreviewDelete={onPreviewDelete}
            onDelete={onDelete}
            HistoryDeleteAction={HistoryDeleteAction}
          />
        ) : null}
        {state.documentImpactPreview ? <AssetImpactPanel impact={state.documentImpactPreview} /> : null}
      </div>

      <HistoryDocumentRoundList
        item={item}
        activeRounds={state.activeRounds}
        visibleRounds={state.visibleRounds}
        shouldShowRounds={state.shouldShowRounds}
        cleanupOpen={state.cleanupOpen}
        busy={busy}
        impactPreview={impactPreview}
        impactLoadingKey={impactLoadingKey}
        promptSequence={promptSequence}
        promptOptions={promptOptions}
        promptWorkflows={promptWorkflows}
        makeDeleteActionKey={makeDeleteActionKey}
        onPreviewDelete={onPreviewDelete}
        onDelete={onDelete}
        onDownload={onDownload}
        AssetImpactPanel={AssetImpactPanel}
        HistoryDeleteAction={HistoryDeleteAction}
      />
    </>
  );
}
