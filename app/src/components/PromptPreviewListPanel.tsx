import { AlertCircle, FileText, Loader2, Plus, RefreshCw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import { cn } from "@/lib/utils";
import type { PromptId, PromptPreviewResponse } from "@/types/app";

type Item = PromptPreviewResponse["items"][number];

type Props = {
  items: Item[];
  activeItem: Item | null;
  busy: boolean;
  saving: boolean;
  createMode: boolean;
  error: string;
  localError: string;
  onCreateMode: () => void;
  onRefresh: () => void;
  onSelect: (promptId: PromptId) => void;
};

export function PromptPreviewListPanel({
  items,
  activeItem,
  busy,
  saving,
  createMode,
  error,
  localError,
  onCreateMode,
  onRefresh,
  onSelect,
}: Props) {
  return (
    <div className="min-h-[24rem] xl:h-full xl:min-h-0">
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-col gap-3 border-b border-border/70 bg-muted/20 pb-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-8"><FileText className="size-4" /></span>
            <div className="min-w-0">
              <div className="vercel-kicker mb-0.5">Prompt library</div>
              <CardTitle className="min-w-0 truncate text-lg">提示词</CardTitle>
            </div>
          </div>
          <Badge variant="outline" className="shrink-0">{items.length} 个</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={createMode ? "secondary" : "outline"} size="sm" className="min-w-0" onClick={onCreateMode} disabled={busy || saving}>
            <Plus data-icon="inline-start" />
            <span className="min-w-0 truncate">新建</span>
          </Button>
          <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={onRefresh} disabled={busy || saving}>
            {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            <span className="min-w-0 truncate">刷新</span>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5">
        {error || localError ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>读取失败</AlertTitle>
            <AlertDescription>{localError || error}</AlertDescription>
          </Alert>
        ) : null}

        {items.length ? (
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="flex flex-col gap-2">
              {items.map((item) => {
                const active = activeItem?.id === item.id;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant={active ? "secondary" : "outline"}
                    className={cn(
                      "relative h-auto w-full justify-start overflow-hidden rounded-md px-3 py-3 text-left before:absolute before:left-0 before:h-8 before:w-0.5 before:rounded-full before:bg-foreground before:opacity-0",
                      active && "border-foreground/25 bg-muted shadow-sm before:opacity-100",
                    )}
                    onClick={() => onSelect(item.id)}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center justify-between gap-3 pl-1">
                        <span className="truncate font-semibold">{item.label}</span>
                        <Badge variant={item.builtIn ? "outline" : "secondary"} className="shrink-0">{item.builtIn ? "内置" : "自定义"}</Badge>
                      </span>
                      <span className="truncate pl-1 font-mono text-[10px] font-medium text-muted-foreground">{item.fileName}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <Empty className="min-h-[18rem] flex-1 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <FileText />}
              </EmptyMedia>
              <EmptyTitle>{busy ? "正在读取提示词文件" : "暂无可预览的提示词"}</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
    </div>
  );
}
