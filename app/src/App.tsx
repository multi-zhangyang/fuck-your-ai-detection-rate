import { startTransition, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Activity,
  Bell,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  History,
  Home,
  BarChart3,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Route,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";

import { DocumentCard } from "@/components/DocumentCard";
import { HistoryCard } from "@/components/HistoryCard";
import { ModelConfigCard, SchoolFormatCard } from "@/components/ModelConfigCard";
import { ProtectionMapCard } from "@/components/ProtectionMapCard";
import { DiffReviewCard, ResultCard, type DiffFilterMode, type DiffFocusRequest } from "@/components/ResultCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppState } from "@/hooks/useAppState";
import type { AppService } from "@/lib/appService";
import { getTaskPhaseLabel, isTaskBlocking, isTaskRunningPhase, type TaskPhase } from "@/lib/taskState";
import type { BatchRerunResult, BatchRerunStatus, BatchRerunTarget, DeleteHistoryOptions, DetectionReport, DetectionReportMatch, DetectionReportProvider, DocumentStatus, EnvironmentDiagnostics, ExperimentRecord, ExperimentRecordInput, ExportResult, FormatParserModelRoute, FormatRules, HistoryDeleteImpact, HistoryDeleteMode, HistoryDocumentSummary, HistoryOrphanScanResult, HistoryRound, ModelCatalogResult, ModelConfig, ModelProviderConfig, PromptId, PromptPreviewResponse, RerunChunkResult, ReviewDecision, RoundCompareData, RoundModelConfig, RoundProgress, RoundProgressStatus, RoundResult, RunAuditSummary } from "@/types/app";

const PREVIEW_MAX_CHARS = 12000;
const FORMAT_RULE_DRAFT_KEY = "fyadr.formatRuleDraft";
const FORMAT_RULE_PENDING_KEY = "fyadr.formatRulePending";
const FORMAT_RULE_ACTIVE_KEY = "fyadr.formatRuleActive";
const FORMAT_RULE_MODEL_ROUTE_KEY = "fyadr.formatRuleModelRoute";
const FORMAT_PARSER_DEFAULT_PROVIDER_ID = "__default";
const ACTIVE_DOCUMENT_KEY = "fyadr.activeDocument";
const ACTIVE_PROMPT_PROFILE_KEY = "fyadr.activePromptProfile";
const ACTIVE_PROMPT_SEQUENCE_KEY = "fyadr.activePromptSequence";
const DETECTION_REPORT_KEY = "fyadr.detectionReport";
const NOTIFICATION_HISTORY_KEY = "fyadr.notificationHistory";
const BATCH_RERUN_POLL_INTERVAL_MS = 1200;

type Props = {
  service: AppService;
  pickerLabel?: string;
};

type WorkbenchView = "home" | "diff" | "quality" | "experiment" | "model" | "prompts" | "format" | "protection" | "history" | "diagnostics";
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

function buildDiffDashboardStats(
  compareData: RoundCompareData | null,
  failures: DiffFailureLike[],
  matchesByChunk: Record<string, DetectionReportMatch[]>,
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
  const candidateChunkIds = compareData.chunks
    .filter((chunk) => (chunk.rejectedCandidates?.length ?? 0) > 0 || ((failureByChunk.get(chunk.chunkId)?.rejectedCandidates?.length ?? 0) > 0))
    .map((chunk) => chunk.chunkId);
  const reviewChunkIds = compareData.chunks
    .filter((chunk) => {
      const flags = chunk.quality?.flags ?? [];
      const reportMatches = matchesByChunk[chunk.chunkId] ?? [];
      return Boolean(chunk.quality?.needsReview)
        || chunk.fallbackMode === "source"
        || flags.includes("source_fallback")
        || failureByChunk.has(chunk.chunkId)
        || candidateChunkIds.includes(chunk.chunkId)
        || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review");
    })
    .map((chunk) => chunk.chunkId);
  const failedChunkIds = failures.map((failure) => failure.chunkId);
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

function getRuntimeTaskCardClass(tone: RuntimeTaskTone): string {
  const classes: Record<RuntimeTaskTone, string> = {
    amber: "border-amber-100 bg-amber-50/75 text-amber-950",
    blue: "border-blue-100 bg-blue-50/75 text-blue-950",
    emerald: "border-emerald-100 bg-emerald-50/75 text-emerald-950",
    red: "border-red-100 bg-red-50/75 text-red-950",
    slate: "border-slate-100 bg-slate-50/75 text-slate-950",
  };
  return classes[tone];
}

function getRuntimeTaskIconClass(tone: RuntimeTaskTone): string {
  const classes: Record<RuntimeTaskTone, string> = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    emerald: "bg-emerald-100 text-emerald-700",
    red: "bg-red-100 text-red-700",
    slate: "bg-white text-slate-600",
  };
  return classes[tone];
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem("fyadr.sidebarCollapsed") === "1");
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const [currentRunToken, setCurrentRunToken] = useState<string | null>(null);
  const [currentBatchRerunToken, setCurrentBatchRerunToken] = useState<string | null>(null);
  const [roundProgressStatus, setRoundProgressStatus] = useState<RoundProgressStatus | null>(null);
  const [taskPhase, setTaskPhase] = useState<TaskPhase>("idle");
  const [modelConfigReady, setModelConfigReady] = useState(false);
  const [historyListReady, setHistoryListReady] = useState(false);
  const [detectionReport, setDetectionReport] = useState<DetectionReport | null>(() => loadStoredDetectionReportForDocument(localStorage.getItem(ACTIVE_DOCUMENT_KEY)));
  const [experimentRecords, setExperimentRecords] = useState<ExperimentRecord[]>([]);
  const [experimentRecordsPath, setExperimentRecordsPath] = useState("");
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
  const diffDashboardStats = useMemo(
    () => buildDiffDashboardStats(activeCompareData, activeRerunFailures, detectionMatchesByChunk),
    [activeCompareData, activeRerunFailures, detectionMatchesByChunk],
  );
  const currentNotification = error
    ? createNotification("error", error)
    : notice
      ? createNotification("success", notice)
      : null;
  const unreadNotificationCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    localStorage.setItem("fyadr.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

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

  function dismissCurrentNotification() {
    setError("");
    setNotice("");
    notificationMessageKeyRef.current = "";
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
          return [chunkId, decision];
        }
        if (decision === "source") return [chunkId, "source_confirmed" as ReviewDecision];
        if (decision === "rewrite") return [chunkId, "rewrite_confirmed" as ReviewDecision];
        return [chunkId, decision];
      }),
    );
  }

  function normalizeReviewDecisionsForExport(decisions: Record<string, ReviewDecision>): Record<string, ReviewDecision> {
    return Object.fromEntries(
      Object.entries(decisions).map(([chunkId, decision]) => {
        if (typeof decision === "object" && decision?.mode === "custom" && decision.text.trim()) {
          return [chunkId, decision];
        }
        return [chunkId, decision === "source" || decision === "source_confirmed" ? "source" : "rewrite"];
      }),
    );
  }

  function scheduleReviewDecisionSave(outputPath: string, decisions: Record<string, ReviewDecision>) {
    if (reviewSaveTimerRef.current !== null) {
      window.clearTimeout(reviewSaveTimerRef.current);
    }
    reviewSaveTimerRef.current = window.setTimeout(() => {
      reviewSaveTimerRef.current = null;
      void service.saveReviewDecisions(outputPath, normalizeReviewDecisionsForExport(decisions)).catch((appError) => {
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
    let cancelled = false;

    async function bootstrapExperiments() {
      try {
        const result = await service.listExperimentRecords();
        if (!cancelled) {
          setExperimentRecords(result.items);
          setExperimentRecordsPath(result.path);
        }
      } catch {
        // Experiment records are auxiliary; keep the main app usable.
      }
    }

    void bootstrapExperiments();

    return () => {
      cancelled = true;
    };
  }, [service]);

  useEffect(() => {
    if (!documentStatus?.docId) {
      return;
    }
    void refreshExperimentRecords();
  }, [documentStatus?.docId]);

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

  async function refreshExperimentRecords(docId?: string) {
    const result = await service.listExperimentRecords(docId);
    setExperimentRecords(result.items);
    setExperimentRecordsPath(result.path);
    return result.items;
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
      description: "只会删除项目目录中未被历史记录、当前文档或复盘记录引用的源文档副本和生成产物。",
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
      setNotice(`模型配置已保存，当前模式为 ${describePromptProfile(saved.promptProfile)}。`);
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
    } catch (appError) {
      if (isActiveRunSession(runSession)) {
        await releaseProgressListener();
        visibleProgressRef.current = null;
        setProgress(null);
      }
      const runMessage = stringifyError(appError);
      setError(runMessage);
      setRuntimeStep(runMessage.includes("Unknown run id") ? "后台任务已结束，请刷新文档状态" : "后台轮次监听失败");
      if (activeRun.sourcePath) {
        try {
          await refreshDocumentState(activeRun.sourcePath);
          await refreshHistoryList();
        } catch {
          // Keep the original run error visible.
        }
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
      const runConfig = modelConfig;
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
    } catch (appError) {
      if (isActiveRunSession(runSession)) {
        await releaseProgressListener();
        visibleProgressRef.current = null;
        setProgress(null);
      }
      const runMessage = stringifyError(appError);
      const interrupted = runMessage.includes("当前轮次已中断") || runMessage.includes("interrupted by user");
      const resumable = interrupted || runMessage.includes("断点续跑") || runMessage.includes("已完成的分块会保留") || runMessage.includes("Completed chunks are kept");
      if (interrupted) {
        setError("");
        setNotice(runMessage);
        setRuntimeStep("当前轮次已中断，可继续执行");
      } else {
        setError(runMessage);
        setRuntimeStep(resumable ? "执行中断，可尝试续跑" : "执行轮次失败");
      }
      if (documentStatus?.sourcePath) {
        try {
          await refreshDocumentState(documentStatus.sourcePath);
          await refreshHistoryList();
        } catch {
          // Keep the original run error visible; refresh can be retried by the next action.
        }
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
      details: ["后续再次运行该轮时，会从该轮开头重新生成。"],
      confirmLabel: "确认放弃",
      cancelLabel: "保留断点",
      tone: "warning",
    });
    if (!confirmed) {
      return;
    }
    const taskTicket = beginTask("resetting-round");
    try {
      await releaseProgressListener();
      await service.resetRoundProgress(documentStatus.sourcePath, modelConfig.promptProfile, documentStatus.nextRound, modelConfig.promptSequence);
      setProgress(null);
      clearLoadedRoundSnapshot();
      await refreshDocumentState(documentStatus.sourcePath);
      await refreshHistoryList();
      setNotice(`第 ${documentStatus.nextRound} 轮断点进度已放弃，文档任务仍保留。`);
      setRuntimeStep("当前轮次断点已清理");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("清理当前轮次断点失败");
    } finally {
      finishTask(taskTicket);
    }
  }


  async function handleExportReviewed(format: "txt" | "docx") {
    if (!roundResult?.outputPath || !activeCompareData?.chunks.length) {
      setNotice("当前没有可合成的 Diff 数据。");
      return;
    }
    if (format === "docx") {
      const confirmOptions = buildExportRiskConfirmOptions("导出审阅 Word", activeCompareData, lastExportResult);
      if (confirmOptions && !(await requestConfirm(confirmOptions))) {
        setNotice("已取消审阅 Word 导出。");
        return;
      }
    }
    const taskTicket = beginTask("exporting");
    try {
      setRuntimeStep(`正在导出审阅版 ${format.toUpperCase()}。`);
      const result = await service.exportReviewedRound(roundResult.outputPath, format, normalizeReviewDecisionsForExport(reviewDecisions));
      setLastExportResult(result);
      setNotice(formatExportNotice(result, "审阅版"));
      setRuntimeStep(`审阅版 ${format.toUpperCase()} 已导出`);
    } catch (appError) {
      setError(formatExportError(appError));
      setRuntimeStep("审阅版导出失败");
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
    const riskyChunkIds = activeCompareData?.chunks.filter((chunk) => chunk.quality?.needsReview).map((chunk) => chunk.chunkId) ?? [];
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

  async function handleSaveExperimentRecord(input: ExperimentRecordInput) {
    const stats = buildQualityStats(activeCompareData, lastExportResult);
    const runAudit = buildCurrentRunAudit(roundResult, activeCompareData, modelConfig);
    const reportOverall = detectionReport?.summary.weightedOverallRiskProbability ?? detectionReport?.summary.overallRiskProbability ?? null;
    const roundModel = roundResult?.roundModel ?? null;
    const payload: ExperimentRecordInput = {
      ...input,
      docId: documentStatus?.docId ?? input.docId ?? "",
      sourcePath: documentStatus?.sourcePath ?? input.sourcePath ?? "",
      outputPath: roundResult?.outputPath ?? activeCompareData?.outputPath ?? input.outputPath ?? "",
      round: roundResult?.round ?? activeCompareData?.round ?? input.round ?? null,
      promptProfile: modelConfig.promptProfile,
      promptSequence: normalizePromptSequence(modelConfig.promptSequence),
      model: roundModel?.model || modelConfig.model,
      providerName: roundModel?.providerName || input.providerName || "",
      roundModel,
      reportProvider: detectionReport?.providerLabel || detectionReport?.provider || input.reportProvider || "",
      reportOverall,
      reportPath: detectionReport?.sourcePath || input.reportPath || "",
      chunkCount: activeCompareData?.chunkCount ?? stats.chunkCount,
      reviewChunkCount: stats.reviewChunkCount,
      machineLikeRiskCount: stats.machineLikeRiskCount,
      rewriteCandidateMode: runAudit.rewriteCandidateMode,
      estimatedApiCalls: runAudit.estimatedApiCalls,
      validationRetryCount: runAudit.validationRetryCount,
      sourceFallbackCount: runAudit.sourceFallbackCount,
      guardIssueCount: stats.guardIssueCount,
      preflightIssueCount: stats.preflightIssueCount,
      auditIssueCount: stats.auditIssueCount,
    };

    const taskTicket = beginTask("saving-experiment");
    try {
      setRuntimeStep("正在保存复盘记录。");
      await service.saveExperimentRecord(payload);
      await refreshExperimentRecords();
      setNotice("复盘记录已保存。后续可以用它对比模型、轮次和外部平台结果。");
      setRuntimeStep("复盘记录已保存");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("保存复盘记录失败");
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleDeleteExperimentRecord(id: string) {
    const confirmed = await requestConfirm({
      title: "删除复盘记录",
      description: "只删除这条策略复盘记录，不会删除文档、Diff、导出文件或检测报告。",
      confirmLabel: "确认删除",
      cancelLabel: "取消",
      tone: "danger",
    });
    if (!confirmed) {
      return;
    }
    const taskTicket = beginTask("saving-experiment");
    try {
      await service.deleteExperimentRecord(id);
      await refreshExperimentRecords();
      setNotice("复盘记录已删除。");
    } catch (appError) {
      setError(stringifyError(appError));
    } finally {
      finishTask(taskTicket);
    }
  }

  async function handleReplayExperimentRecord(record: ExperimentRecord) {
    if (!record.sourcePath && !record.outputPath) {
      setNotice("这条复盘记录缺少文档或输出路径，无法复现。");
      return;
    }

    const replay = buildExperimentReplayConfig(record, modelConfig);
    const promptProfile = replay.config.promptProfile;
    const promptSequence = normalizePromptSequence(replay.config.promptSequence);
    const modelText = replay.modelHint
      ? replay.modelApplied
        ? `模型配置已回填：${replay.modelHint}。`
        : `模型仅作为提示：${replay.modelHint}；未找到可安全复用的 API Key，所以没有强行覆盖。`
      : "";
    let exactSnapshotFailed = "";

    const taskTicket = beginTask("replaying-experiment");
    try {
      setRuntimeStep("正在复现复盘记录。");
      setModelConfig(replay.config);
      localStorage.setItem(ACTIVE_PROMPT_PROFILE_KEY, promptProfile);
      localStorage.setItem(ACTIVE_PROMPT_SEQUENCE_KEY, JSON.stringify(promptSequence));

      let status: DocumentStatus | null = null;
      let loadedHistoryItems: HistoryDocumentSummary[] | undefined;
      if (record.sourcePath) {
        status = await refreshDocumentState(record.sourcePath, replay.config);
        loadedHistoryItems = await refreshHistoryList();
        if (!record.outputPath) {
          await loadLatestRoundSnapshot(status, replay.config, {
            historyItems: loadedHistoryItems,
            allowProfileFallback: true,
          });
        }
      }

      if (record.outputPath) {
        try {
          await loadRoundSnapshotByOutputPath(record.outputPath);
        } catch (snapshotError) {
          exactSnapshotFailed = stringifyError(snapshotError);
          if (status) {
            await loadLatestRoundSnapshot(status, replay.config, {
              historyItems: loadedHistoryItems,
              allowProfileFallback: true,
            });
          } else {
            throw snapshotError;
          }
        }
      }

      setHistoryPanelOpen(true);
      setActiveView("home");
      const fallbackText = exactSnapshotFailed ? "原记录输出读取失败，已回退到该文档最新 Diff。" : "已载入该记录对应 Diff。";
      setNotice(`已复现复盘记录：${record.strategy || "未标记策略"}。${fallbackText}${modelText}`);
      setRuntimeStep("复盘记录复现完成");
    } catch (appError) {
      setError(stringifyError(appError));
      setRuntimeStep("复现复盘记录失败");
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
      const candidateChunkIds = activeCompareData.chunks
        .filter((chunk) => (chunk.rejectedCandidates?.length ?? 0) > 0 || ((failureByChunk.get(chunk.chunkId)?.rejectedCandidates?.length ?? 0) > 0))
        .map((chunk) => chunk.chunkId);
      const reviewChunkIds = activeCompareData.chunks
        .filter((chunk) => {
          const flags = chunk.quality?.flags ?? [];
          const reportMatches = detectionMatchesByChunk[chunk.chunkId] ?? [];
          return Boolean(chunk.quality?.needsReview)
            || chunk.fallbackMode === "source"
            || flags.includes("source_fallback")
            || failureByChunk.has(chunk.chunkId)
            || candidateChunkIds.includes(chunk.chunkId)
            || reportMatches.some((match) => match.confidence === "strong" || match.confidence === "review");
        })
        .map((chunk) => chunk.chunkId);
      const failedChunkIds = activeRerunFailures.map((failure) => failure.chunkId);
      const preferredFilter: DiffFilterMode = failedChunkIds.length ? "failed" : candidateChunkIds.length ? "candidate" : "review";
      const preferredChunkId = failedChunkIds[0] ?? candidateChunkIds[0] ?? reviewChunkIds[0];
      if (reviewChunkIds.length || failedChunkIds.length || candidateChunkIds.length) {
        items.push({
          id: `diff-action:${activeCompareData.outputPath || activeCompareData.docId}:${reviewChunkIds.length}:${failedChunkIds.length}:${candidateChunkIds.length}`,
          title: failedChunkIds.length ? "Diff 有重跑失败" : candidateChunkIds.length ? "Diff 有候选待判断" : "Diff 有块需处理",
          status: failedChunkIds.length ? "需处理" : "待审阅",
          detail: `需处理 ${reviewChunkIds.length} 块 · 失败 ${failedChunkIds.length} · 候选 ${candidateChunkIds.length}`,
          recoveryHint: failedChunkIds.length
            ? "先查看失败块和模型候选，确认可用再采用；否则补充反馈后单块重跑。"
            : candidateChunkIds.length
              ? "候选输出不会自动导出；可查看模型原始候选，自行判断采用或重跑。"
              : "可直接跳到需处理筛选，不必在整篇 Diff 里手动翻找。",
          tone: failedChunkIds.length ? "red" : "amber",
          running: false,
          actionLabel: preferredFilter === "failed" ? "查看失败块" : preferredFilter === "candidate" ? "查看候选块" : "只看需处理",
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
  }, [activeCompareData, activeRerunFailures, busy, currentBatchRerunToken, currentRunToken, detectionMatchesByChunk, diagnostics, documentStatus?.sourcePath, error, progress, progressPercent, roundProgressStatus, runtimeLabel, taskPhase]);
  const activeRuntimeTaskCount = runtimeTaskItems.filter((item) => item.running).length;

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
      onOpenRoutePlanner={() => setActiveView("home")}
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

  return (
    <div className="fy-app-shell">
      <div className="flex h-screen min-h-0">
        <aside className={`fy-sidebar ${sidebarCollapsed ? "w-[92px]" : "w-[304px]"}`}>
          <div className="shrink-0 px-0 pb-4 pt-1">
            <div className={`flex items-center overflow-visible ${sidebarCollapsed ? "h-[74px] justify-center" : "h-[112px] justify-center"}`}>
              <img src="/brand-logo.png" alt="Fuck your AI detection rate" className={`max-w-none object-contain drop-shadow-[0_14px_28px_rgba(249,115,22,0.18)] transition-all duration-300 ${sidebarCollapsed ? "w-[74px]" : "w-[286px]"}`} />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={`mt-3 w-full rounded-2xl ${sidebarCollapsed ? "px-0" : "justify-start"}`}
              onClick={() => setSidebarCollapsed((value) => !value)}
              title={sidebarCollapsed ? "展开导航" : "收起导航"}
              aria-expanded={!sidebarCollapsed}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              {sidebarCollapsed ? null : <span className="ml-2">收起导航</span>}
            </Button>
          </div>

          <nav className="fy-nav-list">
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "home"} tone="slate" icon={<Home className="h-4 w-4" />} label="主页 / 实时 Diff" onClick={() => setActiveView("home")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "quality"} tone="blue" icon={<BarChart3 className="h-4 w-4" />} label="改写检查" onClick={() => setActiveView("quality")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "model"} tone="violet" icon={<Settings className="h-4 w-4" />} label="模型配置" onClick={() => setActiveView("model")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "prompts"} tone="fuchsia" icon={<FileText className="h-4 w-4" />} label="提示词预览" onClick={() => setActiveView("prompts")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "format"} tone="emerald" icon={<SlidersHorizontal className="h-4 w-4" />} label="学校规范" onClick={() => setActiveView("format")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "protection"} tone="teal" icon={<ShieldCheck className="h-4 w-4" />} label="保护区地图" onClick={() => setActiveView("protection")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "history"} tone="amber" icon={<History className="h-4 w-4" />} label="历史记录" onClick={() => setActiveView("history")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "diagnostics"} tone="rose" icon={<Activity className="h-4 w-4" />} label="启动诊断" onClick={() => setActiveView("diagnostics")} />
            <SidebarItem collapsed={sidebarCollapsed} active={activeView === "experiment"} tone="indigo" icon={<Clock3 className="h-4 w-4" />} label="策略复盘" onClick={() => setActiveView("experiment")} />
          </nav>
          <div className={`fy-sidebar-footer ${sidebarCollapsed ? "text-center" : ""}`}>
            {sidebarCollapsed ? "FYADR" : "FYADR 本地工作台"}
          </div>
        </aside>

        <main className={`flex h-screen min-h-0 flex-1 flex-col overflow-hidden transition-[margin] duration-300 ${activeView === "diff" ? "px-3 py-3" : "px-6 py-4"} ${sidebarCollapsed ? "ml-[92px]" : "ml-[304px]"}`}>
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

          <GlobalTaskStatusBar
            documentStatus={documentStatus}
            activeView={activeView}
            promptProfile={modelConfig.promptProfile}
            promptSequence={modelConfig.promptSequence}
            runtimeStatus={runtimeStatus}
            runtimeLabel={runtimeLabel}
            progressPercent={progressPercent}
            running={running}
            diffStats={diffDashboardStats}
            reportBound={Boolean(detectionReport)}
            notification={currentNotification}
            unreadNotificationCount={unreadNotificationCount}
            taskItemCount={runtimeTaskItems.length}
            activeTaskCount={activeRuntimeTaskCount}
            onOpenHome={() => setActiveView("home")}
            onOpenDiff={() => openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)}
            onOpenNotifications={openNotificationCenter}
          />

          <section className="mt-2 min-h-0 flex-1 overflow-hidden">
            {activeView === "home" ? (
              <div className="fy-page-scroll fy-home-page">
                <div className="fy-home-control-grid">
                  <div className="fy-home-result-area">
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
                      onExportReviewedTxt={() => void handleExportReviewed("txt")}
                      onExportReviewedDocx={() => void handleExportReviewed("docx")}
                      onExportTxt={() => void handleExportCurrent("txt")}
                      onExportDocx={() => void handleExportCurrent("docx")}
                    />
                    <div className="fy-home-diff-panel">
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
                  <div className="fy-home-side-stack">
                    <HomeRunPanel
                      value={documentStatus}
                      busy={uiBusy}
                      pickerLabel={pickerLabel}
                      modelConfig={modelConfig}
                      modelCatalog={modelCatalog}
                      modelCatalogBusy={modelCatalogBusy}
                      progress={progress}
                      roundProgressStatus={roundProgressStatus}
                      promptProfile={modelConfig.promptProfile}
                      promptSequence={modelConfig.promptSequence}
                      onPromptProfileChange={(promptProfile) => void handlePromptProfileChange(promptProfile)}
                      onPromptSequenceChange={(promptSequence) => void handlePromptSequenceChange(promptSequence)}
                      onModelConfigChange={setModelConfig}
                      onSaveModelConfig={(nextConfig) => void handleSaveModelConfig(nextConfig)}
                      onRefreshDefaultModels={() => void refreshModelCatalog()}
                      onRefreshAllProviderModels={() => void handleRefreshAllProviderModels()}
                      onRefreshProviderModels={(providerId) => void handleRefreshProviderModels(providerId)}
                      onPickFile={handlePickFile}
                      onRunRound={handleRunRound}
                      onCancelRun={handleCancelRunRound}
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
                </div>
              </div>
            ) : activeView === "diff" ? (
              <div className="fy-page-fixed fy-diff-page">
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
            ) : activeView === "quality" ? (
              <div className="fy-page-scroll"><QualityReportPage compareData={activeCompareData} exportResult={lastExportResult} /></div>
            ) : activeView === "experiment" ? (
              <div className="fy-page-scroll">
                <ExperimentLabPage
                  records={experimentRecords}
                  recordsPath={experimentRecordsPath}
                  documentStatus={documentStatus}
                  roundResult={roundResult}
                  compareData={activeCompareData}
                  detectionReport={detectionReport}
                  exportResult={lastExportResult}
                  modelConfig={modelConfig}
                  busy={uiBusy}
                  onSave={(record) => void handleSaveExperimentRecord(record)}
                  onDelete={(id) => void handleDeleteExperimentRecord(id)}
                  onReplay={(record) => void handleReplayExperimentRecord(record)}
                  onRefresh={() => void refreshExperimentRecords()}
                />
              </div>
            ) : activeView === "model" ? (
              <div className="fy-page-fixed">{modelPanel}</div>
            ) : activeView === "prompts" ? (
              <div className="fy-page-fixed">
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
              <div className="fy-page-scroll">{formatPanel}</div>
            ) : activeView === "protection" ? (
              <div className="fy-page-scroll"><ProtectionMapCard value={protectionMap} /></div>
            ) : activeView === "diagnostics" ? (
              <div className="fy-page-scroll">
                <DiagnosticsPage
                  value={diagnostics}
                  busy={uiBusy}
                  onRefresh={() => void refreshDiagnostics()}
                  onCleanupTaskSnapshots={() => void handleCleanupTaskStateSnapshots()}
                />
              </div>
            ) : (
              <div className="fy-page-scroll"><HistoryCard
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
        </main>
      </div>
    </div>
  );

}

type SidebarTone = "slate" | "blue" | "violet" | "fuchsia" | "emerald" | "cyan" | "teal" | "amber" | "rose" | "indigo";

function SidebarItem({ active, icon, label, onClick, collapsed = false, tone }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; collapsed?: boolean; tone: SidebarTone }) {
  const activeClass: Record<SidebarTone, string> = {
    slate: "bg-slate-950",
    blue: "bg-blue-600",
    violet: "bg-violet-600",
    fuchsia: "bg-fuchsia-600",
    emerald: "bg-emerald-600",
    cyan: "bg-cyan-600",
    teal: "bg-teal-600",
    amber: "bg-amber-600",
    rose: "bg-rose-600",
    indigo: "bg-indigo-600",
  };
  const idleIconClass: Record<SidebarTone, string> = {
    slate: "text-slate-500 group-hover:bg-slate-200/70",
    blue: "text-blue-600 group-hover:bg-blue-50",
    violet: "text-violet-600 group-hover:bg-violet-50",
    fuchsia: "text-fuchsia-600 group-hover:bg-fuchsia-50",
    emerald: "text-emerald-600 group-hover:bg-emerald-50",
    cyan: "text-cyan-600 group-hover:bg-cyan-50",
    teal: "text-teal-600 group-hover:bg-teal-50",
    amber: "text-amber-600 group-hover:bg-amber-50",
    rose: "text-rose-600 group-hover:bg-rose-50",
    indigo: "text-indigo-600 group-hover:bg-indigo-50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={`fy-nav-item group ${collapsed ? "justify-center gap-0" : "gap-3 text-left"} ${
        active ? `fy-nav-item-active ${activeClass[tone]}` : "fy-nav-item-idle"
      }`}
    >
      <span className={`fy-nav-icon ${active ? "bg-white/15 text-white" : idleIconClass[tone]}`}>{icon}</span>
      {collapsed ? null : <span>{label}</span>}
    </button>
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
  useEffect(() => {
    if (!value) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, value]);

  if (!value) {
    return null;
  }

  const tone = value.tone ?? "neutral";
  const toneClass: Record<ConfirmDialogTone, string> = {
    neutral: "border-slate-200",
    info: "border-blue-200",
    warning: "border-amber-200",
    danger: "border-red-200",
  };
  const iconClass: Record<ConfirmDialogTone, string> = {
    neutral: "bg-slate-100 text-slate-700",
    info: "bg-blue-100 text-blue-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  };
  const confirmVariant: Record<ConfirmDialogTone, "neutral" | "brand" | "warning" | "destructive"> = {
    neutral: "neutral",
    info: "brand",
    warning: "warning",
    danger: "destructive",
  };

  return (
    <div className="fy-overlay" role="dialog" aria-modal="true" aria-labelledby={`confirm-dialog-title-${value.id}`}>
      <button type="button" className="fy-overlay-scrim" aria-label="关闭确认弹窗" onClick={onCancel} />
      <div className={`fy-modal ${toneClass[tone]}`}>
        <div className="fy-modal-header">
          <div className={`rounded-2xl p-2 ${iconClass[tone]}`}>
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div id={`confirm-dialog-title-${value.id}`} className="text-lg font-black text-slate-950">
              {value.title}
            </div>
            {value.description ? <p className="mt-1 text-sm leading-6 text-slate-600">{value.description}</p> : null}
          </div>
        </div>

        {value.details?.length ? (
          <div className="fy-modal-body">
            <div className="space-y-2">
              {value.details.map((detail, index) => (
                <div key={`${value.id}-${index}-${detail}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-semibold leading-6 text-slate-600">
                  {detail}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div className="fy-modal-footer">
          <Button type="button" variant="outline" onClick={onCancel}>{value.cancelLabel ?? "取消"}</Button>
          <Button type="button" variant={confirmVariant[tone]} onClick={onConfirm}>{value.confirmLabel ?? "确定"}</Button>
        </div>
      </div>
    </div>
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
      <Card className="fy-panel h-full min-h-0 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col gap-4 p-5">
          <div className="shrink-0 rounded-3xl border border-fuchsia-100 bg-fuchsia-50/80 p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="neutral">只读</Badge>
                <span className="text-xs font-black uppercase tracking-[0.22em] text-fuchsia-500">Prompt Preview</span>
              </div>
              <h2 className="mt-2 text-lg font-black text-slate-950">提示词预览</h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">查看内置提示词和仓库路径，不在界面编辑。</p>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={onRefresh} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              刷新
            </Button>
          </div>

          {error ? (
            <div className="fy-callout border-red-100 bg-red-50 text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
            {items.map((item) => {
              const active = activeItem?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onActivePromptIdChange(item.id)}
                  className={`w-full rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-fuchsia-200 bg-fuchsia-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-fuchsia-100 hover:bg-fuchsia-50/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-black text-slate-950">{item.label}</div>
                    <Badge variant={active ? "brand" : "outline"}>{item.id}</Badge>
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">{item.description}</div>
                  <div className="mt-2 truncate rounded-xl bg-white/80 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500">
                    {item.relativePath}
                  </div>
                </button>
              );
            })}
            {!items.length ? (
              <div className="fy-empty-state min-h-[18rem]">
                <FileText className="h-8 w-8 text-slate-300" />
                <div className="text-sm font-bold text-slate-600">{busy ? "正在读取提示词文件。" : "暂无可预览的提示词。"}</div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="fy-panel h-full min-h-0 overflow-hidden">
        <CardContent className="flex h-full min-h-0 flex-col gap-4 p-5">
          {activeItem ? (
            <>
              <div className="fy-panel-header">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{activeItem.fileName}</Badge>
                    <Badge variant="outline">{formatBytes(activeItem.sizeBytes)}</Badge>
                    <Badge variant="outline">{contentLineCount} 行</Badge>
                  </div>
                  <h3 className="mt-2 text-2xl font-black text-slate-950">{activeItem.label}</h3>
                  <div className="mt-1 break-all text-sm font-semibold text-slate-500">文件位置：{activeItem.relativePath}</div>
                </div>
                <div className="text-right text-xs font-semibold text-slate-400">
                  {formatDateTime(activeItem.updatedAt)}
                </div>
              </div>

              <pre className="min-h-0 flex-1 overflow-auto rounded-3xl border border-slate-200 bg-slate-950 p-5 text-[12px] leading-6 text-slate-100 shadow-inner">
                <code>{activeItem.content}</code>
              </pre>
            </>
          ) : (
            <div className="fy-empty-state min-h-[34rem]">
              {busy ? <Loader2 className="h-10 w-10 animate-spin text-fuchsia-400" /> : <FileText className="h-10 w-10 text-slate-300" />}
              <div className="text-base font-black text-slate-700">
                {busy ? "正在读取提示词内容" : error ? "提示词读取失败" : "选择左侧提示词后查看内容"}
              </div>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                {busy ? "如果长时间停留在这里，请确认后端已经重启到最新版本。" : error || "提示词文件来自 prompts 目录，页面只读展示。"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function GlobalTaskStatusBar({
  documentStatus,
  activeView,
  promptProfile,
  promptSequence,
  runtimeStatus,
  runtimeLabel,
  progressPercent,
  running,
  diffStats,
  reportBound,
  notification,
  unreadNotificationCount,
  taskItemCount,
  activeTaskCount,
  onOpenHome,
  onOpenDiff,
  onOpenNotifications,
}: {
  documentStatus: DocumentStatus | null;
  activeView: WorkbenchView;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  runtimeStatus: string;
  runtimeLabel: string;
  progressPercent: number;
  running: boolean;
  diffStats: DiffDashboardStats;
  reportBound: boolean;
  notification: AppNotification | null;
  unreadNotificationCount: number;
  taskItemCount: number;
  activeTaskCount: number;
  onOpenHome: () => void;
  onOpenDiff: () => void;
  onOpenNotifications: () => void;
}) {
  const documentName = documentStatus ? formatDocLabel(documentStatus.docId || documentStatus.sourcePath) : "未载入文档";
  const sourceKind = documentStatus?.sourceKind === ".docx" ? "Word 文档" : documentStatus?.sourceKind === ".txt" ? "TXT 文档" : "等待上传";
  const nextRoundText = documentStatus
    ? documentStatus.hasNextRound && documentStatus.nextRound
      ? `第 ${documentStatus.nextRound} 轮`
      : "已完成"
    : "未开始";
  const promptText = promptProfile === "cn_custom" ? formatPromptSequence(promptSequence) : describePromptProfile(promptProfile);
  const contentText = diffStats.chunkCount ? "Diff 已载入" : "等待 Diff";
  const contentDetail = reportBound ? "已绑定检测报告" : "未绑定报告";
  const progressTone = running ? "from-fuchsia-500 via-sky-500 to-emerald-400" : documentStatus ? "from-indigo-500 via-sky-500 to-cyan-400" : "from-slate-300 via-slate-200 to-slate-300";
  const viewLabel = activeView === "home" ? "主页" : activeView === "diff" ? "Diff" : activeView === "model" ? "模型" : activeView === "format" ? "规范" : activeView === "history" ? "历史" : "工作台";

  return (
    <div className="fy-global-statusbar">
      <div className="fy-global-statusgrid">
        <button type="button" onClick={onOpenHome} className={`fy-global-status-card fy-global-document-card ${documentStatus ? "rainbow-marquee-card" : "fy-current-document-card-empty"}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={`fy-icon-cell ${documentStatus ? "bg-slate-950 text-white" : "bg-white text-slate-400"}`}>
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 text-left">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black text-slate-500">当前文件</span>
                <Badge variant={documentStatus ? "default" : "outline"}>{documentStatus ? "正在操作" : viewLabel}</Badge>
              </div>
              <div className="mt-0.5 truncate text-sm font-black text-slate-950">{documentName}</div>
            </div>
          </div>
        </button>

        <button type="button" onClick={onOpenHome} className="fy-global-mini-card fy-tone-brand">
          <div className="flex min-w-0 items-center gap-3">
            <div className="fy-icon-cell bg-violet-100 text-violet-700">
              <Route className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="fy-global-mini-head">改写路线</div>
              <div className="fy-global-mini-value">{promptText}</div>
              <div className="fy-global-mini-detail">{sourceKind} · {nextRoundText}</div>
            </div>
          </div>
        </button>

        <button type="button" onClick={onOpenDiff} className="fy-global-mini-card fy-tone-success">
          <div className="flex min-w-0 items-center gap-3">
            <div className="fy-icon-cell bg-emerald-100 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="fy-global-mini-head">内容反馈</div>
              <div className="fy-global-mini-value">{contentText}</div>
              <div className="fy-global-mini-detail">{contentDetail}</div>
            </div>
          </div>
        </button>

        <div className="fy-global-mini-card fy-global-progress-card fy-tone-neutral">
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="fy-global-mini-head text-slate-500">
                <Gauge className="h-4 w-4" />
                <span>{runtimeStatus}</span>
              </div>
              <div className="fy-global-mini-detail mt-0.5">{runtimeLabel}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white">
                <div className={`h-full rounded-full bg-gradient-to-r ${progressTone} transition-all`} style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }} />
              </div>
            </div>
            <div className="text-xl font-black text-slate-950">{progressPercent}%</div>
          </div>
        </div>

        <NotificationStripItem
          notification={notification}
          unreadNotificationCount={unreadNotificationCount}
          taskItemCount={taskItemCount}
          activeTaskCount={activeTaskCount}
          onOpenNotifications={onOpenNotifications}
        />
      </div>
    </div>
  );
}

function NotificationStripItem({
  notification,
  unreadNotificationCount,
  taskItemCount,
  activeTaskCount,
  onOpenNotifications,
}: {
  notification: AppNotification | null;
  unreadNotificationCount: number;
  taskItemCount: number;
  activeTaskCount: number;
  onOpenNotifications: () => void;
}) {
  const isError = notification?.kind === "error";
  const title = activeTaskCount ? "通知与任务" : notification ? notification.title : "通知与任务";
  const text = activeTaskCount
    ? `${activeTaskCount} 个任务正在运行，点开可查看或停止。`
    : taskItemCount
      ? "有可继续的任务断点，点开查看。"
      : notification
        ? notification.text
        : "暂无新通知";
  const badgeText = activeTaskCount
    ? `${activeTaskCount}任务`
    : unreadNotificationCount
      ? `${unreadNotificationCount > 9 ? "9+" : unreadNotificationCount}未读`
      : taskItemCount
        ? `${taskItemCount}待办`
        : "";
  return (
    <button
      type="button"
      onClick={onOpenNotifications}
      aria-label="打开通知与任务中心"
      className={`fy-status-tile relative flex min-w-0 items-center gap-3 text-left transition ${
        activeTaskCount ? "fy-tone-warning hover:bg-amber-100/70" : notification ? isError ? "fy-tone-danger hover:bg-red-100/70" : "fy-tone-success hover:bg-emerald-100/70" : "fy-tone-neutral hover:bg-white"
      }`}
    >
      <div className={`fy-icon-cell ${activeTaskCount ? "bg-amber-100 text-amber-700" : isError ? "bg-red-100 text-red-700" : notification ? "bg-emerald-100 text-emerald-700" : "bg-white text-slate-500"}`}>
        {activeTaskCount ? <Loader2 className="h-4 w-4 animate-spin" /> : isError ? <AlertCircle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      </div>
      <div className="fy-notification-text min-w-0 flex-1">
        <div className="text-[11px] font-black opacity-65">{title}</div>
        <div className="mt-0.5 truncate text-xs font-semibold leading-4 opacity-90">{text}</div>
      </div>
      {badgeText ? (
        <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-950 px-1.5 text-[10px] font-bold text-white">
          {badgeText}
        </span>
      ) : null}
    </button>
  );
}

function HomeRunPanel({
  value,
  busy,
  pickerLabel,
  modelConfig,
  modelCatalog,
  modelCatalogBusy,
  progress,
  roundProgressStatus,
  promptProfile,
  promptSequence,
  onPromptProfileChange,
  onPromptSequenceChange,
  onModelConfigChange,
  onSaveModelConfig,
  onRefreshDefaultModels,
  onRefreshAllProviderModels,
  onRefreshProviderModels,
  onPickFile,
  onRunRound,
  onCancelRun,
  onResetRound,
  running,
}: {
  value: DocumentStatus | null;
  busy: boolean;
  pickerLabel: string;
  modelConfig: ModelConfig;
  modelCatalog: ModelCatalogResult | null;
  modelCatalogBusy: boolean;
  progress: RoundProgress | null;
  roundProgressStatus: RoundProgressStatus | null;
  promptProfile: ModelConfig["promptProfile"];
  promptSequence: PromptId[];
  onPromptProfileChange: (promptProfile: ModelConfig["promptProfile"]) => void;
  onPromptSequenceChange: (promptSequence: PromptId[]) => void;
  onModelConfigChange: (modelConfig: ModelConfig) => void;
  onSaveModelConfig: (modelConfig: ModelConfig) => void;
  onRefreshDefaultModels: () => void;
  onRefreshAllProviderModels: () => void;
  onRefreshProviderModels: (providerId: string) => void;
  onPickFile: () => void;
  onRunRound: () => void;
  onCancelRun: () => void;
  onResetRound: () => void;
  running: boolean;
}) {
  const [setupEditor, setSetupEditor] = useState<null | "prompt" | "model">(null);
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
  const defaultModels = modelCatalog?.models.map((item) => item.id) ?? [];
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
  const defaultRouteReady = modelConfig.offlineMode || Boolean(modelConfig.baseUrl?.trim() && modelConfig.apiKey?.trim() && modelConfig.model?.trim());
  const modelRouteHealthLabel = unavailableRouteCount
    ? "路线不可启动"
    : defaultRouteReady
      ? "路线可启动"
      : "默认连接待补全";
  const modelRouteHealthDetail = unavailableRouteCount
    ? "有轮次缺配置。"
    : defaultRouteReady
      ? `${activeFlowSequence.length} 轮就绪。`
      : "专属轮次外继承默认。";
  const rewriteCandidateMode = modelConfig.rewriteCandidateMode === "quality" ? "quality" : "economy";
  const candidateMaxPerChunk = rewriteCandidateMode === "quality" ? 2 : 1;
  const candidateModeLabel = rewriteCandidateMode === "quality" ? "质量模式 · 最多 2 候选" : "省钱模式 · 1 候选";
  const candidateModeDetail = rewriteCandidateMode === "quality"
    ? "长中文块最多 2 候选，调用量可能翻倍。"
    : "每块 1 次请求，调用量最低。";
  const progressEstimatedApiCalls = progress?.estimatedApiCalls ?? (
    progress?.totalChunks ? progress.totalChunks * candidateMaxPerChunk : null
  );
  const progressCallText = progress?.totalChunks
    ? `本轮预计约 ${progressEstimatedApiCalls ?? progress.totalChunks} 次 API 调用，已到第 ${progress.currentChunk ?? progress.completedChunks ?? 0}/${progress.totalChunks} 块`
    : rewriteCandidateMode === "quality"
      ? "质量模式可能追加第二候选。"
      : "省钱模式不追加候选。";
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
  const setRewriteCandidateMode = (mode: "economy" | "quality") => {
    onModelConfigChange({ ...modelConfig, rewriteCandidateMode: mode });
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
        ? resumableCheckpoint.resumeActionLabel || `继续第 ${value.nextRound} 轮`
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
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1);
    if (!roundKey) return;
    const nextRoundModels = { ...(modelConfig.roundModels ?? {}) };
    if (providerId === "__default") {
      nextRoundModels[roundKey] = {
        ...(nextRoundModels[roundKey] ?? buildRoundModelFromProvider({
          id: "__default",
          name: "默认连接",
          enabled: true,
          baseUrl: modelConfig.baseUrl,
          apiKey: modelConfig.apiKey,
          apiType: modelConfig.apiType,
          defaultModel: modelConfig.model,
        }, modelConfig.model, modelConfig)),
        enabled: false,
      };
      onModelConfigChange({ ...modelConfig, roundModels: nextRoundModels });
      return;
    }
    const provider = providers.find((item) => item.id === providerId);
    if (!provider) return;
    nextRoundModels[roundKey] = buildRoundModelFromProvider(provider, provider.defaultModel || provider.models?.[0] || "", modelConfig);
    onModelConfigChange({ ...modelConfig, roundModels: nextRoundModels });
  };
  const updateRoundModel = (roundIndex: number, model: string) => {
    const roundKey = getRoundModelKey(promptProfile, roundIndex + 1);
    if (!roundKey) return;
    const currentRound = modelConfig.roundModels?.[roundKey];
    const provider = currentRound?.enabled ? findProviderForRoundModel(modelConfig, currentRound) : null;
    const usableProvider = provider?.enabled === false ? null : provider;
    const nextRoundModels = { ...(modelConfig.roundModels ?? {}) };
    if (usableProvider) {
      nextRoundModels[roundKey] = buildRoundModelFromProvider(usableProvider, model, modelConfig);
    } else {
      nextRoundModels[roundKey] = {
        enabled: false,
        providerName: "默认连接",
        baseUrl: modelConfig.baseUrl,
        apiKey: modelConfig.apiKey,
        model,
        apiType: modelConfig.apiType,
        temperature: modelConfig.temperature,
        requestTimeoutSeconds: modelConfig.requestTimeoutSeconds,
        maxRetries: modelConfig.maxRetries,
      };
    }
    onModelConfigChange({ ...modelConfig, roundModels: nextRoundModels, model: usableProvider ? modelConfig.model : model });
  };
  const randomizeModelRoute = () => {
    if (!providerOptions.length) return;
    const nextRoundModels = { ...(modelConfig.roundModels ?? {}) };
    activeFlowSequence.forEach((_, index) => {
      const roundKey = getRoundModelKey(promptProfile, index + 1);
      const provider = providerOptions[(Math.floor(Math.random() * providerOptions.length) + index) % providerOptions.length];
      if (!roundKey || !provider) return;
      const models = provider.models?.length ? provider.models : [provider.defaultModel || modelConfig.model].filter(Boolean);
      const model = models.length ? models[Math.floor(Math.random() * models.length)] : modelConfig.model;
      nextRoundModels[roundKey] = buildRoundModelFromProvider(provider, model, modelConfig);
    });
    onModelConfigChange({ ...modelConfig, roundModels: nextRoundModels });
  };
  const resetModelRouteToDefault = () => {
    const nextRoundModels = { ...(modelConfig.roundModels ?? {}) };
    activeFlowSequence.forEach((_, index) => {
      const roundKey = getRoundModelKey(promptProfile, index + 1);
      if (!roundKey) return;
      nextRoundModels[roundKey] = {
        ...(nextRoundModels[roundKey] ?? {
          providerName: "默认连接",
          baseUrl: modelConfig.baseUrl,
          apiKey: modelConfig.apiKey,
          model: modelConfig.model,
          apiType: modelConfig.apiType,
          temperature: modelConfig.temperature,
          requestTimeoutSeconds: modelConfig.requestTimeoutSeconds,
          maxRetries: modelConfig.maxRetries,
        }),
        enabled: false,
      };
    });
    onModelConfigChange({ ...modelConfig, roundModels: nextRoundModels });
  };
  return (
    <>
    <Card className="fy-panel min-w-0 shrink-0 overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="fy-control-card fy-control-card-document">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-black text-slate-950">文档入口</div>
              <div className="mt-1 text-xs leading-5 text-slate-500">{hasDocument ? "源文件操作" : "Word / TXT"}</div>
            </div>
            <Button
              type="button"
              variant={hasDocument ? "outlineWarning" : "default"}
              onClick={onPickFile}
              disabled={busy || running}
              className="shrink-0"
            >
              <FileText className="h-4 w-4" />
              {hasDocument ? "更换文档" : "上传文档"}
            </Button>
          </div>
        </div>

        <div className="fy-control-card fy-control-card-route">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSetupEditor(setupEditor === "prompt" ? null : "prompt")}
              disabled={busy}
              aria-expanded={setupEditor === "prompt"}
              className={`fy-tile ${setupEditor === "prompt" ? "fy-tile-active" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-black text-violet-700">改写流程</div>
                <Badge variant={setupEditor === "prompt" ? "default" : "outline"}>{setupEditor === "prompt" ? "已打开" : "编辑"}</Badge>
              </div>
              <div className="mt-2 truncate text-sm font-black text-slate-950">{promptSummary}</div>
              <div className="mt-2 flex min-h-6 flex-wrap gap-1">
                {activeFlowSequence.map((promptId, index) => (
                  <span key={`${promptId}-${index}-flow`} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-600 shadow-sm">
                    {index + 1}. {PROMPT_OPTIONS.find((option) => option.id === promptId)?.label ?? promptId}
                  </span>
                ))}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSetupEditor(setupEditor === "model" ? null : "model")}
              disabled={busy}
              aria-expanded={setupEditor === "model"}
              className={`fy-tile ${unavailableRouteCount ? "fy-tile-danger" : setupEditor === "model" ? "fy-tile-active" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className={`text-xs font-black ${unavailableRouteCount ? "text-red-700" : "text-blue-700"}`}>模型路线</div>
                <Badge variant={unavailableRouteCount ? "warning" : setupEditor === "model" ? "default" : "outline"}>
                  {setupEditor === "model" ? "已打开" : modelRouteStatus}
                </Badge>
              </div>
              <div className="mt-2 truncate text-sm font-black text-slate-950">
                {customizedRouteCount ? `${customizedRouteCount} 轮使用专属服务商` : "每轮继承默认连接"}
              </div>
              <div className="mt-2 grid gap-1">
                {modelRouteSummary.slice(0, 3).map((item) => (
                  <div key={`${item.index}-${item.providerLabel}-${item.modelLabel}`} className="min-w-0 truncate text-[11px] font-semibold text-slate-500">
                    {item.index + 1}. {item.providerLabel} · {item.modelLabel}
                  </div>
                ))}
              </div>
            </button>
          </div>
        </div>

        <div className={`fy-control-card fy-control-card-run p-4 ${running ? "fy-control-card-running" : ""}`}>
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-950">{running ? "正在运行" : "执行动作"}</div>
              {!runRecoveryState ? <div className="mt-1 text-xs leading-5 text-slate-500">{runHelperText}</div> : null}
            </div>
            {value?.hasNextRound ? (
              <Badge variant={running ? "warning" : "outline"} className={running ? "border-red-200 bg-red-100 text-red-700" : ""}>
                第 {value.nextRound} 轮
              </Badge>
            ) : null}
          </div>
          {hasDocument ? (
            <div className="grid gap-2">
              <div className="fy-soft-section rounded-2xl p-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRewriteCandidateMode("economy")}
                    disabled={busy || running}
                    className={`fy-tile rounded-xl px-3 py-2 ${rewriteCandidateMode === "economy" ? "fy-tone-success" : "text-slate-600 hover:border-emerald-200"}`}
                  >
                    <div className="text-xs font-black">省钱模式</div>
                    <div className="mt-0.5 text-[11px] font-semibold opacity-75">1 候选 / 块</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRewriteCandidateMode("quality")}
                    disabled={busy || running}
                    className={`fy-tile rounded-xl px-3 py-2 ${rewriteCandidateMode === "quality" ? "fy-tone-brand" : "text-slate-600 hover:border-violet-200"}`}
                  >
                    <div className="text-xs font-black">质量模式</div>
                    <div className="mt-0.5 text-[11px] font-semibold opacity-75">最多 2 候选 / 块</div>
                  </button>
                </div>
                <div className="mt-2 rounded-xl bg-white px-3 py-2 text-[11px] leading-5 text-slate-500">
                  <span className="font-black text-slate-700">{candidateModeLabel}</span>：{candidateModeDetail} {progressCallText}
                </div>
              </div>
              <RunRecoveryPanel state={runRecoveryState} />
              <Button
                variant={canRunNextRound ? "neutral" : "default"}
                className="h-14 w-full text-base"
                onClick={onRunRound}
                disabled={!canRunNextRound}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {runButtonText}
              </Button>
              {running ? (
                <Button className="h-11" variant="destructive" onClick={onCancelRun}>中断当前轮</Button>
              ) : value?.hasNextRound ? (
                <Button className="h-11" variant="outlineWarning" onClick={onResetRound} disabled={busy}>
                  放弃本轮进度
                </Button>
              ) : null}
            </div>
          ) : (
              <Button variant="neutral" className="h-14 w-full text-base" onClick={onPickFile} disabled={busy}>
              <FileText className="h-4 w-4" />
              {uploadButtonText}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
    {setupEditor ? (
      <div className="fy-overlay z-[55]">
        <button type="button" aria-label="关闭配置面板遮罩" className="fy-overlay-scrim" onClick={() => setSetupEditor(null)} />
        <aside className={`fy-drawer ${setupEditor === "model" ? "fy-drawer-wide" : ""}`} role="dialog" aria-modal="true" aria-label={setupEditor === "prompt" ? "改写流程配置" : "模型路线配置"}>
          <div className="fy-drawer-header flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-lg font-black text-slate-950">
                {setupEditor === "prompt" ? <Wand2 className="h-5 w-5 text-violet-600" /> : <Settings className="h-5 w-5 text-blue-600" />}
                {setupEditor === "prompt" ? "改写流程" : "模型路线"}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {setupEditor === "prompt" ? "只调整本次任务的轮次顺序，不改变核心 prompt 文件。" : "按当前流程为每一轮选择服务商和模型。"}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSetupEditor(null)} aria-label="关闭配置面板">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="fy-drawer-body">
            {setupEditor === "prompt" ? (
              <div className="space-y-4">
                <div className="grid gap-2">
                  <PromptModeButton active={promptProfile === "cn_prewrite"} title="中文三轮预改写" text="预改写 → 一轮 → 二轮" onClick={() => onPromptProfileChange("cn_prewrite")} disabled={busy} />
                  <PromptModeButton active={promptProfile === "cn"} title="中文双轮" text="一轮 → 二轮" onClick={() => onPromptProfileChange("cn")} disabled={busy} />
                  <PromptModeButton active={promptProfile === "cn_custom"} title="自定义组合" text={formatPromptSequence(activeSequence)} onClick={() => onPromptProfileChange("cn_custom")} disabled={busy} />
                </div>
                {promptProfile === "cn_custom" ? (
                  <div className="fy-section border-violet-100 bg-violet-50/70 p-4">
                    <div className="grid grid-cols-4 gap-2">
                      {[1, 2, 3].map((length) => (
                        <Button key={length} type="button" variant={activeSequence.length === length ? "default" : "outline"} size="sm" onClick={() => updateSequenceLength(length)} disabled={busy}>{length} 轮</Button>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={randomizeSequence} disabled={busy}>随机</Button>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {activeSequence.map((promptId, index) => (
                        <div key={`${index}-${promptId}`} className="grid gap-2">
                          <div className="text-xs font-bold text-violet-700">第 {index + 1} 轮</div>
                          <Select value={promptId} onValueChange={(nextPromptId) => updateSequenceRound(index, nextPromptId as PromptId)} disabled={busy}>
                            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PROMPT_OPTIONS.map((option) => <SelectItem key={option.id} value={option.id}>{option.label} · {option.desc}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div data-ui-section="model-route-overview" className="fy-section border-blue-100 bg-blue-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-blue-950">路线总览</div>
                      <div className="mt-1 text-xs leading-5 text-blue-700">
                        先确认默认兜底，再为每轮指定服务商；每轮没有单独指定时会继承默认连接。
                      </div>
                    </div>
                    <Badge variant={unavailableRouteCount ? "warning" : defaultRouteReady ? "success" : "outline"}>{modelRouteHealthLabel}</Badge>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-3">
                    <RouteOverviewCard
                      label="默认兜底"
                      value={modelConfig.model || "未选模型"}
                      detail={modelConfig.offlineMode ? "离线模式：不请求远程模型" : defaultRouteReady ? "未指定专属服务商的轮次会走这里" : "需补全接口地址、Key 和模型"}
                      tone={defaultRouteReady ? "success" : "warning"}
                    />
                    <RouteOverviewCard
                      label="服务商仓库"
                      value={`${providerOptions.length}/${providers.length} 启用`}
                      detail={providerOptions.length ? "可在每轮路线中选择这些服务商" : "没有启用服务商时只能使用默认连接"}
                      tone={providerOptions.length ? "info" : "slate"}
                    />
                    <RouteOverviewCard
                      label="本次路线"
                      value={modelRouteStatus}
                      detail={modelRouteHealthDetail}
                      tone={unavailableRouteCount ? "danger" : customizedRouteCount ? "brand" : "slate"}
                    />
                  </div>
                  <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-xs font-black text-slate-500">批量动作</div>
                      <Badge variant="outline">{formatPromptSequence(activeFlowSequence)}</Badge>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Button type="button" variant="outline" size="sm" onClick={resetModelRouteToDefault} disabled={busy}>全部继承默认</Button>
                  <Button type="button" variant="outlineBrand" size="sm" onClick={randomizeModelRoute} disabled={busy || providerOptions.length === 0}>轮换服务商</Button>
                      <Button type="button" variant="outline" size="sm" onClick={onRefreshAllProviderModels} disabled={busy || modelConfig.offlineMode || providerOptions.length === 0}>
                        <RefreshCw className="h-4 w-4" />读取服务商模型
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={onRefreshDefaultModels} disabled={busy || modelCatalogBusy || modelConfig.offlineMode}>
                        {modelCatalogBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}读取默认模型
                      </Button>
                    </div>
                  </div>
                  {unavailableRouteCount ? (
                    <div className="fy-callout mt-3 border-amber-200 bg-amber-50 text-amber-800">
                      有轮次绑定的服务商已删除或关闭，请重新选择，或点击“全部继承默认”。
                    </div>
                  ) : null}
                </div>
                <div className="space-y-3">
                  {activeFlowSequence.map((promptId, index) => {
                    const roundKey = getRoundModelKey(promptProfile, index + 1);
                    const roundModel = roundKey ? modelConfig.roundModels?.[roundKey] : undefined;
                    const provider = findProviderForRoundModel(modelConfig, roundModel);
                    const selectedProviderId = roundModel?.enabled && provider && provider.enabled !== false ? provider.id : "__default";
                    const selectedModels = selectedProviderId === "__default" ? defaultModels : provider?.models?.length ? provider.models : [];
                    const selectedModelValue = selectedProviderId === "__default"
                      ? selectedModels.includes(modelConfig.model) ? modelConfig.model : selectedModels[0]
                      : roundModel?.model || provider?.defaultModel || selectedModels[0];
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
                      <div key={`${promptId}-${index}-model`} className={`fy-section p-4 ${routeIssues.length ? "fy-tone-warning" : ""}`}>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <div className="text-sm font-black text-slate-950">第 {index + 1} 轮 · {getPromptOptionLabel(promptId)}</div>
                            <div className="mt-0.5 text-xs text-slate-500">{selectedProviderId === "__default" ? "继承默认连接" : "使用专属服务商"}</div>
                          </div>
                          <Badge variant={selectedProviderId === "__default" ? "outline" : "default"}>{selectedProviderId === "__default" ? "默认" : "混用"}</Badge>
                        </div>
                        <div className="grid gap-3">
                          <Select value={selectedProviderId || "__default"} onValueChange={(providerId) => updateRoundProvider(index, providerId)} disabled={busy}>
                            <SelectTrigger className="bg-white"><SelectValue placeholder="选择服务商" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__default">默认连接 · {modelConfig.model || "未选模型"}</SelectItem>
                              {providerOptions.map((item) => <SelectItem key={item.id} value={item.id}>{item.name || "未命名服务商"} · {item.defaultModel || item.models?.[0] || "未选模型"}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {selectedModels.length > 0 ? (
                            <Select value={selectedModelValue} onValueChange={(model) => updateRoundModel(index, model)} disabled={busy}>
                              <SelectTrigger className="bg-white"><SelectValue placeholder="选择模型" /></SelectTrigger>
                              <SelectContent>{selectedModels.map((model) => <SelectItem key={model} value={model}>{model}</SelectItem>)}</SelectContent>
                            </Select>
                          ) : (
                            <input
                              value={selectedProviderId === "__default" ? modelConfig.model : roundModel?.model ?? ""}
                              onChange={(event) => updateRoundModel(index, event.target.value)}
                              disabled={busy}
                              placeholder="填写模型名称"
                              className="fy-input"
                            />
                          )}
                          {selectedProviderId !== "__default" && provider && selectedModels.length === 0 ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => onRefreshProviderModels(provider.id)} disabled={busy || modelConfig.offlineMode}>
                              <RefreshCw className="h-4 w-4" />读取模型列表
                            </Button>
                          ) : null}
                          {selectedProviderId !== "__default" && provider ? (
                            <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold text-slate-500">
                              <span>缓存模型：{provider.models?.length ?? 0}</span>
                              <span>限速：{provider.rateLimitWindowMinutes && provider.rateLimitMaxRequests ? `${provider.rateLimitWindowMinutes} 分钟 ${provider.rateLimitMaxRequests} 次` : "不限"}</span>
                            </div>
                          ) : null}
                          {routeIssues.length ? (
                            <div className="fy-callout border-amber-200 bg-white/70 text-amber-800">
                              {routeIssues.join("，")}；修复后才能启动，避免跑错模型。
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          {setupEditor === "model" ? (
            <div className="fy-drawer-footer">
              <Button type="button" variant="neutral" className="w-full" onClick={() => onSaveModelConfig(modelConfig)} disabled={busy || unavailableRouteCount > 0}>
                <Save className="h-4 w-4" />{unavailableRouteCount ? "先修复模型路线" : "保存本次路线"}
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    ) : null}
    </>
  );
}

function RunRecoveryPanel({ state }: { state: RunRecoveryPanelState | null }) {
  if (!state) {
    return null;
  }
  const toneClass = state.tone === "red"
    ? "fy-tone-danger"
    : state.tone === "amber"
      ? "fy-tone-warning"
      : "fy-tone-info";
  const barClass = state.tone === "red"
    ? "bg-red-500"
    : state.tone === "amber"
      ? "bg-amber-500"
      : "bg-blue-500";
  return (
    <div className={`fy-callout p-3 ${toneClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-black">{state.title}</div>
          <div className="mt-1 font-semibold opacity-90">{state.message}</div>
        </div>
        <div className="flex flex-wrap gap-1">
          {state.phaseLabel ? <Badge variant="outline">{state.phaseLabel}</Badge> : null}
          {state.resumeActionLabel ? <Badge variant="outline">{state.resumeActionLabel}</Badge> : null}
          {state.eventCount != null ? <Badge variant="outline">事件 {state.eventCount}</Badge> : null}
        </div>
      </div>
      {state.totalChunks ? (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between gap-2 text-[11px] font-semibold">
            <span>已完成 {state.completedChunks}/{state.totalChunks} 块</span>
            <span>{state.percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/80">
            <div className={`h-full rounded-full ${barClass}`} style={{ width: `${state.percent}%` }} />
          </div>
        </div>
      ) : null}
      {state.error ? (
        <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-[11px]">
          上次停止：{state.error}
        </div>
      ) : null}
      {state.actionHint ? <div className="mt-2 text-[11px] opacity-80">{state.actionHint}</div> : null}
    </div>
  );
}
function ExperimentLabPage({
  records,
  recordsPath,
  documentStatus,
  roundResult,
  compareData,
  detectionReport,
  exportResult,
  modelConfig,
  busy,
  onSave,
  onDelete,
  onReplay,
  onRefresh,
}: {
  records: ExperimentRecord[];
  recordsPath: string;
  documentStatus: DocumentStatus | null;
  roundResult: RoundResult | null;
  compareData: RoundCompareData | null;
  detectionReport: DetectionReport | null;
  exportResult: ExportResult | null;
  modelConfig: ModelConfig;
  busy: boolean;
  onSave: (record: ExperimentRecordInput) => void;
  onDelete: (id: string) => void;
  onReplay: (record: ExperimentRecord) => void;
  onRefresh: () => void;
}) {
  const stats = buildQualityStats(compareData, exportResult);
  const [strategy, setStrategy] = useState("两轮主流程");
  const [speedaiBefore, setSpeedaiBefore] = useState("");
  const [speedaiAfter, setSpeedaiAfter] = useState("");
  const [paperpassBefore, setPaperpassBefore] = useState("");
  const [paperpassAfter, setPaperpassAfter] = useState("");
  const [notes, setNotes] = useState("");
  const providerLabel = detectionReport?.providerLabel || detectionReport?.provider || "";
  const reportOverall = detectionReport?.summary.weightedOverallRiskProbability ?? detectionReport?.summary.overallRiskProbability ?? null;
  const currentRunAudit = buildCurrentRunAudit(roundResult, compareData, modelConfig);
  const auditCandidateLabel = currentRunAudit.rewriteCandidateMode === "quality" ? "质量模式" : "省钱模式";
  const auditModelLabel = [currentRunAudit.providerName, currentRunAudit.model].filter(Boolean).join(" · ") || "未记录";
  const currentDocRecords = documentStatus?.docId
    ? records.filter((record) => record.docId === documentStatus.docId)
    : records;
  const bestSpeedAI = minScore(currentDocRecords.map((record) => record.speedaiAfter));
  const bestPaperPass = minScore(currentDocRecords.map((record) => record.paperpassAfter));
  const scoredRecordCount = currentDocRecords.filter(
    (record) => record.speedaiAfter != null || record.paperpassAfter != null || record.reportOverall != null,
  ).length;
  const analysis = useMemo(() => buildExperimentAnalysis(currentDocRecords, records), [currentDocRecords, records]);

  function fillFromCurrentReport() {
    if (reportOverall == null) return;
    const provider = `${detectionReport?.provider || ""} ${detectionReport?.providerLabel || ""}`.toLowerCase();
    if (provider.includes("paperpass")) {
      setPaperpassAfter(String(reportOverall));
      return;
    }
    if (provider.includes("speedai")) {
      setSpeedaiAfter(String(reportOverall));
      return;
    }
  }

  function submitRecord() {
    onSave({
      strategy,
      speedaiBefore: parseScoreInput(speedaiBefore),
      speedaiAfter: parseScoreInput(speedaiAfter),
      paperpassBefore: parseScoreInput(paperpassBefore),
      paperpassAfter: parseScoreInput(paperpassAfter),
      notes,
    });
  }

  return (
    <div className="grid gap-5">
      <Card className="fy-panel">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xl font-black text-slate-950">策略复盘</div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                记录每次模型、轮次、prompt 组合和 SpeedAI / PaperPass 分数，把尝试沉淀成可复现的策略数据。
              </p>
            </div>
            <Button variant="outline" onClick={onRefresh} disabled={busy}>刷新记录</Button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ReportStat label="当前文档记录" value={String(currentDocRecords.length)} />
            <ReportStat label="有分数记录" value={String(scoredRecordCount)} />
            <ReportStat label="SpeedAI 最低" value={bestSpeedAI == null ? "-" : `${bestSpeedAI}%`} />
            <ReportStat label="PaperPass 最低" value={bestPaperPass == null ? "-" : `${bestPaperPass}%`} />
          </div>
        </CardContent>
      </Card>

      <Card className="fy-banner-primary shadow-soft">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant={analysis.scopeCount >= 3 ? "success" : "warning"}>
                  {analysis.scopeCount >= 3 ? "可参考" : "样本偏少"}
                </Badge>
                <div className="text-lg font-black text-slate-950">策略复盘面板</div>
              </div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                按“分数下降幅度、是否反噬、双平台一致性、样本数量”自动排序；先避免把偶然结果当规律。
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white/75 px-4 py-3 text-right shadow-sm">
              <div className="text-xs font-semibold text-slate-500">当前建议</div>
              <div className="mt-1 text-sm font-black text-slate-950">{analysis.primaryAction}</div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <div className="grid gap-3 sm:grid-cols-2">
              {analysis.recommendations.map((item) => (
                <ExperimentRecommendationCard key={item.title} item={item} />
              ))}
            </div>

            <div className="fy-section p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-950">策略排行榜</div>
                  <div className="mt-1 text-xs text-slate-500">综合越高越值得复测，反噬会被扣分。</div>
                </div>
                <Badge variant="outline">{analysis.rankings.length} 类</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {analysis.rankings.length ? analysis.rankings.slice(0, 4).map((item, index) => (
                  <ExperimentStrategyRankItem key={item.strategy} item={item} index={index} />
                )) : (
                  <div className="fy-empty-state p-5 text-xs leading-5">
                    还没有足够记录。至少保存一次“两轮主流程”和一次外部平台分数，面板才会变聪明。
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
        <Card className="fy-panel">
          <CardContent className="space-y-4 p-6">
            <div>
              <div className="text-base font-bold text-slate-950">记录本次结果</div>
              <p className="mt-1 text-xs leading-5 text-slate-500">拿到外部平台分数后，把前后结果填进来。分数越低越好，变化值会自动计算。</p>
            </div>

            <div className="fy-soft-section p-4 text-xs leading-5 text-slate-600">
              <div><b className="text-slate-900">文档：</b>{formatDocLabel(documentStatus?.docId)}</div>
              <div><b className="text-slate-900">轮次：</b>{roundResult?.round ?? compareData?.round ?? "-"} / <b className="text-slate-900">Prompt：</b>{describePromptProfile(modelConfig.promptProfile)} · {formatPromptSequence(modelConfig.promptSequence)}</div>
              <div><b className="text-slate-900">分块：</b>{stats.chunkCount} 块，需处理 {stats.reviewChunkCount}，表达提示 {stats.machineLikeRiskCount}</div>
              <div><b className="text-slate-900">运行审计：</b>{auditCandidateLabel}，预计 {currentRunAudit.estimatedApiCalls ?? "-"} 次调用，校验重试 {currentRunAudit.validationRetryCount ?? 0}，安全回退 {currentRunAudit.sourceFallbackCount ?? 0}</div>
              <div><b className="text-slate-900">模型：</b>{auditModelLabel}</div>
              <div><b className="text-slate-900">当前报告：</b>{providerLabel || "未上传"}{reportOverall != null ? ` · ${reportOverall}%` : ""}</div>
            </div>

            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              策略标签
              <select value={strategy} onChange={(event) => setStrategy(event.target.value)} className="fy-input h-11 rounded-2xl">
                <option>两轮主流程</option>
                <option>三轮主流程</option>
                <option>强命中重跑后</option>
                <option>局部重跑后</option>
                <option>更换模型后</option>
                <option>手动精修后</option>
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <ScoreInput label="SpeedAI 前" value={speedaiBefore} onChange={setSpeedaiBefore} />
              <ScoreInput label="SpeedAI 后" value={speedaiAfter} onChange={setSpeedaiAfter} />
              <ScoreInput label="PaperPass 前" value={paperpassBefore} onChange={setPaperpassBefore} />
              <ScoreInput label="PaperPass 后" value={paperpassAfter} onChange={setPaperpassAfter} />
            </div>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="备注：例如第一轮用 A 模型，第二轮用 B 模型；PaperPass 没降，SpeedAI 降到 5%。"
              className="min-h-24 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm leading-6 text-slate-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />

            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="outline" onClick={fillFromCurrentReport} disabled={busy || reportOverall == null}>从当前报告填入“后”分数</Button>
              <Button onClick={submitRecord} disabled={busy || !documentStatus}>保存复盘记录</Button>
            </div>
          </CardContent>
        </Card>

        <Card className="fy-panel">
          <CardContent className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-bold text-slate-950">复盘记录</div>
                <p className="mt-1 text-xs text-slate-500">当前文档优先显示；换文档后仍可看到全部历史记录。</p>
              </div>
              <Badge variant="outline">{records.length} 条</Badge>
            </div>

            <div className="mt-4 max-h-[620px] space-y-3 overflow-auto pr-1">
              {currentDocRecords.length ? currentDocRecords.map((record) => (
                <ExperimentRecordItem key={record.id} record={record} busy={busy} onReplay={onReplay} onDelete={onDelete} />
              )) : (
                <div className="fy-empty-state">
                  还没有这个文档的复盘记录。拿到一次外部平台分数后，把结果存下来。
                </div>
              )}
            </div>
            {recordsPath ? <div className="mt-4 text-xs text-slate-400">复盘记录保存在本地工作区。</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


type ExperimentRecommendation = {
  title: string;
  text: string;
  metric: string;
  tone: "success" | "warning" | "info";
};

type ExperimentStrategyRanking = {
  strategy: string;
  count: number;
  score: number | null;
  confidence: string;
  summary: string;
  speedaiAverageDelta: number | null;
  paperpassAverageDelta: number | null;
  bestSpeedaiAfter: number | null;
  bestPaperpassAfter: number | null;
  warningCount: number;
};

type ExperimentAnalysis = {
  scopeCount: number;
  primaryAction: string;
  recommendations: ExperimentRecommendation[];
  rankings: ExperimentStrategyRanking[];
};

function ExperimentRecommendationCard({ item }: { item: ExperimentRecommendation }) {
  const toneClass = item.tone === "success"
    ? "fy-tone-success"
    : item.tone === "warning"
      ? "fy-tone-warning"
      : "fy-tone-info";
  return (
    <div className={`fy-callout p-4 ${toneClass}`}>
      <div className="text-xs font-black opacity-80">{item.metric}</div>
      <div className="mt-2 text-sm font-black text-slate-950">{item.title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{item.text}</div>
    </div>
  );
}


function ExperimentStrategyRankItem({ item, index }: { item: ExperimentStrategyRanking; index: number }) {
  const scoreLabel = item.score == null ? "-" : item.score > 0 ? `+${item.score}` : String(item.score);
  const rankClass = index === 0 ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600";
  return (
    <div className="fy-section p-3">
      <div className="flex items-start gap-3">
        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${rankClass}`}>
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-bold text-slate-950">{item.strategy}</div>
            <Badge variant={item.warningCount ? "warning" : "outline"}>{item.confidence}</Badge>
            <Badge variant="secondary">综合 {scoreLabel}</Badge>
          </div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{item.summary}</div>
          <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              SpeedAI：{formatDeltaLabel(item.speedaiAverageDelta)} · 最低 {formatScore(item.bestSpeedaiAfter)}
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2">
              PaperPass：{formatDeltaLabel(item.paperpassAverageDelta)} · 最低 {formatScore(item.bestPaperpassAfter)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


function ScoreInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-700">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        placeholder="例如 5 或 35.2"
        className="fy-input h-11 rounded-2xl"
      />
    </label>
  );
}


function ExperimentRecordItem({
  record,
  busy,
  onReplay,
  onDelete,
}: {
  record: ExperimentRecord;
  busy: boolean;
  onReplay: (record: ExperimentRecord) => void;
  onDelete: (id: string) => void;
}) {
  const replayDisabled = busy || (!record.sourcePath && !record.outputPath);
  const modelHint = [record.providerName || record.roundModel?.providerName, record.model || record.roundModel?.model].filter(Boolean).join(" · ");
  return (
    <div className="fy-soft-section p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{record.strategy || "未标记策略"}</Badge>
            {record.round ? <Badge variant="outline">第 {record.round} 轮</Badge> : null}
            {record.reportProvider ? <Badge variant="outline">{record.reportProvider}</Badge> : null}
          </div>
          <div className="mt-2 truncate text-sm font-bold text-slate-950">{record.model || "未记录模型"}</div>
          <div className="mt-1 text-xs text-slate-500">{formatDateTime(record.createdAt)} · {record.promptSequence?.join(" → ") || record.promptProfile || "-"}</div>
          {modelHint ? <div className="mt-1 text-xs text-slate-500">模型提示：{modelHint}</div> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" disabled={replayDisabled} onClick={() => onReplay(record)}>复现</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDelete(record.id)}>删除</Button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ExperimentScoreBox provider="SpeedAI" before={record.speedaiBefore} after={record.speedaiAfter} delta={record.speedaiDelta} />
        <ExperimentScoreBox provider="PaperPass" before={record.paperpassBefore} after={record.paperpassAfter} delta={record.paperpassDelta} />
        <ReportStat label="需处理块" value={String(record.reviewChunkCount ?? "-")} />
        <ReportStat label="表达提示" value={String(record.machineLikeRiskCount ?? "-")} />
        <ReportStat label="候选策略" value={record.rewriteCandidateMode === "quality" ? "质量" : record.rewriteCandidateMode === "economy" ? "省钱" : "-"} />
        <ReportStat label="预计调用" value={record.estimatedApiCalls == null ? "-" : `${record.estimatedApiCalls}`} />
        <ReportStat label="校验重试" value={record.validationRetryCount == null ? "-" : `${record.validationRetryCount}`} />
        <ReportStat label="安全回退" value={record.sourceFallbackCount == null ? "-" : `${record.sourceFallbackCount}`} />
      </div>

      {record.notes ? <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-xs leading-5 text-slate-600">{record.notes}</div> : null}
    </div>
  );
}


function ExperimentScoreBox({ provider, before, after, delta }: { provider: string; before?: number | null; after?: number | null; delta?: number | null }) {
  const hasScore = before != null || after != null;
  return (
    <div className="fy-stat-card p-3">
      <div className="text-xs font-semibold text-slate-500">{provider}</div>
      <div className="mt-2 text-sm font-bold text-slate-950">{hasScore ? `${formatScore(before)} → ${formatScore(after)}` : "-"}</div>
      <div className={delta == null ? "mt-1 text-xs text-slate-400" : delta <= 0 ? "mt-1 text-xs font-semibold text-emerald-600" : "mt-1 text-xs font-semibold text-red-600"}>
        {delta == null ? "未计算" : `${delta > 0 ? "+" : ""}${delta}%`}
      </div>
    </div>
  );
}


function parseScoreInput(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const parsed = Number(normalized.replace("%", ""));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 1000) / 1000;
}


function formatScore(value?: number | null): string {
  return value == null ? "-" : `${value}%`;
}


function minScore(values: Array<number | null | undefined>): number | null {
  const numericValues = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!numericValues.length) return null;
  return Math.min(...numericValues);
}


function buildExperimentReplayConfig(record: ExperimentRecord, currentConfig: ModelConfig): { config: ModelConfig; modelHint: string; modelApplied: boolean } {
  const promptProfile = isPromptProfile(record.promptProfile) ? record.promptProfile : currentConfig.promptProfile;
  const promptSequence = normalizePromptSequence(record.promptSequence ?? currentConfig.promptSequence);
  const roundModel = record.roundModel ?? null;
  let modelApplied = false;
  let config: ModelConfig = {
    ...currentConfig,
    promptProfile,
    promptSequence,
  };

  if (roundModel?.model) {
    const roundModelKey = getRoundModelKey(promptProfile, roundModel.round ?? record.round);
    const storedRoundModel = roundModelKey ? currentConfig.roundModels?.[roundModelKey] : undefined;
    if (roundModelKey && storedRoundModel?.apiKey?.trim()) {
      config = {
        ...config,
        roundModels: {
          ...(currentConfig.roundModels ?? {}),
          [roundModelKey]: {
            ...storedRoundModel,
            enabled: true,
            providerName: roundModel.providerName ?? storedRoundModel.providerName,
            baseUrl: roundModel.baseUrl || storedRoundModel.baseUrl || currentConfig.baseUrl,
            model: roundModel.model || storedRoundModel.model || currentConfig.model,
            apiType: roundModel.apiType || storedRoundModel.apiType || currentConfig.apiType,
            temperature: roundModel.temperature ?? storedRoundModel.temperature ?? currentConfig.temperature,
            requestTimeoutSeconds: storedRoundModel.requestTimeoutSeconds ?? currentConfig.requestTimeoutSeconds,
            maxRetries: storedRoundModel.maxRetries ?? currentConfig.maxRetries,
          },
        },
      };
      modelApplied = true;
    } else if (!roundModel.baseUrl || roundModel.baseUrl.trim() === currentConfig.baseUrl.trim()) {
      config = {
        ...config,
        model: roundModel.model || currentConfig.model,
        apiType: roundModel.apiType || currentConfig.apiType,
        temperature: roundModel.temperature ?? currentConfig.temperature,
      };
      modelApplied = true;
    }
  } else if (record.model?.trim()) {
    config = {
      ...config,
      model: record.model.trim(),
    };
    modelApplied = true;
  }

  const providerLabel = roundModel?.providerName || record.providerName || "";
  const modelLabel = roundModel?.model || record.model || "";
  const roundLabel = roundModel?.round || record.round ? `第 ${roundModel?.round ?? record.round} 轮` : "";
  const modelHint = [roundLabel, providerLabel, modelLabel].filter(Boolean).join(" · ");
  return { config, modelHint, modelApplied };
}


function buildExperimentAnalysis(scopedRecords: ExperimentRecord[], allRecords: ExperimentRecord[]): ExperimentAnalysis {
  const sourceRecords = scopedRecords.length ? scopedRecords : allRecords;
  const rankings = buildStrategyRankings(sourceRecords);
  const recommendations = buildExperimentRecommendations(sourceRecords, rankings);
  return {
    scopeCount: sourceRecords.length,
    primaryAction: derivePrimaryExperimentAction(sourceRecords, rankings),
    recommendations,
    rankings,
  };
}


function buildStrategyRankings(records: ExperimentRecord[]): ExperimentStrategyRanking[] {
  const groups = new Map<string, ExperimentRecord[]>();
  records.forEach((record) => {
    const strategy = (record.strategy || "未标记策略").trim() || "未标记策略";
    const group = groups.get(strategy) || [];
    group.push(record);
    groups.set(strategy, group);
  });

  return Array.from(groups.entries()).map(([strategy, strategyRecords]) => {
    const speedaiDeltas = strategyRecords.map((record) => getExperimentDelta(record, "speedai")).filter(isFiniteNumber);
    const paperpassDeltas = strategyRecords.map((record) => getExperimentDelta(record, "paperpass")).filter(isFiniteNumber);
    const speedaiAverageDelta = averageNumber(speedaiDeltas);
    const paperpassAverageDelta = averageNumber(paperpassDeltas);
    const bestSpeedaiAfter = minScore(strategyRecords.map((record) => record.speedaiAfter));
    const bestPaperpassAfter = minScore(strategyRecords.map((record) => record.paperpassAfter));
    const warningCount = strategyRecords.reduce((total, record) => {
      const speedaiDelta = getExperimentDelta(record, "speedai");
      const paperpassDelta = getExperimentDelta(record, "paperpass");
      return total + (isFiniteNumber(speedaiDelta) && speedaiDelta > 0.5 ? 1 : 0) + (isFiniteNumber(paperpassDelta) && paperpassDelta > 0.5 ? 1 : 0);
    }, 0);
    const score = scoreExperimentStrategy(speedaiAverageDelta, paperpassAverageDelta, strategyRecords.length, warningCount);
    return {
      strategy,
      count: strategyRecords.length,
      score,
      confidence: describeExperimentConfidence(strategyRecords.length, speedaiDeltas.length, paperpassDeltas.length),
      summary: summarizeExperimentStrategy(speedaiAverageDelta, paperpassAverageDelta, warningCount),
      speedaiAverageDelta,
      paperpassAverageDelta,
      bestSpeedaiAfter,
      bestPaperpassAfter,
      warningCount,
    };
  }).sort((left, right) => {
    const rightScore = right.score ?? Number.NEGATIVE_INFINITY;
    const leftScore = left.score ?? Number.NEGATIVE_INFINITY;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return right.count - left.count;
  });
}


function buildExperimentRecommendations(records: ExperimentRecord[], rankings: ExperimentStrategyRanking[]): ExperimentRecommendation[] {
  if (!records.length) {
    return [
      {
        title: "先建立两轮基线",
        text: "先跑默认两轮并保存 SpeedAI / PaperPass 分数，后续所有策略都要和它比较。",
        metric: "起点",
        tone: "warning",
      },
      {
        title: "别先做报告重跑",
      text: "没有基线时直接追着外部报告改，容易把局部命中修掉，却让整篇风格更像机器。",
        metric: "避坑",
        tone: "info",
      },
    ];
  }

  const recommendations: ExperimentRecommendation[] = [];
  const bestSpeedai = minScore(records.map((record) => record.speedaiAfter));
  const bestPaperpass = minScore(records.map((record) => record.paperpassAfter));
  const twoRound = findRanking(rankings, "两轮主流程");
  const threeRound = findRanking(rankings, "三轮主流程");
  const reportRerun = findRanking(rankings, "强命中重跑后");
  const latestRecord = getLatestExperimentRecord(records);

  if (twoRound && (!threeRound || compareRankingScore(twoRound, threeRound) >= 0.8)) {
    recommendations.push({
      title: "默认保留两轮主流程",
      text: "两轮目前比三轮更稳或样本更多；不要为了“多跑一轮”牺牲自然段落节奏。",
      metric: "主流程",
      tone: "success",
    });
  }

  if (bestSpeedai != null && bestSpeedai <= 6 && bestPaperpass != null && bestPaperpass >= 20) {
    recommendations.push({
      title: "两个平台在看不同东西",
      text: "SpeedAI 已经很低，PaperPass 仍高，说明下一步要调整整篇风格分布，而不是继续局部重跑。",
      metric: "分歧",
      tone: "info",
    });
  }

  if (reportRerun && ((reportRerun.speedaiAverageDelta ?? 0) > 0 || (reportRerun.paperpassAverageDelta ?? 0) > -0.5 || reportRerun.warningCount > 0)) {
    recommendations.push({
      title: "外部报告只做定位",
      text: "强命中重跑没有稳定拉低 PaperPass，甚至可能抬高 SpeedAI；它适合最后修少量硬伤。",
      metric: "报告反馈",
      tone: "warning",
    });
  }

  if (latestRecord) {
    const latestSpeedaiDelta = getExperimentDelta(latestRecord, "speedai");
    const latestPaperpassDelta = getExperimentDelta(latestRecord, "paperpass");
    if ((isFiniteNumber(latestSpeedaiDelta) && latestSpeedaiDelta > 0.5) || (isFiniteNumber(latestPaperpassDelta) && latestPaperpassDelta > 0.5)) {
      recommendations.push({
        title: "上一组出现反噬",
        text: "最近保存的策略让至少一个平台分数上升，下一轮不要沿用同一策略批量处理。",
        metric: "止损",
        tone: "warning",
      });
    }
  }

  if (!recommendations.length && rankings[0]) {
    recommendations.push({
      title: `优先复测：${rankings[0].strategy}`,
      text: "当前样本里它的综合收益最高；再补一组相同流程，确认不是模型偶然输出。",
      metric: "复测",
      tone: "success",
    });
  }

  return recommendations.slice(0, 4);
}


function derivePrimaryExperimentAction(records: ExperimentRecord[], rankings: ExperimentStrategyRanking[]): string {
  if (!records.length) return "先跑两轮基线";
  const bestRanking = rankings[0];
  if (!bestRanking) return "继续记录分数";
  if (bestRanking.warningCount > 0 && rankings.length > 1) return `谨慎复测 ${rankings[1].strategy}`;
  if ((bestRanking.score ?? 0) <= 0) return "暂停局部重跑";
  return `复测 ${bestRanking.strategy}`;
}


function findRanking(rankings: ExperimentStrategyRanking[], keyword: string): ExperimentStrategyRanking | null {
  return rankings.find((item) => item.strategy.includes(keyword)) ?? null;
}


function compareRankingScore(left: ExperimentStrategyRanking, right: ExperimentStrategyRanking): number {
  return (left.score ?? Number.NEGATIVE_INFINITY) - (right.score ?? Number.NEGATIVE_INFINITY);
}


function getLatestExperimentRecord(records: ExperimentRecord[]): ExperimentRecord | null {
  const sortedRecords = [...records].sort((left, right) => {
    const leftTime = new Date(left.createdAt || "").getTime();
    const rightTime = new Date(right.createdAt || "").getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
  });
  return sortedRecords[0] ?? null;
}


function scoreExperimentStrategy(speedaiAverageDelta: number | null, paperpassAverageDelta: number | null, count: number, warningCount: number): number | null {
  const providers: Array<{ delta: number; weight: number }> = [];
  if (isFiniteNumber(speedaiAverageDelta)) providers.push({ delta: speedaiAverageDelta, weight: 0.55 });
  if (isFiniteNumber(paperpassAverageDelta)) providers.push({ delta: paperpassAverageDelta, weight: 0.45 });
  if (!providers.length) return null;

  const totalWeight = providers.reduce((total, provider) => total + provider.weight, 0);
  const weightedImprovement = providers.reduce((total, provider) => total + (-provider.delta * provider.weight), 0) / totalWeight;
  const worsenPenalty = providers.reduce((total, provider) => total + Math.max(0, provider.delta) * 0.8, 0);
  const sampleFactor = Math.min(1, Math.sqrt(count / 3));
  const sampleBonus = Math.min(0.8, Math.log1p(count) * 0.22);
  const score = weightedImprovement * sampleFactor + sampleBonus - warningCount * 0.35 - worsenPenalty;
  return roundScore(score);
}


function summarizeExperimentStrategy(speedaiAverageDelta: number | null, paperpassAverageDelta: number | null, warningCount: number): string {
  const speedaiImproved = isFiniteNumber(speedaiAverageDelta) && speedaiAverageDelta <= -2;
  const paperpassImproved = isFiniteNumber(paperpassAverageDelta) && paperpassAverageDelta <= -2;
  const speedaiWorse = isFiniteNumber(speedaiAverageDelta) && speedaiAverageDelta > 0.5;
  const paperpassWorse = isFiniteNumber(paperpassAverageDelta) && paperpassAverageDelta > 0.5;

  if (warningCount || speedaiWorse || paperpassWorse) return "出现分数上升，适合小范围复盘，不适合批量沿用。";
  if (speedaiImproved && paperpassImproved) return "两个平台都有下降，是当前最值得复测的方向。";
  if (speedaiImproved && !paperpassImproved) return "对 SpeedAI 有效，对 PaperPass 的收益暂时不明显。";
  if (!speedaiImproved && paperpassImproved) return "对 PaperPass 有效果，需要确认是否会影响 SpeedAI。";
  return "变化幅度偏小，继续补样本后再判断。";
}


function describeExperimentConfidence(count: number, speedaiCount: number, paperpassCount: number): string {
  const providerKinds = Number(speedaiCount > 0) + Number(paperpassCount > 0);
  if (count >= 5 && providerKinds >= 2) return "稳定样本";
  if (count >= 2 && providerKinds >= 2) return "可复测";
  if (count >= 2) return "单平台样本";
  return "单次样本";
}


function getExperimentDelta(record: ExperimentRecord, provider: "speedai" | "paperpass"): number | null {
  const explicitDelta = provider === "speedai" ? record.speedaiDelta : record.paperpassDelta;
  if (isFiniteNumber(explicitDelta)) return explicitDelta;
  const before = provider === "speedai" ? record.speedaiBefore : record.paperpassBefore;
  const after = provider === "speedai" ? record.speedaiAfter : record.paperpassAfter;
  if (!isFiniteNumber(before) || !isFiniteNumber(after)) return null;
  return roundScore(after - before);
}


function averageNumber(values: number[]): number | null {
  if (!values.length) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return roundScore(total / values.length);
}


function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}


function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}


function formatDeltaLabel(value?: number | null): string {
  if (value == null) return "-";
  return `${value > 0 ? "+" : ""}${value}%`;
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

function getDiagnosticBadgeVariant(level?: string): "success" | "warning" | "outline" {
  if (level === "success") return "success";
  if (level === "warning" || level === "error") return "warning";
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
      nodeExecutable: redactLocalPath(value.runtime.nodeExecutable),
      npmExecutable: redactLocalPath(value.runtime.npmExecutable),
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
  const warningCount = value?.checks.filter((item) => item.level === "warning").length ?? 0;
  const errorCount = value?.checks.filter((item) => item.level === "error").length ?? 0;
  const statusText = !value ? "等待自检" : errorCount ? `${errorCount} 个错误` : warningCount ? `${warningCount} 个提示` : "全部通过";
  const statusClass = !value
    ? "bg-slate-50 text-slate-700"
    : errorCount
      ? "bg-red-50 text-red-700"
      : warningCount
        ? "bg-amber-50 text-amber-700"
        : "bg-emerald-50 text-emerald-700";
  const activeBatchRerunCount = value?.activeBatchRerunCount ?? value?.activeBatchReruns?.length ?? 0;
  const recentRunCount = value?.recentRunCount ?? value?.recentRuns?.length ?? 0;
  const recentBatchRerunCount = value?.recentBatchRerunCount ?? value?.recentBatchReruns?.length ?? 0;
  const activeTaskCount = (value?.activeRunCount ?? 0) + activeBatchRerunCount;
  const recentTaskCount = recentRunCount + recentBatchRerunCount;
  const taskStateStore = value?.taskStateStore;
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = async () => {
    if (!value) return;
    await copyTextToClipboard(JSON.stringify(buildShareableDiagnostics(value), null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="grid gap-4">
      <Card className="fy-panel">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xl font-black text-slate-950">
                <Activity className="h-5 w-5 text-blue-600" />
                启动诊断
              </div>
              <div className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                这里检查后端是否在线、模型配置是否完整、工作目录是否可写，以及本地 Python / Node 环境是否可见。
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusClass} variant="outline">{statusText}</Badge>
              <Button variant="outline" onClick={() => void copyDiagnostics()} disabled={!value}>
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {copied ? "已复制" : "复制诊断信息"}
              </Button>
              <Button onClick={onRefresh} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                重新自检
              </Button>
            </div>
          </div>
          {value ? (
            <div className="mt-4 grid gap-3 text-xs text-slate-500 md:grid-cols-3">
                <div className="fy-stat-card p-3">
                <div className="font-black text-slate-400">工作区</div>
                <div className="mt-1 truncate font-semibold text-slate-800">{value.workspace}</div>
              </div>
                <div className="fy-stat-card p-3">
                <div className="font-black text-slate-400">自检时间</div>
                <div className="mt-1 font-semibold text-slate-800">{formatDateTime(value.createdAt)}</div>
              </div>
                <div className="fy-stat-card p-3">
                <div className="font-black text-slate-400">后台任务</div>
                <div className="mt-1 font-semibold text-slate-800">{activeTaskCount} 个运行中</div>
                <div className="mt-1 text-[11px] font-semibold text-slate-500">轮次 {value.activeRunCount} · 重跑 {activeBatchRerunCount} · 摘要 {recentTaskCount}</div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {value ? (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {value.checks.map((item) => (
              <Card key={item.key} className={`shadow-sm ${item.level === "error" ? "fy-tone-danger" : item.level === "warning" ? "fy-tone-warning" : "fy-section"}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-black text-slate-950">{item.label}</div>
                    <Badge variant={getDiagnosticBadgeVariant(item.level)}>{item.level === "success" ? "通过" : item.level === "error" ? "错误" : item.level === "warning" ? "提示" : "信息"}</Badge>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-600">{item.message}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
            <Card className="fy-panel">
              <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-slate-950">工作目录</div>
                    <div className="mt-1 text-xs text-slate-500">项目内文件统计只用于判断占用和权限，不会删除任何内容。</div>
                  </div>
                </div>
                <div className="grid gap-2">
                  {value.paths.map((item) => (
                    <div key={item.key} className="fy-soft-section grid gap-2 p-3 text-xs md:grid-cols-[140px_minmax(0,1fr)_130px] md:items-center">
                      <div>
                        <div className="font-black text-slate-800">{item.label}</div>
                        <div className={item.exists && item.writable ? "text-emerald-600" : "text-amber-600"}>
                          {item.exists ? item.writable ? "可写" : "不可写" : "不存在"}
                        </div>
                      </div>
                      <div className="min-w-0 truncate text-slate-500">{item.path}</div>
                      <div className="font-semibold text-slate-700 md:text-right">{item.fileCount} 文件 · {formatBytes(item.sizeBytes)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4">
              <Card className="fy-panel">
                <CardContent className="space-y-3 p-5">
                  <div className="text-base font-black text-slate-950">模型配置快照</div>
                  <div className="grid gap-2 text-xs">
                    <div className="flex justify-between gap-3"><span className="text-slate-500">模式</span><b>{value.config.offlineMode ? "离线模式" : "远程模型"}</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">默认模型</span><b className="truncate">{value.config.model || "未填写"}</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">Base URL</span><b>{value.config.hasBaseUrl ? "已填写" : "未填写"}</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">API Key</span><b>{value.config.hasApiKey ? "已填写" : "未填写"}</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">服务商</span><b>{value.config.enabledProviderCount}/{value.config.providerCount} 启用</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">专属轮次</span><b>{value.config.customRoundCount} 个</b></div>
                    <div className="flex justify-between gap-3"><span className="text-slate-500">超时/重试</span><b>{value.config.requestTimeoutSeconds ?? "-"}s / {value.config.maxRetries ?? "-"} 次</b></div>
                  </div>
                </CardContent>
              </Card>

              <Card className="fy-panel">
                <CardContent className="space-y-3 p-5">
                  <div className="text-base font-black text-slate-950">本地运行环境</div>
                  <div className="grid gap-2 text-xs">
                    <div><span className="text-slate-500">Python：</span><b>{value.runtime.pythonVersion}</b></div>
                    <div className="truncate"><span className="text-slate-500">Python 路径：</span>{value.runtime.pythonExecutable}</div>
                    <div className="truncate"><span className="text-slate-500">Node：</span>{value.runtime.nodeExecutable || "未在后端 PATH 中发现"}</div>
                    <div className="truncate"><span className="text-slate-500">npm：</span>{value.runtime.npmExecutable || "未在后端 PATH 中发现"}</div>
                    <div className="truncate"><span className="text-slate-500">平台：</span>{value.runtime.platform}</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {taskStateStore ? (
            <Card className="fy-panel fy-tone-info">
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-black text-blue-950">任务快照治理</div>
                    <div className="mt-1 text-xs leading-5 text-blue-700">
                      快照用于刷新或后端重启后的恢复提示；清理只会删除过期且非运行中的快照。
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={onCleanupTaskSnapshots}
                    disabled={busy || taskStateStore.staleCount <= 0}
                  >
                    <Trash2 className="h-4 w-4" />
                    清理过期快照
                  </Button>
                </div>
                <div className="mt-4 grid gap-2 text-xs md:grid-cols-4">
                  <div className="fy-status-tile bg-white/80 p-3">
                    <div className="font-black text-blue-400">快照文件</div>
                    <div className="mt-1 font-semibold text-blue-950">{taskStateStore.fileCount} 个 · {formatBytes(taskStateStore.sizeBytes)}</div>
                  </div>
                  <div className="fy-status-tile bg-white/80 p-3">
                    <div className="font-black text-blue-400">任务类型</div>
                    <div className="mt-1 font-semibold text-blue-950">轮次 {taskStateStore.runRoundCount} · 重跑 {taskStateStore.batchRerunCount}</div>
                  </div>
                  <div className="fy-status-tile bg-white/80 p-3">
                    <div className="font-black text-blue-400">保护中</div>
                    <div className="mt-1 font-semibold text-blue-950">{taskStateStore.activeSnapshotCount} 个运行中快照</div>
                  </div>
                  <div className="fy-status-tile bg-white/80 p-3">
                    <div className="font-black text-blue-400">可清理</div>
                    <div className="mt-1 font-semibold text-blue-950">{taskStateStore.staleCount} 个超过 {taskStateStore.retentionHours} 小时</div>
                  </div>
                </div>
                <div className="mt-3 truncate text-[11px] font-semibold text-blue-700">{taskStateStore.path}</div>
              </CardContent>
            </Card>
          ) : null}

          {value.activeRuns.length || value.activeBatchReruns?.length ? (
            <Card className="fy-panel fy-tone-warning">
              <CardContent className="p-5">
                <div className="mb-3 text-base font-black text-amber-950">运行中的任务</div>
                <div className="grid gap-2">
                  {value.activeRuns.map((item) => (
                    <div key={item.runId} className="fy-callout bg-white/80 p-3 text-amber-900">
                      <div className="font-black">轮次任务 · {item.runId}</div>
                      <div className="truncate">{item.sourcePath}</div>
                      <div>事件 {item.eventCount} 个 · {item.cancelRequested ? "已请求中断" : "运行中"} · 更新 {formatDateTime(item.updatedAt)}</div>
                    </div>
                  ))}
                  {(value.activeBatchReruns ?? []).map((item) => (
                    <div key={item.runId} className="fy-callout bg-white/80 p-3 text-amber-900">
                      <div className="font-black">批量重跑 · {item.runId}</div>
                      <div className="truncate">{item.outputPath}</div>
                      <div>
                        {item.completedCount}/{item.totalCount} 块 · 成功 {item.successCount} · 失败 {item.failureCount}
                        {item.currentChunkId ? ` · 当前 ${item.currentChunkId}` : ""} · {item.cancelRequested ? "已请求停止" : item.status}
                      </div>
                      <div className="text-[11px] text-amber-700">更新 {formatDateTime(item.updatedAt)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {value.recentRuns?.length || value.recentBatchReruns?.length ? (
            <Card className="fy-panel">
              <CardContent className="p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-base font-black text-slate-950">近期任务摘要</div>
                  <div className="text-xs font-semibold text-slate-500">轮次 {recentRunCount} · 重跑 {recentBatchRerunCount}</div>
                </div>
                <div className="grid gap-2">
                  {(value.recentRuns ?? []).map((item) => (
                    <div key={item.runId} className="fy-callout fy-tone-info p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-black">{item.status === "interrupted" ? "轮次未完成" : "轮次已落盘"} · {item.runId}</div>
                        <Badge variant={item.status === "interrupted" ? "warning" : "outline"}>{item.status}</Badge>
                      </div>
                      <div className="truncate">{item.sourcePath}</div>
                      <div>
                        事件 {item.eventCount} 个
                        {item.lastEvent?.phase ? ` · 最后阶段 ${item.lastEvent.phase}` : ""}
                        {item.lastEvent?.chunkId ? ` · 最后块 ${item.lastEvent.chunkId}` : ""}
                      </div>
                      {item.error ? <div className="mt-1 rounded-xl bg-white/80 px-3 py-2 text-[11px] text-blue-700">{item.error}</div> : null}
                      <div className="text-[11px] text-blue-700">落盘 {formatDateTime(item.persistedAt || item.updatedAt)} · 更新 {formatDateTime(item.updatedAt)}</div>
                    </div>
                  ))}
                  {(value.recentBatchReruns ?? []).map((item) => (
                    <div key={item.runId} className="fy-callout fy-tone-neutral p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-black">{item.status === "interrupted" ? "重跑未完成" : "重跑已落盘"} · {item.runId}</div>
                        <Badge variant={item.status === "interrupted" ? "warning" : "outline"}>{item.status}</Badge>
                      </div>
                      <div className="truncate">{item.outputPath}</div>
                      <div>
                        {item.completedCount}/{item.totalCount} 块 · 成功 {item.successCount} · 失败 {item.failureCount}
                        {item.currentChunkId ? ` · 最后 ${item.currentChunkId}` : ""}
                      </div>
                      {item.error ? <div className="mt-1 rounded-xl bg-white px-3 py-2 text-[11px] text-slate-500">{item.error}</div> : null}
                      <div className="text-[11px] text-slate-500">落盘 {formatDateTime(item.persistedAt || item.updatedAt)} · 更新 {formatDateTime(item.updatedAt)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : (
        <Card className="fy-empty-state bg-white/80">
          <CardContent className="p-8 text-center text-sm text-slate-500">
            点击“重新自检”读取当前环境状态。
          </CardContent>
        </Card>
      )}
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
    <Card className="fy-panel fy-detection-panel">
      <CardContent className="space-y-3 p-3">
        <div className="fy-banner-primary p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-black">检测反馈</div>
              <div className="mt-1 truncate text-xs text-slate-500">
                {documentLabel ? `文档：${documentLabel}` : "上传文档后可接入报告"}
              </div>
            </div>
            {report
              ? <Badge variant={hasParsedSegments ? (highSegments.length ? "warning" : "success") : "warning"}>{hasParsedSegments ? `${providerLabel} ${overallRisk ?? "-"}%` : "未解析到片段"}</Badge>
              : <Badge variant="outline">未接入</Badge>}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickReport("speedai")}
              disabled={busy || !documentLabel}
              className={`h-10 bg-white/80 ${report?.provider === "speedai" ? "ring-2 ring-blue-300" : ""}`}
            >
              上传 SpeedAI
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onPickReport("paperpass")}
              disabled={busy || !documentLabel}
              className={`h-10 bg-white/80 ${report?.provider === "paperpass" ? "ring-2 ring-amber-300" : ""}`}
            >
              上传 PaperPass
            </Button>
          </div>
        </div>

        {report ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="fy-status-tile fy-tone-neutral text-slate-700">
                <div className="text-lg font-black">{report.segments.length}</div>
                <div>报告片段</div>
              </div>
              <div className="fy-status-tile fy-tone-danger text-red-700">
                <div className="text-lg font-black">{highSegments.length}</div>
                <div>高风险</div>
              </div>
              <div className="fy-status-tile fy-tone-info text-blue-700">
                <div className="text-lg font-black">{strongMatchedRisky.length}</div>
                <div>强命中</div>
              </div>
              <div className="fy-status-tile fy-tone-warning text-amber-700">
                <div className="text-lg font-black">{reviewMatches.length + weakMatches.length + unmatchedRisky.length}</div>
                <div>需人工看</div>
              </div>
            </div>

            <div className="fy-soft-section p-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                <span className="truncate">来源：<b className="text-slate-900">{providerLabel}</b>{reportSourceLabel ? ` · ${reportSourceLabel}` : ""}</span>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {hasParsedSegments ? (
                    <Button size="sm" onClick={onRerunMatchedChunks} disabled={busy || strongMatchedRisky.length === 0}>
                      重跑强命中 {strongMatchedRisky.length}
                    </Button>
                  ) : null}
                  <Button variant="ghost" size="sm" onClick={onClearReport} disabled={busy}>清除</Button>
                </div>
              </div>
              {report.summary.checkedScopeNotes?.length ? (
                <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  {report.summary.checkedScopeNotes.join("；")}
                </div>
              ) : null}
            </div>

            {!hasParsedSegments ? (
              <div className="fy-callout border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-800">
                <div className="font-bold">没有解析到风险片段</div>
              </div>
            ) : (
              <details className="fy-disclosure group">
                <summary className="fy-disclosure-summary">
                  <span>报告片段</span>
                  <span className="text-xs text-muted-foreground group-open:hidden">展开</span>
                  <span className="hidden text-xs text-muted-foreground group-open:inline">收起</span>
                </summary>
                <div className="fy-disclosure-body">
                <div className="fy-filter-tabs grid-cols-4">
                  {[
                    { key: "strong" as const, label: `强命中 ${strongMatchedRisky.length}` },
                    { key: "review" as const, label: `疑似 ${reviewMatches.length}` },
                    { key: "unmatched" as const, label: `未确认 ${unmatchedRisky.length + weakMatches.length}` },
                    { key: "all" as const, label: `全部 ${riskySegments.length}` },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setMatchFilter(item.key)}
                      className={`fy-filter-tab ${matchFilter === item.key ? "fy-filter-tab-active" : ""}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {visibleSegmentSummaries.length ? visibleSegmentSummaries.map(({ segment, matchedItems, strongCount, reviewCount, weakCount, bestMatch, matchState }) => (
                    <div key={segment.index} className={`fy-callout p-3 ${matchState === "strong" ? "fy-tone-info" : matchState === "review" ? "fy-tone-warning" : "fy-tone-neutral"}`}>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Badge variant={isDetectionHighRisk(segment) ? "warning" : "outline"}>#{segment.index} {segment.probability}%</Badge>
                        {segment.page ? <Badge variant="outline">第 {segment.page} 页</Badge> : null}
                        <Badge variant="outline">{segment.riskLevel || "未知风险"}</Badge>
                        {strongCount ? <Badge variant="success">强命中 {strongCount}</Badge> : reviewCount ? <Badge variant="warning">疑似 {reviewCount}</Badge> : weakCount ? <Badge variant="outline">弱匹配 {weakCount}</Badge> : <Badge variant="outline">未匹配</Badge>}
                        {bestMatch ? <Badge variant="secondary">最高 {Math.round(bestMatch.score * 100)}%</Badge> : null}
                      </div>
                      <div className="line-clamp-3 text-slate-700">{segment.content}</div>
                      {bestMatch ? <div className="mt-2 rounded-xl bg-white/80 px-2 py-1 text-[11px] text-slate-600">{bestMatch.reason}</div> : null}
                      {bestMatch?.evidence.matchedFragments?.[0] ? (
                        <div className="mt-2 break-all rounded-xl border border-white bg-white/80 px-2 py-1 text-[11px] text-slate-500">
                          命中句段：{bestMatch.evidence.matchedFragments[0]}
                        </div>
                      ) : null}
                      {matchedItems.length > 1 ? (
                        <div className="mt-2 text-[11px] font-semibold text-slate-500">候选匹配：{matchedItems.map((item) => `${item.chunkId} ${Math.round(item.score * 100)}%`).join(" / ")}</div>
                      ) : null}
                    </div>
                  )) : (
                    <div className="fy-empty-state p-4">
                      当前分层下没有可显示片段。
                    </div>
                  )}
                </div>
                </div>
              </details>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}


function RouteOverviewCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info" | "brand" | "slate";
}) {
  const toneClass = tone === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "danger"
        ? "border-red-200 bg-red-50 text-red-900"
        : tone === "info"
          ? "border-blue-200 bg-blue-50 text-blue-900"
          : tone === "brand"
            ? "border-violet-200 bg-violet-50 text-violet-900"
            : "border-slate-200 bg-slate-50 text-slate-800";
  return (
    <div className={`rounded-2xl border p-3 ${toneClass}`}>
      <div className="text-[10px] font-black opacity-70">{label}</div>
      <div className="mt-1 truncate text-sm font-black">{value}</div>
      <div className="mt-1 line-clamp-2 text-[11px] leading-5 opacity-80">{detail}</div>
    </div>
  );
}

function PromptModeButton({
  active,
  title,
  text,
  disabled,
  onClick,
}: {
  active: boolean;
  title: string;
  text: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`fy-tile px-3 py-2 ${
        active ? "fy-tile-active text-slate-950" : "text-slate-700"
      } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-slate-500">{text}</div>
    </button>
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
      <Card className="fy-panel">
        <CardContent className="p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xl font-bold text-slate-950">改写检查</div>
              <p className="mt-2 text-sm text-slate-500">这里不是外部平台分数，只展示可解释的结构、引用、排版与表达提示。</p>
            </div>
            <Badge variant={riskMessages.length ? "warning" : "success"}>{riskMessages.length ? `${riskMessages.length} 类风险` : "当前稳定"}</Badge>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <ReportStat label="Diff 块" value={String(stats.chunkCount)} />
            <ReportStat label="需处理块" value={String(stats.reviewChunkCount)} />
            <ReportStat label="结构锁定" value={String(stats.protectedTokenCount)} />
            <ReportStat label="表达提示" value={String(stats.machineLikeRiskCount)} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className="fy-panel">
          <CardContent className="p-6">
            <div className="text-base font-bold text-slate-950">导出前风险</div>
            <div className="mt-4 grid gap-2">
              {riskMessages.length ? riskMessages.map((message) => (
                <div key={message} className="fy-callout fy-tone-warning px-4 py-3 text-sm">{message}</div>
              )) : <div className="fy-callout fy-tone-success px-4 py-3 text-sm">当前没有发现需要阻止导出的显著风险。</div>}
            </div>
          </CardContent>
        </Card>

        <Card className="fy-panel">
          <CardContent className="p-6">
            <div className="text-base font-bold text-slate-950">结构保护</div>
            <div className="fy-soft-section mt-4 px-4 py-3 text-sm leading-6 text-slate-600">{protectedTypeText}</div>
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
    <div className="fy-stat-card">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-bold text-slate-950">{value}</div>
    </div>
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
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }
  const unreadCount = items.filter((item) => !item.read).length;
  const errorCount = items.filter((item) => item.kind === "error").length;
  const runningTaskCount = taskItems.filter((item) => item.running).length;

  return (
    <div className="fy-overlay">
      <button type="button" aria-label="关闭通知与任务中心遮罩" className="fy-overlay-scrim" onClick={onClose} />
      <aside className="fy-drawer fy-drawer-narrow" role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
        <div className="fy-drawer-header">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <Bell className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div id="notification-center-title" className="text-lg font-black text-slate-950">通知与任务中心</div>
                <div className="mt-0.5 flex flex-wrap gap-1.5">
                  <Badge variant={runningTaskCount ? "warning" : "outline"}>{runningTaskCount} 运行中</Badge>
                  {taskItems.length ? <Badge variant="outline">{taskItems.length} 任务</Badge> : null}
                  <Badge variant="outline">{items.length} 条</Badge>
                  {unreadCount ? <Badge variant="secondary">{unreadCount} 未读</Badge> : null}
                  {errorCount ? <Badge variant="warning">{errorCount} 错误</Badge> : null}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭通知与任务中心">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="fy-soft-section mt-4 flex items-center justify-between gap-3 px-3 py-2">
            <span className="text-xs font-black text-slate-500">运行任务 / 历史通知</span>
            <Button variant="outline" size="sm" onClick={onClear} disabled={!items.length} className="h-8 shrink-0 bg-white">
              清空
            </Button>
          </div>
        </div>

        <div className="fy-drawer-body space-y-5 px-4 py-4">
          <section data-ui-section="runtime-task-center" className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                <Activity className="h-4 w-4 text-blue-600" />
                运行任务
              </div>
              <Badge variant={runningTaskCount ? "warning" : "outline"}>
                {runningTaskCount ? `${runningTaskCount} 个运行中` : "无运行任务"}
              </Badge>
            </div>

            {taskItems.length ? (
              <div className="space-y-2.5">
                {taskItems.map((item) => (
                  <div key={item.id} className={`fy-section p-3 transition hover:shadow-md ${getRuntimeTaskCardClass(item.tone)}`}>
                    <div className="flex items-start gap-3">
                      <div className={`mt-0.5 rounded-xl p-1.5 ${getRuntimeTaskIconClass(item.tone)}`}>
                        {item.running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock3 className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-black">{item.title}</div>
                            {item.meta ? <div className="mt-0.5 truncate text-[11px] font-semibold opacity-60">{item.meta}</div> : null}
                          </div>
                          <Badge className="shrink-0 bg-white/75" variant="outline">{item.status}</Badge>
                        </div>
                        <p className="mt-1 line-clamp-3 text-sm leading-6 opacity-85">{item.detail}</p>
                        {item.recoveryHint ? (
                          <div className="mt-2 rounded-2xl bg-white/70 px-3 py-2 text-xs font-semibold leading-5 opacity-85">
                            下一步：{item.recoveryHint}
                          </div>
                        ) : null}
                        {typeof item.percent === "number" ? (
                          <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-white/80">
                              <div className="h-full rounded-full bg-slate-950/75 transition-all" style={{ width: `${clampPercent(item.percent)}%` }} />
                            </div>
                            <div className="mt-1 text-[11px] font-black opacity-60">{clampPercent(item.percent)}%</div>
                          </div>
                        ) : null}
                        {item.onAction || item.onCancel ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {item.onAction && item.actionLabel ? (
                              <Button type="button" variant="outline" size="sm" className="h-8 bg-white/80" onClick={item.onAction}>
                                {item.actionLabel}
                              </Button>
                            ) : null}
                            {item.onCancel && item.cancelLabel ? (
                              <Button type="button" variant="outline" size="sm" className="h-8 border-red-200 bg-white/80 text-red-700 hover:bg-red-50" onClick={item.onCancel}>
                                {item.cancelLabel}
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="fy-empty-state flex min-h-[8rem] items-center justify-center bg-white">
                <div>
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
                  <div className="mt-3 text-sm font-semibold text-slate-700">当前没有运行或待继续的任务</div>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-black text-slate-950">
                <Bell className="h-4 w-4 text-slate-600" />
                历史通知
              </div>
              <Badge variant="outline">{items.length} 条</Badge>
            </div>

            {items.length ? (
              <div className="space-y-2.5">
                {items.map((item) => {
                  const isError = item.kind === "error";
                  return (
                    <div
                      key={item.id}
                      className={`fy-section p-3 transition hover:shadow-md ${
                        isError ? "border-red-100 text-red-900" : "border-emerald-100 text-emerald-900"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 rounded-xl p-1.5 ${isError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {isError ? <AlertCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 items-center gap-2">
                              {!item.read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                              <div className="truncate text-sm font-black">{item.title}</div>
                            </div>
                            <div className="shrink-0 text-xs font-semibold opacity-55">{formatNotificationTime(item.time)}</div>
                          </div>
                          <p className="mt-1 line-clamp-3 text-sm leading-6 opacity-85">{item.text}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="fy-empty-state flex min-h-[8rem] items-center justify-center bg-white">
                <div>
                  <Bell className="mx-auto h-8 w-8 text-slate-400" />
                  <div className="mt-3 text-sm font-semibold text-slate-700">暂无通知</div>
                </div>
              </div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}
