import { FileText, Loader2 } from "lucide-react";

import { CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";

export function PromptPreviewEditorEmpty({
  busy,
  error,
}: {
  busy: boolean;
  error: string;
}) {
  return (
    <CardContent className="flex h-full min-h-0 p-5">
      <Empty className="vercel-empty-state min-h-[24rem] flex-1 border border-border/70">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <FileText />}
          </EmptyMedia>
          <EmptyTitle>{busy ? "正在读取提示词内容" : error ? "提示词读取失败" : "选择左侧提示词后查看内容"}</EmptyTitle>
          {!busy && !error ? <EmptyDescription>你可以编辑内置策略，或创建自己的改写提示词。</EmptyDescription> : null}
        </EmptyHeader>
      </Empty>
    </CardContent>
  );
}
