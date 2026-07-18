import type { ComponentType } from "react";

import type {
  DeleteHistoryOptions,
  HistoryDocumentSummary,
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

export function HistoryDocumentCleanupActions({
  item,
  documentDeleteActions,
  busy,
  impactLoadingKey,
  makeDeleteActionKey,
  onPreviewDelete,
  onDelete,
  HistoryDeleteAction,
}: {
  item: HistoryDocumentSummary;
  documentDeleteActions: Array<{
    title: string;
    options: DeleteHistoryOptions;
    destructive?: boolean;
  }>;
  busy: boolean;
  impactLoadingKey: string;
  makeDeleteActionKey: (docId: string, options?: DeleteHistoryOptions) => string;
  onPreviewDelete: (docId: string, options: DeleteHistoryOptions) => void;
  onDelete: (docId: string, options?: DeleteHistoryOptions) => void;
  HistoryDeleteAction: DeleteActionComponent;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-2 xl:grid-cols-4">
      {documentDeleteActions.map((action) => {
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
  );
}
