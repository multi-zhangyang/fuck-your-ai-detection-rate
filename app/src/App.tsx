import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Activity,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Home,
  BarChart3,
  Loader2,
  RefreshCw,
  Route,
  Save,
  Settings,
  ShieldCheck,
  Signal,
  SlidersHorizontal,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

import { DocumentCard } from "@/components/DocumentCard";
import { HistoryCard } from "@/components/HistoryCard";
import { ModelConfigCard, SchoolFormatCard } from "@/components/ModelConfigCard";
import { ProtectionMapCard } from "@/components/ProtectionMapCard";
import { DiffReviewCard, ResultCard, type DiffFilterMode, type DiffFocusRequest } from "@/components/ResultCard";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppState } from "@/hooks/useAppState";
import type { AppService } from "@/lib/appService";
import { getTaskPhaseLabel, isTaskBlocking, isTaskRunningPhase, type TaskPhase } from "@/lib/taskState";
import { cn } from "@/lib/utils";
import type { BatchRerunResult, BatchRerunStatus, BatchRerunTarget, DeleteHistoryOptions, DetectionReport, DetectionReportMatch, DetectionReportProvider, DocumentStatus, EnvironmentDiagnostics, ExportResult, FormatParserModelRoute, FormatRules, HistoryDeleteImpact, HistoryDeleteMode, HistoryDocumentSummary, HistoryOrphanScanResult, HistoryRound, ModelCatalogResult, ModelConfig, ModelProviderConfig, PromptId, PromptPreviewResponse, RerunChunkResult, ReviewDecision, RoundCompareData, RoundModelConfig, RoundProgress, RoundProgressStatus, RoundResult, RunAuditSummary } from "@/types/app";
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

const PREVIEW_MAX_CHARS = 12000;
const FORMAT_RULE_DRAFT_KEY = "fyadr.formatRuleDraft";
const FORMAT_RULE_PENDING_KEY = "fyadr.formatRulePending";
const FORMAT_RULE_ACTIVE_KEY = "fyadr.formatRuleActive";
const FORMAT_RULE_MODEL_ROUTE_KEY = "fyadr.formatRuleModelRoute";
const FORMAT_PARSER_DEFAULT_PROVIDER_ID = "__default";
const ACTIVE_DOCUMENT_KEY = "fyadr.activeDocument";
const ACTIVE_PROMPT_PROFILE_KEY = "fyadr.activePromptProfile";
const ACTIVE_PROMPT_SEQUENCE_KEY = "fyadr.activePromptSequence";
const AUTO_SNAPSHOT_SUPPRESSION_KEY = "fyadr.autoSnapshotSuppression";
const DETECTION_REPORT_KEY = "fyadr.detectionReport";
const NOTIFICATION_HISTORY_KEY = "fyadr.notificationHistory";
const BATCH_RERUN_POLL_INTERVAL_MS = 1200;
const AUTO_RUN_RETRY_DELAY_SECONDS = 10;
const AUTO_RUN_RETRY_MAX_ATTEMPTS = 3;
const AUTO_NEXT_ROUND_DELAY_SECONDS = 60;

type Props = {
  service: AppService;
  pickerLabel?: string;
};

type WorkbenchView = "home" | "quality" | "model" | "prompts" | "format" | "protection" | "history" | "diagnostics";

const WORKBENCH_NAV_ITEMS = [
  { view: "home", label: "工作台", description: "文档、导出、任务控制", icon: Home },
  { view: "quality", label: "改写检查", description: "风险与质量统计", icon: BarChart3 },
  { view: "model", label: "模型配置", description: "连接、服务商、路线", icon: Settings },
  { view: "prompts", label: "提示词预览", description: "只读模板", icon: FileText },
  { view: "format", label: "学校规范", description: "Word 导出规则", icon: SlidersHorizontal },
  { view: "protection", label: "保护区地图", description: "结构锁定", icon: ShieldCheck },
  { view: "history", label: "历史记录", description: "文档与轮次归档", icon: History },
  { view: "diagnostics", label: "启动诊断", description: "运行环境状态", icon: Activity },
] satisfies Array<{
  view: WorkbenchView;
  label: string;
  description: string;
  icon: typeof Home;
}>;
type NotificationKind = "success" | "error";
type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  text: string;
  time: string;
  read: boolean;
};
type RunSession = {
  sessionId: number;
  runId: string;
  sourcePath: string;
  round: number;
  taskTicket: number;
  mode: "start" | "attach";
  cancelRequested: boolean;
};
type BatchRerunSession = {
  runId: string;
  taskTicket: number;
  label: string;
  cancelRequested: boolean;
};
type AutoSnapshotSuppression = {
  sourcePath: string;
  docId: string;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  round: number | null;
  createdAt: string;
};
type PendingAutoActionBase = {
  id: string;
  sourcePath: string;
  scopeKey: string;
  round: number;
  createdAt: string;
};
type PendingAutoRetryAction = PendingAutoActionBase & {
  kind: "retry";
  secondsRemaining: number;
  delaySeconds: number;
  attempt: number;
  maxAttempts: number;
  reason: string;
};
type PendingAutoNextRoundAction = PendingAutoActionBase & {
  kind: "next-round";
  secondsRemaining: number;
  delaySeconds: number;
  completedRound: number;
};
type ManualInterventionAction = PendingAutoActionBase & {
  kind: "manual-intervention";
  attempts: number;
  maxAttempts: number;
  reason: string;
};
type PendingAutoAction = PendingAutoRetryAction | PendingAutoNextRoundAction | ManualInterventionAction;
type RunRecoveryPanelState = {
  title: string;
  message: string;
  tone: "blue" | "amber" | "red";
  phaseLabel: string;
  actionHint: string;
  resumeActionLabel?: string;
  resumeExplanation?: string;
  nextChunkId?: string;
  nextChunkIndex?: number;
  remainingChunks?: number;
  completedChunks: number;
  totalChunks: number;
  percent: number;
  eventCount?: number;
  error?: string;
};
type RuntimeTaskTone = "blue" | "amber" | "red" | "emerald" | "slate";
type RuntimeTaskCenterItem = {
  id: string;
  title: string;
  status: string;
  detail: string;
  recoveryHint?: string;
  tone: RuntimeTaskTone;
  running: boolean;
  percent?: number;
  meta?: string;
  actionLabel?: string;
  onAction?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
};
type ConfirmDialogTone = "neutral" | "info" | "warning" | "danger";
type ConfirmDialogOptions = {
  title: string;
  description?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmDialogTone;
};
type ConfirmDialogState = ConfirmDialogOptions & {
  id: number;
};
type StoredDetectionReport = {
  documentSourcePath: string;
  documentDocId: string;
  report: DetectionReport;
  savedAt: string;
};
type DiffDashboardStats = {
  chunkCount: number;
  reviewCount: number;
  failedCount: number;
  candidateCount: number;
  preferredFilter: DiffFilterMode;
  preferredChunkId?: string;
};
type DiffFailureLike = {
  chunkId: string;
  rejectedCandidates?: unknown[];
};

const PROMPT_OPTIONS: Array<{ id: PromptId; label: string; desc: string }> = [
  { id: "prewrite", label: "预改写", desc: "保守自然化" },
  { id: "classical", label: "经典改写", desc: "解释性慢节奏" },
  { id: "round1", label: "一轮", desc: "主体改写" },
  { id: "round2", label: "二轮", desc: "最终降痕" },
];

const DEFAULT_PROMPT_SEQUENCE: PromptId[] = ["prewrite", "round1", "round2"];

function normalizePromptSequence(value: unknown): PromptId[] {
  const rawItems = Array.isArray(value) ? value : [];
  const normalized = rawItems.filter((item): item is PromptId => PROMPT_OPTIONS.some((option) => option.id === item));
  return normalized.length ? normalized.slice(0, 3) : DEFAULT_PROMPT_SEQUENCE;
}

function readStoredPromptSequence(): PromptId[] {
  try {
    return normalizePromptSequence(JSON.parse(localStorage.getItem(ACTIVE_PROMPT_SEQUENCE_KEY) || "[]"));
  } catch {
    return DEFAULT_PROMPT_SEQUENCE;
  }
}

function promptSequencesEqual(left: PromptId[] | undefined, right: PromptId[] | undefined): boolean {
  const a = normalizePromptSequence(left);
  const b = normalizePromptSequence(right);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function formatPromptSequence(sequence: PromptId[] | undefined): string {
  const normalized = normalizePromptSequence(sequence);
  return normalized.map((id) => PROMPT_OPTIONS.find((option) => option.id === id)?.label ?? id).join(" → ");
}

function getRoundModelKey(promptProfile: ModelConfig["promptProfile"], round?: number | null): string | null {
  if (!round || round < 1 || round > 3) {
    return null;
  }
  if (promptProfile === "cn" && round > 2) {
    return null;
  }
  return `${promptProfile}:${round}`;
}

function getPromptFlowSequence(promptProfile: ModelConfig["promptProfile"], promptSequence?: PromptId[]): PromptId[] {
  if (promptProfile === "cn_prewrite") return DEFAULT_PROMPT_SEQUENCE;
  if (promptProfile === "cn") return ["round1", "round2"];
  return normalizePromptSequence(promptSequence);
}

function getPromptOptionLabel(promptId: PromptId): string {
  const option = PROMPT_OPTIONS.find((item) => item.id === promptId);
  return option ? `${option.label} · ${option.desc}` : promptId;
}

function buildRoundModelFromProvider(provider: ModelProviderConfig, model: string, fallback: ModelConfig): RoundModelConfig {
  return {
    enabled: true,
    providerId: provider.id,
    providerName: provider.name,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: model || provider.defaultModel || provider.models?.[0] || "",
    apiType: provider.apiType || fallback.apiType,
    temperature: provider.temperature ?? fallback.temperature,
    requestTimeoutSeconds: provider.requestTimeoutSeconds ?? fallback.requestTimeoutSeconds,
    maxRetries: provider.maxRetries ?? fallback.maxRetries,
    rateLimitWindowMinutes: provider.rateLimitWindowMinutes ?? 0,
    rateLimitMaxRequests: provider.rateLimitMaxRequests ?? 0,
  };
}

function buildModelConfigFromProvider(provider: ModelProviderConfig, fallback: ModelConfig, model?: string): ModelConfig {
  return {
    ...fallback,
    baseUrl: provider.baseUrl || fallback.baseUrl,
    apiKey: provider.apiKey || fallback.apiKey,
    model: model || provider.defaultModel || provider.models?.[0] || fallback.model,
    apiType: provider.apiType || fallback.apiType,
    temperature: provider.temperature ?? fallback.temperature,
    requestTimeoutSeconds: provider.requestTimeoutSeconds ?? fallback.requestTimeoutSeconds,
    maxRetries: provider.maxRetries ?? fallback.maxRetries,
  };
}

function findProviderForRoundModel(config: ModelConfig, roundModel?: RoundModelConfig): ModelProviderConfig | null {
  if (!roundModel?.enabled) return null;
  const providers = config.modelProviders ?? [];
  return (
    providers.find((provider) => provider.id && provider.id === roundModel.providerId)
    ?? providers.find((provider) => provider.baseUrl === roundModel.baseUrl && provider.name === roundModel.providerName)
    ?? providers.find((provider) => provider.baseUrl === roundModel.baseUrl)
    ?? null
  );
}

function buildQualityStats(compareData: RoundCompareData | null, exportResult: ExportResult | null) {
  const chunks = compareData?.chunks ?? [];
  const reviewChunks = chunks.filter((chunk) => chunk.quality?.needsReview);
  const missingCitationCount = chunks.reduce((total, chunk) => total + (chunk.quality?.missingCitationCount ?? 0), 0);
  const protectedTokenCount = chunks.reduce((total, chunk) => total + (chunk.quality?.protectedTokenCount ?? 0), 0);
  const machineLikeRiskCount = chunks.reduce((total, chunk) => total + (chunk.quality?.machineLikeRiskCount ?? 0), 0);
  const protectedTypes: Record<string, number> = {};
  for (const chunk of chunks) {
    for (const [key, count] of Object.entries(chunk.quality?.protectedTokenTypes ?? {})) {
      protectedTypes[key] = (protectedTypes[key] ?? 0) + count;
    }
  }
  return {
    chunkCount: chunks.length,
    reviewChunkCount: reviewChunks.length,
    missingCitationCount,
    protectedTokenCount,
    protectedTypes,
    machineLikeRiskCount,
    guardIssueCount: exportResult?.guardIssueCount ?? 0,
    preflightIssueCount: exportResult?.preflightIssueCount ?? 0,
    auditIssueCount: exportResult?.auditIssueCount ?? 0,
  };
}

function buildCurrentRunAudit(roundResult: RoundResult | null, compareData: RoundCompareData | null, modelConfig: ModelConfig): RunAuditSummary {
  const qualitySummary = (roundResult?.qualitySummary ?? compareData?.qualitySummary ?? {}) as NonNullable<RoundResult["qualitySummary"]>;
  const paragraphSplitSummary = compareData?.paragraphSplitSummary ?? qualitySummary.paragraphSplitSummary;
  const candidateMode = qualitySummary.rewriteCandidateMode ?? modelConfig.rewriteCandidateMode ?? "economy";
  const candidateMaxPerChunk = qualitySummary.candidateMaxPerChunk ?? (candidateMode === "quality" ? 2 : 1);
  const chunkCount = compareData?.chunkCount ?? qualitySummary.paragraphSplitSummary?.chunkCount ?? roundResult?.inputSegmentCount ?? null;
  return {
    ...(roundResult?.runAudit ?? {}),
    promptProfile: compareData?.promptProfile ?? modelConfig.promptProfile,
    promptSequence: normalizePromptSequence(compareData?.promptSequence ?? modelConfig.promptSequence),
    rewriteCandidateMode: candidateMode,
    candidateMaxPerChunk,
    estimatedApiCalls: qualitySummary.estimatedApiCalls ?? (chunkCount ? chunkCount * candidateMaxPerChunk : null),
    twoCandidateChunkCount: qualitySummary.twoCandidateChunkCount ?? null,
    chunkCount,
    paragraphCount: compareData?.paragraphCount ?? qualitySummary.paragraphSplitSummary?.paragraphCount ?? roundResult?.paragraphCount ?? null,
    splitParagraphCount: paragraphSplitSummary?.splitParagraphCount ?? null,
    validationRetryCount: qualitySummary.validationRetryCount ?? 0,
    sourceFallbackCount: qualitySummary.sourceFallbackCount ?? 0,
    validationEventCount: qualitySummary.validationEventCount ?? compareData?.validationEvents?.length ?? 0,
    machineLikeRiskCount: qualitySummary.machineLikeRiskCount ?? null,
    protectedTokenCount: qualitySummary.protectedTokenCount ?? null,
  };
}

function buildExportRiskMessages(compareData: RoundCompareData | null, exportResult: ExportResult | null): string[] {
  const stats = buildQualityStats(compareData, exportResult);
  const messages: string[] = [];
  if (stats.reviewChunkCount > 0) messages.push(`${stats.reviewChunkCount} 个 Diff 块仍标记为需处理`);
  if (stats.missingCitationCount > 0) messages.push(`${stats.missingCitationCount} 处引用可能缺失`);
  if (stats.machineLikeRiskCount > 0) messages.push(`${stats.machineLikeRiskCount} 条表达提示`);
  if (stats.guardIssueCount > 0) messages.push(`${stats.guardIssueCount} 个导出硬审计问题`);
  if (stats.preflightIssueCount > 0) messages.push(`${stats.preflightIssueCount} 个排版预检问题`);
  if (stats.auditIssueCount > 0) messages.push(`${stats.auditIssueCount} 个保护区审计问题`);
  return messages;
}

function buildExportRiskConfirmOptions(label: string, compareData: RoundCompareData | null, exportResult: ExportResult | null): ConfirmDialogOptions | null {
  const messages = buildExportRiskMessages(compareData, exportResult);
  if (!messages.length) return null;
  return {
    title: `${label} 前仍有风险`,
    description: "建议先确认下面的问题；如果你已经人工检查过，也可以继续导出。",
    details: messages,
    confirmLabel: "继续导出",
    cancelLabel: "先不导出",
    tone: "warning",
  };
}

function splitConfirmText(text: string): { description: string; details: string[] } {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return {
    description: lines[0] ?? "",
    details: lines.slice(1).map((line) => line.replace(/^【(.+)】$/, "$1")),
  };
}

function loadStoredFormatRules(key: string): FormatRules | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as FormatRules : null;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

function normalizeFormatParserRoute(value: unknown): FormatParserModelRoute {
  if (!value || typeof value !== "object") {
    return { providerId: FORMAT_PARSER_DEFAULT_PROVIDER_ID, model: "" };
  }
  const route = value as Partial<FormatParserModelRoute>;
  return {
    providerId: String(route.providerId || FORMAT_PARSER_DEFAULT_PROVIDER_ID),
    model: String(route.model || ""),
  };
}

function loadStoredFormatParserRoute(): FormatParserModelRoute {
  try {
    const raw = localStorage.getItem(FORMAT_RULE_MODEL_ROUTE_KEY);
    return normalizeFormatParserRoute(raw ? JSON.parse(raw) : null);
  } catch {
    localStorage.removeItem(FORMAT_RULE_MODEL_ROUTE_KEY);
    return { providerId: FORMAT_PARSER_DEFAULT_PROVIDER_ID, model: "" };
  }
}

function saveStoredFormatParserRoute(route: FormatParserModelRoute) {
  localStorage.setItem(FORMAT_RULE_MODEL_ROUTE_KEY, JSON.stringify(normalizeFormatParserRoute(route)));
}

function normalizeDetectionDocumentKey(value: string | null | undefined): string {
  return String(value ?? "").trim().replace(/\\/g, "/").toLowerCase();
}

function getAutoRunScopeKey(sourcePath: string, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, round: number): string {
  const promptSequence = (config.promptSequence ?? []).join(">");
  return [normalizeDetectionDocumentKey(sourcePath), config.promptProfile, promptSequence, round].join("::");
}

function isCountdownAutoAction(action: PendingAutoAction | null): action is PendingAutoRetryAction | PendingAutoNextRoundAction {
  return Boolean(action && (action.kind === "retry" || action.kind === "next-round"));
}

function getPendingAutoActionPercent(action: PendingAutoAction): number | undefined {
  if (!isCountdownAutoAction(action) || action.delaySeconds <= 0) {
    return undefined;
  }
  return clampPercent(Math.round(((action.delaySeconds - action.secondsRemaining) / action.delaySeconds) * 100));
}

function getPendingAutoActionTitle(action: PendingAutoAction): string {
  if (action.kind === "retry") {
    return `第 ${action.round} 轮中断恢复`;
  }
  if (action.kind === "next-round") {
    return `第 ${action.completedRound} 轮已完成`;
  }
  return `第 ${action.round} 轮等待人工介入`;
}

function formatPendingAutoActionStatus(action: PendingAutoAction): string {
  if (action.kind === "retry") {
    return `将在 ${action.secondsRemaining} 秒后自动重跑，第 ${action.attempt}/${action.maxAttempts} 次`;
  }
  if (action.kind === "next-round") {
    return `将在 ${action.secondsRemaining} 秒后自动进入第 ${action.round} 轮`;
  }
  return `自动重跑 ${action.attempts}/${action.maxAttempts} 次仍中断，等待人工处理`;
}

function formatPendingAutoActionDetail(action: PendingAutoAction): string {
  if (action.kind === "retry") {
    return `${formatFileScopeLabel(action.sourcePath)} · ${action.reason || "运行通道被迫中断，已保留断点"}`;
  }
  if (action.kind === "next-round") {
    return `${formatFileScopeLabel(action.sourcePath)} · 第 ${action.completedRound} 轮完成后自动续跑`;
  }
  return `${formatFileScopeLabel(action.sourcePath)} · ${action.reason || "连续中断，需要检查模型、网络或断点状态"}`;
}

function isInterruptedRunMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return lowered.includes("interrupted")
    || lowered.includes("progress channel disconnected")
    || lowered.includes("backend restarted")
    || message.includes("已中断")
    || message.includes("中断")
    || message.includes("断开");
}

function isResumableRunMessage(message: string): boolean {
  const lowered = message.toLowerCase();
  return isInterruptedRunMessage(message)
    || lowered.includes("completed chunks are kept")
    || lowered.includes("checkpoint")
    || message.includes("断点")
    || message.includes("已完成的分块")
    || message.includes("已完成的块")
    || message.includes("续跑");
}

function readStoredDetectionReport(): StoredDetectionReport | null {
  try {
    const raw = localStorage.getItem(DETECTION_REPORT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed
      && typeof parsed === "object"
      && typeof parsed.documentSourcePath === "string"
      && parsed.report
      && Array.isArray(parsed.report.segments)
    ) {
      return parsed as StoredDetectionReport;
    }
    localStorage.removeItem(DETECTION_REPORT_KEY);
    return null;
  } catch {
    localStorage.removeItem(DETECTION_REPORT_KEY);
    return null;
  }
}

function loadStoredDetectionReportForDocument(sourcePath: string | null | undefined, docId?: string | null): DetectionReport | null {
  const stored = readStoredDetectionReport();
  if (!stored || !sourcePath) {
    return null;
  }
  const currentSourceKey = normalizeDetectionDocumentKey(sourcePath);
  const currentDocKey = normalizeDetectionDocumentKey(docId);
  const storedSourceKey = normalizeDetectionDocumentKey(stored.documentSourcePath);
  const storedDocKey = normalizeDetectionDocumentKey(stored.documentDocId);
  if (storedSourceKey === currentSourceKey || Boolean(currentDocKey && storedDocKey === currentDocKey)) {
    return stored.report;
  }
  return null;
}

function saveStoredDetectionReport(report: DetectionReport | null, document: DocumentStatus | null) {
  if (report && document) {
    const payload: StoredDetectionReport = {
      documentSourcePath: document.sourcePath,
      documentDocId: document.docId,
      report,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(DETECTION_REPORT_KEY, JSON.stringify(payload));
  } else {
    localStorage.removeItem(DETECTION_REPORT_KEY);
  }
}

function compareDataMatchesDocument(compareData: RoundCompareData | null, document: DocumentStatus | null): boolean {
  if (!compareData || !document) {
    return false;
  }
  const compareDocKey = normalizeDetectionDocumentKey(compareData.docId);
  const documentDocKey = normalizeDetectionDocumentKey(document.docId);
  if (compareDocKey && documentDocKey) {
    return compareDocKey === documentDocKey;
  }
  const sourceKey = normalizeDetectionDocumentKey(document.sourcePath);
  const inputKey = normalizeDetectionDocumentKey(compareData.inputPath);
  const outputKey = normalizeDetectionDocumentKey(compareData.outputPath);
  return Boolean(sourceKey && (documentRefsMatch(sourceKey, inputKey) || documentRefsMatch(sourceKey, outputKey)));
}

function persistActiveDocument(sourcePath: string, promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[] = DEFAULT_PROMPT_SEQUENCE) {
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, sourcePath);
  localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, promptProfile);
  localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(normalizePromptSequence(promptSequence)));
}

