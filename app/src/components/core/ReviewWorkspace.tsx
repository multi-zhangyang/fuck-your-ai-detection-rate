import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Columns2,
  Highlighter,
  PencilLine,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
} from "lucide-react";

import { RewriteDiff, type DiffMode } from "@/components/core/RewriteDiff";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CoreRun, ReviewChoice, RunParagraph } from "@/types/core";

type ParagraphFilter = "all" | "warnings";

export interface ReviewWarningFocusRequest {
  revision: number;
  paragraphIds: string[];
}

interface Props {
  run: CoreRun;
  running: boolean;
  onRetry: (paragraphId: string) => Promise<void>;
  onSaveReview: (paragraphId: string, decision: ReviewChoice, text?: string) => Promise<void>;
  onPendingChange: (pending: boolean) => void;
  warningFocusRequest?: ReviewWarningFocusRequest | null;
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

function hasWarning(paragraph: RunParagraph): boolean {
  return paragraph.decision.decision !== "original"
    && Boolean(paragraph.warnings.length || paragraph.warningCheckError);
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

export function ReviewWorkspace({
  run,
  running,
  onRetry,
  onSaveReview,
  onPendingChange,
  warningFocusRequest,
}: Props) {
  const [activeParagraphId, setActiveParagraphId] = useState("");
  const [paragraphBrowserOpen, setParagraphBrowserOpen] = useState(false);
  const [filter, setFilter] = useState<ParagraphFilter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [retryingId, setRetryingId] = useState("");
  const [diffMode, setDiffMode] = useState<DiffMode>("compare");

  useEffect(() => {
    const first = run.paragraphs.find((paragraph) => !paragraph.complete) || run.paragraphs[0];
    setActiveParagraphId(first?.paragraphId || "");
    setEditingId("");
    setDrafts({});
    setSavingIds(new Set());
    setDiffMode("compare");
  }, [run.id]);

  useEffect(() => {
    if (!run.paragraphs.some((paragraph) => paragraph.paragraphId === activeParagraphId)) {
      setActiveParagraphId(run.paragraphs[0]?.paragraphId || "");
    }
  }, [activeParagraphId, run.paragraphs]);

  const counts = useMemo(() => ({
    all: run.paragraphs.length,
    warnings: run.paragraphs.filter(hasWarning).length,
  }), [run.paragraphs]);

  const visibleParagraphs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return run.paragraphs.filter((paragraph) => {
      if (filter === "warnings" && !hasWarning(paragraph)) return false;
      if (!needle) return true;
      return [paragraph.originalText, paragraph.rewrittenText, paragraph.partialText]
        .some((text) => text.toLocaleLowerCase().includes(needle));
    });
  }, [filter, query, run.paragraphs]);

  const selectedActiveParagraph = run.paragraphs.find(
    (paragraph) => paragraph.paragraphId === activeParagraphId,
  );
  const activeParagraph = visibleParagraphs.find(
    (paragraph) => paragraph.paragraphId === activeParagraphId,
  ) || visibleParagraphs[0] || selectedActiveParagraph || run.paragraphs[0];
  const activeIndex = activeParagraph
    ? run.paragraphs.findIndex((paragraph) => paragraph.paragraphId === activeParagraph.paragraphId)
    : -1;
  const activeSequence = Math.max(1, activeIndex + 1);
  const navigationIndex = activeParagraph
    ? visibleParagraphs.findIndex((paragraph) => paragraph.paragraphId === activeParagraph.paragraphId)
    : -1;
  const navigationPosition = navigationIndex >= 0 ? navigationIndex + 1 : 0;
  const activeText = activeParagraph ? paragraphPreview(run, activeParagraph) : "";
  const savedManualText = activeParagraph?.decision.decision === "manual" ? activeParagraph.decision.text : "";
  const manualDraft = activeParagraph
    ? drafts[activeParagraph.paragraphId] ?? (savedManualText || activeText)
    : "";
  const dirty = Boolean(activeParagraph && editingId === activeParagraph.paragraphId && manualDraft !== savedManualText);

  useEffect(() => {
    onPendingChange(savingIds.size > 0 || dirty);
  }, [dirty, onPendingChange, savingIds]);

