import { useId } from "react";
import { FileCode2, Loader2, Plus, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";

export function PromptPreviewCreateEditor({
  contentLineCount,
  saving,
  newLabel,
  newDescription,
  newContent,
  onCancelCreate,
  onCreate,
  onNewLabelChange,
  onNewDescriptionChange,
  onNewContentChange,
}: {
  contentLineCount: number;
  saving: boolean;
  newLabel: string;
  newDescription: string;
  newContent: string;
  onCancelCreate: () => void;
  onCreate: () => void;
  onNewLabelChange: (value: string) => void;
  onNewDescriptionChange: (value: string) => void;
  onNewContentChange: (value: string) => void;
}) {
  const labelId = useId();
  const descriptionId = useId();
  const contentId = useId();

  return (
    <>
      <CardHeader className="border-b border-border/70 bg-muted/20 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="vercel-icon-frame size-10"><Plus className="size-5" /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">自定义</Badge>
                <Badge variant="outline">新草稿</Badge>
              </div>
              <CardTitle className="mt-2 text-xl">新建提示词</CardTitle>
            </div>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
            <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={onCancelCreate} disabled={saving}>
              <span className="min-w-0 truncate">取消</span>
            </Button>
            <Button type="button" size="sm" className="min-w-0" onClick={onCreate} disabled={saving || !newContent.trim()}>
              {saving ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              <span className="min-w-0 truncate">保存</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5 pt-4">
        <div>
          <div className="text-sm font-semibold">基本信息</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">创建后即可加入首页的多轮改写流程</div>
        </div>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={labelId}>名称</FieldLabel>
            <Input id={labelId} value={newLabel} onChange={(event) => onNewLabelChange(event.target.value)} disabled={saving} placeholder="自定义提示词" />
          </Field>
          <Field>
            <FieldLabel htmlFor={descriptionId}>备注</FieldLabel>
            <Input id={descriptionId} value={newDescription} onChange={(event) => onNewDescriptionChange(event.target.value)} disabled={saving} placeholder="用途或风格" />
          </Field>
        </FieldGroup>
        <Field className="min-h-0 flex-1 gap-0 overflow-hidden rounded-md">
          <FieldLabel htmlFor={contentId} className="sr-only">提示词正文</FieldLabel>
          <div className="flex h-9 shrink-0 items-center justify-between gap-3 rounded-t-md border border-b-0 border-input bg-muted/55 px-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2 font-medium text-foreground"><FileCode2 className="size-3.5" />提示词正文</span>
            <span className="font-mono">{contentLineCount} 行 · {newContent.length.toLocaleString()} 字符</span>
          </div>
          <Textarea
            id={contentId}
            value={newContent}
            onChange={(event) => onNewContentChange(event.target.value)}
            disabled={saving}
            className="min-h-0 flex-1 resize-none rounded-t-none border bg-card/55 px-4 py-3 font-mono text-[12px] leading-6"
            placeholder="写入完整 prompt 内容"
          />
        </Field>
      </CardContent>
    </>
  );
}
