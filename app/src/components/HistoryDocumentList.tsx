import type { ComponentType } from "react";

import { HistoryDocumentListItem } from "@/components/HistoryDocumentListItem";
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

type ImpactPreviewState = {
  key: string;
  impact: HistoryDeleteImpact;
} | null;

type Props = {
  items: HistoryDocumentSummary[];
  currentDocId: string | null;
  currentHistory: DocumentHistory | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  busy: boolean;
  cleanupDocId: string | null;
  impactPreview: ImpactPreviewState;
  impactLoadingKey: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  onSelect: (item: HistoryDocumentSummary) => void;
  onToggleCleanup: (docId: string) => void;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  AssetImpactPanel: ComponentType<{ impact: HistoryDeleteImpact }>;
  HistoryDeleteAction: ComponentType<{
    title: string;
    options: DeleteHistoryOptions;
    docId: string;
    busy: boolean;
    loading: boolean;
    destructive?: boolean;
    onPreview: (docId: string, options: DeleteHistoryOptions) => void;
    onDelete: (docId: string, options: DeleteHistoryOptions) => void;
  }>;
};

export function HistoryDocumentList({
  items,
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
  onSelect,
  onToggleCleanup,
  onPreviewDelete,
  onDelete,
  onDownload,
  AssetImpactPanel,
  HistoryDeleteAction,
}: Props) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center">
        <h3 className="text-base font-semibold">还没有历史记录</h3>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 pb-4">
      {items.map((item) => (
        <HistoryDocumentListItem
          key={item.docId}
          item={item}
          currentDocId={currentDocId}
          currentHistory={currentHistory}
          promptProfile={promptProfile}
          promptSequence={promptSequence}
          promptOptions={promptOptions}
          promptWorkflows={promptWorkflows}
          busy={busy}
          cleanupDocId={cleanupDocId}
          impactPreview={impactPreview}
          impactLoadingKey={impactLoadingKey}
          makeDeleteActionKey={makeDeleteActionKey}
          itemsLength={items.length}
          onSelect={onSelect}
          onToggleCleanup={onToggleCleanup}
          onPreviewDelete={onPreviewDelete}
          onDelete={onDelete}
          onDownload={onDownload}
          AssetImpactPanel={AssetImpactPanel}
          HistoryDeleteAction={HistoryDeleteAction}
        />
      ))}
    </div>
  );
}