  useEffect(() => {
    if (filter === "warnings" && counts.warnings === 0) {
      setFilter("all");
      return;
    }
    if (
      visibleParagraphs.length
      && !visibleParagraphs.some((paragraph) => paragraph.paragraphId === activeParagraphId)
    ) {
      setActiveParagraphId(visibleParagraphs[0].paragraphId);
      setEditingId("");
    }
  }, [activeParagraphId, counts.warnings, filter, visibleParagraphs]);

  useEffect(() => {
    if (!warningFocusRequest) return;
    const requestedIds = new Set(warningFocusRequest.paragraphIds);
    const first = run.paragraphs.find((paragraph) => (
      hasWarning(paragraph)
      && (!requestedIds.size || requestedIds.has(paragraph.paragraphId))
    ));
    setQuery("");
    setParagraphBrowserOpen(false);
    if (first) {
      setFilter("warnings");
      setActiveParagraphId(first.paragraphId);
    } else {
      setFilter("all");
    }
  }, [warningFocusRequest?.revision]);

  const selectFilter = (value: string) => {
    if (!value) return;
    const next = value as ParagraphFilter;
    setFilter(next);
    if (next === "warnings") {
      const first = run.paragraphs.find(hasWarning);
      if (first) setActiveParagraphId(first.paragraphId);
    }
  };

  const chooseParagraph = (paragraphId: string, closeBrowser = false) => {
    setActiveParagraphId(paragraphId);
    if (closeBrowser) setParagraphBrowserOpen(false);
  };