function readAutoSnapshotSuppression(): AutoSnapshotSuppression | null {
  try {
    const raw = localStorage.getItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AutoSnapshotSuppression>;
    if (!parsed.sourcePath || !isPromptProfile(parsed.promptProfile)) {
      localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
      return null;
    }
    return {
      sourcePath: parsed.sourcePath,
      docId: parsed.docId ?? "",
      promptProfile: parsed.promptProfile,
      promptSequence: normalizePromptSequence(parsed.promptSequence),
      round: typeof parsed.round === "number" ? parsed.round : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    return null;
  }
}

function suppressAutoSnapshotRestore(status: DocumentStatus, config: ModelConfig, round: number | null) {
  const payload: AutoSnapshotSuppression = {
    sourcePath: status.sourcePath,
    docId: status.docId,
    promptProfile: config.promptProfile,
    promptSequence: normalizePromptSequence(config.promptSequence),
    round,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(AUTO_SNAPSHOT_SUPPRESSION_KEY, JSON.stringify(payload));
}

function clearAutoSnapshotSuppression() {
  localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
}

function shouldSuppressAutoSnapshotRestore(status: DocumentStatus, config: ModelConfig): boolean {
  const suppression = readAutoSnapshotSuppression();
  if (!suppression) {
    return false;
  }
  return (
    suppression.promptProfile === config.promptProfile
    && promptSequencesEqual(suppression.promptSequence, config.promptSequence)
    && (
      documentRefsMatch(suppression.sourcePath, status.sourcePath)
      || documentRefsMatch(suppression.docId, status.docId)
    )
  );
}

type DetectionMatchCandidate = {
  chunkId: string;
  score: number;
  baseScore: number;
  directScore: number;
  windowScore: number;
  directFragmentScore: number;
  windowFragmentScore: number;
  matchedAnchors: string[];
  matchedFragments: string[];
  chunkOffset: number;
};

function normalizeForDetectionMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/bi-ls\s*tm/g, "bi-lstm")
    .replace(/bi\s*-\s*lstm/g, "bi-lstm")
    .replace(/str\s*eamlit/g, "streamlit")
    .replace(/stream\s*lit/g, "streamlit")
    .replace(/bert4\s+rec/g, "bert4rec")
    .replace(/f1\s*-\s*score/g, "f1score")
    .replace(/xg\s*boost/g, "xgboost")
    .replace(/random\s+forest/g, "randomforest")
    .replace(/@@fyadr_[a-z0-9_]+@@/g, "")
    .replace(/\s+/g, "")
    .replace(/[，。！？；：、,.!?;:'"“”‘’()[\]{}<>《》\-—_\\/|`~@#$%^&*+=]/g, "")
    .replace(/[^a-z0-9\p{Script=Han}]/gu, "");
}

function buildNgrams(value: string, size = 8): Set<string> {
  const normalized = normalizeForDetectionMatch(value);
  const grams = new Set<string>();
  if (normalized.length <= size) {
    if (normalized) grams.add(normalized);
    return grams;
  }
  for (let index = 0; index <= normalized.length - size; index += 1) {
    grams.add(normalized.slice(index, index + size));
  }
  return grams;
}

function scoreNgramOverlap(segmentText: string, chunkText: string, size: number): number {
  const segmentGrams = buildNgrams(segmentText, size);
  const chunkGrams = buildNgrams(chunkText, size);
  if (!segmentGrams.size || !chunkGrams.size) return 0;
  let overlap = 0;
  for (const gram of segmentGrams) {
    if (chunkGrams.has(gram)) overlap += 1;
  }
  return overlap / Math.min(segmentGrams.size, chunkGrams.size);
}

function extractDetectionAnchors(value: string): string[] {
  const raw = value.normalize("NFKC");
  const anchors = new Set<string>();
  const fixedTerms = [
    "用户行为序列",
    "购买意图",
    "特征工程",
    "数据预处理",
    "类别不平衡",
    "实验结果",
    "准确率",
    "召回率",
    "特征重要性",
    "可视化",
    "模型部署",
    "Streamlit",
    "Random Forest",
    "XGBoost",
    "LSTM",
    "Bi-LSTM",
    "AUC",
    "F1-Score",
    "Accuracy",
    "Recall",
  ];
  for (const term of fixedTerms) {
    const normalized = normalizeForDetectionMatch(term);
    if (normalized && normalizeForDetectionMatch(raw).includes(normalized)) anchors.add(normalized);
  }
  for (const match of raw.matchAll(/(?:图|表)\s*\d+(?:\s*[-－]\s*\d+)?|\[[0-9,，\s-]+\]|\d+\.\d+%?|\d+%/g)) {
    const normalized = normalizeForDetectionMatch(match[0]);
    if (normalized.length >= 2) anchors.add(normalized);
  }
  for (const match of raw.matchAll(/[A-Za-z][A-Za-z0-9+.#/-]{2,}/g)) {
    const normalized = normalizeForDetectionMatch(match[0]);
    if (normalized.length >= 3 && !["this", "that", "with", "from", "into", "then", "than", "also"].includes(normalized)) {
      anchors.add(normalized);
    }
  }
  return [...anchors].slice(0, 36);
}

function scoreAnchorOverlap(segmentText: string, chunkText: string): number {
  const anchors = extractDetectionAnchors(segmentText);
  if (!anchors.length) return 0;
  const chunk = normalizeForDetectionMatch(chunkText);
  let hits = 0;
  for (const anchor of anchors) {
    if (chunk.includes(anchor)) hits += 1;
  }
  return hits / anchors.length;
}

function formatDetectionAnchor(anchor: string): string {
  const labels: Record<string, string> = {
    bilstm: "Bi-LSTM",
    lstm: "LSTM",
    xgboost: "XGBoost",
    randomforest: "Random Forest",
    streamlit: "Streamlit",
    f1score: "F1-Score",
    auc: "AUC",
    accuracy: "Accuracy",
    recall: "Recall",
    用户行为序列: "用户行为序列",
    购买意图: "购买意图",
    特征工程: "特征工程",
    数据预处理: "数据预处理",
    类别不平衡: "类别不平衡",
    实验结果: "实验结果",
    准确率: "准确率",
    召回率: "召回率",
    特征重要性: "特征重要性",
    可视化: "可视化",
    模型部署: "模型部署",
  };
  return labels[anchor] ?? anchor;
}

function collectMatchedDetectionAnchors(segmentText: string, chunkText: string): string[] {
  const anchors = extractDetectionAnchors(segmentText);
  if (!anchors.length) return [];
  const chunk = normalizeForDetectionMatch(chunkText);
  return anchors
    .filter((anchor) => chunk.includes(anchor))
    .map(formatDetectionAnchor)
    .filter((anchor, index, items) => items.indexOf(anchor) === index)
    .slice(0, 8);
}

function buildDetectionFragments(value: string): string[] {
  const normalized = normalizeForDetectionMatch(value);
  if (normalized.length < 16) return normalized ? [normalized] : [];
  const size = normalized.length >= 220 ? 18 : normalized.length >= 120 ? 14 : 10;
  const positions = new Set<number>([
    0,
    Math.floor(normalized.length * 0.18),
    Math.floor(normalized.length * 0.38),
    Math.floor(normalized.length * 0.58),
    Math.floor(normalized.length * 0.78),
    Math.max(0, normalized.length - size),
  ]);
  return [...positions]
    .map((position) => normalized.slice(position, position + size))
    .filter((fragment) => fragment.length >= Math.min(8, size));
}

function scoreFragmentCoverage(segmentText: string, chunkText: string): number {
  const fragments = buildDetectionFragments(segmentText);
  if (!fragments.length) return 0;
  const chunk = normalizeForDetectionMatch(chunkText);
  let hits = 0;
  for (const fragment of fragments) {
    if (chunk.includes(fragment)) hits += 1;
  }
  return hits / fragments.length;
}

function addDetectionQuoteFragment(fragments: Set<string>, fragment: string) {
  const normalized = normalizeForDetectionMatch(fragment);
  if (normalized.length < 18) return;
  if ([...fragments].some((item) => item.includes(normalized) || normalized.includes(item))) return;
  fragments.add(normalized);
}

function buildDetectionQuoteFragments(value: string): string[] {
  const normalizedFullText = normalizeForDetectionMatch(value);
  if (!normalizedFullText) return [];
  const fragments = new Set<string>();
  const sentencePieces = value
    .normalize("NFKC")
    .replace(/[\r\n]+/g, " ")
    .split(/[。！？；;!?]+/g)
    .map((piece) => piece.trim())
    .filter(Boolean);

  for (const piece of sentencePieces) {
    const normalizedPiece = normalizeForDetectionMatch(piece);
    if (normalizedPiece.length < 18) continue;
    if (normalizedPiece.length <= 46) {
      addDetectionQuoteFragment(fragments, normalizedPiece);
      continue;
    }
    const size = normalizedPiece.length >= 90 ? 32 : 26;
    const positions = [
      0,
      Math.floor(normalizedPiece.length * 0.28),
      Math.floor(normalizedPiece.length * 0.56),
      Math.max(0, normalizedPiece.length - size),
    ];
    for (const position of positions) {
      addDetectionQuoteFragment(fragments, normalizedPiece.slice(position, position + size));
    }
  }

  if (!fragments.size && normalizedFullText.length >= 18) {
    const size = normalizedFullText.length >= 90 ? 32 : Math.min(46, normalizedFullText.length);
    const positions = [
      0,
      Math.floor(normalizedFullText.length * 0.3),
      Math.floor(normalizedFullText.length * 0.6),
      Math.max(0, normalizedFullText.length - size),
    ];
    for (const position of positions) {
      addDetectionQuoteFragment(fragments, normalizedFullText.slice(position, position + size));
    }
  }

  return [...fragments].slice(0, 28);
}

function scoreQuoteFragmentCoverage(segmentText: string, chunkText: string): { score: number; matchedFragments: string[] } {
  const fragments = buildDetectionQuoteFragments(segmentText);
  if (!fragments.length) return { score: 0, matchedFragments: [] };
  const chunk = normalizeForDetectionMatch(chunkText);
  const matchedFragments = fragments.filter((fragment) => chunk.includes(fragment));
  if (!matchedFragments.length) return { score: 0, matchedFragments: [] };
  const rawScore = matchedFragments.length / fragments.length;
  const singleHitPenalty = fragments.length >= 4 && matchedFragments.length === 1 ? 0.72 : 1;
  return {
    score: Math.min(1, rawScore * singleHitPenalty),
    matchedFragments: matchedFragments.slice(0, 5),
  };
}

function scoreDetectionMatch(segmentText: string, chunkText: string): number {
  const segment = normalizeForDetectionMatch(segmentText);
  const chunk = normalizeForDetectionMatch(chunkText);
  if (!segment || !chunk) return 0;
  if (chunk.includes(segment)) return 1;
  if (segment.includes(chunk)) {
    const coverage = chunk.length / Math.max(segment.length, 1);
    if (chunk.length >= 80) return Math.min(0.94, 0.72 + coverage * 0.26);
    if (chunk.length >= 42) return Math.min(0.88, 0.62 + coverage * 0.24);
    return Math.min(0.75, coverage);
  }
  return Math.max(
    scoreFragmentCoverage(segment, chunk) * 0.98,
    scoreAnchorOverlap(segmentText, chunkText) * 0.86,
    scoreNgramOverlap(segment, chunk, 12) * 0.98,
    scoreNgramOverlap(segment, chunk, 8),
    scoreNgramOverlap(segment, chunk, 5) * 0.95,
    scoreNgramOverlap(segment, chunk, 4) * 0.9,
    scoreNgramOverlap(segment, chunk, 3) * 0.8,
    scoreNgramOverlap(segment, chunk, 2) * 0.42,
  );
}

function scoreDetectionPosition(segmentIndex: number, segmentCount: number, chunkIndex: number, chunkCount: number): number {
  if (segmentCount <= 1 || chunkCount <= 1) return 0;
  const segmentPosition = segmentIndex / (segmentCount - 1);
  const chunkPosition = chunkIndex / (chunkCount - 1);
  return Math.max(0, 1 - Math.abs(segmentPosition - chunkPosition));
}

function scoreDetectionCandidate(
  segmentText: string,
  chunk: RoundCompareData["chunks"][number],
  sortedChunks: RoundCompareData["chunks"],
  segmentOffset: number,
  segmentCount: number,
  chunkOffset: number,
): DetectionMatchCandidate {
  const directOutputScore = scoreDetectionMatch(segmentText, chunk.outputText);
  const directInputScore = scoreDetectionMatch(segmentText, chunk.inputText) * 0.9;
  const directOutputFragments = scoreQuoteFragmentCoverage(segmentText, chunk.outputText);
  const directInputFragments = scoreQuoteFragmentCoverage(segmentText, chunk.inputText);
  const directScore = Math.max(directOutputScore, directInputScore);
  const previousChunk = sortedChunks[chunkOffset - 1];
  const nextChunk = sortedChunks[chunkOffset + 1];
  const outputWindow = [previousChunk?.outputText, chunk.outputText, nextChunk?.outputText].filter(Boolean).join("\n");
  const inputWindow = [previousChunk?.inputText, chunk.inputText, nextChunk?.inputText].filter(Boolean).join("\n");
  const directText = [chunk.outputText, chunk.inputText].filter(Boolean).join("\n");
  const windowText = [outputWindow, inputWindow].filter(Boolean).join("\n");
  const outputWindowFragments = scoreQuoteFragmentCoverage(segmentText, outputWindow);
  const inputWindowFragments = scoreQuoteFragmentCoverage(segmentText, inputWindow);
  const directFragmentScore = Math.max(directOutputFragments.score, directInputFragments.score * 0.72);
  const windowFragmentScore = Math.max(outputWindowFragments.score, inputWindowFragments.score * 0.68);
  const windowScore = Math.max(
    scoreDetectionMatch(segmentText, outputWindow) * (directScore >= 0.12 ? 0.94 : 0.68),
    scoreDetectionMatch(segmentText, inputWindow) * (directScore >= 0.12 ? 0.84 : 0.58),
  );
  const directEvidenceScore = directFragmentScore >= 0.18 ? directScore : directScore * 0.82;
  const windowEvidenceScore = windowFragmentScore >= 0.24 ? windowScore : windowScore * 0.76;
  const baseScore = Math.max(directEvidenceScore, windowEvidenceScore, directFragmentScore * 1.02, windowFragmentScore * 0.88);
  const positionScore = scoreDetectionPosition(segmentOffset, segmentCount, chunkOffset, sortedChunks.length);
  const positionBoost = baseScore >= 0.18 ? positionScore * 0.018 : positionScore * 0.035;
  const matchedFragments = directOutputFragments.matchedFragments.length
    ? directOutputFragments.matchedFragments
    : directInputFragments.matchedFragments.length
      ? directInputFragments.matchedFragments
      : outputWindowFragments.matchedFragments.length
        ? outputWindowFragments.matchedFragments
        : inputWindowFragments.matchedFragments;
  return {
    chunkId: chunk.chunkId,
    chunkOffset,
    baseScore,
    directScore,
    windowScore,
    directFragmentScore,
    windowFragmentScore,
    matchedAnchors: collectMatchedDetectionAnchors(segmentText, directText).length
      ? collectMatchedDetectionAnchors(segmentText, directText)
      : collectMatchedDetectionAnchors(segmentText, windowText),
    matchedFragments,
    score: Math.min(0.99, baseScore + positionBoost),
  };
}

function classifyDetectionCandidate(
  candidate: DetectionMatchCandidate,
  bestScore: number,
  runnerUpScore: number,
  segment: DetectionReportMatch["segment"],
  isBest: boolean,
): DetectionReportMatch["confidence"] | null {
  const risk = isDetectionRerunRisk(segment);
  const anchorCount = candidate.matchedAnchors.length;
  const fragmentCount = candidate.matchedFragments.length;
  const scoreGap = Math.max(0, bestScore - runnerUpScore);
  if (!risk) return null;
  if (
    candidate.score < 0.35
    && candidate.directScore < 0.22
    && candidate.directFragmentScore < 0.16
    && candidate.windowFragmentScore < 0.22
    && anchorCount < 2
  ) return null;

  const hasDecisiveLead = scoreGap >= 0.12 || runnerUpScore < 0.5;
  const hasDirectQuoteEvidence = candidate.directFragmentScore >= 0.42 || fragmentCount >= 2;
  const hasConcreteEvidence = hasDirectQuoteEvidence || candidate.directScore >= 0.86 || anchorCount >= 4;
  const hasCoveredChunkEvidence = candidate.directScore >= 0.78 && candidate.score >= 0.7 && (candidate.directFragmentScore >= 0.14 || anchorCount >= 2);
  if (
    isBest
    && candidate.directScore >= 0.96
    && candidate.score >= 0.92
    && (candidate.directFragmentScore >= 0.68 || candidate.windowFragmentScore >= 0.82 || fragmentCount >= 2)
  ) {
    return "strong";
  }
  if (
    isBest
    && candidate.directScore >= 0.9
    && candidate.windowScore >= 0.82
    && candidate.directFragmentScore >= 0.58
    && candidate.windowFragmentScore >= 0.58
  ) {
    return "strong";
  }
  if (isBest && candidate.score >= 0.74 && candidate.directScore >= 0.45 && hasDecisiveLead && hasConcreteEvidence) {
    return "strong";
  }
  if (isBest && candidate.directScore >= 0.84 && candidate.directFragmentScore >= 0.28 && scoreGap >= 0.06) {
    return "strong";
  }
  if (
    isBest
    && candidate.directScore >= 0.82
    && candidate.score >= 0.74
    && candidate.directFragmentScore >= 0.24
    && candidate.windowFragmentScore >= 0.55
  ) {
    return "strong";
  }
  if (
    !isBest
    && candidate.directScore >= 0.78
    && candidate.score >= 0.74
    && (candidate.directFragmentScore >= 0.14 || candidate.windowFragmentScore >= 0.55 || anchorCount >= 1)
  ) {
    return "strong";
  }
  if (isBest && candidate.score >= 0.55 && candidate.directScore >= 0.28 && (candidate.directFragmentScore >= 0.16 || anchorCount >= 1)) {
    return "review";
  }
  if (!isBest && hasCoveredChunkEvidence) {
    return "review";
  }
  if (isBest && candidate.windowFragmentScore >= 0.34 && candidate.score >= 0.48) {
    return "review";
  }
  if (isBest && candidate.score >= 0.62 && anchorCount >= 3 && scoreGap >= 0.08) {
    return "review";
  }
  if (isBest || candidate.directScore >= 0.3 || (candidate.score >= 0.5 && anchorCount >= 2)) {
    return "weak";
  }
  return null;
}

function buildDetectionMatchReason(
  confidence: DetectionReportMatch["confidence"],
  candidate: DetectionMatchCandidate,
  runnerUpScore: number,
): string {
  const direct = Math.round(candidate.directScore * 100);
  const window = Math.round(candidate.windowScore * 100);
  const directFragment = Math.round(candidate.directFragmentScore * 100);
  const windowFragment = Math.round(candidate.windowFragmentScore * 100);
  const gap = Math.round(Math.max(0, candidate.score - runnerUpScore) * 100);
  const anchors = candidate.matchedAnchors.length ? `，锚点：${candidate.matchedAnchors.join(" / ")}` : "";
  const fragmentNote = `，句段证据 ${directFragment}%/${windowFragment}%`;
  if (confidence === "strong") {
    return `强命中：文本重合 ${direct}%，窗口 ${window}%${fragmentNote}，领先 ${gap}%${anchors}`;
  }
  if (confidence === "review") {
    return `疑似命中：文本重合 ${direct}%，窗口 ${window}%${fragmentNote}，领先 ${gap}%${anchors}`;
  }
  return `仅参考：文本重合 ${direct}%，窗口 ${window}%${fragmentNote}，不自动重跑${anchors}`;
}

function buildDetectionMatches(report: DetectionReport | null, compareData: RoundCompareData | null): DetectionReportMatch[] {
  if (!report || !compareData?.chunks.length) return [];
  const matches: DetectionReportMatch[] = [];
  const sortedChunks = [...compareData.chunks].sort((left, right) => {
    if (left.paragraphIndex !== right.paragraphIndex) return left.paragraphIndex - right.paragraphIndex;
    return left.chunkIndex - right.chunkIndex;
  });
  for (const [segmentOffset, segment] of report.segments.entries()) {
    const segmentText = segment.matchText || segment.content;
    const candidates = sortedChunks
      .map((chunk, chunkOffset) => scoreDetectionCandidate(segmentText, chunk, sortedChunks, segmentOffset, report.segments.length, chunkOffset))
      .sort((left, right) => right.score - left.score);
    const bestScore = candidates[0]?.score ?? 0;
    const runnerUpScore = candidates[1]?.score ?? 0;
    const selected: DetectionReportMatch[] = [];
    for (const [candidateIndex, candidate] of candidates.entries()) {
      const confidence = classifyDetectionCandidate(candidate, bestScore, runnerUpScore, segment, candidateIndex === 0);
      if (!confidence) continue;
      if (candidateIndex > 0 && confidence === "weak") continue;
      selected.push({
        segment,
        chunkId: candidate.chunkId,
        score: Number(candidate.score.toFixed(3)),
        confidence,
        label: confidence === "strong" ? "强命中" : confidence === "review" ? "疑似命中" : "仅参考",
        reason: buildDetectionMatchReason(confidence, candidate, runnerUpScore),
        evidence: {
          directScore: Number(candidate.directScore.toFixed(3)),
          windowScore: Number(candidate.windowScore.toFixed(3)),
          directFragmentScore: Number(candidate.directFragmentScore.toFixed(3)),
          windowFragmentScore: Number(candidate.windowFragmentScore.toFixed(3)),
          runnerUpScore: Number(runnerUpScore.toFixed(3)),
          scoreGap: Number(Math.max(0, candidate.score - runnerUpScore).toFixed(3)),
          matchedAnchors: candidate.matchedAnchors,
          matchedFragments: candidate.matchedFragments,
        },
      });
      if (selected.length >= 3) break;
    }
    matches.push(...selected);
  }
  return matches;
}

function isDetectionHighRisk(segment: DetectionReportMatch["segment"]): boolean {
  if (segment.sourceProvider === "paperpass") return segment.probability >= 70;
  return segment.probability >= 90;
}

function isDetectionRerunRisk(segment: DetectionReportMatch["segment"]): boolean {
  if (segment.sourceProvider === "paperpass") return segment.probability >= 60;
  return segment.probability >= 70;
}

function groupDetectionMatchesByChunk(matches: DetectionReportMatch[]): Record<string, DetectionReportMatch[]> {
  return matches.reduce<Record<string, DetectionReportMatch[]>>((current, match) => {
    current[match.chunkId] = [...(current[match.chunkId] ?? []), match];
    return current;
  }, {});
}

function isReviewDecisionResolved(decision?: ReviewDecision): boolean {
  if (!decision) return false;
  if (typeof decision === "object") {
    return decision.source === "rejected_candidate" ? decision.confirmed === true : true;
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

function buildDiffDashboardStats(
  compareData: RoundCompareData | null,
  failures: DiffFailureLike[],
  matchesByChunk: Record<string, DetectionReportMatch[]>,
  reviewDecisions: Record<string, ReviewDecision>,
): DiffDashboardStats {
  if (!compareData?.chunks.length) {
    return {
      chunkCount: 0,
      reviewCount: 0,
      failedCount: 0,
      candidateCount: 0,
      preferredFilter: "all",
    };
  }
  const failureByChunk = new Map(failures.map((failure) => [failure.chunkId, failure]));
  const allCandidateChunkIds = compareData.chunks
    .filter((chunk) => (chunk.rejectedCandidates?.length ?? 0) > 0 || ((failureByChunk.get(chunk.chunkId)?.rejectedCandidates?.length ?? 0) > 0))
    .map((chunk) => chunk.chunkId);
  const allCandidateChunkIdSet = new Set(allCandidateChunkIds);
  const candidateChunkIds = compareData.chunks
    .filter((chunk) => allCandidateChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIds = compareData.chunks
    .filter((chunk) => {
      const flags = chunk.quality?.flags ?? [];
      const reportMatches = matchesByChunk[chunk.chunkId] ?? [];
      return !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
        || chunk.fallbackMode === "source"
        || flags.includes("source_fallback")
        || failureByChunk.has(chunk.chunkId)
        || allCandidateChunkIdSet.has(chunk.chunkId)
        || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review"));
    })
    .map((chunk) => chunk.chunkId);
  const failedChunkIds = failures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId);
  const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : candidateChunkIds.length ? "candidate" : reviewChunkIds.length ? "review" : "all";
  return {
    chunkCount: compareData.chunkCount ?? compareData.chunks.length,
    reviewCount: reviewChunkIds.length,
    failedCount: failedChunkIds.length,
    candidateCount: candidateChunkIds.length,
    preferredFilter,
    preferredChunkId: failedChunkIds[0] ?? candidateChunkIds[0] ?? reviewChunkIds[0],
  };
}

function getRiskyDetectionMatches(matches: DetectionReportMatch[]): DetectionReportMatch[] {
  return matches
    .filter((match) => isDetectionRerunRisk(match.segment) && match.confidence === "strong")
    .sort((left, right) => right.segment.probability - left.segment.probability);
}

function groupRiskyDetectionMatches(matches: DetectionReportMatch[]): DetectionReportMatch[][] {
  const grouped = getRiskyDetectionMatches(matches).reduce<Record<string, DetectionReportMatch[]>>((current, match) => {
    current[match.chunkId] = [...(current[match.chunkId] ?? []), match];
    return current;
  }, {});
  return Object.values(grouped).sort((left, right) => {
    const leftMax = Math.max(...left.map((match) => match.segment.probability));
    const rightMax = Math.max(...right.map((match) => match.segment.probability));
    return rightMax - leftMax;
  });
}

function buildDetectionRerunFeedback(chunkId: string, matches: DetectionReportMatch[], report: DetectionReport | null): string {
  const providerLabel = report?.providerLabel || report?.provider || matches[0]?.segment.sourceProvider || "未知报告";
  const scopeNotes = report?.summary.checkedScopeNotes?.length
    ? `报告范围提醒：${report.summary.checkedScopeNotes.join("；")}`
    : "";
  const riskLines = matches
    .slice(0, 4)
    .map((match) => {
      const page = match.segment.page ? `第 ${match.segment.page} 页，` : "";
      return `#${match.segment.index}：${page}${match.segment.probability}% ${match.segment.riskLevel || "风险片段"}，匹配度 ${Math.round(match.score * 100)}%，摘录：${match.segment.content.slice(0, 220)}`;
    })
    .join("\n");
  return [
    `外部报告反馈：来源 ${providerLabel}，当前 Diff 块 ${chunkId} 被强命中。处理方式为“局部小幅扰动”，不是重写整段。`,
    scopeNotes,
    riskLines,
    "重写要求：保留原文事实、术语、数值、引用、编号和段落角色；不要翻译英文；不要合并自然段；不要扩写新观点；不要把段落写得更完整。只调整句子入口、连接方式、局部词序和少量模板词，字数与原块接近。优先削弱报告暴露的具体模式：百科式定义、泛化技术说明、整齐总分结构、空泛价值判断、机械连接词、实验/图表脱节。",
  ].filter(Boolean).join("\n");
}

function saveStoredFormatRules(key: string, rules: FormatRules | null) {
  if (rules) {
    localStorage.setItem(key, JSON.stringify(rules));
  } else {
    localStorage.removeItem(key);
  }
}

function createLiveCompareData(status: DocumentStatus, round: number): RoundCompareData {
  return {
    version: 0,
    docId: status.docId,
    round,
    promptProfile: status.promptProfile,
    promptSequence: status.promptSequence,
    inputPath: status.currentInputPath,
    outputPath: status.currentOutputPath,
    manifestPath: status.manifestPath,
    paragraphCount: 0,
    chunkCount: 0,
    updatedAt: new Date().toISOString(),
    chunks: [],
  };
}

function buildRoundResultFromHistoryRound(roundItem: HistoryRound, compareData: RoundCompareData): RoundResult {
  return {
    round: roundItem.round,
    outputPath: roundItem.outputPath,
    manifestPath: roundItem.manifestPath,
    comparePath: roundItem.comparePath,
    qualityPath: roundItem.qualityPath,
    bodyMapPath: roundItem.bodyMapPath,
    validationPath: roundItem.validationPath,
    chunkLimit: roundItem.chunkLimit ?? 0,
    inputSegmentCount: roundItem.inputSegmentCount ?? compareData.chunkCount,
    outputSegmentCount: roundItem.outputSegmentCount ?? compareData.chunks.length,
    paragraphCount: compareData.paragraphCount,
    offlineMode: false,
    docEntry: {},
    roundContext: {},
    qualitySummary: compareData.qualitySummary,
  };
}

function buildRoundResultFromCompareData(compareData: RoundCompareData): RoundResult {
  return {
    round: compareData.round,
    outputPath: compareData.outputPath,
    manifestPath: compareData.manifestPath,
    comparePath: "",
    chunkLimit: compareData.chunkCount,
    inputSegmentCount: compareData.chunkCount,
    outputSegmentCount: compareData.chunks.length,
    paragraphCount: compareData.paragraphCount,
    offlineMode: false,
    docEntry: {},
    roundContext: {},
    qualitySummary: compareData.qualitySummary,
  };
}

function buildRoundResultFromRerunResult(result: RerunChunkResult, current: RoundResult | null): RoundResult {
  const fallback = buildRoundResultFromCompareData(result.compare);
  return {
    ...(current ?? fallback),
    round: result.compare.round,
    outputPath: result.outputPath,
    manifestPath: result.compare.manifestPath,
    comparePath: result.comparePath || current?.comparePath || fallback.comparePath,
    chunkLimit: result.compare.chunkCount,
    inputSegmentCount: result.compare.chunkCount,
    outputSegmentCount: result.compare.chunks.length,
    paragraphCount: result.compare.paragraphCount,
    qualitySummary: result.compare.qualitySummary,
  };
}

function buildRoundResultFromBatchRerunResult(result: BatchRerunResult, current: RoundResult | null): RoundResult | null {
  if (!result.compare) {
    return current;
  }
  const fallback = buildRoundResultFromCompareData(result.compare);
  return {
    ...(current ?? fallback),
    round: result.compare.round,
    outputPath: result.outputPath,
    manifestPath: result.compare.manifestPath,
    comparePath: result.comparePath || current?.comparePath || fallback.comparePath,
    chunkLimit: result.compare.chunkCount,
    inputSegmentCount: result.compare.chunkCount,
    outputSegmentCount: result.compare.chunks.length,
    paragraphCount: result.compare.paragraphCount,
    qualitySummary: result.compare.qualitySummary,
  };
}

type BatchRerunFailure = {
  chunkId: string;
  error: string;
  rejectedCandidates?: NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]>;
  rerunStatus?: string;
  rerunFallbackMode?: string;
  rerunFallbackError?: string;
  quality?: RoundCompareData["chunks"][number]["quality"];
  scopeKey?: string;
};

type RejectedCandidate = NonNullable<RoundCompareData["chunks"][number]["rejectedCandidates"]>[number];
type AdoptableRejectedCandidate = {
  chunkId: string;
  candidate: RejectedCandidate;
};

function getLatestRejectedCandidateForAdoption(candidates?: RejectedCandidate[]): RejectedCandidate | null {
  if (!candidates?.length) {
    return null;
  }
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const candidate = candidates[index];
    if (candidate?.outputText?.trim()) return candidate;
  }
  return null;
}

function collectAdoptableRejectedCandidates(
  compareData: RoundCompareData | null,
  failures: BatchRerunFailure[],
  reviewDecisions: Record<string, ReviewDecision>,
): AdoptableRejectedCandidate[] {
  if (!compareData?.chunks.length) {
    return [];
  }
  const failureByChunk = new Map(failures.map((failure) => [failure.chunkId, failure]));
  return compareData.chunks.flatMap((chunk) => {
    if (isReviewDecisionResolved(reviewDecisions[chunk.chunkId])) {
      return [];
    }
    const failureCandidates = failureByChunk.get(chunk.chunkId)?.rejectedCandidates;
    const candidates = chunk.rejectedCandidates?.length ? chunk.rejectedCandidates : failureCandidates;
    const candidate = getLatestRejectedCandidateForAdoption(candidates);
    return candidate ? [{ chunkId: chunk.chunkId, candidate }] : [];
  });
}

function buildRejectedCandidateReviewDecision(candidate: RejectedCandidate): ReviewDecision {
  return {
    mode: "custom",
    text: candidate.outputText,
    source: "rejected_candidate",
    confirmed: true,
    attempt: candidate.attempt,
    candidate: candidate.candidate,
    error: candidate.error,
  };
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function normalizeFailureRejectedCandidates(value: unknown): NonNullable<BatchRerunFailure["rejectedCandidates"]> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const candidates = value
    .map((item) => asPlainRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item, index) => ({
      attempt: typeof item.attempt === "number" ? item.attempt : undefined,
      candidate: typeof item.candidate === "number" ? item.candidate : index + 1,
      outputText: String(item.outputText ?? ""),
      outputCharCount: typeof item.outputCharCount === "number" ? item.outputCharCount : undefined,
      truncated: Boolean(item.truncated),
      error: typeof item.error === "string" ? item.error : undefined,
    }))
    .filter((item) => item.outputText.trim());
  return candidates.length ? candidates : undefined;
}

function extractRerunFailureExtras(error: unknown): Partial<BatchRerunFailure> {
  const payload = asPlainRecord((error as { payload?: unknown } | null)?.payload);
  const failure = asPlainRecord(payload?.failure);
  if (!failure) {
    return {};
  }
  const rejectedCandidates = normalizeFailureRejectedCandidates(failure.rejectedCandidates);
  const quality = asPlainRecord(failure.quality) as BatchRerunFailure["quality"] | null;
  return {
    ...(rejectedCandidates ? { rejectedCandidates } : {}),
    ...(typeof failure.rerunStatus === "string" ? { rerunStatus: failure.rerunStatus } : {}),
    ...(typeof failure.rerunFallbackMode === "string" ? { rerunFallbackMode: failure.rerunFallbackMode } : {}),
    ...(typeof failure.rerunFallbackError === "string" ? { rerunFallbackError: failure.rerunFallbackError } : {}),
    ...(quality ? { quality } : {}),
  };
}

function getRerunFailureScopeKey(compareData: RoundCompareData | null | undefined): string {
  if (!compareData) {
    return "";
  }
  return compareData.outputPath || compareData.manifestPath || `${compareData.docId}:${compareData.round}`;
}

function scopeRerunFailures(failures: BatchRerunFailure[], compareData: RoundCompareData | null | undefined): BatchRerunFailure[] {
  const scopeKey = getRerunFailureScopeKey(compareData);
  if (!scopeKey) {
    return [];
  }
  return failures
    .filter((failure) => failure.chunkId !== "预览刷新")
    .map((failure) => ({ ...failure, scopeKey }));
}

function formatBatchRerunFailures(failures: BatchRerunFailure[], limit = 3): string {
  if (!failures.length) {
    return "";
  }
  const preview = failures
    .slice(0, limit)
    .map((failure) => `${failure.chunkId}：${failure.error}`)
    .join("；");
  const more = failures.length > limit ? `；另有 ${failures.length - limit} 个失败` : "";
  return `${preview}${more}`;
}

function formatBatchRerunSummary(actionLabel: string, successCount: number, totalCount: number, failures: BatchRerunFailure[], suffix = ""): string {
  if (!failures.length) {
    return `已${actionLabel} ${successCount}/${totalCount} 个块。${suffix}`;
  }
  if (successCount > 0) {
    return `已${actionLabel} ${successCount}/${totalCount} 个块；失败 ${failures.length} 个：${formatBatchRerunFailures(failures)}。${suffix}`;
  }
  return `${actionLabel}全部失败：${formatBatchRerunFailures(failures)}。`;
}

function isPromptProfile(value: unknown): value is ModelConfig["promptProfile"] {
  return value === "cn" || value === "cn_prewrite" || value === "cn_custom";
}

function normalizeDocumentRef(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.\/+/, "").toLowerCase();
}

function documentRefsMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeDocumentRef(left);
  const b = normalizeDocumentRef(right);
  if (!a || !b) {
    return false;
  }
  return a === b || a.endsWith(`/${b}`) || b.endsWith(`/${a}`);
}

function historyItemMatchesDocument(item: HistoryDocumentSummary, status: DocumentStatus | null, sourcePath?: string): boolean {
  const documentRefs = [status?.docId, status?.sourcePath, sourcePath].filter(Boolean) as string[];
  const historyRefs = [item.docId, item.sourcePath, item.originPath].filter(Boolean);
  return documentRefs.some((documentRef) => historyRefs.some((historyRef) => documentRefsMatch(documentRef, historyRef)));
}

function waitForMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function sortHistoryRounds(rounds: HistoryRound[], strategy: "round" | "timestamp" = "round"): HistoryRound[] {
  return [...rounds]
    .filter((roundItem) => Boolean(roundItem.outputPath))
    .sort((left, right) => {
      const leftTime = Date.parse(left.timestamp || "");
      const rightTime = Date.parse(right.timestamp || "");
      const leftTimestamp = Number.isFinite(leftTime) ? leftTime : 0;
      const rightTimestamp = Number.isFinite(rightTime) ? rightTime : 0;
      if (strategy === "timestamp" && rightTimestamp !== leftTimestamp) {
        return rightTimestamp - leftTimestamp;
      }
      if (right.round !== left.round) {
        return right.round - left.round;
      }
      return rightTimestamp - leftTimestamp;
    });
}

function historyRoundMatchesPrompt(roundItem: HistoryRound, promptProfile: ModelConfig["promptProfile"], promptSequence: PromptId[]): boolean {
  if ((roundItem.promptProfile || "cn") !== promptProfile) {
    return false;
  }
  if (promptProfile !== "cn_custom") {
    return true;
  }
  return promptSequencesEqual(roundItem.promptSequence, promptSequence);
}

function getLatestHistoryRound(
  item: HistoryDocumentSummary,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[],
  allowProfileFallback: boolean,
): HistoryRound | null {
  const profileRound = sortHistoryRounds(
    item.rounds.filter((roundItem) => historyRoundMatchesPrompt(roundItem, promptProfile, promptSequence)),
  )[0];
  if (profileRound || !allowProfileFallback) {
    return profileRound ?? null;
  }
  return (
    item.rounds.find((roundItem) => roundItem.outputPath && roundItem.outputPath === item.latestOutputPath)
    ?? sortHistoryRounds(item.rounds, "timestamp")[0]
    ?? null
  );
}

function resolveRestoredPromptProfile(
  storedPromptProfile: string | null,
  matchedItem: HistoryDocumentSummary | undefined,
  fallbackProfile: ModelConfig["promptProfile"],
): ModelConfig["promptProfile"] {
  if (isPromptProfile(storedPromptProfile)) {
    if (!matchedItem || matchedItem.rounds.some((roundItem) => (roundItem.promptProfile || "cn") === storedPromptProfile)) {
      return storedPromptProfile;
    }
  }
  const latestRound = matchedItem ? sortHistoryRounds(matchedItem.rounds, "timestamp")[0] : null;
  return isPromptProfile(latestRound?.promptProfile) ? latestRound.promptProfile : fallbackProfile;
}

function mergeProgressIntoCompareData(current: RoundCompareData | null, progress: RoundProgress, fallback: RoundCompareData): RoundCompareData {
  if (!progress.compareInputText || !progress.compareOutputText || !progress.chunkId) {
    return current ?? fallback;
  }

  const base = current ?? fallback;
  const nextChunk = {
    chunkId: progress.chunkId,
    paragraphIndex: progress.paragraphIndex ?? 0,
    chunkIndex: progress.chunkIndex ?? 0,
    inputText: progress.compareInputText,
    outputText: progress.compareOutputText,
    inputCharCount: progress.compareInputText.length,
    outputCharCount: progress.compareOutputText.length,
  };
  const chunks = [...base.chunks];
  const existingIndex = chunks.findIndex((chunk) => chunk.chunkId === nextChunk.chunkId);
  if (existingIndex >= 0) {
    chunks[existingIndex] = { ...chunks[existingIndex], ...nextChunk };
  } else {
    chunks.push(nextChunk);
  }
  chunks.sort((left, right) => left.paragraphIndex - right.paragraphIndex || left.chunkIndex - right.chunkIndex);

  return {
    ...base,
    outputPath: progress.outputPath || base.outputPath,
    paragraphCount: Math.max(base.paragraphCount, progress.paragraphCount ?? 0),
    chunkCount: Math.max(base.chunkCount, progress.totalChunks ?? chunks.length),
    updatedAt: new Date().toISOString(),
    chunks,
  };
}

function getProgressPosition(progress: RoundProgress | null): number {
  if (!progress) {
    return 0;
  }
  return progress.currentChunk ?? progress.completedChunks ?? 0;
}

function mergeVisibleProgress(current: RoundProgress | null, next: RoundProgress): RoundProgress {
  if (!current) {
    return next;
  }
  if (next.phase === "cancel-requested") {
    return {
      ...current,
      phase: "cancel-requested",
    };
  }
  if (current.round !== next.round || current.totalChunks !== next.totalChunks) {
    return next;
  }
  const currentPosition = getProgressPosition(current);
  const nextPosition = getProgressPosition(next);
  if (currentPosition > 0 && next.phase === "chunking-ready") {
    return current;
  }
  if (next.phase === "chunk-complete" && nextPosition > 0 && nextPosition < currentPosition) {
    return current;
  }
  return next;
}

function createCheckpointProgress(
  status: RoundProgressStatus | null,
  rewriteCandidateMode: ModelConfig["rewriteCandidateMode"],
): RoundProgress | null {
  if (!status?.canResume || !status.round) {
    return null;
  }
  const candidateMode = rewriteCandidateMode === "quality" ? "quality" : "economy";
  const candidateMaxPerChunk = candidateMode === "quality" ? 2 : 1;
  return {
    phase: "resuming-from-checkpoint",
    round: status.round,
    currentChunk: status.completedChunks,
    completedChunks: status.completedChunks,
    totalChunks: status.totalChunks || undefined,
    checkpointPath: status.checkpointPath,
    error: status.lastError || undefined,
    nextChunkId: status.nextChunkId,
    nextChunkIndex: status.nextChunkIndex,
    remainingChunks: status.remainingChunks,
    resumeStage: status.resumeStage,
    resumeActionLabel: status.resumeActionLabel,
    resumeExplanation: status.resumeExplanation,
    rewriteCandidateMode: candidateMode,
    candidateMaxPerChunk,
    estimatedApiCalls: status.totalChunks ? status.totalChunks * candidateMaxPerChunk : undefined,
  };
}

function sameWorkspacePath(left: string | undefined | null, right: string | undefined | null): boolean {
  const normalize = (value: string | undefined | null) => String(value || "").replace(/\\/g, "/").toLowerCase();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}


function formatRuntimeStep(progress: RoundProgress | null, fallback: string): string {
  if (!progress) {
    return fallback;
  }
  if (progress.phase === "chunking-ready" && progress.totalChunks) {
    const estimateText = progress.estimatedApiCalls
      ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用`
      : "";
    const candidateText = progress.rewriteCandidateMode === "quality" ? "质量模式" : "省钱模式";
    return `已完成切块，共 ${progress.totalChunks} 个分块，${candidateText}${estimateText}，准备开始第 ${progress.round} 轮。`;
  }
  if (progress.phase === "resuming-from-checkpoint" && progress.completedChunks && progress.totalChunks) {
    if (progress.resumeStage === "finalize_output") {
      return `检测到第 ${progress.round} 轮所有分块已落盘，正在继续收尾，不会重跑已完成分块。`;
    }
    if (progress.resumeActionLabel) {
      return `检测到断点续跑，${progress.resumeActionLabel}，已复用 ${progress.completedChunks}/${progress.totalChunks} 个分块结果。`;
    }
    return `检测到断点续跑，已复用 ${progress.completedChunks}/${progress.totalChunks} 个分块结果。`;
  }
  if (progress.phase === "processing-chunk" && progress.currentChunk && progress.totalChunks) {
    const callText = progress.estimatedApiCalls ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用` : "";
    return `正在执行第 ${progress.round} 轮，第 ${progress.currentChunk}/${progress.totalChunks} 个分块${callText}。`;
  }
  if (progress.phase === "chunk-complete" && progress.currentChunk && progress.totalChunks) {
    return `第 ${progress.round} 轮已完成 ${progress.currentChunk}/${progress.totalChunks} 个分块。`;
  }
  if (progress.phase === "chunk-failed" && progress.currentChunk && progress.totalChunks) {
    return `第 ${progress.round} 轮在第 ${progress.currentChunk}/${progress.totalChunks} 个分块失败，但当前进度已经保住。`;
  }
  if (progress.phase === "cancel-requested") {
    return "正在中断当前轮次，已完成分块会保留。";
  }
  if (progress.phase === "restoring-output") {
    return `第 ${progress.round} 轮分块处理完成，正在合并输出。`;
  }
  return fallback;
}

function describePromptProfile(promptProfile: ModelConfig["promptProfile"]): string {
  if (promptProfile === "cn_custom") {
    return "自定义组合";
  }
  if (promptProfile === "cn_prewrite") {
    return "中文三轮预改写";
  }
  return "中文双轮";
}

function describeDocumentProgress(nextRound: number | null, hasNextRound: boolean): string {
  if (hasNextRound && nextRound) {
    return `当前可执行第 ${nextRound} 轮。`;
  }
  return "当前文档已完成全部轮次。";
}

function formatExportNotice(result: ExportResult, label?: string): string {
  const parts = [label ? `${label} 已导出 ${result.format.toUpperCase()}` : `已导出 ${result.format.toUpperCase()}`];

  if (result.format === "docx") {
    if (result.formatMode) {
      parts.push("排版模式：内置学校规范。");
    }
    if (result.formatScope === "editable_body_only") {
      parts.push("排版仅作用于可编辑正文段落，目录、图表、表格和参考文献保持原样。");
    }
    if (result.layoutMode === "body-map-roundtrip") {
      parts.push("已按 DOCX 正文映射回填，多轮改写后也优先保留原始结构。");
    } else if (result.layoutMode === "snapshot-compare-reflow") {
      parts.push("已按原始 Word 结构回填，并基于当前轮次结果重组正文。");
    } else if (result.layoutMode === "snapshot-roundtrip") {
      parts.push("已按原始 Word 结构回填，封面、目录和非正文结构会尽量保留。");
    } else if (result.layoutMode === "plain_text_docx") {
      parts.push("当前导出为普通 Word 文本文件，不包含原始 DOCX 结构回填。");
    }

    if (result.validationPath) {
      parts.push("本轮已生成结构校验记录。");
    }
    if (result.guardPath) {
      parts.push(`导出硬审计通过：${result.guardIssueCount ?? 0} 个问题。`);
    }
    if (result.auditPath) {
      parts.push(`保护区审计通过：${result.auditIssueCount ?? 0} 个问题。`);
    }
  }

  parts.push(`文件：${formatFileScopeLabel(result.path)}`);
  return parts.join(" ");
}

function formatDocLabel(docId: string | null | undefined): string {
  if (!docId) {
    return "未载入文档";
  }
  const normalized = docId.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? docId;
}

function formatFileScopeLabel(path: string | null | undefined): string {
  if (!path) {
    return "文件未生成";
  }
  const normalized = path.replace(/\\/g, "/");
  const filename = formatDocLabel(normalized);
  if (normalized.includes("/finish/web_exports/") || normalized.startsWith("finish/web_exports/")) {
    return `导出文件 · ${filename}`;
  }
  if (normalized.includes("/finish/intermediate/") || normalized.startsWith("finish/intermediate/")) {
    return `中间文件 · ${filename}`;
  }
  if (normalized.includes("/origin/") || normalized.startsWith("origin/")) {
    return `源文档 · ${filename}`;
  }
  return filename;
}

function loadNotificationHistory(): AppNotification[] {
  try {
    const raw = localStorage.getItem(NOTIFICATION_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? dedupeNotifications(parsed).slice(0, 80) : [];
  } catch {
    return [];
  }
}

function saveNotificationHistory(items: AppNotification[]) {
  localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(dedupeNotifications(items).slice(0, 80)));
}

function getNotificationKey(item: Pick<AppNotification, "kind" | "text">): string {
  return `${item.kind}:${item.text.trim()}`;
}

function dedupeNotifications(items: AppNotification[]): AppNotification[] {
  const seen = new Set<string>();
  const normalized: AppNotification[] = [];
  for (const item of items) {
    if (!item?.text) {
      continue;
    }
    const key = getNotificationKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(item);
  }
  return normalized;
}

function createNotification(kind: NotificationKind, text: string): AppNotification {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    title: kind === "error" ? "当前有错误" : "最新消息",
    text,
    time: new Date().toISOString(),
    read: false,
  };
}

