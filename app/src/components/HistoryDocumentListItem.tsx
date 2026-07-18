import type { ComponentType } from "react";

import { HistoryDocumentListItemBody } from "@/components/HistoryDocumentListItemBody";
import type {
  HistoryDeleteActionComponent,
  HistoryImpactPreviewState,
} from "@/components/HistoryDocumentSharedTypes";
import { cn } from "@/lib/utils";
import { deriveHistoryDocumentListItemState } from "@/lib/historyDocumentListViewModel";
import type {
  DeleteHistoryOptions,
  DocumentHistory,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  ModelConfig,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function HistoryDocumentListItem({
  item,
  currentDocId,
  currentHistory,
  promptProfile,
  promptSequence,
  promptOptions,
  promptWorkflows,
  busy,
  cleanupDocId,
  impactPreview,
  impactLoadingKey,
  makeDeleteActionKey,
  itemsLength,
  onSelect,
  onToggleCleanup,
  onPreviewDelete,
  onDelete,
  onDownload,
  AssetImpactPanel,
  HistoryDeleteAction,
}: {
  item: HistoryDocumentSummary;
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  busy: boolean;
  cleanupDocId: string | null;
  impactPreview: HistoryImpactPreviewState;
  impactLoadingKey: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  itemsLength: number;
  onSelect: (item: HistoryDocumentSummary) => void;
  onToggleCleanup: (docId: string) => void;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  AssetImpactPanel: ComponentType<{ impact: HistoryDeleteImpact }>;
  HistoryDeleteAction: HistoryDeleteActionComponent;
}) {
  const state = deriveHistoryDocumentListItemState({
    item,
    currentDocId,
    currentHistory,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    cleanupDocId,
    impactPreview,
    makeDeleteActionKey,
    itemsLength,
  });

  return (
    <div
      key={state.listKey}
      className={cn(
        "relative rounded-lg border bg-card p-4 transition-colors",
        state.isActive ? "border-primary/30" : "border-border hover:bg-muted/20",
      )}
    >
      <HistoryDocumentListItemBody
        item={item}
        busy={busy}
        impactPreview={impactPreview}
        impactLoadingKey={impactLoadingKey}
        makeDeleteActionKey={makeDeleteActionKey}
        onSelect={onSelect}
        onToggleCleanup={onToggleCleanup}
        onPreviewDelete={onPreviewDelete}
        onDelete={onDelete}
        onDownload={onDownload}
        AssetImpactPanel={AssetImpactPanel}
        HistoryDeleteAction={HistoryDeleteAction}
        promptSequence={promptSequence}
        promptOptions={promptOptions}
        promptWorkflows={promptWorkflows}
        state={state}
      />
    </div>
  );
}
