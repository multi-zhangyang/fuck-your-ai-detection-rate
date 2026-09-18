import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ListFilter,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
} from "lucide-react";

import { RewriteDiff } from "@/components/core/RewriteDiff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupTextarea } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import type { CoreRun, ReviewChoice, RunParagraph } from "@/types/core";

type ParagraphFilter = "all" | "attention" | "complete";

interface Props {
  run: CoreRun;
  running: boolean;
  onRetry: (paragraphId: string) => Promise<void>;
  onSaveReview: (paragraphId: string, decision: ReviewChoice, text?: string) => Promise<void>;
  onPendingChange: (pending: boolean) => void;
}

function compactText(value: string, limit = 88): string {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) return "尚未完成";
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
}

function statusLabel(paragraph: RunParagraph): string {
  if (paragraph.complete) return "已完成";
  if (paragraph.status === "running") return "生成中";
  if (paragraph.status === "pending") return "等待中";
  return "未完成";
}

function needsAttention(paragraph: RunParagraph): boolean {
  return !paragraph.complete || Boolean(paragraph.warnings.length || paragraph.warningCheckError);
}

function paragraphPreview(run: CoreRun, paragraph: RunParagraph): string {
  if (paragraph.decision.decision === "manual" && paragraph.decision.text) return paragraph.decision.text;
  if (paragraph.complete && paragraph.rewrittenText) return paragraph.rewrittenText;
  const chunks = run.chunks
    .filter((chunk) => chunk.paragraphId === paragraph.paragraphId)
    .sort((left, right) => left.partIndex - right.partIndex);
  let partial = "";
  for (const [index, chunk] of chunks.entries()) {
    const value = chunk.finalText || chunk.streamText;
    if (!value) break;
    if (index) partial += chunk.joinerBefore || "";
    partial += value;
  }
  return partial || paragraph.partialText;
}

function filterLabel(filter: ParagraphFilter): string {
  if (filter === "attention") return "待处理";
  if (filter === "complete") return "已完成";
  return "全部段落";
}