function buildRunRecoveryPanelState(input: {
  running: boolean;
  progress: RoundProgress | null;
  activeRunStatus: NonNullable<RoundProgressStatus["activeRun"]> | null;
  resumableCheckpoint: RoundProgressStatus | null;
  nextRound?: number | null;
}): RunRecoveryPanelState | null {
  const activeProgress = input.progress ?? input.activeRunStatus?.lastEvent ?? null;
  const checkpoint = input.resumableCheckpoint;
  const completedChunks = Number(
    activeProgress?.currentChunk
    ?? activeProgress?.completedChunks
    ?? checkpoint?.completedChunks
    ?? 0,
  ) || 0;
  const totalChunks = Number(activeProgress?.totalChunks ?? checkpoint?.totalChunks ?? 0) || 0;
  const percent = totalChunks ? Math.max(0, Math.min(100, Math.round((completedChunks / totalChunks) * 100))) : 0;
  const phaseLabel = activeProgress?.phase || input.activeRunStatus?.status || (checkpoint ? "checkpoint" : "");
  if (input.running) {
    const canceling = activeProgress?.phase === "cancel-requested" || input.activeRunStatus?.cancelRequested;
    return {
      title: canceling ? "正在中断当前轮" : "当前轮次运行中",
      message: canceling ? "等待安全点落盘。" : "进度同步中。",
      tone: canceling ? "red" : "blue",
      phaseLabel,
      actionHint: "",
      resumeActionLabel: activeProgress?.resumeActionLabel,
      resumeExplanation: activeProgress?.resumeExplanation,
      nextChunkId: activeProgress?.nextChunkId,
      nextChunkIndex: activeProgress?.nextChunkIndex,
      remainingChunks: activeProgress?.remainingChunks,
      completedChunks,
      totalChunks,
      percent,
      eventCount: input.activeRunStatus?.eventCount,
      error: activeProgress?.error || input.activeRunStatus?.error || undefined,
    };
  }
  if (input.activeRunStatus) {
    return {
      title: "检测到后台运行",
      message: "后端仍有同一文档的活跃任务，前端会优先接管它，避免重复启动。",
      tone: input.activeRunStatus.cancelRequested ? "red" : "blue",
      phaseLabel,
      actionHint: "等待自动接管；如果长时间不动，刷新状态后再判断是否继续。",
      completedChunks,
      totalChunks,
      percent,
      eventCount: input.activeRunStatus.eventCount,
      error: input.activeRunStatus.error || undefined,
    };
  }
  if (checkpoint) {
    const allChunksDone = checkpoint.resumeStage === "finalize_output";
    const resumeActionLabel = checkpoint.resumeActionLabel || (allChunksDone ? "继续收尾" : "继续当前轮");
    return {
      title: allChunksDone ? `第 ${checkpoint.round ?? input.nextRound ?? ""} 轮等待收尾` : `发现第 ${checkpoint.round ?? input.nextRound ?? ""} 轮断点`,
      message: allChunksDone ? "等待合并输出。" : "可从断点继续。",
      tone: checkpoint.lastError ? "amber" : "blue",
      phaseLabel,
      actionHint: "",
      resumeActionLabel,
      resumeExplanation: checkpoint.resumeExplanation,
      nextChunkId: checkpoint.nextChunkId,
      nextChunkIndex: checkpoint.nextChunkIndex,
      remainingChunks: checkpoint.remainingChunks,
      completedChunks,
      totalChunks,
      percent: checkpoint.progressPercent || percent,
      error: checkpoint.lastError || undefined,
    };
  }
  return null;
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function getProgressPercent(progress: RoundProgress | null, completedRounds: number, maxRounds: number): number {
  if (progress?.totalChunks) {
    const current = progress.currentChunk ?? progress.completedChunks ?? 0;
    return Math.max(6, Math.min(100, Math.round((current / progress.totalChunks) * 100)));
  }
  if (maxRounds > 0) {
    return Math.round((completedRounds / maxRounds) * 100);
  }
  return 0;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRoundTaskPercent(progress: RoundProgress | null, fallbackPercent = 0): number | undefined {
  if (progress?.totalChunks) {
    const current = progress.currentChunk ?? progress.completedChunks ?? 0;
    return clampPercent((current / progress.totalChunks) * 100);
  }
  return fallbackPercent > 0 ? clampPercent(fallbackPercent) : undefined;
}

function getBatchTaskPercent(status: BatchRerunStatus | null | undefined): number | undefined {
  if (!status?.totalCount) {
    return undefined;
  }
  return clampPercent((status.completedCount / status.totalCount) * 100);
}

function formatShortTaskId(runId: string | null | undefined): string | undefined {
  if (!runId) {
    return undefined;
  }
  return `任务 ${runId.slice(0, 8)}`;
}

function getPhaseTaskTone(phase: TaskPhase): RuntimeTaskTone {
  if (phase.includes("canceling")) {
    return "red";
  }
  if (phase.includes("parsing") || phase.includes("loading") || phase.includes("saving")) {
    return "blue";
  }
  if (phase.includes("exporting") || phase.includes("applying")) {
    return "emerald";
  }
  if (phase.includes("deleting") || phase.includes("resetting")) {
    return "amber";
  }
  return "slate";
}

function getTaskPhaseRecoveryHint(phase: TaskPhase): string {
  const hints: Partial<Record<TaskPhase, string>> = {
    "running-round": "可中断；再次开始会优先读取断点，不会从头覆盖已完成分块。",
    "canceling-run": "等待后端到安全点落盘；完成后回主页继续当前轮。",
    "batch-rerunning": "可停止；已成功的块会保留，失败块会留在 Diff 的失败筛选里。",
    "canceling-batch-rerun": "停止请求已送达；当前块结束后释放任务。",
    "parsing-format": "耗时过长可停止解析，换更快模型或修改说明后重新解析。",
    "loading-models": "模型目录读取可停止；停止只取消本次读取，不会清空已有服务商配置。",
    "picking-document": "取消文件选择后应自动回到待命，不需要刷新页面。",
    "picking-report": "取消报告选择后应自动回到待命，已绑定文档不会被清除。",
    "parsing-report": "报告只用于定位风险段；解析失败不会影响现有改写结果。",
    exporting: "导出失败不会影响已有改写结果；修正问题后可重新导出。",
    "saving-config": "保存失败不会清空表单；修正连接信息后再次保存。",
    "testing-config": "测试失败只说明当前连接不可用，不会覆盖已有配置。",
    "restoring-document": "恢复失败时可从历史记录手动切换，不会删除源文件。",
  };
  return hints[phase] ?? "任务结束后会释放按钮；如失败，请查看错误通知里的下一步说明。";
}

function getErrorRecoveryPlan(message: string): { hint: string; target: WorkbenchView; actionLabel: string; tone: RuntimeTaskTone } {
  const lowered = message.toLowerCase();
  if (message.includes("中断") || message.includes("断点") || message.includes("Unknown run id") || message.includes("运行通道")) {
    return {
      hint: "回主页点击开始/继续，系统会先检查断点和后台任务，避免从头重跑。",
      target: "home",
      actionLabel: "回主页续跑",
      tone: "blue",
    };
  }
  if (message.includes("模型配置") || message.includes("接口") || message.includes("API Key") || message.includes("Base URL") || lowered.includes("model")) {
    return {
      hint: "先检查默认连接或服务商配置；保存前建议测试连接，再回主页继续。",
      target: "model",
      actionLabel: "检查模型配置",
      tone: "amber",
    };
  }
  if (message.includes("学校") || message.includes("规范") || message.includes("解析")) {
    return {
      hint: "保留当前文本，换用更稳定的 JSON 输出模型后重新解析；必要时使用默认规范兜底。",
      target: "format",
      actionLabel: "查看学校规范",
      tone: "amber",
    };
  }
  if (message.includes("报告") || message.includes("PDF") || message.includes("PaperPass") || message.includes("SpeedAI")) {
    return {
      hint: "确认报告来源选对；报告匹配只做定位，不会自动覆盖原文。",
      target: "home",
      actionLabel: "回主页看报告",
      tone: "amber",
    };
  }
  if (message.includes("导出") || message.includes("Word") || message.includes("审计")) {
    return {
      hint: "改写结果仍在；先查看改写检查和导出审计，再重新导出。",
      target: "quality",
      actionLabel: "查看改写检查",
      tone: "red",
    };
  }
  return {
    hint: "不要盲目刷新或重复启动；先打开任务中心确认是否有后台任务或可续跑断点。",
    target: "diagnostics",
    actionLabel: "查看诊断",
    tone: "red",
  };
}

function stringifyError(error: unknown): string {
  const rawMessage = String(error ?? "");
  const lowered = rawMessage.toLowerCase();

  if (rawMessage.includes("This document already has a running task")) {
    return "当前文档已经有任务在运行。等这一轮结束后再继续，避免把状态冲乱。";
  }
  if (rawMessage.includes("Model configuration is incomplete")) {
    return "模型配置还没填完整。请补全接口地址、API Key 和模型名称，或者启用离线模式。";
  }
  if (rawMessage.includes("baseUrl is required before loading models")) {
    return "先填写接口地址，再去读取远程模型列表。";
  }
  if (rawMessage.includes("apiKey is required before loading models")) {
    return "先填写 API Key，再去读取远程模型列表。";
  }
  if (rawMessage.includes("connection refused") || rawMessage.includes("WinError 10061")) {
    return "接口拒绝连接。请检查 Base URL、代理配置，或者确认服务本身已经启动。";
  }
  if (lowered.includes("timed out") || lowered.includes("timeout")) {
    return "请求超时了。可以稍后重试，或适当调大单次超时和重试次数。";
  }
  if (rawMessage.includes("status 502")) {
    return "上游模型接口返回了 502。通常是服务不稳定，稍后重试即可，已完成的分块不会白跑。";
  }
  if (rawMessage.includes("status 503")) {
    return "上游模型接口暂时不可用（503）。建议稍后重试。";
  }
  if (rawMessage.includes("status 504")) {
    return "上游模型接口响应超时（504）。已完成的分块会保留，稍后再次执行会优先续跑。";
  }
  if (rawMessage.includes("status 429")) {
    return "上游模型接口触发了限流（429）。建议稍后重试，或减少并发使用。";
  }
  if (rawMessage.includes("interrupted by user") || rawMessage.includes("已请求中断")) {
    return "当前轮次已中断。已完成的分块会保留，再次点击“开始 / 继续”会从断点续跑。";
  }
  if (rawMessage.includes("Unknown run id")) {
    return "当前运行令牌已经失效。重新点击执行下一轮，系统会优先尝试断点续跑。";
  }
  if (rawMessage.includes("Progress channel disconnected")) {
    return "运行通道意外断开。重新点击执行下一轮即可，系统会优先续跑。";
  }
  return rawMessage;
}

function formatExportError(error: unknown): string {
  const message = stringifyError(error);
  if (message.includes("审计发现保护区内容发生变化")) {
    return `${message} 系统已经阻止下载，避免目录、表格、参考文献或其他保护区被误改。请查看生成的 audit.json 报告，或回滚后重新执行当前轮次。`;
  }
  if (message.includes("排版规则意外改变了文档文本内容")) {
    return `${message} 系统已经阻止下载。建议恢复默认规范，或检查学校说明文档解析结果。`;
  }
  return message;
}

export function App({ service, pickerLabel = "上传文档" }: Props) {
  const progressUnlistenRef = useRef<null | (() => void | Promise<void>)>(null);
  const liveCompareRef = useRef<RoundCompareData | null>(null);
  const visibleProgressRef = useRef<RoundProgress | null>(null);
  const reviewSaveTimerRef = useRef<number | null>(null);
  const restoredDocumentRef = useRef(false);
  const attachedRunTokenRef = useRef<string | null>(null);
  const runSessionRef = useRef<RunSession | null>(null);
  const batchRerunSessionRef = useRef<BatchRerunSession | null>(null);
  const runSessionSequenceRef = useRef(0);
  const autoRetryCountsRef = useRef<Record<string, number>>({});
  const latestDocumentStatusRef = useRef<DocumentStatus | null>(null);
  const latestModelConfigRef = useRef<ModelConfig | null>(null);
  const runningRef = useRef(false);
  const pendingAutoActionRef = useRef<PendingAutoAction | null>(null);
  const notificationMessageKeyRef = useRef("");
  const taskTicketRef = useRef(0);
  const formatParseAbortRef = useRef<AbortController | null>(null);
  const modelCatalogAbortRef = useRef<AbortController | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResult | null>(null);
  const [modelCatalogBusy, setModelCatalogBusy] = useState(false);
  const [modelCatalogError, setModelCatalogError] = useState("");
  const [pendingFormatRules, setPendingFormatRules] = useState<FormatRules | null>(() => loadStoredFormatRules(FORMAT_RULE_PENDING_KEY));
  const [activeFormatRules, setActiveFormatRules] = useState<FormatRules | null>(() => loadStoredFormatRules(FORMAT_RULE_ACTIVE_KEY));
  const [formatRuleText, setFormatRuleTextState] = useState(() => localStorage.getItem(FORMAT_RULE_DRAFT_KEY) ?? "");
  const [formatParserRoute, setFormatParserRoute] = useState<FormatParserModelRoute>(() => loadStoredFormatParserRoute());
  const [activeView, setActiveView] = useState<WorkbenchView>("home");
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const [currentRunToken, setCurrentRunToken] = useState<string | null>(null);
  const [currentBatchRerunToken, setCurrentBatchRerunToken] = useState<string | null>(null);
  const [roundProgressStatus, setRoundProgressStatus] = useState<RoundProgressStatus | null>(null);
  const [taskPhase, setTaskPhase] = useState<TaskPhase>("idle");
  const [modelConfigReady, setModelConfigReady] = useState(false);
  const [historyListReady, setHistoryListReady] = useState(false);
  const [detectionReport, setDetectionReport] = useState<DetectionReport | null>(() => loadStoredDetectionReportForDocument(localStorage.getItem(ACTIVE_DOCUMENT_KEY)));
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewResponse | null>(null);
  const [promptPreviewBusy, setPromptPreviewBusy] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState("");
  const [activePromptPreviewId, setActivePromptPreviewId] = useState<PromptId>("prewrite");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [historyOrphanScan, setHistoryOrphanScan] = useState<HistoryOrphanScanResult | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotificationHistory());
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [diffFocusRequest, setDiffFocusRequest] = useState<DiffFocusRequest | null>(null);
  const [rerunFailures, setRerunFailures] = useState<BatchRerunFailure[]>([]);
  const [pendingAutoAction, setPendingAutoAction] = useState<PendingAutoAction | null>(null);

  const {
    modelConfig,
    documentStatus,
    history,
    protectionMap,
    historyItems,
    historyPanelOpen,
    roundResult,
    progress,
    preview,
    compareData,
    lastExportResult,
    runtimeStep,
    notice,
    busy,
    error,
    setModelConfig,
    setDocumentStatus,
    setHistory,
    setProtectionMap,
    setHistoryItems,
    setHistoryPanelOpen,
    setRoundResult,
    setProgress,
    setPreview,
    setCompareData,
    setLastExportResult,
    setRuntimeStep,
    setNotice,
    setBusy,
    setError,
  } = useAppState();

  function beginTask(
    phase: TaskPhase,
    options: { globalBusy?: boolean; clearMessages?: boolean; runtimeStep?: string } = {},
  ) {
    const ticket = taskTicketRef.current + 1;
    taskTicketRef.current = ticket;
    setTaskPhase(phase);
    if (options.clearMessages !== false) {
      setError("");
      setNotice("");
    }
    if (options.runtimeStep) {
      setRuntimeStep(options.runtimeStep);
    }
    setBusy(options.globalBusy !== false);
    return ticket;
  }

  function transitionTask(
    ticket: number,
    phase: TaskPhase,
    options: { globalBusy?: boolean; runtimeStep?: string } = {},
  ) {
    if (ticket !== taskTicketRef.current) {
      return false;
    }
    setTaskPhase(phase);
    if (options.runtimeStep) {
      setRuntimeStep(options.runtimeStep);
    }
    if (typeof options.globalBusy === "boolean") {
      setBusy(options.globalBusy);
    }
    return true;
  }

  function finishTask(ticket: number) {
    if (ticket !== taskTicketRef.current) {
      return;
    }
    setTaskPhase("idle");
    setBusy(false);
  }

  function beginRunSession(input: Omit<RunSession, "sessionId" | "cancelRequested">): RunSession {
    const session: RunSession = {
      ...input,
      sessionId: runSessionSequenceRef.current + 1,
      cancelRequested: false,
    };
    runSessionSequenceRef.current = session.sessionId;
    runSessionRef.current = session;
    setCurrentRunToken(session.runId);
    return session;
  }

  function isActiveRunSession(session: RunSession | null | undefined): session is RunSession {
    return Boolean(
      session
      && runSessionRef.current?.sessionId === session.sessionId
      && runSessionRef.current?.runId === session.runId,
    );
  }

  function clearRunSession(session: RunSession | null | undefined) {
    if (!isActiveRunSession(session)) {
      return;
    }
    runSessionRef.current = null;
    setCurrentRunToken((current) => (current === session.runId ? null : current));
  }

  function markRunSessionCancelRequested(session: RunSession) {
    if (!isActiveRunSession(session)) {
      return false;
    }
    runSessionRef.current = { ...session, cancelRequested: true };
    return true;
  }

  function beginBatchRerunSession(session: BatchRerunSession) {
    batchRerunSessionRef.current = session;
    setCurrentBatchRerunToken(session.runId);
  }

  function clearBatchRerunSession(runId: string | null | undefined) {
    if (!runId) {
      return;
    }
    if (batchRerunSessionRef.current?.runId === runId) {
      batchRerunSessionRef.current = null;
    }
    setCurrentBatchRerunToken((current) => (current === runId ? null : current));
  }

  function markBatchRerunCancelRequested(runId: string) {
    const session = batchRerunSessionRef.current;
    if (!session || session.runId !== runId) {
      return;
    }
    batchRerunSessionRef.current = { ...session, cancelRequested: true };
  }

  const running = Boolean(currentRunToken) || isTaskRunningPhase(taskPhase);
  const uiBusy = busy || isTaskBlocking(taskPhase);
  const runtimeStatus = taskPhase !== "idle" ? getTaskPhaseLabel(taskPhase) : busy ? "处理中" : "就绪";

  const activeCompareData = useMemo(
    () => compareDataMatchesDocument(compareData, documentStatus) ? compareData : null,
    [compareData, documentStatus],
  );
  const detectionMatches = useMemo(() => buildDetectionMatches(detectionReport, activeCompareData), [detectionReport, activeCompareData]);
  const detectionMatchesByChunk = useMemo(() => groupDetectionMatchesByChunk(detectionMatches), [detectionMatches]);
  const activeRerunFailureScopeKey = useMemo(() => getRerunFailureScopeKey(activeCompareData), [activeCompareData]);
  const activeRerunFailures = useMemo(() => {
    if (!activeRerunFailureScopeKey) {
      return [];
    }
    const activeChunkIds = new Set(activeCompareData?.chunks.map((chunk) => chunk.chunkId) ?? []);
    return rerunFailures.filter((failure) => failure.scopeKey === activeRerunFailureScopeKey && activeChunkIds.has(failure.chunkId));
  }, [activeCompareData, activeRerunFailureScopeKey, rerunFailures]);
  const adoptableRejectedCandidates = useMemo(
    () => collectAdoptableRejectedCandidates(activeCompareData, activeRerunFailures, reviewDecisions),
    [activeCompareData, activeRerunFailures, reviewDecisions],
  );
  const diffDashboardStats = useMemo(
    () => buildDiffDashboardStats(activeCompareData, activeRerunFailures, detectionMatchesByChunk, reviewDecisions),
    [activeCompareData, activeRerunFailures, detectionMatchesByChunk, reviewDecisions],
  );
  useEffect(() => {
    if (!activeCompareData?.chunks.length) {
      return;
    }
    setReviewDecisions((current) => {
      const next = { ...buildDefaultReviewDecisions(activeCompareData), ...normalizeSavedReviewDecisions(current) };
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [activeCompareData]);
  const unreadNotificationCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    latestDocumentStatusRef.current = documentStatus;
  }, [documentStatus]);

  useEffect(() => {
    latestModelConfigRef.current = modelConfig;
  }, [modelConfig]);

  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    pendingAutoActionRef.current = pendingAutoAction;
  }, [pendingAutoAction]);

  useEffect(() => {
    const action = pendingAutoAction;
    if (!isCountdownAutoAction(action)) {
      return undefined;
    }
    if (action.secondsRemaining <= 0) {
      void performPendingAutoAction(action);
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setPendingAutoAction((current) => {
        if (!isCountdownAutoAction(current) || current.id !== action.id) {
          return current;
        }
        return { ...current, secondsRemaining: Math.max(0, current.secondsRemaining - 1) };
      });
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [pendingAutoAction]);

  useEffect(() => {
    const text = error || notice;
    if (!text) {
      notificationMessageKeyRef.current = "";
      return;
    }
    const kind: NotificationKind = error ? "error" : "success";
    const key = `${kind}:${text}`;
    if (notificationMessageKeyRef.current === key) {
      return;
    }
    notificationMessageKeyRef.current = key;
    setNotifications((current) => {
      const fresh = createNotification(kind, text);
      const next = [fresh, ...current.filter((item) => getNotificationKey(item) !== getNotificationKey(fresh))].slice(0, 80);
      saveNotificationHistory(next);
      return next;
    });
  }, [error, notice]);

  function openNotificationCenter() {
    setNotificationCenterOpen(true);
    setNotifications((current) => {
      if (current.every((item) => item.read)) {
        return current;
      }
      const next = current.map((item) => ({ ...item, read: true }));
      saveNotificationHistory(next);
      return next;
    });
  }

  function openTaskTargetView(view: WorkbenchView) {
    setActiveView(view);
    setNotificationCenterOpen(false);
  }

  function openDiffTaskTarget(filterMode: DiffFilterMode, chunkId?: string) {
    setActiveView("home");
    setNotificationCenterOpen(false);
    setDiffFocusRequest((current) => ({
      filterMode,
      chunkId,
      nonce: (current?.nonce ?? 0) + 1,
    }));
  }

  function clearAutoRetryScope(scopeKey: string | null | undefined) {
    if (!scopeKey) {
      return;
    }
    const nextCounts = { ...autoRetryCountsRef.current };
    delete nextCounts[scopeKey];
    autoRetryCountsRef.current = nextCounts;
  }

  function clearPendingAutoActionForSource(sourcePath: string | null | undefined) {
    if (!sourcePath) {
      return;
    }
    setPendingAutoAction((current) => {
      if (!current || !sameWorkspacePath(current.sourcePath, sourcePath)) {
        return current;
      }
      return null;
    });
  }

  function scheduleManualIntervention(input: {
    sourcePath: string;
    round: number;
    scopeKey: string;
    attempts: number;
    reason: string;
  }) {
    setPendingAutoAction({
      id: `manual:${input.scopeKey}:${Date.now()}`,
      kind: "manual-intervention",
      sourcePath: input.sourcePath,
      scopeKey: input.scopeKey,
      round: input.round,
      attempts: input.attempts,
      maxAttempts: AUTO_RUN_RETRY_MAX_ATTEMPTS,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    setNotice(input.attempts >= AUTO_RUN_RETRY_MAX_ATTEMPTS
      ? `第 ${input.round} 轮连续 ${AUTO_RUN_RETRY_MAX_ATTEMPTS} 次自动重跑仍中断，已停止自动重跑，等待人工处理。`
      : `第 ${input.round} 轮自动执行已暂停，等待人工处理。`);
  }

  function scheduleAutoRetry(input: {
    sourcePath: string;
    round: number;
    config: Pick<ModelConfig, "promptProfile" | "promptSequence">;
    reason: string;
  }) {
    const scopeKey = getAutoRunScopeKey(input.sourcePath, input.config, input.round);
    const nextAttempt = (autoRetryCountsRef.current[scopeKey] ?? 0) + 1;
    if (nextAttempt > AUTO_RUN_RETRY_MAX_ATTEMPTS) {
      scheduleManualIntervention({
        sourcePath: input.sourcePath,
        round: input.round,
        scopeKey,
        attempts: AUTO_RUN_RETRY_MAX_ATTEMPTS,
        reason: input.reason,
      });
      return;
    }
    autoRetryCountsRef.current = { ...autoRetryCountsRef.current, [scopeKey]: nextAttempt };
    setPendingAutoAction({
      id: `retry:${scopeKey}:${nextAttempt}:${Date.now()}`,
      kind: "retry",
      sourcePath: input.sourcePath,
      scopeKey,
      round: input.round,
      secondsRemaining: AUTO_RUN_RETRY_DELAY_SECONDS,
      delaySeconds: AUTO_RUN_RETRY_DELAY_SECONDS,
      attempt: nextAttempt,
      maxAttempts: AUTO_RUN_RETRY_MAX_ATTEMPTS,
      reason: input.reason,
      createdAt: new Date().toISOString(),
    });
    setNotice(`第 ${input.round} 轮被迫中断，将在 ${AUTO_RUN_RETRY_DELAY_SECONDS} 秒后自动重跑（第 ${nextAttempt}/${AUTO_RUN_RETRY_MAX_ATTEMPTS} 次）。`);
  }

  function scheduleAutoNextRound(status: DocumentStatus, completedRound: number, config: Pick<ModelConfig, "promptProfile" | "promptSequence">) {
    if (!status.hasNextRound || !status.nextRound) {
      return;
    }
    const scopeKey = getAutoRunScopeKey(status.sourcePath, config, status.nextRound);
    setPendingAutoAction({
      id: `next-round:${scopeKey}:${Date.now()}`,
      kind: "next-round",
      sourcePath: status.sourcePath,
      scopeKey,
      round: status.nextRound,
      secondsRemaining: AUTO_NEXT_ROUND_DELAY_SECONDS,
      delaySeconds: AUTO_NEXT_ROUND_DELAY_SECONDS,
      completedRound,
      createdAt: new Date().toISOString(),
    });
    setNotice(`第 ${completedRound} 轮已完成，将在 ${AUTO_NEXT_ROUND_DELAY_SECONDS} 秒后自动进入第 ${status.nextRound} 轮。`);
  }

  function rejectPendingAutoAction(actionId?: string) {
    const rejected = pendingAutoActionRef.current;
    if (!rejected || (actionId && rejected.id !== actionId)) {
      return;
    }
    setPendingAutoAction((current) => {
      if (!current || (actionId && current.id !== actionId)) {
        return current;
      }
      return null;
    });
    clearAutoRetryScope(rejected.scopeKey);
    setNotice("已拒绝自动执行，当前任务等待你手动处理。");
  }

  async function performPendingAutoAction(action: PendingAutoRetryAction | PendingAutoNextRoundAction) {
    if (pendingAutoActionRef.current?.id !== action.id) {
      return;
    }
    if (runningRef.current) {
      setPendingAutoAction((current) => {
        if (!isCountdownAutoAction(current) || current.id !== action.id) {
          return current;
        }
        return { ...current, secondsRemaining: 1 };
      });
      return;
    }

    let status = latestDocumentStatusRef.current;
    if (!status || !sameWorkspacePath(status.sourcePath, action.sourcePath)) {
      if (action.kind === "retry") {
        scheduleManualIntervention({
          sourcePath: action.sourcePath,
          round: action.round,
          scopeKey: action.scopeKey,
          attempts: action.attempt,
          reason: "当前页面已切换文档，自动执行已暂停。",
        });
      } else {
        setPendingAutoAction((current) => (current?.id === action.id ? null : current));
        setNotice("当前页面已切换文档，已取消自动进入下一轮。");
      }
      return;
    }

    try {
      status = await refreshDocumentState(action.sourcePath, latestModelConfigRef.current ?? modelConfig);
    } catch {
      // Keep the countdown decision visible; the manual run button can retry the refresh path.
    }

    if (!status?.hasNextRound || status.nextRound !== action.round) {
      setPendingAutoAction((current) => (current?.id === action.id ? null : current));
      setNotice("文档轮次状态已经变化，已取消本次自动执行。");
      return;
    }

    setPendingAutoAction((current) => (current?.id === action.id ? null : current));
    setNotice(action.kind === "retry"
      ? `正在自动重跑第 ${action.round} 轮（第 ${action.attempt}/${action.maxAttempts} 次）。`
      : `第 ${action.completedRound} 轮已完成，正在自动进入第 ${action.round} 轮。`);
    await handleRunRound();
  }

  function requestConfirm(options: ConfirmDialogOptions): Promise<boolean> {
    confirmResolverRef.current?.(false);
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog({
        ...options,
        tone: options.tone ?? "neutral",
        confirmLabel: options.confirmLabel ?? "确定",
        cancelLabel: options.cancelLabel ?? "取消",
        id: Date.now(),
      });
    });
  }

  function settleConfirmDialog(confirmed: boolean) {
    confirmResolverRef.current?.(confirmed);
    confirmResolverRef.current = null;
    setConfirmDialog(null);
  }

  function clearNotificationHistory() {
    setNotifications([]);
    saveNotificationHistory([]);
  }

  function upsertRerunFailure(failure: BatchRerunFailure) {
    if (!failure.chunkId || failure.chunkId === "预览刷新") {
      return;
    }
    if (!activeRerunFailureScopeKey) {
      return;
    }
    const scopedFailure = { ...failure, scopeKey: activeRerunFailureScopeKey };
    setRerunFailures((current) => [
      ...current.filter((item) => !(item.scopeKey === activeRerunFailureScopeKey && item.chunkId === failure.chunkId)),
      scopedFailure,
    ]);
  }

  function clearRerunFailure(chunkId: string) {
    if (!activeRerunFailureScopeKey) {
      return;
    }
    setRerunFailures((current) => current.filter((item) => !(item.scopeKey === activeRerunFailureScopeKey && item.chunkId === chunkId)));
  }

  function setFormatRuleText(value: string) {
    setFormatRuleTextState(value);
    localStorage.setItem(FORMAT_RULE_DRAFT_KEY, value);
  }

  function setFormatParserModelRoute(route: FormatParserModelRoute) {
    const normalized = normalizeFormatParserRoute(route);
    setFormatParserRoute(normalized);
    saveStoredFormatParserRoute(normalized);
  }

  function handleFormatParserProviderChange(providerId: string) {
    if (providerId === FORMAT_PARSER_DEFAULT_PROVIDER_ID) {
      setFormatParserModelRoute({ providerId, model: "" });
      return;
    }
    const provider = modelConfig.modelProviders?.find((item) => item.id === providerId);
    setFormatParserModelRoute({
      providerId,
      model: provider?.defaultModel || provider?.models?.[0] || "",
    });
  }

  function buildFormatParserModelConfig(): ModelConfig {
    const providerId = formatParserRoute.providerId || FORMAT_PARSER_DEFAULT_PROVIDER_ID;
    if (providerId === FORMAT_PARSER_DEFAULT_PROVIDER_ID) {
      return {
        ...modelConfig,
        model: formatParserRoute.model?.trim() || modelConfig.model,
      };
    }
    const provider = modelConfig.modelProviders?.find((item) => item.id === providerId);
    if (!provider) {
      throw new Error("学校规范解析模型选择的服务商不存在，请重新选择。");
    }
    if (provider.enabled === false) {
      throw new Error("学校规范解析模型选择的服务商已关闭，请启用或切换服务商。");
    }
    return buildModelConfigFromProvider(provider, modelConfig, formatParserRoute.model);
  }

  function buildDefaultReviewDecisions(data: RoundCompareData | null): Record<string, ReviewDecision> {
    if (!data?.chunks.length) {
      return {};
    }
    return Object.fromEntries(data.chunks.map((chunk) => [chunk.chunkId, "rewrite" as ReviewDecision]));
  }

  function normalizeSavedReviewDecisions(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    return Object.fromEntries(
      Object.entries(decisions).map(([chunkId, decision]) => {
        if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
          if (decision.source === "rejected_candidate" && decision.confirmed !== true) {
            return [chunkId, "rewrite" as ReviewDecision];
          }
          return [chunkId, decision];
        }
        if (decision === "source" || decision === "source_confirmed") return [chunkId, "source_confirmed" as ReviewDecision];
        if (decision === "rewrite_confirmed") return [chunkId, "rewrite_confirmed" as ReviewDecision];
        return [chunkId, "rewrite" as ReviewDecision];
      }),
    );
  }

  function normalizeReviewDecisionsForSave(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    return Object.fromEntries(
      Object.entries(decisions).flatMap(([chunkId, decision]) => {
        if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
          if (decision.source === "rejected_candidate" && decision.confirmed !== true) {
            return [];
          }
          return [[chunkId, decision] as const];
        }
        if (decision === "source" || decision === "source_confirmed") {
          return [[chunkId, "source_confirmed" as ReviewDecision] as const];
        }
        if (decision === "rewrite_confirmed") {
          return [[chunkId, "rewrite_confirmed" as ReviewDecision] as const];
        }
        return [];
      }),
    );
  }

  function scheduleReviewDecisionSave(outputPath: string, decisions: Record<string, ReviewDecision>) {
    if (reviewSaveTimerRef.current !== null) {
      window.clearTimeout(reviewSaveTimerRef.current);
    }
    reviewSaveTimerRef.current = window.setTimeout(() => {
      reviewSaveTimerRef.current = null;
      void service.saveReviewDecisions(outputPath, normalizeReviewDecisionsForSave(decisions)).catch((appError) => {
        setError(stringifyError(appError));
      });
    }, 500);
  }

  function updateReviewDecision(chunkId: string, decision: ReviewDecision) {
    setReviewDecisions((current) => {
      const next = { ...current, [chunkId]: decision };
      const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
      if (outputPath) {
        scheduleReviewDecisionSave(outputPath, next);
      }
      return next;
    });
  }

  function handleAdoptAllRejectedCandidates() {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    if (!outputPath) {
      setNotice("当前没有可保存候选选择的输出结果。");
      return;
    }
    if (!adoptableRejectedCandidates.length) {
      setNotice("当前没有可采用的候选改写。");
      return;
    }
    setReviewDecisions((current) => {
      const next = { ...current };
      for (const item of adoptableRejectedCandidates) {
        next[item.chunkId] = buildRejectedCandidateReviewDecision(item.candidate);
      }
      scheduleReviewDecisionSave(outputPath, next);
      return next;
    });
    setNotice(`已采用 ${adoptableRejectedCandidates.length} 个候选改写；导出会按这些选择执行。`);
    setRuntimeStep("已采用全部候选");
  }

  async function releaseProgressListener() {
    if (!progressUnlistenRef.current) {
      return;
    }
    await progressUnlistenRef.current();
    progressUnlistenRef.current = null;
  }

  function beginCancelableModelCatalogRequest(): AbortController {
    modelCatalogAbortRef.current?.abort("fyadr-user-cancel");
    const controller = new AbortController();
    modelCatalogAbortRef.current = controller;
    return controller;
  }

  function clearCancelableModelCatalogRequest(controller: AbortController) {
    if (modelCatalogAbortRef.current === controller) {
      modelCatalogAbortRef.current = null;
    }
  }

  function handleCancelModelCatalogRequest() {
    const controller = modelCatalogAbortRef.current;
    if (!controller) {
      setNotice("当前没有正在读取的模型列表。");
      return;
    }
    setRuntimeStep("正在停止模型列表读取…");
    controller.abort("fyadr-user-cancel");
  }

  async function refreshModelCatalog(config = modelConfig, options: { silent?: boolean } = {}) {
    const { silent = false } = options;

    if (config.offlineMode) {
      const offlinePayload: ModelCatalogResult = {
        ok: true,
        offlineMode: true,
        message: "离线模式下不会请求远程模型列表。",
        endpoint: "",
        models: [],
        total: 0,
      };
      setModelCatalog(offlinePayload);
      setModelCatalogError("");
      if (!silent) {
        setNotice(offlinePayload.message);
        setRuntimeStep("离线模式已就绪");
      }
      return offlinePayload;
    }

    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      const message = "先填写接口地址和 API Key，再去读取远程模型列表。";
      setModelCatalog(null);
      setModelCatalogError(message);
      if (!silent) {
        setError(message);
        setRuntimeStep("模型目录读取失败");
      }
      return null;
    }

    const abortController = silent ? null : beginCancelableModelCatalogRequest();
    const taskTicket = silent ? null : beginTask("loading-models", { runtimeStep: "正在从 /v1/models 读取模型列表。" });
    try {
      setModelCatalogBusy(true);
      setModelCatalogError("");
      if (!silent) {
        setError("");
        setNotice("");
        setRuntimeStep("正在从 /v1/models 读取模型列表。");
      }

      const result = await service.listModels(config, abortController?.signal);
      setModelCatalog(result);
      if (!config.model.trim() && result.models[0]) {
        setModelConfig({ ...config, model: result.models[0].id });
      }
      if (!silent) {
        setNotice(`模型目录已刷新，共读取到 ${result.total} 个模型。`);
        setRuntimeStep("模型目录读取完成");
      }
      return result;
    } catch (appError) {
      const message = stringifyError(appError);
      setModelCatalogError(message);
      if (!silent) {
        if (abortController?.signal.aborted) {
          setNotice("已停止本次模型列表读取，已有模型配置不会被清空。");
          setRuntimeStep("模型目录读取已停止");
        } else {
          setError(message);
          setRuntimeStep("模型目录读取失败");
        }
      }
      return null;
    } finally {
      if (abortController) {
        clearCancelableModelCatalogRequest(abortController);
      }
      setModelCatalogBusy(false);
      if (taskTicket) {
        finishTask(taskTicket);
      }
    }
  }

  async function listModelsForConfig(config: ModelConfig, signal?: AbortSignal): Promise<ModelCatalogResult | null> {
    if (config.offlineMode) {
      return {
        ok: true,
        offlineMode: true,
        message: "offline mode",
        endpoint: "",
        models: [],
        total: 0,
      };
    }

    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      throw new Error("Please fill Base URL and API Key first.");
    }

    return service.listModels(config, signal);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapConfig() {
      try {
        const config = await service.loadModelConfig();
        if (cancelled) {
          return;
        }
        setModelConfig(config);
        if (config.baseUrl && config.apiKey && !config.offlineMode) {
          void refreshModelCatalog(config, { silent: true });
        }
      } catch (appError) {
        if (!cancelled) {
          setError(stringifyError(appError));
        }
      } finally {
        if (!cancelled) {
          setModelConfigReady(true);
        }
      }
    }

    void bootstrapConfig();

    return () => {
      cancelled = true;
    };
  }, [service, setError, setModelConfig]);

  useEffect(() => {
    if (activeView !== "diagnostics" || diagnostics) {
      return;
    }
    void refreshDiagnostics({ silent: true });
  }, [activeView, diagnostics]);

  useEffect(() => {
    if (activeView !== "prompts" || promptPreviews || promptPreviewBusy) {
      return;
    }
    void refreshPromptPreviews({ silent: true });
  }, [activeView, promptPreviews, promptPreviewBusy]);

  useEffect(() => {
    if (!documentStatus?.sourcePath || currentRunToken || attachedRunTokenRef.current) {
      return;
    }
    const sourcePath = documentStatus.sourcePath;
    let cancelled = false;

    async function probeActiveRun() {
      try {
        const result = await service.getHealth();
        if (cancelled) {
          return;
        }
        setDiagnostics(result);
        const activeRun = result.activeRuns.find((item) => sameWorkspacePath(item.sourcePath, sourcePath));
        if (activeRun && !cancelled) {
          void attachActiveRun(activeRun);
        }
      } catch {
        // Health probing is non-blocking; the user can still click continue manually.
      }
    }

    void probeActiveRun();

    return () => {
      cancelled = true;
    };
  }, [documentStatus?.sourcePath, currentRunToken, service]);

  useEffect(() => {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    if (!outputPath || currentBatchRerunToken || batchRerunSessionRef.current || currentRunToken || taskPhase !== "idle") {
      return;
    }
    let cancelled = false;

    async function probeActiveBatchRerun() {
      try {
        const result = await service.getHealth();
        if (cancelled) {
          return;
        }
        setDiagnostics(result);
        const activeBatch = (result.activeBatchReruns ?? []).find((item) => sameWorkspacePath(item.outputPath, outputPath));
        if (activeBatch && !cancelled) {
          void attachActiveBatchRerun(activeBatch);
        }
      } catch {
        // Batch rerun recovery is best-effort; the visible result remains usable.
      }
    }

    void probeActiveBatchRerun();

    return () => {
      cancelled = true;
    };
  }, [activeCompareData?.outputPath, currentBatchRerunToken, currentRunToken, roundResult?.outputPath, service, taskPhase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapFormatRules() {
      try {
        const rules = await service.loadFormatRules();
        if (!cancelled) {
          setActiveFormatRules(rules);
          saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, rules);
        }
      } catch {
        // Format rules are non-blocking; keep the page usable even if the backend is still starting.
      }
    }

    void bootstrapFormatRules();

    return () => {
      cancelled = true;
    };
  }, [service]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapHistories() {
      try {
        const result = await service.listDocumentHistories();
        if (!cancelled) {
          setHistoryItems(result.items);
        }
      } catch (appError) {
        if (!cancelled) {
          setError(stringifyError(appError));
        }
      } finally {
        if (!cancelled) {
          setHistoryListReady(true);
        }
      }
    }

    void bootstrapHistories();

    return () => {
      cancelled = true;
    };
  }, [service, setError, setHistoryItems]);

  useEffect(() => {
    setHistoryOrphanScan(null);
  }, [detectionReport?.sourcePath]);

  useEffect(() => {
    return () => {
      void releaseProgressListener();
    };
  }, []);

  useEffect(() => {
    if (!modelConfigReady || !historyListReady || restoredDocumentRef.current || documentStatus) {
      return;
    }
    const storedSourcePath = localStorage.getItem(ACTIVE_DOCUMENT_KEY) || "";
    const storedPromptProfile = localStorage.getItem(ACTIVE_PROMPT_PROFILE_KEY) as ModelConfig["promptProfile"] | null;
    const storedPromptSequence = readStoredPromptSequence();
    const fallbackItem = historyItems[0];
    const matchedItem = storedSourcePath
      ? historyItems.find((item) => item.sourcePath === storedSourcePath || item.originPath === storedSourcePath || item.docId === storedSourcePath)
      : fallbackItem;
    const sourcePath = storedSourcePath || matchedItem?.sourcePath || "";
    if (!sourcePath) {
      restoredDocumentRef.current = true;
      return;
    }

    restoredDocumentRef.current = true;
    const safeProfile = resolveRestoredPromptProfile(storedPromptProfile, matchedItem, modelConfig.promptProfile);
    const nextSequence = safeProfile === "cn_custom" ? storedPromptSequence : modelConfig.promptSequence;
    const nextConfig = { ...modelConfig, promptProfile: safeProfile, promptSequence: nextSequence };
    if (nextConfig.promptProfile !== modelConfig.promptProfile || !promptSequencesEqual(nextConfig.promptSequence, modelConfig.promptSequence)) {
      setModelConfig(nextConfig);
    }

    const taskTicket = beginTask("restoring-document", {
      clearMessages: false,
      runtimeStep: "正在恢复上次文档。",
    });

    void (async () => {
      try {
        const status = await refreshDocumentState(sourcePath, nextConfig);
        if (taskTicket !== taskTicketRef.current) {
          return;
        }
        const nextHistoryItems = await refreshHistoryList();
        if (taskTicket !== taskTicketRef.current) {
          return;
        }
        if (shouldSuppressAutoSnapshotRestore(status, nextConfig)) {
          clearLoadedRoundSnapshot();
          setRuntimeStep("已恢复文档；上次放弃本轮后不会自动载入旧 Diff。");
          return;
        }
        const loadedSnapshot = await loadLatestRoundSnapshot(status, nextConfig, {
          historyItems: nextHistoryItems,
          allowProfileFallback: true,
        });
        if (taskTicket !== taskTicketRef.current) {
          return;
        }
        const loadedProfile = loadedSnapshot?.round?.promptProfile ?? loadedSnapshot?.compareData.promptProfile;
        const loadedSequence = normalizePromptSequence(loadedSnapshot?.round?.promptSequence ?? loadedSnapshot?.compareData.promptSequence ?? nextConfig.promptSequence);
        if (isPromptProfile(loadedProfile) && loadedProfile !== nextConfig.promptProfile) {
          const syncedConfig = { ...nextConfig, promptProfile: loadedProfile, promptSequence: loadedSequence };
          setModelConfig(syncedConfig);
          localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, loadedProfile);
          localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(loadedSequence));
          await refreshDocumentState(status.sourcePath, syncedConfig);
          if (taskTicket !== taskTicketRef.current) {
            return;
          }
        }
        setRuntimeStep(loadedSnapshot ? "已恢复上次文档和最新 Diff。" : "已恢复上次文档，当前模式暂无 Diff。");
      } catch (appError) {
        if (taskTicket !== taskTicketRef.current) {
          return;
        }
        setError(stringifyError(appError));
        localStorage.removeItem(ACTIVE_DOCUMENT_KEY);
        setRuntimeStep("恢复上次文档失败");
      } finally {
        finishTask(taskTicket);
      }
    })();
  }, [documentStatus, historyItems, historyListReady, modelConfig, modelConfigReady, setError, setModelConfig]);

  async function refreshDocumentState(sourcePath: string, config = modelConfig) {
    const [status, nextHistory, nextProtectionMap] = await Promise.all([
      service.getDocumentStatus(sourcePath, config),
      service.getDocumentHistory(sourcePath),
      service.getDocumentProtectionMap(sourcePath),
    ]);
    setDocumentStatus(status);
    setHistory(nextHistory);
    setProtectionMap(nextProtectionMap);
    setDetectionReport(loadStoredDetectionReportForDocument(status.sourcePath, status.docId));
    persistActiveDocument(status.sourcePath, status.promptProfile, status.promptSequence ?? config.promptSequence);
    await refreshRoundProgressStatus(status, config);
    return status;
  }

  async function refreshRoundProgressStatus(status = documentStatus, config = modelConfig) {
    if (!status?.sourcePath || !status.hasNextRound || !status.nextRound) {
      setRoundProgressStatus(null);
      return null;
    }
    try {
      const nextStatus = await service.getRoundProgressStatus(
        status.sourcePath,
        config.promptProfile,
        status.nextRound,
        config.promptSequence,
      );
      setRoundProgressStatus(nextStatus);
      return nextStatus;
    } catch {
      setRoundProgressStatus(null);
      return null;
    }
  }

  async function refreshHistoryList() {
    const result = await service.listDocumentHistories();
    setHistoryItems(result.items);
    return result.items;
  }

  function getProtectedHistoryArtifactPaths(): string[] {
    const protectedPaths: string[] = [];
    if (documentStatus?.sourcePath) {
      protectedPaths.push(documentStatus.sourcePath);
    }
    if (roundResult?.outputPath) {
      protectedPaths.push(roundResult.outputPath);
    }
    if (activeCompareData?.outputPath) {
      protectedPaths.push(activeCompareData.outputPath);
    }
    if (lastExportResult?.path) {
      protectedPaths.push(lastExportResult.path);
    }
    if (detectionReport?.sourcePath) {
      protectedPaths.push(detectionReport.sourcePath);
    }
    return Array.from(new Set(protectedPaths));
  }

  async function refreshHistoryOrphanScan() {
    const result = await service.scanHistoryOrphans(getProtectedHistoryArtifactPaths());
    setHistoryOrphanScan(result);
    return result;
  }

  async function refreshDiagnostics(options: { silent?: boolean } = {}) {
    const taskTicket = options.silent ? 0 : beginTask("diagnosing");
    try {
      if (!options.silent) {
        setRuntimeStep("正在执行启动诊断。");
      }
      const result = await service.getHealth();
      setDiagnostics(result);
      if (!options.silent) {
        const warningCount = result.checks.filter((item) => item.level === "warning").length;
        const errorCount = result.checks.filter((item) => item.level === "error").length;
        setNotice(errorCount ? `启动诊断发现 ${errorCount} 个错误。` : warningCount ? `启动诊断完成，有 ${warningCount} 个提示项。` : "启动诊断通过。");
        setRuntimeStep(errorCount ? "启动诊断发现错误" : "启动诊断完成");
      }
      return result;
    } catch (appError) {
      if (!options.silent) {
        setError(stringifyError(appError));
        setRuntimeStep("启动诊断失败");
      }
      return null;
    } finally {
      if (!options.silent) {
        finishTask(taskTicket);
      }
    }
  }

  async function refreshPromptPreviews(options: { silent?: boolean } = {}) {
    setPromptPreviewBusy(true);
    setPromptPreviewError("");
    try {
      const result = await service.getPromptPreviews();
      setPromptPreviews(result);
      if (result.items.length && !result.items.some((item) => item.id === activePromptPreviewId)) {
        setActivePromptPreviewId(result.items[0].id);
      }
      if (!options.silent) {
        setNotice("提示词预览已刷新。");
      }
      return result;
    } catch (appError) {
      const status = (appError as { status?: number } | null)?.status;
      const message = status === 405
        ? "本地后端还没有加载提示词预览接口，请停止当前 Web 服务后重新运行一键启动脚本。"
        : stringifyError(appError);
      setPromptPreviewError(message);
      if (!options.silent) {
        setError(message);
      }
      return null;
    } finally {
      setPromptPreviewBusy(false);
    }
  }

  async function handleCleanupTaskStateSnapshots() {
    const taskTicket = beginTask("diagnosing", { runtimeStep: "正在清理过期任务快照。" });
    try {
      const result = await service.cleanupTaskStateSnapshots("expired", 168);
      setDiagnostics((current) => current ? { ...current, taskStateStore: result.after } : current);
      await refreshDiagnostics({ silent: true });
      const failedText = result.failedFiles.length ? `，${result.failedFiles.length} 个文件未能删除` : "";
      setNotice(`已清理 ${result.deletedCount} 个过期任务快照，释放 ${formatBytes(result.deletedBytes)}${failedText}。正在运行的任务快照不会被删除。`);
      setRuntimeStep("过期任务快照清理完成");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("过期任务快照清理失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  function clearDocumentDerivedState(options: { includeDetectionReport?: boolean } = {}) {
    setRoundResult(null);
    setProgress(null);
    setPreview(null);
    setCompareData(null);
    setLastExportResult(null);
    setRoundProgressStatus(null);
    setRerunFailures([]);
    liveCompareRef.current = null;
    setReviewDecisions({});
    if (options.includeDetectionReport) {
      setDetectionReport(null);
    }
  }

  function clearLoadedRoundSnapshot() {
    clearDocumentDerivedState();
  }

  async function loadLatestRoundSnapshot(
    status: DocumentStatus,
    config: ModelConfig,
    options: {
      historyItems?: HistoryDocumentSummary[];
      historyItem?: HistoryDocumentSummary | null;
      allowProfileFallback?: boolean;
    } = {},
  ) {
    const candidateItems = options.historyItems ?? historyItems;
    const matchedItem = options.historyItem
      ?? candidateItems.find((item) => historyItemMatchesDocument(item, status, status.sourcePath))
      ?? null;
    const latestRound = matchedItem
      ? getLatestHistoryRound(matchedItem, config.promptProfile, normalizePromptSequence(config.promptSequence), options.allowProfileFallback ?? false)
      : null;
    const outputPath = latestRound?.outputPath || status.latestOutputPath;
    if (!outputPath) {
      clearLoadedRoundSnapshot();
      return null;
    }

    const [outputPreview, nextCompareData, savedReview] = await Promise.all([
      service.readOutput(outputPath, PREVIEW_MAX_CHARS),
      service.readCompare(outputPath),
      service.loadReviewDecisions(outputPath),
    ]);
    setPreview(outputPreview);
    setCompareData(nextCompareData);
    setLastExportResult(null);
    liveCompareRef.current = nextCompareData;
    setRoundResult(latestRound ? buildRoundResultFromHistoryRound(latestRound, nextCompareData) : buildRoundResultFromCompareData(nextCompareData));
    setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisions(savedReview.decisions) });
    return { historyItem: matchedItem, round: latestRound, compareData: nextCompareData };
  }

  async function loadRoundSnapshotByOutputPath(outputPath: string) {
    clearAutoSnapshotSuppression();
    const [outputPreview, nextCompareData, savedReview] = await Promise.all([
      service.readOutput(outputPath, PREVIEW_MAX_CHARS),
      service.readCompare(outputPath),
      service.loadReviewDecisions(outputPath),
    ]);
    setPreview(outputPreview);
    setCompareData(nextCompareData);
    setLastExportResult(null);
    liveCompareRef.current = nextCompareData;
    setRoundResult(buildRoundResultFromCompareData(nextCompareData));
    setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisions(savedReview.decisions) });
    return nextCompareData;
  }

  async function handlePromptProfileChange(promptProfile: ModelConfig["promptProfile"]) {
    const nextConfig = { ...modelConfig, promptProfile, promptSequence: normalizePromptSequence(modelConfig.promptSequence) };
    setModelConfig(nextConfig);
    clearAutoSnapshotSuppression();
    localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, promptProfile);
    localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(nextConfig.promptSequence));
    if (!documentStatus?.sourcePath) {
      return;
    }
    try {
      setError("");
      setRuntimeStep("正在切换改写轮次模式。");
      const status = await refreshDocumentState(documentStatus.sourcePath, nextConfig);
      const nextHistoryItems = await refreshHistoryList();
      const loadedSnapshot = await loadLatestRoundSnapshot(status, nextConfig, {
        historyItems: nextHistoryItems,
        allowProfileFallback: false,
      });
      setRuntimeStep(loadedSnapshot ? "改写轮次模式已切换，已载入最新 Diff。" : "改写轮次模式已切换，当前模式暂无 Diff。");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("切换改写轮次模式失败");
    }
  }

  async function handlePromptSequenceChange(promptSequence: PromptId[]) {
    const nextConfig = { ...modelConfig, promptProfile: "cn_custom" as const, promptSequence: normalizePromptSequence(promptSequence) };
    setModelConfig(nextConfig);
    clearAutoSnapshotSuppression();
    localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, nextConfig.promptProfile);
    localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(nextConfig.promptSequence));
    if (!documentStatus?.sourcePath) {
      return;
    }
    try {
      setError("");
      setRuntimeStep("正在切换自定义 Prompt 组合。");
      const status = await refreshDocumentState(documentStatus.sourcePath, nextConfig);
      const nextHistoryItems = await refreshHistoryList();
      const loadedSnapshot = await loadLatestRoundSnapshot(status, nextConfig, {
        historyItems: nextHistoryItems,
        allowProfileFallback: false,
      });
      setRuntimeStep(loadedSnapshot ? "自定义组合已切换，已载入匹配 Diff。" : "自定义组合已切换，当前组合暂无 Diff。");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("切换自定义 Prompt 组合失败");
    }
  }

  async function handleSelectHistory(item: HistoryDocumentSummary, configOverride = modelConfig) {
    const taskTicket = beginTask("loading-history");
    try {
      setRuntimeStep("正在载入历史文档。");
      clearAutoSnapshotSuppression();
      clearDocumentDerivedState({ includeDetectionReport: true });
      const status = await refreshDocumentState(item.sourcePath, configOverride);
      const loadedSnapshot = await loadLatestRoundSnapshot(status, configOverride, {
        historyItem: item,
        allowProfileFallback: true,
      });
      setNotice(`已切换到历史文档。${describeDocumentProgress(status.nextRound, status.hasNextRound)}`);
      setRuntimeStep(
        loadedSnapshot
          ? status.hasNextRound
            ? `历史文档已载入，并显示最新 Diff；可执行第 ${status.nextRound} 轮。`
            : "历史文档已载入，并显示最新 Diff；全部轮次已完成。"
          : status.hasNextRound
            ? `历史文档已载入，但当前模式暂无 Diff；可执行第 ${status.nextRound} 轮。`
            : "历史文档已载入，但当前模式暂无 Diff。"
      );
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("载入历史文档失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  function getHistoryDeleteCopy(options?: DeleteHistoryOptions): { actionLabel: string; confirmText: string; doneLabel: string } {
    const mode: HistoryDeleteMode = options?.mode ?? "records_and_artifacts";
    const fromRound = options?.fromRound;
    if (mode === "records_artifacts_and_source") {
      return {
        actionLabel: "彻底清理该文档项目副本",
        confirmText: "确认彻底清理这篇文档的项目副本吗？\n\n会删除历史记录、轮次中间产物、项目导出副本，并且只在源文件位于项目 origin 目录时删除该源文档副本；不会删除浏览器下载目录或其他外部路径文件。",
        doneLabel: "项目副本彻底清理完成",
      };
    }
    if (mode === "exports_only") {
      return {
        actionLabel: fromRound ? `清理第 ${fromRound} 轮及之后的项目导出副本` : "清理该文档项目导出副本",
        confirmText: fromRound
          ? `确认只清理第 ${fromRound} 轮及之后的项目导出副本吗？\n\n会删除项目内 Word/TXT 导出副本及其审计报告；会保留中间结果、Diff 和历史轮次。浏览器已经下载到本地的文件不受影响。`
          : "确认只清理该文档的项目导出副本吗？\n\n会删除项目内 Word/TXT 导出副本及其审计报告；会保留中间结果、Diff 和历史轮次。浏览器已经下载到本地的文件不受影响。",
        doneLabel: "项目导出副本清理完成",
      };
    }
    if (mode === "records_only") {
      return {
        actionLabel: fromRound ? `移除第 ${fromRound} 轮及之后的界面记录` : "仅移除该文档界面记录",
        confirmText: fromRound
          ? `确认只移除第 ${fromRound} 轮及之后的界面记录吗？\n\n不会删除项目里的生成文件，但这些文件会从界面索引中脱离。`
          : "确认只移除该文档的界面记录吗？\n\n不会删除项目里的生成文件，但这篇文档会从历史列表中消失。",
        doneLabel: "界面记录移除完成",
      };
    }
    return {
      actionLabel: fromRound ? `回滚第 ${fromRound} 轮及之后` : "删除该文档生成链路",
      confirmText: fromRound
          ? `确认回滚第 ${fromRound} 轮及之后吗？\n\n会删除对应历史轮次、中间文件、Diff、改写检查报告和项目导出副本；不会删除源文档。`
          : "确认删除该文档的生成链路吗？\n\n会删除本项目为这篇文档生成的历史轮次、中间文件、Diff、改写检查报告和项目导出副本；不会删除源文档。",
      doneLabel: fromRound ? "历史回滚完成" : "生成链路清理完成",
    };
  }

  function buildHistoryDeleteConfirmText(baseText: string, impact: HistoryDeleteImpact | null): string {
    if (!impact) {
      return baseText;
    }
    const stats = impact.fileStats;
    const roundText = impact.affectedRounds.length ? impact.affectedRounds.join(", ") : "无";
    const sourceText = impact.willDeleteSource
      ? `源文档副本：会删除项目 origin 内源文件（${stats.sources ?? 0} 个）`
      : impact.sourceOwnedByProject
        ? "源文档副本：保留"
        : "源文档副本：外部路径不删除";
    const warningText = impact.warnings.length ? `\n提醒：${impact.warnings.join("；")}` : "";
    return [
      baseText,
      "",
      "【删除前影响预览】",
      `影响轮次：${roundText}`,
      `文件数量：${stats.existing} 个，占用 ${formatBytes(stats.bytes)}`,
      `分类：源副本 ${stats.sources ?? 0}，项目导出 ${stats.exports}，中间产物 ${stats.intermediate}，报告 ${stats.reports}`,
      sourceText,
      impact.hasMoreFiles ? "文件列表较长，界面只展示前 80 个，后端会按同一安全规则处理。" : "",
      warningText.trim(),
    ].filter(Boolean).join("\n");
  }

  async function handleScanHistoryOrphans() {
    const taskTicket = beginTask("loading-history");
    try {
      setRuntimeStep("正在扫描未归属生成文件。");
      const result = await refreshHistoryOrphanScan();
      setNotice(result.totalOrphanFiles ? `发现 ${result.totalOrphanFiles} 个未归属生成文件，可按需清理。` : "没有发现未归属生成文件。");
      setRuntimeStep("未归属文件扫描完成");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("未归属文件扫描失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleDeleteHistoryOrphans() {
    let currentScan = historyOrphanScan;
    if (!currentScan) {
      const scanTicket = beginTask("loading-history");
      try {
        setRuntimeStep("正在扫描未归属生成文件。");
        currentScan = await refreshHistoryOrphanScan();
      } catch (appError) {
        setError(stringifyError(appError));
        setRuntimeStep("未归属文件扫描失败");
        return;
      } finally {
        finishTask(scanTicket);
      }
    }
    if (!currentScan.totalOrphanFiles) {
      setNotice("没有可清理的未归属生成文件。");
      return;
    }
    const confirmed = await requestConfirm({
      title: `清理 ${currentScan.totalOrphanFiles} 个未归属项目文件`,
      description: "只会删除项目目录中未被历史记录或当前文档引用的源文档副本和生成产物。",
      details: [
        `预计释放：${formatBytes(currentScan.orphanStats.bytes)}`,
        "浏览器已经下载到本地的文件不会受影响。",
        "外部路径文件不会被删除。",
      ],
      confirmLabel: "确认清理",
      cancelLabel: "先不清理",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const taskTicket = beginTask("deleting-history");
    try {
      setRuntimeStep("正在清理未归属生成文件。");
      const result = await service.deleteHistoryOrphans(getProtectedHistoryArtifactPaths());
      setHistoryOrphanScan(result.after);
      const deletedStats = result.deletedFileStats;
      const failedText = result.failedFiles.length ? `，${result.failedFiles.length} 个文件未能删除` : "";
      setNotice(`已清理 ${deletedStats.total} 个未归属项目文件（源副本 ${deletedStats.sources ?? 0}，生成物 ${deletedStats.intermediate + deletedStats.exports + deletedStats.reports}），释放 ${formatBytes(deletedStats.bytes)}${failedText}。`);
      setRuntimeStep("未归属文件清理完成");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("未归属文件清理失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handlePreviewHistoryDelete(docId: string, options?: DeleteHistoryOptions): Promise<HistoryDeleteImpact | null> {
    try {
      setError("");
      setRuntimeStep("正在计算历史清理影响范围。");
      const impact = await service.previewDocumentHistoryDelete(docId, options);
      const stats = impact.fileStats;
      setRuntimeStep("历史清理影响预览完成");
      setNotice(`已生成删除前影响预览：${stats.existing} 个项目文件，约 ${formatBytes(stats.bytes)}。`);
      return impact;
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("历史清理影响预览失败");
      return null;
    }
  }

  async function handleDeleteHistory(docId: string, options?: DeleteHistoryOptions) {
    const { actionLabel, confirmText, doneLabel } = getHistoryDeleteCopy(options);
    let impact: HistoryDeleteImpact | null = null;
    const previewTicket = beginTask("loading-history", {
      globalBusy: false,
      runtimeStep: "正在计算历史清理影响范围。",
    });
    try {
      impact = await service.previewDocumentHistoryDelete(docId, options);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("历史清理影响预览失败");
      finishTask(previewTicket);
      return;
    }
    finishTask(previewTicket);
    const confirmBody = splitConfirmText(buildHistoryDeleteConfirmText(confirmText, impact));
    const confirmed = await requestConfirm({
      title: actionLabel,
      description: confirmBody.description,
      details: confirmBody.details,
      confirmLabel: "确认执行",
      cancelLabel: "取消",
      tone: options?.mode === "records_only" ? "warning" : "danger",
    });
    if (!confirmed) {
      setRuntimeStep("待命");
      return;
    }
    const taskTicket = beginTask("deleting-history");
    try {
      setRuntimeStep(`正在${actionLabel}。`);
      const result = await service.deleteDocumentHistory(docId, options);
      const items = await refreshHistoryList();
      setHistoryOrphanScan(null);

      if (documentStatus?.docId === docId) {
        if (result.removedDocument) {
          setDocumentStatus(null);
          setHistory(null);
          setProtectionMap(null);
          clearDocumentDerivedState({ includeDetectionReport: true });
          saveStoredDetectionReport(null, null);
        } else {
          const matchedItem = items.find((item) => item.docId === docId);
          if (matchedItem) {
            const status = await refreshDocumentState(matchedItem.sourcePath);
            await loadLatestRoundSnapshot(status, modelConfig, {
              historyItem: matchedItem,
              allowProfileFallback: true,
            });
          } else {
            clearLoadedRoundSnapshot();
          }
        }
      }

      const affectedRounds = result.deletedRounds.length ? result.deletedRounds : result.affectedRounds ?? [];
      const roundText = affectedRounds.length ? `影响轮次：${affectedRounds.join(", ")}。` : "没有匹配到可处理的轮次。";
      const deletedStats = result.deletedFileStats;
      const fileText = deletedStats
        ? `删除文件：${deletedStats.existing} 个（源副本 ${deletedStats.sources ?? 0}，项目导出 ${deletedStats.exports}，中间/报告 ${deletedStats.intermediate + deletedStats.reports}）。`
        : `删除生成文件：${result.deletedFiles.length} 个；源文档保留。`;
      const failedText = result.failedFiles?.length ? `另有 ${result.failedFiles.length} 个文件删除失败，已保留在项目目录中。` : "";
      setNotice(result.removedDocument ? `历史记录已移除。${roundText}${fileText}${failedText}` : `历史记录已更新。${roundText}${fileText}${failedText}`);
      setRuntimeStep(doneLabel);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep(`${actionLabel}失败`);
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleSaveModelConfig(nextConfig?: ModelConfig, testConfig?: ModelConfig) {
    const taskTicket = beginTask("saving-config");
    try {
      setRuntimeStep("正在保存模型配置。");
      const configToSave = nextConfig ?? modelConfig;
      if (testConfig && !testConfig.offlineMode) {
        setRuntimeStep("正在测试模型连接，测试通过后保存。");
        await service.testModelConnection(testConfig);
      }
      const saved = await service.saveModelConfig(configToSave);
      const mergedSaved = { ...saved, ...configToSave, roundModels: { ...(saved.roundModels ?? {}), ...(configToSave.roundModels ?? {}) } };
      setModelConfig(mergedSaved);
      if (documentStatus) {
        await refreshDocumentState(documentStatus.sourcePath, mergedSaved);
      }
      if (mergedSaved.baseUrl && mergedSaved.apiKey && !mergedSaved.offlineMode) {
        await refreshModelCatalog(mergedSaved, { silent: true });
      }
      setNotice(`模型配置已保存，当前模式为 ${describePromptProfile(mergedSaved.promptProfile)}。`);
      setRuntimeStep("模型配置已保存");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("保存模型配置失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleTestConnection() {
    const taskTicket = beginTask("testing-config");
    try {
      setRuntimeStep(modelConfig.offlineMode ? "离线模式无需测试远程接口。" : "正在测试接口连通性。");
      const result = await service.testModelConnection(modelConfig);
      const detailParts = [
        result.offlineMode ? "当前为离线模式，无需测试远程接口。" : "接口连通性测试成功。",
        result.apiType ? `接口类型：${result.apiType}` : "",
        result.endpoint ? `请求地址：${result.endpoint}` : "",
      ].filter(Boolean);
      setNotice(detailParts.join(" "));
      setRuntimeStep(result.offlineMode ? "离线模式已确认" : "接口连通性测试成功");
      if (!result.offlineMode) {
        await refreshModelCatalog(modelConfig, { silent: true });
      }
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("接口连通性测试失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleRefreshProviderModels(providerId: string) {
    const provider = modelConfig.modelProviders?.find((item) => item.id === providerId);
    if (!provider) {
      setNotice("没有找到这个服务商，请先到模型配置页添加。");
      return;
    }
    const taskTicket = beginTask("loading-models");
    const abortController = beginCancelableModelCatalogRequest();
    try {
      setRuntimeStep(`正在读取 ${provider.name || "服务商"} 的模型列表。`);
      const catalog = await service.listModels(buildModelConfigFromProvider(provider, modelConfig), abortController.signal);
      const models = catalog.models.map((item) => item.id);
      const nextProviders = (modelConfig.modelProviders ?? []).map((item) => (
        item.id === providerId
          ? {
            ...item,
            models,
            defaultModel: item.defaultModel || models[0] || "",
            updatedAt: new Date().toISOString(),
          }
          : item
      ));
      const nextConfig = { ...modelConfig, modelProviders: nextProviders };
      const saved = await service.saveModelConfig(nextConfig);
      setModelConfig({ ...saved, ...nextConfig, roundModels: { ...(saved.roundModels ?? {}), ...(nextConfig.roundModels ?? {}) } });
      setNotice(`已读取 ${provider.name || "服务商"} 的模型列表：${models.length} 个。`);
      setRuntimeStep("服务商模型列表已更新");
    } catch (appError) {
      if (abortController.signal.aborted) {
        setNotice("已停止本次服务商模型列表读取，已有配置已保留。");
        setRuntimeStep("服务商模型列表读取已停止");
      } else {
        setError(stringifyError(appError));
        setRuntimeStep("读取服务商模型列表失败");
      }
    } finally {
      clearCancelableModelCatalogRequest(abortController);
      finishTask(taskTicket);
    }
  }

  async function handleRefreshAllProviderModels() {
    const providers = modelConfig.modelProviders ?? [];
    const enabledProviders = providers.filter((provider) => provider.enabled !== false);
    if (!enabledProviders.length) {
      setNotice("当前没有启用的服务商。");
      return;
    }
    const taskTicket = beginTask("loading-models");
    const abortController = beginCancelableModelCatalogRequest();
    try {
      setRuntimeStep("正在批量读取已启用服务商的模型列表。");
      const providerPatches = new Map<string, Partial<ModelProviderConfig>>();
      const failures: string[] = [];
      for (const provider of enabledProviders) {
        if (abortController.signal.aborted) {
          throw new Error("操作已停止。");
        }
        if (!provider.baseUrl.trim() || !provider.apiKey.trim()) {
          failures.push(`${provider.name || provider.id}：连接信息不完整`);
          continue;
        }
        try {
          const catalog = await service.listModels(buildModelConfigFromProvider(provider, modelConfig), abortController.signal);
          const models = catalog.models.map((item) => item.id);
          providerPatches.set(provider.id, {
            models,
            defaultModel: provider.defaultModel || models[0] || "",
            updatedAt: new Date().toISOString(),
          });
        } catch (appError) {
          failures.push(`${provider.name || provider.id}：${stringifyError(appError)}`);
        }
      }
      const nextProviders = providers.map((provider) => ({
        ...provider,
        ...(providerPatches.get(provider.id) ?? {}),
      }));
      const nextConfig = { ...modelConfig, modelProviders: nextProviders };
      const saved = await service.saveModelConfig(nextConfig);
      setModelConfig({ ...saved, ...nextConfig, roundModels: { ...(saved.roundModels ?? {}), ...(nextConfig.roundModels ?? {}) } });
      const successCount = providerPatches.size;
      setNotice(
        failures.length
          ? `已更新 ${successCount} 个服务商模型列表，${failures.length} 个失败：${failures.slice(0, 2).join("；")}`
          : `已更新 ${successCount} 个服务商模型列表。`,
      );
      setRuntimeStep("服务商模型列表已批量更新");
    } catch (appError) {
      if (abortController.signal.aborted) {
        setNotice("已停止批量读取服务商模型列表，已有服务商配置不会被清空。");
        setRuntimeStep("批量读取服务商模型已停止");
      } else {
        setError(stringifyError(appError));
        setRuntimeStep("批量读取服务商模型失败");
      }
    } finally {
      clearCancelableModelCatalogRequest(abortController);
      finishTask(taskTicket);
    }
  }

  async function handleParseFormatRules(text: string) {
    if (formatParseAbortRef.current) {
      setNotice("学校规范正在解析中；如需换模型或修改内容，请先停止当前解析。");
      return;
    }
    if (!text.trim()) {
      const taskTicket = beginTask("applying-format");
      try {
        setRuntimeStep("正在启用默认学校规范。");
        const result = await service.resetFormatRules();
        setActiveFormatRules(result.rules);
        setPendingFormatRules(null);
        saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, result.rules);
        saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
        setNotice("未填写学校模板说明，已使用当前内置默认规范。");
        setRuntimeStep("默认学校规范已启用");
      } catch (appError) {
        setError(stringifyError(appError));
        setRuntimeStep("启用默认学校规范失败");
      } finally {
        finishTask(taskTicket);
      }
      return;
    }
    const taskTicket = beginTask("parsing-format");
    const abortController = new AbortController();
    formatParseAbortRef.current = abortController;
    try {
      const parserModelConfig = buildFormatParserModelConfig();
      const parserTimeoutSeconds = Math.max(300, Math.min(1800, Number(parserModelConfig.requestTimeoutSeconds || 300)));
      setRuntimeStep(`正在解析学校格式说明，超过约 ${parserTimeoutSeconds} 秒会自动回退到本地规则抽取。`);
      const result = await service.parseFormatRules(text, parserModelConfig, abortController.signal);
      setPendingFormatRules(result.rules);
      saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, result.rules);
      const fallbackWarning = result.rules.quality?.warnings?.find((item) => item.includes("AI 结构化解析未完成"));
      if (fallbackWarning) {
        setNotice(`AI 解析未完成，已用本地规则抽取生成候选规范。请复核后再启用。`);
        setRuntimeStep("学校格式规范已用本地规则兜底生成，待确认");
      } else {
        setNotice(`学校格式规范已解析：${result.rules.schoolName || "自定义规范"}。请确认后再启用。`);
        setRuntimeStep("学校格式规范待确认");
      }
    } catch (appError) {
      if (abortController.signal.aborted) {
        setNotice("已停止本次学校规范解析。");
        setRuntimeStep("学校格式规范解析已停止，可换模型、改文本后重新解析");
      } else {
        setError(stringifyError(appError));
        setRuntimeStep("学校格式规范解析已停止，可换用更快的 JSON 模型或稍后重试");
      }
    } finally {
      if (formatParseAbortRef.current === abortController) {
        formatParseAbortRef.current = null;
      }
      finishTask(taskTicket);
    }
  }

  function handleCancelFormatRulesParse() {
    const controller = formatParseAbortRef.current;
    if (!controller) {
      return;
    }
    setRuntimeStep("正在停止学校规范解析…");
    controller.abort("fyadr-user-cancel");
  }

  async function handleConfirmFormatRules() {
    if (!pendingFormatRules) {
      setNotice("没有待确认的学校格式规范。");
      return;
    }
    const taskTicket = beginTask("applying-format");
    try {
      setRuntimeStep("正在启用学校格式规范。");
      const result = await service.activateFormatRules(pendingFormatRules);
      setActiveFormatRules(result.rules);
      setPendingFormatRules(null);
      saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, result.rules);
      saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
      setNotice(`学校格式规范已启用：${result.rules.schoolName || "自定义规范"}。`);
      setRuntimeStep("学校格式规范已启用");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("启用学校格式规范失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleResetFormatRules() {
    const taskTicket = beginTask("applying-format");
    try {
      setRuntimeStep("正在恢复默认学校规范。");
      const result = await service.resetFormatRules();
      setActiveFormatRules(result.rules);
      setPendingFormatRules(null);
      saveStoredFormatRules(FORMAT_RULE_ACTIVE_KEY, result.rules);
      saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
      setNotice("已恢复默认学校格式规范。");
      setRuntimeStep("默认学校规范已恢复");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("恢复默认学校规范失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handlePickFile() {
    const taskTicket = beginTask("picking-document", {
      globalBusy: false,
      runtimeStep: "正在选择文档。",
    });
    try {
      const picked = await service.pickInputFile();
      if (!picked) {
        setNotice("已取消选择文档。");
        setRuntimeStep("待命");
        return;
      }
      transitionTask(taskTicket, "uploading-document", {
        globalBusy: true,
        runtimeStep: "正在载入文档状态。",
      });
      clearAutoSnapshotSuppression();
      clearDocumentDerivedState({ includeDetectionReport: true });
      const status = await refreshDocumentState(picked.sourcePath);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(status.hasNextRound ? `文档已载入，可执行第 ${status.nextRound} 轮。` : "文档已载入，全部轮次已完成。");
      setNotice(`已导入文档。${describeDocumentProgress(status.nextRound, status.hasNextRound)}`);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("读取文档失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handlePickDetectionReport(providerHint: DetectionReportProvider) {
    const providerName = providerHint === "paperpass" ? "PaperPass" : "SpeedAI";
    if (!documentStatus) {
      setNotice("请先上传或切换到要匹配的论文，再上传对应外部报告。");
      setRuntimeStep("待命");
      return;
    }
    const taskTicket = beginTask("picking-report", {
      globalBusy: false,
      runtimeStep: `正在选择 ${providerName} 外部报告 PDF。`,
    });
    try {
      const report = await service.pickDetectionReport(providerHint);
      if (!report) {
        setRuntimeStep("待命");
        setNotice("已取消选择外部报告。");
        return;
      }
      transitionTask(taskTicket, "parsing-report", {
        globalBusy: true,
        runtimeStep: `正在解析 ${providerName} 外部报告 PDF。`,
      });
      setDetectionReport(report);
      saveStoredDetectionReport(report, documentStatus);
      const highOrMedium = report.segments.filter((segment) => isDetectionRerunRisk(segment)).length;
      setRuntimeStep("外部报告已解析");
      if (report.segments.length === 0) {
        setNotice(`已上传 ${providerName}，但没有解析到风险片段。请确认来源选项与 PDF 类型一致，或将该报告作为总分记录使用。`);
      } else {
        setNotice(`已解析 ${report.providerLabel || providerName}：${report.segments.length} 个片段，${highOrMedium} 个需处理风险片段。`);
      }
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("外部报告解析失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  function handleClearDetectionReport() {
    setDetectionReport(null);
    saveStoredDetectionReport(null, null);
    setNotice("已清除外部报告。");
  }

  async function attachActiveRun(activeRun: EnvironmentDiagnostics["activeRuns"][number]) {
    if (currentRunToken || attachedRunTokenRef.current === activeRun.runId) {
      return;
    }
    attachedRunTokenRef.current = activeRun.runId;
    const taskTicket = beginTask("running-round", {
      clearMessages: false,
      runtimeStep: "正在接管后台运行中的轮次。",
    });
    let runSession: RunSession | null = null;
    try {
      await releaseProgressListener();
      const status = documentStatus && sameWorkspacePath(documentStatus.sourcePath, activeRun.sourcePath)
        ? documentStatus
        : await refreshDocumentState(activeRun.sourcePath);
      const runRound = activeRun.lastEvent?.round || status.nextRound || 1;
      runSession = beginRunSession({
        runId: activeRun.runId,
        sourcePath: activeRun.sourcePath,
        round: runRound,
        taskTicket,
        mode: "attach",
      });
      const liveCompareSeed = createLiveCompareData(status, runRound);
      liveCompareRef.current = liveCompareSeed;
      setCompareData(liveCompareSeed);
      setReviewDecisions({});
      setRoundResult(null);
      setPreview(null);
      visibleProgressRef.current = activeRun.lastEvent ?? null;
      setProgress(activeRun.lastEvent ?? null);
      setNotice("已接管后台运行中的轮次；刷新页面后会继续监听，不会再误开新任务。");

      progressUnlistenRef.current = await service.listenRoundProgress((nextProgress) => {
        if (!isActiveRunSession(runSession)) {
          return;
        }
        const visibleProgress = mergeVisibleProgress(visibleProgressRef.current, nextProgress);
        visibleProgressRef.current = visibleProgress;
        setProgress(visibleProgress);
        if (nextProgress.phase === "chunk-complete" && nextProgress.compareInputText && nextProgress.compareOutputText) {
          const nextCompare = mergeProgressIntoCompareData(liveCompareRef.current, nextProgress, liveCompareSeed);
          liveCompareRef.current = nextCompare;
          setCompareData(nextCompare);
          if (nextProgress.chunkId) {
            setReviewDecisions((current) => current[nextProgress.chunkId!] ? current : { ...current, [nextProgress.chunkId!]: "rewrite" });
          }
        }
        setRuntimeStep(formatRuntimeStep(visibleProgress, "后台轮次运行中"));
      }, activeRun.runId);

      const nextResult = await service.awaitRunRound(activeRun.sourcePath, modelConfig, activeRun.runId);
      if (!isActiveRunSession(runSession)) {
        return;
      }
      clearAutoSnapshotSuppression();
      await releaseProgressListener();
      visibleProgressRef.current = null;
      setProgress(null);
      setRoundResult(nextResult);
      setRuntimeStep(`第 ${nextResult.round} 轮已完成，正在读取预览。`);

      const outputPreview = await service.readOutput(nextResult.outputPath, PREVIEW_MAX_CHARS);
      const nextCompareData = await service.readCompare(nextResult.outputPath);
      const savedReview = await service.loadReviewDecisions(nextResult.outputPath);
      startTransition(() => {
        setPreview(outputPreview);
        liveCompareRef.current = nextCompareData;
        setCompareData(nextCompareData);
        setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisions(savedReview.decisions) });
      });

      const nextStatus = await refreshDocumentState(activeRun.sourcePath);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(nextStatus.hasNextRound ? `第 ${nextResult.round} 轮已完成，可继续执行第 ${nextStatus.nextRound} 轮。` : `第 ${nextResult.round} 轮已完成，全部轮次已结束。`);
      setNotice(nextStatus.hasNextRound ? `第 ${nextResult.round} 轮已完成。你现在可以继续下一轮。` : `第 ${nextResult.round} 轮已完成，可以直接导出。`);
      clearAutoRetryScope(getAutoRunScopeKey(activeRun.sourcePath, modelConfig, nextResult.round));
      scheduleAutoNextRound(nextStatus, nextResult.round, modelConfig);
    } catch (appError) {
      if (isActiveRunSession(runSession)) {
        await releaseProgressListener();
        visibleProgressRef.current = null;
        setProgress(null);
      }
      const runMessage = stringifyError(appError);
      const userCanceled = Boolean(runSession && runSessionRef.current?.sessionId === runSession.sessionId && runSessionRef.current.cancelRequested);
      const resumable = isResumableRunMessage(runMessage);
      setError(resumable ? "" : runMessage);
      setRuntimeStep(runMessage.includes("Unknown run id") ? "后台任务已结束，请刷新文档状态" : resumable ? "后台轮次中断，准备恢复" : "后台轮次监听失败");
      let refreshedStatus: DocumentStatus | null = null;
      if (activeRun.sourcePath) {
        try {
          refreshedStatus = await refreshDocumentState(activeRun.sourcePath);
          await refreshHistoryList();
        } catch {
          // Keep the original run error visible.
        }
      }
      if (!userCanceled && resumable && activeRun.sourcePath) {
        scheduleAutoRetry({
          sourcePath: activeRun.sourcePath,
          round: refreshedStatus?.nextRound || runSession?.round || activeRun.lastEvent?.round || 1,
          config: modelConfig,
          reason: runMessage,
        });
      }
    } finally {
      attachedRunTokenRef.current = null;
      clearRunSession(runSession);
      finishTask(taskTicket);
    }
  }

  async function handleRunRound() {
    if (running) {
      setNotice("当前轮次正在运行中；如需停止，请先点击中断当前轮。");
      return;
    }
    if (!documentStatus) {
      setNotice("请先上传一个 txt 或 docx 文档。");
      return;
    }
    if (!documentStatus.hasNextRound || documentStatus.isComplete || !documentStatus.nextRound) {
      setNotice("当前文档已完成全部轮次。如需重跑，请先在历史记录中回滚。");
      return;
    }

    const runConfig = modelConfig;
    clearPendingAutoActionForSource(documentStatus.sourcePath);
    const taskTicket = beginTask("running-round", {
      runtimeStep: `准备执行第 ${documentStatus.nextRound} 轮。`,
    });
    let runSession: RunSession | null = null;
    try {
      const checkpointStatus = roundProgressStatus
        && sameWorkspacePath(roundProgressStatus.sourcePath, documentStatus.sourcePath)
        && roundProgressStatus.round === documentStatus.nextRound
        ? roundProgressStatus
        : await refreshRoundProgressStatus(documentStatus, modelConfig);
      const checkpointProgress = createCheckpointProgress(checkpointStatus, modelConfig.rewriteCandidateMode);
      visibleProgressRef.current = checkpointProgress;
      setProgress(checkpointProgress);
      setRerunFailures([]);
      setLastExportResult(null);
      await releaseProgressListener();

      const liveCompareSeed = activeCompareData?.round === documentStatus.nextRound
        ? activeCompareData
        : createLiveCompareData(documentStatus, documentStatus.nextRound);
      liveCompareRef.current = liveCompareSeed;
      setCompareData(liveCompareSeed);
      setReviewDecisions({});
      setRoundResult(null);
      setPreview(null);
      const runToken = await service.startRunRound(documentStatus.sourcePath, runConfig);
      if (!runToken) {
        throw new Error("无法创建运行任务。");
      }
      runSession = beginRunSession({
        runId: runToken,
        sourcePath: documentStatus.sourcePath,
        round: documentStatus.nextRound,
        taskTicket,
        mode: "start",
      });
      try {
        const runSnapshot = await service.getHealth();
        const activeRun = runSnapshot.activeRuns.find((item) => item.runId === runToken);
        if (activeRun?.lastEvent && isActiveRunSession(runSession)) {
          const visibleProgress = mergeVisibleProgress(visibleProgressRef.current, activeRun.lastEvent);
          visibleProgressRef.current = visibleProgress;
          setProgress(visibleProgress);
        }
      } catch {
        // Snapshot is only for smoother resume display; the SSE stream remains authoritative.
      }
      progressUnlistenRef.current = await service.listenRoundProgress((nextProgress) => {
        if (!isActiveRunSession(runSession)) {
          return;
        }
        const visibleProgress = mergeVisibleProgress(visibleProgressRef.current, nextProgress);
        visibleProgressRef.current = visibleProgress;
        setProgress(visibleProgress);
        if (nextProgress.phase === "chunk-complete" && nextProgress.compareInputText && nextProgress.compareOutputText) {
          const nextCompare = mergeProgressIntoCompareData(liveCompareRef.current, nextProgress, liveCompareSeed);
          liveCompareRef.current = nextCompare;
          setCompareData(nextCompare);
          if (nextProgress.chunkId) {
            setReviewDecisions((current) => current[nextProgress.chunkId!] ? current : { ...current, [nextProgress.chunkId!]: "rewrite" });
          }
        }
        setRuntimeStep(formatRuntimeStep(visibleProgress, "处理中"));
      }, runToken);

      setRuntimeStep(checkpointProgress ? formatRuntimeStep(checkpointProgress, `准备续跑第 ${documentStatus.nextRound} 轮。`) : `准备执行第 ${documentStatus.nextRound} 轮。`);
      setNotice(checkpointProgress ? checkpointProgress.resumeExplanation || "已识别断点，本次会从已完成分块后继续，不会重头跑。" : `本次运行将使用 ${describePromptProfile(modelConfig.promptProfile)}，中途失败时会优先尝试断点续跑。`);

      clearAutoSnapshotSuppression();
      const nextResult = await service.awaitRunRound(documentStatus.sourcePath, runConfig, runToken);
      if (!isActiveRunSession(runSession)) {
        return;
      }
      await releaseProgressListener();
      visibleProgressRef.current = null;
      setProgress(null);
      setRoundResult(nextResult);
      setRuntimeStep(`第 ${nextResult.round} 轮已完成，正在读取预览。`);

      const outputPreview = await service.readOutput(nextResult.outputPath, PREVIEW_MAX_CHARS);
      const nextCompareData = await service.readCompare(nextResult.outputPath);
      const savedReview = await service.loadReviewDecisions(nextResult.outputPath);
      startTransition(() => {
        setPreview(outputPreview);
        liveCompareRef.current = nextCompareData;
        setCompareData(nextCompareData);
        setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisions(savedReview.decisions) });
      });

      const status = await refreshDocumentState(documentStatus.sourcePath);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(status.hasNextRound ? `第 ${nextResult.round} 轮已完成，可继续执行第 ${status.nextRound} 轮。` : `第 ${nextResult.round} 轮已完成，全部轮次已结束。`);
      setNotice(status.hasNextRound ? `第 ${nextResult.round} 轮已完成。你现在可以继续下一轮，或先导出查看结果。` : `第 ${nextResult.round} 轮已完成，可以直接导出。`);
      clearAutoRetryScope(getAutoRunScopeKey(documentStatus.sourcePath, runConfig, nextResult.round));
      scheduleAutoNextRound(status, nextResult.round, runConfig);
    } catch (appError) {
      if (isActiveRunSession(runSession)) {
        await releaseProgressListener();
        visibleProgressRef.current = null;
        setProgress(null);
      }
      const runMessage = stringifyError(appError);
      const interrupted = isInterruptedRunMessage(runMessage);
      const resumable = isResumableRunMessage(runMessage);
      const userCanceled = Boolean(runSession && runSessionRef.current?.sessionId === runSession.sessionId && runSessionRef.current.cancelRequested);
      if (interrupted) {
        setError("");
        setNotice(runMessage);
        setRuntimeStep("当前轮次已中断，可继续执行");
      } else {
        setError(runMessage);
        setRuntimeStep(resumable ? "执行中断，可尝试续跑" : "执行轮次失败");
      }
      let refreshedStatus: DocumentStatus | null = null;
      if (documentStatus?.sourcePath) {
        try {
          refreshedStatus = await refreshDocumentState(documentStatus.sourcePath);
          await refreshHistoryList();
        } catch {
          // Keep the original run error visible; refresh can be retried by the next action.
        }
      }
      if (!userCanceled && resumable && documentStatus?.sourcePath && documentStatus.nextRound) {
        scheduleAutoRetry({
          sourcePath: documentStatus.sourcePath,
          round: refreshedStatus?.nextRound || runSession?.round || documentStatus.nextRound,
          config: runConfig,
          reason: runMessage,
        });
      }
    } finally {
      clearRunSession(runSession);
      finishTask(taskTicket);
    }
  }

  async function handleCancelRunRound() {
    const runSession = runSessionRef.current;
    if (!runSession || !currentRunToken || runSession.runId !== currentRunToken) {
      setNotice("当前没有可中断的运行任务。");
      return;
    }
    try {
      markRunSessionCancelRequested(runSession);
      transitionTask(runSession.taskTicket, "canceling-run", {
        runtimeStep: "正在中断当前轮次",
      });
      await service.cancelRunRound(runSession.runId);
      setNotice("已请求中断。已完成的块会保留，稍后点击执行可从断点继续。");
      setRuntimeStep("正在中断当前轮次");
    } catch (appError) {
      setError(stringifyError(appError));
      if (isActiveRunSession(runSession)) {
        transitionTask(runSession.taskTicket, "running-round");
      }
    }
  }

  async function attachActiveBatchRerun(activeBatch: BatchRerunStatus) {
    if (currentBatchRerunToken || batchRerunSessionRef.current?.runId === activeBatch.runId) {
      return;
    }
    const taskTicket = beginTask("batch-rerunning", {
      clearMessages: false,
      runtimeStep: "正在接回后台批量重跑任务。",
    });
    const runId = activeBatch.runId;
    try {
      beginBatchRerunSession({
        runId,
        taskTicket,
        label: "后台批量重跑",
        cancelRequested: activeBatch.cancelRequested,
      });
      setNotice("已接回后台批量重跑；刷新页面不会让已完成块白跑。");
      const status = activeBatch.completed ? activeBatch : await waitForBatchRerunResult(runId, "后台批量重跑");
      if (!status.result) {
        throw new Error(status.error || "后台批量重跑没有返回结果");
      }
      const successTargets = (status.result.successChunkIds ?? []).map((chunkId) => ({ chunkId }));
      await applyBatchRerunResult("后台批量重跑", status.result, successTargets);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("后台批量重跑接回失败");
    } finally {
      clearBatchRerunSession(runId);
      finishTask(taskTicket);
    }
  }

  async function handleCancelBatchRerun() {
    const session = batchRerunSessionRef.current;
    if (!session || !currentBatchRerunToken || session.runId !== currentBatchRerunToken) {
      setNotice("当前没有可停止的批量重跑任务。");
      return;
    }
    try {
      markBatchRerunCancelRequested(session.runId);
      transitionTask(session.taskTicket, "canceling-batch-rerun", {
        runtimeStep: `${session.label}正在停止；当前块完成后会停下`,
      });
      await service.cancelBatchRerun(session.runId);
      setNotice("已请求停止批量重跑；已完成的块会保留。");
    } catch (appError) {
      setError(stringifyError(appError));
      transitionTask(session.taskTicket, "batch-rerunning");
    }
  }

  async function handleResetCurrentRound() {
    if (running) {
      setNotice("当前轮次正在运行中，请先中断后再放弃本轮断点。");
      return;
    }
    if (!documentStatus?.nextRound) {
      setNotice("当前没有可放弃进度的轮次。");
      return;
    }
    const confirmed = await requestConfirm({
      title: `放弃第 ${documentStatus.nextRound} 轮断点进度`,
      description: "只会清理当前轮已完成的分块缓存；源文档、已完成轮次和历史记录都会保留。",
      details: ["后续再次运行该轮时，会从该轮开头重新生成。", "刷新页面后不会自动载入旧 Diff；需要查看时可从历史记录手动打开。"],
      confirmLabel: "确认放弃",
      cancelLabel: "保留断点",
      tone: "warning",
    });
    if (!confirmed) {
      return;
    }
    const taskTicket = beginTask("resetting-round");
    const resetRoundNumber = documentStatus.nextRound;
    try {
      await releaseProgressListener();
      await service.resetRoundProgress(documentStatus.sourcePath, modelConfig.promptProfile, resetRoundNumber, modelConfig.promptSequence);
      suppressAutoSnapshotRestore(documentStatus, modelConfig, resetRoundNumber);
      setProgress(null);
      clearLoadedRoundSnapshot();
      await refreshDocumentState(documentStatus.sourcePath);
      await refreshHistoryList();
      setNotice(`第 ${resetRoundNumber} 轮进度已放弃；刷新后不会自动恢复旧 Diff，历史记录仍可手动打开。`);
      setRuntimeStep("当前轮次进度已清理");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("清理当前轮次断点失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleRerunChunk(chunkId: string, userFeedback?: string) {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    if (!outputPath) {
      setNotice("当前没有可重跑的输出结果。");
      return;
    }
    const taskTicket = beginTask("rerunning-chunk");
    try {
      setRuntimeStep(`正在重跑块 ${chunkId}。`);
      const result = await service.rerunChunk(outputPath, chunkId, modelConfig, userFeedback);
      setRoundResult(buildRoundResultFromRerunResult(result, roundResult));
      setCompareData(result.compare);
      setLastExportResult(null);
      clearRerunFailure(chunkId);
      liveCompareRef.current = result.compare;
      setReviewDecisions((current) => ({ ...buildDefaultReviewDecisions(result.compare), ...current, [chunkId]: "rewrite" }));
      const outputPreview = await service.readOutput(result.outputPath, PREVIEW_MAX_CHARS);
      setPreview(outputPreview);
      setNotice(`块 ${chunkId} 已重跑完成，默认采用新改写。`);
      setRuntimeStep("局部重跑完成");
    } catch (appError) {
      const message = stringifyError(appError);
      upsertRerunFailure({ chunkId, error: message, ...extractRerunFailureExtras(appError) });
      setError(message);
      setRuntimeStep("局部重跑失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  function formatBatchRerunProgress(label: string, status: BatchRerunStatus): string {
    const chunkText = status.currentChunkId ? `：${status.currentChunkId}` : "";
    const cancelText = status.cancelRequested ? "，正在停止" : "";
    return `${label} ${status.completedCount}/${status.totalCount}${chunkText}；成功 ${status.successCount}，失败 ${status.failureCount}${cancelText}`;
  }

  async function waitForBatchRerunResult(runId: string, label: string): Promise<BatchRerunStatus> {
    for (;;) {
      const status = await service.getBatchRerunStatus(runId);
      setRuntimeStep(formatBatchRerunProgress(label, status));
      if (status.completed) {
        return status;
      }
      await waitForMs(BATCH_RERUN_POLL_INTERVAL_MS);
    }
  }

  async function applyBatchRerunResult(
    actionLabel: string,
    result: BatchRerunResult,
    targets: BatchRerunTarget[],
    suffix = "",
  ) {
    let latestCompare = result.compare ?? null;
    const failures: BatchRerunFailure[] = result.failures.map((failure) => ({ ...failure }));
    if (!latestCompare && result.outputPath) {
      try {
        latestCompare = await service.readCompare(result.outputPath);
      } catch (appError) {
        failures.push({ chunkId: "预览刷新", error: stringifyError(appError) });
      }
    }
    if (latestCompare) {
      const confirmedCompare = latestCompare;
      const nextRoundResult = buildRoundResultFromBatchRerunResult({ ...result, compare: confirmedCompare }, roundResult);
      if (nextRoundResult) {
        setRoundResult(nextRoundResult);
      }
      setCompareData(confirmedCompare);
      liveCompareRef.current = confirmedCompare;
      const failedChunkIds = new Set(result.failures.map((failure) => failure.chunkId));
      const successChunkIds = new Set(result.successChunkIds ?? []);
      const completedTargets = successChunkIds.size
        ? [...successChunkIds].map((chunkId) => ({ chunkId }))
        : targets.slice(0, result.completedCount).filter((target) => !failedChunkIds.has(target.chunkId));
      setReviewDecisions((current) => ({
        ...buildDefaultReviewDecisions(confirmedCompare),
        ...current,
        ...Object.fromEntries(completedTargets.map((target) => [target.chunkId, "rewrite" as ReviewDecision])),
      }));
    }
    if (result.successCount > 0) {
      try {
        const outputPreview = await service.readOutput(result.outputPath, PREVIEW_MAX_CHARS);
        setPreview(outputPreview);
      } catch (appError) {
        failures.push({ chunkId: "预览刷新", error: stringifyError(appError) });
      }
    }
    setLastExportResult(null);
    setRerunFailures(scopeRerunFailures(failures, latestCompare ?? activeCompareData));
    const finalSuffix = result.canceled ? `${suffix}已停止；已完成的块已保留。` : suffix;
    if (result.successCount === 0 && failures.length) {
      setError(formatBatchRerunSummary(actionLabel, result.successCount, result.totalCount, failures, finalSuffix));
      setRuntimeStep(`${actionLabel}全部失败`);
      return;
    }
    setNotice(formatBatchRerunSummary(actionLabel, result.successCount, result.totalCount, failures, finalSuffix));
    setRuntimeStep(result.canceled ? `${actionLabel}已停止` : failures.length ? `${actionLabel}部分完成` : `${actionLabel}完成`);
  }

  async function runBatchRerunTask(actionLabel: string, outputPath: string, targets: BatchRerunTarget[], suffix = "") {
    const taskTicket = beginTask("batch-rerunning");
    let runId: string | null = null;
    try {
      setRerunFailures([]);
      setRuntimeStep(`${actionLabel}准备中`);
      runId = await service.startBatchRerun(outputPath, targets, modelConfig);
      beginBatchRerunSession({ runId, taskTicket, label: actionLabel, cancelRequested: false });
      const status = await waitForBatchRerunResult(runId, actionLabel);
      if (!status.result) {
        throw new Error(status.error || `${actionLabel}没有返回结果`);
      }
      await applyBatchRerunResult(actionLabel, status.result, targets, suffix);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep(`${actionLabel}失败`);
    } finally {
      clearBatchRerunSession(runId);
      finishTask(taskTicket);
    }
  }

  async function handleRerunRiskyChunks() {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    const riskyChunkIds = activeCompareData?.chunks.filter((chunk) => chunk.quality?.needsReview && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId])).map((chunk) => chunk.chunkId) ?? [];
    if (!outputPath || riskyChunkIds.length === 0) {
      setNotice("当前没有需要批量重跑的风险块。");
      return;
    }
    await runBatchRerunTask("重跑需处理块", outputPath, riskyChunkIds.map((chunkId) => ({ chunkId })));
  }

  async function handleRerunDetectionMatchedChunks() {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    const riskyMatchGroups = groupRiskyDetectionMatches(detectionMatches);
    const riskyMatchTargets = riskyMatchGroups
      .map((matchGroup) => ({
        matchGroup,
        chunkId: matchGroup[0]?.chunkId ?? "",
        maxRisk: Math.max(...matchGroup.map((match) => match.segment.probability)),
      }))
      .filter((target) => target.chunkId);
    if (!outputPath || riskyMatchTargets.length === 0) {
      setNotice("外部报告还没有强命中可自动重跑的 Diff 块；疑似命中和仅参考只用于定位，避免误改。");
      return;
    }
    await runBatchRerunTask(
      "按外部报告反馈重跑",
      outputPath,
      riskyMatchTargets.map(({ matchGroup, chunkId }) => ({
        chunkId,
        userFeedback: buildDetectionRerunFeedback(chunkId, matchGroup, detectionReport),
      })),
      "建议重新导出 Word 后再上传新报告复查。",
    );
  }

  async function handleExportFromHistory(item: { round: number; outputPath: string }, format: "txt" | "docx") {
    if (!item.outputPath) {
      setNotice("当前历史记录没有可导出的输出路径。");
      return;
    }
    const taskTicket = beginTask("exporting");
    try {
      setRuntimeStep(`正在导出第 ${item.round} 轮 ${format.toUpperCase()}。`);
      const result = await service.exportRound(item.outputPath, format);
      setLastExportResult(result);
      setNotice(formatExportNotice(result, `第 ${item.round} 轮`));
      setRuntimeStep(`第 ${item.round} 轮导出完成`);
    } catch (appError) {
      setError(formatExportError(appError));
      setRuntimeStep(`第 ${item.round} 轮导出失败`);
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleExportCurrent(format: "txt" | "docx") {
    if (!roundResult) {
      setNotice("请先执行至少一轮处理，再导出结果。");
      return;
    }
    if (format === "docx") {
      const confirmOptions = buildExportRiskConfirmOptions("导出 Word", activeCompareData, lastExportResult);
      if (confirmOptions && !(await requestConfirm(confirmOptions))) {
        setNotice("已取消 Word 导出。");
        return;
      }
    }
    const taskTicket = beginTask("exporting");
    try {
      setRuntimeStep(`正在导出 ${format.toUpperCase()}。`);
      const result = await service.exportRound(roundResult.outputPath, format);
      setLastExportResult(result);
      setNotice(formatExportNotice(result));
      setRuntimeStep("导出完成");
    } catch (appError) {
      setError(formatExportError(appError));
      setRuntimeStep("导出失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  const runtimeLabel = formatRuntimeStep(progress, runtimeStep);
  const progressPercent = getProgressPercent(progress, documentStatus?.completedRounds.length ?? 0, documentStatus?.maxRounds ?? 0);
  const runtimeTaskItems = useMemo<RuntimeTaskCenterItem[]>(() => {
    const items: RuntimeTaskCenterItem[] = [];
    const activeRunStatus = roundProgressStatus?.activeRun && !roundProgressStatus.activeRun.completed
      ? roundProgressStatus.activeRun
      : null;
    const activeProgress = progress ?? activeRunStatus?.lastEvent ?? null;

    if (pendingAutoAction) {
      items.push({
        id: `auto:${pendingAutoAction.id}`,
        title: getPendingAutoActionTitle(pendingAutoAction),
        status: pendingAutoAction.kind === "manual-intervention" ? "等待人工" : "倒计时",
        detail: formatPendingAutoActionStatus(pendingAutoAction),
        recoveryHint: formatPendingAutoActionDetail(pendingAutoAction),
        tone: pendingAutoAction.kind === "manual-intervention" ? "red" : pendingAutoAction.kind === "retry" ? "amber" : "blue",
        running: false,
        percent: getPendingAutoActionPercent(pendingAutoAction),
        meta: formatFileScopeLabel(pendingAutoAction.sourcePath),
        actionLabel: "查看主页",
        onAction: () => openTaskTargetView("home"),
        cancelLabel: pendingAutoAction.kind === "manual-intervention" ? "我来处理" : "拒绝自动执行",
        onCancel: () => rejectPendingAutoAction(pendingAutoAction.id),
      });
    }

    if (currentRunToken) {
      const session = runSessionRef.current;
      const cancelRequested = Boolean(session?.cancelRequested || activeProgress?.phase === "cancel-requested" || activeRunStatus?.cancelRequested);
      items.push({
        id: `run:${currentRunToken}`,
        title: session?.round ? `第 ${session.round} 轮改写` : "轮次改写",
        status: cancelRequested ? "中断中" : "运行中",
        detail: formatRuntimeStep(activeProgress, runtimeLabel || "轮次运行中"),
        recoveryHint: getTaskPhaseRecoveryHint(cancelRequested ? "canceling-run" : "running-round"),
        tone: cancelRequested ? "red" : "blue",
        running: true,
        percent: getRoundTaskPercent(activeProgress, progressPercent),
        meta: formatShortTaskId(currentRunToken),
        actionLabel: "查看主页",
        onAction: () => openTaskTargetView("home"),
        cancelLabel: cancelRequested ? undefined : "中断当前轮",
        onCancel: cancelRequested ? undefined : () => void handleCancelRunRound(),
      });
    }

    const activeBatchStatus = (diagnostics?.activeBatchReruns ?? []).find((item) => item.runId === currentBatchRerunToken);
    if (currentBatchRerunToken) {
      const session = batchRerunSessionRef.current;
      const cancelRequested = Boolean(session?.cancelRequested || activeBatchStatus?.cancelRequested);
      const batchDetail = activeBatchStatus
        ? `${activeBatchStatus.completedCount}/${activeBatchStatus.totalCount} 块 · 成功 ${activeBatchStatus.successCount} · 失败 ${activeBatchStatus.failureCount}${activeBatchStatus.currentChunkId ? ` · 当前 ${activeBatchStatus.currentChunkId}` : ""}`
        : runtimeLabel || "批量重跑运行中";
      items.push({
        id: `batch:${currentBatchRerunToken}`,
        title: session?.label || "批量重跑",
        status: cancelRequested ? "停止中" : "运行中",
        detail: batchDetail,
        recoveryHint: getTaskPhaseRecoveryHint(cancelRequested ? "canceling-batch-rerun" : "batch-rerunning"),
        tone: cancelRequested ? "red" : "amber",
        running: true,
        percent: getBatchTaskPercent(activeBatchStatus),
        meta: formatShortTaskId(currentBatchRerunToken),
        actionLabel: "查看主页",
        onAction: () => openTaskTargetView("home"),
        cancelLabel: cancelRequested ? undefined : "停止重跑",
        onCancel: cancelRequested ? undefined : () => void handleCancelBatchRerun(),
      });
    }

    const phaseCoveredByRun = Boolean(currentRunToken && (taskPhase === "running-round" || taskPhase === "canceling-run"));
    const phaseCoveredByBatch = Boolean(currentBatchRerunToken && (taskPhase === "batch-rerunning" || taskPhase === "canceling-batch-rerun"));
    if (taskPhase !== "idle" && !phaseCoveredByRun && !phaseCoveredByBatch) {
      const canStopFormatParse = taskPhase === "parsing-format" && Boolean(formatParseAbortRef.current);
      const canStopModelCatalog = taskPhase === "loading-models" && Boolean(modelCatalogAbortRef.current);
      const isBlockingPhase = isTaskBlocking(taskPhase);
      const actionTarget: WorkbenchView | null = taskPhase.includes("format")
        ? "format"
        : taskPhase.includes("model") || taskPhase.includes("config") || taskPhase === "loading-models"
          ? "model"
          : taskPhase.includes("history")
            ? "history"
            : taskPhase.includes("diagnosing")
              ? "diagnostics"
              : null;
      items.push({
        id: `phase:${taskPhase}`,
        title: getTaskPhaseLabel(taskPhase),
        status: canStopFormatParse || canStopModelCatalog ? "可停止" : isBlockingPhase ? "处理中" : "等待操作",
        detail: runtimeLabel || getTaskPhaseLabel(taskPhase),
        recoveryHint: getTaskPhaseRecoveryHint(taskPhase),
        tone: getPhaseTaskTone(taskPhase),
        running: isBlockingPhase || busy,
        percent: progressPercent > 0 ? progressPercent : undefined,
        actionLabel: actionTarget ? "查看位置" : undefined,
        onAction: actionTarget ? () => openTaskTargetView(actionTarget) : undefined,
        cancelLabel: canStopFormatParse ? "停止解析" : canStopModelCatalog ? "停止读取模型" : undefined,
        onCancel: canStopFormatParse ? () => handleCancelFormatRulesParse() : canStopModelCatalog ? () => handleCancelModelCatalogRequest() : undefined,
      });
    }

    if (activeCompareData?.chunks.length) {
      const failureByChunk = new Map(activeRerunFailures.map((failure) => [failure.chunkId, failure]));
      const allCandidateChunkIds = activeCompareData.chunks
        .filter((chunk) => (chunk.rejectedCandidates?.length ?? 0) > 0 || ((failureByChunk.get(chunk.chunkId)?.rejectedCandidates?.length ?? 0) > 0))
        .map((chunk) => chunk.chunkId);
      const allCandidateChunkIdSet = new Set(allCandidateChunkIds);
      const candidateChunkIds = activeCompareData.chunks
        .filter((chunk) => allCandidateChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]))
        .map((chunk) => chunk.chunkId);
      const reviewChunkIds = activeCompareData.chunks
        .filter((chunk) => {
          const flags = chunk.quality?.flags ?? [];
          const reportMatches = detectionMatchesByChunk[chunk.chunkId] ?? [];
          return !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
            || chunk.fallbackMode === "source"
            || flags.includes("source_fallback")
            || failureByChunk.has(chunk.chunkId)
            || allCandidateChunkIdSet.has(chunk.chunkId)
            || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review"));
        })
        .map((chunk) => chunk.chunkId);
      const failedChunkIds = activeRerunFailures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId);
      const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : candidateChunkIds.length ? "candidate" : "review";
      const preferredChunkId = failedChunkIds[0] ?? candidateChunkIds[0] ?? reviewChunkIds[0];
      if (reviewChunkIds.length || failedChunkIds.length || candidateChunkIds.length) {
        items.push({
          id: `diff-action:${activeCompareData.outputPath || activeCompareData.docId}:${reviewChunkIds.length}:${failedChunkIds.length}:${candidateChunkIds.length}`,
          title: failedChunkIds.length ? "Diff 有重跑失败" : candidateChunkIds.length ? "Diff 有高风险候选" : "Diff 有块需处理",
          status: failedChunkIds.length ? "需处理" : "待审阅",
          detail: `需处理 ${reviewChunkIds.length} 块 · 失败 ${failedChunkIds.length} · 高风险 ${candidateChunkIds.length}`,
          recoveryHint: failedChunkIds.length
            ? "先查看失败块和模型候选，确认可用再采用；否则补充反馈后单块重跑。"
            : candidateChunkIds.length
              ? "候选输出不会自动导出；可查看模型原始候选，自行判断采用或重跑。"
              : "可直接跳到需处理筛选，不必在整篇 Diff 里手动翻找。",
          tone: failedChunkIds.length ? "red" : "amber",
          running: false,
          actionLabel: preferredFilter === "failed" ? "查看失败块" : preferredFilter === "candidate" ? "查看高风险候选" : "只看需处理",
          onAction: () => openDiffTaskTarget(preferredFilter, preferredChunkId),
        });
      }
    }

    if (error.trim()) {
      const recoveryPlan = getErrorRecoveryPlan(error);
      items.push({
        id: `error:${error.slice(0, 80)}`,
        title: "最近失败",
        status: "需要处理",
        detail: error,
        recoveryHint: recoveryPlan.hint,
        tone: recoveryPlan.tone,
        running: false,
        actionLabel: recoveryPlan.actionLabel,
        onAction: () => openTaskTargetView(recoveryPlan.target),
      });
    }

    const visibleRunIds = new Set([currentRunToken].filter((item): item is string => Boolean(item)));
    for (const item of diagnostics?.activeRuns ?? []) {
      if (visibleRunIds.has(item.runId)) {
        continue;
      }
      const itemProgress = item.lastEvent ?? null;
      items.push({
        id: `diagnostics-run:${item.runId}`,
        title: "后台轮次任务",
        status: item.cancelRequested ? "中断中" : item.status || "运行中",
        detail: `${formatFileScopeLabel(item.sourcePath)} · ${formatRuntimeStep(itemProgress, item.status || "运行中")}`,
        recoveryHint: getTaskPhaseRecoveryHint(item.cancelRequested ? "canceling-run" : "running-round"),
        tone: item.cancelRequested ? "red" : "blue",
        running: true,
        percent: getRoundTaskPercent(itemProgress),
        meta: formatShortTaskId(item.runId),
        actionLabel: "查看诊断",
        onAction: () => openTaskTargetView("diagnostics"),
      });
    }

    const visibleBatchIds = new Set([currentBatchRerunToken].filter((item): item is string => Boolean(item)));
    for (const item of diagnostics?.activeBatchReruns ?? []) {
      if (visibleBatchIds.has(item.runId)) {
        continue;
      }
      items.push({
        id: `diagnostics-batch:${item.runId}`,
        title: "后台批量重跑",
        status: item.cancelRequested ? "停止中" : item.status || "运行中",
        detail: `${item.completedCount}/${item.totalCount} 块 · 成功 ${item.successCount} · 失败 ${item.failureCount}${item.currentChunkId ? ` · 当前 ${item.currentChunkId}` : ""}`,
        recoveryHint: getTaskPhaseRecoveryHint(item.cancelRequested ? "canceling-batch-rerun" : "batch-rerunning"),
        tone: item.cancelRequested ? "red" : "amber",
        running: true,
        percent: getBatchTaskPercent(item),
        meta: formatShortTaskId(item.runId),
        actionLabel: "查看诊断",
        onAction: () => openTaskTargetView("diagnostics"),
      });
    }

    const checkpointMatchesCurrentDocument = Boolean(
      roundProgressStatus?.canResume
      && (!documentStatus?.sourcePath || sameWorkspacePath(roundProgressStatus.sourcePath, documentStatus.sourcePath)),
    );
    if (!currentRunToken && checkpointMatchesCurrentDocument && roundProgressStatus) {
      const allChunksDone = roundProgressStatus.resumeStage === "finalize_output";
      items.push({
        id: `checkpoint:${roundProgressStatus.sourcePath}:${roundProgressStatus.round ?? "unknown"}`,
        title: allChunksDone ? `第 ${roundProgressStatus.round ?? ""} 轮等待收尾` : `第 ${roundProgressStatus.round ?? ""} 轮可续跑`,
        status: "可继续",
        detail: roundProgressStatus.resumeExplanation || "断点内已完成分块会复用，继续执行不会从头覆盖。",
        recoveryHint: allChunksDone ? "继续只补做合并、Diff 和记录写入，不会重跑已完成分块。" : "回主页继续当前轮；只有放弃本轮进度才会清空断点。",
        tone: roundProgressStatus.lastError ? "amber" : "blue",
        running: false,
        percent: roundProgressStatus.progressPercent,
        meta: roundProgressStatus.remainingChunks !== undefined ? `剩余 ${roundProgressStatus.remainingChunks} 块` : undefined,
        actionLabel: "回主页继续",
        onAction: () => openTaskTargetView("home"),
      });
    }

    return items;
  }, [activeCompareData, activeRerunFailures, busy, currentBatchRerunToken, currentRunToken, detectionMatchesByChunk, diagnostics, documentStatus?.sourcePath, error, pendingAutoAction, progress, progressPercent, reviewDecisions, roundProgressStatus, runtimeLabel, taskPhase]);
  const activeRuntimeTaskCount = runtimeTaskItems.filter((item) => item.running).length;
  const statusAutoAction = !error && pendingAutoAction ? pendingAutoAction : null;

  const modelPanel = (
    <ModelConfigCard
      value={modelConfig}
      busy={uiBusy}
      modelCatalog={modelCatalog}
      modelCatalogBusy={modelCatalogBusy}
      modelCatalogError={modelCatalogError}
      onChange={setModelConfig}
      onSave={handleSaveModelConfig}
      onTestConnection={handleTestConnection}
      onRefreshModels={() => void refreshModelCatalog()}
      onListModelsForConfig={listModelsForConfig}
    />
  );

  const formatPanel = (
    <SchoolFormatCard
      busy={uiBusy}
      formatRuleText={formatRuleText}
      activeFormatRules={activeFormatRules}
      modelConfig={modelConfig}
      modelCatalog={modelCatalog}
      parserProviderId={formatParserRoute.providerId}
      parserModel={formatParserRoute.model || ""}
      onFormatRuleTextChange={setFormatRuleText}
      onParseFormatRules={(text) => void handleParseFormatRules(text)}
      formatParsing={taskPhase === "parsing-format"}
      onCancelParseFormatRules={handleCancelFormatRulesParse}
      onParserProviderChange={handleFormatParserProviderChange}
      onParserModelChange={(model) => setFormatParserModelRoute({ ...formatParserRoute, model })}
      onRefreshParserProviderModels={(providerId) => void handleRefreshProviderModels(providerId)}
      pendingFormatRules={pendingFormatRules}
      onConfirmFormatRules={() => void handleConfirmFormatRules()}
      onDiscardFormatRules={() => {
        setPendingFormatRules(null);
        saveStoredFormatRules(FORMAT_RULE_PENDING_KEY, null);
      }}
      onResetFormatRules={() => void handleResetFormatRules()}
    />
  );
  const activeViewMeta = WORKBENCH_NAV_ITEMS.find((item) => item.view === activeView) ?? WORKBENCH_NAV_ITEMS[0];
  const notificationStatusText = error
    ? error
    : statusAutoAction
      ? formatPendingAutoActionStatus(statusAutoAction)
      : notice
        ? notice
        : unreadNotificationCount
          ? `${unreadNotificationCount} 未读`
          : activeRuntimeTaskCount
            ? `${activeRuntimeTaskCount} 个运行中`
            : "无未读";
  const NotificationStatusIcon = error ? AlertCircle : statusAutoAction ? Signal : notice ? CheckCircle2 : Bell;
  const hasStatusFeedback = Boolean(error || notice || statusAutoAction);
  const notificationStatusLabel = error
    ? "错误反馈"
    : statusAutoAction
      ? statusAutoAction.kind === "manual-intervention"
        ? "等待人工"
        : "自动执行"
      : notice
        ? "操作反馈"
        : unreadNotificationCount
          ? "未读通知"
          : activeRuntimeTaskCount
            ? "运行通知"
            : "通知";
  const notificationStatusKind: NotificationKind | null = error ? "error" : notice ? "success" : null;

  return (
    <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden">
      <AppSidebar
        activeView={activeView}
        onViewChange={setActiveView}
        runtimeStatus={runtimeStatus}
        progressPercent={progressPercent}
      />
      <SidebarInset className="h-svh overflow-hidden md:h-[calc(100svh-1rem)]">
          <NotificationCenter
            open={notificationCenterOpen}
            items={notifications}
            taskItems={runtimeTaskItems}
            onClose={() => setNotificationCenterOpen(false)}
            onClear={clearNotificationHistory}
          />

          <UnifiedConfirmDialog
            value={confirmDialog}
            onCancel={() => settleConfirmDialog(false)}
            onConfirm={() => settleConfirmDialog(true)}
          />

          <header className="shrink-0 border-b bg-background/95">
            <div className="flex h-12 items-center gap-3 px-4">
              <SidebarTrigger className="border bg-card" />
              <div className="min-w-0 flex flex-1 items-center gap-3">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">FYADR</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeViewMeta.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <Badge variant="outline" className="hidden max-w-[240px] truncate md:inline-flex">
                  {activeViewMeta.description}
                </Badge>
              </div>
            </div>
            <div className="flex h-10 items-center gap-2 overflow-x-auto border-t bg-muted/35 px-4 text-xs">
              <Button type="button" variant="ghost" size="sm" className="h-7 min-w-0 shrink-0 px-2 text-xs" onClick={() => setActiveView("home")}>
                <FileText data-icon="inline-start" />
                <span className="text-muted-foreground">当前文件</span>
                <span className="max-w-[240px] truncate text-foreground">{documentStatus ? formatFileScopeLabel(documentStatus.sourcePath) : "未选择"}</span>
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button type="button" variant="ghost" size="sm" className="h-7 min-w-0 shrink-0 px-2 text-xs" onClick={() => setActiveView("model")}>
                <Route data-icon="inline-start" />
                <span className="text-muted-foreground">路线</span>
                <span className="max-w-[260px] truncate text-foreground">{describePromptProfile(modelConfig.promptProfile)} · {formatPromptSequence(modelConfig.promptSequence)}</span>
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button type="button" variant="ghost" size="sm" className="h-7 min-w-0 shrink-0 px-2 text-xs" onClick={() => openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)}>
                <Wand2 data-icon="inline-start" />
                <span className="text-muted-foreground">Diff</span>
                <span className="text-foreground">{diffDashboardStats.chunkCount ? `${diffDashboardStats.chunkCount} 块 · ${diffDashboardStats.reviewCount} 待处理` : "未生成"}</span>
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button
                type="button"
                variant={notificationStatusKind === "error" ? "outlineDanger" : hasStatusFeedback ? "outlineSuccess" : unreadNotificationCount || activeRuntimeTaskCount ? "outline" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 min-w-[220px] max-w-[min(48vw,560px)] shrink-0 justify-start px-3 text-xs",
                  hasStatusFeedback && "border-primary/35 bg-primary/10 shadow-sm",
                  notificationStatusKind === "error" && "border-destructive/40 bg-destructive/10",
                )}
                aria-label="打开通知与任务中心"
                aria-live="polite"
                onClick={openNotificationCenter}
              >
                <NotificationStatusIcon data-icon="inline-start" />
                <Badge variant={notificationStatusKind === "error" ? "danger" : hasStatusFeedback ? "secondary" : "outline"} className="shrink-0">
                  {notificationStatusLabel}
                </Badge>
                <span className={cn("min-w-0 flex-1 truncate text-left text-foreground", hasStatusFeedback && "font-semibold")}>{notificationStatusText}</span>
              </Button>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-hidden bg-muted/30 p-4">
            {activeView === "home" ? (
              <div className="h-full min-h-0 overflow-hidden">
                <div className="grid h-full min-h-0 min-w-0 max-w-full gap-4 overflow-hidden min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
                  <div className="flex min-h-0 min-w-0 flex-col gap-4 overflow-hidden">
                    <ResultCard
                      result={roundResult}
                      preview={preview}
                      compareData={activeCompareData}
                      exportResult={lastExportResult}
                      busy={uiBusy}
                      rerunFailures={activeRerunFailures}
                      detectionMatchesByChunk={detectionMatchesByChunk}
                      diffFocusRequest={diffFocusRequest}
                      reviewDecisions={reviewDecisions}
                      onReviewDecisionChange={updateReviewDecision}
                      onRerunChunk={(chunkId, userFeedback) => void handleRerunChunk(chunkId, userFeedback)}
                      onRerunRiskyChunks={() => void handleRerunRiskyChunks()}
                      batchRerunRunning={Boolean(currentBatchRerunToken)}
                      batchRerunStatusText={runtimeLabel}
                      onCancelBatchRerun={() => void handleCancelBatchRerun()}
                      candidateAdoptableCount={adoptableRejectedCandidates.length}
                      onAdoptAllCandidates={handleAdoptAllRejectedCandidates}
                      onExportTxt={() => void handleExportCurrent("txt")}
                      onExportDocx={() => void handleExportCurrent("docx")}
                    />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <DiffReviewCard
                        result={roundResult}
                        compareData={activeCompareData}
                        busy={uiBusy}
                        rerunFailures={activeRerunFailures}
                        detectionMatchesByChunk={detectionMatchesByChunk}
                        diffFocusRequest={diffFocusRequest}
                        reviewDecisions={reviewDecisions}
                        onReviewDecisionChange={updateReviewDecision}
                        onRerunChunk={(chunkId, userFeedback) => void handleRerunChunk(chunkId, userFeedback)}
                        onRerunRiskyChunks={() => void handleRerunRiskyChunks()}
                        batchRerunRunning={Boolean(currentBatchRerunToken)}
                        batchRerunStatusText={runtimeLabel}
                        onCancelBatchRerun={() => void handleCancelBatchRerun()}
                      />
                    </div>
                  </div>
                  <ScrollArea
                    className="shadcn-scroll-bound h-full min-h-0 min-w-0 max-w-full overflow-x-hidden pr-1"
                    data-ui-section="home-operation-scroll"
                  >
                    <div className="flex min-h-0 w-full min-w-0 max-w-full flex-col gap-4 overflow-x-hidden pb-2">
                      <HomeRunPanel
                        value={documentStatus}
                        busy={uiBusy}
                        pickerLabel={pickerLabel}
                        modelConfig={modelConfig}
                        progress={progress}
                        roundProgressStatus={roundProgressStatus}
                        pendingAutoAction={pendingAutoAction}
                        promptProfile={modelConfig.promptProfile}
                        promptSequence={modelConfig.promptSequence}
                        onPromptProfileChange={(promptProfile) => void handlePromptProfileChange(promptProfile)}
                        onPromptSequenceChange={(promptSequence) => void handlePromptSequenceChange(promptSequence)}
                        onModelConfigChange={setModelConfig}
                        onSaveModelConfig={(nextConfig) => void handleSaveModelConfig(nextConfig)}
                        onRefreshAllProviderModels={() => void handleRefreshAllProviderModels()}
                        onRefreshProviderModels={(providerId) => void handleRefreshProviderModels(providerId)}
                        onPickFile={handlePickFile}
                        onRunRound={handleRunRound}
                        onCancelRun={handleCancelRunRound}
                        onRejectAutoAction={() => rejectPendingAutoAction()}
                        onResetRound={handleResetCurrentRound}
                        running={running}
                      />
                      <DetectionReportPanel
                        report={detectionReport}
                        matches={detectionMatches}
                        documentLabel={documentStatus ? formatFileScopeLabel(documentStatus.sourcePath) : ""}
                        busy={uiBusy}
                        onPickReport={handlePickDetectionReport}
                        onClearReport={handleClearDetectionReport}
                        onRerunMatchedChunks={() => void handleRerunDetectionMatchedChunks()}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : activeView === "quality" ? (
              <div className="h-full min-h-0 overflow-auto"><QualityReportPage compareData={activeCompareData} exportResult={lastExportResult} /></div>
            ) : activeView === "model" ? (
              <div className="h-full min-h-0 overflow-hidden">{modelPanel}</div>
            ) : activeView === "prompts" ? (
              <div className="h-full min-h-0 overflow-hidden">
                <PromptPreviewPage
                  value={promptPreviews}
                  busy={promptPreviewBusy}
                  error={promptPreviewError}
                  activePromptId={activePromptPreviewId}
                  onActivePromptIdChange={setActivePromptPreviewId}
                  onRefresh={() => void refreshPromptPreviews()}
                />
              </div>
            ) : activeView === "format" ? (
              <div className="h-full min-h-0 overflow-auto">{formatPanel}</div>
            ) : activeView === "protection" ? (
              <div className="h-full min-h-0 overflow-auto"><ProtectionMapCard value={protectionMap} /></div>
            ) : activeView === "diagnostics" ? (
              <div className="h-full min-h-0 overflow-auto">
                <DiagnosticsPage
                  value={diagnostics}
                  busy={uiBusy}
                  onRefresh={() => void refreshDiagnostics()}
                  onCleanupTaskSnapshots={() => void handleCleanupTaskStateSnapshots()}
                />
              </div>
            ) : (
              <div className="h-full min-h-0 overflow-auto"><HistoryCard
                currentDocId={documentStatus?.docId ?? null}
                currentHistory={history}
                items={historyItems}
                promptProfile={modelConfig.promptProfile}
                promptSequence={modelConfig.promptSequence}
                orphanScan={historyOrphanScan}
                open={historyPanelOpen}
                busy={uiBusy}
                onToggle={() => setHistoryPanelOpen(!historyPanelOpen)}
                onSelect={(item) => void handleSelectHistory(item)}
                onPreviewDelete={(docId, options) => handlePreviewHistoryDelete(docId, options)}
                onDelete={(docId, options) => void handleDeleteHistory(docId, options)}
                onScanOrphans={() => void handleScanHistoryOrphans()}
                onDeleteOrphans={() => void handleDeleteHistoryOrphans()}
                onDownload={(item, format) => void handleExportFromHistory(item, format)}
              /></div>
            )}
          </section>
        </SidebarInset>
      <SidebarRail />
    </SidebarProvider>
  );

}

function AppSidebar({
  activeView,
  onViewChange,
  runtimeStatus,
  progressPercent,
}: {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  runtimeStatus: string;
  progressPercent: number;
}) {
  const primaryItems = WORKBENCH_NAV_ITEMS.filter((item) => ["home", "quality", "model"].includes(item.view));
  const documentItems = WORKBENCH_NAV_ITEMS.filter((item) => ["prompts", "format", "protection", "history"].includes(item.view));
  const systemItems = WORKBENCH_NAV_ITEMS.filter((item) => ["diagnostics"].includes(item.view));
  const renderNavItems = (items: typeof WORKBENCH_NAV_ITEMS) => items.map((item) => {
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.view}>
        <SidebarMenuButton
          isActive={activeView === item.view}
          tooltip={item.label}
          className="h-9 px-2 data-[active=true]:shadow-sm"
          onClick={() => onViewChange(item.view)}
        >
          <Icon />
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
          </span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  });

  return (
    <Sidebar variant="inset" collapsible="icon">
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              tooltip="FYADR"
              className="h-14 items-center gap-2.5 px-1.5"
              onClick={() => onViewChange("home")}
            >
              <img src="/brand-logo.png" alt="FYADR" className="size-11 shrink-0 object-contain" />
              <span className="flex min-w-0 flex-col justify-center">
                <span className="block truncate text-sm font-semibold">FYADR</span>
                <span className="block truncate text-xs text-muted-foreground">本地改写工作台</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel className="px-1">主工作流</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(primaryItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel className="px-1">文档资产</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(documentItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel className="px-1">运行状态</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(systemItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRuntimeProgress status={runtimeStatus} percent={progressPercent} />
    </Sidebar>
  );
}

function SidebarRuntimeProgress({ status, percent }: { status: string; percent: number }) {
  const { state } = useSidebar();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  if (state === "collapsed") {
    return (
      <SidebarFooter className="items-center px-2 pb-3 pt-2">
        <div
          data-runtime-progress-ring
          className="relative flex size-8 items-center justify-center rounded-md border bg-card text-foreground shadow-sm"
          title={`${status} ${value}%`}
          aria-label={`${status} ${value}%`}
        >
          <svg viewBox="0 0 32 32" className="size-7 -rotate-90" aria-hidden="true">
            <circle cx="16" cy="16" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
              className="text-primary"
              style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
            />
          </svg>
          <span className="absolute text-[10px] font-semibold">{value}</span>
        </div>
      </SidebarFooter>
    );
  }

  return (
    <SidebarFooter className="px-3 pb-3 pt-2">
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="truncate text-muted-foreground">{status}</span>
          <span className="font-medium text-foreground">{value}%</span>
        </div>
        <Progress value={value} className="mt-2 h-1.5" />
      </div>
    </SidebarFooter>
  );
}

function UnifiedConfirmDialog({
  value,
  onCancel,
  onConfirm,
}: {
  value: ConfirmDialogState | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!value) {
    return null;
  }

  const tone = value.tone ?? "neutral";
  const confirmVariant: Record<ConfirmDialogTone, "neutral" | "brand" | "warning" | "destructive"> = {
    neutral: "neutral",
    info: "brand",
    warning: "warning",
    danger: "destructive",
  };

  return (
    <AlertDialog open onOpenChange={(open) => {
      if (!open) onCancel();
    }}>
      <AlertDialogContent className={cn(tone === "danger" && "border-destructive/40")}>
        <AlertDialogHeader>
          <div className="flex items-start gap-3">
            <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground", tone === "danger" && "border-destructive/30 bg-destructive/10 text-destructive")}>
              <AlertCircle />
            </span>
            <div className="min-w-0 flex-1">
              <AlertDialogTitle>{value.title}</AlertDialogTitle>
              {value.description ? <AlertDialogDescription>{value.description}</AlertDialogDescription> : null}
            </div>
          </div>
        </AlertDialogHeader>
        {value.details?.length ? (
          <div className="flex flex-col gap-2">
              {value.details.map((detail, index) => (
                <div key={`${value.id}-${index}-${detail}`} className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium leading-6 text-muted-foreground">
                  {detail}
                </div>
              ))}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>{value.cancelLabel ?? "取消"}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              type="button"
              variant={confirmVariant[tone]}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {value.confirmLabel ?? "确定"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function PromptPreviewPage({
  value,
  busy,
  error,
  activePromptId,
  onActivePromptIdChange,
  onRefresh,
}: {
  value: PromptPreviewResponse | null;
  busy: boolean;
  error: string;
  activePromptId: PromptId;
  onActivePromptIdChange: (promptId: PromptId) => void;
  onRefresh: () => void;
}) {
  const items = value?.items ?? [];
  const activeItem = items.find((item) => item.id === activePromptId) ?? items[0] ?? null;
  const contentLineCount = activeItem ? activeItem.content.split(/\r?\n/).length : 0;

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="h-full min-h-0 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">只读</Badge>
                <Badge variant="outline">Prompt</Badge>
              </div>
              <CardTitle className="text-lg">提示词预览</CardTitle>
              <CardDescription className="mt-1">查看内置提示词和仓库路径。</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
              刷新
            </Button>
          </div>
        </CardHeader>

        <CardContent className="flex h-[calc(100%-6.5rem)] min-h-0 flex-col gap-4 px-5 pb-5">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>读取失败</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
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
                      className={cn("h-auto w-full justify-start px-3 py-3 text-left", active && "border-primary bg-muted")}
                      onClick={() => onActivePromptIdChange(item.id)}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold">{item.label}</span>
                          <Badge variant={active ? "brand" : "outline"}>{item.id}</Badge>
                        </span>
                        <span className="line-clamp-2 text-xs font-normal leading-5 text-muted-foreground">{item.description}</span>
                        <span className="truncate text-[11px] font-medium text-muted-foreground">{item.relativePath}</span>
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
                  {busy ? <Loader2 className="animate-spin" /> : <FileText />}
                </EmptyMedia>
                <EmptyTitle>{busy ? "正在读取提示词文件" : "暂无可预览的提示词"}</EmptyTitle>
                <EmptyDescription>提示词文件来自 prompts 目录，页面只读展示。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card className="h-full min-h-0 overflow-hidden">
        {activeItem ? (
          <>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{activeItem.fileName}</Badge>
                    <Badge variant="outline">{formatBytes(activeItem.sizeBytes)}</Badge>
                    <Badge variant="outline">{contentLineCount} 行</Badge>
                  </div>
                  <CardTitle className="mt-2 text-xl">{activeItem.label}</CardTitle>
                  <CardDescription className="mt-1 break-all">文件位置：{activeItem.relativePath}</CardDescription>
                </div>
                <Badge variant="secondary">{formatDateTime(activeItem.updatedAt)}</Badge>
              </div>
            </CardHeader>
            <CardContent className="flex h-[calc(100%-7rem)] min-h-0 flex-col px-5 pb-5">
              <ScrollArea className="min-h-0 flex-1 rounded-md border bg-muted">
                <pre className="p-4 text-[12px] leading-6 text-foreground">
                  <code>{activeItem.content}</code>
                </pre>
              </ScrollArea>
            </CardContent>
          </>
        ) : (
          <CardContent className="flex h-full min-h-0 p-5">
            <Empty className="min-h-[24rem] flex-1 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {busy ? <Loader2 className="animate-spin" /> : <FileText />}
                </EmptyMedia>
                <EmptyTitle>{busy ? "正在读取提示词内容" : error ? "提示词读取失败" : "选择左侧提示词后查看内容"}</EmptyTitle>
                <EmptyDescription>
                  {busy ? "如果长时间停留在这里，请确认后端已经重启到最新版本。" : error || "提示词文件来自 prompts 目录，页面只读展示。"}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function HomeRunPanel({
  value,
  busy,
  pickerLabel,
  modelConfig,
  progress,
  roundProgressStatus,
  pendingAutoAction,
  promptProfile,
  promptSequence,
  onPromptProfileChange,
  onPromptSequenceChange,
  onModelConfigChange,
  onSaveModelConfig,
  onRefreshAllProviderModels,
  onRefreshProviderModels,
  onPickFile,
  onRunRound,
  onCancelRun,
  onRejectAutoAction,
  onResetRound,
  running,
}: {
  value: DocumentStatus | null;
  busy: boolean;
  pickerLabel: string;
  modelConfig: ModelConfig;
  progress: RoundProgress | null;
  roundProgressStatus: RoundProgressStatus | null;
  pendingAutoAction: PendingAutoAction | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  onPromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => void;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
  onSaveModelConfig: (modelConfig: ModelConfig) => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  onPickFile: () => void;
  onRunRound: () => void;
  onCancelRun: () => void;
  onRejectAutoAction: () => void;
  onResetRound: () => void;
  running: boolean;
}) {
  const [setupEditor, setSetupEditor] = useState<null | "prompt" | "model">(null);
  const modelConfigRef = useRef(modelConfig);
  useEffect(() => {
    modelConfigRef.current = modelConfig;
  }, [modelConfig]);
  useEffect(() => {
    if (!setupEditor) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSetupEditor(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setupEditor]);

  const hasDocument = Boolean(value);
  const hasPendingRound = Boolean(value?.hasNextRound);
  const uploadButtonText = hasDocument ? "更换文档" : pickerLabel;
  const activeSequence = normalizePromptSequence(promptSequence);
  const activeFlowSequence = getPromptFlowSequence(promptProfile, activeSequence);
  const providers = modelConfig.modelProviders ?? [];
  const enabledProviders = providers.filter((provider) => provider.enabled !== false);
  const providerOptions = enabledProviders;
  const promptSummary = promptProfile === "cn_custom" ? formatPromptSequence(activeSequence) : describePromptProfile(promptProfile);
  const modelRouteSummary = activeFlowSequence.map((promptId, index) => {
    const roundKey = getRoundModelKey(promptProfile, index + 1);
    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
    const provider = findProviderForRoundModel(modelConfig, roundModel);
    const customRoute = Boolean(roundModel?.enabled);
    const effectiveCustomModel = roundModel?.model || provider?.defaultModel || provider?.models?.[0] || "";
    const providerUnavailable = Boolean(
      !modelConfig.offlineMode
      && (
        customRoute
          ? (
            !provider
            || provider.enabled === false
            || !provider.baseUrl?.trim()
            || !provider.apiKey?.trim()
            || !effectiveCustomModel.trim()
          )
          : (
            !modelConfig.baseUrl?.trim()
            || !modelConfig.apiKey?.trim()
            || !modelConfig.model?.trim()
          )
      ),
    );
    return {
      index,
      promptId,
      providerLabel: roundModel?.enabled && provider ? provider.name : roundModel?.enabled ? "服务商不可用" : "默认连接",
      modelLabel: roundModel?.enabled && provider ? effectiveCustomModel || "未选模型" : modelConfig.model || "未选模型",
      customized: Boolean(roundModel?.enabled && provider && provider.enabled !== false),
      providerUnavailable,
    };
  });
  const customizedRouteCount = modelRouteSummary.filter((item) => item.customized).length;
  const unavailableRouteCount = modelRouteSummary.filter((item) => item.providerUnavailable).length;
  const modelRouteStatus = unavailableRouteCount
    ? `${unavailableRouteCount} 轮需处理`
    : customizedRouteCount
      ? `混用 ${customizedRouteCount}/${activeFlowSequence.length}`
      : "全部继承默认";
  const activeModelRouteReady = modelConfig.offlineMode || unavailableRouteCount === 0;
  const modelRouteHealthLabel = unavailableRouteCount
    ? "路线不可启动"
    : activeModelRouteReady
      ? "路线可启动"
      : "默认连接待补全";
  const modelRouteTitle = customizedRouteCount
    ? customizedRouteCount === activeFlowSequence.length
      ? `专属路线 ${customizedRouteCount}/${activeFlowSequence.length}`
      : `混用路线 ${customizedRouteCount}/${activeFlowSequence.length}`
    : `默认 ${modelConfig.model || "未选"} · ${activeFlowSequence.length} 轮`;
  const modelRouteLines = modelRouteSummary.map((item) => `${item.index + 1}. ${item.providerLabel} · ${item.modelLabel}`);
  const rewriteCandidateMode = modelConfig.rewriteCandidateMode === "quality" ? "quality" : "economy";
  const candidateMaxPerChunk = rewriteCandidateMode === "quality" ? 2 : 1;
  const activeRunStatus = roundProgressStatus?.activeRun && !roundProgressStatus.activeRun.completed ? roundProgressStatus.activeRun : null;
  const resumableCheckpoint = roundProgressStatus?.canResume && roundProgressStatus.round === value?.nextRound
    ? roundProgressStatus
    : null;
  const runRecoveryState = buildRunRecoveryPanelState({
    running,
    progress,
    activeRunStatus,
    resumableCheckpoint,
    nextRound: value?.nextRound,
  });
  const currentRunProgressPercent = progress?.totalChunks
    ? clampPercent(Math.round(((progress.completedChunks ?? 0) / progress.totalChunks) * 100))
    : null;
  const checkpointRunLabel = resumableCheckpoint
    ? resumableCheckpoint.resumeActionLabel?.includes("收尾")
      ? "继续收尾"
      : "继续本轮"
    : "";
  const setRewriteCandidateMode = (mode: "economy" | "quality") => {
    const currentConfig = modelConfigRef.current;
    const nextConfig = { ...currentConfig, rewriteCandidateMode: mode };
    modelConfigRef.current = nextConfig;
    onModelConfigChange(nextConfig);
  };
  const canRunNextRound = hasPendingRound && !busy && !running && !activeRunStatus && unavailableRouteCount === 0;
  const runButtonText = running
    ? `正在执行第 ${value?.nextRound ?? ""} 轮`
    : activeRunStatus
      ? "后台已有运行"
    : unavailableRouteCount
    ? "先修复模型路线"
    : value?.hasNextRound
      ? resumableCheckpoint
        ? checkpointRunLabel
        : `开始第 ${value.nextRound} 轮`
      : value
        ? "全部轮次已完成"
        : "上传后开始第 1 轮";
  const runHelperText = running
    ? "中断保留断点。"
    : activeRunStatus
      ? "后台运行中。"
    : hasDocument
      ? value?.hasNextRound
        ? resumableCheckpoint
          ? resumableCheckpoint.resumeExplanation || "从断点继续。"
          : "确认路线后执行。"
        : "已完成，可导出。"
      : "先导入论文。";
  const updateSequenceRound = (roundIndex: number, promptId: PromptId) => {
    const nextSequence = activeSequence.map((item, index) => (index === roundIndex ? promptId : item));
    onPromptSequenceChange(nextSequence);
  };
  const updateSequenceLength = (length: number) => {
    const nextSequence = Array.from({ length }, (_, index) => activeSequence[index] ?? DEFAULT_PROMPT_SEQUENCE[index] ?? "round2");
    onPromptSequenceChange(nextSequence);
  };
  const randomizeSequence = () => {
    const length = 1 + Math.floor(Math.random() * 3);
    const promptIds = PROMPT_OPTIONS.map((option) => option.id);
    const nextSequence = Array.from({ length }, (_, index) => promptIds[(Math.floor(Math.random() * promptIds.length) + index) % promptIds.length]);
    onPromptSequenceChange(nextSequence);
  };
  const updateRoundProvider = (roundIndex: number, providerId: string) => {
    const currentConfig = modelConfigRef.current;
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1);
    if (!roundKey) return;
    const currentProviders = currentConfig.modelProviders ?? [];
    const nextRoundModels = { ...(currentConfig.roundModels ?? {}) };
    if (providerId === "__default") {
      nextRoundModels[roundKey] = {
        ...(nextRoundModels[roundKey] ?? buildRoundModelFromProvider({
          id: "__default",
          name: "默认连接",
          enabled: true,
          baseUrl: currentConfig.baseUrl,
          apiKey: currentConfig.apiKey,
          apiType: currentConfig.apiType,
          defaultModel: currentConfig.model,
        }, currentConfig.model, currentConfig)),
        enabled: false,
      };
      const nextConfig = { ...currentConfig, roundModels: nextRoundModels };
      modelConfigRef.current = nextConfig;
      onModelConfigChange(nextConfig);
      return;
    }
    const provider = currentProviders.find((item) => item.id === providerId);
    if (!provider) return;
    nextRoundModels[roundKey] = buildRoundModelFromProvider(provider, provider.defaultModel || provider.models?.[0] || "", currentConfig);
    const nextConfig = { ...currentConfig, roundModels: nextRoundModels };
    modelConfigRef.current = nextConfig;
    onModelConfigChange(nextConfig);
  };
  const updateRoundModel = (roundIndex: number, model: string) => {
    const currentConfig = modelConfigRef.current;
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1);
    if (!roundKey) return;
    const currentRound = currentConfig.roundModels?.[roundKey];
    const provider = currentRound?.enabled ? findProviderForRoundModel(currentConfig, currentRound) : null;
    const usableProvider = provider?.enabled === false ? null : provider;
    const nextRoundModels = { ...(currentConfig.roundModels ?? {}) };
    if (usableProvider) {
      nextRoundModels[roundKey] = buildRoundModelFromProvider(usableProvider, model, currentConfig);
    } else {
      nextRoundModels[roundKey] = {
        enabled: false,
        providerName: "默认连接",
        baseUrl: currentConfig.baseUrl,
        apiKey: currentConfig.apiKey,
        model,
        apiType: currentConfig.apiType,
        temperature: currentConfig.temperature,
        requestTimeoutSeconds: currentConfig.requestTimeoutSeconds,
        maxRetries: currentConfig.maxRetries,
      };
    }
    const nextConfig = { ...currentConfig, roundModels: nextRoundModels, model: usableProvider ? currentConfig.model : model };
    modelConfigRef.current = nextConfig;
    onModelConfigChange(nextConfig);
  };
  const resetModelRouteToDefault = () => {
    const currentConfig = modelConfigRef.current;
    const nextRoundModels = { ...(currentConfig.roundModels ?? {}) };
    activeFlowSequence.forEach((_, index) => {
      const roundKey = getRoundModelKey(promptProfile, index + 1);
      if (!roundKey) return;
      nextRoundModels[roundKey] = {
        ...(nextRoundModels[roundKey] ?? {
          providerName: "默认连接",
          baseUrl: currentConfig.baseUrl,
          apiKey: currentConfig.apiKey,
          model: currentConfig.model,
          apiType: currentConfig.apiType,
          temperature: currentConfig.temperature,
          requestTimeoutSeconds: currentConfig.requestTimeoutSeconds,
          maxRetries: currentConfig.maxRetries,
        }),
        enabled: false,
      };
    });
    const nextConfig = { ...currentConfig, roundModels: nextRoundModels };
    modelConfigRef.current = nextConfig;
    onModelConfigChange(nextConfig);
  };
  return (
    <>
    <Card className="shadcn-control-panel w-full min-w-0 max-w-full shrink-0 overflow-hidden">
      <CardHeader className="min-w-0 p-4 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">任务控制台</CardTitle>
            <CardDescription className="line-clamp-2">导入文档、设定路线并启动下一轮。</CardDescription>
          </div>
          <Badge variant={hasDocument ? "default" : "outline"} className="shrink-0">{hasDocument ? "已载入" : "待上传"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden p-4 pt-0">
        <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-background p-3">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">文档入口</div>
              <div className="mt-1 text-xs leading-5 text-muted-foreground">{hasDocument ? "源文件操作" : "Word / TXT"}</div>
            </div>
            <Button
              type="button"
              variant={hasDocument ? "outlineWarning" : "default"}
              onClick={onPickFile}
              disabled={busy || running}
              className="w-full min-w-0 overflow-hidden"
            >
              <FileText data-icon="inline-start" />
              <span className="min-w-0 truncate">{hasDocument ? "更换文档" : "上传文档"}</span>
            </Button>
          </div>
          <Separator className="my-3" />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={value?.sourceKind === ".docx"} disabled aria-label="DOCX 结构保护" />
            DOCX 正文映射与结构保护
          </label>
        </div>

        <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSetupEditor(setupEditor === "prompt" ? null : "prompt")}
              disabled={busy}
              aria-expanded={setupEditor === "prompt"}
              className={cn("shadcn-choice-card", setupEditor === "prompt" && "shadcn-choice-card-active")}
            >
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs font-semibold text-muted-foreground">改写流程</div>
                <Badge variant={setupEditor === "prompt" ? "default" : "outline"} className="max-w-[9rem] shrink-0 truncate">{setupEditor === "prompt" ? "已打开" : "编辑"}</Badge>
              </div>
              <div className="mt-2 truncate text-sm font-semibold">{promptSummary}</div>
              <div className="flex min-w-0 flex-wrap gap-1">
                {activeFlowSequence.map((promptId, index) => (
                  <Badge key={`${promptId}-${index}-flow`} variant="secondary" className="max-w-full truncate text-[10px]">
                    {index + 1}. {PROMPT_OPTIONS.find((option) => option.id === promptId)?.label ?? promptId}
                  </Badge>
                ))}
              </div>
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => setSetupEditor(setupEditor === "model" ? null : "model")}
              disabled={busy}
              aria-expanded={setupEditor === "model"}
              className={cn(
                "shadcn-choice-card",
                unavailableRouteCount ? "border-destructive/40 bg-destructive/5" : setupEditor === "model" && "shadcn-choice-card-active",
              )}
            >
              <div className="flex w-full min-w-0 items-center justify-between gap-2">
                <div className={`min-w-0 truncate text-xs font-semibold ${unavailableRouteCount ? "text-destructive" : "text-muted-foreground"}`}>模型路线</div>
                <Badge variant={unavailableRouteCount ? "warning" : setupEditor === "model" ? "default" : "outline"} className="max-w-[11rem] shrink-0 truncate">
                  {setupEditor === "model" ? "已打开" : modelRouteStatus}
                </Badge>
              </div>
              <div className="mt-2 truncate text-sm font-semibold" data-ui-section="home-active-model-route">
                {modelRouteTitle}
              </div>
              <div className="mt-1 flex min-w-0 flex-col gap-1 text-[11px] font-medium text-muted-foreground">
                {modelRouteLines.slice(0, 3).map((line) => (
                  <span key={line} className="truncate">{line}</span>
                ))}
              </div>
            </Button>
        </div>

        <section className={cn("flex min-w-0 max-w-full flex-col gap-3 overflow-hidden", running && "rounded-lg border border-destructive/30 bg-destructive/5 p-3")}>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{running ? "正在运行" : "执行动作"}</div>
              {!runRecoveryState ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{runHelperText}</p> : null}
            </div>
            {value?.hasNextRound ? (
              <Badge variant={running ? "warning" : "outline"} className={running ? "border-destructive/30 bg-destructive/5 text-destructive" : ""}>
                第 {value.nextRound} 轮
              </Badge>
            ) : null}
          </div>
          {hasDocument ? (
            <>
              <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="text-xs font-medium text-muted-foreground">候选策略</div>
                  <Badge variant="secondary" className="shrink-0">{candidateMaxPerChunk} 候选/块</Badge>
                </div>
                <ToggleGroup
                  type="single"
                  value={rewriteCandidateMode}
                  onValueChange={(mode) => {
                    if (mode === "economy" || mode === "quality") {
                      setRewriteCandidateMode(mode);
                    }
                  }}
                  className="!grid w-full min-w-0 grid-cols-2 overflow-hidden rounded-lg border bg-background p-1"
                >
                  <ToggleGroupItem
                    value="economy"
                    variant="outline"
                    disabled={busy || running}
                    className="h-10 w-full min-w-0 overflow-hidden rounded-md border-0 px-2 text-xs data-[state=on]:bg-muted data-[state=on]:shadow-sm"
                  >
                    <span className="min-w-0 truncate">省钱模式</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="quality"
                    variant="outline"
                    disabled={busy || running}
                    className="h-10 w-full min-w-0 overflow-hidden rounded-md border-0 px-2 text-xs data-[state=on]:bg-muted data-[state=on]:shadow-sm"
                  >
                    <span className="min-w-0 truncate">质量模式</span>
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <RunRecoveryPanel state={runRecoveryState} />
              <AutoRunSignal action={pendingAutoAction} onReject={onRejectAutoAction} />
              {progress?.totalChunks && !runRecoveryState && currentRunProgressPercent != null ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                    <span>运行进度</span>
                    <span>{currentRunProgressPercent}%</span>
                  </div>
                  <Progress value={currentRunProgressPercent} className="h-2" />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Button
                  variant={canRunNextRound ? "default" : "secondary"}
                  className="h-11 w-full min-w-0 overflow-hidden"
                  onClick={onRunRound}
                  disabled={!canRunNextRound}
                >
                  {running ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
                  <span className="min-w-0 truncate">{runButtonText}</span>
                </Button>
                {running ? (
                  <Button className="h-10 min-w-0 overflow-hidden" variant="destructive" onClick={onCancelRun}><span className="min-w-0 truncate">中断当前轮</span></Button>
                ) : value?.hasNextRound ? (
                  <Button className="h-10 min-w-0 overflow-hidden" variant="outline" onClick={onResetRound} disabled={busy}>
                    <span className="min-w-0 truncate">放弃本轮进度</span>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
              <Button variant="default" className="h-11 w-full min-w-0 overflow-hidden" onClick={onPickFile} disabled={busy}>
              <FileText data-icon="inline-start" />
              <span className="min-w-0 truncate">{uploadButtonText}</span>
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
    {setupEditor ? (
      <Sheet open={Boolean(setupEditor)} onOpenChange={(open) => {
        if (!open) setSetupEditor(null);
      }}>
        <SheetContent side="right" className={`shadcn-config-sheet min-w-0 overflow-hidden ${setupEditor === "model" ? "sm:max-w-[680px]" : "sm:max-w-[520px]"}`}>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {setupEditor === "prompt" ? <Wand2 /> : <Settings />}
              {setupEditor === "prompt" ? "改写流程" : "模型路线"}
            </SheetTitle>
            <SheetDescription>
              {setupEditor === "prompt" ? "只调整本次任务的轮次顺序。" : "默认连接，可按轮覆盖。"}
            </SheetDescription>
          </SheetHeader>
          <Separator />

          <ScrollArea className="shadcn-scroll-bound min-h-0 min-w-0 flex-1 overflow-x-hidden pr-3">
            <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden pb-4">
            {setupEditor === "prompt" ? (
              <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
                <ToggleGroup
                  type="single"
                  value={promptProfile}
                  onValueChange={(nextProfile) => {
                    if (nextProfile === "cn_prewrite" || nextProfile === "cn" || nextProfile === "cn_custom") {
                      onPromptProfileChange(nextProfile);
                    }
                  }}
                  className="!grid w-full min-w-0 grid-cols-1 items-stretch justify-stretch gap-2 overflow-hidden"
                >
                  <ToggleGroupItem
                    value="cn_prewrite"
                    variant="outline"
                    disabled={busy}
                    className="h-auto min-h-[4.25rem] w-full min-w-0 flex-col items-start justify-center gap-1 overflow-hidden px-3 py-2 text-left data-[state=on]:border-ring/35 data-[state=on]:bg-muted"
                    aria-label="中文三轮预改写"
                  >
                    <span className="text-sm font-semibold">中文三轮预改写</span>
                    <span className="max-w-full truncate text-xs text-muted-foreground">预改写 → 一轮 → 二轮</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="cn"
                    variant="outline"
                    disabled={busy}
                    className="h-auto min-h-[4.25rem] w-full min-w-0 flex-col items-start justify-center gap-1 overflow-hidden px-3 py-2 text-left data-[state=on]:border-ring/35 data-[state=on]:bg-muted"
                    aria-label="中文双轮"
                  >
                    <span className="text-sm font-semibold">中文双轮</span>
                    <span className="max-w-full truncate text-xs text-muted-foreground">一轮 → 二轮</span>
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="cn_custom"
                    variant="outline"
                    disabled={busy}
                    className="h-auto min-h-[4.25rem] w-full min-w-0 flex-col items-start justify-center gap-1 overflow-hidden px-3 py-2 text-left data-[state=on]:border-ring/35 data-[state=on]:bg-muted"
                    aria-label="自定义组合"
                  >
                    <span className="text-sm font-semibold">自定义组合</span>
                    <span className="max-w-full truncate text-xs text-muted-foreground">{formatPromptSequence(activeSequence)}</span>
                  </ToggleGroupItem>
                </ToggleGroup>
                <div className="grid gap-2">
                  <label className="text-xs font-medium text-muted-foreground">当前流程摘要</label>
                  <Textarea value={formatPromptSequence(activeFlowSequence)} readOnly className="min-h-20 resize-none" />
                </div>
                {promptProfile === "cn_custom" ? (
                  <div className="min-w-0 overflow-hidden rounded-lg border bg-background p-4">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[1, 2, 3].map((length) => (
                        <Button key={length} type="button" variant={activeSequence.length === length ? "default" : "outline"} size="sm" onClick={() => updateSequenceLength(length)} disabled={busy}>{length} 轮</Button>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={randomizeSequence} disabled={busy}>随机</Button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {activeSequence.map((promptId, index) => (
                        <div key={`${index}-${promptId}`} className="grid gap-2">
                          <div className="text-xs font-semibold text-muted-foreground">第 {index + 1} 轮</div>
                          <Select value={promptId} onValueChange={(nextPromptId) => updateSequenceRound(index, nextPromptId as PromptId)} disabled={busy}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {PROMPT_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label} · {option.desc}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
                <Card data-ui-section="model-route-compact" className="min-w-0 overflow-hidden shadow-none">
                  <CardContent className="flex min-w-0 flex-col gap-3 overflow-hidden p-3">
                    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                        <Badge variant={unavailableRouteCount ? "warning" : activeModelRouteReady ? "success" : "outline"} className="shrink-0">{modelRouteHealthLabel}</Badge>
                        <span className="min-w-0 truncate font-medium">{modelRouteTitle}</span>
                        <Separator orientation="vertical" className="h-4" />
                        <span className="text-muted-foreground">服务商 {providerOptions.length}/{providers.length}</span>
                        <span className="text-muted-foreground">轮次 {activeFlowSequence.length}</span>
                      </div>
                      <Badge variant={customizedRouteCount ? "secondary" : "outline"} className="shrink-0">{modelRouteStatus}</Badge>
                    </div>
                    <div className="grid min-w-0 gap-2 sm:grid-cols-3">
                      <Button type="button" variant="outline" size="sm" onClick={resetModelRouteToDefault} disabled={busy}>继承默认</Button>
                      <Button type="button" variant="outline" size="sm" onClick={onRefreshAllProviderModels} disabled={busy || modelConfig.offlineMode || providerOptions.length === 0}>
                        <RefreshCw data-icon="inline-start" />读服务商
                      </Button>
                      <Button type="button" variant="neutral" size="sm" onClick={() => onSaveModelConfig(modelConfigRef.current)} disabled={busy || unavailableRouteCount > 0}>
                        <Save data-icon="inline-start" />保存
                      </Button>
                    </div>
                    {unavailableRouteCount ? (
                      <Alert variant="destructive">
                        <AlertCircle />
                        <AlertTitle>有轮次不可用</AlertTitle>
                        <AlertDescription>切换服务商或改为继承默认。</AlertDescription>
                      </Alert>
                    ) : null}
                  </CardContent>
                </Card>
                <div className="grid min-w-0 gap-3">
                  {activeFlowSequence.map((promptId, index) => {
                    const promptOption = PROMPT_OPTIONS.find((option) => option.id === promptId);
                    const roundKey = getRoundModelKey(promptProfile, index + 1);
                    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
                    const provider = findProviderForRoundModel(modelConfig, roundModel);
                    const selectedProviderId = roundModel?.enabled && provider && provider.enabled !== false ? provider.id : "__default";
                    const selectedModels = selectedProviderId === "__default" ? [] : provider?.models?.length ? provider.models : [];
                    const selectedModelValue = selectedProviderId === "__default" ? "" : roundModel?.model || provider?.defaultModel || selectedModels[0];
                    const routeIssues = modelConfig.offlineMode ? [] : selectedProviderId === "__default"
                      ? [
                        !modelConfig.baseUrl?.trim() ? "默认 API 地址未填" : "",
                        !modelConfig.apiKey?.trim() ? "默认 API Key 未填" : "",
                        !modelConfig.model?.trim() ? "默认模型未填" : "",
                      ].filter(Boolean)
                      : [
                        !provider?.baseUrl?.trim() ? "服务商 API 地址未填" : "",
                        !provider?.apiKey?.trim() ? "服务商 API Key 未填" : "",
                        !String(selectedModelValue ?? "").trim() ? "本轮模型未选" : "",
                      ].filter(Boolean);
                    return (
                      <Card key={`${promptId}-${index}-model`} className={cn("min-w-0 overflow-hidden shadow-none", routeIssues.length && "border-destructive/40 bg-destructive/5")}>
                        <CardHeader className="flex min-w-0 flex-row items-center justify-between gap-3 p-3 pb-2">
                          <CardTitle className="min-w-0 truncate text-sm">第 {index + 1} 轮 · {promptOption?.label ?? promptId}</CardTitle>
                          <Badge variant={selectedProviderId === "__default" ? "outline" : "secondary"} className="shrink-0">{selectedProviderId === "__default" ? "默认" : "专属"}</Badge>
                        </CardHeader>
                        <CardContent className="grid min-w-0 gap-3 overflow-hidden p-3 pt-0">
                          <FieldGroup className="grid min-w-0 gap-2 md:grid-cols-2">
                            <Field>
                              <FieldLabel className="sr-only">第 {index + 1} 轮服务商</FieldLabel>
                            <Select value={selectedProviderId || "__default"} onValueChange={(providerId) => updateRoundProvider(index, providerId)} disabled={busy}>
                              <SelectTrigger><SelectValue placeholder="选择服务商" /></SelectTrigger>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectItem value="__default">默认连接 · {modelConfig.model || "未选模型"}</SelectItem>
                                  {providerOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name || "未命名服务商"}</SelectItem>)}
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                            </Field>
                            <Field>
                              <FieldLabel className="sr-only">第 {index + 1} 轮模型</FieldLabel>
                            {selectedProviderId === "__default" ? (
                              <Input value={modelConfig.model || "未选模型"} readOnly disabled />
                            ) : selectedModels.length > 0 ? (
                              <Select value={selectedModelValue} onValueChange={(model) => updateRoundModel(index, model)} disabled={busy}>
                                <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                                <SelectContent>
                                  <SelectGroup>
                                    {selectedModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                                  </SelectGroup>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                value={roundModel?.model ?? ""}
                                onChange={(event) => updateRoundModel(index, event.target.value)}
                                disabled={busy}
                                placeholder="填写模型名称"
                              />
                            )}
                            </Field>
                          </FieldGroup>
                          {selectedProviderId !== "__default" && provider && selectedModels.length === 0 ? (
                            <Button type="button" variant="outline" size="sm" className="w-fit max-w-full" onClick={() => onRefreshProviderModels(provider.id)} disabled={busy || modelConfig.offlineMode}>
                              <RefreshCw data-icon="inline-start" />读取模型
                            </Button>
                          ) : null}
                          {routeIssues.length ? (
                            <Alert variant="destructive">
                              <AlertCircle />
                              <AlertTitle>本轮不可用</AlertTitle>
                              <AlertDescription>{routeIssues.join("，")}</AlertDescription>
                            </Alert>
                          ) : null}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    ) : null}
    </>
  );
}

function AutoRunSignal({ action, onReject }: { action: PendingAutoAction | null; onReject: () => void }) {
  if (!action) {
    return null;
  }
  const percent = getPendingAutoActionPercent(action);
  const countdown = isCountdownAutoAction(action);
  return (
    <Alert variant={action.kind === "manual-intervention" ? "destructive" : "default"} className="min-w-0 overflow-hidden bg-background">
      <Signal />
      <AlertTitle className="flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate">{getPendingAutoActionTitle(action)}</span>
        <Badge variant={action.kind === "manual-intervention" ? "danger" : action.kind === "retry" ? "warning" : "secondary"} className="shrink-0">
          {countdown ? `${action.secondsRemaining}s` : "人工处理"}
        </Badge>
      </AlertTitle>
      <AlertDescription>
        <div className="flex min-w-0 flex-col gap-3 overflow-hidden">
          <p className="min-w-0 break-words">{formatPendingAutoActionStatus(action)}</p>
          <p className="min-w-0 break-words text-xs text-muted-foreground">{formatPendingAutoActionDetail(action)}</p>
          {typeof percent === "number" ? (
            <Progress value={percent} className="h-2" />
          ) : null}
          <Button type="button" variant={action.kind === "manual-intervention" ? "outline" : "outlineWarning"} size="sm" className="min-w-0 overflow-hidden" onClick={onReject}>
            <X data-icon="inline-start" />
            <span className="min-w-0 truncate">{action.kind === "manual-intervention" ? "我来处理" : "拒绝自动执行"}</span>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

function RunRecoveryPanel({ state }: { state: RunRecoveryPanelState | null }) {
  if (!state) {
    return null;
  }
  const percent = clampPercent(state.percent);
  const recoveryLabel = state.resumeActionLabel?.includes("收尾") ? "等待收尾" : "断点续跑";
  return (
    <Alert
      variant={state.tone === "red" ? "destructive" : "default"}
      className={cn(
        "min-w-0 overflow-hidden border-0 bg-muted/50 p-3 shadow-none [&>svg]:left-3 [&>svg]:top-3",
        state.tone === "amber" && "border-primary/25 bg-muted/50",
      )}
    >
      <AlertCircle />
      <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <AlertTitle className="mb-0 truncate text-sm">{recoveryLabel}</AlertTitle>
          </div>
          {state.totalChunks ? (
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {state.completedChunks}/{state.totalChunks} · {percent}%
            </span>
          ) : null}
        </div>
        {state.totalChunks ? (
          <Progress value={percent} className="h-1.5" />
        ) : null}
      </div>
    </Alert>
  );
}
function formatDateTime(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size >= 10 || unitIndex === 0 ? Math.round(size) : size.toFixed(1)} ${units[unitIndex]}`;
}

function getDiagnosticBadgeVariant(level?: string): "success" | "warning" | "danger" | "outline" {
  if (level === "success") return "success";
  if (level === "warning") return "warning";
  if (level === "error") return "danger";
  return "outline";
}

function redactLocalPath(value: string): string {
  return value
    .replace(/([A-Za-z]:\\Users\\)[^\\]+/g, "$1<user>")
    .replace(/(\/Users\/)[^/]+/g, "$1<user>")
    .replace(/(\/home\/)[^/]+/g, "$1<user>");
}

function buildShareableDiagnostics(value: EnvironmentDiagnostics) {
  return {
    ok: value.ok,
    createdAt: value.createdAt,
    checks: value.checks.map((item) => ({
      key: item.key,
      label: item.label,
      level: item.level,
      ok: item.ok,
      message: item.message,
    })),
    config: {
      exists: value.config.exists,
      offlineMode: value.config.offlineMode,
      hasBaseUrl: value.config.hasBaseUrl,
      hasApiKey: value.config.hasApiKey,
      apiType: value.config.apiType,
      model: value.config.model ? "<configured>" : "",
      promptProfile: value.config.promptProfile,
      promptSequence: value.config.promptSequence,
      rewriteCandidateMode: value.config.rewriteCandidateMode,
      requestTimeoutSeconds: value.config.requestTimeoutSeconds,
      maxRetries: value.config.maxRetries,
      providerCount: value.config.providerCount,
      enabledProviderCount: value.config.enabledProviderCount,
      customRoundCount: value.config.customRoundCount,
    },
    runtime: {
      pythonVersion: value.runtime.pythonVersion,
      platform: value.runtime.platform,
      pythonExecutable: redactLocalPath(value.runtime.pythonExecutable),
    },
    paths: value.paths.map((item) => ({
      key: item.key,
      label: item.label,
      exists: item.exists,
      writable: item.writable,
      fileCount: item.fileCount,
      sizeBytes: item.sizeBytes,
      path: redactLocalPath(item.path),
    })),
    activeRunCount: value.activeRunCount,
    activeBatchRerunCount: value.activeBatchRerunCount ?? value.activeBatchReruns?.length ?? 0,
    recentRunCount: value.recentRunCount ?? value.recentRuns?.length ?? 0,
    recentBatchRerunCount: value.recentBatchRerunCount ?? value.recentBatchReruns?.length ?? 0,
    taskStateStore: value.taskStateStore ? {
      ...value.taskStateStore,
      path: redactLocalPath(value.taskStateStore.path),
    } : undefined,
    activeRuns: value.activeRuns.map((item) => ({
      runId: item.runId,
      sourcePath: redactLocalPath(item.sourcePath),
      status: item.status,
      cancelRequested: item.cancelRequested,
      eventCount: item.eventCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastPhase: item.lastEvent?.phase,
      lastChunk: item.lastEvent?.chunkId,
      lastError: item.lastEvent?.error,
    })),
    recentRuns: (value.recentRuns ?? []).map((item) => ({
      runId: item.runId,
      sourcePath: redactLocalPath(item.sourcePath),
      status: item.status,
      completed: item.completed,
      cancelRequested: item.cancelRequested,
      eventCount: item.eventCount,
      restoredFromDisk: item.restoredFromDisk,
      persistedAt: item.persistedAt,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastPhase: item.lastEvent?.phase,
      lastChunk: item.lastEvent?.chunkId,
      lastError: item.lastEvent?.error,
      error: item.error,
    })),
    activeBatchReruns: (value.activeBatchReruns ?? []).map((item) => ({
      runId: item.runId,
      outputPath: redactLocalPath(item.outputPath),
      status: item.status,
      cancelRequested: item.cancelRequested,
      totalCount: item.totalCount,
      completedCount: item.completedCount,
      successCount: item.successCount,
      failureCount: item.failureCount,
      currentChunkId: item.currentChunkId,
      updatedAt: item.updatedAt,
    })),
    recentBatchReruns: (value.recentBatchReruns ?? []).map((item) => ({
      runId: item.runId,
      outputPath: redactLocalPath(item.outputPath),
      status: item.status,
      totalCount: item.totalCount,
      completedCount: item.completedCount,
      successCount: item.successCount,
      failureCount: item.failureCount,
      currentChunkId: item.currentChunkId,
      restoredFromDisk: item.restoredFromDisk,
      persistedAt: item.persistedAt,
      updatedAt: item.updatedAt,
    })),
  };
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function DiagnosticsPage({
  value,
  busy,
  onRefresh,
  onCleanupTaskSnapshots,
}: {
  value: EnvironmentDiagnostics | null;
  busy: boolean;
  onRefresh: () => void;
  onCleanupTaskSnapshots: () => void;
}) {
  const checks = value?.checks ?? [];
  const warningCount = checks.filter((item) => item.level === "warning").length;
  const errorCount = checks.filter((item) => item.level === "error").length;
  const passedCount = checks.filter((item) => item.ok || item.level === "success" || item.level === "info").length;
  const healthPercent = checks.length ? Math.round((passedCount / checks.length) * 100) : 0;
  const statusText = !value ? "等待自检" : errorCount ? `${errorCount} 个错误` : warningCount ? `${warningCount} 个提示` : "运行正常";
  const statusVariant = errorCount ? "danger" : warningCount ? "warning" : value ? "success" : "outline";
  const problemChecks = checks.filter((item) => item.level === "error" || item.level === "warning");
  const activeBatchRerunCount = value?.activeBatchRerunCount ?? value?.activeBatchReruns?.length ?? 0;
  const recentRunCount = value?.recentRunCount ?? value?.recentRuns?.length ?? 0;
  const recentBatchRerunCount = value?.recentBatchRerunCount ?? value?.recentBatchReruns?.length ?? 0;
  const activeTaskCount = (value?.activeRunCount ?? 0) + activeBatchRerunCount;
  const recentTaskCount = recentRunCount + recentBatchRerunCount;
  const taskStateStore = value?.taskStateStore;
  const configReady = value ? value.config.offlineMode || Boolean(value.config.hasBaseUrl && value.config.hasApiKey && value.config.model) : false;
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = async () => {
    if (!value) return;
    await copyTextToClipboard(JSON.stringify(buildShareableDiagnostics(value), null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
      <Card className="overflow-hidden">
        <CardHeader className="border-b pb-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant}>{statusText}</Badge>
                {value ? <Badge variant="outline">{formatDateTime(value.createdAt)}</Badge> : null}
              </div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Activity />
                启动诊断
              </CardTitle>
              <CardDescription className="mt-1 truncate">{value?.workspace || "读取当前后端、任务和目录状态"}</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => void copyDiagnostics()} disabled={!value}>
                {copied ? <CheckCircle2 data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                {copied ? "已复制" : "复制诊断"}
              </Button>
              <Button onClick={onRefresh} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                重新自检
              </Button>
            </div>
          </div>
        </CardHeader>
        {value ? (
          <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            <DiagnosticSummaryTile label="自检项" value={`${passedCount}/${checks.length}`} detail={errorCount || warningCount ? "有项目需要确认" : "全部可用"} />
            <DiagnosticSummaryTile label="模型连接" value={configReady ? "可启动" : "待补全"} detail={value.config.offlineMode ? "离线模式" : value.config.model || "未选择模型"} />
            <DiagnosticSummaryTile label="后台任务" value={`${activeTaskCount} 运行中`} detail={`${recentTaskCount} 条近期摘要`} />
            <DiagnosticSummaryTile label="快照" value={taskStateStore ? `${taskStateStore.fileCount} 个` : "未返回"} detail={taskStateStore ? `${taskStateStore.staleCount} 个可清理` : "等待后端状态"} />
          </CardContent>
        ) : null}
      </Card>

      {value ? (
        <ScrollArea className="min-h-0 pr-1">
          <div className="flex flex-col gap-4 pb-2">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">需要处理</CardTitle>
                      <CardDescription className="mt-1">只列出 warning 和 error。</CardDescription>
                    </div>
                    <Badge variant={problemChecks.length ? "warning" : "success"}>{problemChecks.length ? `${problemChecks.length} 项` : "干净"}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {problemChecks.length ? (
                    <div className="grid gap-2">
                      {problemChecks.map((item) => (
                        <Alert key={item.key} variant={item.level === "error" ? "destructive" : undefined} className={item.level === "warning" ? "border-primary/25 bg-muted/60" : undefined}>
                          {item.level === "error" ? <AlertCircle /> : <AlertTriangle />}
                          <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
                            <span>{item.label}</span>
                            <Badge variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "error" ? "错误" : "提示"}</Badge>
                          </AlertTitle>
                          <AlertDescription>{item.message}</AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  ) : (
                    <Empty className="min-h-[12rem] border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                        <EmptyTitle>没有待处理项</EmptyTitle>
                        <EmptyDescription>当前后端检查没有返回错误或提示。</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">自检明细</CardTitle>
                      <CardDescription className="mt-1">来自后端健康检查。</CardDescription>
                    </div>
                    <Badge variant="outline">{healthPercent}%</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Progress value={healthPercent} className="h-2" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {checks.map((item) => (
                      <DiagnosticCheckCard key={item.key} item={item} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">工作目录</CardTitle>
                  <CardDescription className="mt-1">权限、文件数量和占用空间。</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {value.paths.map((item) => (
                    <Card key={item.key} className="shadow-none">
                      <CardContent className="grid gap-3 p-3 text-xs md:grid-cols-[150px_minmax(0,1fr)_140px] md:items-center">
                        <div>
                          <div className="font-semibold text-foreground">{item.label}</div>
                          <Badge className="mt-1" variant={item.exists && item.writable ? "success" : item.exists ? "warning" : "danger"}>
                            {item.exists ? item.writable ? "可写" : "不可写" : "不存在"}
                          </Badge>
                        </div>
                        <div className="min-w-0 truncate text-muted-foreground">{item.path}</div>
                        <div className="font-semibold text-foreground md:text-right">{item.fileCount} 文件 · {formatBytes(item.sizeBytes)}</div>
                      </CardContent>
                    </Card>
                  ))}
                </CardContent>
              </Card>

              <div className="grid gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">模型配置</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-xs">
                    <DiagnosticRow label="运行模式" value={value.config.offlineMode ? "离线" : "远程模型"} />
                    <DiagnosticRow label="默认模型" value={value.config.model || "未填写"} />
                    <DiagnosticRow label="接口" value={value.config.offlineMode ? "不请求远程" : value.config.hasBaseUrl ? "已填写" : "缺少 Base URL"} />
                    <DiagnosticRow label="密钥" value={value.config.offlineMode ? "不需要" : value.config.hasApiKey ? "已填写" : "缺少 API Key"} />
                    <DiagnosticRow label="服务商仓库" value={`保存 ${value.config.providerCount} · 启用 ${value.config.enabledProviderCount}`} />
                    <DiagnosticRow label="轮次专属配置" value={`${value.config.customRoundCount} 轮`} />
                    <DiagnosticRow label="超时/重试" value={`${value.config.requestTimeoutSeconds ?? "-"}s / ${value.config.maxRetries ?? "-"} 次`} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">运行时</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-xs">
                    <DiagnosticRow label="Python" value={value.runtime.pythonVersion || "未返回"} />
                    <DiagnosticRow label="解释器" value={value.runtime.pythonExecutable || "未返回"} />
                    <DiagnosticRow label="平台" value={value.runtime.platform || "未返回"} />
                  </CardContent>
                </Card>
              </div>
            </div>

            {taskStateStore ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">任务快照治理</CardTitle>
                      <CardDescription className="mt-1">用于断点恢复，清理不会删除运行中的快照。</CardDescription>
                    </div>
                    <Button variant="outline" onClick={onCleanupTaskSnapshots} disabled={busy || taskStateStore.staleCount <= 0}>
                      <Trash2 data-icon="inline-start" />
                      清理过期快照
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <ReportStat label="文件" value={`${taskStateStore.fileCount} · ${formatBytes(taskStateStore.sizeBytes)}`} />
                    <ReportStat label="轮次/重跑" value={`${taskStateStore.runRoundCount} / ${taskStateStore.batchRerunCount}`} />
                    <ReportStat label="保护中" value={`${taskStateStore.activeSnapshotCount}`} />
                    <ReportStat label="可清理" value={`${taskStateStore.staleCount}`} />
                  </div>
                  <div className="truncate text-[11px] font-medium text-muted-foreground">{taskStateStore.path}</div>
                </CardContent>
              </Card>
            ) : null}

            {activeTaskCount ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">运行中的任务</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {value.activeRuns.map((item) => (
                    <DiagnosticRunAlert key={item.runId} item={item} />
                  ))}
                  {(value.activeBatchReruns ?? []).map((item) => (
                    <DiagnosticBatchAlert key={item.runId} item={item} />
                  ))}
                </CardContent>
              </Card>
            ) : null}

            {recentTaskCount ? (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-lg">近期任务摘要</CardTitle>
                    <Badge variant="outline">轮次 {recentRunCount} · 重跑 {recentBatchRerunCount}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2">
                  {(value.recentRuns ?? []).map((item) => (
                    <DiagnosticRunAlert key={item.runId} item={item} recent />
                  ))}
                  {(value.recentBatchReruns ?? []).map((item) => (
                    <DiagnosticBatchAlert key={item.runId} item={item} recent />
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </div>
        </ScrollArea>
      ) : (
        <Empty className="min-h-0 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Activity /></EmptyMedia>
            <EmptyTitle>等待自检</EmptyTitle>
            <EmptyDescription>点击“重新自检”读取当前环境状态。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function DiagnosticSummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="bg-muted/40 shadow-none">
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-2 truncate text-xl font-semibold text-foreground">{value}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

function DiagnosticCheckCard({ item }: { item: EnvironmentDiagnostics["checks"][number] }) {
  return (
    <Card className={cn("shadow-none", item.level === "error" && "border-destructive/30 bg-destructive/5", item.level === "warning" && "border-primary/25 bg-muted/60")}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 font-semibold text-foreground">{item.label}</div>
          <Badge variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "success" ? "通过" : item.level === "error" ? "错误" : item.level === "warning" ? "提示" : "信息"}</Badge>
        </div>
        <div className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message}</div>
      </CardContent>
    </Card>
  );
}

function DiagnosticRunAlert({ item, recent = false }: { item: EnvironmentDiagnostics["activeRuns"][number]; recent?: boolean }) {
  const status = item.cancelRequested
    ? "中断中"
    : recent && !item.completed
      ? "轮次未完成"
      : item.status || (recent ? "已记录" : "运行中");
  return (
    <Alert className={cn(item.status === "interrupted" && "border-primary/25 bg-muted/60")}>
      {recent ? <Clock3 /> : <Activity />}
      <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
        <span>轮次任务 · {formatShortTaskId(item.runId) ?? item.runId}</span>
        <Badge variant={item.status === "interrupted" || item.cancelRequested ? "warning" : "outline"}>{status}</Badge>
      </AlertTitle>
      <AlertDescription className="grid gap-1 text-xs">
        <span className="truncate">{item.sourcePath}</span>
        <span>
          事件 {item.eventCount} 个
          {item.lastEvent?.phase ? ` · 阶段 ${item.lastEvent.phase}` : ""}
          {item.lastEvent?.chunkId ? ` · 块 ${item.lastEvent.chunkId}` : ""}
        </span>
        {item.error ? <span className="rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">{item.error}</span> : null}
        <span>{recent ? "落盘" : "更新"} {formatDateTime(item.persistedAt || item.updatedAt)}</span>
      </AlertDescription>
    </Alert>
  );
}

function DiagnosticBatchAlert({ item, recent = false }: { item: NonNullable<EnvironmentDiagnostics["activeBatchReruns"]>[number]; recent?: boolean }) {
  const status = item.cancelRequested
    ? "停止中"
    : recent && !item.completed
      ? "重跑未完成"
      : item.status || (recent ? "已记录" : "运行中");
  return (
    <Alert className={cn(item.status === "interrupted" && "border-primary/25 bg-muted/60")}>
      <RefreshCw />
      <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
        <span>批量重跑 · {formatShortTaskId(item.runId) ?? item.runId}</span>
        <Badge variant={item.status === "interrupted" || item.cancelRequested ? "warning" : "outline"}>{status}</Badge>
      </AlertTitle>
      <AlertDescription className="grid gap-1 text-xs">
        <span className="truncate">{item.outputPath}</span>
        <span>
          {item.completedCount}/{item.totalCount} 块 · 成功 {item.successCount} · 失败 {item.failureCount}
          {item.currentChunkId ? ` · 当前 ${item.currentChunkId}` : ""}
        </span>
        {item.error ? <span className="rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">{item.error}</span> : null}
        <span>{recent ? "落盘" : "更新"} {formatDateTime(item.persistedAt || item.updatedAt)}</span>
      </AlertDescription>
    </Alert>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 justify-between gap-3 rounded-md bg-muted/50 px-3 py-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <b className="min-w-0 truncate text-right text-foreground">{value}</b>
    </div>
  );
}
function DetectionReportPanel({
  report,
  matches,
  documentLabel,
  busy,
  onPickReport,
  onClearReport,
  onRerunMatchedChunks,
}: {
  report: DetectionReport | null;
  matches: DetectionReportMatch[];
  documentLabel: string;
  busy: boolean;
  onPickReport: (providerHint: DetectionReportProvider) => void;
  onClearReport: () => void;
  onRerunMatchedChunks: () => void;
}) {
  const [matchFilter, setMatchFilter] = useState<"strong" | "review" | "unmatched" | "all">("strong");
  const providerLabel = report?.providerLabel || report?.provider || "外部报告";
  const riskySegments = report?.segments.filter((segment) => isDetectionRerunRisk(segment)) ?? [];
  const highSegments = report?.segments.filter((segment) => isDetectionHighRisk(segment)) ?? [];
  const strongMatches = matches.filter((match) => match.confidence === "strong");
  const reviewMatches = matches.filter((match) => match.confidence === "review");
  const weakMatches = matches.filter((match) => match.confidence === "weak");
  const strongMatchedRisky = riskySegments.filter((segment) => strongMatches.some((match) => match.segment.index === segment.index));
  const unmatchedRisky = riskySegments.filter((segment) => !matches.some((match) => match.segment.index === segment.index));
  const overallRisk = report?.summary.weightedOverallRiskProbability ?? report?.summary.overallRiskProbability;
  const hasParsedSegments = Boolean(report?.segments.length);
  const reportSourceLabel = report?.sourcePath ? formatDocLabel(report.sourcePath) : "";
  const riskSegmentSummaries = riskySegments.map((segment) => {
    const matchedItems = matches.filter((item) => item.segment.index === segment.index);
    const strongItems = matchedItems.filter((item) => item.confidence === "strong");
    const reviewItems = matchedItems.filter((item) => item.confidence === "review");
    const weakItems = matchedItems.filter((item) => item.confidence === "weak");
    const bestMatch = matchedItems[0];
    const matchState = strongItems.length ? "strong" : reviewItems.length ? "review" : matchedItems.length ? "weak" : "unmatched";
    return {
      segment,
      matchedItems,
      strongCount: strongItems.length,
      reviewCount: reviewItems.length,
      weakCount: weakItems.length,
      bestMatch,
      matchState,
    };
  });
  const visibleSegmentSummaries = riskSegmentSummaries.filter((item) => {
    if (matchFilter === "all") return true;
    if (matchFilter === "unmatched") return item.matchState === "unmatched" || item.matchState === "weak";
    return item.matchState === matchFilter;
  });
  useEffect(() => {
    if (report && strongMatchedRisky.length === 0 && matchFilter === "strong") {
      setMatchFilter(reviewMatches.length ? "review" : unmatchedRisky.length || weakMatches.length ? "unmatched" : "all");
    }
  }, [report, strongMatchedRisky.length, reviewMatches.length, unmatchedRisky.length, weakMatches.length, matchFilter]);
  return (
    <Card className="min-h-0 w-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="min-w-0 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex min-w-0 flex-wrap items-center gap-2">
              <Badge variant="secondary">检测反馈</Badge>
              {report
                ? <Badge variant={hasParsedSegments ? (highSegments.length ? "warning" : "success") : "warning"} className="max-w-full truncate">{hasParsedSegments ? `${providerLabel} ${overallRisk ?? "-"}%` : "未解析到片段"}</Badge>
                : <Badge variant="outline">未接入</Badge>}
            </div>
            <CardTitle className="text-lg">外部报告</CardTitle>
            <CardDescription className="mt-1 truncate">
              {documentLabel ? `文档：${documentLabel}` : "上传文档后可接入报告"}
            </CardDescription>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickReport("speedai")}
              disabled={busy || !documentLabel}
              className={cn("min-w-0 overflow-hidden", report?.provider === "speedai" && "ring-2 ring-primary/25")}
            >
              <FileText data-icon="inline-start" />
              <span className="min-w-0 truncate">上传 SpeedAI</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickReport("paperpass")}
              disabled={busy || !documentLabel}
              className={cn("min-w-0 overflow-hidden", report?.provider === "paperpass" && "ring-2 ring-primary/25")}
            >
              <FileText data-icon="inline-start" />
              <span className="min-w-0 truncate">上传 PaperPass</span>
            </Button>
          </div>
      </CardHeader>

      <CardContent className="flex min-h-0 min-w-0 max-w-full flex-col gap-3 overflow-hidden">
        {report ? (
          <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-hidden">
            <div className="grid min-w-0 grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-md border bg-muted/50 p-3 text-foreground">
                <div className="text-lg font-black">{report.segments.length}</div>
                <div>报告片段</div>
              </div>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive">
                <div className="text-lg font-black">{highSegments.length}</div>
                <div>高风险</div>
              </div>
              <div className="rounded-md border bg-muted/50 p-3 text-foreground">
                <div className="text-lg font-black">{strongMatchedRisky.length}</div>
                <div>强命中</div>
              </div>
              <div className="rounded-md border border-primary/25 bg-muted/60 p-3 text-foreground">
                <div className="text-lg font-black">{reviewMatches.length + weakMatches.length + unmatchedRisky.length}</div>
                <div>需人工看</div>
              </div>
            </div>

            <div className="min-w-0 overflow-hidden rounded-md border bg-muted/50 p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">来源：<b className="text-foreground">{providerLabel}</b>{reportSourceLabel ? ` · ${reportSourceLabel}` : ""}</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {hasParsedSegments ? (
                    <Button size="sm" className="min-w-0 overflow-hidden" onClick={onRerunMatchedChunks} disabled={busy || strongMatchedRisky.length === 0}>
                      <RefreshCw data-icon="inline-start" />
                      <span className="min-w-0 truncate">重跑强命中 {strongMatchedRisky.length}</span>
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" className="min-w-0 overflow-hidden" onClick={onClearReport} disabled={busy}>
                    <Trash2 data-icon="inline-start" />
                    <span className="min-w-0 truncate">清除</span>
                  </Button>
                </div>
              </div>
              {report.summary.checkedScopeNotes?.length ? (
                <div className="mt-2 min-w-0 break-words rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">
                  {report.summary.checkedScopeNotes.join("；")}
                </div>
              ) : null}
            </div>

            {!hasParsedSegments ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>没有解析到风险片段</AlertTitle>
                <AlertDescription>请确认报告格式或重新上传。</AlertDescription>
              </Alert>
            ) : (
              <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-md border bg-muted/40 p-3">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">报告片段</div>
                  <Badge variant="outline" className="shrink-0">{visibleSegmentSummaries.length} 条</Badge>
                </div>
                <ToggleGroup
                  type="single"
                  value={matchFilter}
                  onValueChange={(value) => value && setMatchFilter(value as typeof matchFilter)}
                  className="!grid min-w-0 grid-cols-2 overflow-hidden"
                >
                  {[
                    { key: "strong" as const, label: `强命中 ${strongMatchedRisky.length}` },
                    { key: "review" as const, label: `疑似 ${reviewMatches.length}` },
                    { key: "unmatched" as const, label: `未确认 ${unmatchedRisky.length + weakMatches.length}` },
                    { key: "all" as const, label: `全部 ${riskySegments.length}` },
                  ].map((item) => (
                    <ToggleGroupItem
                      key={item.key}
                      value={item.key}
                      className="h-9 min-w-0 overflow-hidden px-2 text-xs"
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>

                {visibleSegmentSummaries.length ? (
                  <ScrollArea className="shadcn-scroll-bound h-72 min-w-0 overflow-x-hidden pr-1">
                    <div className="flex min-w-0 max-w-full flex-col gap-2 overflow-x-hidden">
                      {visibleSegmentSummaries.map(({ segment, matchedItems, strongCount, reviewCount, weakCount, bestMatch, matchState }) => (
                    <Alert key={segment.index} className={cn("min-w-0 overflow-hidden", matchState === "review" && "border-primary/25 bg-muted/60")}>
                      <AlertCircle />
                      <AlertTitle className="min-w-0">
                      <div className="mb-1 flex min-w-0 flex-wrap items-center gap-2">
                        <Badge variant={isDetectionHighRisk(segment) ? "warning" : "outline"}>#{segment.index} {segment.probability}%</Badge>
                        {segment.page ? <Badge variant="outline">第 {segment.page} 页</Badge> : null}
                        <Badge variant="outline">{segment.riskLevel || "未知风险"}</Badge>
                        {strongCount ? <Badge variant="success">强命中 {strongCount}</Badge> : reviewCount ? <Badge variant="warning">疑似 {reviewCount}</Badge> : weakCount ? <Badge variant="outline">弱匹配 {weakCount}</Badge> : <Badge variant="outline">未匹配</Badge>}
                        {bestMatch ? <Badge variant="secondary">最高 {Math.round(bestMatch.score * 100)}%</Badge> : null}
                      </div>
                      </AlertTitle>
                      <AlertDescription className="grid min-w-0 gap-2">
                        <span className="line-clamp-3 min-w-0 break-words text-foreground">{segment.content}</span>
                        {bestMatch ? <span className="min-w-0 break-words rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">{bestMatch.reason}</span> : null}
                        {bestMatch?.evidence.matchedFragments?.[0] ? (
                          <span className="break-all rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                            命中句段：{bestMatch.evidence.matchedFragments[0]}
                          </span>
                        ) : null}
                        {matchedItems.length > 1 ? (
                          <span className="min-w-0 break-words text-[11px] font-semibold text-muted-foreground">候选匹配：{matchedItems.map((item) => `${item.chunkId} ${Math.round(item.score * 100)}%`).join(" / ")}</span>
                        ) : null}
                      </AlertDescription>
                    </Alert>
                      ))}
                    </div>
                  </ScrollArea>
                ) : (
                  <Empty className="min-h-[12rem] border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <FileText />
                      </EmptyMedia>
                      <EmptyTitle>当前分层为空</EmptyTitle>
                      <EmptyDescription>
                      当前分层下没有可显示片段。
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            )}
          </div>
        ) : (
          <Empty className="min-h-[18rem] border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileText />
              </EmptyMedia>
              <EmptyTitle>未接入外部报告</EmptyTitle>
              <EmptyDescription>上传 SpeedAI 或 PaperPass 报告后，这里会显示命中片段和重跑入口。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function QualityReportPage({ compareData, exportResult }: { compareData: RoundCompareData | null; exportResult: ExportResult | null }) {
  const stats = buildQualityStats(compareData, exportResult);
  const riskMessages = buildExportRiskMessages(compareData, exportResult);
  const protectedTypeText = Object.entries(stats.protectedTypes)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${formatProtectedTypeLabel(key)} ${count}`)
    .join(" / ") || "暂无结构锁定";

  return (
    <div className="grid gap-5">
      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <CardTitle>改写检查</CardTitle>
              <CardDescription>展示结构、引用、排版与表达提示。</CardDescription>
            </div>
            <Badge variant={riskMessages.length ? "warning" : "success"}>
              {riskMessages.length ? `${riskMessages.length} 类风险` : "当前稳定"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ReportStat label="Diff 块" value={String(stats.chunkCount)} />
            <ReportStat label="需处理块" value={String(stats.reviewChunkCount)} />
            <ReportStat label="结构锁定" value={String(stats.protectedTokenCount)} />
            <ReportStat label="表达提示" value={String(stats.machineLikeRiskCount)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">导出前风险</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {riskMessages.length ? riskMessages.map((message) => (
              <Alert key={message}>
                <AlertTitle>需确认</AlertTitle>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            )) : (
              <Alert>
                <AlertTitle>当前稳定</AlertTitle>
                <AlertDescription>当前没有发现需要阻止导出的显著风险。</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">结构保护</CardTitle>
            <CardDescription>{protectedTypeText}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ReportStat label="引用缺失" value={String(stats.missingCitationCount)} />
              <ReportStat label="硬审计" value={String(stats.guardIssueCount)} />
              <ReportStat label="排版预检" value={String(stats.preflightIssueCount)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border bg-muted/50 shadow-none">
      <CardContent className="p-4">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function formatProtectedTypeLabel(key: string): string {
  const labels: Record<string, string> = { REF: "引用", CAP: "图表", EQN: "公式", NUM: "数值", TOK: "结构" };
  return labels[key] ?? key;
}
function NotificationCenter({
  open,
  items,
  taskItems,
  onClose,
  onClear,
}: {
  open: boolean;
  items: AppNotification[];
  taskItems: RuntimeTaskCenterItem[];
  onClose: () => void;
  onClear: () => void;
}) {
  const unreadCount = items.filter((item) => !item.read).length;
  const errorCount = items.filter((item) => item.kind === "error").length;
  const runningTaskCount = taskItems.filter((item) => item.running).length;

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        side="right"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notification-center-title"
        className="flex w-[min(92vw,440px)] flex-col p-0 sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="border-b px-5 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle id="notification-center-title" className="flex items-center gap-2">
                <Bell />
                通知与任务中心
              </SheetTitle>
              <SheetDescription>运行任务、恢复提示和历史通知。</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭通知与任务中心">
              <X data-icon="inline-start" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/50 px-3 py-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant={runningTaskCount ? "warning" : "outline"}>{runningTaskCount} 运行中</Badge>
              {taskItems.length ? <Badge variant="outline">{taskItems.length} 任务</Badge> : null}
              <Badge variant="outline">{items.length} 条</Badge>
              {unreadCount ? <Badge variant="secondary">{unreadCount} 未读</Badge> : null}
              {errorCount ? <Badge variant="warning">{errorCount} 错误</Badge> : null}
            </div>
            <Button variant="outline" size="sm" onClick={onClear} disabled={!items.length}>
              清空
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4">
            <section data-ui-section="runtime-task-center" className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Activity />
                  运行任务
                </div>
                <Badge variant={runningTaskCount ? "warning" : "outline"}>
                  {runningTaskCount ? `${runningTaskCount} 个运行中` : "无运行任务"}
                </Badge>
              </div>

              {taskItems.length ? (
                <div className="flex flex-col gap-3">
                  {taskItems.map((item) => (
                    <Card key={item.id} className={cn("shadow-sm", item.tone === "red" && "border-destructive/30 bg-destructive/5")}>
                      <CardHeader className="px-4 py-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-md border bg-background p-1.5 text-muted-foreground">
                            {item.running ? <Loader2 className="animate-spin" /> : <Clock3 />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <CardTitle className="truncate text-sm">{item.title}</CardTitle>
                                {item.meta ? <CardDescription className="truncate text-xs">{item.meta}</CardDescription> : null}
                              </div>
                              <Badge className="shrink-0" variant="outline">{item.status}</Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
                        <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{item.detail}</p>
                        {item.recoveryHint ? (
                          <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground">
                            下一步：{item.recoveryHint}
                          </div>
                        ) : null}
                        {typeof item.percent === "number" ? (
                          <div className="flex flex-col gap-1">
                            <Progress value={clampPercent(item.percent)} className="h-2" />
                            <div className="text-xs font-medium text-muted-foreground">{clampPercent(item.percent)}%</div>
                          </div>
                        ) : null}
                        {item.onAction || item.onCancel ? (
                          <div className="flex flex-wrap gap-2">
                            {item.onAction && item.actionLabel ? (
                              <Button type="button" variant="outline" size="sm" onClick={item.onAction}>
                                {item.actionLabel}
                              </Button>
                            ) : null}
                            {item.onCancel && item.cancelLabel ? (
                              <Button type="button" variant="destructive" size="sm" onClick={item.onCancel}>
                                {item.cancelLabel}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-[8rem] border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                    <EmptyTitle>当前没有运行或待继续的任务</EmptyTitle>
                    <EmptyDescription>任务恢复信息会出现在这里。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Bell />
                  历史通知
                </div>
                <Badge variant="outline">{items.length} 条</Badge>
              </div>

              {items.length ? (
                <div className="flex flex-col gap-3">
                  {items.map((item) => {
                    const isError = item.kind === "error";
                    return (
                      <Card key={item.id} className={cn("shadow-sm", isError && "border-destructive/30 bg-destructive/5")}>
                        <CardContent className="p-3">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-md border bg-background p-1.5 text-muted-foreground">
                              {isError ? <AlertCircle /> : <CheckCircle2 />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                  {!item.read ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                                  <div className="truncate text-sm font-semibold">{item.title}</div>
                                </div>
                                <div className="shrink-0 text-xs text-muted-foreground">{formatNotificationTime(item.time)}</div>
                              </div>
                              <p className="mt-1 line-clamp-3 text-sm leading-6 text-muted-foreground">{item.text}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <Empty className="min-h-[8rem] border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                    <EmptyTitle>暂无通知</EmptyTitle>
                    <EmptyDescription>完成、失败和提醒会沉淀到这里。</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
