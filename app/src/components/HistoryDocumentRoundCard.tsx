import type { ComponentType } from "react";

import { HistoryDocumentRoundHeader } from "@/components/HistoryDocumentRoundHeader";
import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  HistoryRound,
} from "@/types/app";

type DeleteActionComponent = ComponentType<{
  title: string;
  options: DeleteHistoryOptions;
  docId: string;
  busy: boolean;
  loading: boolean;
  destructive?: boolean;
  onPreview: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options: DeleteHistoryOptions) => void;
}>;

export function HistoryDocumentRoundCard({
  item,
  roundItem,
  busy,
  cleanupOpen,
  impactLoadingKey,
  makeDeleteActionKey,
  roundDeleteActions,
  roundImpactPreview,
  roundKey,
  hasMissingAssets,
  outputPathText,
  sequenceLabel,
  profileLabel,
  timestampText,
  onPreviewDelete,
  onDelete,
  onDownload,
  AssetImpactPanel,
  HistoryDeleteAction,
}: {
  item: HistoryDocumentSummary;
  roundItem: HistoryRound;
  busy: boolean;
  cleanupOpen: boolean;
  impactLoadingKey: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  roundDeleteActions: Array<{
    title: string;
    options: DeleteHistoryOptions;
    destructive?: boolean;
  }>;
  roundImpactPreview: HistoryDeleteImpact | null;
  roundKey: string;
  hasMissingAssets: boolean;
  outputPathText: string;
  sequenceLabel: string | null;
  profileLabel: string;
  timestampText: string;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  AssetImpactPanel: ComponentType<{ impact: HistoryDeleteImpact }>;
  HistoryDeleteAction: DeleteActionComponent;
}) {
  return (
    <div key={roundKey} className="rounded-lg border border-border bg-muted/20 p-3">
      <HistoryDocumentRoundHeader
        roundItem={roundItem}
        busy={busy}
        hasMissingAssets={hasMissingAssets}
        outputPathText={outputPathText}
        sequenceLabel={sequenceLabel}
        profileLabel={profileLabel}
        timestampText={timestampText}
        onDownload={(selectedRound, format) => onDownload({
          docId: item.docId,
          sourcePath: item.sourcePath,
          round: selectedRound.round,
          outputPath: selectedRound.outputPath,
        }, format)}
      />
      {cleanupOpen ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {roundDeleteActions.map((action) => {
            const actionKey = makeDeleteActionKey(item.docId, action.options);
            return (
              <HistoryDeleteAction
                key={actionKey}
                title={action.title}
                options={action.options}
                docId={item.docId}
                busy={busy}
                loading={impactLoadingKey === actionKey}
                destructive={action.destructive}
                onPreview={onPreviewDelete}
                onDelete={onDelete}
              />
            );
          })}
        </div>
      ) : null}
      {roundImpactPreview ? <div className="mt-4"><AssetImpactPanel impact={roundImpactPreview} /></div> : null}
    </div>
  );
}
