import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleStop,
  Download,
  Ellipsis,
  FilePenLine,
  FileText,
  FolderOpen,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";

import { useAppNotifications } from "@/components/AppNotifications";
import { ReviewWorkspace, type ReviewWarningFocusRequest } from "@/components/core/ReviewWorkspace";
import { ScopeEditor } from "@/components/core/ScopeEditor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, coreService } from "@/lib/coreService";
import { cn } from "@/lib/utils";
import type {
  ChunkPreset,
  CoreDocument,
  CoreRun,
  CoreSettings,
  ReviewChoice,
  WarningSummary,
} from "@/types/core";

interface Props {
  settings: CoreSettings;
  document: CoreDocument | null;
  run: CoreRun | null;
  onDocumentChange: (value: CoreDocument | null) => void;
  onRunChange: (value: CoreRun | null | ((current: CoreRun | null) => CoreRun | null)) => void;
  onSettingsRefresh: () => Promise<void>;
  onNavigate: (page: "models" | "prompts" | "protection") => void;
  scopeRequest: number;
}

const ACTIVE_STATUSES = new Set(["queued", "running", "cancelling"]);
const CONCURRENCY_OPTIONS = [1, 2, 4, 8, 16] as const;

function ConcurrencyField({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const options = CONCURRENCY_OPTIONS.includes(value as (typeof CONCURRENCY_OPTIONS)[number])
    ? CONCURRENCY_OPTIONS
    : [...CONCURRENCY_OPTIONS, value].sort((left, right) => left - right);
  return (
    <Field>
      <FieldLabel>同时改写块数</FieldLabel>
      <ToggleGroup
        type="single"
        variant="outline"
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) => next && onChange(Number(next))}
        className="w-full"
        data-testid="rewrite-concurrency"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option}
            value={String(option)}
            className="flex-1"
            data-testid={`rewrite-concurrency-${option}`}
          >
            {option} 块
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

function messageOf(reason: unknown): string {
  return reason instanceof Error ? reason.message : "操作失败，请重试。";
}

function statusLabel(status: CoreRun["status"]): string {
  return {
    queued: "准备中",
    running: "正在改写",
    cancelling: "正在停止",
    paused: "等待继续",
    cancelled: "已停止",
    completed: "改写完成",
  }[status];
}

function fileSize(size: number): string {
  if (size < 1024 * 1024) return Math.max(1, Math.round(size / 1024)) + " KB";
  return (size / 1024 / 1024).toFixed(1) + " MB";
}

function initialRoundTemplateIds(settings: CoreSettings): string[] {
  const available = new Set(settings.promptTemplates.map((template) => template.id));
  const configured = settings.preferences.roundTemplateIds
    .filter((templateId) => available.has(templateId))
    .slice(0, 3);
  const fallback = settings.promptTemplates[0]?.id || "";
  return configured.length ? configured : fallback ? [fallback, fallback] : [];
}