export function ReviewWorkspace({
  run,
  running,
  onRetry,
  onSaveReview,
  onPendingChange,
}: Props) {
  const [activeParagraphId, setActiveParagraphId] = useState("");
  const [paragraphBrowserOpen, setParagraphBrowserOpen] = useState(false);
  const [filter, setFilter] = useState<ParagraphFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState("");

  useEffect(() => {
    const first = run.paragraphs.find((paragraph) => !paragraph.complete) || run.paragraphs[0];
    setActiveParagraphId(first?.paragraphId || "");
    setEditingId("");
    setDrafts({});
    setSavingIds(new Set());
  }, [run.id]);

  useEffect(() => {
    if (!run.paragraphs.some((paragraph) => paragraph.paragraphId === activeParagraphId)) {
      setActiveParagraphId(run.paragraphs[0]?.paragraphId || "");
    }
  }, [activeParagraphId, run.paragraphs]);

  const counts = useMemo(() => ({
    all: run.paragraphs.length,
    attention: run.paragraphs.filter(needsAttention).length,
    complete: run.paragraphs.filter((paragraph) => paragraph.complete).length,
  }), [run.paragraphs]);

  const visibleParagraphs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return run.paragraphs.filter((paragraph) => {
      if (filter === "attention" && !needsAttention(paragraph)) return false;
      if (filter === "complete" && !paragraph.complete) return false;
      if (!needle) return true;
      return [paragraph.originalText, paragraph.rewrittenText, paragraph.partialText]
        .some((text) => text.toLocaleLowerCase().includes(needle));
    });
  }, [filter, query, run.paragraphs]);

  const activeParagraph = run.paragraphs.find((paragraph) => paragraph.paragraphId === activeParagraphId)
    || run.paragraphs[0];
  const activeIndex = activeParagraph
    ? run.paragraphs.findIndex((paragraph) => paragraph.paragraphId === activeParagraph.paragraphId)
    : -1;
  const activeSequence = Math.max(1, activeIndex + 1);
  const activeText = activeParagraph ? paragraphPreview(run, activeParagraph) : "";
  const savedManualText = activeParagraph?.decision.decision === "manual" ? activeParagraph.decision.text : "";
  const manualDraft = activeParagraph
    ? drafts[activeParagraph.paragraphId] ?? (savedManualText || activeText)
    : "";
  const dirty = Boolean(activeParagraph && editingId === activeParagraph.paragraphId && manualDraft !== savedManualText);

  useEffect(() => {
    onPendingChange(savingIds.size > 0 || dirty);
  }, [dirty, onPendingChange, savingIds]);

  const chooseParagraph = (paragraphId: string, closeBrowser = false) => {
    setActiveParagraphId(paragraphId);
    if (closeBrowser) setParagraphBrowserOpen(false);
  };

  const moveParagraph = (offset: number) => {
    const next = run.paragraphs[activeIndex + offset];
    if (next) chooseParagraph(next.paragraphId);
  };

  const beginManualEdit = () => {
    if (!activeParagraph) return;
    setDrafts((current) => ({
      ...current,
      [activeParagraph.paragraphId]: current[activeParagraph.paragraphId] ?? activeText,
    }));
    setEditingId(activeParagraph.paragraphId);
  };

  const saveChoice = async (decision: ReviewChoice) => {
    if (!activeParagraph) return;
    const paragraphId = activeParagraph.paragraphId;
    setSavingIds((current) => new Set(current).add(paragraphId));
    try {
      await onSaveReview(paragraphId, decision);
      if (decision !== "manual") setEditingId("");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(paragraphId);
        return next;
      });
    }
  };

  const saveManual = async () => {
    if (!activeParagraph || !manualDraft.trim()) return;
    const paragraphId = activeParagraph.paragraphId;
    setSavingIds((current) => new Set(current).add(paragraphId));
    try {
      await onSaveReview(paragraphId, "manual", manualDraft);
      setEditingId("");
    } finally {
      setSavingIds((current) => {
        const next = new Set(current);
        next.delete(paragraphId);
        return next;
      });
    }
  };

  const retry = async () => {
    if (!activeParagraph) return;
    setRetryingId(activeParagraph.paragraphId);
    try {
      await onRetry(activeParagraph.paragraphId);
    } finally {
      setRetryingId("");
    }
  };

  const paragraphBrowser = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-4">
        <InputGroup className="min-w-0 flex-1">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索段落"
            aria-label="搜索段落"
          />
        </InputGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" aria-label={`筛选：${filterLabel(filter)}`}>
              <ListFilter />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as ParagraphFilter)}>
              <DropdownMenuRadioItem value="all">
                全部段落
                <DropdownMenuShortcut>{counts.all}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="attention">
                待处理
                <DropdownMenuShortcut>{counts.attention}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="complete">
                已完成
                <DropdownMenuShortcut>{counts.complete}</DropdownMenuShortcut>
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {visibleParagraphs.length ? (
          <ItemGroup className="gap-1 p-2">
            {visibleParagraphs.map((paragraph) => {
              const selected = paragraph.paragraphId === activeParagraph?.paragraphId;
              const sequence = run.paragraphs.findIndex((item) => item.paragraphId === paragraph.paragraphId) + 1;
              const hasWarning = paragraph.decision.decision !== "original"
                && Boolean(paragraph.warnings.length || paragraph.warningCheckError);
              return (
                <Item
                  key={paragraph.paragraphId}
                  asChild
                  size="sm"
                  variant={selected ? "muted" : "default"}
                  className="w-full flex-nowrap text-left"
                  data-review-nav={paragraph.paragraphId}
                  data-review-complete={paragraph.complete ? "true" : "false"}
                >
                  <button type="button" onClick={() => chooseParagraph(paragraph.paragraphId, true)}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full justify-between">
                        <span>第 {sequence} 段</span>
                        <span className="shrink-0 text-muted-foreground">{hasWarning ? "需核对" : statusLabel(paragraph)}</span>
                      </ItemTitle>
                      <ItemDescription>{compactText(paragraphPreview(run, paragraph) || paragraph.originalText)}</ItemDescription>
                    </ItemContent>
                  </button>
                </Item>
              );
            })}
          </ItemGroup>
        ) : (
          <div className="p-6 text-center text-sm text-muted-foreground">没有匹配的段落</div>
        )}
      </ScrollArea>
    </div>
  );

  if (!activeParagraph) return null;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-review-paragraph={activeParagraph.paragraphId}
      data-review-detail
    >
      <ScrollArea className="min-h-0 flex-1 bg-muted/40" data-review-scroll>
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-3 md:p-6">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 md:px-6">
              <CardTitle className="text-base">第 {activeSequence} 段</CardTitle>
              {activeParagraph.decision.decision !== "original"
                && (activeParagraph.warnings.length || activeParagraph.warningCheckError) ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={activeParagraph.warningCheckError ? "请核对" : `${activeParagraph.warnings.length} 项提醒`}
                    >
                      <AlertTriangle data-icon="inline-start" />
                      {activeParagraph.warningCheckError ? "请核对" : `${activeParagraph.warnings.length} 项提醒`}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-80">
                    <ItemGroup className="gap-1">
                      {activeParagraph.warnings.map((warning, index) => (
                        <Item key={`${warning.category}-${index}`} size="sm" variant="muted">
                          <ItemContent>
                            <ItemDescription className="line-clamp-none">{warning.message}</ItemDescription>
                          </ItemContent>
                        </Item>
                      ))}
                      {activeParagraph.warningCheckError ? (
                        <Item size="sm" variant="muted">
                          <ItemContent>
                            <ItemDescription className="line-clamp-none">请核对数字、引用、URL 和保护词。</ItemDescription>
                          </ItemContent>
                        </Item>
                      ) : null}
                    </ItemGroup>
                  </PopoverContent>
                </Popover>
              ) : null}
            </CardHeader>
            <Separator />

            <CardContent className="p-0">
              {editingId === activeParagraph.paragraphId ? (
                <div className="flex flex-col">
                  <section className="flex flex-col gap-4 p-5 md:p-8">
                    <Badge variant="outline" className="w-fit">原文</Badge>
                    <p className="whitespace-pre-wrap break-words text-base leading-8">
                      {activeParagraph.originalText}
                    </p>
                  </section>
                  <Separator />
                  <section className="flex flex-col gap-4 p-5 md:p-8">
                    <Badge variant="secondary" className="w-fit">手动稿</Badge>
                    <Field>
                      <FieldLabel className="sr-only" htmlFor={`manual-${activeParagraph.paragraphId}`}>手动编辑</FieldLabel>
                      <InputGroup>
                        <InputGroupTextarea
                          id={`manual-${activeParagraph.paragraphId}`}
                          className="min-h-72"
                          value={manualDraft}
                          onChange={(event) => setDrafts((current) => ({
                            ...current,
                            [activeParagraph.paragraphId]: event.target.value,
                          }))}
                        />
                      </InputGroup>
                    </Field>
                  </section>
                </div>
              ) : activeText ? (
                <RewriteDiff original={activeParagraph.originalText} rewritten={activeText} />
              ) : (
                <section className="flex flex-col gap-4 p-5 md:p-8">
                  <Badge variant="outline" className="w-fit">原文</Badge>
                  <p className="whitespace-pre-wrap break-words text-base leading-8">
                    {activeParagraph.originalText}
                  </p>
                  {activeParagraph.error ? (
                    <p className="text-sm text-muted-foreground">{activeParagraph.error}</p>
                  ) : null}
                </section>
              )}
            </CardContent>

            <Separator />
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 p-4 md:px-6">
              {editingId === activeParagraph.paragraphId ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setEditingId("")}>取消</Button>
                  <Button
                    size="sm"
                    disabled={!manualDraft.trim() || savingIds.has(activeParagraph.paragraphId)}
                    onClick={() => void saveManual()}
                  >
                    {savingIds.has(activeParagraph.paragraphId) ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
                    保存
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={running || retryingId === activeParagraph.paragraphId}
                      onClick={() => void retry()}
                    >
                      {retryingId === activeParagraph.paragraphId
                        ? <Spinner data-icon="inline-start" />
                        : <RefreshCw data-icon="inline-start" />}
                      重新改写
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={savingIds.has(activeParagraph.paragraphId)}
                      onClick={beginManualEdit}
                    >
                      <PencilLine data-icon="inline-start" />
                      手动编辑
                    </Button>
                  </div>

                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    value={activeParagraph.decision.decision === "manual" ? "" : activeParagraph.decision.decision}
                    disabled={savingIds.has(activeParagraph.paragraphId)}
                    aria-label="采用方式"
                    onValueChange={(value) => {
                      if (value) void saveChoice(value as ReviewChoice);
                    }}
                  >
                    <ToggleGroupItem value="rewrite" aria-label="采用改写" disabled={!activeParagraph.complete}>
                      {savingIds.has(activeParagraph.paragraphId) ? <Spinner /> : <Check />}
                      采用改写
                    </ToggleGroupItem>
                    <ToggleGroupItem value="original" aria-label="保留原文">
                      <RotateCcw />
                      保留原文
                    </ToggleGroupItem>
                  </ToggleGroup>
                </>
              )}
            </CardFooter>
          </Card>

          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  text="上一段"
                  aria-label="上一段"
                  aria-disabled={activeIndex <= 0}
                  className={cn(activeIndex <= 0 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    moveParagraph(-1);
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink
                  href="#"
                  size="default"
                  isActive
                  aria-label="选择段落"
                  onClick={(event) => {
                    event.preventDefault();
                    setParagraphBrowserOpen(true);
                  }}
                >
                  <Rows3 data-icon="inline-start" />
                  {activeSequence} / {run.paragraphs.length}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  text="下一段"
                  aria-label="下一段"
                  aria-disabled={activeIndex >= run.paragraphs.length - 1}
                  className={cn(activeIndex >= run.paragraphs.length - 1 && "pointer-events-none opacity-50")}
                  onClick={(event) => {
                    event.preventDefault();
                    moveParagraph(1);
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </ScrollArea>

      <Sheet open={paragraphBrowserOpen} onOpenChange={setParagraphBrowserOpen}>
        <SheetContent side="left" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetHeader className="shrink-0 p-4 pr-12">
            <SheetTitle>选择段落</SheetTitle>
          </SheetHeader>
          {paragraphBrowser}
        </SheetContent>
      </Sheet>
    </div>
  );
}
