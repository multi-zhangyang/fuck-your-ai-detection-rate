import { Fragment, startTransition, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
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
  Plus,
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

import { HistoryCard } from "@/components/HistoryCard";
import { ModelConfigCard, SchoolFormatCard } from "@/components/ModelConfigCard";
import { ProtectionMapCard } from "@/components/ProtectionMapCard";
import { DiffReviewCard, ResultCard, type DiffFilterMode, type DiffFocusRequest } from "@/components/ResultCard";
import { ThemeModeMenu } from "@/components/ThemeModeMenu";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { useAppState } from "@/hooks/useAppState";
import type { AppService } from "@/lib/appService";
import {
  DEFAULT_PROMPT_SEQUENCE,
  formatPromptSequence,
  getDefaultPromptProfile,
  getPromptFlowSequence,
  getPromptLabel,
  getPromptOptionsFromPreviews,
  getPromptOption,
  getPromptProfileLabel,
  getPromptRoundLimit,
  getPromptSequenceLimit,
  getPromptWorkflowsFromPreviews,
  getRoundModelKey,
  isPromptSequenceCustomizable,
  normalizePromptId,
  normalizePromptProfile,
  normalizePromptSequence,
} from "@/lib/promptRegistry";
import { getTaskPhaseLabel, isTaskBlocking, isTaskRunningPhase, type TaskPhase } from "@/lib/taskState";
import { cn } from "@/lib/utils";
import type { BatchRerunResult, BatchRerunStatus, BatchRerunTarget, DeleteHistoryOptions, DetectionReport, DetectionReportMatch, DetectionReportProvider, DocumentStatus, EnvironmentDiagnostics, ExportResult, FormatParserModelRoute, FormatRules, HistoryArtifactGovernanceMode, HistoryArtifactQueryFilters, HistoryArtifactQueryResponse, HistoryDeleteImpact, HistoryDeleteMode, HistoryDocumentSummary, HistoryOrphanScanResult, HistoryRound, ModelCatalogResult, ModelConfig, ModelProviderConfig, PromptDeleteResult, PromptId, PromptOption, PromptPreviewResponse, PromptSaveResult, PromptWorkflow, RerunChunkResult, ReviewDecision, RoundCompareData, RoundModelConfig, RoundProgress, RoundProgressStatus, RoundResult, RunAuditSummary } from "@/types/app";
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
const MAX_REWRITE_CONCURRENCY = 16;
const REWRITE_CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

function normalizeRewriteConcurrency(value: unknown, fallback = 2): number {
  const fallbackValue = Number(fallback) || 2;
  const normalized = Number(value);
  return Math.max(1, Math.min(MAX_REWRITE_CONCURRENCY, Number.isFinite(normalized) && normalized > 0 ? normalized : fallbackValue));
}

type Props = {
  service: AppService;
};

type WorkbenchView = "home" | "quality" | "model" | "prompts" | "format" | "protection" | "history" | "diagnostics";

const WORKBENCH_NAV_ITEMS = [
  { view: "home", label: "工作台", icon: Home },
  { view: "quality", label: "改写检查", icon: BarChart3 },
  { view: "model", label: "模型配置", icon: Settings },
  { view: "prompts", label: "提示词", icon: FileText },
  { view: "format", label: "学校规范", icon: SlidersHorizontal },
  { view: "protection", label: "保护区地图", icon: ShieldCheck },
  { view: "history", label: "历史记录", icon: History },
  { view: "diagnostics", label: "启动诊断", icon: Activity },
] satisfies Array<{
  view: WorkbenchView;
  label: string;
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
  tone: RuntimeTaskTone;
  running: boolean;
  percent?: number;
  actionLabel?: string;
  onAction?: () => void;
  cancelLabel?: string;
  onCancel?: () => void;
};
type RoundResetTarget = {
  round: number;
  mode: "checkpoint" | "completed";
};

const LOADING_ICON_CLASS_NAME = "animate-spin text-success";
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
  highRiskCount: number;
  failedCount: number;
  preferredFilter: DiffFilterMode;
  preferredChunkId?: string;
};
type DiffFailureLike = {
  chunkId: string;
};

function normalizeStoredPromptSequence(value: unknown): PromptId[] {
  return (Array.isArray(value) ? value : [])
    .map((item) => normalizePromptId(item))
    .filter((item): item is PromptId => item !== null);
}

function readStoredPromptSequence(): PromptId[] {
  try {
    const stored = normalizeStoredPromptSequence(JSON.parse(localStorage.getItem(ACTIVE_PROMPT_SEQUENCE_KEY) || "[]"));
    return stored.length ? stored : DEFAULT_PROMPT_SEQUENCE;
  } catch {
    return DEFAULT_PROMPT_SEQUENCE;
  }
}

function promptSequencesEqual(
  left: PromptId[] | undefined,
  right: PromptId[] | undefined,
  options?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  workflows?: PromptWorkflow[],
): boolean {
  const a = normalizePromptSequence(left, options, promptProfile, workflows);
  const b = normalizePromptSequence(right, options, promptProfile, workflows);
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function promptSequenceCoversSelectedRoute(
  recordSequence: PromptId[] | undefined,
  selectedSequence: PromptId[] | undefined,
  round: number | undefined,
  options?: PromptOption[],
  promptProfile?: ModelConfig["promptProfile"],
  workflows?: PromptWorkflow[],
): boolean {
  const record = normalizePromptSequence(recordSequence, options, promptProfile, workflows);
  const selected = normalizePromptSequence(selectedSequence, options, promptProfile, workflows);
  if (!record.length || !selected.length) {
    return false;
  }
  if (typeof round === "number" && round > record.length) {
    return false;
  }
  return record.length <= selected.length && record.every((item, index) => item === selected[index]);
}

function normalizeActiveModelConfig(config: ModelConfig, options?: PromptOption[], workflows?: PromptWorkflow[]): ModelConfig {
  const promptProfile = normalizePromptProfile(config.promptProfile, workflows) ?? getDefaultPromptProfile(workflows);
  const promptSequence = normalizePromptSequence(config.promptSequence, options, promptProfile, workflows);
  if (
    config.promptProfile === promptProfile
    && promptSequencesEqual(config.promptSequence, promptSequence, options, promptProfile, workflows)
  ) {
    return config;
  }
  return { ...config, promptProfile, promptSequence };
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
  return {
    chunkCount: chunks.length,
    reviewChunkCount: reviewChunks.length,
    missingCitationCount,
    protectedTokenCount,
    machineLikeRiskCount,
    guardIssueCount: exportResult?.guardIssueCount ?? 0,
    preflightIssueCount: exportResult?.preflightIssueCount ?? 0,
    auditIssueCount: exportResult?.auditIssueCount ?? 0,
  };
}

function buildCurrentRunAudit(
  roundResult: RoundResult | null,
  compareData: RoundCompareData | null,
  modelConfig: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): RunAuditSummary {
  const qualitySummary = (roundResult?.qualitySummary ?? compareData?.qualitySummary ?? {}) as NonNullable<RoundResult["qualitySummary"]>;
  const paragraphSplitSummary = compareData?.paragraphSplitSummary ?? qualitySummary.paragraphSplitSummary;
  const chunkCount = compareData?.chunkCount ?? qualitySummary.paragraphSplitSummary?.chunkCount ?? roundResult?.inputSegmentCount ?? null;
  const promptProfile = compareData?.promptProfile ?? modelConfig.promptProfile;
  return {
    ...(roundResult?.runAudit ?? {}),
    promptProfile,
    promptSequence: normalizePromptSequence(compareData?.promptSequence ?? modelConfig.promptSequence, promptOptions, promptProfile, promptWorkflows),
    estimatedApiCalls: qualitySummary.estimatedApiCalls ?? chunkCount,
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

function getAutoRunScopeKeyForStatus(
  status: Pick<DocumentStatus, "sourcePath" | "promptProfile" | "promptSequence">,
  config: Pick<ModelConfig, "promptProfile" | "promptSequence">,
  round: number,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): string {
  const promptProfile = status.promptProfile ?? config.promptProfile;
  const promptSequence = normalizePromptSequence(status.promptSequence ?? config.promptSequence, promptOptions, promptProfile, promptWorkflows);
  return getAutoRunScopeKey(status.sourcePath, { promptProfile, promptSequence }, round);
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

function compareDataMatchesDocument(
  compareData: RoundCompareData | null,
  document: DocumentStatus | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  if (!compareData || !document) {
    return false;
  }
  const comparePromptProfile = normalizePromptProfile(compareData.promptProfile, promptWorkflows) ?? compareData.promptProfile;
  const documentPromptProfile = normalizePromptProfile(document.promptProfile, promptWorkflows) ?? document.promptProfile;
  if (comparePromptProfile !== documentPromptProfile) {
    return false;
  }
  if (
    isPromptSequenceCustomizable(documentPromptProfile, promptWorkflows)
    && !promptSequenceCoversSelectedRoute(
      compareData.promptSequence,
      document.promptSequence,
      compareData.round,
      promptOptions,
      documentPromptProfile,
      promptWorkflows,
    )
  ) {
    return false;
  }
  const compareDocKey = normalizeDetectionDocumentKey(compareData.docId);
  const documentDocKey = normalizeDetectionDocumentKey(document.docId);
  if (compareDocKey && documentDocKey && compareDocKey === documentDocKey) {
    return true;
  }
  const sourceKey = normalizeDetectionDocumentKey(document.sourcePath);
  const inputKey = normalizeDetectionDocumentKey(compareData.inputPath);
  const outputKey = normalizeDetectionDocumentKey(compareData.outputPath);
  const currentInputKey = normalizeDetectionDocumentKey(document.currentInputPath);
  const currentOutputKey = normalizeDetectionDocumentKey(document.currentOutputPath);
  const latestOutputKey = normalizeDetectionDocumentKey(document.latestOutputPath);
  return Boolean(
    (sourceKey && (documentRefsMatch(sourceKey, inputKey) || documentRefsMatch(sourceKey, outputKey)))
    || (currentInputKey && documentRefsMatch(currentInputKey, inputKey))
    || (currentOutputKey && documentRefsMatch(currentOutputKey, outputKey))
    || (latestOutputKey && documentRefsMatch(latestOutputKey, outputKey))
  );
}

function persistActiveDocument(
  sourcePath: string,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[] = DEFAULT_PROMPT_SEQUENCE,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
) {
  localStorage.setItem(ACTIVE_DOCUMENT_KEY, sourcePath);
  localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, promptProfile);
  localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows)));
}

function readAutoSnapshotSuppression(): AutoSnapshotSuppression | null {
  try {
    const raw = localStorage.getItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<AutoSnapshotSuppression>;
    const promptProfile = String(parsed.promptProfile ?? "").trim().toLowerCase();
    if (!parsed.sourcePath || !promptProfile) {
      localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
      return null;
    }
    return {
      sourcePath: parsed.sourcePath,
      docId: parsed.docId ?? "",
      promptProfile,
      promptSequence: normalizeStoredPromptSequence(parsed.promptSequence),
      round: typeof parsed.round === "number" ? parsed.round : null,
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : "",
    };
  } catch {
    localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
    return null;
  }
}

function suppressAutoSnapshotRestore(
  status: DocumentStatus,
  config: ModelConfig,
  round: number | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
) {
  const payload: AutoSnapshotSuppression = {
    sourcePath: status.sourcePath,
    docId: status.docId,
    promptProfile: config.promptProfile,
    promptSequence: normalizePromptSequence(config.promptSequence, promptOptions, config.promptProfile, promptWorkflows),
    round,
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(AUTO_SNAPSHOT_SUPPRESSION_KEY, JSON.stringify(payload));
}

function clearAutoSnapshotSuppression() {
  localStorage.removeItem(AUTO_SNAPSHOT_SUPPRESSION_KEY);
}

function shouldSuppressAutoSnapshotRestore(
  status: DocumentStatus,
  config: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const suppression = readAutoSnapshotSuppression();
  if (!suppression) {
    return false;
  }
  return (
    suppression.promptProfile === config.promptProfile
    && promptSequencesEqual(suppression.promptSequence, config.promptSequence, promptOptions, config.promptProfile, promptWorkflows)
    && (
      documentRefsMatch(suppression.sourcePath, status.sourcePath)
      || documentRefsMatch(suppression.docId, status.docId)
    )
  );
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
    return isFailedOutputDecision(decision) ? decision.confirmed === true : true;
  }
  return decision === "rewrite_confirmed" || decision === "source_confirmed";
}

function isFailedOutputDecision(decision: ReviewDecision): boolean {
  return typeof decision === "object" && decision.source === "failed_output";
}

function isHighRiskFailedOutputChunk(chunk: RoundCompareData["chunks"][number]): boolean {
  const flags = chunk.quality?.flags ?? [];
  const hasFailedOutput = (chunk.failedAttempts ?? []).some((attempt) => typeof attempt?.outputText === "string" && attempt.outputText.trim());
  const hasHardValidationFallback = chunk.fallbackMode === "source"
    || flags.includes("source_fallback")
    || flags.includes("targeted_rerun_fallback")
    || chunk.rerunStatus === "fallback"
    || Boolean(chunk.rerunFallbackMode);
  return Boolean(hasFailedOutput && hasHardValidationFallback);
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
      highRiskCount: 0,
      failedCount: 0,
      preferredFilter: "all",
    };
  }
  const failedChunkIds = failures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId);
  const failedChunkIdSet = new Set(failedChunkIds);
  const highRiskChunkIds = compareData.chunks
    .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]))
    .map((chunk) => chunk.chunkId);
  const highRiskChunkIdSet = new Set(highRiskChunkIds);
  const reviewChunkIds = compareData.chunks
    .filter((chunk) => {
      const flags = chunk.quality?.flags ?? [];
      const reportMatches = matchesByChunk[chunk.chunkId] ?? [];
      return !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
        || chunk.fallbackMode === "source"
        || flags.includes("source_fallback")
        || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review"));
    })
    .map((chunk) => chunk.chunkId);
  const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : highRiskChunkIds.length ? "highRisk" : reviewChunkIds.length ? "review" : "all";
  return {
    chunkCount: compareData.chunkCount ?? compareData.chunks.length,
    reviewCount: reviewChunkIds.length,
    highRiskCount: highRiskChunkIds.length,
    failedCount: failedChunkIds.length,
    preferredFilter,
    preferredChunkId: failedChunkIds[0] ?? highRiskChunkIds[0] ?? reviewChunkIds[0],
  };
}