export function RewritePage({
  settings,
  document,
  run,
  onDocumentChange,
  onRunChange,
  onSettingsRefresh,
  onNavigate,
  scopeRequest,
}: Props) {
  const { notify } = useAppNotifications();
  const fileInput = useRef<HTMLInputElement>(null);
  const availableModelProfiles = useMemo(
    () => settings.modelProfiles.filter((profile) => profile.configured !== false),
    [settings.modelProfiles],
  );
  const initialProfile = availableModelProfiles.find((profile) => profile.id === settings.defaultModelProfileId)
    || availableModelProfiles[0];

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [modelProfileId, setModelProfileId] = useState(initialProfile?.id || "");
  const [roundTemplateIds, setRoundTemplateIds] = useState<string[]>(() => initialRoundTemplateIds(settings));
  const [concurrency, setConcurrency] = useState(settings.preferences.rewriteConcurrency || 1);
  const [chunkPreset, setChunkPreset] = useState<ChunkPreset>(settings.preferences.chunkPreset || "standard");
  const [protectedTerms, setProtectedTerms] = useState(settings.preferences.protectedTerms.join("，"));
  const [busy, setBusy] = useState<"upload" | "scope" | "start" | "cancel" | "resume" | "continue" | "export" | "">("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [taskSheetOpen, setTaskSheetOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [warningSummary, setWarningSummary] = useState<WarningSummary | null>(null);
  const [pendingExport, setPendingExport] = useState<"docx" | "txt" | null>(null);
  const [reviewWarningFocus, setReviewWarningFocus] = useState<ReviewWarningFocusRequest | null>(null);

  useEffect(() => {
    setSelectedIds(new Set(document?.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id) || []));
  }, [document?.id, document?.updatedAt]);

  useEffect(() => {
    if (!run) return;
    setConcurrency(run.snapshot.concurrency);
    setModelProfileId(run.snapshot.credentialProfileId || run.snapshot.modelProfile.id);
    setRoundTemplateIds(run.snapshot.rounds.map((round) => round.templateId));
    setChunkPreset(run.snapshot.chunking.preset);
    setProtectedTerms(run.snapshot.protectedTerms.join("，"));
  }, [run?.id]);

  useEffect(() => {
    setReviewWarningFocus(null);
  }, [run?.id]);

  useEffect(() => {
    if (!scopeRequest || !document || run) return;
    setSelectedIds(new Set(document.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id)));
    setScopeOpen(true);
  }, [scopeRequest]);

  useEffect(() => {
    if (!availableModelProfiles.some((profile) => profile.id === modelProfileId)) {
      const next = availableModelProfiles.find((profile) => profile.id === settings.defaultModelProfileId)
        || availableModelProfiles[0];
      setModelProfileId(next?.id || "");
    }
    const availableTemplateIds = new Set(settings.promptTemplates.map((template) => template.id));
    const fallbackTemplateId = settings.promptTemplates[0]?.id || "";
    setRoundTemplateIds((current) => {
      const source = current.length ? current : initialRoundTemplateIds(settings);
      const next = source
        .slice(0, 3)
        .map((templateId) => availableTemplateIds.has(templateId) ? templateId : fallbackTemplateId)
        .filter(Boolean);
      if (next.length === current.length && next.every((templateId, index) => templateId === current[index])) {
        return current;
      }
      return next;
    });
  }, [
    availableModelProfiles,
    modelProfileId,
    settings.defaultModelProfileId,
    settings.preferences.roundTemplateIds,
    settings.promptTemplates,
  ]);

  const refreshRun = async (runId: string, reportError = true) => {
    try {
      const refreshed = await coreService.getRun(runId);
      onRunChange((current) => {
        if (!current || current.id !== runId) return current;
        const visibleChunks = new Map(current.chunks.map((chunk) => [chunk.id, chunk]));
        return {
          ...refreshed,
          chunks: refreshed.chunks.map((chunk) => {
            const visible = visibleChunks.get(chunk.id);
            return visible && visible.revision > chunk.revision ? visible : chunk;
          }),
        };
      });
    } catch (reason) {
      if (reportError) notify({ kind: "error", title: "任务状态读取失败", text: messageOf(reason) });
    }
  };

  const selectedProfile = availableModelProfiles.find((profile) => profile.id === modelProfileId);
  const selectedTemplates = roundTemplateIds.map(
    (templateId) => settings.promptTemplates.find((template) => template.id === templateId),
  );
  const scopeChanged = Boolean(
    document
      && (selectedIds.size !== document.selectedCount
        || document.paragraphs.some((paragraph) => paragraph.selected !== selectedIds.has(paragraph.id))),
  );
  const selectedParagraphs = useMemo(
    () => document?.paragraphs.filter((paragraph) => selectedIds.has(paragraph.id) && paragraph.text.trim()) || [],
    [document, selectedIds],
  );
  const runActive = Boolean(run && ACTIVE_STATUSES.has(run.status));
  const exportReady = Boolean(run && !ACTIVE_STATUSES.has(run.status) && !reviewPending);

  const upload = async (file?: File) => {
    if (!file || busy) return;
    if (run && ACTIVE_STATUSES.has(run.status)) {
      notify({ kind: "warning", title: "请先停止当前任务" });
      return;
    }
    setBusy("upload");
    try {
      const value = await coreService.uploadDocument(file);
      onDocumentChange(value);
      onRunChange(null);
      setScopeOpen(true);
      notify({ kind: "success", title: "文档已读取" });
    } catch (reason) {
      notify({ kind: "error", title: "文档读取失败", text: messageOf(reason) });
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const openScope = () => {
    if (!document || run) return;
    setSelectedIds(new Set(document.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id)));
    setScopeOpen(true);
  };

  const closeScope = () => {
    if (document) {
      setSelectedIds(new Set(document.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id)));
    }
    setScopeOpen(false);
  };

  const saveScope = async () => {
    if (!document) return;
    if (!selectedIds.size) {
      notify({ kind: "warning", title: "至少选择一个正文段落" });
      return;
    }
    setBusy("scope");
    try {
      const value = await coreService.saveScope(document.id, [...selectedIds]);
      onDocumentChange(value);
      setScopeOpen(false);
      setTaskSheetOpen(true);
      notify({ kind: "success", title: "正文范围已保存" });
    } catch (reason) {
      notify({ kind: "error", title: "正文范围保存失败", text: messageOf(reason) });
    } finally {
      setBusy("");
    }
  };

  const startRun = async () => {
    if (!document) return;
    if (!selectedIds.size) {
      notify({ kind: "warning", title: "至少选择一个正文段落" });
      return;
    }
    if (!document.scopeConfirmed || scopeChanged) {
      notify({ kind: "warning", title: "请先保存正文范围" });
      return;
    }
    if (!selectedProfile) {
      notify({ kind: "warning", title: "请选择模型连接" });
      return;
    }
    if (!roundTemplateIds.length || selectedTemplates.some((template) => !template)) {
      notify({ kind: "warning", title: "请为每一轮选择提示词" });
      return;
    }

    setBusy("start");
    try {
      const terms = protectedTerms.split(/[，,\n]/).map((term) => term.trim()).filter(Boolean);
      await coreService.savePreferences({
        rewriteConcurrency: concurrency,
        protectedTerms: terms,
        chunkPreset,
        roundTemplateIds,
      });
      const value = await coreService.createRun({
        documentId: document.id,
        modelProfileId,
        roundTemplateIds,
        concurrency,
        chunkPreset,
        protectedTerms: terms,
      });
      if (
        value.snapshot.concurrency !== concurrency
        || JSON.stringify(value.snapshot.rounds.map((round) => round.templateId)) !== JSON.stringify(roundTemplateIds)
      ) {
        await coreService.cancelRun(value.id).catch(() => undefined);
        throw new Error("改写设置未被任务采用，任务已停止。请重试。");
      }
      onRunChange(value);
      setTaskSheetOpen(false);
      await onSettingsRefresh();
      notify({ kind: "success", title: "改写已开始", text: `最多同时改写 ${value.snapshot.concurrency} 块。` });
    } catch (reason) {
      notify({ kind: "error", title: "任务未能开始", text: messageOf(reason) });
    } finally {
      setBusy("");
    }
  };

  const cancelRun = async () => {
    if (!run) return;
    setBusy("cancel");
    try {
      onRunChange(await coreService.cancelRun(run.id));
      notify({ kind: "success", title: "任务已停止", text: "进度已保存。" });
    } catch (reason) {
      notify({ kind: "error", title: "停止失败", text: messageOf(reason) });
    } finally {
      setBusy("");
    }
  };

  const resumeRun = async () => {
    if (!run) return;
    setBusy("resume");
    try {
      const value = await coreService.resumeRun(run.id);
      onRunChange(value);
      setTaskSheetOpen(false);
      notify({ kind: "success", title: "继续处理未完成内容" });
    } catch (reason) {
      notify({ kind: "error", title: "无法继续", text: messageOf(reason) });
    } finally {
      setBusy("");
    }
  };

  const continueCompletedRun = async () => {
    if (!run || run.status !== "completed") return;
    if (reviewPending) {
      notify({ kind: "warning", title: "请先保存正在编辑的内容" });
      return;
    }
    if (!selectedProfile) {
      notify({ kind: "warning", title: "请选择模型连接" });
      return;
    }
    if (!roundTemplateIds.length || selectedTemplates.some((template) => !template)) {
      notify({ kind: "warning", title: "请为每一轮选择提示词" });
      return;
    }
    setBusy("continue");
    try {
      const terms = protectedTerms.split(/[，,\n]/).map((term) => term.trim()).filter(Boolean);
      const preferences = await coreService.savePreferences({
        rewriteConcurrency: concurrency,
        protectedTerms: terms,
        chunkPreset,
        roundTemplateIds,
      });
      const value = await coreService.continueRun(run.id, {
        modelProfileId,
        roundTemplateIds: preferences.roundTemplateIds,
        concurrency: preferences.rewriteConcurrency,
        chunkPreset: preferences.chunkPreset,
        protectedTerms: preferences.protectedTerms,
      });
      const configurationApplied = value.snapshot.concurrency === preferences.rewriteConcurrency
        && value.snapshot.credentialProfileId === modelProfileId
        && JSON.stringify(value.snapshot.rounds.map((round) => round.templateId)) === JSON.stringify(preferences.roundTemplateIds)
        && value.snapshot.chunking.preset === preferences.chunkPreset
        && JSON.stringify(value.snapshot.protectedTerms) === JSON.stringify(preferences.protectedTerms);
      if (!configurationApplied) {
        await coreService.cancelRun(value.id).catch(() => undefined);
        throw new Error("下一轮设置未被完整采用，任务已停止。请重试。");
      }
      onRunChange(value);
      setTaskSheetOpen(false);
      await onSettingsRefresh();
      notify({
        kind: "success",
        title: "继续改写已开始",
        text: `${value.snapshot.modelProfile.name} · ${value.snapshot.rounds.length} 轮`,
      });
    } catch (reason) {
      notify({ kind: "error", title: "无法继续改写", text: messageOf(reason) });
    } finally {
      setBusy("");
    }
  };

  const retryParagraph = async (paragraphId: string) => {
    if (!run) return;
    try {
      onRunChange(await coreService.retryParagraph(run.id, paragraphId));
    } catch (reason) {
      notify({ kind: "error", title: "无法重新改写", text: messageOf(reason) });
    }
  };

  const saveReview = async (paragraphId: string, decision: ReviewChoice, text = "") => {
    if (!run) return;
    try {
      onRunChange(await coreService.saveReview(run.id, paragraphId, decision, text));
    } catch (reason) {
      notify({ kind: "error", title: "审阅选择未保存", text: messageOf(reason) });
    }
  };

  const exportResult = async (format: "docx" | "txt", confirmed = false) => {
    if (!run) return;
    if (reviewPending) {
      notify({ kind: "warning", title: "请先保存正在编辑的内容" });
      return;
    }
    setBusy("export");
    try {
      await coreService.exportRun(
        run.id,
        format,
        confirmed
          ? { acknowledgeWarnings: true, forceFormatRisk: true, useOriginalForIncomplete: true }
          : {},
      );
      setWarningSummary(null);
      setPendingExport(null);
      notify({ kind: "success", title: "文件已导出" });
      await refreshRun(run.id);
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === "export_confirmation_required" && (reason.exportConfirmation || reason.warningSummary)) {
        setWarningSummary(reason.exportConfirmation || reason.warningSummary || null);
        setPendingExport(format);
      } else if (reason instanceof ApiError && reason.code === "export_generation_failed") {
        notify({ kind: "error", title: "文件无法生成", text: reason.message });
      } else {
        notify({ kind: "error", title: "导出失败", text: messageOf(reason) });
      }
    } finally {
      setBusy("");
    }
  };

  const startFreshRun = () => {
    onRunChange(null);
    setTaskSheetOpen(true);
    notify({ kind: "info", title: "可以开始新的改写任务" });
  };

  const returnToWarningReview = () => {
    const paragraphIds = Array.from(new Set(
      (warningSummary?.warnings || []).map((warning) => warning.paragraphId).filter(Boolean),
    ));
    setWarningSummary(null);
    setPendingExport(null);
    setTaskSheetOpen(false);
    setReviewWarningFocus((current) => ({
      revision: (current?.revision || 0) + 1,
      paragraphIds,
    }));
  };

  const setRoundCount = (count: number) => {
    const normalizedCount = Math.max(1, Math.min(3, count));
    const fallback = roundTemplateIds[roundTemplateIds.length - 1] || settings.promptTemplates[0]?.id || "";
    setRoundTemplateIds((current) => Array.from(
      { length: normalizedCount },
      (_, index) => current[index] || current[current.length - 1] || fallback,
    ).filter(Boolean));
  };

  const setRoundTemplate = (index: number, templateId: string) => {
    setRoundTemplateIds((current) => current.map((value, itemIndex) => itemIndex === index ? templateId : value));
  };

  const taskSettings = !run || run.status === "completed" ? (
    <Tabs defaultValue="rewrite" className="flex flex-col gap-4">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="rewrite">改写</TabsTrigger>
        <TabsTrigger value="processing">处理</TabsTrigger>
      </TabsList>

      <TabsContent value="rewrite" className="m-0">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="run-model-profile">模型连接</FieldLabel>
            {availableModelProfiles.length ? (
              <Select value={modelProfileId} onValueChange={setModelProfileId}>
                <SelectTrigger id="run-model-profile" data-testid="rewrite-model-profile">
                  <SelectValue placeholder="选择模型连接" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {availableModelProfiles.map((profile) => (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.name} · {profile.model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            ) : (
              <Button variant="outline" onClick={() => onNavigate("models")}>
                <Settings2 data-icon="inline-start" />
                配置模型连接
              </Button>
            )}
          </Field>

          <Field>
            <FieldLabel>改写轮数</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={String(roundTemplateIds.length)}
              onValueChange={(value) => value && setRoundCount(Number(value))}
              className="w-full"
              data-testid="rewrite-round-count"
            >
              {[1, 2, 3].map((value) => (
                <ToggleGroupItem
                  key={value}
                  value={String(value)}
                  className="flex-1"
                  data-testid={`rewrite-round-${value}`}
                >
                  {value} 轮
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>

          {roundTemplateIds.map((templateId, index) => (
            <Field key={index}>
              <FieldLabel htmlFor={`run-round-template-${index + 1}`}>第 {index + 1} 轮提示词</FieldLabel>
              <Select value={templateId} onValueChange={(value) => setRoundTemplate(index, value)}>
                <SelectTrigger
                  id={`run-round-template-${index + 1}`}
                  data-testid={`rewrite-round-template-${index + 1}`}
                >
                  <SelectValue placeholder="选择提示词" />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectGroup>
                    {settings.promptTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ))}

          <ButtonGroup className="w-full">
            <Button variant="outline" className="flex-1" onClick={() => onNavigate("models")}>
              <Settings2 data-icon="inline-start" />
              模型
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onNavigate("prompts")}>
              <FilePenLine data-icon="inline-start" />
              提示词
            </Button>
          </ButtonGroup>
        </FieldGroup>
      </TabsContent>

      <TabsContent value="processing" className="m-0">
        <FieldGroup>
          <Field>
            <FieldLabel>段内分块</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={chunkPreset}
              onValueChange={(value) => value && setChunkPreset(value as ChunkPreset)}
              className="w-full"
              data-testid="rewrite-chunk-preset"
            >
              <ToggleGroupItem value="fine" className="flex-1" data-testid="rewrite-chunk-fine">细致</ToggleGroupItem>
              <ToggleGroupItem value="standard" className="flex-1" data-testid="rewrite-chunk-standard">标准</ToggleGroupItem>
              <ToggleGroupItem value="long" className="flex-1" data-testid="rewrite-chunk-long">长段</ToggleGroupItem>
            </ToggleGroup>
          </Field>

          <ConcurrencyField value={concurrency} onChange={setConcurrency} />

          <Field>
            <FieldLabel htmlFor="protected-terms">保护词</FieldLabel>
            <Input
              id="protected-terms"
              value={protectedTerms}
              onChange={(event) => setProtectedTerms(event.target.value)}
              placeholder="系统名称，算法缩写"
            />
          </Field>
        </FieldGroup>
      </TabsContent>
    </Tabs>
  ) : null;

  const taskActions = (
    <div className="flex w-full flex-col gap-3">
      {!run ? (
        <Button
          disabled={busy === "start"}
          onClick={() => document?.scopeConfirmed && !scopeChanged ? void startRun() : openScope()}
        >
          {busy === "start" ? <Spinner data-icon="inline-start" /> : document?.scopeConfirmed && !scopeChanged ? <Play data-icon="inline-start" /> : <Check data-icon="inline-start" />}
          {document?.scopeConfirmed && !scopeChanged ? "开始改写" : "确认正文"}
        </Button>
      ) : ACTIVE_STATUSES.has(run.status) ? (
        <Button variant="destructive" disabled={busy === "cancel"} onClick={() => void cancelRun()}>
          {busy === "cancel" ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
          停止并保存
        </Button>
      ) : (
        <>
          {run.status === "paused" || run.status === "cancelled" ? (
            <Button disabled={busy === "resume"} onClick={() => void resumeRun()}>
              {busy === "resume" ? <Spinner data-icon="inline-start" /> : <Play data-icon="inline-start" />}
              继续未完成内容
            </Button>
          ) : null}
          {run.status === "completed" ? (
            <Button
              disabled={reviewPending || busy === "continue"}
              onClick={() => void continueCompletedRun()}
            >
              {busy === "continue" ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              继续改写
            </Button>
          ) : null}
          <ButtonGroup className="w-full">
            {document?.kind === "docx" ? (
              <Button
                variant="outline"
                className="flex-1"
                disabled={!exportReady || busy === "export"}
                onClick={() => void exportResult("docx")}
              >
                <Download data-icon="inline-start" />
                下载 Word
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="flex-1"
              disabled={!exportReady || busy === "export"}
              onClick={() => void exportResult("txt")}
            >
              <Download data-icon="inline-start" />
              下载 TXT
            </Button>
          </ButtonGroup>
          <Button variant="ghost" onClick={startFreshRun}>
            <RefreshCw data-icon="inline-start" />
            新建改写任务
          </Button>
        </>
      )}
      {reviewPending ? <FieldDescription>请先保存正在编辑的内容。</FieldDescription> : null}
    </div>
  );

  const documentPreview = selectedParagraphs.length ? (
    <ScrollArea className="h-full bg-muted/40" data-testid="rewrite-manuscript-preview">
      <div className="mx-auto min-h-full w-full max-w-4xl p-4 md:p-6">
        <Card className="min-h-full">
          <CardHeader className="sr-only">
            <CardTitle>{document?.name}</CardTitle>
          </CardHeader>
          <CardContent className="p-6 md:p-10">
            <article className="flex flex-col gap-6">
              {selectedParagraphs.map((paragraph) => (
                <p key={paragraph.id} className="whitespace-pre-wrap break-words text-base leading-8">
                  {paragraph.text}
                </p>
              ))}
            </article>
          </CardContent>
        </Card>
      </div>
    </ScrollArea>
  ) : (
    <Empty className="h-full border">
      <EmptyHeader>
        <EmptyMedia variant="icon"><FilePenLine /></EmptyMedia>
        <EmptyTitle>选择正文</EmptyTitle>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={openScope}>
          <Check data-icon="inline-start" />
          正文范围
        </Button>
      </EmptyContent>
    </Empty>
  );

  const manuscriptPanel = document ? (
    <div data-testid="rewrite-main-panel" className="h-full min-h-0 min-w-0 overflow-hidden">
      <div className="h-full min-h-0 overflow-hidden" data-testid="rewrite-results-scroll">
        {!run ? documentPreview : runActive ? (
          <div className="flex h-full min-h-0 flex-col gap-3" data-testid="rewrite-run-progress">
            <Card className="shrink-0">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  <Spinner />
                  <div className="min-w-0">
                    <CardTitle className="text-base">{statusLabel(run.status)}</CardTitle>
                    <CardDescription>
                      {run.progress.completed} / {run.progress.total} 段
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Progress value={run.progress.percent} aria-label={statusLabel(run.status)} />
              </CardContent>
            </Card>
            <div className="min-h-0 flex-1">{documentPreview}</div>
          </div>
        ) : (
          <ReviewWorkspace
            run={run}
            running={false}
            onRetry={retryParagraph}
            onSaveReview={saveReview}
            onPendingChange={setReviewPending}
            warningFocusRequest={reviewWarningFocus}
          />
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Input
        ref={fileInput}
        type="file"
        accept=".docx,.txt"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />

      {!document ? (
        <div className="h-full bg-muted/40 p-3 md:p-6">
          <Card className={cn("mx-auto h-full max-w-5xl", dragging && "bg-muted")}>
            <CardContent className="h-full p-0">
              <Empty
                className="h-full border-0"
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  void upload(event.dataTransfer.files[0]);
                }}
              >
                <EmptyHeader>
                  <EmptyMedia variant="icon"><FileText /></EmptyMedia>
                  <EmptyTitle>选择文档</EmptyTitle>
                  <EmptyDescription>DOCX 或 TXT</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button disabled={busy === "upload"} onClick={() => fileInput.current?.click()}>
                    {busy === "upload" ? <Spinner data-icon="inline-start" /> : <FolderOpen data-icon="inline-start" />}
                    选择文件
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div
          data-testid="rewrite-workspace-grid"
          className="flex h-full min-h-0 flex-col gap-3 overflow-hidden"
        >
          <Item size="sm" variant="outline" className="shrink-0 flex-nowrap bg-card">
            <ItemMedia variant="icon"><FileText /></ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="max-w-full truncate">{document.name}</ItemTitle>
              <ItemDescription className="line-clamp-1">
                {document.kind.toUpperCase()} · {fileSize(document.sourceSize)} · {selectedIds.size} 段
              </ItemDescription>
            </ItemContent>
            <ItemActions className="shrink-0">
              {!run ? (
                <Button size="sm" onClick={() => setTaskSheetOpen(true)}>
                  <Settings2 data-icon="inline-start" />
                  改写设置
                </Button>
              ) : runActive ? (
                <Button size="sm" variant="destructive" disabled={busy === "cancel"} onClick={() => void cancelRun()}>
                  {busy === "cancel" ? <Spinner data-icon="inline-start" /> : <CircleStop data-icon="inline-start" />}
                  停止
                </Button>
              ) : (
                <Button
                  size="sm"
                  data-testid="rewrite-open-task-actions"
                  disabled={run.status === "completed" && (reviewPending || busy === "export" || busy === "continue")}
                  onClick={() => setTaskSheetOpen(true)}
                >
                  {run.status === "completed" ? <RefreshCw data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                  {run.status === "completed" ? "继续 / 导出" : "继续"}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" aria-label="文档操作"><Ellipsis /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuGroup>
                    {!run ? (
                      <DropdownMenuItem onSelect={openScope}>
                        <FileText />
                        正文范围
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      disabled={Boolean(run && ACTIVE_STATUSES.has(run.status)) || busy === "upload"}
                      onSelect={() => fileInput.current?.click()}
                    >
                      <RefreshCw />
                      更换文档
                    </DropdownMenuItem>
                    {document.kind === "docx" ? (
                      <DropdownMenuItem onSelect={() => onNavigate("protection")}>
                        <ShieldCheck />
                        保护区地图
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </ItemActions>
          </Item>

          <div className="min-h-0 flex-1 overflow-hidden">
            {manuscriptPanel}
          </div>
        </div>
      )}

      <Sheet open={taskSheetOpen && Boolean(document)} onOpenChange={setTaskSheetOpen}>
        <SheetContent data-testid="rewrite-task-sheet" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{run?.status === "completed" ? "继续改写" : run ? statusLabel(run.status) : "改写设置"}</SheetTitle>
            <SheetDescription className="sr-only">
              {run?.status === "completed" ? "选择下一轮改写设置" : run ? "任务操作" : "选择本次改写设置"}
            </SheetDescription>
          </SheetHeader>
          {!run || run.status === "completed" ? (
            <>
              <Separator />
              <ScrollArea className="min-h-0 flex-1">
                <div className="p-4">{taskSettings}</div>
              </ScrollArea>
            </>
          ) : run.status === "paused" || run.status === "cancelled" ? (
            <div className="min-h-0 flex-1" />
          ) : (
            <div className="min-h-0 flex-1" />
          )}
          <Separator />
          <SheetFooter>{taskActions}</SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={scopeOpen} onOpenChange={(open) => open ? setScopeOpen(true) : closeScope()}>
        <DialogContent className="grid max-h-[calc(100svh-1rem)] min-w-0 max-w-6xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden">
          <DialogHeader>
            <DialogTitle>正文范围</DialogTitle>
          </DialogHeader>
          {document ? (
            <ScopeEditor
              document={document}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              disabled={Boolean(run)}
              heightClassName="h-[min(68svh,44rem)]"
            />
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={closeScope}>取消</Button>
            <Button
              disabled={busy === "scope" || Boolean(run) || (!scopeChanged && document?.scopeConfirmed)}
              onClick={() => void saveScope()}
            >
              {busy === "scope" ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
              保存正文范围
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(warningSummary)}
        onOpenChange={(open) => {
          if (!open) {
            setWarningSummary(null);
            setPendingExport(null);
          }
        }}
      >
        <DialogContent className="max-h-[calc(100svh-1rem)] max-w-2xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>导出前确认</DialogTitle>
            <DialogDescription>{warningSummary?.message}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {Object.entries(warningSummary?.categories || {}).map(([label, count]) => (
                <Badge key={label} variant="secondary">{label} {count}</Badge>
              ))}
              {warningSummary?.requires?.forceFormatRisk ? <Badge variant="outline">格式风险</Badge> : null}
              {warningSummary?.incompleteParagraphIds?.length ? (
                <Badge variant="outline">{warningSummary.incompleteParagraphIds.length} 段未完成</Badge>
              ) : null}
            </div>
            {warningSummary?.warnings.length ? (
              <ScrollArea className="h-[min(38svh,20rem)]" data-testid="export-warning-locations">
                <ItemGroup className="gap-2 pr-3">
                  {warningSummary.warnings.map((warning, index) => (
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
            {warningSummary?.requires?.forceFormatRisk || warningSummary?.incompleteParagraphIds?.length ? (
              <Alert>
                <AlertTriangle />
                <AlertTitle>仍然可以导出</AlertTitle>
                <AlertDescription>
                  {warningSummary.incompleteParagraphIds?.length ? "未完成段落将使用原文。" : ""}
                  {warningSummary.requires?.forceFormatRisk ? "生成的 Word 文件可能存在格式变化。" : ""}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={returnToWarningReview}
              data-testid="export-return-to-review"
            >
              返回审阅
            </Button>
            <Button disabled={!pendingExport || busy === "export"} onClick={() => pendingExport && void exportResult(pendingExport, true)}>
              {busy === "export" ? <Spinner data-icon="inline-start" /> : <Download data-icon="inline-start" />}
              {pendingExport === "docx" ? "继续导出 Word" : "继续导出 TXT"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
