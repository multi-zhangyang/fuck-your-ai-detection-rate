import { useId } from "react";
import { FileClock, FileCode2, Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDateTime } from "@/lib/formatters";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type { PromptPreviewResponse } from "@/types/app";

type Item = PromptPreviewResponse["items"][number];

export function PromptPreviewActiveEditor({
  activeItem,
  contentLineCount,
  saving,
  editable,
  dirty,
  metaDirty,
  draftContent,
  draftLabel,
  draftDescription,
  onResetDraftContent,
  onOpenHistory,
  onRestoreDefault,
  onDelete,
  onSave,
  onDraftContentChange,
  onDraftLabelChange,
  onDraftDescriptionChange,
}: {
  activeItem: Item;
  contentLineCount: number;
  saving: boolean;
  editable: boolean;
  dirty: boolean;
  metaDirty: boolean;
  draftContent: string;
  draftLabel: string;
  draftDescription: string;
  onResetDraftContent: () => void;
  onOpenHistory: () => void;
  onRestoreDefault: () => void;
  onDelete: () => void;
  onSave: () => void;
  onDraftContentChange: (value: string) => void;
  onDraftLabelChange: (value: string) => void;
  onDraftDescriptionChange: (value: string) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  const contentId = useId();

  return (
    <>
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="vercel-icon-frame size-10"><FileCode2 className="size-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{activeItem.fileName}</Badge>
                <Badge variant="outline">{formatBytes(activeItem.sizeBytes)}</Badge>
                <Badge variant={editable ? "secondary" : "outline"}>{editable ? "可编辑" : "锁定"}</Badge>
                {dirty || metaDirty ? <Badge variant="warning" className="gap-1.5"><span className="size-1.5 rounded-full bg-current" />未保存</Badge> : null}
              </div>
              <CardTitle className="mt-2 text-xl">{activeItem.label}</CardTitle>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
              <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={onOpenHistory} disabled={saving}>
                <FileClock data-icon="inline-start" />
                <span className="min-w-0 truncate">版本</span>
              </Button>
              <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={onResetDraftContent} disabled={saving || !dirty}>
                <span className="min-w-0 truncate">还原</span>
              </Button>
              {activeItem.builtIn ? (
                <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={onRestoreDefault} disabled={saving || !activeItem.defaultAvailable}>
                  <RefreshCw data-icon="inline-start" />
                  <span className="min-w-0 truncate">默认</span>
                </Button>
              ) : (
                <Button type="button" variant="destructive" size="sm" className="min-w-0" onClick={onDelete} disabled={saving}>
                  <Trash2 data-icon="inline-start" />
                  <span className="min-w-0 truncate">删除</span>
                </Button>
              )}
              <Button type="button" size="sm" className="min-w-0 sm:min-w-24" onClick={onSave} disabled={saving || !editable || (!dirty && !metaDirty)}>
                {saving ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                <span className="min-w-0 truncate">保存</span>
              </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">基本信息</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">用于在提示词列表和工作流中识别此策略</div>
          </div>
          <Badge variant="outline">更新于 {formatDateTime(activeItem.updatedAt)}</Badge>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={labelId}>名称</FieldLabel>
            <Input id={labelId} value={draftLabel} onChange={(event) => onDraftLabelChange(event.target.value)} disabled={saving} />
          </Field>
          <Field>
            <FieldLabel htmlFor={descriptionId}>备注</FieldLabel>
            <Input id={descriptionId} value={draftDescription} onChange={(event) => onDraftDescriptionChange(event.target.value)} disabled={saving} />
          </Field>
        </FieldGroup>
        <Field className="min-h-0 flex-1 gap-0 overflow-hidden rounded-md">
          <FieldLabel htmlFor={contentId} className="sr-only">提示词正文</FieldLabel>
          <div className="flex h-9 shrink-0 items-center justify-between gap-3 rounded-t-md border border-b-0 border-input bg-muted/55 px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground"><FileCode2 className="size-3.5" />提示词正文</span>
            <span className="font-mono">{contentLineCount} 行 · {draftContent.length.toLocaleString()} 字符</span>
          </div>
          <Textarea
            id={contentId}
            value={draftContent}
            onChange={(event) => onDraftContentChange(event.target.value)}
            disabled={saving || !editable}
            className="min-h-0 flex-1 resize-none rounded-t-none border bg-card/55 px-4 py-3 font-mono text-[12px] leading-6"
          />
        </Field>
      </CardContent>
    </>
  );
}
