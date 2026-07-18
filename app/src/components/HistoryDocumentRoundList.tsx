import type { ComponentType } from "react";

import { HistoryDocumentRoundCard } from "@/components/HistoryDocumentRoundCard";
import { HistoryDocumentRoundListEmpty } from "@/components/HistoryDocumentRoundListEmpty";
import type {
  HistoryDeleteActionComponent,
  HistoryImpactPreviewState,
} from "@/components/HistoryDocumentSharedTypes";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { isPromptSequenceCustomizable } from "@/lib/promptRegistry";
import { deriveHistoryDocumentRoundState } from "@/lib/historyDocumentListViewModel";
import type {
  DeleteHistoryOptions,
  HistoryDeleteImpact,
  HistoryDocumentSummary,
  HistoryExportSelection,
  HistoryRound,
  PromptId,
  PromptOption,
  PromptWorkflow,
} from "@/types/app";

export function HistoryDocumentRoundList({
  item,
  activeRounds,
  visibleRounds,
  shouldShowRounds,
  cleanupOpen,
  busy,
  impactPreview,
  impactLoadingKey,
  promptSequence,
  promptOptions,
  promptWorkflows,
  makeDeleteActionKey,
  onPreviewDelete,
  onDelete,
  onDownload,
  AssetImpactPanel,
  HistoryDeleteAction,
}: {
  item: HistoryDocumentSummary;
  activeRounds: HistoryDocumentSummary["rounds"];
  visibleRounds: HistoryDocumentSummary["rounds"];
  shouldShowRounds: boolean;
  cleanupOpen: boolean;
  busy: boolean;
  impactPreview: HistoryImpactPreviewState;
  impactLoadingKey: string;
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows?: PromptWorkflow[];
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  onDownload: (item: HistoryExportSelection, format: "txt" | "docx") => void;
  AssetImpactPanel: ComponentType<{ impact: HistoryDeleteImpact }>;
  HistoryDeleteAction: HistoryDeleteActionComponent;
}) {
  if (!shouldShowRounds) {
    return null;
  }
  if (!visibleRounds.length) {
    return <HistoryDocumentRoundListEmpty />;
  }

  return (
    <>
      <Separator className="my-4" />
      {!activeRounds.length ? (
        <Badge variant="outline" className="mb-3 w-fit">其他模式</Badge>
      ) : null}
      <div className="grid gap-2">
        {visibleRounds.map((roundItem) => {
          const roundView = deriveHistoryDocumentRoundState({
            item,
            roundItem,
            promptSequence,
            promptOptions,
            promptWorkflows,
            impactPreview,
            makeDeleteActionKey,
            sequenceCustomizable: isPromptSequenceCustomizable(roundItem.promptProfile || "cn", promptWorkflows),
          });
          return (
            <HistoryDocumentRoundCard
              key={roundView.roundKey}
              item={item}
              roundItem={roundItem}
              busy={busy}
              cleanupOpen={cleanupOpen}
              impactLoadingKey={impactLoadingKey}
              makeDeleteActionKey={makeDeleteActionKey}
              roundDeleteActions={roundView.roundDeleteActions}
              roundImpactPreview={roundView.roundImpactPreview}
              roundKey={roundView.roundKey}
              hasMissingAssets={roundView.hasMissingAssets}
              outputPathText={roundView.outputPathText}
              sequenceLabel={roundView.sequenceLabel}
              profileLabel={roundView.profileLabel}
              timestampText={roundView.timestampText}
              onPreviewDelete={onPreviewDelete}
              onDelete={onDelete}
              onDownload={onDownload}
              AssetImpactPanel={AssetImpactPanel}
              HistoryDeleteAction={HistoryDeleteAction}
            />
          );
        })}
      </div>
    </>
  );
}
