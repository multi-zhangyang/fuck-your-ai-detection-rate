import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Download,
  FileText,
  FolderClock,
  FolderOpen,
  ListFilter,
  Play,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";

import { useAppNotifications } from "@/components/AppNotifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useIsMobile } from "@/hooks/use-mobile";
import { ApiError, coreService } from "@/lib/coreService";
import type { CoreDocument, CoreRun, RecentDocument, WarningSummary } from "@/types/core";

interface Props {
  activeDocument: CoreDocument | null;
  activeRun: CoreRun | null;
  onOpen: (document: CoreDocument, run: CoreRun | null) => void;
  onDeleted: (documentId: string) => void;
}

type RecentFilter = "all" | "resume" | "completed";

function formatDate(value: string): string {
  if (!value) return "未知时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function runStatusLabel(status: RecentDocument["latestRunStatus"]): string {
  const labels: Record<string, string> = {
    queued: "准备中",
    running: "正在改写",
    cancelling: "正在停止",
    paused: "等待继续",
    cancelled: "已停止",
    completed: "改写完成",
  };
  return labels[status || ""] || "未开始";
}

export function RecentDocumentsPage({ activeDocument, activeRun, onOpen, onDeleted }: Props) {
  const isMobile = useIsMobile();
  const { notify } = useAppNotifications();
  const [items, setItems] = useState<RecentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [activeId, setActiveId] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecentFilter>("all");
  const [mobilePane, setMobilePane] = useState<"documents" | "details">("documents");
  const [deleteTarget, setDeleteTarget] = useState<RecentDocument | null>(null);
  const [warningExport, setWarningExport] = useState<{ item: RecentDocument; summary: WarningSummary } | null>(null);

  const refresh = async (announce = false) => {
    setLoading(true);
    try {
      setItems((await coreService.getRecentDocuments()).items);
      if (announce) notify({ kind: "success", title: "最近文档已刷新" });
    } catch (reason) {
      notify({ kind: "error", title: "读取最近文档失败", text: reason instanceof Error ? reason.message : "请稍后重试。" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!activeDocument) return;
    const matchingRun = activeRun?.documentId === activeDocument.id ? activeRun : null;
    const liveItem: RecentDocument = {
      id: activeDocument.id,
      name: activeDocument.name,
      kind: activeDocument.kind,
      latestRunId: matchingRun?.id || activeDocument.latestRunId,
      latestRunStatus: matchingRun?.status || "",
      latestRunProgress: matchingRun
        ? { completed: matchingRun.progress.completed, total: matchingRun.progress.total }
        : { completed: 0, total: 0 },
      canResume: Boolean(
        matchingRun
        && ["paused", "cancelled"].includes(matchingRun.status)
        && matchingRun.progress.completed < matchingRun.progress.total
      ),
      canExport: Boolean(
        matchingRun
        && !["queued", "running", "cancelling"].includes(matchingRun.status)
        && matchingRun.paragraphs.length
      ),
      selectedCount: activeDocument.selectedCount,
      safeCount: activeDocument.safeCount,
      excludedCount: activeDocument.excludedCount,
      createdAt: activeDocument.createdAt,
      updatedAt: matchingRun?.updatedAt || activeDocument.updatedAt,
    };
    setItems((current) => {
      const existing = current.find((item) => item.id === activeDocument.id);
      if (!existing) return [liveItem, ...current].slice(0, 20);
      return current.map((item) => item.id === activeDocument.id
        ? {
            ...item,
            ...liveItem,
            latestRunId: matchingRun ? liveItem.latestRunId : activeDocument.latestRunId || item.latestRunId,
            latestRunStatus: matchingRun ? liveItem.latestRunStatus : item.latestRunStatus,
            latestRunProgress: matchingRun ? liveItem.latestRunProgress : item.latestRunProgress,
            canResume: matchingRun ? liveItem.canResume : item.canResume,
            canExport: matchingRun ? liveItem.canExport : item.canExport,
            lastExportAt: item.lastExportAt,
          }
        : item);
    });
  }, [
    activeDocument?.id,
    activeDocument?.name,
    activeDocument?.kind,
    activeDocument?.latestRunId,
    activeDocument?.selectedCount,
    activeDocument?.safeCount,
    activeDocument?.excludedCount,
    activeDocument?.createdAt,
    activeDocument?.updatedAt,
    activeRun?.id,
    activeRun?.documentId,
    activeRun?.status,
    activeRun?.progress.completed,
    activeRun?.progress.total,
    activeRun?.paragraphs.length,
    activeRun?.updatedAt,
  ]);

  useEffect(() => {
    if (items.some((item) => item.id === activeId)) return;
    setActiveId(items[0]?.id || "");
  }, [activeId, items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === "resume" && !item.canResume) return false;
      if (filter === "completed" && item.latestRunStatus !== "completed") return false;
      return !needle || item.name.toLocaleLowerCase().includes(needle);
    });
  }, [filter, items, query]);

  useEffect(() => {
    if (!visibleItems.length || visibleItems.some((item) => item.id === activeId)) return;
    setActiveId(visibleItems[0].id);
  }, [activeId, visibleItems]);

  const activeItem = items.find((item) => item.id === activeId) || visibleItems[0] || null;

  const load = async (item: RecentDocument, resume = false) => {
    setBusyId(item.id);
    try {
      const document = await coreService.getDocument(item.id);
      let run: CoreRun | null = item.latestRunId ? await coreService.getRun(item.latestRunId) : null;
      if (resume && run && ["paused", "cancelled"].includes(run.status)) {
        run = await coreService.resumeRun(run.id);
      }
      onOpen(document, run);
      notify({ kind: "success", title: resume ? "任务已继续" : "文档已打开", text: item.name });
    } catch (reason) {
      notify({ kind: "error", title: "打开文档失败", text: reason instanceof Error ? reason.message : "请稍后重试。" });
    } finally {
      setBusyId("");
    }
  };

  const exportLatest = async (item: RecentDocument, acknowledge = false) => {
    if (!item.latestRunId) return;
    setBusyId(item.id);
    try {
      await coreService.exportRun(
        item.latestRunId,
        item.kind === "docx" ? "docx" : "txt",
        acknowledge
          ? { acknowledgeWarnings: true, forceFormatRisk: true, useOriginalForIncomplete: true }
          : {},
      );
      setWarningExport(null);
      notify({ kind: "success", title: "文件已导出", text: item.name });
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "export_confirmation_required" && (reason.exportConfirmation || reason.warningSummary)) {
        setWarningExport({ item, summary: reason.exportConfirmation || reason.warningSummary! });
      } else {
        notify({ kind: "error", title: "导出失败", text: reason instanceof Error ? reason.message : "请稍后重试。" });
      }
    } finally {
      setBusyId("");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const documentId = deleteTarget.id;
    setBusyId(documentId);
    try {
      await coreService.deleteDocument(documentId);
      onDeleted(documentId);
      setDeleteTarget(null);
      await refresh();
      notify({ kind: "success", title: "文档已删除" });
    } catch (reason) {
      setDeleteTarget(null);
      notify({ kind: "error", title: "删除失败", text: reason instanceof Error ? reason.message : "请稍后重试。" });
    } finally {
      setBusyId("");
    }
  };

  const selectItem = (item: RecentDocument) => {
    setActiveId(item.id);
    if (isMobile) setMobilePane("details");
  };

  const documentList = (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="recent-document-list">
      <div className="flex shrink-0 flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <span className="font-medium">最近文档</span>
          <Badge variant="secondary">{items.length}</Badge>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label="刷新最近文档"
            disabled={loading}
            onClick={() => void refresh(true)}
          >
            {loading ? <Spinner /> : <RefreshCw />}
          </Button>
        </div>
        <InputGroup>
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索文档" aria-label="搜索最近文档" />
        </InputGroup>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={filter}
          onValueChange={(value) => value && setFilter(value as RecentFilter)}
          className="w-full"
          aria-label="筛选最近文档"
        >
          <ToggleGroupItem value="all" className="flex-1">全部</ToggleGroupItem>
          <ToggleGroupItem value="resume" className="flex-1">可继续</ToggleGroupItem>
          <ToggleGroupItem value="completed" className="flex-1">已完成</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        {loading ? (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Spinner /></EmptyMedia>
              <EmptyTitle>正在读取</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : visibleItems.length ? (
          <ItemGroup className="gap-1 p-2">
            {visibleItems.map((item) => (
              <Item
                key={item.id}
                asChild
                size="sm"
                variant={item.id === activeItem?.id ? "muted" : "default"}
                data-recent-document={item.id}
                data-recent-name={item.name}
                data-recent-status={item.latestRunStatus || ""}
              >
                <button type="button" onClick={() => selectItem(item)}>
                  <ItemMedia variant="icon"><FileText /></ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="max-w-full truncate">{item.name}</ItemTitle>
                    <ItemDescription>{formatDate(item.updatedAt)}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Badge variant={item.canResume ? "secondary" : "outline"}>{runStatusLabel(item.latestRunStatus)}</Badge>
                  </ItemActions>
                </button>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <Empty className="min-h-64">
            <EmptyHeader>
              <EmptyMedia variant="icon">{items.length ? <ListFilter /> : <FolderClock />}</EmptyMedia>
              <EmptyTitle>{items.length ? "没有匹配的文档" : "还没有文档"}</EmptyTitle>
              {items.length ? <EmptyDescription>调整搜索或筛选条件。</EmptyDescription> : null}
            </EmptyHeader>
          </Empty>
        )}
      </ScrollArea>
    </Card>
  );

  const documentDetails = activeItem ? (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden" data-testid="recent-document-details">
      <div className="flex shrink-0 items-start gap-3 p-4">
        <ItemMedia variant="icon"><FileText /></ItemMedia>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{activeItem.name}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{activeItem.kind.toUpperCase()}</Badge>
            <Badge variant={activeItem.latestRunStatus === "completed" ? "default" : activeItem.canResume ? "secondary" : "outline"}>
              {runStatusLabel(activeItem.latestRunStatus)}
            </Badge>
          </div>
        </div>
      </div>
      <Separator />
      <ScrollArea className="min-h-0 flex-1">
        <ItemGroup className="grid gap-2 p-4 sm:grid-cols-2">
          <Item variant="muted">
            <ItemMedia variant="icon"><CalendarClock /></ItemMedia>
            <ItemContent>
              <ItemDescription>最近更新</ItemDescription>
              <ItemTitle>{formatDate(activeItem.updatedAt)}</ItemTitle>
            </ItemContent>
          </Item>
          <Item variant="muted">
            <ItemMedia variant="icon"><FileText /></ItemMedia>
            <ItemContent>
              <ItemDescription>正文范围</ItemDescription>
              <ItemTitle>{activeItem.selectedCount} 段</ItemTitle>
            </ItemContent>
          </Item>
          {activeItem.latestRunProgress ? (
            <Item variant="muted">
              <ItemMedia variant="icon"><Play /></ItemMedia>
              <ItemContent>
                <ItemDescription>处理进度</ItemDescription>
                <ItemTitle>{activeItem.latestRunProgress.completed} / {activeItem.latestRunProgress.total}</ItemTitle>
              </ItemContent>
            </Item>
          ) : null}
          {activeItem.lastExportAt ? (
            <Item variant="muted">
              <ItemMedia variant="icon"><Download /></ItemMedia>
              <ItemContent>
                <ItemDescription>最近导出</ItemDescription>
                <ItemTitle>{formatDate(activeItem.lastExportAt)}</ItemTitle>
              </ItemContent>
            </Item>
          ) : null}
        </ItemGroup>
      </ScrollArea>
      <Separator />
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 p-3">
        <Button
          size="icon"
          variant="ghost"
          aria-label={`删除 ${activeItem.name}`}
          disabled={busyId === activeItem.id}
          onClick={() => setDeleteTarget(activeItem)}
        >
          <Trash2 />
        </Button>
        <ButtonGroup>
          <Button variant="outline" disabled={busyId === activeItem.id} onClick={() => void load(activeItem)}>
            <FolderOpen data-icon="inline-start" />
            打开
          </Button>
          {activeItem.canResume ? (
            <Button disabled={busyId === activeItem.id} onClick={() => void load(activeItem, true)}>
              <Play data-icon="inline-start" />
              继续
            </Button>
          ) : activeItem.canExport ? (
            <Button disabled={busyId === activeItem.id} onClick={() => void exportLatest(activeItem)}>
              <Download data-icon="inline-start" />
              导出
            </Button>
          ) : null}
        </ButtonGroup>
      </div>
    </Card>
  ) : (
    <Card className="h-full overflow-hidden">
      <Empty className="h-full">
        <EmptyHeader>
          <EmptyMedia variant="icon"><FolderClock /></EmptyMedia>
          <EmptyTitle>选择一篇文档</EmptyTitle>
        </EmptyHeader>
        {items.length === 0 ? (
          <EmptyContent>
            <EmptyDescription>上传文档后可在这里继续处理。</EmptyDescription>
          </EmptyContent>
        ) : null}
      </Empty>
    </Card>
  );

  return (
    <>
      <section data-testid="recent-documents-workspace" className="h-full min-h-0 overflow-hidden">
        {isMobile ? (
          <Tabs value={mobilePane} onValueChange={(value) => setMobilePane(value as "documents" | "details")} className="flex h-full min-h-0 flex-col">
            <TabsList className="mx-3 mt-3 grid shrink-0 grid-cols-2">
              <TabsTrigger value="documents">文档</TabsTrigger>
              <TabsTrigger value="details" disabled={!activeItem}>详情</TabsTrigger>
            </TabsList>
            <TabsContent value="documents" className="m-0 min-h-0 flex-1 overflow-hidden">{documentList}</TabsContent>
            <TabsContent value="details" className="m-0 min-h-0 flex-1 overflow-hidden">{documentDetails}</TabsContent>
          </Tabs>
        ) : (
          <ResizablePanelGroup orientation="horizontal" className="h-full overflow-hidden">
            <ResizablePanel defaultSize="38%" minSize="28%" maxSize="52%" className="pr-1.5">{documentList}</ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize="62%" minSize="42%" className="pl-1.5">{documentDetails}</ResizablePanel>
          </ResizablePanelGroup>
        )}
      </section>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除这篇文档？</AlertDialogTitle>
            <AlertDialogDescription>“{deleteTarget?.name}”及其本机任务记录会被删除，此操作无法撤销。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(warningExport)} onOpenChange={(open) => !open && setWarningExport(null)}>
        <DialogContent className="max-h-[calc(100svh-1rem)] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>导出前确认</DialogTitle>
            <DialogDescription>{warningExport?.summary.message}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {Object.entries(warningExport?.summary.categories || {}).map(([label, count]) => (
              <Badge key={label} variant="secondary">{label} {count}</Badge>
            ))}
          </div>
          {warningExport?.summary.warnings.length ? (
            <ScrollArea className="h-[min(38svh,20rem)]" data-testid="recent-export-warning-locations">
              <ItemGroup className="gap-2 pr-3">
                {warningExport.summary.warnings.map((warning, index) => (
                  <Item key={`${warning.paragraphId}-${warning.category}-${index}`} size="sm" variant="outline">
                    <ItemMedia>
                      <Badge variant="outline">第 {warning.paragraphNumber || "?"} 段</Badge>
                    </ItemMedia>
                    <ItemContent className="min-w-0">
                      <ItemTitle>{warning.label}</ItemTitle>
                      <ItemDescription className="line-clamp-none break-words text-left">
                        {warning.message}
                      </ItemDescription>
                      {warning.paragraphPreview ? (
                        <ItemDescription className="line-clamp-1 text-left">
                          {warning.paragraphPreview}
                        </ItemDescription>
                      ) : null}
                    </ItemContent>
                  </Item>
                ))}
              </ItemGroup>
            </ScrollArea>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setWarningExport(null)}>返回</Button>
            <Button disabled={!warningExport || busyId === warningExport.item.id} onClick={() => warningExport && void exportLatest(warningExport.item, true)}>
              确认并导出
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