function formatDiffDashboardLabel(stats: DiffDashboardStats): string {
  if (!stats.chunkCount) {
    return "未生成";
  }
  const parts = [`${stats.chunkCount} 块`];
  if (stats.reviewCount) parts.push(`${stats.reviewCount} 需处理`);
  if (stats.highRiskCount) parts.push(`${stats.highRiskCount} 高风险`);
  if (stats.failedCount) parts.push(`${stats.failedCount} 失败`);
  if (parts.length === 1) parts.push("已稳定");
  return parts.join(" · ");
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
  failedAttempts?: RoundCompareData["chunks"][number]["failedAttempts"];
  rerunStatus?: string;
  rerunFallbackMode?: string;
  rerunFallbackError?: string;
  quality?: RoundCompareData["chunks"][number]["quality"];
  scopeKey?: string;
};

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function extractRerunFailureExtras(error: unknown): Partial<BatchRerunFailure> {
  const payload = asPlainRecord((error as { payload?: unknown } | null)?.payload);
  const failure = asPlainRecord(payload?.failure);
  if (!failure) {
    return {};
  }
  const quality = asPlainRecord(failure.quality) as BatchRerunFailure["quality"] | null;
  const failedAttempts = Array.isArray(failure.failedAttempts) ? failure.failedAttempts as BatchRerunFailure["failedAttempts"] : undefined;
  return {
    ...(failedAttempts ? { failedAttempts } : {}),
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

function isPromptProfile(value: unknown, workflows?: PromptWorkflow[]): value is ModelConfig["promptProfile"] {
  return Boolean(normalizePromptProfile(value, workflows));
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

function historyRoundMatchesPrompt(
  roundItem: HistoryRound,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[],
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  const plannedRounds = getPlannedRoundCount({ promptProfile, promptSequence }, promptOptions, promptWorkflows);
  if (roundItem.round < 1 || roundItem.round > plannedRounds) {
    return false;
  }
  if ((roundItem.promptProfile || "cn") !== promptProfile) {
    return false;
  }
  if (!isPromptSequenceCustomizable(promptProfile, promptWorkflows)) {
    return true;
  }
  return promptSequenceCoversSelectedRoute(roundItem.promptSequence, promptSequence, roundItem.round, promptOptions, promptProfile, promptWorkflows);
}

function getLatestHistoryRound(
  item: HistoryDocumentSummary,
  promptProfile: ModelConfig["promptProfile"],
  promptSequence: PromptId[],
  allowProfileFallback: boolean,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): HistoryRound | null {
  const profileRound = sortHistoryRounds(
    item.rounds.filter((roundItem) => historyRoundMatchesPrompt(roundItem, promptProfile, promptSequence, promptOptions, promptWorkflows)),
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

function getPreferredHistoryRound(item: HistoryDocumentSummary): HistoryRound | null {
  const latestByOutput = item.rounds.find((roundItem) => roundItem.outputPath && roundItem.outputPath === item.latestOutputPath);
  return latestByOutput ?? sortHistoryRounds(item.rounds, "timestamp")[0] ?? null;
}

function buildConfigForHistorySelection(
  item: HistoryDocumentSummary,
  fallbackConfig: ModelConfig,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): ModelConfig {
  const preferredRound = getPreferredHistoryRound(item);
  const promptProfile = isPromptProfile(preferredRound?.promptProfile, promptWorkflows)
    ? preferredRound.promptProfile
    : fallbackConfig.promptProfile;
  const promptSequence = isPromptSequenceCustomizable(promptProfile, promptWorkflows)
    ? normalizePromptSequence(preferredRound?.promptSequence ?? fallbackConfig.promptSequence, promptOptions, promptProfile, promptWorkflows)
    : normalizePromptSequence(fallbackConfig.promptSequence, promptOptions, promptProfile, promptWorkflows);
  return { ...fallbackConfig, promptProfile, promptSequence };
}

function resolveRestoredPromptProfile(
  storedPromptProfile: string | null,
  matchedItem: HistoryDocumentSummary | undefined,
  fallbackProfile: ModelConfig["promptProfile"],
  promptWorkflows?: PromptWorkflow[],
): ModelConfig["promptProfile"] {
  const defaultProfile = getDefaultPromptProfile(promptWorkflows);
  if (isPromptProfile(storedPromptProfile, promptWorkflows)) {
    if (storedPromptProfile === defaultProfile || isPromptSequenceCustomizable(storedPromptProfile, promptWorkflows)) {
      return storedPromptProfile;
    }
    if (matchedItem?.rounds.some((roundItem) => (roundItem.promptProfile || "cn") === storedPromptProfile)) {
      return storedPromptProfile;
    }
  }
  const latestRound = matchedItem ? sortHistoryRounds(matchedItem.rounds, "timestamp")[0] : null;
  return isPromptProfile(latestRound?.promptProfile, promptWorkflows) ? latestRound.promptProfile : fallbackProfile;
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
  return progress.completedChunks ?? progress.currentChunk ?? 0;
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
  if (!next.totalChunks && current.totalChunks && next.round === current.round) {
    return {
      ...current,
      ...next,
      currentChunk: next.currentChunk ?? current.currentChunk,
      totalChunks: current.totalChunks,
      completedChunks: next.completedChunks ?? current.completedChunks,
      activeChunks: next.activeChunks ?? current.activeChunks,
      queuedChunks: next.queuedChunks ?? current.queuedChunks,
      concurrency: next.concurrency ?? current.concurrency,
      configuredConcurrency: next.configuredConcurrency ?? current.configuredConcurrency,
      estimatedApiCalls: next.estimatedApiCalls ?? current.estimatedApiCalls,
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

function createCheckpointProgress(status: RoundProgressStatus | null, configuredConcurrency?: number): RoundProgress | null {
  if (!status?.canResume || !status.round) {
    return null;
  }
  const seededConcurrency = normalizeRewriteConcurrency(
    configuredConcurrency ?? status.activeRun?.lastEvent?.configuredConcurrency ?? status.activeRun?.lastEvent?.concurrency,
  );
  return {
    phase: "resuming-from-checkpoint",
    round: status.round,
    currentChunk: status.completedChunks,
    completedChunks: status.completedChunks,
    totalChunks: status.totalChunks || undefined,
    concurrency: status.activeRun?.lastEvent?.concurrency ?? seededConcurrency,
    configuredConcurrency: seededConcurrency,
    checkpointPath: status.checkpointPath,
    error: status.lastError || undefined,
    nextChunkId: status.nextChunkId,
    nextChunkIndex: status.nextChunkIndex,
    remainingChunks: status.remainingChunks,
    resumeStage: status.resumeStage,
    resumeActionLabel: status.resumeActionLabel,
    resumeExplanation: status.resumeExplanation,
    estimatedApiCalls: status.totalChunks || undefined,
  };
}

function sameWorkspacePath(left: string | undefined | null, right: string | undefined | null): boolean {
  const normalize = (value: string | undefined | null) => String(value || "").replace(/\\/g, "/").toLowerCase();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}


function formatProviderErrorBrief(progress: RoundProgress): string {
  const category = String(progress.errorCategory || "").trim();
  const statusCode = progress.statusCode ? `HTTP ${progress.statusCode}` : "";
  const attempts = progress.attempts ? `${progress.attempts}${progress.maxAttempts ? `/${progress.maxAttempts}` : ""} 次` : "";
  const cooldown = progress.cooldownSeconds ? `冷却 ${Math.ceil(Number(progress.cooldownSeconds) || 0)}s` : "";
  const label = category === "rate_limit"
    ? "限流"
    : category === "server"
      ? "服务端异常"
      : category === "timeout"
        ? "超时"
        : category === "network"
          ? "网络异常"
          : category === "auth"
            ? "鉴权失败"
            : category === "endpoint"
              ? "接口不匹配"
              : category === "response_parse"
                ? "响应解析失败"
                : "";
  return [label, statusCode, attempts, cooldown].filter(Boolean).join("，");
}


function formatRuntimeStep(progress: RoundProgress | null, fallback: string): string {
  if (!progress) {
    return fallback;
  }
  const completedChunks = progress.completedChunks ?? (progress.phase === "chunk-complete" ? progress.currentChunk : 0) ?? 0;
  const remainingChunks = progress.totalChunks ? Math.max(0, progress.totalChunks - completedChunks) : 0;
  const configuredConcurrency = progress.configuredConcurrency ?? progress.concurrency;
  const concurrencyText = progress.concurrency
    ? `，并发 ${progress.concurrency}${configuredConcurrency && configuredConcurrency !== progress.concurrency ? `/${configuredConcurrency}` : ""}`
    : "";
  if (progress.phase === "chunking-ready" && progress.totalChunks) {
    const estimateText = progress.estimatedApiCalls
      ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用`
      : "";
    return `已完成切块，共 ${progress.totalChunks} 个分块${estimateText}${concurrencyText}。`;
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
  if (progress.phase === "processing-chunk" && progress.totalChunks) {
    const callText = progress.estimatedApiCalls ? `，预计约 ${progress.estimatedApiCalls} 次 API 调用` : "";
    return `正在执行第 ${progress.round} 轮，已完成 ${completedChunks}/${progress.totalChunks}，剩余 ${remainingChunks}${concurrencyText}${callText}。`;
  }
  if (progress.phase === "provider-retry-wait") {
    const retryDelay = Math.ceil(Number(progress.retryDelaySeconds ?? 0) || 0);
    const retryText = progress.attempts && progress.maxAttempts ? `第 ${progress.attempts}/${progress.maxAttempts} 次失败` : "请求失败";
    const statusText = progress.statusCode ? `HTTP ${progress.statusCode}` : formatProviderErrorBrief(progress);
    return `分块 ${progress.chunkId || "-"} 上游${statusText ? ` ${statusText}` : ""}，${retryText}，${retryDelay}s 后重试。`;
  }
  if (progress.phase === "chunk-complete" && progress.totalChunks) {
    return `第 ${progress.round} 轮已完成 ${completedChunks}/${progress.totalChunks} 个分块。`;
  }
  if (progress.phase === "chunk-failed" && progress.totalChunks) {
    const errorBrief = formatProviderErrorBrief(progress);
    return `第 ${progress.round} 轮有分块失败，已完成 ${completedChunks}/${progress.totalChunks} 个分块${errorBrief ? `；${errorBrief}` : ""}。`;
  }
  if (progress.phase === "cancel-requested") {
    return "正在中断当前轮次，已完成分块会保留。";
  }
  if (progress.phase === "restoring-output") {
    return `第 ${progress.round} 轮分块处理完成，正在合并输出。`;
  }
  return fallback;
}

function describePromptProfile(promptProfile: ModelConfig["promptProfile"], promptWorkflows?: PromptWorkflow[]): string {
  return getPromptProfileLabel(promptProfile, promptWorkflows);
}

function getPlannedRoundCount(config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): number {
  return getPromptFlowSequence(config.promptProfile, config.promptSequence, promptOptions, promptWorkflows).length;
}

function isManualContinuationRound(status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): boolean {
  return Boolean(status.hasNextRound && status.nextRound && status.nextRound > getPlannedRoundCount(config, promptOptions, promptWorkflows));
}

function getRoundResetTarget(
  status: DocumentStatus | null,
  checkpoint: RoundProgressStatus | null,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): RoundResetTarget | null {
  if (!status) {
    return null;
  }
  const checkpointMatches = Boolean(
    checkpoint?.canResume
    && checkpoint.round
    && status.nextRound
    && checkpoint.round === status.nextRound
    && sameWorkspacePath(checkpoint.sourcePath, status.sourcePath)
    && checkpoint.promptProfile === status.promptProfile
    && promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows),
  );
  if (checkpointMatches && checkpoint?.round) {
    return { round: checkpoint.round, mode: "checkpoint" };
  }
  const completedRounds = (status.completedRounds ?? [])
    .filter((round): round is number => Number.isFinite(round))
    .sort((left, right) => left - right);
  const latestCompletedRound = completedRounds[completedRounds.length - 1];
  if (latestCompletedRound) {
    return { round: latestCompletedRound, mode: "completed" };
  }
  return status.nextRound ? { round: status.nextRound, mode: "checkpoint" } : null;
}

function roundCheckpointMatchesDocument(
  checkpoint: RoundProgressStatus | null | undefined,
  status: DocumentStatus | null | undefined,
  promptOptions?: PromptOption[],
  promptWorkflows?: PromptWorkflow[],
): boolean {
  return Boolean(
    checkpoint?.canResume
    && checkpoint.round
    && status?.nextRound
    && checkpoint.round === status.nextRound
    && sameWorkspacePath(checkpoint.sourcePath, status.sourcePath)
    && checkpoint.promptProfile === status.promptProfile
    && promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows),
  );
}

function describeDocumentProgress(status: Pick<DocumentStatus, "nextRound" | "hasNextRound" | "plannedRounds">, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    const plannedRounds = status.plannedRounds ?? getPlannedRoundCount(config, promptOptions, promptWorkflows);
    if (status.nextRound > plannedRounds) {
      return "流程已完成，可导出。";
    }
    return status.nextRound > 1 ? `可继续第 ${status.nextRound} 轮。` : `可执行第 ${status.nextRound} 轮。`;
  }
  return "流程已完成，可导出。";
}

function formatDocumentLoadStep(prefix: string, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  return `${prefix}；${describeDocumentProgress(status, config, promptOptions, promptWorkflows)}`;
}

function formatRoundCompleteStep(round: number, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    return isManualContinuationRound(status, config, promptOptions, promptWorkflows)
      ? `第 ${round} 轮已完成，可导出。`
      : `第 ${round} 轮已完成，可继续第 ${status.nextRound} 轮。`;
  }
  return `第 ${round} 轮已完成，可导出。`;
}

function formatRoundCompleteNotice(round: number, status: DocumentStatus, config: Pick<ModelConfig, "promptProfile" | "promptSequence">, promptOptions?: PromptOption[], promptWorkflows?: PromptWorkflow[]): string {
  if (status.hasNextRound && status.nextRound) {
    return isManualContinuationRound(status, config, promptOptions, promptWorkflows)
      ? `第 ${round} 轮已完成，可以直接导出。`
      : `第 ${round} 轮已完成，可继续第 ${status.nextRound} 轮。`;
  }
  return `第 ${round} 轮已完成，可以直接导出。`;
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
    if (!Array.isArray(parsed)) {
      return [];
    }
    const normalized = dedupeNotifications(parsed).slice(0, 80);
    if (normalized.length !== parsed.length) {
      localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

function saveNotificationHistory(items: AppNotification[]) {
  try {
    localStorage.setItem(NOTIFICATION_HISTORY_KEY, JSON.stringify(dedupeNotifications(items).slice(0, 80)));
  } catch {
    // Notification history is non-critical; the live in-memory notice still remains visible.
  }
}

function getNotificationKey(item: Pick<AppNotification, "kind" | "text">): string {
  return `${item.kind}:${item.text.trim()}`;
}

function isRawHtmlErrorText(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<!doctype html")
    || lowered.includes("<html")
    || lowered.includes("405 method not allowed")
    || lowered.includes("method not allowed</title>")
    || text.includes("本地后端接口方法不匹配（HTTP 405）")
    || text.includes("本地后端还没有加载提示词接口");
}

function dedupeNotifications(items: AppNotification[]): AppNotification[] {
  const seen = new Set<string>();
  const normalized: AppNotification[] = [];
  for (const item of items) {
    const text = typeof item?.text === "string" ? item.text.trim() : "";
    if (!text || isRawHtmlErrorText(text)) {
      continue;
    }
    const safeItem = { ...item, text };
    const key = getNotificationKey(safeItem);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(safeItem);
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

function getProgressPercent(progress: RoundProgress | null, completedRounds: number, plannedRounds: number): number {
  if (progress?.totalChunks) {
    const current = progress.currentChunk ?? progress.completedChunks ?? 0;
    return Math.max(6, Math.min(100, Math.round((current / progress.totalChunks) * 100)));
  }
  if (plannedRounds > 0) {
    return Math.round((Math.min(completedRounds, plannedRounds) / plannedRounds) * 100);
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

function getErrorRecoveryPlan(message: string): { target: WorkbenchView; actionLabel: string; tone: RuntimeTaskTone } {
  const lowered = message.toLowerCase();
  if (message.includes("中断") || message.includes("断点") || message.includes("Unknown run id") || message.includes("运行通道")) {
    return {
      target: "home",
      actionLabel: "回主页续跑",
      tone: "blue",
    };
  }
  if (message.includes("模型配置") || message.includes("接口") || message.includes("API Key") || message.includes("Base URL") || lowered.includes("model")) {
    return {
      target: "model",
      actionLabel: "检查模型配置",
      tone: "amber",
    };
  }
  if (message.includes("学校") || message.includes("规范") || message.includes("解析")) {
    return {
      target: "format",
      actionLabel: "查看学校规范",
      tone: "amber",
    };
  }
  if (message.includes("报告") || message.includes("PDF") || message.includes("PaperPass") || message.includes("SpeedAI")) {
    return {
      target: "home",
      actionLabel: "回主页看报告",
      tone: "amber",
    };
  }
  if (message.includes("导出") || message.includes("Word") || message.includes("审计")) {
    return {
      target: "quality",
      actionLabel: "查看改写检查",
      tone: "red",
    };
  }
  return {
    target: "diagnostics",
    actionLabel: "查看诊断",
    tone: "red",
  };
}

function stringifyError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const lowered = rawMessage.toLowerCase();

  if (isRawHtmlErrorText(rawMessage)) {
    return lowered.includes("405") || lowered.includes("method not allowed")
      ? "本地后端接口方法不匹配（HTTP 405）。通常是前后端版本或请求方式不一致；刷新页面后再试，如果还出现就重启本地 Web 服务。"
      : "本地后端返回了 HTML 错误页。通常是前后端版本不一致或服务未正确接到 API；请刷新页面并重启本地 Web 服务。";
  }
  if (rawMessage.includes("This document already has a running task")) {
    return "当前文档已经有任务在运行。等这一轮结束后再继续，避免把状态冲乱。";
  }
  if (rawMessage.includes("Model configuration is incomplete")) {
    return "模型配置还没填完整。请补全接口地址、API Key 和模型名称。";
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

function isDiscardableRestoreError(message: string): boolean {
  return message.includes("Source file must stay under allowed workspace directories")
    || message.includes("sourcePath must stay under allowed workspace directories")
    || message.includes("Source path is required")
    || message.includes("sourcePath is required");
}

function formatExportError(error: unknown): string {
  const message = stringifyError(error);
  if (message.includes("Output file does not exist") || message.includes("No such file or directory")) {
    return "导出失败：这条历史记录指向的项目输出文件已经不存在。请在历史记录里修复索引或清理缺失资产；如果这是当前文档，就重新执行对应轮次。";
  }
  if (message.includes("Output path must stay under allowed workspace directories") || message.includes("Output file must stay under allowed workspace directories")) {
    return "导出被拦截：输出路径不在项目生成目录内。请从历史记录重新切换到该文档，或重新执行轮次后再导出。";
  }
  if (message.includes("Output path is not a file")) {
    return "导出失败：输出路径不是文件。请清理这条异常历史记录后重新执行轮次。";
  }
  if (message.includes("Permission denied") || message.includes("Access is denied") || message.includes("另一个程序正在使用")) {
    return "导出失败：目标文件可能被 Word 或系统占用。请关闭已打开的导出文件后再试。";
  }
  if (message.includes("当前轮次正文段落数与原始 Word 快照不一致")) {
    return `${message} 请先回到历史记录确认当前轮次，必要时回滚本轮后重跑。`;
  }
  if (message.includes("审计发现保护区内容发生变化")) {
    return `${message} 系统已经阻止下载，避免目录、表格、参考文献或其他保护区被误改。请查看生成的 audit.json 报告，或回滚后重新执行当前轮次。`;
  }
  if (message.includes("排版规则意外改变了文档文本内容")) {
    return `${message} 系统已经阻止下载。建议恢复默认规范，或检查学校说明文档解析结果。`;
  }
  return message;
}

export function App({ service }: Props) {
  const progressUnlistenRef = useRef<null | (() => void | Promise<void>)>(null);
  const liveCompareRef = useRef<RoundCompareData | null>(null);
  const visibleProgressRef = useRef<RoundProgress | null>(null);
  const reviewSaveTimerRef = useRef<number | null>(null);
  const restoredDocumentRef = useRef(false);
  const attachedRunTokenRef = useRef<string | null>(null);
  const runSessionRef = useRef<RunSession | null>(null);
  const batchRerunSessionRef = useRef<BatchRerunSession | null>(null);
  const runSessionSequenceRef = useRef(0);
  const roundProgressRequestRef = useRef(0);
  const autoRetryCountsRef = useRef<Record<string, number>>({});
  const latestDocumentStatusRef = useRef<DocumentStatus | null>(null);
  const latestModelConfigRef = useRef<ModelConfig | null>(null);
  const autoSnapshotRestoreKeyRef = useRef("");
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
  const [detectionMatches, setDetectionMatches] = useState<DetectionReportMatch[]>([]);
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewResponse | null>(null);
  const [promptPreviewBusy, setPromptPreviewBusy] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState("");
  const [activePromptPreviewId, setActivePromptPreviewId] = useState<PromptId>("prewrite");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [historyOrphanScan, setHistoryOrphanScan] = useState<HistoryOrphanScanResult | null>(null);
  const [historyArtifactMode, setHistoryArtifactMode] = useState<HistoryArtifactGovernanceMode>("missing");
  const [historyArtifactQuery, setHistoryArtifactQuery] = useState<HistoryArtifactQueryResponse | null>(null);
  const [historyArtifactLoading, setHistoryArtifactLoading] = useState(false);
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
    scopeDiagnostics,
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
    setScopeDiagnostics,
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
  const promptOptions = useMemo(() => getPromptOptionsFromPreviews(promptPreviews), [promptPreviews]);
  const promptWorkflows = useMemo(() => getPromptWorkflowsFromPreviews(promptPreviews, promptOptions), [promptPreviews, promptOptions]);

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
    () => compareDataMatchesDocument(compareData, documentStatus, promptOptions, promptWorkflows) ? compareData : null,
    [compareData, documentStatus, promptOptions, promptWorkflows],
  );

  useEffect(() => {
    let canceled = false;
    const outputPath = activeCompareData?.outputPath;
    if (!detectionReport || !outputPath) {
      setDetectionMatches([]);
      return () => {
        canceled = true;
      };
    }
    service.buildDetectionMatches(outputPath, detectionReport)
      .then((matches) => {
        if (!canceled) {
          setDetectionMatches(matches);
        }
      })
      .catch((appError) => {
        if (!canceled) {
          setDetectionMatches([]);
          setNotice(`检测报告匹配失败：${stringifyError(appError)}`);
        }
      });
    return () => {
      canceled = true;
    };
  }, [activeCompareData, detectionReport, service, setNotice]);

  const detectionMatchesByChunk = useMemo(() => groupDetectionMatchesByChunk(detectionMatches), [detectionMatches]);
  const activeRerunFailureScopeKey = useMemo(() => getRerunFailureScopeKey(activeCompareData), [activeCompareData]);
  const activeRerunFailures = useMemo(() => {
    if (!activeRerunFailureScopeKey) {
      return [];
    }
    const activeChunkIds = new Set(activeCompareData?.chunks.map((chunk) => chunk.chunkId) ?? []);
    return rerunFailures.filter((failure) => failure.scopeKey === activeRerunFailureScopeKey && activeChunkIds.has(failure.chunkId));
  }, [activeCompareData, activeRerunFailureScopeKey, rerunFailures]);
  const diffDashboardStats = useMemo(
    () => buildDiffDashboardStats(activeCompareData, activeRerunFailures, detectionMatchesByChunk, reviewDecisions),
    [activeCompareData, activeRerunFailures, detectionMatchesByChunk, reviewDecisions],
  );
  useEffect(() => {
    if (!activeCompareData?.chunks.length) {
      return;
    }
    setReviewDecisions((current) => {
      const next = { ...buildDefaultReviewDecisions(activeCompareData), ...normalizeSavedReviewDecisionsForCompare(activeCompareData, current) };
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
    if (error && isRawHtmlErrorText(error)) {
      setError("");
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

  function clearPendingAutoActionForManualContextChange() {
    const pending = pendingAutoActionRef.current;
    if (pending?.scopeKey) {
      clearAutoRetryScope(pending.scopeKey);
    }
    setPendingAutoAction(null);
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
    if (isManualContinuationRound(status, config, promptOptions, promptWorkflows)) {
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

    const activeConfig = latestModelConfigRef.current ?? modelConfig;
    try {
      status = await refreshDocumentState(action.sourcePath, activeConfig);
    } catch {
      // Keep the countdown decision visible; the manual run button can retry the refresh path.
    }

    if (status) {
      const activeScopeKey = getAutoRunScopeKeyForStatus(status, activeConfig, action.round, promptOptions, promptWorkflows);
      if (activeScopeKey !== action.scopeKey) {
        setPendingAutoAction((current) => (current?.id === action.id ? null : current));
        setNotice("文档或改写流程已变化，已取消本次自动执行。");
        return;
      }
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
    return Object.fromEntries(data.chunks.map((chunk) => {
      return [chunk.chunkId, (isHighRiskFailedOutputChunk(chunk) ? "source" : "rewrite") as ReviewDecision];
    }));
  }

  function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision {
    const chunk = data.chunks.find((item) => item.chunkId === chunkId);
    return chunk && isHighRiskFailedOutputChunk(chunk) ? "source" : "rewrite";
  }

  function normalizeSavedReviewDecisions(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    return Object.fromEntries(
      Object.entries(decisions).map(([chunkId, decision]) => {
        if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
          if (isFailedOutputDecision(decision) && decision.confirmed !== true) {
            return [chunkId, "source" as ReviewDecision];
          }
          return [chunkId, decision];
        }
        if (decision === "source") return [chunkId, "source" as ReviewDecision];
        if (decision === "source_confirmed") return [chunkId, "source_confirmed" as ReviewDecision];
        if (decision === "rewrite_confirmed") return [chunkId, "rewrite_confirmed" as ReviewDecision];
        return [chunkId, "rewrite" as ReviewDecision];
      }),
    );
  }

  function normalizeSavedReviewDecisionsForCompare(data: RoundCompareData | null, decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    const normalized = normalizeSavedReviewDecisions(decisions);
    if (!data?.chunks.length) {
      return normalized;
    }
    const validChunkIds = new Set(data.chunks.map((chunk) => chunk.chunkId));
    return Object.fromEntries(Object.entries(normalized).filter(([chunkId]) => validChunkIds.has(chunkId)));
  }

  function normalizeReviewDecisionsForSave(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    return Object.fromEntries(
      Object.entries(decisions).flatMap(([chunkId, decision]) => {
        if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
          if (isFailedOutputDecision(decision) && decision.confirmed !== true) {
            return [];
          }
          return [[chunkId, decision] as const];
        }
        if (decision === "source_confirmed") {
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
    if (!config.baseUrl.trim() || !config.apiKey.trim()) {
      throw new Error("Please fill Base URL and API Key first.");
    }

    return service.listModels(config, signal);
  }

  useEffect(() => {
    let cancelled = false;

    async function bootstrapConfig() {
      try {
        const loadedConfig = await service.loadModelConfig();
        let loadedPrompts: PromptPreviewResponse | null = null;
        try {
          loadedPrompts = await service.getPromptPreviews();
        } catch {
          loadedPrompts = null;
        }
        const loadedPromptOptions = getPromptOptionsFromPreviews(loadedPrompts);
        const loadedPromptWorkflows = getPromptWorkflowsFromPreviews(loadedPrompts, loadedPromptOptions);
        const config = normalizeActiveModelConfig(loadedConfig, loadedPromptOptions, loadedPromptWorkflows);
        if (cancelled) {
          return;
        }
        if (loadedPrompts) {
          setPromptPreviews(loadedPrompts);
        }
        setModelConfig(config);
        if (config.baseUrl && config.apiKey) {
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
        try {
          const artifactResult = await service.queryHistoryArtifacts({ exists: "missing", limit: 8 });
          if (!cancelled) {
            setHistoryArtifactQuery(artifactResult);
          }
        } catch {
          if (!cancelled) {
            setHistoryArtifactQuery(null);
          }
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
    if (!storedSourcePath) {
      restoredDocumentRef.current = true;
      return;
    }
    const matchedItem = historyItems.find((item) => item.sourcePath === storedSourcePath || item.originPath === storedSourcePath || item.docId === storedSourcePath);
    const sourcePath = matchedItem?.sourcePath || storedSourcePath;
    if (!sourcePath) {
      restoredDocumentRef.current = true;
      return;
    }

    restoredDocumentRef.current = true;
    const safeProfile = resolveRestoredPromptProfile(storedPromptProfile, matchedItem, modelConfig.promptProfile, promptWorkflows);
    const nextSequence = isPromptSequenceCustomizable(safeProfile, promptWorkflows)
      ? normalizePromptSequence(storedPromptSequence, promptOptions, safeProfile, promptWorkflows)
      : normalizePromptSequence(modelConfig.promptSequence, promptOptions, safeProfile, promptWorkflows);
    const nextConfig = { ...modelConfig, promptProfile: safeProfile, promptSequence: nextSequence };
    if (nextConfig.promptProfile !== modelConfig.promptProfile || !promptSequencesEqual(nextConfig.promptSequence, modelConfig.promptSequence, promptOptions, safeProfile, promptWorkflows)) {
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
        if (shouldSuppressAutoSnapshotRestore(status, nextConfig, promptOptions, promptWorkflows)) {
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
        const loadedPromptProfile = isPromptProfile(loadedProfile, promptWorkflows) ? loadedProfile : nextConfig.promptProfile;
        const loadedSequence = normalizePromptSequence(
          loadedSnapshot?.round?.promptSequence ?? loadedSnapshot?.compareData.promptSequence ?? nextConfig.promptSequence,
          promptOptions,
          loadedPromptProfile,
          promptWorkflows,
        );
        if (
          isPromptProfile(loadedProfile, promptWorkflows)
          && (loadedProfile !== nextConfig.promptProfile || !promptSequencesEqual(loadedSequence, nextConfig.promptSequence, promptOptions, loadedPromptProfile, promptWorkflows))
        ) {
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
        const message = stringifyError(appError);
        if (isDiscardableRestoreError(message)) {
          setNotice("已跳过不可用的上次文档记录，请重新上传或从历史记录中手动选择可用文档。");
        } else {
          setError(message);
        }
        localStorage.removeItem(ACTIVE_DOCUMENT_KEY);
        setRuntimeStep("恢复上次文档失败");
      } finally {
        finishTask(taskTicket);
      }
    })();
  }, [documentStatus, historyItems, historyListReady, modelConfig, modelConfigReady, promptOptions, promptWorkflows, setError, setModelConfig]);

  async function refreshDocumentState(sourcePath: string, config = modelConfig) {
    const [status, nextHistory, nextProtectionMap, nextScopeDiagnostics] = await Promise.all([
      service.getDocumentStatus(sourcePath, config),
      service.getDocumentHistory(sourcePath),
      service.getDocumentProtectionMap(sourcePath),
      service.getDocumentScopeDiagnostics(sourcePath),
    ]);
    setDocumentStatus(status);
    setHistory(nextHistory);
    setProtectionMap(nextProtectionMap);
    setScopeDiagnostics(nextScopeDiagnostics);
    setDetectionReport(loadStoredDetectionReportForDocument(status.sourcePath, status.docId));
    persistActiveDocument(status.sourcePath, status.promptProfile, status.promptSequence ?? config.promptSequence, promptOptions, promptWorkflows);
    await refreshRoundProgressStatus(status, config);
    return status;
  }

  async function handleRefreshCurrentDocumentStatus() {
    if (!documentStatus?.sourcePath) {
      setNotice("请先上传或选择一篇文档。");
      return;
    }
    const refreshConfig = normalizeActiveModelConfig(latestModelConfigRef.current ?? modelConfig, promptOptions, promptWorkflows);
    const taskTicket = beginTask("diagnosing", {
      runtimeStep: "正在刷新轮次状态。",
    });
    try {
      const status = await refreshDocumentState(documentStatus.sourcePath, refreshConfig);
      const message = formatDocumentLoadStep("状态已刷新", status, refreshConfig, promptOptions, promptWorkflows);
      setRuntimeStep(message);
      setNotice(message);
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("刷新状态失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function refreshRoundProgressStatus(status = documentStatus, config = modelConfig) {
    const requestId = roundProgressRequestRef.current + 1;
    roundProgressRequestRef.current = requestId;
    if (!status?.sourcePath || !status.hasNextRound || !status.nextRound) {
      if (requestId === roundProgressRequestRef.current) {
        setRoundProgressStatus(null);
      }
      return null;
    }
    const statusPromptProfile = status.promptProfile ?? config.promptProfile;
    const statusPromptSequence = normalizePromptSequence(status.promptSequence ?? config.promptSequence, promptOptions, statusPromptProfile, promptWorkflows);
    try {
      const nextStatus = await service.getRoundProgressStatus(
        status.sourcePath,
        statusPromptProfile,
        status.nextRound,
        statusPromptSequence,
      );
      if (requestId === roundProgressRequestRef.current) {
        setRoundProgressStatus(nextStatus);
      }
      return nextStatus;
    } catch {
      if (requestId === roundProgressRequestRef.current) {
        setRoundProgressStatus(null);
      }
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

  function buildHistoryArtifactFilters(mode: HistoryArtifactGovernanceMode): HistoryArtifactQueryFilters | null {
    if (mode === "current") {
      const docId = documentStatus?.docId || historyItems[0]?.docId || "";
      return docId ? { docId, exists: "existing", limit: 8 } : null;
    }
    if (mode === "large") {
      return { exists: "existing", minBytes: 64 * 1024, limit: 8 };
    }
    return { exists: "missing", limit: 8 };
  }

  async function refreshHistoryArtifactGovernance(mode = historyArtifactMode) {
    const filters = buildHistoryArtifactFilters(mode);
    setHistoryArtifactMode(mode);
    if (!filters) {
      setHistoryArtifactQuery({
        ok: false,
        source: "sqlite",
        filters: {},
        items: [],
        total: 0,
        limit: 8,
        offset: 0,
        hasMore: false,
        stats: {
          total: 0,
          existing: 0,
          intermediate: 0,
          exports: 0,
          reports: 0,
          sources: 0,
          external: 0,
          missing: 0,
          bytes: 0,
        },
        error: "先选择一篇文档，再查看当前文档资产。",
      });
      return null;
    }
    setHistoryArtifactLoading(true);
    try {
      const result = await service.queryHistoryArtifacts(filters);
      setHistoryArtifactQuery(result);
      return result;
    } catch (appError) {
      const message = stringifyError(appError);
      setHistoryArtifactQuery({
        ok: false,
        source: "sqlite",
        filters,
        items: [],
        total: 0,
        limit: filters.limit ?? 8,
        offset: filters.offset ?? 0,
        hasMore: false,
        stats: {
          total: 0,
          existing: 0,
          intermediate: 0,
          exports: 0,
          reports: 0,
          sources: 0,
          external: 0,
          missing: 0,
          bytes: 0,
        },
        error: message,
      });
      setError(message);
      return null;
    } finally {
      setHistoryArtifactLoading(false);
    }
  }

  async function handleRepairHistoryDatabase() {
    const taskTicket = beginTask("loading-history", {
      runtimeStep: "正在修复历史索引。",
    });
    try {
      const result = await service.repairHistoryDatabase();
      const beforeIssues = result.before?.issueCount ?? 0;
      const afterIssues = result.after?.issueCount ?? 0;
      await refreshHistoryList();
      setHistoryOrphanScan(null);
      await refreshHistoryArtifactGovernance(historyArtifactMode);
      if (!result.ok) {
        setError(result.error || "历史索引修复后仍有问题，请查看缺失资产。");
      }
      const fixedText = beforeIssues ? `处理 ${beforeIssues} 个索引问题` : "索引已重新对齐";
      const afterText = afterIssues ? `仍有 ${afterIssues} 个提示待确认` : "当前索引健康";
      setNotice(`历史索引已修复：${fixedText}，${afterText}。修复只重建索引，不会删除正文或导出文件。`);
      setRuntimeStep(result.ok ? "历史索引修复完成" : "历史索引仍需检查");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("历史索引修复失败");
    } finally {
      finishTask(taskTicket);
    }
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
        setNotice("提示词已刷新。");
      }
      return result;
    } catch (appError) {
      const status = (appError as { status?: number } | null)?.status;
      const message = status === 405
        ? "本地后端还没有加载提示词接口，请停止当前 Web 服务后重新运行一键启动脚本。"
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

  function applyPromptSaveResult(result: PromptSaveResult) {
    setPromptPreviewError("");
    setPromptPreviews((current) => {
      const currentItems = current?.items ?? [];
      const nextItems = currentItems.some((item) => item.id === result.item.id)
        ? currentItems.map((item) => (item.id === result.item.id ? result.item : item))
        : [...currentItems, result.item];
      return { ok: true, promptDir: result.promptDir, items: nextItems, workflows: current?.workflows };
    });
    setActivePromptPreviewId(result.item.id);
  }

  function applyPromptDeleteResult(result: PromptDeleteResult) {
    setPromptPreviewError("");
    setPromptPreviews((current) => ({ ok: true, promptDir: result.promptDir, items: result.items, workflows: result.workflows ?? current?.workflows }));
    setActivePromptPreviewId(result.items[0]?.id ?? "");
  }

  async function handleSavePromptDraft(
    promptId: PromptId,
    payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean },
  ) {
    let result: PromptSaveResult | null = null;
    if (payload.metaDirty) {
      result = await service.updatePromptMeta(promptId, { label: payload.label, description: payload.description });
    }
    if (payload.contentDirty) {
      result = await service.savePrompt(promptId, payload.content);
    }
    if (result) {
      applyPromptSaveResult(result);
      setNotice("提示词已保存。");
    }
  }

  async function handleRestoreDefaultPrompt(promptId: PromptId) {
    const result = await service.restoreDefaultPrompt(promptId);
    applyPromptSaveResult(result);
    setNotice("已恢复默认提示词。");
  }

  async function handleCreatePrompt(payload: { label: string; description?: string; content: string }) {
    const result = await service.createPrompt(payload);
    applyPromptSaveResult(result);
    setNotice("自定义提示词已创建。");
  }

  async function handleDeletePrompt(promptId: PromptId) {
    const item = promptPreviews?.items.find((prompt) => prompt.id === promptId);
    if (!item || item.builtIn) {
      return;
    }
    const confirmed = await requestConfirm({
      title: "删除提示词",
      description: `删除「${item.label}」后会从改写流程选项中移除。`,
      confirmLabel: "删除",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const result = await service.deletePrompt(promptId);
    applyPromptDeleteResult(result);
    setNotice("提示词已删除。");
  }

  async function handleUpdatePromptWorkflow(workflowId: PromptWorkflow["id"], payload: Pick<PromptWorkflow, "label" | "description" | "defaultSequence" | "sequenceLimit">) {
    const result = await service.updatePromptWorkflow(workflowId, payload);
    const items = promptPreviews?.items ?? [];
    setPromptPreviews((current) => ({ ok: true, promptDir: result.promptDir, items: current?.items ?? items, workflows: result.workflows }));
    const updatedWorkflow = result.workflows.find((item) => item.id === workflowId);
    const nextPromptOptions = getPromptOptionsFromPreviews({ ok: true, promptDir: result.promptDir, items, workflows: result.workflows });
    const nextPromptWorkflows = getPromptWorkflowsFromPreviews({ ok: true, promptDir: result.promptDir, items, workflows: result.workflows }, nextPromptOptions);
    if (updatedWorkflow && updatedWorkflow.id === getDefaultPromptProfile(nextPromptWorkflows)) {
      const nextSequence = normalizePromptSequence(updatedWorkflow.defaultSequence, nextPromptOptions, updatedWorkflow.id, nextPromptWorkflows);
      const nextConfig = { ...modelConfig, promptProfile: updatedWorkflow.id, promptSequence: nextSequence };
      setModelConfig(nextConfig);
      localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, nextConfig.promptProfile);
      localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(nextConfig.promptSequence));
      if (documentStatus?.sourcePath) {
        await refreshDocumentState(documentStatus.sourcePath, nextConfig);
      }
    }
    setNotice("改写流程已保存。");
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
    const searchableItems = options.historyItems ?? historyItems;
    const matchedItem = options.historyItem
      ?? searchableItems.find((item) => historyItemMatchesDocument(item, status, status.sourcePath))
      ?? null;
    const latestRound = matchedItem
      ? getLatestHistoryRound(
        matchedItem,
        config.promptProfile,
        normalizePromptSequence(config.promptSequence, promptOptions, config.promptProfile, promptWorkflows),
        options.allowProfileFallback ?? false,
        promptOptions,
        promptWorkflows,
      )
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
      setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisionsForCompare(nextCompareData, savedReview.decisions) });
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
      setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisionsForCompare(nextCompareData, savedReview.decisions) });
    return nextCompareData;
  }

  useEffect(() => {
    if (!documentStatus?.sourcePath || currentRunToken || currentBatchRerunToken || taskPhase !== "idle") {
      return;
    }
    if (activeCompareData?.chunks.length) {
      autoSnapshotRestoreKeyRef.current = "";
      return;
    }
    if (shouldSuppressAutoSnapshotRestore(documentStatus, modelConfig, promptOptions, promptWorkflows)) {
      return;
    }

    const statusPromptProfile = documentStatus.promptProfile ?? modelConfig.promptProfile;
    const statusPromptSequence = normalizePromptSequence(
      documentStatus.promptSequence ?? modelConfig.promptSequence,
      promptOptions,
      statusPromptProfile,
      promptWorkflows,
    );
    const matchedItem = historyItems.find((item) => historyItemMatchesDocument(item, documentStatus, documentStatus.sourcePath));
    const latestRound = matchedItem
      ? getLatestHistoryRound(
        matchedItem,
        statusPromptProfile,
        statusPromptSequence,
        true,
        promptOptions,
        promptWorkflows,
      )
      : null;
    const outputPath = latestRound?.outputPath || documentStatus.latestOutputPath;
    if (!outputPath) {
      return;
    }

    const restoreKey = [
      normalizeDetectionDocumentKey(documentStatus.sourcePath),
      statusPromptProfile,
      statusPromptSequence.join(","),
      normalizeDetectionDocumentKey(outputPath),
    ].join("::");
    if (autoSnapshotRestoreKeyRef.current === restoreKey) {
      return;
    }
    autoSnapshotRestoreKeyRef.current = restoreKey;

    let canceled = false;
    void (async () => {
      try {
        const restoreConfig = { ...modelConfig, promptProfile: statusPromptProfile, promptSequence: statusPromptSequence };
        const loadedSnapshot = await loadLatestRoundSnapshot(documentStatus, restoreConfig, {
          historyItems,
          historyItem: matchedItem,
          allowProfileFallback: true,
        });
        if (canceled || !loadedSnapshot) {
          return;
        }
        const loadedProfile = loadedSnapshot.round?.promptProfile ?? loadedSnapshot.compareData.promptProfile;
        const loadedPromptProfile = isPromptProfile(loadedProfile, promptWorkflows) ? loadedProfile : restoreConfig.promptProfile;
        const loadedSequence = normalizePromptSequence(
          loadedSnapshot.round?.promptSequence ?? loadedSnapshot.compareData.promptSequence ?? restoreConfig.promptSequence,
          promptOptions,
          loadedPromptProfile,
          promptWorkflows,
        );
        if (
          isPromptProfile(loadedProfile, promptWorkflows)
          && (loadedProfile !== restoreConfig.promptProfile || !promptSequencesEqual(loadedSequence, restoreConfig.promptSequence, promptOptions, loadedPromptProfile, promptWorkflows))
        ) {
          const syncedConfig = { ...restoreConfig, promptProfile: loadedProfile, promptSequence: loadedSequence };
          latestModelConfigRef.current = syncedConfig;
          setModelConfig(syncedConfig);
          localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, loadedProfile);
          localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(loadedSequence));
          await refreshDocumentState(documentStatus.sourcePath, syncedConfig);
          if (canceled) {
            return;
          }
        }
        setRuntimeStep(`已恢复第 ${loadedSnapshot.compareData.round} 轮 Diff。`);
      } catch (appError) {
        if (!canceled) {
          autoSnapshotRestoreKeyRef.current = "";
          setNotice(`检测到已有结果，但 Diff 恢复失败：${stringifyError(appError)}`);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [activeCompareData?.chunks.length, currentBatchRerunToken, currentRunToken, documentStatus, historyItems, modelConfig, promptOptions, promptWorkflows, setModelConfig, setNotice, setRuntimeStep, taskPhase]);

  async function handlePromptProfileChange(promptProfile: ModelConfig["promptProfile"]) {
    const targetProfile = normalizePromptProfile(promptProfile, promptWorkflows) ?? getDefaultPromptProfile(promptWorkflows);
    const nextConfig = {
      ...modelConfig,
      promptProfile: targetProfile,
      promptSequence: normalizePromptSequence(modelConfig.promptSequence, promptOptions, targetProfile, promptWorkflows),
    };
    setModelConfig(nextConfig);
    clearAutoSnapshotSuppression();
    clearPendingAutoActionForManualContextChange();
    localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, nextConfig.promptProfile);
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
    const targetProfile = getDefaultPromptProfile(promptWorkflows);
    const nextConfig = {
      ...modelConfig,
      promptProfile: targetProfile,
      promptSequence: normalizePromptSequence(promptSequence, promptOptions, targetProfile, promptWorkflows),
    };
    setModelConfig(nextConfig);
    clearAutoSnapshotSuppression();
    clearPendingAutoActionForManualContextChange();
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
      clearPendingAutoActionForManualContextChange();
      clearDocumentDerivedState({ includeDetectionReport: true });
      const selectedConfig = buildConfigForHistorySelection(item, configOverride, promptOptions, promptWorkflows);
      if (
        selectedConfig.promptProfile !== modelConfig.promptProfile
        || !promptSequencesEqual(selectedConfig.promptSequence, modelConfig.promptSequence, promptOptions, selectedConfig.promptProfile, promptWorkflows)
      ) {
        setModelConfig(selectedConfig);
        localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, selectedConfig.promptProfile);
        localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(selectedConfig.promptSequence));
      }
      let statusConfig = selectedConfig;
      let status = await refreshDocumentState(item.sourcePath, statusConfig);
      const loadedSnapshot = await loadLatestRoundSnapshot(status, selectedConfig, {
        historyItem: item,
        allowProfileFallback: true,
      });
      const loadedProfile = loadedSnapshot?.round?.promptProfile ?? loadedSnapshot?.compareData.promptProfile;
      const loadedPromptProfile = isPromptProfile(loadedProfile, promptWorkflows) ? loadedProfile : selectedConfig.promptProfile;
      const loadedSequence = normalizePromptSequence(
        loadedSnapshot?.round?.promptSequence ?? loadedSnapshot?.compareData.promptSequence ?? selectedConfig.promptSequence,
        promptOptions,
        loadedPromptProfile,
        promptWorkflows,
      );
      if (
        isPromptProfile(loadedProfile, promptWorkflows)
        && (loadedProfile !== selectedConfig.promptProfile || !promptSequencesEqual(loadedSequence, selectedConfig.promptSequence, promptOptions, loadedPromptProfile, promptWorkflows))
      ) {
        const syncedConfig = { ...selectedConfig, promptProfile: loadedProfile, promptSequence: loadedSequence };
        statusConfig = syncedConfig;
        setModelConfig(syncedConfig);
        localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, syncedConfig.promptProfile);
        localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(syncedConfig.promptSequence));
        status = await refreshDocumentState(status.sourcePath, syncedConfig);
      }
      setNotice(`已切换到历史文档。${describeDocumentProgress(status, statusConfig, promptOptions, promptWorkflows)}`);
      setRuntimeStep(
        loadedSnapshot
          ? formatDocumentLoadStep("历史文档已载入，并显示最新 Diff", status, statusConfig, promptOptions, promptWorkflows)
          : formatDocumentLoadStep("历史文档已载入，但当前模式暂无 Diff", status, statusConfig, promptOptions, promptWorkflows)
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
      void refreshHistoryArtifactGovernance();
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
      void refreshHistoryArtifactGovernance();

      if (documentStatus?.docId === docId) {
        if (result.removedDocument) {
          setDocumentStatus(null);
          setHistory(null);
          setProtectionMap(null);
          setScopeDiagnostics(null);
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
      const configToSave = normalizeActiveModelConfig(nextConfig ?? modelConfig, promptOptions, promptWorkflows);
      if (testConfig) {
        setRuntimeStep("正在测试模型连接，测试通过后保存。");
        await service.testModelConnection(normalizeActiveModelConfig(testConfig, promptOptions, promptWorkflows));
      }
      const saved = await service.saveModelConfig(configToSave);
      const mergedSaved = normalizeActiveModelConfig({ ...saved, ...configToSave, roundModels: { ...(saved.roundModels ?? {}), ...(configToSave.roundModels ?? {}) } }, promptOptions, promptWorkflows);
      setModelConfig(mergedSaved);
      if (documentStatus) {
        await refreshDocumentState(documentStatus.sourcePath, mergedSaved);
      }
      if (mergedSaved.baseUrl && mergedSaved.apiKey) {
        await refreshModelCatalog(mergedSaved, { silent: true });
      }
      setNotice(`模型配置已保存，当前模式为 ${describePromptProfile(mergedSaved.promptProfile, promptWorkflows)}。`);
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
      const onlineConfig = normalizeActiveModelConfig(modelConfig, promptOptions, promptWorkflows);
      setRuntimeStep("正在测试接口连通性。");
      const result = await service.testModelConnection(onlineConfig);
      const detailParts = [
        "接口连通性测试成功。",
        result.apiType ? `接口类型：${result.apiType}` : "",
        result.endpoint ? `请求地址：${result.endpoint}` : "",
      ].filter(Boolean);
      setNotice(detailParts.join(" "));
      setRuntimeStep("接口连通性测试成功");
      await refreshModelCatalog(onlineConfig, { silent: true });
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
        setNotice(`AI 解析未完成，已用本地规则抽取待确认规范。请复核后再启用。`);
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
      clearPendingAutoActionForManualContextChange();
      clearDocumentDerivedState({ includeDetectionReport: true });
      const status = await refreshDocumentState(picked.sourcePath);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(formatDocumentLoadStep("文档已载入", status, modelConfig, promptOptions, promptWorkflows));
      setNotice(`已导入文档。${describeDocumentProgress(status, modelConfig, promptOptions, promptWorkflows)}`);
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
        setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisionsForCompare(nextCompareData, savedReview.decisions) });
      });

      const nextStatus = await refreshDocumentState(activeRun.sourcePath);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(formatRoundCompleteStep(nextResult.round, nextStatus, modelConfig, promptOptions, promptWorkflows));
      setNotice(formatRoundCompleteNotice(nextResult.round, nextStatus, modelConfig, promptOptions, promptWorkflows));
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

  async function assertBackendConcurrencyReady(requestedConcurrency: number) {
    try {
      const runtime = await service.getBackendRuntime();
      const backendMaxConcurrency = Number(runtime.maxRewriteConcurrency ?? 0) || 0;
      if (backendMaxConcurrency > 0 && requestedConcurrency > backendMaxConcurrency) {
        throw new Error(`当前后端最大只支持 ${backendMaxConcurrency} 并发，已选择 ${requestedConcurrency}。请重启后端后再启动。`);
      }
      if (!backendMaxConcurrency && requestedConcurrency > 8) {
        throw new Error(`当前后端没有返回并发上限，可能仍是旧实例。已选择 ${requestedConcurrency}，请重启后端后再启动。`);
      }
    } catch (error) {
      if (requestedConcurrency > 8) {
        const message = stringifyError(error);
        if (message.includes("后端") || message.includes("并发")) {
          throw error;
        }
        throw new Error(`无法确认后端是否支持 ${requestedConcurrency} 并发，请重启后端后再启动。`);
      }
    }
  }

  async function handleRunRound(configOverride?: ModelConfig) {
    if (running) {
      setNotice("当前轮次正在运行中；如需停止，请先点击中断当前轮。");
      return;
    }
    if (!documentStatus) {
      setNotice("请先上传一个 txt 或 docx 文档。");
      return;
    }
    const baseModelConfig = normalizeActiveModelConfig(configOverride ?? latestModelConfigRef.current ?? modelConfig, promptOptions, promptWorkflows);
    const selectedPromptProfile = normalizePromptProfile(baseModelConfig.promptProfile, promptWorkflows) ?? getDefaultPromptProfile(promptWorkflows);
    const selectedPromptSequence = normalizePromptSequence(baseModelConfig.promptSequence, promptOptions, selectedPromptProfile, promptWorkflows);
    let runConfig = {
      ...baseModelConfig,
      rewriteConcurrency: normalizeRewriteConcurrency(baseModelConfig.rewriteConcurrency),
      promptProfile: selectedPromptProfile,
      promptSequence: selectedPromptSequence,
    };
    latestModelConfigRef.current = runConfig;
    if (
      runConfig.promptProfile !== modelConfig.promptProfile
      || runConfig.rewriteConcurrency !== modelConfig.rewriteConcurrency
      || !promptSequencesEqual(runConfig.promptSequence, modelConfig.promptSequence, promptOptions, runConfig.promptProfile, promptWorkflows)
    ) {
      setModelConfig(runConfig);
      localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, runConfig.promptProfile);
      localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(runConfig.promptSequence));
    }
    clearPendingAutoActionForSource(documentStatus.sourcePath);
    const taskTicket = beginTask("running-round", {
      runtimeStep: "正在同步改写路线。",
    });
    let runSession: RunSession | null = null;
    let launchStatus: DocumentStatus = documentStatus;
    try {
      await assertBackendConcurrencyReady(runConfig.rewriteConcurrency);
      const savedConfig = await service.saveModelConfig(runConfig);
      runConfig = {
        ...savedConfig,
        ...runConfig,
        roundModels: { ...(savedConfig.roundModels ?? {}), ...(runConfig.roundModels ?? {}) },
        rewriteConcurrency: normalizeRewriteConcurrency(runConfig.rewriteConcurrency),
      };
      latestModelConfigRef.current = runConfig;
      setModelConfig(runConfig);
      launchStatus = await refreshDocumentState(documentStatus.sourcePath, runConfig);
      const launchPlannedRounds = getPlannedRoundCount(runConfig, promptOptions, promptWorkflows);
      if (launchStatus.nextRound && launchStatus.nextRound > launchPlannedRounds) {
        setNotice("当前流程已完成，可导出；需要继续请先在改写流程里增加轮次。");
        setRuntimeStep("流程已完成");
        return;
      }
      if (!launchStatus.hasNextRound || launchStatus.isComplete || !launchStatus.nextRound) {
        setNotice("当前流程已完成，可导出；需要继续请先在改写流程里增加轮次。");
        setRuntimeStep("流程已完成");
        return;
      }
      const checkpointStatus = roundProgressStatus
        && sameWorkspacePath(roundProgressStatus.sourcePath, launchStatus.sourcePath)
        && roundProgressStatus.round === launchStatus.nextRound
        && roundProgressStatus.promptProfile === runConfig.promptProfile
        && promptSequencesEqual(roundProgressStatus.promptSequence, runConfig.promptSequence, promptOptions, runConfig.promptProfile, promptWorkflows)
        ? roundProgressStatus
        : await refreshRoundProgressStatus(launchStatus, runConfig);
      const checkpointProgress = createCheckpointProgress(checkpointStatus, runConfig.rewriteConcurrency);
      const initialProgress = checkpointProgress ?? {
        phase: "run-starting",
        round: launchStatus.nextRound,
        completedChunks: 0,
        activeChunks: 0,
        queuedChunks: 0,
        concurrency: runConfig.rewriteConcurrency,
        configuredConcurrency: runConfig.rewriteConcurrency,
      };
      visibleProgressRef.current = initialProgress;
      setProgress(initialProgress);
      setRerunFailures([]);
      setLastExportResult(null);
      await releaseProgressListener();

      const liveCompareSeed = activeCompareData?.round === launchStatus.nextRound
        ? activeCompareData
        : createLiveCompareData(launchStatus, launchStatus.nextRound);
      liveCompareRef.current = liveCompareSeed;
      setCompareData(liveCompareSeed);
      setReviewDecisions({});
      setRoundResult(null);
      setPreview(null);
      const runToken = await service.startRunRound(launchStatus.sourcePath, runConfig);
      if (!runToken) {
        throw new Error("无法创建运行任务。");
      }
      runSession = beginRunSession({
        runId: runToken,
        sourcePath: launchStatus.sourcePath,
        round: launchStatus.nextRound,
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

      setRuntimeStep(checkpointProgress ? formatRuntimeStep(checkpointProgress, `准备续跑第 ${launchStatus.nextRound} 轮。`) : `准备执行第 ${launchStatus.nextRound} 轮。`);
      setNotice(checkpointProgress ? checkpointProgress.resumeExplanation || "已识别断点，本次会从已完成分块后继续，不会重头跑。" : `本次运行将使用 ${describePromptProfile(runConfig.promptProfile, promptWorkflows)}，中途失败时会优先尝试断点续跑。`);

      clearAutoSnapshotSuppression();
      const nextResult = await service.awaitRunRound(launchStatus.sourcePath, runConfig, runToken);
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
        setReviewDecisions({ ...buildDefaultReviewDecisions(nextCompareData), ...normalizeSavedReviewDecisionsForCompare(nextCompareData, savedReview.decisions) });
      });

      const status = await refreshDocumentState(launchStatus.sourcePath, runConfig);
      await refreshHistoryList();
      setHistoryPanelOpen(true);
      setRuntimeStep(formatRoundCompleteStep(nextResult.round, status, runConfig, promptOptions, promptWorkflows));
      setNotice(formatRoundCompleteNotice(nextResult.round, status, runConfig, promptOptions, promptWorkflows));
      clearAutoRetryScope(getAutoRunScopeKey(launchStatus.sourcePath, runConfig, nextResult.round));
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
      if (launchStatus?.sourcePath) {
        try {
          refreshedStatus = await refreshDocumentState(launchStatus.sourcePath, runConfig);
          await refreshHistoryList();
        } catch {
        }
      }
      if (!userCanceled && resumable && launchStatus?.sourcePath && launchStatus.nextRound) {
        scheduleAutoRetry({
          sourcePath: launchStatus.sourcePath,
          round: refreshedStatus?.nextRound || runSession?.round || launchStatus.nextRound,
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
    const resetTarget = getRoundResetTarget(documentStatus, roundProgressStatus, promptOptions, promptWorkflows);
    if (!documentStatus || !resetTarget) {
      setNotice("当前没有可放弃进度的轮次。");
      return;
    }
    const targetLabel = resetTarget.mode === "completed" ? `第 ${resetTarget.round} 轮结果` : `第 ${resetTarget.round} 轮断点进度`;
    const confirmed = await requestConfirm({
      title: `放弃${targetLabel}`,
      description: resetTarget.mode === "completed"
        ? "会删除该轮及后续轮次的结果记录与生成文件；源文档会保留。"
        : "只会清理当前轮已完成的分块缓存；源文档和已完成轮次会保留。",
      details: resetTarget.mode === "completed"
        ? ["后续再次运行时，会从该轮重新开始。", "如果这是第 1 轮，启动按钮会回到开始第 1 轮。"]
        : ["后续再次运行该轮时，会从该轮开头重新生成。", "刷新页面后不会自动载入旧 Diff；需要查看时可从历史记录手动打开。"],
      confirmLabel: "确认放弃",
      cancelLabel: resetTarget.mode === "completed" ? "保留结果" : "保留断点",
      tone: "warning",
    });
    if (!confirmed) {
      return;
    }
    const taskTicket = beginTask("resetting-round");
    const resetRoundNumber = resetTarget.round;
    const resetPromptProfile = documentStatus.promptProfile ?? modelConfig.promptProfile;
    const resetPromptSequence = normalizePromptSequence(
      documentStatus.promptSequence ?? modelConfig.promptSequence,
      promptOptions,
      resetPromptProfile,
      promptWorkflows,
    );
    const resetConfig = {
      ...modelConfig,
      promptProfile: resetPromptProfile,
      promptSequence: resetPromptSequence,
    };
    try {
      clearPendingAutoActionForSource(documentStatus.sourcePath);
      await releaseProgressListener();
      await service.resetRoundProgress(documentStatus.sourcePath, resetPromptProfile, resetRoundNumber, resetPromptSequence);
      suppressAutoSnapshotRestore(documentStatus, resetConfig, resetRoundNumber, promptOptions, promptWorkflows);
      setProgress(null);
      clearLoadedRoundSnapshot();
      await refreshDocumentState(documentStatus.sourcePath, resetConfig);
      await refreshHistoryList();
      setNotice(resetTarget.mode === "completed"
        ? `第 ${resetRoundNumber} 轮结果已放弃；可从第 ${resetRoundNumber} 轮重新开始。`
        : `第 ${resetRoundNumber} 轮进度已放弃；刷新后不会自动恢复旧 Diff，历史记录仍可手动打开。`);
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
      const nextDecision = getDefaultReviewDecisionForChunk(result.compare, chunkId);
      setReviewDecisions((current) => ({ ...buildDefaultReviewDecisions(result.compare), ...current, [chunkId]: nextDecision }));
      const outputPreview = await service.readOutput(result.outputPath, PREVIEW_MAX_CHARS);
      setPreview(outputPreview);
      setNotice(nextDecision === "source" ? `块 ${chunkId} 已标为高风险，默认保留安全文本。` : `块 ${chunkId} 已重跑完成，默认采用新改写。`);
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
        ...Object.fromEntries(completedTargets.map((target) => [target.chunkId, getDefaultReviewDecisionForChunk(confirmedCompare, target.chunkId)])),
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
    const unresolvedFailureChunkIds = new Set(activeRerunFailures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId));
    const riskyChunkIds = activeCompareData?.chunks.filter((chunk) => {
      return Boolean(chunk.quality?.needsReview)
        && !unresolvedFailureChunkIds.has(chunk.chunkId)
        && !isHighRiskFailedOutputChunk(chunk)
        && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]);
    }).map((chunk) => chunk.chunkId) ?? [];
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
    if (roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows)) {
      setNotice("当前轮还有断点未完成，先继续本轮再导出。");
      return;
    }
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    if (!outputPath) {
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
      const result = await service.exportRound(outputPath, format);
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
  const plannedProgressRounds = documentStatus?.plannedRounds ?? getPlannedRoundCount(modelConfig, promptOptions, promptWorkflows);
  const progressPercent = getProgressPercent(progress, documentStatus?.completedRounds.length ?? 0, plannedProgressRounds);
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
        tone: pendingAutoAction.kind === "manual-intervention" ? "red" : pendingAutoAction.kind === "retry" ? "amber" : "blue",
        running: false,
        percent: getPendingAutoActionPercent(pendingAutoAction),
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
        tone: cancelRequested ? "red" : "blue",
        running: true,
        percent: getRoundTaskPercent(activeProgress, progressPercent),
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
      items.push({
        id: `batch:${currentBatchRerunToken}`,
        title: session?.label || "局部优化",
        status: cancelRequested ? "停止中" : "运行中",
        tone: cancelRequested ? "red" : "amber",
        running: true,
        percent: getBatchTaskPercent(activeBatchStatus),
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
      const failedChunkIds = activeRerunFailures.filter((failure) => !isReviewDecisionResolved(reviewDecisions[failure.chunkId])).map((failure) => failure.chunkId);
      const failedChunkIdSet = new Set(failedChunkIds);
      const highRiskChunkIds = activeCompareData.chunks
        .filter((chunk) => !failedChunkIdSet.has(chunk.chunkId) && isHighRiskFailedOutputChunk(chunk) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]))
        .map((chunk) => chunk.chunkId);
      const highRiskChunkIdSet = new Set(highRiskChunkIds);
      const reviewChunkIds = activeCompareData.chunks
        .filter((chunk) => {
          const flags = chunk.quality?.flags ?? [];
          const reportMatches = detectionMatchesByChunk[chunk.chunkId] ?? [];
          return !failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved(reviewDecisions[chunk.chunkId]) && (Boolean(chunk.quality?.needsReview)
            || chunk.fallbackMode === "source"
            || flags.includes("source_fallback")
            || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review"));
        })
        .map((chunk) => chunk.chunkId);
      const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : highRiskChunkIds.length ? "highRisk" : "review";
      const preferredChunkId = failedChunkIds[0] ?? highRiskChunkIds[0] ?? reviewChunkIds[0];
      if (reviewChunkIds.length || highRiskChunkIds.length || failedChunkIds.length) {
        items.push({
          id: `diff-action:${activeCompareData.outputPath || activeCompareData.docId}:${reviewChunkIds.length}:${highRiskChunkIds.length}:${failedChunkIds.length}`,
          title: failedChunkIds.length ? "Diff 有优化失败" : highRiskChunkIds.length ? "Diff 有高风险" : "Diff 有内容需确认",
          status: failedChunkIds.length ? "需处理" : highRiskChunkIds.length ? "高风险" : "待审阅",
          tone: failedChunkIds.length || highRiskChunkIds.length ? "red" : "amber",
          running: false,
          actionLabel: preferredFilter === "failed" ? "查看失败内容" : preferredFilter === "highRisk" ? "查看高风险" : "只看待确认",
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
        tone: item.cancelRequested ? "red" : "blue",
        running: true,
        percent: getRoundTaskPercent(itemProgress),
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
        title: "后台局部优化",
        status: item.cancelRequested ? "停止中" : item.status || "运行中",
        tone: item.cancelRequested ? "red" : "amber",
        running: true,
        percent: getBatchTaskPercent(item),
        actionLabel: "查看诊断",
        onAction: () => openTaskTargetView("diagnostics"),
      });
    }

    const checkpointMatchesCurrentDocument = Boolean(
      roundProgressStatus?.canResume
      && (
        !documentStatus?.sourcePath
        || (
          sameWorkspacePath(roundProgressStatus.sourcePath, documentStatus.sourcePath)
          && roundProgressStatus.promptProfile === documentStatus.promptProfile
          && promptSequencesEqual(roundProgressStatus.promptSequence, documentStatus.promptSequence, promptOptions, documentStatus.promptProfile, promptWorkflows)
        )
      ),
    );
    if (!currentRunToken && checkpointMatchesCurrentDocument && roundProgressStatus) {
      const allChunksDone = roundProgressStatus.resumeStage === "finalize_output";
      items.push({
        id: `checkpoint:${roundProgressStatus.sourcePath}:${roundProgressStatus.round ?? "unknown"}`,
        title: allChunksDone ? `第 ${roundProgressStatus.round ?? ""} 轮等待收尾` : `第 ${roundProgressStatus.round ?? ""} 轮可续跑`,
        status: "可继续",
        tone: roundProgressStatus.lastError ? "amber" : "blue",
        running: false,
        percent: roundProgressStatus.progressPercent,
        actionLabel: "回主页继续",
        onAction: () => openTaskTargetView("home"),
      });
    }

    return items;
  }, [activeCompareData, activeRerunFailures, busy, currentBatchRerunToken, currentRunToken, detectionMatchesByChunk, diagnostics, documentStatus?.promptProfile, documentStatus?.promptSequence, documentStatus?.sourcePath, error, pendingAutoAction, progress, progressPercent, promptOptions, promptWorkflows, reviewDecisions, roundProgressStatus, taskPhase]);
  const activeRuntimeTaskCount = runtimeTaskItems.filter((item) => item.running).length;
  const statusAutoAction = !error && pendingAutoAction ? pendingAutoAction : null;
  const hasActiveOperationFeedback = Boolean(activeRuntimeTaskCount || (uiBusy && !error));

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
  const operationStatusText = runtimeLabel && runtimeLabel !== "待命" ? runtimeLabel : runtimeStatus;
  const notificationStatusText = error
    ? error
    : statusAutoAction
      ? formatPendingAutoActionStatus(statusAutoAction)
      : notice
        ? notice
        : activeRuntimeTaskCount
          ? `${activeRuntimeTaskCount} 个运行中`
          : uiBusy
            ? operationStatusText
            : unreadNotificationCount
              ? `${unreadNotificationCount} 未读`
              : "无未读";
  const NotificationStatusIcon = error ? AlertCircle : statusAutoAction ? Signal : hasActiveOperationFeedback ? Loader2 : notice ? CheckCircle2 : Bell;
  const hasStatusFeedback = Boolean(error || notice || statusAutoAction || hasActiveOperationFeedback);
  const notificationStatusLabel = error
    ? "错误反馈"
    : statusAutoAction
      ? statusAutoAction.kind === "manual-intervention"
        ? "等待人工"
        : "自动执行"
      : notice
        ? "操作反馈"
        : hasActiveOperationFeedback
          ? "处理中"
          : unreadNotificationCount
            ? "未读通知"
            : "通知";
  const notificationStatusKind: NotificationKind | null = error ? "error" : notice ? "success" : null;
  const showRoundRunStatus = Boolean(currentRunToken || taskPhase === "running-round" || taskPhase === "canceling-run");
  const roundRunStatusProgress = progress ?? (showRoundRunStatus ? roundProgressStatus?.activeRun?.lastEvent ?? null : null);
  const loadedCompletedResultRound = roundResult?.round ?? null;
  const checkpointPendingForCurrentDocument = roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows) && !showRoundRunStatus;
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
              <SidebarTrigger className="border bg-card shadow-none" />
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
              </div>
              <ThemeModeMenu />
            </div>
            <div className="vercel-subbar flex h-10 min-w-0 items-center gap-2 overflow-hidden border-t px-4 text-xs">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-ui-section="current-file-chip"
                className="h-7 min-w-[22rem] max-w-[min(58vw,56rem)] shrink-0 justify-start overflow-x-auto px-2 text-xs"
                onClick={() => setActiveView("home")}
              >
                <FileText data-icon="inline-start" />
                <span className="text-muted-foreground">当前文件</span>
                <span className="shrink-0 text-foreground">{documentStatus ? formatFileScopeLabel(documentStatus.sourcePath) : "未选择"}</span>
              </Button>
              <div className="flex min-w-0 shrink-0 items-center gap-2">
                <Separator orientation="vertical" className="hidden h-4 md:block" />
                <Button type="button" variant="ghost" size="sm" className="hidden h-7 min-w-0 shrink-0 px-2 text-xs md:inline-flex" onClick={() => setActiveView("model")}>
                  <Route data-icon="inline-start" />
                  <span className="text-muted-foreground">路线</span>
                  <span className="max-w-[260px] truncate text-foreground">{getPromptProfileLabel(modelConfig.promptProfile, promptWorkflows)} · {formatPromptSequence(modelConfig.promptSequence, promptOptions, modelConfig.promptProfile, promptWorkflows)}</span>
                </Button>
                <Separator orientation="vertical" className="hidden h-4 md:block" />
                <Button type="button" variant="ghost" size="sm" className="hidden h-7 min-w-0 shrink-0 px-2 text-xs md:inline-flex" onClick={() => openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)}>
                  <Wand2 data-icon="inline-start" />
                  <span className="text-muted-foreground">Diff</span>
                  <span className="text-foreground">{formatDiffDashboardLabel(diffDashboardStats)}</span>
                </Button>
                <Separator orientation="vertical" className="hidden h-4 md:block" />
                <Button
                  type="button"
                  variant={notificationStatusKind === "error" ? "outlineDanger" : hasStatusFeedback ? "outlineSuccess" : unreadNotificationCount || activeRuntimeTaskCount ? "outline" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-8 min-w-[220px] max-w-[min(42vw,560px)] shrink-0 justify-start px-3 text-xs",
                    hasStatusFeedback && "border-primary/35 bg-primary/10 shadow-sm",
                    notificationStatusKind === "error" && "border-destructive/40 bg-destructive/10",
                  )}
                  aria-label="打开通知与任务中心"
                  aria-live="polite"
                  onClick={openNotificationCenter}
                >
                  <NotificationStatusIcon className={cn(hasActiveOperationFeedback && LOADING_ICON_CLASS_NAME)} data-icon="inline-start" />
                  <Badge variant={notificationStatusKind === "error" ? "danger" : hasStatusFeedback ? "secondary" : "outline"} className="shrink-0">
                    {notificationStatusLabel}
                  </Badge>
                  <span className={cn("min-w-0 flex-1 truncate text-left text-foreground", hasStatusFeedback && "font-semibold")}>{notificationStatusText}</span>
                </Button>
              </div>
            </div>
          </header>

          <section className="vercel-shell min-h-0 flex-1 overflow-hidden p-4">
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
                      roundRunning={showRoundRunStatus}
                      checkpointPending={checkpointPendingForCurrentDocument}
                      onReviewDecisionChange={updateReviewDecision}
                      onRerunChunk={(chunkId, userFeedback) => void handleRerunChunk(chunkId, userFeedback)}
                      onRerunRiskyChunks={() => void handleRerunRiskyChunks()}
                      batchRerunRunning={Boolean(currentBatchRerunToken)}
                      batchRerunStatusText={runtimeLabel}
                      onCancelBatchRerun={() => void handleCancelBatchRerun()}
                      onExportTxt={() => void handleExportCurrent("txt")}
                      onExportDocx={() => void handleExportCurrent("docx")}
                    />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      {showRoundRunStatus ? (
                        <RoundRunStatusCard
                          progress={roundRunStatusProgress}
                          configuredConcurrency={normalizeRewriteConcurrency(modelConfig.rewriteConcurrency)}
                          runtimeLabel={runtimeLabel}
                          cancelRequested={taskPhase === "canceling-run" || runSessionRef.current?.cancelRequested === true}
                          onCancel={() => void handleCancelRunRound()}
                        />
                      ) : (
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
                      )}
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
                        modelConfig={modelConfig}
                        progress={progress}
                        roundProgressStatus={roundProgressStatus}
                        loadedResultRound={loadedCompletedResultRound}
                        pendingAutoAction={pendingAutoAction}
                        promptProfile={modelConfig.promptProfile}
                        promptSequence={modelConfig.promptSequence}
                        promptOptions={promptOptions}
                        promptWorkflows={promptWorkflows}
                        onPromptProfileChange={(promptProfile) => void handlePromptProfileChange(promptProfile)}
                        onPromptSequenceChange={(promptSequence) => void handlePromptSequenceChange(promptSequence)}
                        onModelConfigChange={(nextConfig) => {
                          latestModelConfigRef.current = nextConfig;
                          setModelConfig(nextConfig);
                        }}
                        onSaveModelConfig={(nextConfig) => void handleSaveModelConfig(nextConfig)}
                        onRefreshAllProviderModels={() => void handleRefreshAllProviderModels()}
                        onRefreshProviderModels={(providerId) => void handleRefreshProviderModels(providerId)}
                        onPickFile={handlePickFile}
                        onRunRound={handleRunRound}
                        onRefreshStatus={() => void handleRefreshCurrentDocumentStatus()}
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
                  onSavePrompt={(promptId, payload) => handleSavePromptDraft(promptId, payload)}
                  onRestoreDefaultPrompt={(promptId) => handleRestoreDefaultPrompt(promptId)}
                  onCreatePrompt={(payload) => handleCreatePrompt(payload)}
                  onDeletePrompt={(promptId) => handleDeletePrompt(promptId)}
                />
              </div>
            ) : activeView === "format" ? (
              <div className="h-full min-h-0 overflow-auto">{formatPanel}</div>
            ) : activeView === "protection" ? (
              <div className="h-full min-h-0 overflow-auto"><ProtectionMapCard value={protectionMap} diagnostics={scopeDiagnostics} /></div>
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
                promptOptions={promptOptions}
                promptWorkflows={promptWorkflows}
                orphanScan={historyOrphanScan}
                artifactQuery={historyArtifactQuery}
                artifactMode={historyArtifactMode}
                artifactLoading={historyArtifactLoading}
                open={historyPanelOpen}
                busy={uiBusy}
                onToggle={() => setHistoryPanelOpen(!historyPanelOpen)}
                onSelect={(item) => void handleSelectHistory(item)}
                onPreviewDelete={(docId, options) => handlePreviewHistoryDelete(docId, options)}
                onDelete={(docId, options) => void handleDeleteHistory(docId, options)}
                onArtifactModeChange={(mode) => void refreshHistoryArtifactGovernance(mode)}
                onRefreshArtifacts={() => void refreshHistoryArtifactGovernance()}
                onRepairHistoryDatabase={() => void handleRepairHistoryDatabase()}
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
              {value.description ? (
                <AlertDialogDescription>{value.description}</AlertDialogDescription>
              ) : (
                <AlertDialogDescription className="sr-only">确认当前操作。</AlertDialogDescription>
              )}
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
  onSavePrompt,
  onRestoreDefaultPrompt,
  onCreatePrompt,
  onDeletePrompt,
}: {
  value: PromptPreviewResponse | null;
  busy: boolean;
  error: string;
  activePromptId: PromptId;
  onActivePromptIdChange: (promptId: PromptId) => void;
  onRefresh: () => void;
  onSavePrompt: (promptId: PromptId, payload: { label: string; description?: string; content: string; contentDirty: boolean; metaDirty: boolean }) => Promise<void>;
  onRestoreDefaultPrompt: (promptId: PromptId) => Promise<void>;
  onCreatePrompt: (payload: { label: string; description?: string; content: string }) => Promise<void>;
  onDeletePrompt: (promptId: PromptId) => Promise<void>;
}) {
  const [draftContent, setDraftContent] = useState("");
  const [draftLabel, setDraftLabel] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [createMode, setCreateMode] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const items = value?.items ?? [];
  const activeItem = items.find((item) => item.id === activePromptId) ?? items[0] ?? null;
  const activeVersion = activeItem ? `${activeItem.id}:${activeItem.updatedAt}:${activeItem.content.length}` : "";
  const editable = activeItem?.editable !== false;
  const dirty = Boolean(activeItem && draftContent !== activeItem.content);
  const metaDirty = Boolean(activeItem && (draftLabel !== activeItem.label || draftDescription !== activeItem.description));
  const editorContent = createMode ? newContent : draftContent;
  const contentLineCount = editorContent ? editorContent.split(/\r?\n/).length : 0;

  useEffect(() => {
    if (activeItem && !createMode) {
      setDraftContent(activeItem.content);
      setDraftLabel(activeItem.label);
      setDraftDescription(activeItem.description);
      setLocalError("");
    }
  }, [activeVersion, activeItem, createMode]);

  async function saveActivePrompt() {
    if (!activeItem || !editable || (!dirty && !metaDirty)) {
      return;
    }
    setSaving(true);
    setLocalError("");
    try {
      await onSavePrompt(activeItem.id, {
        label: draftLabel,
        description: draftDescription,
        content: draftContent,
        contentDirty: dirty,
        metaDirty,
      });
    } catch (appError) {
      setLocalError(stringifyError(appError));
    } finally {
      setSaving(false);
    }
  }

  async function restoreDefaultPrompt() {
    if (!activeItem?.defaultAvailable) {
      return;
    }
    setSaving(true);
    setLocalError("");
    try {
      await onRestoreDefaultPrompt(activeItem.id);
    } catch (appError) {
      setLocalError(stringifyError(appError));
    } finally {
      setSaving(false);
    }
  }

  async function createPrompt() {
    setSaving(true);
    setLocalError("");
    try {
      await onCreatePrompt({ label: newLabel, description: newDescription, content: newContent });
      setCreateMode(false);
      setNewLabel("");
      setNewDescription("");
      setNewContent("");
    } catch (appError) {
      setLocalError(stringifyError(appError));
    } finally {
      setSaving(false);
    }
  }

  async function deletePrompt() {
    if (!activeItem || activeItem.builtIn) {
      return;
    }
    setSaving(true);
    setLocalError("");
    try {
      await onDeletePrompt(activeItem.id);
    } catch (appError) {
      setLocalError(stringifyError(appError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-hidden xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader className="flex shrink-0 flex-col gap-3 pb-3">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <CardTitle className="min-w-0 truncate text-lg">提示词</CardTitle>
            <Badge variant="outline" className="shrink-0">{items.length} 个</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={createMode ? "secondary" : "outline"} size="sm" className="min-w-0" onClick={() => setCreateMode(true)} disabled={busy || saving}>
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
                      className={cn("h-auto w-full justify-start rounded-md px-3 py-3 text-left", active && "border-primary bg-muted")}
                      onClick={() => {
                        setCreateMode(false);
                        onActivePromptIdChange(item.id);
                      }}
                    >
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold">{item.label}</span>
                          <Badge variant={item.builtIn ? "outline" : "secondary"} className="shrink-0">{item.builtIn ? "内置" : "自定义"}</Badge>
                        </span>
                        <span className="truncate text-[11px] font-medium text-muted-foreground">{item.fileName}</span>
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

      <Card className="h-full min-h-0 overflow-hidden">
        {createMode ? (
          <>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">自定义</Badge>
                    <Badge variant="outline">{contentLineCount} 行</Badge>
                  </div>
                  <CardTitle className="mt-2 text-xl">新建提示词</CardTitle>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:items-center">
                  <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={() => setCreateMode(false)} disabled={saving}>
                    <span className="min-w-0 truncate">取消</span>
                  </Button>
                  <Button type="button" size="sm" className="min-w-0" onClick={() => void createPrompt()} disabled={saving || !newContent.trim()}>
                    {saving ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                    <span className="min-w-0 truncate">保存</span>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex h-[calc(100%-7rem)] min-h-0 flex-col gap-3 px-5 pb-5">
              <FieldGroup className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>名称</FieldLabel>
                  <Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} disabled={saving} placeholder="自定义提示词" />
                </Field>
                <Field>
                  <FieldLabel>备注</FieldLabel>
                  <Input value={newDescription} onChange={(event) => setNewDescription(event.target.value)} disabled={saving} placeholder="用途或风格" />
                </Field>
              </FieldGroup>
              <Textarea
                value={newContent}
                onChange={(event) => setNewContent(event.target.value)}
                disabled={saving}
                className="min-h-0 flex-1 resize-none rounded-md border bg-muted font-mono text-[12px] leading-6"
                placeholder="写入完整 prompt 内容"
              />
            </CardContent>
          </>
        ) : activeItem ? (
          <>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{activeItem.fileName}</Badge>
                    <Badge variant="outline">{formatBytes(activeItem.sizeBytes)}</Badge>
                    <Badge variant="outline">{contentLineCount} 行</Badge>
                    <Badge variant={editable ? "secondary" : "outline"}>{editable ? "可编辑" : "锁定"}</Badge>
                  </div>
                  <CardTitle className="mt-2 text-xl">{activeItem.label}</CardTitle>
                </div>
                <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                  <Badge variant="outline" className="w-fit max-w-full">{formatDateTime(activeItem.updatedAt)}</Badge>
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={() => setDraftContent(activeItem.content)} disabled={saving || !dirty}>
                      <span className="min-w-0 truncate">还原</span>
                    </Button>
                    {activeItem.builtIn ? (
                      <Button type="button" variant="outline" size="sm" className="min-w-0" onClick={() => void restoreDefaultPrompt()} disabled={saving || !activeItem.defaultAvailable}>
                        <RefreshCw data-icon="inline-start" />
                        <span className="min-w-0 truncate">默认</span>
                      </Button>
                    ) : (
                      <Button type="button" variant="destructive" size="sm" className="min-w-0" onClick={() => void deletePrompt()} disabled={saving}>
                        <Trash2 data-icon="inline-start" />
                        <span className="min-w-0 truncate">删除</span>
                      </Button>
                    )}
                    <Button type="button" size="sm" className="min-w-0 sm:min-w-24" onClick={() => void saveActivePrompt()} disabled={saving || !editable || (!dirty && !metaDirty)}>
                      {saving ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                      <span className="min-w-0 truncate">保存</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex h-[calc(100%-7rem)] min-h-0 flex-col gap-3 px-5 pb-5">
              <FieldGroup className="grid gap-3 md:grid-cols-2">
                <Field>
                  <FieldLabel>名称</FieldLabel>
                  <Input value={draftLabel} onChange={(event) => setDraftLabel(event.target.value)} disabled={saving} />
                </Field>
                <Field>
                  <FieldLabel>备注</FieldLabel>
                  <Input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} disabled={saving} />
                </Field>
              </FieldGroup>
              <Textarea
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                disabled={saving || !editable}
                className="min-h-0 flex-1 resize-none rounded-md border bg-muted font-mono text-[12px] leading-6"
              />
            </CardContent>
          </>
        ) : (
          <CardContent className="flex h-full min-h-0 p-5">
            <Empty className="min-h-[24rem] flex-1 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <FileText />}
                </EmptyMedia>
                <EmptyTitle>{busy ? "正在读取提示词内容" : error ? "提示词读取失败" : "选择左侧提示词后查看内容"}</EmptyTitle>
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
  modelConfig,
  progress,
  roundProgressStatus,
  loadedResultRound,
  pendingAutoAction,
  promptProfile,
  promptSequence,
  promptOptions,
  promptWorkflows,
  onPromptProfileChange,
  onPromptSequenceChange,
  onModelConfigChange,
  onSaveModelConfig,
  onRefreshAllProviderModels,
  onRefreshProviderModels,
  onPickFile,
  onRunRound,
  onRefreshStatus,
  onCancelRun,
  onRejectAutoAction,
  onResetRound,
  running,
}: {
  value: DocumentStatus | null;
  busy: boolean;
  modelConfig: ModelConfig;
  progress: RoundProgress | null;
  roundProgressStatus: RoundProgressStatus | null;
  loadedResultRound: number | null;
  pendingAutoAction: PendingAutoAction | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  promptOptions: PromptOption[];
  promptWorkflows: PromptWorkflow[];
  onPromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => void;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void | Promise<void>;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
  onSaveModelConfig: (modelConfig: ModelConfig) => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  onPickFile: () => void;
  onRunRound: (modelConfig?: ModelConfig) => void;
  onRefreshStatus: () => void;
  onCancelRun: () => void;
  onRejectAutoAction: () => void;
  onResetRound: () => void;
  running: boolean;
}) {
  const [setupEditor, setSetupEditor] = useState<null | "prompt" | "model">(null);
  const [appendDraft, setAppendDraft] = useState<null | {
    promptId: PromptId;
    providerId: string;
    model: string;
  }>(null);
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
  const completedRounds = (value?.completedRounds ?? [])
    .filter((round): round is number => Number.isFinite(round))
    .sort((left, right) => left - right);
  const latestCompletedRound = completedRounds[completedRounds.length - 1] ?? null;
  const visibleResultRound = loadedResultRound ?? latestCompletedRound;
  const hasVisibleResult = Boolean(visibleResultRound);
  const resultAheadOfStatus = Boolean(value?.nextRound && visibleResultRound && visibleResultRound >= value.nextRound);
  const editablePromptProfile = getDefaultPromptProfile(promptWorkflows);
  const activeSequence = normalizePromptSequence(promptSequence, promptOptions, promptProfile, promptWorkflows);
  const activeFlowSequence = getPromptFlowSequence(promptProfile, activeSequence, promptOptions, promptWorkflows);
  const plannedRoundCount = activeFlowSequence.length;
  const hasPendingRound = Boolean(value?.hasNextRound && value.nextRound && value.nextRound <= plannedRoundCount);
  const promptSelectOptions = activeFlowSequence.reduce<PromptOption[]>((options, promptId) => {
    if (options.some((item) => item.id === promptId)) {
      return options;
    }
    return [...options, { id: promptId, label: promptId }];
  }, promptOptions);
  const sequenceLengthLimit = Math.max(1, Math.min(getPromptSequenceLimit(promptProfile, promptWorkflows), DEFAULT_PROMPT_SEQUENCE.length));
  const appendRoundLimit = Math.max(sequenceLengthLimit, getPromptRoundLimit(promptProfile, promptWorkflows));
  const sequenceLengthOptions = Array.from({ length: sequenceLengthLimit }, (_, index) => index + 1);
  const providers = modelConfig.modelProviders ?? [];
  const enabledProviders = providers.filter((provider) => provider.enabled !== false);
  const providerOptions = enabledProviders;
  const promptSummary = isPromptSequenceCustomizable(promptProfile, promptWorkflows)
    ? formatPromptSequence(activeSequence, promptSelectOptions, promptProfile, promptWorkflows)
    : getPromptProfileLabel(promptProfile, promptWorkflows);
  const modelRouteSummary = activeFlowSequence.map((promptId, index) => {
    const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
    const provider = findProviderForRoundModel(modelConfig, roundModel);
    const customRoute = Boolean(roundModel?.enabled);
    const effectiveCustomModel = roundModel?.model || provider?.defaultModel || provider?.models?.[0] || "";
    const providerUnavailable = Boolean(
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
  const activeModelRouteReady = unavailableRouteCount === 0;
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
  const activeRunStatus = roundProgressStatus?.activeRun && !roundProgressStatus.activeRun.completed ? roundProgressStatus.activeRun : null;
  const checkpointOnCurrentRound = roundCheckpointMatchesDocument(roundProgressStatus, value, promptOptions, promptWorkflows);
  const resumableCheckpoint = roundProgressStatus?.canResume
    && sameWorkspacePath(roundProgressStatus.sourcePath, value?.sourcePath)
    && roundProgressStatus.round === value?.nextRound
    && roundProgressStatus.promptProfile === promptProfile
    && promptSequencesEqual(roundProgressStatus.promptSequence, activeSequence, promptOptions, promptProfile, promptWorkflows)
    ? roundProgressStatus
    : null;
  const runRecoveryState = buildRunRecoveryPanelState({
    running,
    progress,
    activeRunStatus,
    resumableCheckpoint,
    nextRound: value?.nextRound,
  });
  const rewriteConcurrency = normalizeRewriteConcurrency(modelConfig.rewriteConcurrency);
  const currentRunCompletedChunks = progress?.completedChunks ?? progress?.currentChunk ?? 0;
  const currentRunProgressPercent = progress?.totalChunks
    ? clampPercent(Math.round((currentRunCompletedChunks / progress.totalChunks) * 100))
    : null;
  const checkpointRunLabel = resumableCheckpoint
    ? resumableCheckpoint.resumeActionLabel?.includes("收尾")
      ? "继续收尾"
      : `继续第 ${resumableCheckpoint.round ?? value?.nextRound ?? ""} 轮`
    : "";
  const waitingForStatusSync = Boolean(resultAheadOfStatus && !resumableCheckpoint && !checkpointOnCurrentRound);
  const canRefreshStatus = hasDocument && !busy && !running && !activeRunStatus;
  const canResetRound = Boolean(resumableCheckpoint || latestCompletedRound);
  const canAppendRound = Boolean(
    hasDocument
    && !hasPendingRound
    && !waitingForStatusSync
    && !busy
    && !running
    && !activeRunStatus
    && unavailableRouteCount === 0
    && isPromptSequenceCustomizable(promptProfile, promptWorkflows)
    && activeSequence.length < appendRoundLimit,
  );
  const canRunNextRound = hasPendingRound && !waitingForStatusSync && !busy && !running && !activeRunStatus && unavailableRouteCount === 0;
  const nextRoundButtonText = hasPendingRound && value?.nextRound
    ? value.nextRound > 1
        ? `继续第 ${value.nextRound} 轮`
        : `开始第 ${value.nextRound} 轮`
    : "";
  const appendRoundText = `追加第 ${activeSequence.length + 1} 轮`;
  const appendRoundNumber = activeSequence.length + 1;
  const getAppendModelOptions = (providerId: string, selectedModel = "") => {
    const currentConfig = modelConfigRef.current;
    const models = providerId === "__default"
      ? [currentConfig.model]
      : [
        providerOptions.find((item) => item.id === providerId)?.defaultModel,
        ...(providerOptions.find((item) => item.id === providerId)?.models ?? []),
      ];
    return Array.from(new Set([...models, selectedModel].map((item) => String(item ?? "").trim()).filter(Boolean)));
  };
  const getAppendDefaultRoute = () => {
    const currentConfig = modelConfigRef.current;
    const lastRoundKey = getRoundModelKey(promptProfile, activeSequence.length, promptWorkflows);
    const lastRoundModel = lastRoundKey ? currentConfig.roundModels?.[lastRoundKey] : undefined;
    const lastProvider = findProviderForRoundModel(currentConfig, lastRoundModel);
    if (lastRoundModel?.enabled && lastProvider && lastProvider.enabled !== false) {
      return {
        providerId: lastProvider.id,
        model: lastRoundModel.model || lastProvider.defaultModel || lastProvider.models?.[0] || "",
      };
    }
    return { providerId: "__default", model: currentConfig.model || "" };
  };
  const openAppendRoundDialog = () => {
    const fallbackPromptId = activeSequence[activeSequence.length - 1] ?? promptSelectOptions[0]?.id ?? "round1";
    const route = getAppendDefaultRoute();
    setAppendDraft({
      promptId: fallbackPromptId,
      providerId: route.providerId,
      model: route.model || getAppendModelOptions(route.providerId)[0] || "",
    });
  };
  const updateAppendProvider = (providerId: string) => {
    setAppendDraft((draft) => {
      if (!draft) return draft;
      const route = providerId === "__default"
        ? { providerId, model: modelConfigRef.current.model || "" }
        : {
          providerId,
          model: providerOptions.find((item) => item.id === providerId)?.defaultModel
            || providerOptions.find((item) => item.id === providerId)?.models?.[0]
            || "",
        };
      return { ...draft, providerId: route.providerId, model: route.model };
    });
  };
  const appendProvider = appendDraft?.providerId && appendDraft.providerId !== "__default"
    ? providerOptions.find((item) => item.id === appendDraft.providerId)
    : null;
  const appendPromptOptions = promptSelectOptions.length ? promptSelectOptions : [{ id: "round1", label: "round1" }];
  const appendModelOptions = appendDraft ? getAppendModelOptions(appendDraft.providerId, appendDraft.model) : [];
  const appendRouteIssues = appendDraft
    ? appendDraft.providerId === "__default"
      ? [
        !modelConfig.baseUrl?.trim() ? "默认 API 地址未填" : "",
        !modelConfig.apiKey?.trim() ? "默认 API Key 未填" : "",
        !modelConfig.model?.trim() ? "默认模型未填" : "",
      ].filter(Boolean)
      : !appendProvider ? ["服务商不可用"] : [
        !appendProvider?.baseUrl?.trim() ? "服务商 API 地址未填" : "",
        !appendProvider?.apiKey?.trim() ? "服务商 API Key 未填" : "",
        !appendDraft.model.trim() ? "本轮模型未选" : "",
      ].filter(Boolean)
    : [];
  const appendConfirmDisabled = !appendDraft || busy || running || appendRouteIssues.length > 0 || !appendDraft.promptId;
  const runButtonText = running
    ? `正在执行第 ${value?.nextRound ?? ""} 轮`
    : activeRunStatus
      ? "后台已有运行"
    : unavailableRouteCount
    ? "先修复模型路线"
    : waitingForStatusSync
      ? "刷新轮次状态"
      : hasPendingRound
        ? resumableCheckpoint
          ? checkpointRunLabel
          : nextRoundButtonText
      : canAppendRound
        ? appendRoundText
      : value
        ? "流程完成，可导出"
        : "上传后开始第 1 轮";
  const primaryRunButtonDisabled = waitingForStatusSync ? !canRefreshStatus : !(canRunNextRound || canAppendRound);
  const primaryRunButtonVariant = waitingForStatusSync || canRunNextRound || canAppendRound ? "default" : "secondary";
  const handlePrimaryRunAction = async () => {
    if (waitingForStatusSync) {
      onRefreshStatus();
      return;
    }
    if (canAppendRound) {
      openAppendRoundDialog();
      return;
    }
    onRunRound(modelConfigRef.current);
  };
  const confirmAppendRound = () => {
    if (!appendDraft || appendConfirmDisabled) {
      return;
    }
    const currentConfig = modelConfigRef.current;
    const nextRound = activeSequence.length + 1;
    const nextSequence = [...activeSequence, appendDraft.promptId].slice(0, appendRoundLimit);
    const roundKey = getRoundModelKey(promptProfile, nextRound, promptWorkflows);
    const nextRoundModels = { ...(currentConfig.roundModels ?? {}) };
    if (roundKey) {
      if (appendDraft.providerId === "__default") {
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
      } else {
        const provider = (currentConfig.modelProviders ?? []).find((item) => item.id === appendDraft.providerId && item.enabled !== false);
        if (!provider) {
          return;
        }
        nextRoundModels[roundKey] = buildRoundModelFromProvider(provider, appendDraft.model, currentConfig);
      }
    }
    const nextConfig = {
      ...currentConfig,
      promptProfile,
      promptSequence: nextSequence,
      roundModels: nextRoundModels,
    };
    modelConfigRef.current = nextConfig;
    setAppendDraft(null);
    onModelConfigChange(nextConfig);
    onRunRound(nextConfig);
  };
  const updateSequenceRound = (roundIndex: number, promptId: PromptId) => {
    const nextSequence = activeSequence.map((item, index) => (index === roundIndex ? promptId : item));
    onPromptSequenceChange(nextSequence);
  };
  const updateSequenceLength = (length: number) => {
    const fallback = activeSequence[activeSequence.length - 1] ?? promptSelectOptions[0]?.id ?? "round1";
    const nextLength = Math.max(1, Math.min(sequenceLengthLimit, length));
    const nextSequence = Array.from({ length: nextLength }, (_, index) => activeSequence[index] ?? activeFlowSequence[index] ?? fallback);
    onPromptSequenceChange(nextSequence);
  };
  const updateRoundProvider = (roundIndex: number, providerId: string) => {
    const currentConfig = modelConfigRef.current;
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1, promptWorkflows);
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
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1, promptWorkflows);
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
      const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
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
  const updateRewriteConcurrency = (nextValue: string) => {
    const nextConcurrency = normalizeRewriteConcurrency(nextValue, rewriteConcurrency);
    const nextConfig = { ...modelConfigRef.current, rewriteConcurrency: nextConcurrency };
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
              onClick={() => {
                if (promptProfile !== editablePromptProfile) {
                  onPromptProfileChange(editablePromptProfile);
                }
                setSetupEditor(setupEditor === "prompt" ? null : "prompt");
              }}
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
                    {index + 1}. {getPromptLabel(promptId, promptSelectOptions)}
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
              <div className="text-sm font-semibold">运行控制</div>
            </div>
            {hasPendingRound ? (
              <Badge variant={running ? "warning" : "outline"} className={running ? "border-destructive/30 bg-destructive/5 text-destructive" : ""}>
                {`第 ${value?.nextRound} 轮`}
              </Badge>
            ) : null}
          </div>
          {hasDocument ? (
            <>
              <RunRecoveryPanel state={running ? null : runRecoveryState} />
              <AutoRunSignal action={pendingAutoAction} onReject={onRejectAutoAction} />
              {hasVisibleResult && visibleResultRound && !running && !runRecoveryState ? (
                <Alert className="min-w-0 overflow-hidden bg-background">
                  <CheckCircle2 />
                  <AlertTitle className="truncate text-sm">第 {visibleResultRound} 轮已完成</AlertTitle>
                </Alert>
              ) : null}
              <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border bg-background p-2">
                <div className="min-w-0 text-xs font-semibold text-muted-foreground">轮内并发</div>
                  <ToggleGroup type="single" value={String(rewriteConcurrency)} onValueChange={updateRewriteConcurrency} disabled={busy || running} size="sm" className="shrink-0">
                    {REWRITE_CONCURRENCY_LEVELS.map((item) => (
                    <ToggleGroupItem key={item} value={String(item)} className="min-w-8">
                      {item}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              {progress?.totalChunks && !running && !runRecoveryState && currentRunProgressPercent != null ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">
                    <span>运行进度</span>
                    <span>{currentRunProgressPercent}%</span>
                  </div>
                  <Progress value={currentRunProgressPercent} className="h-2" />
                </div>
              ) : null}
              <div className="grid gap-2">
                {!running ? (
                  <Button
                    variant={primaryRunButtonVariant}
                    className="h-11 w-full min-w-0 overflow-hidden"
                    onClick={handlePrimaryRunAction}
                    disabled={primaryRunButtonDisabled}
                  >
                    {waitingForStatusSync ? <RefreshCw data-icon="inline-start" /> : <Wand2 data-icon="inline-start" />}
                    <span className="min-w-0 truncate">{runButtonText}</span>
                  </Button>
                ) : null}
                {running ? (
                  <Button className="h-10 min-w-0 overflow-hidden" variant="destructive" onClick={onCancelRun}><span className="min-w-0 truncate">中断当前轮</span></Button>
                ) : canResetRound ? (
                  <Button className="h-10 min-w-0 overflow-hidden" variant="outline" onClick={onResetRound} disabled={busy}>
                    <span className="min-w-0 truncate">{latestCompletedRound && !resumableCheckpoint ? "放弃已完成结果" : "放弃本轮进度"}</span>
                  </Button>
                ) : null}
              </div>
            </>
          ) : (
            <Button type="button" variant="secondary" className="h-11 w-full min-w-0 overflow-hidden" disabled>
              <Wand2 data-icon="inline-start" />
              <span className="min-w-0 truncate">{runButtonText}</span>
            </Button>
          )}
        </section>
      </CardContent>
    </Card>
    {setupEditor ? (
      <Dialog open={Boolean(setupEditor)} onOpenChange={(open) => {
        if (!open) setSetupEditor(null);
      }}>
        <DialogContent className={cn("shadcn-config-dialog grid max-h-[min(88svh,52rem)] min-w-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden p-0", setupEditor === "model" ? "sm:max-w-[720px]" : "sm:max-w-[560px]")}>
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              {setupEditor === "prompt" ? <Wand2 /> : <Settings />}
              {setupEditor === "prompt" ? "改写流程" : "模型路线"}
            </DialogTitle>
            <DialogDescription className="sr-only">{setupEditor === "prompt" ? "编辑改写流程配置。" : "编辑模型路线配置。"}</DialogDescription>
          </DialogHeader>
          <Separator />

          <ScrollArea className="shadcn-scroll-bound h-full min-h-0 min-w-0 overflow-x-hidden px-6 pb-6">
            <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-hidden">
            {setupEditor === "prompt" ? (
              <div className="flex min-w-0 max-w-full flex-col gap-4 overflow-hidden">
                <div className="min-w-0 overflow-hidden rounded-lg border bg-background p-4">
                    <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(4.5rem,1fr))]">
                      {sequenceLengthOptions.map((length) => (
                        <Button key={length} type="button" variant={activeSequence.length === length ? "default" : "outline"} size="sm" onClick={() => updateSequenceLength(length)} disabled={busy}>{length} 轮</Button>
                      ))}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {activeSequence.map((promptId, index) => (
                        <div key={`${index}-${promptId}`} className="grid gap-2">
                          <div className="text-xs font-semibold text-muted-foreground">第 {index + 1} 轮</div>
                          <Select value={promptId} onValueChange={(nextPromptId) => updateSequenceRound(index, nextPromptId as PromptId)} disabled={busy}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {promptSelectOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                </div>
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
                      <Button type="button" variant="outline" size="sm" onClick={onRefreshAllProviderModels} disabled={busy || providerOptions.length === 0}>
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
                    const promptOption = getPromptOption(promptId, promptSelectOptions);
                    const roundKey = getRoundModelKey(promptProfile, index + 1, promptWorkflows);
                    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
                    const provider = findProviderForRoundModel(modelConfig, roundModel);
                    const selectedProviderId = roundModel?.enabled && provider && provider.enabled !== false ? provider.id : "__default";
                    const selectedModels = selectedProviderId === "__default" ? [] : provider?.models?.length ? provider.models : [];
                    const selectedModelValue = selectedProviderId === "__default" ? "" : roundModel?.model || provider?.defaultModel || selectedModels[0];
                    const routeIssues = selectedProviderId === "__default"
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
                            <Button type="button" variant="outline" size="sm" className="w-fit max-w-full" onClick={() => onRefreshProviderModels(provider.id)} disabled={busy}>
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
        </DialogContent>
      </Dialog>
    ) : null}
    {appendDraft ? (
      <Dialog open={Boolean(appendDraft)} onOpenChange={(open) => {
        if (!open) setAppendDraft(null);
      }}>
        <DialogContent className="grid max-h-[min(88svh,36rem)] min-w-0 overflow-hidden p-0 sm:max-w-[520px]">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="flex items-center gap-2">
              <Plus />
              追加第 {appendRoundNumber} 轮
            </DialogTitle>
            <DialogDescription className="sr-only">配置追加轮次。</DialogDescription>
          </DialogHeader>
          <Separator />
          <FieldGroup className="px-6">
            <Field>
              <FieldLabel>提示词</FieldLabel>
              <Select value={appendDraft.promptId} onValueChange={(promptId) => setAppendDraft((draft) => (draft ? { ...draft, promptId: promptId as PromptId } : draft))}>
                <SelectTrigger><SelectValue placeholder="选择提示词" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {appendPromptOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>服务商</FieldLabel>
              <Select value={appendDraft.providerId || "__default"} onValueChange={updateAppendProvider}>
                <SelectTrigger><SelectValue placeholder="选择服务商" /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="__default">默认连接 · {modelConfig.model || "未选模型"}</SelectItem>
                    {providerOptions.map((provider) => <SelectItem key={provider.id} value={provider.id}>{provider.name || "未命名服务商"}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>模型</FieldLabel>
              {appendDraft.providerId === "__default" ? (
                <Input value={modelConfig.model || "未选模型"} readOnly disabled />
              ) : appendModelOptions.length > 0 ? (
                <Select value={appendDraft.model} onValueChange={(model) => setAppendDraft((draft) => (draft ? { ...draft, model } : draft))}>
                  <SelectTrigger><SelectValue placeholder="选择模型" /></SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {appendModelOptions.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={appendDraft.model} onChange={(event) => setAppendDraft((draft) => (draft ? { ...draft, model: event.target.value } : draft))} placeholder="填写模型名称" />
              )}
            </Field>
            {appendRouteIssues.length ? (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>{appendRouteIssues[0]}</AlertTitle>
              </Alert>
            ) : null}
          </FieldGroup>
          <DialogFooter className="px-6 pb-6">
            <Button type="button" variant="outline" onClick={() => setAppendDraft(null)}>取消</Button>
            <Button type="button" onClick={confirmAppendRound} disabled={appendConfirmDisabled}>
              <Wand2 data-icon="inline-start" />
              开始追加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ) : null}
    </>
  );
}

function RoundRunStatusCard({
  progress,
  configuredConcurrency,
  runtimeLabel,
  cancelRequested,
  onCancel,
}: {
  progress: RoundProgress | null;
  configuredConcurrency: number;
  runtimeLabel: string;
  cancelRequested: boolean;
  onCancel: () => void;
}) {
  const totalChunks = Math.max(0, Number(progress?.totalChunks ?? 0) || 0);
  const completedSource = progress?.completedChunks ?? (progress?.phase === "chunk-complete" ? progress.currentChunk : 0) ?? 0;
  const completedChunks = Math.max(0, Number(completedSource) || 0);
  const safeCompletedChunks = totalChunks ? Math.min(completedChunks, totalChunks) : completedChunks;
  const activeChunks = Math.max(0, Number(progress?.activeChunks ?? 0) || 0);
  const queuedChunks = Math.max(0, Number(progress?.queuedChunks ?? 0) || 0);
  const remainingChunks = totalChunks ? Math.max(0, totalChunks - safeCompletedChunks) : activeChunks + queuedChunks;
  const configuredConcurrencyValue = normalizeRewriteConcurrency(progress?.configuredConcurrency ?? configuredConcurrency);
  const actualConcurrency = progress?.concurrency ? normalizeRewriteConcurrency(progress.concurrency, configuredConcurrencyValue) : null;
  const concurrencyLabel = String(configuredConcurrencyValue);
  const concurrencyDetail = actualConcurrency && actualConcurrency !== configuredConcurrencyValue ? `实际 ${actualConcurrency}` : "已配置";
  const percent = totalChunks ? clampPercent(Math.round((safeCompletedChunks / totalChunks) * 100)) : 0;
  const failed = progress?.phase === "chunk-failed";
  const errorBrief = progress ? formatProviderErrorBrief(progress) : "";
  const restoring = progress?.phase === "restoring-output";
  const statusLabel = cancelRequested || progress?.phase === "cancel-requested"
    ? "中断中"
    : failed
      ? "异常"
      : restoring
        ? "收尾"
        : "运行中";

  return (
    <Card className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 p-4 pb-3">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">轮次运行中</CardTitle>
          </div>
          <Badge variant={failed ? "danger" : cancelRequested ? "warning" : "secondary"} className="shrink-0">
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4 pt-0">
        <Alert variant={failed ? "destructive" : "default"} className="min-w-0 overflow-hidden bg-background">
          {failed ? <AlertCircle /> : <Activity />}
          <AlertTitle className="truncate text-sm">{runtimeLabel || "等待进度"}</AlertTitle>
          {totalChunks || errorBrief ? (
            <AlertDescription className="flex flex-col gap-2 pt-2">
              {errorBrief ? <span className="truncate text-xs">{errorBrief}</span> : null}
              {totalChunks ? <Progress value={percent} className="h-2" /> : null}
            </AlertDescription>
          ) : null}
        </Alert>

        <div className="grid shrink-0 grid-cols-3 gap-2">
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground">已完成</div>
            <div className="mt-1 text-lg font-semibold">{totalChunks ? `${safeCompletedChunks}/${totalChunks}` : safeCompletedChunks}</div>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground">剩余</div>
            <div className="mt-1 text-lg font-semibold">{remainingChunks}</div>
          </div>
          <div className="rounded-lg border bg-background p-3">
            <div className="text-xs font-medium text-muted-foreground">并发</div>
            <div className="mt-1 text-lg font-semibold">{concurrencyLabel}</div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{concurrencyDetail}</div>
          </div>
        </div>

        <div className="mt-auto shrink-0">
          <Button type="button" variant="destructive" className="w-full min-w-0 overflow-hidden" onClick={onCancel} disabled={cancelRequested}>
            {cancelRequested ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <X data-icon="inline-start" />}
            <span className="min-w-0 truncate">{cancelRequested ? "正在中断" : "中断当前轮"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
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
  const diagnosticTasks = buildDiagnosticTaskItems(value);
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
      hasBaseUrl: value.config.hasBaseUrl,
      hasApiKey: value.config.hasApiKey,
      apiType: value.config.apiType,
      model: value.config.model ? "<configured>" : "",
      promptProfile: value.config.promptProfile,
      promptSequence: value.config.promptSequence,
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
    taskCount: value.taskCount ?? diagnosticTasks.length,
    recentTaskCount: value.recentTaskCount ?? value.recentTasks?.length ?? diagnosticTasks.filter((item) => !isDiagnosticTaskActive(item)).length,
    tasks: diagnosticTasks.map((item) => ({
      runId: item.runId,
      taskType: item.taskType,
      taskGroup: item.taskGroup,
      active: isDiagnosticTaskActive(item),
      status: item.status,
      completed: item.completed,
      cancelRequested: item.cancelRequested,
      restoredFromDisk: item.restoredFromDisk,
      targetPath: redactLocalPath(getTaskItemString(item, "targetPath")),
      updatedAt: getTaskItemString(item, "updatedAt"),
      persistedAt: getTaskItemString(item, "persistedAt"),
      sortAt: getTaskItemString(item, "sortAt"),
    })),
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
  const taskItems = buildDiagnosticTaskItems(value);
  const activeTaskCount = value?.tasks?.length ? taskItems.filter(isDiagnosticTaskActive).length : (value?.activeRunCount ?? 0) + activeBatchRerunCount;
  const recentTaskCount = value?.recentTaskCount ?? value?.recentTasks?.length ?? recentRunCount + recentBatchRerunCount;
  const taskStateStore = value?.taskStateStore;
  const configReady = value ? Boolean(value.config.hasBaseUrl && value.config.hasApiKey && value.config.model) : false;
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = async () => {
    if (!value) return;
    await copyTextToClipboard(JSON.stringify(buildShareableDiagnostics(value), null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <Card className="overflow-hidden">
        <CardHeader className="border-b px-4 py-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant}>{statusText}</Badge>
                {value ? <Badge variant="outline">{formatDateTime(value.createdAt)}</Badge> : null}
              </div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Activity />
                启动诊断
              </CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()} disabled={!value}>
                {copied ? <CheckCircle2 data-icon="inline-start" /> : <FileText data-icon="inline-start" />}
                {copied ? "已复制" : "复制诊断"}
              </Button>
              <Button size="sm" onClick={onRefresh} disabled={busy}>
                {busy ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
                重新自检
              </Button>
            </div>
          </div>
        </CardHeader>
        {value ? (
          <CardContent className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-4">
            <DiagnosticSummaryTile label="自检项" value={`${passedCount}/${checks.length}`} detail={errorCount || warningCount ? "有项目需要确认" : "全部可用"} />
            <DiagnosticSummaryTile label="模型连接" value={configReady ? "可启动" : "待补全"} detail={value.config.model || "未选择模型"} />
            <DiagnosticSummaryTile label="后台任务" value={`${activeTaskCount} 运行中`} detail={`${recentTaskCount} 条近期记录`} />
            <DiagnosticSummaryTile label="快照" value={taskStateStore ? `${taskStateStore.fileCount} 个` : "未返回"} detail={taskStateStore ? `${taskStateStore.staleCount} 个可清理` : "等待后端状态"} />
          </CardContent>
        ) : null}
      </Card>

      {value ? (
        <ScrollArea className="min-h-0 pr-1">
          <div className="flex flex-col gap-3 pb-2">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
              <Card>
                <CardHeader className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">需要处理</CardTitle>
                    <Badge variant={problemChecks.length ? "warning" : "success"}>{problemChecks.length ? `${problemChecks.length} 项` : "干净"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  {problemChecks.length ? (
                    <div className="grid gap-2">
                      {problemChecks.map((item) => (
                        <Alert key={item.key} variant={item.level === "error" ? "destructive" : undefined} className={cn("py-3", item.level === "warning" && "border-primary/25 bg-muted/60")}>
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
                    <Empty className="min-h-[8rem] border">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                        <EmptyTitle>没有待处理项</EmptyTitle>
                      </EmptyHeader>
                    </Empty>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-base">自检明细</CardTitle>
                    <Badge variant="outline">{healthPercent}%</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
                  <Progress value={healthPercent} className="h-2" />
                  <div className="grid gap-2 sm:grid-cols-2">
                    {checks.map((item) => (
                      <DiagnosticCheckCard key={item.key} item={item} />
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_390px]">
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-base">工作目录</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-0">
                  <div className="overflow-hidden rounded-lg border bg-card">
                    {value.paths.map((item, index) => (
                      <Fragment key={item.key}>
                        {index ? <Separator /> : null}
                        <div className="grid gap-2 p-3 text-xs md:grid-cols-[150px_minmax(0,1fr)_140px] md:items-center">
                          <div>
                            <div className="font-semibold text-foreground">{item.label}</div>
                            <Badge className="mt-1" variant={item.exists && item.writable ? "success" : item.exists ? "warning" : "danger"}>
                              {item.exists ? item.writable ? "可写" : "不可写" : "不存在"}
                            </Badge>
                          </div>
                          <div className="min-w-0 truncate text-muted-foreground">{item.path}</div>
                          <div className="font-semibold text-foreground md:text-right">{item.fileCount} 文件 · {formatBytes(item.sizeBytes)}</div>
                        </div>
                      </Fragment>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-3">
                <Card>
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-base">模型配置</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 pb-4 pt-0 text-xs">
                    <DiagnosticRow label="运行模式" value="远程模型" />
                    <DiagnosticRow label="默认模型" value={value.config.model || "未填写"} />
                    <DiagnosticRow label="接口" value={value.config.hasBaseUrl ? "已填写" : "缺少 Base URL"} />
                    <DiagnosticRow label="密钥" value={value.config.hasApiKey ? "已填写" : "缺少 API Key"} />
                    <DiagnosticRow label="服务商仓库" value={`保存 ${value.config.providerCount} · 启用 ${value.config.enabledProviderCount}`} />
                    <DiagnosticRow label="轮次专属配置" value={`${value.config.customRoundCount} 轮`} />
              <DiagnosticRow label="轮内并发" value={`${value.config.rewriteConcurrency ?? 2}/${value.config.maxRewriteConcurrency ?? MAX_REWRITE_CONCURRENCY}`} />
              <DiagnosticRow label="超时/重试" value={`${value.config.effectiveRewriteTimeoutSeconds ?? value.config.requestTimeoutSeconds ?? "-"}s / ${value.config.maxRetries ?? "-"} 次`} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="px-4 py-3">
                    <CardTitle className="text-base">运行时</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 pb-4 pt-0 text-xs">
                    <DiagnosticRow label="Python" value={value.runtime.pythonVersion || "未返回"} />
                    <DiagnosticRow label="解释器" value={value.runtime.pythonExecutable || "未返回"} />
                    <DiagnosticRow label="平台" value={value.runtime.platform || "未返回"} />
                  </CardContent>
                </Card>
              </div>
            </div>

            {taskStateStore ? (
              <Card>
                <CardHeader className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <CardTitle className="text-base">任务快照治理</CardTitle>
                    <Button variant="outline" size="sm" onClick={onCleanupTaskSnapshots} disabled={busy || taskStateStore.staleCount <= 0}>
                      <Trash2 data-icon="inline-start" />
                      清理过期快照
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 px-4 pb-4 pt-0">
                  <div className="grid gap-2 md:grid-cols-4">
                    <DiagnosticSummaryTile label="文件" value={`${taskStateStore.fileCount} · ${formatBytes(taskStateStore.sizeBytes)}`} detail="本地快照" />
                    <DiagnosticSummaryTile label="快照分布" value={`${taskStateStore.runRoundCount} / ${taskStateStore.batchRerunCount}`} detail="改写 / 局部优化" />
                    <DiagnosticSummaryTile label="保护中" value={`${taskStateStore.activeSnapshotCount}`} detail="运行态保留" />
                    <DiagnosticSummaryTile label="可清理" value={`${taskStateStore.staleCount}`} detail="过期快照" />
                  </div>
                  <div className="truncate text-[11px] font-medium text-muted-foreground">{taskStateStore.path}</div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">后台任务</CardTitle>
                  <Badge variant={activeTaskCount ? "warning" : "outline"}>{activeTaskCount ? "有任务运行" : "空闲"}</Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {taskItems.length ? (
                  <div className="overflow-hidden rounded-lg border bg-card">
                    {taskItems.map((item, index) => (
                      <Fragment key={`${item.taskType}-${item.runId}`}>
                        {index ? <Separator /> : null}
                        <DiagnosticTaskAlert item={item} />
                      </Fragment>
                    ))}
                  </div>
                ) : (
                  <Empty className="min-h-[8rem] border">
                    <EmptyHeader>
                      <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                      <EmptyTitle>暂无后台任务</EmptyTitle>
                    </EmptyHeader>
                  </Empty>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      ) : (
        <Empty className="min-h-0 border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Activity /></EmptyMedia>
            <EmptyTitle>等待自检</EmptyTitle>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}

function DiagnosticSummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border bg-background px-3 py-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-lg font-semibold text-foreground">{value}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function DiagnosticCheckCard({ item }: { item: EnvironmentDiagnostics["checks"][number] }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-2 rounded-md border bg-card px-3 py-2", item.level === "error" && "border-destructive/30 bg-destructive/5", item.level === "warning" && "border-primary/25 bg-muted/60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 font-semibold text-foreground">{item.label}</div>
        <Badge className="shrink-0" variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "success" ? "通过" : item.level === "error" ? "错误" : item.level === "warning" ? "提示" : "信息"}</Badge>
      </div>
      <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">{item.message}</div>
    </div>
  );
}

type DiagnosticTaskItem = NonNullable<EnvironmentDiagnostics["tasks"]>[number];

function buildDiagnosticTaskItems(value: EnvironmentDiagnostics | null): DiagnosticTaskItem[] {
  if (!value) {
    return [];
  }
  const backendItems = value.tasks ?? [];
  if (backendItems.length) {
    return [...backendItems].sort(compareDiagnosticTasks);
  }
  const fallbackItems: DiagnosticTaskItem[] = [
    ...value.activeRuns.map((item) => ({
      ...item,
      taskType: "run-round",
      taskGroup: "active",
      targetPath: item.sourcePath,
      active: true,
      sortAt: item.updatedAt,
    })),
    ...(value.activeBatchReruns ?? []).map((item) => ({
      ...item,
      taskType: "batch-rerun",
      taskGroup: "active",
      targetPath: item.outputPath,
      active: true,
      sortAt: item.updatedAt,
    })),
    ...(value.recentRuns ?? []).map((item) => ({
      ...item,
      taskType: "run-round",
      taskGroup: "recent",
      targetPath: item.sourcePath,
      active: false,
      sortAt: item.persistedAt || item.updatedAt,
    })),
    ...(value.recentBatchReruns ?? []).map((item) => ({
      ...item,
      taskType: "batch-rerun",
      taskGroup: "recent",
      targetPath: item.outputPath,
      active: false,
      sortAt: item.persistedAt || item.updatedAt,
    })),
  ];
  return fallbackItems.sort(compareDiagnosticTasks);
}

function compareDiagnosticTasks(left: DiagnosticTaskItem, right: DiagnosticTaskItem): number {
  if (isDiagnosticTaskActive(left) !== isDiagnosticTaskActive(right)) {
    return isDiagnosticTaskActive(left) ? -1 : 1;
  }
  return getTaskItemString(right, "sortAt").localeCompare(getTaskItemString(left, "sortAt"));
}

function isDiagnosticTaskActive(item: DiagnosticTaskItem): boolean {
  return Boolean(item.active || getTaskItemString(item, "taskGroup") === "active");
}

function getTaskItemString(item: DiagnosticTaskItem, key: string): string {
  const value = item[key];
  return typeof value === "string" ? value : "";
}

function getTaskItemNumber(item: DiagnosticTaskItem, key: string): number | null {
  const value = item[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTaskItemRecord(item: DiagnosticTaskItem, key: string): Record<string, unknown> | null {
  const value = item[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function getDiagnosticTaskStatus(item: DiagnosticTaskItem): string {
  const status = getTaskItemString(item, "status");
  if (Boolean(item.cancelRequested)) {
    return "停止中";
  }
  if (isDiagnosticTaskActive(item)) {
    return status === "canceling" ? "停止中" : "运行中";
  }
  if (!item.completed) {
    return "未完成";
  }
  if (status === "interrupted") {
    return "已中断";
  }
  if (status === "failed") {
    return "失败";
  }
  if (status === "canceled") {
    return "已停止";
  }
  return status || "已记录";
}

function getDiagnosticTaskBadgeVariant(item: DiagnosticTaskItem): ComponentProps<typeof Badge>["variant"] {
  const status = getTaskItemString(item, "status");
  if (status === "failed") {
    return "danger";
  }
  if (status === "interrupted" || Boolean(item.cancelRequested) || isDiagnosticTaskActive(item) || !item.completed) {
    return "warning";
  }
  return "outline";
}

function DiagnosticTaskAlert({ item }: { item: DiagnosticTaskItem }) {
  const isBatch = getTaskItemString(item, "taskType") === "batch-rerun";
  const active = isDiagnosticTaskActive(item);
  const status = getDiagnosticTaskStatus(item);
  const lastEvent = getTaskItemRecord(item, "lastEvent");
  const targetPath = getTaskItemString(item, "targetPath") || getTaskItemString(item, "sourcePath") || getTaskItemString(item, "outputPath");
  const updatedAt = getTaskItemString(item, "persistedAt") || getTaskItemString(item, "updatedAt") || getTaskItemString(item, "createdAt");
  const totalCount = getTaskItemNumber(item, "totalCount");
  const completedCount = getTaskItemNumber(item, "completedCount");
  const successCount = getTaskItemNumber(item, "successCount");
  const failureCount = getTaskItemNumber(item, "failureCount");
  const eventCount = getTaskItemNumber(item, "eventCount");
  const phase = typeof lastEvent?.phase === "string" ? lastEvent.phase : "";
  const chunkId = typeof lastEvent?.chunkId === "string" ? lastEvent.chunkId : getTaskItemString(item, "currentChunkId");
  const error = getTaskItemString(item, "error");

  return (
    <div className={cn("flex gap-3 p-3", (getTaskItemString(item, "status") === "interrupted" || active) && "bg-muted/60")}>
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
        {active ? <Activity /> : <Clock3 />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold text-foreground">
          <span className="min-w-0 truncate">后台任务 · {formatShortTaskId(item.runId) ?? item.runId}</span>
          <span className="flex shrink-0 flex-wrap items-center gap-2">
            <Badge variant="outline">{isBatch ? "局部优化" : "全文改写"}</Badge>
            <Badge variant={getDiagnosticTaskBadgeVariant(item)}>{status}</Badge>
          </span>
        </div>
        <div className="grid gap-1 pt-1 text-xs text-muted-foreground">
          <span className="truncate font-medium">{targetPath || "未返回路径"}</span>
          {isBatch && totalCount !== null ? (
            <span>
              {completedCount ?? 0}/{totalCount} 段 · 成功 {successCount ?? 0} · 失败 {failureCount ?? 0}
              {chunkId ? ` · 当前 ${chunkId}` : ""}
            </span>
          ) : (
            <span>
              事件 {eventCount ?? 0} 个
              {phase ? ` · 阶段 ${phase}` : ""}
              {chunkId ? ` · 块 ${chunkId}` : ""}
            </span>
          )}
          {error ? <span className="rounded-md border bg-card px-3 py-2 text-[11px] text-muted-foreground">{error}</span> : null}
          <span>{active ? "更新" : "落盘"} {formatDateTime(updatedAt)}</span>
        </div>
      </div>
    </div>
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
                      {visibleSegmentSummaries.map(({ segment, strongCount, reviewCount, weakCount, bestMatch, matchState }) => (
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

  return (
    <div className="grid gap-5">
      <Card className="border-border bg-card shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <CardTitle>改写检查</CardTitle>
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
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card className="border-border bg-card shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">结构保护</CardTitle>
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
  const taskCountText = taskItems.length ? `${taskItems.length} 任务` : "无任务";

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <SheetContent
        aria-modal={true}
        side="right"
        className="flex w-[min(96vw,34rem)] min-w-0 max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-0 sm:max-w-none [&>button]:hidden"
      >
        <SheetHeader className="min-w-0 overflow-hidden border-b px-4 py-4 text-left">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 overflow-hidden">
              <SheetTitle className="flex min-w-0 items-center gap-2">
                <Bell />
                <span className="min-w-0 truncate">通知与任务中心</span>
              </SheetTitle>
              <SheetDescription className="sr-only">查看运行任务和最近通知。</SheetDescription>
            </div>
            <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose} aria-label="关闭通知与任务中心">
              <X data-icon="inline-start" />
            </Button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 overflow-hidden">
            <div className="flex min-w-0 flex-wrap gap-2 text-xs">
              <Badge variant={runningTaskCount ? "warning" : "outline"}>{runningTaskCount} 运行中</Badge>
              <Badge variant="outline">{taskCountText}</Badge>
              <Badge variant="outline">{items.length} 通知</Badge>
              {unreadCount ? <Badge variant="secondary">{unreadCount} 未读</Badge> : null}
              {errorCount ? <Badge variant="warning">{errorCount} 错误</Badge> : null}
            </div>
            <Button variant="outline" size="sm" onClick={onClear} disabled={!items.length}>
              清空
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-x-hidden">
          <div className="flex min-w-0 max-w-full flex-col gap-5 overflow-x-hidden p-4">
            <section data-ui-section="runtime-task-center" className="flex min-w-0 flex-col gap-3 overflow-hidden">
              <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <Activity />
                  <span className="min-w-0 truncate">运行任务</span>
                </div>
                <Badge className="shrink-0" variant={runningTaskCount ? "warning" : "outline"}>
                  {runningTaskCount ? `${runningTaskCount} 个运行中` : "无运行任务"}
                </Badge>
              </div>

              {taskItems.length ? (
                  <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-card">
                  {taskItems.map((item, index) => (
                    <Fragment key={item.id}>
                      {index ? <Separator /> : null}
                      <div className={cn("flex flex-col gap-3 p-3", item.tone === "red" && "bg-destructive/5")}>
                        <div className="flex min-w-0 items-start gap-3 overflow-hidden">
                          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                            {item.running ? <Loader2 className={LOADING_ICON_CLASS_NAME} /> : <Clock3 />}
                          </div>
                          <div className="min-w-0 flex-1 overflow-hidden">
                            <div className="flex min-w-0 items-start justify-between gap-3 overflow-hidden">
                              <div className="min-w-0 break-words text-sm font-semibold leading-5">{item.title}</div>
                              <Badge className="shrink-0" variant={item.tone === "red" ? "danger" : "outline"}>{item.status}</Badge>
                            </div>
                            {typeof item.percent === "number" ? (
                              <div className="mt-2 flex min-w-0 items-center gap-2">
                                <Progress value={clampPercent(item.percent)} className="h-1.5 min-w-0 flex-1" />
                                <span className="w-10 shrink-0 text-right text-xs font-medium text-muted-foreground">{clampPercent(item.percent)}%</span>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {item.onAction || item.onCancel ? (
                          <div className="flex min-w-0 flex-wrap justify-end gap-2">
                            {item.onAction && item.actionLabel ? (
                              <Button type="button" variant="outline" size="sm" className="max-w-full min-w-0 overflow-hidden" onClick={item.onAction}>
                                <span className="min-w-0 truncate">{item.actionLabel}</span>
                              </Button>
                            ) : null}
                            {item.onCancel && item.cancelLabel ? (
                              <Button type="button" variant="destructive" size="sm" className="max-w-full min-w-0 overflow-hidden" onClick={item.onCancel}>
                                <span className="min-w-0 truncate">{item.cancelLabel}</span>
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </Fragment>
                  ))}
                </div>
              ) : (
                <Empty className="min-h-[8rem] border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><CheckCircle2 /></EmptyMedia>
                    <EmptyTitle>当前没有运行或待继续的任务</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </section>

            <section className="flex min-w-0 flex-col gap-3 overflow-hidden">
              <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground">
                  <Bell />
                  <span className="min-w-0 truncate">历史通知</span>
                </div>
                <Badge className="shrink-0" variant="outline">{items.length} 条</Badge>
              </div>

              {items.length ? (
                <div className="min-w-0 max-w-full overflow-hidden rounded-lg border bg-card">
                  {items.map((item, index) => {
                    const isError = item.kind === "error";
                    return (
                      <Fragment key={item.id}>
                        {index ? <Separator /> : null}
                        <div className={cn("min-w-0 max-w-full overflow-hidden p-3", isError && "bg-destructive/5")}>
                          <div className="flex min-w-0 max-w-full items-start gap-3 overflow-hidden">
                            <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                              {isError ? <AlertCircle /> : <CheckCircle2 />}
                            </div>
                            <div className="min-w-0 max-w-full flex-1 overflow-hidden">
                              <div className="flex min-w-0 items-center justify-between gap-3 overflow-hidden">
                                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                                  {!item.read ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                                  <div className="min-w-0 truncate text-sm font-semibold">{item.title}</div>
                                </div>
                                <div className="shrink-0 text-xs text-muted-foreground">{formatNotificationTime(item.time)}</div>
                              </div>
                              <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{item.text}</p>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <Empty className="min-h-[8rem] border bg-background">
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><Bell /></EmptyMedia>
                    <EmptyTitle>暂无通知</EmptyTitle>
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
