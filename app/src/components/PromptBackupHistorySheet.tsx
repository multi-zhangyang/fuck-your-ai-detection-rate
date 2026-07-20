import { AlertCircle, ArchiveRestore, FileClock, Loader2, RefreshCw } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatBytes, formatDateTime } from "@/lib/formatters";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import type { PromptBackupItem, PromptPreviewItem } from "@/types/app";

export function PromptBackupHistorySheet({
  open,
  prompt,
  items,
  loading,
  error,
  restoringPath,
  onOpenChange,
  onReload,
  onRestore,
}: {
  open: boolean;
  prompt: PromptPreviewItem | null;
  items: PromptBackupItem[] | null;
  loading: boolean;
  error: string;
  restoringPath: string;
  onOpenChange: (open: boolean) => void;
  onReload: () => void;
  onRestore: (item: PromptBackupItem) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(92vw,34rem)] gap-0 p-0 sm:max-w-[34rem]">
        <SheetHeader className="shrink-0 border-b px-5 py-5 pr-14 text-left">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary"><FileClock className="mr-1 size-3" />历史版本</Badge>
                {items ? <Badge variant="outline">{items.length} 份</Badge> : null}
              </div>
              <SheetTitle className="truncate">{prompt?.label ?? "提示词历史版本"}</SheetTitle>
              <SheetDescription className="mt-1">
                每次覆盖或恢复前生成的备份，可展开核对正文后恢复。
              </SheetDescription>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-9 shrink-0"
                  aria-label="刷新历史版本"
                  onClick={onReload}
                  disabled={!prompt || loading || Boolean(restoringPath)}
                >
                  {loading ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <RefreshCw />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>刷新历史版本</TooltipContent>
            </Tooltip>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          {error ? (
            <Alert variant="destructive" className="mb-3" aria-live="polite">
              <AlertCircle />
              <AlertTitle>历史版本操作失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading && !items ? (
            <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className={LOADING_ICON_CLASS_NAME} />
              正在读取历史版本
            </div>
          ) : items?.length ? (
            <ScrollArea className="h-full pr-2">
              <Accordion type="single" collapsible className="overflow-hidden rounded-md border bg-card">
                {items.map((item, index) => {
                  const restoring = restoringPath === item.relativePath;
                  const lineCount = item.content ? item.content.split(/\r?\n/).length : 0;
                  return (
                    <AccordionItem key={item.relativePath} value={item.relativePath} className="px-3 last:border-b-0">
                      <AccordionTrigger className="gap-3 py-3 text-left hover:no-underline">
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{formatDateTime(item.createdAt)}</span>
                            {index === 0 ? <Badge variant="secondary">最新</Badge> : null}
                          </span>
                          <span className="truncate font-mono text-[11px] text-muted-foreground" title={item.fileName}>
                            {formatBytes(item.sizeBytes)} · {lineCount} 行 · {item.fileName}
                          </span>
                        </span>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/35 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
                          {item.content || "（此备份没有正文）"}
                        </pre>
                        <div className="mt-3 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onRestore(item)}
                            disabled={Boolean(restoringPath)}
                          >
                            {restoring ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <ArchiveRestore data-icon="inline-start" />}
                            {restoring ? "正在恢复" : "恢复此版本"}
                          </Button>
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            </ScrollArea>
          ) : items ? (
            <Empty className="h-full min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                <EmptyTitle>暂无历史版本</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Empty className="h-full min-h-48 border">
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileClock /></EmptyMedia>
                <EmptyTitle>打开后读取历史版本</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
