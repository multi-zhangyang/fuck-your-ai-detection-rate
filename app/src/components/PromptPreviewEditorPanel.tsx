import { Card } from "@/components/ui/card";
import { PromptPreviewActiveEditor } from "@/components/PromptPreviewActiveEditor";
import { PromptPreviewCreateEditor } from "@/components/PromptPreviewCreateEditor";
import { PromptPreviewEditorEmpty } from "@/components/PromptPreviewEditorEmpty";
import type { PromptPreviewResponse } from "@/types/app";

type Item = PromptPreviewResponse["items"][number];

type Props = {
  createMode: boolean;
  activeItem: Item | null;
  busy: boolean;
  saving: boolean;
  editable: boolean;
  dirty: boolean;
  metaDirty: boolean;
  contentLineCount: number;
  draftContent: string;
  draftLabel: string;
  draftDescription: string;
  newLabel: string;
  newDescription: string;
  newContent: string;
  error: string;
  onCancelCreate: () => void;
  onCreate: () => void;
  onSave: () => void;
  onRestoreDefault: () => void;
  onDelete: () => void;
  onResetDraftContent: () => void;
  onDraftContentChange: (value: string) => void;
  onDraftLabelChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
  onNewLabelChange: (value: string) => void;
  onNewDescriptionChange: (value: string) => void;
  onNewContentChange: (value: string) => void;
};

export function PromptPreviewEditorPanel({
  createMode,
  activeItem,
  busy,
  saving,
  editable,
  dirty,
  metaDirty,
  contentLineCount,
  draftContent,
  draftLabel,
  draftDescription,
  newLabel,
  newDescription,
  newContent,
  error,
  onCancelCreate,
  onCreate,
  onSave,
  onRestoreDefault,
  onDelete,
  onResetDraftContent,
  onDraftContentChange,
  onDraftLabelChange,
  onDraftDescriptionChange,
  onNewLabelChange,
  onNewDescriptionChange,
  onNewContentChange,
}: Props) {
  return (
    <div className="min-h-[42rem] xl:h-full xl:min-h-0">
    <Card className="h-full min-h-0 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col">
      {createMode ? (
        <PromptPreviewCreateEditor
          contentLineCount={contentLineCount}
          saving={saving}
          newLabel={newLabel}
          newDescription={newDescription}
          newContent={newContent}
          onCancelCreate={onCancelCreate}
          onCreate={onCreate}
          onNewLabelChange={onNewLabelChange}
          onNewDescriptionChange={onNewDescriptionChange}
          onNewContentChange={onNewContentChange}
        />
      ) : activeItem ? (
        <PromptPreviewActiveEditor
          activeItem={activeItem}
          contentLineCount={contentLineCount}
          saving={saving}
          editable={editable}
          dirty={dirty}
          metaDirty={metaDirty}
          draftContent={draftContent}
          draftLabel={draftLabel}
          draftDescription={draftDescription}
          onResetDraftContent={onResetDraftContent}
          onRestoreDefault={onRestoreDefault}
          onDelete={onDelete}
          onSave={onSave}
          onDraftContentChange={onDraftContentChange}
          onDraftLabelChange={onDraftLabelChange}
          onDraftDescriptionChange={onDraftDescriptionChange}
        />
      ) : (
        <PromptPreviewEditorEmpty busy={busy} error={error} />
      )}
      </div>
    </Card>
    </div>
  );
}