  const moveParagraph = (offset: number) => {
    const next = visibleParagraphs[navigationIndex + offset];
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
      <div className="flex shrink-0 flex-col gap-2 px-4 pb-4">
        <InputGroup className="min-w-0 flex-1">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索段落"
            aria-label="搜索段落"
          />
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={selectFilter}
          className="w-full"
          data-testid="review-browser-filter"
          aria-label="筛选审阅段落"
        >
          <ToggleGroupItem value="all" className="flex-1">全部 {counts.all}</ToggleGroupItem>
          <ToggleGroupItem value="warnings" className="flex-1" disabled={!counts.warnings}>
            有提醒 {counts.warnings}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {visibleParagraphs.length ? (
          <ItemGroup className="gap-1 p-2">
            {visibleParagraphs.map((paragraph) => {
              const selected = paragraph.paragraphId === activeParagraph?.paragraphId;
              const sequence = run.paragraphs.findIndex((item) => item.paragraphId === paragraph.paragraphId) + 1;
              const paragraphHasWarning = hasWarning(paragraph);
              return (
                <Item
                  key={paragraph.paragraphId}
                  asChild
                  size="sm"
                  variant={selected ? "muted" : "default"}
                  className="w-full flex-nowrap text-left"
                  data-review-nav={paragraph.paragraphId}
                  data-review-complete={paragraph.complete ? "true" : "false"}
                  data-review-warning={paragraphHasWarning ? "true" : "false"}
                >
                  <button type="button" onClick={() => chooseParagraph(paragraph.paragraphId, true)}>
                    <ItemContent className="min-w-0">
                      <ItemTitle className="w-full justify-between">
                        <span>第 {sequence} 段</span>
                        <span className="shrink-0 text-muted-foreground">{paragraphHasWarning ? "需核对" : statusLabel(paragraph)}</span>
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
      className="flex h-full min-h-0 flex-col bg-muted/40 p-2 md:p-4"
      data-review-paragraph={activeParagraph.paragraphId}
      data-review-detail
    >
      <div className="mx-auto flex h-full min-h-0 w-full max-w-screen-2xl flex-col gap-3">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-3 p-3 md:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CardTitle className="text-base">第 {activeSequence} 段</CardTitle>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={filter}
                onValueChange={selectFilter}
                data-testid="review-warning-filter"
                aria-label="筛选审阅段落"
              >
                <ToggleGroupItem value="all" data-testid="review-filter-all">全部</ToggleGroupItem>
                <ToggleGroupItem
                  value="warnings"
                  disabled={!counts.warnings}
                  data-testid="review-filter-warnings"
                >
                  <AlertTriangle />
                  有提醒 {counts.warnings}
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <div className="flex items-center gap-2">
              {activeText && editingId !== activeParagraph.paragraphId ? (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  value={diffMode}
                  aria-label="审阅视图"
                  onValueChange={(value) => value && setDiffMode(value as DiffMode)}
                >
                  <ToggleGroupItem value="compare" aria-label="对照">
                    <Columns2 />
                    对照
                  </ToggleGroupItem>
                  <ToggleGroupItem value="changes" aria-label="差异">
                    <Highlighter />
                    差异
                  </ToggleGroupItem>
                </ToggleGroup>
              ) : null}
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
            </div>
          </CardHeader>
          <Separator />

          <CardContent className="min-h-0 flex-1 p-0" data-review-scroll>
            {editingId === activeParagraph.paragraphId ? (
              <div className="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:grid-rows-1">
                <section className="flex min-h-0 flex-col">
                  <Item size="sm" className="shrink-0 rounded-none px-5">
                    <ItemContent><ItemTitle>原文</ItemTitle></ItemContent>
                  </Item>
                  <Separator />
                  <ScrollArea className="min-h-0 flex-1">
                    <p className="whitespace-pre-wrap break-words p-5 text-base leading-8 md:p-7">
                      {activeParagraph.originalText}
                    </p>
                  </ScrollArea>
                </section>
                <Separator className="lg:hidden" />
                <Separator orientation="vertical" className="hidden h-auto lg:block" />
                <section className="flex min-h-0 flex-col">
                  <Item size="sm" className="shrink-0 rounded-none px-5">
                    <ItemContent><ItemTitle>编辑</ItemTitle></ItemContent>
                  </Item>
                  <Separator />
                  <div className="min-h-0 flex-1 p-3 md:p-5">
                    <Field className="h-full min-h-0">
                      <FieldLabel className="sr-only" htmlFor={`manual-${activeParagraph.paragraphId}`}>手动编辑</FieldLabel>
                      <Textarea
                        id={`manual-${activeParagraph.paragraphId}`}
                        className="h-full min-h-[16rem] resize-none"
                        value={manualDraft}
                        onChange={(event) => setDrafts((current) => ({
                          ...current,
                          [activeParagraph.paragraphId]: event.target.value,
                        }))}
                      />
                    </Field>
                  </div>
                </section>
              </div>
            ) : activeText ? (
              <RewriteDiff original={activeParagraph.originalText} rewritten={activeText} mode={diffMode} />
            ) : (
              <ScrollArea className="h-full">
                <section className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5 md:p-8">
                  <Item size="sm" className="rounded-none px-0">
                    <ItemContent><ItemTitle>原文</ItemTitle></ItemContent>
                  </Item>
                  <p className="whitespace-pre-wrap break-words text-base leading-8">
                    {activeParagraph.originalText}
                  </p>
                  {activeParagraph.error ? (
                    <p className="text-sm text-muted-foreground">{activeParagraph.error}</p>
                  ) : null}
                </section>
              </ScrollArea>
            )}
          </CardContent>

          <Separator />
          <CardFooter className="flex shrink-0 flex-wrap items-center justify-between gap-3 p-3 md:px-5">
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

        <Pagination className="shrink-0">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text="上一段"
                aria-label="上一段"
                aria-disabled={navigationIndex <= 0}
                className={cn(navigationIndex <= 0 && "pointer-events-none opacity-50")}
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
                data-testid="review-pagination-status"
                onClick={(event) => {
                  event.preventDefault();
                  setParagraphBrowserOpen(true);
                }}
              >
                <Rows3 data-icon="inline-start" />
                {navigationPosition} / {visibleParagraphs.length}
              </PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                href="#"
                text="下一段"
                aria-label="下一段"
                aria-disabled={navigationIndex < 0 || navigationIndex >= visibleParagraphs.length - 1}
                className={cn(
                  (navigationIndex < 0 || navigationIndex >= visibleParagraphs.length - 1)
                  && "pointer-events-none opacity-50",
                )}
                onClick={(event) => {
                  event.preventDefault();
                  moveParagraph(1);
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

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
