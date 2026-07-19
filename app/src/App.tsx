import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  Bell,
  CheckCircle2,
  FileText,
  Loader2,
  Route,
  Signal,
  Wand2,
} from "lucide-react";

import {
  ResultCard,
  type DiffFilterMode,
  type DiffFocusRequest,
} from "@/components/ResultCard";
import { DiffReviewCard } from "@/components/DiffReviewCard";
import { RoundRunStatusCard } from "@/components/RoundRunStatusCard";
import { HomeRunPanel } from "@/components/HomeRunPanel";
import { AppSidebar } from "@/components/AppSidebar";
import { NotificationCenter } from "@/components/NotificationCenter";
import { WorkbenchViewSkeleton } from "@/components/WorkbenchViewSkeleton";
// Route-level lazy loading: the home view is the landing page; the heavier
// secondary views pull in many sub-components the home user never needs.
// Splitting every secondary surface keeps the first-screen bundle focused.
const DiagnosticsPage = lazy(() => import("@/components/DiagnosticsPage").then((m) => ({ default: m.DiagnosticsPage })));
const HistoryCard = lazy(() => import("@/components/HistoryCard").then((m) => ({ default: m.HistoryCard })));
const ModelConfigCard = lazy(() => import("@/components/ModelConfigCard").then((m) => ({ default: m.ModelConfigCard })));
const PromptPreviewPage = lazy(() => import("@/components/PromptPreviewPage").then((m) => ({ default: m.PromptPreviewPage })));
const ProtectionMapCard = lazy(() => import("@/components/ProtectionMapCard").then((m) => ({ default: m.ProtectionMapCard })));
const QualityReportPage = lazy(() => import("@/components/QualityReportPage").then((m) => ({ default: m.QualityReportPage })));
import { UnifiedConfirmDialog } from "@/components/UnifiedConfirmDialog";
import { formatFileScopeLabel } from "@/lib/formatters";
import { stringifyError } from "@/lib/errorText";
import { createAppWorkbenchShellHandlers } from "@/lib/appWorkbenchShellHandlers";
import { createAppClearPendingHandlers } from "@/lib/appClearPendingHandlers";
import { createAppTaskLifecycleHandlers } from "@/lib/appTaskLifecycleHandlers";
import { createAppDocumentHandlers } from "@/lib/appDocumentHandlers";
import {
  createAppReviewRefreshHandlers,
  type ReviewSaveRevisionState,
} from "@/lib/appReviewRefreshHandlers";
import type { ReviewDecisionSaveQueue } from "@/lib/reviewDecisionSaveQueue";
import { buildRuntimeTaskCenterItems } from "@/lib/runtimeTaskCenterHelpers";
import { deriveAppNotificationStatus } from "@/lib/appNotificationStatusHelpers";
import {
  deriveRateAuditStrategyExecutionState,
  isStaleRateAuditStrategyError,
} from "@/lib/rateAuditStrategyExecution";
import { normalizeRateAuditReport } from "@/lib/rateAuditCompat";
import type { RateAuditAutoNextApproval } from "@/lib/rateAuditAutoNextGate";
import type { OptionalUiFeedbackInput } from "@/lib/appOptionalUiFeedbackHelpers";
import {
  type BeginTaskOptions,
  type TransitionTaskOptions,
} from "@/lib/appTaskLifecycleHelpers";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";
import {
  buildWorkbenchViewUrl,
  readWorkbenchHistoryMarker,
  readWorkbenchViewFromSearch,
  withWorkbenchHistoryMarker,
  type WorkbenchHistoryMarker,
} from "@/lib/workbenchRoute";
import { WORKBENCH_NAV_ITEMS, type WorkbenchView } from "@/lib/workbenchNav";
import type {
  AppNotification,
  ConfirmDialogOptions,
  ConfirmDialogState,
  ConfirmDialogTone,
  NotificationKind,
  RuntimeTaskCenterItem,
  RuntimeTaskTone,
} from "@/lib/uiTypes";

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
import {
  Card,
  CardContent,
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
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppState } from "@/hooks/useAppState";
import { useRunSession } from "@/hooks/useRunSession";
import { useAppBootstrap } from "@/hooks/useAppBootstrap";
import { useDocumentRestore } from "@/hooks/useDocumentRestore";
import { useActiveRunProbes } from "@/hooks/useActiveRunProbes";
import { useAutoSnapshotRestore } from "@/hooks/useAutoSnapshotRestore";
import { usePendingAutoCountdown } from "@/hooks/usePendingAutoCountdown";
import { useNoticeNotifications } from "@/hooks/useNoticeNotifications";
import { useLazyWorkbenchViews } from "@/hooks/useLazyWorkbenchViews";
import { planTaskStateSnapshotCleanupSuccessFeedback,
  planDiagnosticsFailureFeedback,
  planDiagnosticsSuccessFeedback,
  planPromptPreviewsSuccessNotice,
  planPromptPreviewsUnavailableMessage,
} from "@/lib/diagnosticsHelpers";
import type { AppService } from "@/lib/appService";
import {
  formatPromptSequence,
  getPromptOptionsFromPreviews,
  getPromptProfileLabel,
  getPromptWorkflowsFromPreviews,
} from "@/lib/promptRegistry";
import {
  getTaskPhaseLabel,
  isTaskBlocking,
  isTaskRunningPhase,
  type TaskPhase,
} from "@/lib/taskState";
import { cn } from "@/lib/utils";
import { normalizeRewriteConcurrency } from "@/lib/modelRoute";
import {
  buildCurrentRunAudit,
  buildExportRiskMessages,
  buildQualityStats,
  clampPercent,
} from "@/lib/qualityStats";
import { formatRuntimeStep } from "@/lib/runtimeProgress";
import { roundCheckpointMatchesDocument, sameWorkspacePath } from "@/lib/documentPaths";
import { compareDataMatchesDocument } from "@/lib/documentMatch";
import { getPlannedRoundCount } from "@/lib/historyHelpers";
import {
  invalidateRoundArtifactSnapshotIntent,
  type RoundArtifactSnapshotIntent,
} from "@/lib/roundArtifactSnapshot";

import {
  buildDiffDashboardStats,
  formatDiffDashboardLabel,
} from "@/lib/diffDashboard";
import {
  loadNotificationHistory,
  saveNotificationHistory,
} from "@/lib/notificationHelpers";
import {
  buildHistoryDeleteConfirmOptions,
  buildHistoryDeleteFailureRuntimeStep,
  buildHistoryDeletePreviewFailureRuntimeStep,
  buildHistoryDeleteResultNotice,
  buildHistoryDeleteWorkingRuntimeStep,
  buildHistoryOrphanCleanupNotice,
  buildHistoryOrphanConfirmOptions,
  buildHistoryOrphanDoneRuntimeStep,
  buildHistoryOrphanEmptyNotice,
  buildHistoryOrphanFailureRuntimeStep,
  buildHistoryOrphanScanFailureRuntimeStep,
  buildHistoryOrphanScanRuntimeStep,
  buildHistoryOrphanWorkingRuntimeStep,
  getHistoryDeleteCopy,
  resolveHistoryDeleteDocumentFollowup,
  buildHistoryDeleteCancelledRuntimeStep,
  buildHistoryDeletePreviewLoadingRuntimeStep,
} from "@/lib/historyDeleteCopy";
import {
  buildHistoryArtifactFilters,
  buildProtectedHistoryArtifactPaths,
  createEmptyHistoryArtifactQuery,
  createFailedHistoryArtifactQuery,
  planHistoryDatabaseRepairFailureRuntimeStep,
  planHistoryDatabaseRepairFeedback,
  planHistoryDatabaseRepairLoadingRuntimeStep,
} from "@/lib/historyArtifactHelpers";
import {
  buildDefaultReviewDecisions,
  normalizeReviewDecisionsForSave,
  normalizeSavedReviewDecisionsForCompare,
} from "@/lib/reviewDecisions";
import { normalizeStoredPromptSequence, persistActiveDocument, readStoredPromptSequence } from "@/lib/promptStorage";
import { clearAutoSnapshotSuppression } from "@/lib/autoSnapshot";
import {
  getAutoRunScopeKey,
  getAutoRunScopeKeyForStatus,
  isInterruptedRunMessage,
  isResumableRunMessage,
} from "@/lib/autoRunScope";
import {
  buildRoundResetBusyNotice,
  buildExecuteRoundResetInput,
  buildRoundResetConfig,
  buildRoundResetConfirmOptions,
  buildRoundResetFailureRuntimeStep,
  buildRoundResetMissingNotice,
  buildRoundResetRuntimeStep,
  buildRoundResetSuccessNotice,
  describeDocumentProgress,
  describePromptProfile,
  formatDocumentLoadStep,
  getRoundResetTarget,
  resolveRoundProgressRoute,
  isManualContinuationRound,
  type ExecuteRoundResetInput,
  type RoundResetTarget,
  buildPromptProfileSwitchLoadingRuntimeStep,
  buildPromptProfileSwitchSuccessRuntimeStep,
  buildPromptProfileSwitchFailureRuntimeStep,
  buildPromptSequenceSwitchLoadingRuntimeStep,
  buildPromptSequenceSwitchSuccessRuntimeStep,
  buildPromptSequenceSwitchFailureRuntimeStep,
} from "@/lib/documentStatusCopy";
import { type PendingAutoAction } from "@/lib/autoRun";

import {
  buildAttachedBatchRerunFailureRuntimeStep,
  buildAttachedBatchRerunLoadingRuntimeStep,
  buildAttachedBatchRerunMissingResultError,
  buildAttachedBatchRerunNotice,
  buildBatchAttachSuccessTargets,
} from "@/lib/bootstrapHelpers";

import { getRerunFailureScopeKey } from "@/lib/exportHelpers";
import {
  buildSingleChunkBatchRerunTargets,
  buildSingleChunkRerunIdentity,
} from "@/lib/singleChunkRerunHelpers";
import { getProgressPercent } from "@/lib/progressHelpers";
import { resolveNextModelFromCatalog,
  planTestConnectionSuccessFeedback,
  materializeProviderModelsRequestFailureFeedback,
  buildModelConfigWithProviderPatches,
  buildNoEnabledProvidersNotice,
  buildProviderMissingNotice,
  buildProviderModelsAbortedError,
  buildProviderModelsBatchAbortFeedback,
  planProviderModelsRequestFailureFeedback,
  buildProviderModelsBatchFailureRuntimeStep,
  buildProviderModelsBatchLoadingRuntimeStep,
  buildProviderModelsBatchSuccessRuntimeStep,
  buildProviderModelsPatch,
  buildProviderModelsSingleAbortFeedback,
  buildProviderModelsSingleFailureRuntimeStep,
  buildProviderModelsSingleLoadingRuntimeStep,
  buildProviderModelsSingleSuccessRuntimeStep,
  createEmptyProviderModelRefreshState,
  formatProviderModelsBatchNotice,
  formatProviderModelsRefreshNotice,
  getEnabledProviders,
  getProviderConnectionIssue,
  mergeSavedModelConfig,
  planModelCatalogFailureUi,
  planModelCatalogMissingCredentialsUi,
  planModelCatalogSuccessUi,
  planModelCatalogStartUi,
  planModelConfigSaveFailureRuntimeStep,
  planModelConfigSaveLoadingRuntimeStep,
  planModelConfigSaveSuccessFeedback,
  recordProviderModelsConnectionFailure,
  recordProviderModelsRefreshError,
  recordProviderModelsRefreshSuccess,
  refreshOneProviderModelPatch,
} from "@/lib/providerModelHelpers";
import { createModelCatalogHandlers } from "@/lib/modelCatalogHandlers";
import { createPromptHandlers } from "@/lib/promptHandlers";
import { createHistoryHandlers } from "@/lib/historyHandlers";
import { createBatchRerunHandlers } from "@/lib/batchRerunHandlers";
import { createAutoRunHandlers } from "@/lib/autoRunHandlers";
import { createExportHandlers } from "@/lib/exportHandlers";
import { exportResultMatchesCompare } from "@/lib/exportIdentity";
import { createDocumentLoadHandlers } from "@/lib/documentLoadHandlers";
import { createRunRoundHandlers } from "@/lib/runRoundHandlers";
import {
  planBackendConcurrencyReadyError,
  buildCompletedRunLaunchResult,
  buildFailureAutoRetryScheduleArgs,
  buildPrepareAttachActiveRunResult,
  buildReadyLaunchResultPayload,
  buildReadyRunExecutionResult,
  type BuildReadyRunLaunchResultInput,
  type ClassifiedRunFailure,
  type PrepareRunLaunchResult,
  type ReadyRunLaunchPrepared,
  buildAttachRoundFailureInput,
  buildBusyRunNotice,
  buildMaybeScheduleFailureAutoRetryInput,
  buildMergedCompletionReviewDecisions,
  buildMissingDocumentNotice,
  buildRoundCompletionFeedback,
  buildRunConfigForLaunch,
  buildRunResultLoadingState,
  buildStartRoundFailureInput,
  buildWorkflowCompleteFeedback,
  classifyRunFailure,
  isWorkflowAlreadyComplete,
  materializeRoundProgressListenerUpdate,
  materializeRunFailureUi,
  mergeSavedRunConfig,
  planAttachRunSeed,
  planFailureAutoRetrySchedule,
  planRunLaunchSeed,
  resolveBackendConcurrencyGuardError,
  resolveFailureRetryRound,
  selectMatchingCheckpointStatus,
  shouldScheduleFailureAutoRetry,
  shouldSyncRunConfigToUi,
  type FinalizeFailedRoundInput,
  type MaybeScheduleFailureAutoRetryInput,
} from "@/lib/runRoundPrep";
import type {
  BatchRerunFailure,
  BatchRerunResult,
  BatchRerunStatus,
  BatchRerunTarget,
  DeleteHistoryOptions,
  DocumentStatus,
  EnvironmentDiagnostics,
  ExportFailureDetails,
  ExportIssueSample,
  ExportResult,
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryFilters,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDeleteImpact,
  HistoryDeleteMode,
  HistoryDocumentSummary,
  HistoryOrphanScanResult,
  HistoryRound,
  ModelCatalogResult,
  ModelConfig,
  ModelProviderConfig,
  PromptDeleteResult,
  PromptId,
  PromptOption,
  PromptPreviewResponse,
  PromptSaveResult,
  PromptWorkflow,
  RateAuditReport,
  ReviewDecision,
  RoundCompareData,
  RoundModelConfig,
  RoundProgress,
  RoundProgressStatus,
  RoundResult,
  RunAuditSummary,
  OutputPreview,
} from "@/types/app";
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

const MAX_REWRITE_CONCURRENCY = 16;
const REWRITE_CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16] as const;

type Props = {
  service: AppService;
};

export function App({ service }: Props) {
  const {
    currentRunToken,
    currentBatchRerunToken,
    runSessionRef,
    batchRerunSessionRef,
    attachedRunTokenRef,
    progressUnlistenRef,
    beginRunSession,
    isActiveRunSession,
    clearRunSession,
    markRunSessionCancelRequested,
    beginBatchRerunSession,
    clearBatchRerunSession,
    markBatchRerunCancelRequested,
    releaseProgressListener,
    isRunSessionCancelRequested} = useRunSession();
  const liveCompareRef = useRef<RoundCompareData | null>(null);
  const handlersBridgeRef = useRef<{
    refreshHistoryList?: (options?: { shouldCommit?: () => boolean }) => Promise<HistoryDocumentSummary[]>;
    loadCompletedRoundArtifacts?: (result: RoundResult) => Promise<void>;
    loadLatestRoundSnapshot?: (
      status: DocumentStatus,
      config: ModelConfig,
      options?: {
        historyItems?: HistoryDocumentSummary[];
        historyItem?: HistoryDocumentSummary | null;
        allowProfileFallback?: boolean;
        shouldCommit?: () => boolean;
        promptOptions?: PromptOption[];
        promptWorkflows?: PromptWorkflow[];
      },
    ) => Promise<unknown>;
    handleRunRound?: (
      configOverride?: ModelConfig,
      autoNextApproval?: RateAuditAutoNextApproval,
    ) => Promise<void>;
    refreshRoundProgressStatus?: (
      status?: DocumentStatus | null,
      config?: ModelConfig,
      options?: { shouldCommit?: () => boolean },
    ) => Promise<RoundProgressStatus | null>;
  }>({});

  const visibleProgressRef = useRef<RoundProgress | null>(null);
  const reviewSaveQueueRef = useRef<ReviewDecisionSaveQueue<Record<string, ReviewDecision>> | null>(null);
  const reviewSaveRevisionRef = useRef<Map<string, ReviewSaveRevisionState>>(new Map());
  const roundArtifactSnapshotIntentRef = useRef<RoundArtifactSnapshotIntent | null>(null);
  const promptRouteRequestRef = useRef(0);
  const restoredDocumentRef = useRef(false);
  const roundProgressRequestRef = useRef(0);
  const autoRetryCountsRef = useRef<Record<string, number>>({});
  const latestDocumentStatusRef = useRef<DocumentStatus | null>(null);
  const latestModelConfigRef = useRef<ModelConfig | null>(null);
  const autoSnapshotRestoreKeyRef = useRef("");
  const runningRef = useRef(false);
  const pendingAutoActionRef = useRef<PendingAutoAction | null>(null);
  const notificationMessageKeyRef = useRef("");
  const taskTicketRef = useRef(0);
  const taskPhaseRef = useRef<TaskPhase>("idle");
  const modelCatalogAbortRef = useRef<AbortController | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);
  const promptPreviewDirtyRef = useRef(false);
  const initialWorkbenchView = typeof window === "undefined"
    ? "home"
    : readWorkbenchViewFromSearch(window.location.search);
  const initialWorkbenchHistoryMarker: WorkbenchHistoryMarker | null = typeof window === "undefined"
    ? null
    : readWorkbenchHistoryMarker(window.history.state);
  const activeViewRef = useRef<WorkbenchView>(initialWorkbenchView);
  const workbenchHistoryIndexRef = useRef(initialWorkbenchHistoryMarker?.index ?? 0);
  const workbenchPopRevisionRef = useRef(0);
  const workbenchHistoryRestoringRef = useRef(false);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogResult | null>(null);
  const [modelCatalogBusy, setModelCatalogBusy] = useState(false);
  const [modelCatalogError, setModelCatalogError] = useState("");
  const [activeView, setActiveViewState] = useState<WorkbenchView>(initialWorkbenchView);
  const [reviewDecisions, setReviewDecisions] = useState<Record<string, ReviewDecision>>({});
  const [reviewRevision, setReviewRevision] = useState("");
  const [roundProgressStatus, setRoundProgressStatus] = useState<RoundProgressStatus | null>(null);
  const [taskPhase, setTaskPhase] = useState<TaskPhase>("idle");
  const [modelConfigReady, setModelConfigReady] = useState(false);
  const [historyListReady, setHistoryListReady] = useState(false);
  const [diagnostics, setDiagnostics] = useState<EnvironmentDiagnostics | null>(null);
  const [lastExportFailure, setLastExportFailure] = useState<ExportFailureDetails | null>(null);
  const [promptPreviews, setPromptPreviews] = useState<PromptPreviewResponse | null>(null);
  const [promptPreviewBusy, setPromptPreviewBusy] = useState(false);
  const [promptPreviewError, setPromptPreviewError] = useState("");
  const [activePromptPreviewId, setActivePromptPreviewId] = useState<PromptId>("prewrite");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [historyOrphanScan, setHistoryOrphanScan] = useState<HistoryOrphanScanResult | null>(null);
  const [historyArtifactMode, setHistoryArtifactMode] = useState<HistoryArtifactGovernanceMode>("missing");
  const [historyArtifactQuery, setHistoryArtifactQuery] = useState<HistoryArtifactQueryResponse | null>(null);
  const [historyArtifactLoading, setHistoryArtifactLoading] = useState(false);
  const [historyDatabaseMaintenance, setHistoryDatabaseMaintenance] =
    useState<HistoryDatabaseMaintenanceSummary | null>(null);
  const [historyDatabaseMaintenanceLoading, setHistoryDatabaseMaintenanceLoading] = useState(false);
  const [historyDatabaseBackups, setHistoryDatabaseBackups] = useState<HistoryDatabaseBackupListResult | null>(null);
  const [historyDatabaseBackupsLoading, setHistoryDatabaseBackupsLoading] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(() => loadNotificationHistory());
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [diffFocusRequest, setDiffFocusRequest] = useState<DiffFocusRequest | null>(null);
  const [rerunFailures, setRerunFailures] = useState<BatchRerunFailure[]>([]);
  const [pendingAutoAction, setPendingAutoAction] = useState<PendingAutoAction | null>(null);
  const handlePromptPreviewDirtyStateChange = useCallback((dirty: boolean) => {
    promptPreviewDirtyRef.current = dirty;
  }, []);
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
    setError} = useAppState();
  const promptOptions = useMemo(() => getPromptOptionsFromPreviews(promptPreviews), [promptPreviews]);
  const promptWorkflows = useMemo(() => getPromptWorkflowsFromPreviews(promptPreviews, promptOptions), [promptPreviews, promptOptions]);
  const taskLifecycle = createAppTaskLifecycleHandlers({
    taskTicketRef,
    setTaskPhase,
    setError,
    setNotice,
    setRuntimeStep,
    setBusy});
  function beginTask(phase: TaskPhase, options: BeginTaskOptions = {}) {
    return taskLifecycle.beginTask(phase, options);
  }
  function transitionTask(ticket: number, phase: TaskPhase, options: TransitionTaskOptions = {}) {
    return taskLifecycle.transitionTask(ticket, phase, options);
  }
  function finishTask(ticket: number) {
    taskLifecycle.finishTask(ticket);
  }

  const running = Boolean(currentRunToken) || isTaskRunningPhase(taskPhase);
  const uiBusy = busy || isTaskBlocking(taskPhase);
  const runtimeStatus = taskPhase !== "idle" ? getTaskPhaseLabel(taskPhase) : busy ? "处理中" : "就绪";

  const activeCompareData = useMemo(
    () => compareDataMatchesDocument(compareData, documentStatus, promptOptions, promptWorkflows) ? compareData : null,
    [compareData, documentStatus, promptOptions, promptWorkflows],
  );
  const activeExportResult = useMemo(
    () => exportResultMatchesCompare(lastExportResult, activeCompareData)
      ? lastExportResult
      : null,
    [activeCompareData, lastExportResult],
  );

  const activeRerunFailureScopeKey = useMemo(() => getRerunFailureScopeKey(activeCompareData), [activeCompareData]);
  const activeRerunFailures = useMemo(() => {
    if (!activeRerunFailureScopeKey) {
      return [];
    }
    const activeChunkIds = new Set(activeCompareData?.chunks.map((chunk) => chunk.chunkId) ?? []);
    return rerunFailures.filter((failure) => failure.scopeKey === activeRerunFailureScopeKey && activeChunkIds.has(failure.chunkId));
  }, [activeCompareData, activeRerunFailureScopeKey, rerunFailures]);
  useEffect(() => {
    setLastExportFailure(null);
  }, [activeCompareData?.outputPath, roundResult?.outputPath]);
  const diffDashboardStats = useMemo(
    () => buildDiffDashboardStats(activeCompareData, activeRerunFailures, reviewDecisions),
    [activeCompareData, activeRerunFailures, reviewDecisions],
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
    taskPhaseRef.current = taskPhase;
  }, [taskPhase]);
  useEffect(() => {
    pendingAutoActionRef.current = pendingAutoAction;
  }, [pendingAutoAction]);
  useNoticeNotifications({
    error,
    notice,
    notificationMessageKeyRef,
    setError,
    setNotifications});
  function focusWorkbenchMain() {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      document.getElementById("fyadr-main-content")?.focus({ preventScroll: true });
    });
  }
  function applyWorkbenchView(view: WorkbenchView, focusMain = true) {
    activeViewRef.current = view;
    setActiveViewState(view);
    if (focusMain) focusWorkbenchMain();
  }
  function commitWorkbenchView(view: WorkbenchView) {
    const changed = activeViewRef.current !== view;
    if (typeof window !== "undefined" && changed) {
      const nextIndex = workbenchHistoryIndexRef.current + 1;
      workbenchHistoryIndexRef.current = nextIndex;
      window.history.pushState(
        withWorkbenchHistoryMarker(window.history.state, { index: nextIndex, view }),
        "",
        buildWorkbenchViewUrl(view, window.location.href),
      );
    }
    applyWorkbenchView(view);
  }
  const workbenchShells = createAppWorkbenchShellHandlers({
    setNotificationCenterOpen,
    setNotifications,
    saveNotificationHistory,
    setActiveView: commitWorkbenchView,
    setDiffFocusRequest,
    pendingAutoActionRef,
    setPendingAutoAction,
    autoRetryCountsRef,
    setNotice,
    confirmResolverRef,
    setConfirmDialog});
  function openNotificationCenter() {
    workbenchShells.openNotificationCenter();
  }
  function requestPromptPreviewDiscardConfirmation(): Promise<boolean> {
    return requestConfirm({
      title: "放弃未保存的提示词修改？",
      description: "当前提示词还有未保存的修改。继续后，这些修改将无法恢复。",
      confirmLabel: "放弃修改",
      tone: "warning",
    });
  }
  async function runAfterPromptDraftGuard(view: WorkbenchView, action: () => void): Promise<boolean> {
    if (view === "prompts" || !promptPreviewDirtyRef.current) {
      action();
      return true;
    }
    if (!await requestPromptPreviewDiscardConfirmation()) return false;
    promptPreviewDirtyRef.current = false;
    action();
    return true;
  }
  function navigateToWorkbenchView(view: WorkbenchView): Promise<boolean> {
    return runAfterPromptDraftGuard(view, () => commitWorkbenchView(view));
  }
  function openTaskTargetView(view: WorkbenchView) {
    void runAfterPromptDraftGuard(view, () => workbenchShells.openTaskTargetView(view));
  }
  function openDiffTaskTarget(filterMode: DiffFilterMode, chunkId?: string) {
    void runAfterPromptDraftGuard("home", () => workbenchShells.openDiffTaskTarget(filterMode, chunkId));
  }
  // Install the history listener before the first paint so a fast click on a
  // freshly rendered sidebar cannot create a URL-only navigation state.
  useLayoutEffect(() => {
    const initialView = readWorkbenchViewFromSearch(window.location.search);
    const initialMarker = readWorkbenchHistoryMarker(window.history.state);
    const initialIndex = initialMarker?.index ?? workbenchHistoryIndexRef.current;
    workbenchHistoryIndexRef.current = initialIndex;
    activeViewRef.current = initialView;
    setActiveViewState(initialView);
    window.history.replaceState(
      withWorkbenchHistoryMarker(window.history.state, { index: initialIndex, view: initialView }),
      "",
      buildWorkbenchViewUrl(initialView, window.location.href),
    );

    const handleWorkbenchPopState = (event: PopStateEvent) => {
      if (workbenchHistoryRestoringRef.current) {
        workbenchHistoryRestoringRef.current = false;
        focusWorkbenchMain();
        return;
      }
      const sourceView = activeViewRef.current;
      const sourceIndex = workbenchHistoryIndexRef.current;
      const targetView = readWorkbenchViewFromSearch(window.location.search);
      const targetMarker = readWorkbenchHistoryMarker(event.state);
      if (targetView === sourceView) {
        if (targetMarker) workbenchHistoryIndexRef.current = targetMarker.index;
        window.history.replaceState(
          withWorkbenchHistoryMarker(window.history.state, {
            index: targetMarker?.index ?? sourceIndex,
            view: targetView,
          }),
          "",
          buildWorkbenchViewUrl(targetView, window.location.href),
        );
        applyWorkbenchView(targetView);
        return;
      }
      const revision = ++workbenchPopRevisionRef.current;
      void (async () => {
        const allowed = await runAfterPromptDraftGuard(targetView, () => undefined);
        if (revision !== workbenchPopRevisionRef.current) return;
        if (!allowed) {
          if (targetMarker && targetMarker.index !== sourceIndex) {
            workbenchHistoryRestoringRef.current = true;
            window.history.go(sourceIndex - targetMarker.index);
          } else {
            window.history.pushState(
              withWorkbenchHistoryMarker(window.history.state, { index: sourceIndex, view: sourceView }),
              "",
              buildWorkbenchViewUrl(sourceView, window.location.href),
            );
            focusWorkbenchMain();
          }
          return;
        }
        const targetIndex = targetMarker?.index ?? sourceIndex;
        workbenchHistoryIndexRef.current = targetIndex;
        window.history.replaceState(
          withWorkbenchHistoryMarker(window.history.state, { index: targetIndex, view: targetView }),
          "",
          buildWorkbenchViewUrl(targetView, window.location.href),
        );
        applyWorkbenchView(targetView);
      })();
    };
    window.addEventListener("popstate", handleWorkbenchPopState);
    return () => {
      workbenchPopRevisionRef.current += 1;
      window.removeEventListener("popstate", handleWorkbenchPopState);
    };
  }, []);
  function rejectPendingAutoAction(actionId?: string) {
    workbenchShells.rejectPendingAutoAction(actionId);
  }
  function requestConfirm(options: ConfirmDialogOptions): Promise<boolean> {
    return workbenchShells.requestConfirm(options);
  }
  function settleConfirmDialog(confirmed: boolean) {
    workbenchShells.settleConfirmDialog(confirmed);
  }
  function clearNotificationHistory() {
    workbenchShells.clearNotificationHistory();
  }
  const reviewRefreshHandlers = createAppReviewRefreshHandlers({
    service,
    roundArtifactSnapshotIntentRef,
    getModelConfig: () => modelConfig,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getCompareData: () => liveCompareRef.current,
    getRoundResult: () => roundResult,
    reviewSaveQueueRef,
    reviewSaveRevisionRef,
    setReviewDecisions: (updater) => setReviewDecisions(updater),
    setPreview,
    setCompareData,
    setLiveCompare: (value) => { liveCompareRef.current = value; },
    setLastExportResult: () => setLastExportResult(null),
    setReviewRevision,
    setError,
    setNotice,
    setDocumentStatus,
    setHistory,
    setProtectionMap,
    setScopeDiagnostics,
    getRefreshRoundProgressStatus: () => handlersBridgeRef.current.refreshRoundProgressStatus!,
    normalizeReviewDecisionsForSave,
    commitUi: (callback) => startTransition(callback),
  });
  function updateReviewDecision(chunkId: string, decision: ReviewDecision) {
    const pending = pendingAutoActionRef.current;
    if (pending?.kind === "next-round") {
      clearPendingAutoActionWithNotice(
        pending.id,
        "审阅决定已变化，旧的 RateAudit 自动下一轮批准已取消；保存后将重新诊断。",
      );
    }
    reviewRefreshHandlers.updateReviewDecision(chunkId, decision);
  }
  useEffect(() => {
    const flushReviewDecisions = () => {
      void reviewSaveQueueRef.current?.flushAll();
    };
    window.addEventListener("pagehide", flushReviewDecisions);
    return () => {
      window.removeEventListener("pagehide", flushReviewDecisions);
      flushReviewDecisions();
      void releaseProgressListener();
    };
  }, []);
  async function refreshDocumentState(
    sourcePath: string,
    config = latestModelConfigRef.current ?? modelConfig,
    options: {
      shouldCommit?: () => boolean;
      promptOptions?: PromptOption[];
      promptWorkflows?: PromptWorkflow[];
    } = {},
  ) {
    const status = await reviewRefreshHandlers.refreshDocumentState(sourcePath, config, options);
    if (!options.shouldCommit || options.shouldCommit()) latestDocumentStatusRef.current = status;
    return status;
  }

  function clearAutoRetryScope(scopeKey: string | null | undefined) {
    workbenchShells.clearAutoRetryScope(scopeKey);
  }
  const clearPendingHandlers = createAppClearPendingHandlers({
    setPendingAutoAction,
    setNotice,
    pendingAutoActionRef,
    clearAutoRetryScope,
    sameWorkspacePath});
  function clearPendingAutoActionWithNotice(actionId: string, notice: string) {
    clearPendingHandlers.clearPendingAutoActionWithNotice(actionId, notice);
  }
  function clearPendingAutoActionForSource(sourcePath: string | null | undefined) {
    clearPendingHandlers.clearPendingAutoActionForSource(sourcePath);
  }
  function clearPendingAutoActionForManualContextChange() {
    clearPendingHandlers.clearPendingAutoActionForManualContextChange();
  }
    const {
    scheduleAutoRetry,
    maybeScheduleFailureAutoRetry,
    scheduleAutoNextRound,
    refreshDocumentStateForFailedRound,
    scheduleFailureAutoRetryAfterRefresh,
    buildPendingAutoActionGuard,
    resolveCurrentPendingAutoActionPlan,
    performPendingAutoAction} = createAutoRunHandlers({
    getModelConfig: () => modelConfig,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getLatestModelConfig: () => latestModelConfigRef.current,
    getLatestDocumentStatus: () => latestDocumentStatusRef.current,
    getPendingAutoActionId: () => pendingAutoActionRef.current?.id,
    getRunning: () => runningRef.current,
    getAutoRetryCounts: () => autoRetryCountsRef.current,
    setAutoRetryCounts: (counts) => { autoRetryCountsRef.current = counts; },
    setPendingAutoAction,
    setNotice,
    refreshDocumentState,
    refreshHistoryList: () => handlersBridgeRef.current.refreshHistoryList!(),
    getRateAudit: (sourcePath, outputPath) => service.getRateAudit(sourcePath, outputPath),
    handleRunRound: (approval) => handlersBridgeRef.current.handleRunRound!(undefined, approval)});
  usePendingAutoCountdown({
    pendingAutoAction,
    setPendingAutoAction,
    performPendingAutoAction});

const {
    resolveRunnableDocumentStatus,
    syncRunConfigToUi,
    assertBackendConcurrencyReady,
    persistRunConfigForLaunch,
    buildLaunchRunConfig,
    beginRoundProgressRequest,
    isCurrentRoundProgressRequest,
    commitRoundProgressStatus,
    refreshRoundProgressStatus,
    resolveLaunchCheckpointStatus,
    planReadyRunLaunchSeed,
    buildReadyRunLaunchResult,
    prepareRunLaunch,
    clearActiveRunProgressUi,
    applyClassifiedRunFailure,
    finalizeFailedRound,
    scheduleAfterSuccessfulRound,
    applySuccessfulRoundCompletionFeedback,
    completeSuccessfulRoundUi,
    finalizeCompletedRound,
    attachRoundProgressListener,
    mergeActiveRunProgressSnapshot,
    beginStartedRunSession,
    createStartedRunSession,
    attachStartedRunProgress,
    startAndListenRunRound,
    awaitStartedRunRound,
    awaitPreparedStartedRun,
    runPreparedRound,
    executePreparedRunRound,
    handleRunRound,
    beginAttachedRunSession,
    seedAndListenAttachedRun,
    resolveDocumentStatusForAttach,
    prepareAttachActiveRun,
    finalizeAttachedActiveRunResult,
    awaitAttachedActiveRun,
    runAttachedActiveSession,
    attachActiveRun,
    resolveCancelableRunSession,
    applyCancelRequestedUi,
    handleCancelRunRound,
    performRoundReset,
    resolveConfirmedRoundResetInput,
    executeRoundReset,
    handleResetCurrentRound,
    applyLoadedRoundSnapshotUi,
    fetchCompleteRoundSnapshot,
    applySelectedRoundSnapshot,
    loadLatestRoundSnapshot,
    loadRoundSnapshotByOutputPath} = createRunRoundHandlers({
    service,
    roundArtifactSnapshotIntentRef,
    getModelConfig: () => modelConfig,
    getDocumentStatus: () => latestDocumentStatusRef.current,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getHistoryItems: () => historyItems,
    getRoundProgressStatus: () => roundProgressStatus,
    getActiveCompareData: () => activeCompareData,
    getLatestModelConfig: () => latestModelConfigRef.current,
    getRunning: () => running,
    getCurrentRunToken: () => currentRunToken,
    getRunSession: () => runSessionRef.current,
    getAttachedRunToken: () => attachedRunTokenRef.current,
    getVisibleProgress: () => visibleProgressRef.current,
    getLiveCompare: () => liveCompareRef.current,
    getRoundProgressRequestId: () => roundProgressRequestRef.current,
    getCurrentTaskTicket: () => taskTicketRef.current,
    setLatestModelConfig: (config) => { latestModelConfigRef.current = config; },
    setAttachedRunToken: (token) => { attachedRunTokenRef.current = token; },
    setVisibleProgress: (progress) => { visibleProgressRef.current = progress; },
    setLiveCompare: (compare) => { liveCompareRef.current = compare; },
    setRoundProgressRequestId: (id) => { roundProgressRequestRef.current = id; },
    setModelConfig,
    setProgress,
    setRoundResult,
    setPreview,
    setCompareData,
    setReviewDecisions,
    setRerunFailures,
    setLastExportResult,
    setRoundProgressStatus,
    setHistoryPanelOpen,
    setError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    transitionTask: (ticket, phase, options) => transitionTask(ticket, phase, options),
    applyOptionalUiFeedback,
    beginRunSession,
    clearRunSession,
    isActiveRunSession,
    markRunSessionCancelRequested,
    isRunSessionCancelRequested,
    releaseProgressListener,
    setProgressUnlisten: (unlisten) => { progressUnlistenRef.current = unlisten; },
    clearPendingAutoActionForSource,
    clearAutoRetryScope,
    scheduleFailureAutoRetryAfterRefresh,
    scheduleAutoNextRound,
    clearAutoSnapshotSuppression,
    clearDocumentDerivedState,
    flushReviewDecisionSaves: (outputPath) => reviewRefreshHandlers.flushReviewDecisionSaves(outputPath),
    refreshDocumentState,
    refreshHistoryList: () => handlersBridgeRef.current.refreshHistoryList!(),
    loadCompletedRoundArtifacts: (result) => handlersBridgeRef.current.loadCompletedRoundArtifacts!(result),
    requestConfirm: (options) => requestConfirm(options),
    commitUi: (callback) => startTransition(callback)});
  handlersBridgeRef.current.refreshRoundProgressStatus = refreshRoundProgressStatus;

  handlersBridgeRef.current.loadLatestRoundSnapshot = loadLatestRoundSnapshot;
  handlersBridgeRef.current.handleRunRound = handleRunRound;

const {
    syncHistorySelectionConfigToUi,
    getProtectedHistoryArtifactPaths,
    refreshHistoryList,
    refreshHistoryOrphanScan,
    refreshHistoryArtifactGovernance,
    resolveHistorySelectionConfig,
    resyncHistoryDocumentRoute,
    loadAndResyncHistoryDocument,
    loadSelectedHistoryDocument,
    loadCompletedRoundArtifacts,
    handleExportFromHistory,
    handlePreviewHistoryDelete,
    applyHistoryDeleteSuccess,
    handleDeleteHistory,
    handleScanHistoryOrphans,
    handleDeleteHistoryOrphans,
    applyHistoryDatabaseRepairResult,
    handleRepairHistoryDatabase,
    refreshHistoryDatabaseMaintenance,
    refreshHistoryDatabaseBackups,
    handleBackupHistoryDatabase,
    handleCompactHistoryDatabase,
    handleRecoverHistoryDatabase} = createHistoryHandlers({
    service,
    roundArtifactSnapshotIntentRef,
    getModelConfig: () => modelConfig,
    getDocumentStatus: () => latestDocumentStatusRef.current,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getHistoryItems: () => historyItems,
    getHistoryArtifactMode: () => historyArtifactMode,
    getHistoryOrphanScan: () => historyOrphanScan,
    getRoundResult: () => roundResult,
    getActiveCompareData: () => activeCompareData,
    getLastExportResult: () => activeExportResult,
    setModelConfig,
    setDocumentStatus,
    setHistory,
    setProtectionMap,
    setScopeDiagnostics,
    setHistoryItems,
    setHistoryOrphanScan,
    setHistoryDatabaseMaintenance,
    setHistoryDatabaseMaintenanceLoading,
    setHistoryDatabaseBackups,
    setHistoryDatabaseBackupsLoading,
    setHistoryArtifactMode,
    setHistoryArtifactQuery,
    setHistoryArtifactLoading,
    setPreview,
    setCompareData,
    setReviewDecisions,
    setLastExportResult,
    setLastExportFailure,
    setLiveCompareRef: (compare) => { liveCompareRef.current = compare; },
    setError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    applyErrorRuntimeStep,
    applyOptionalUiFeedback,
    requestConfirm: (options) => requestConfirm(options),
    clearDocumentDerivedState,
    clearAutoSnapshotSuppression,
    clearPendingAutoActionForManualContextChange,
    refreshDocumentState,
    loadLatestRoundSnapshot: (status, config, options) => handlersBridgeRef.current.loadLatestRoundSnapshot!(status, config, options),
    flushReviewDecisionSaves: (outputPath) => reviewRefreshHandlers.flushReviewDecisionSaves(outputPath),
    startTransition});
  const documentHandlers = createAppDocumentHandlers({
    getModelConfig: () => modelConfig,
    setError,
    setNotice,
    setRuntimeStep,
    setRoundResult,
    setProgress,
    setPreview,
    setCompareData,
    setLastExportResult,
    setRoundProgressStatus,
    setRerunFailures,
    setReviewDecisions,
    liveCompareRef,
    beginTask,
    finishTask,
    clearAutoSnapshotSuppression,
    invalidateRoundArtifactSnapshotRequests: () => {
      invalidateRoundArtifactSnapshotIntent(roundArtifactSnapshotIntentRef);
    },
    clearPendingAutoActionForManualContextChange,
    loadSelectedHistoryDocument});
  function clearDocumentDerivedState() {
    documentHandlers.clearDocumentDerivedState();
  }
  function beginHistoryDocumentSelection() {
    documentHandlers.beginHistoryDocumentSelection();
  }
  async function handleSelectHistory(item: HistoryDocumentSummary, configOverride = modelConfig) {
    return documentHandlers.handleSelectHistory(item, configOverride);
  }
  function applyOptionalUiFeedback(input: OptionalUiFeedbackInput) {
    documentHandlers.applyOptionalUiFeedback(input);
  }
  function applyErrorRuntimeStep(appError: unknown, runtimeStep: string) {
    documentHandlers.applyErrorRuntimeStep(appError, runtimeStep);
  }

  handlersBridgeRef.current.refreshHistoryList = refreshHistoryList;
  handlersBridgeRef.current.loadCompletedRoundArtifacts = loadCompletedRoundArtifacts;

const {
    applyBatchRerunCancelRequestedUi,
    materializeBatchRerunResultState,
    applyBatchRerunResult,
    waitForBatchRerunResult,
    awaitAndApplyBatchRerunResult,
    finalizeAttachedBatchRerun,
    beginAttachActiveBatchRerunTask,
    attachActiveBatchRerun,
    runBatchRerunTask,
    runPreparedBatchRerunTask,
    handleRerunRiskyChunks,
    handleCancelBatchRerun} = createBatchRerunHandlers({
    service,
    roundArtifactSnapshotIntentRef,
    getModelConfig: () => modelConfig,
    getRoundResult: () => roundResult,
    getActiveCompareData: () => liveCompareRef.current,
    getActiveRerunFailures: () => activeRerunFailures,
    getReviewDecisions: () => reviewDecisions,
    getActiveRerunFailureScopeKey: () => activeRerunFailureScopeKey,
    getCurrentBatchRerunToken: () => currentBatchRerunToken,
    getBatchRerunSession: () => batchRerunSessionRef.current,
    setRoundResult,
    setCompareData,
    setPreview,
    setLastExportResult,
    setRerunFailures,
    setReviewDecisions,
    setLiveCompareRef: (compare) => { liveCompareRef.current = compare; },
    setError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    transitionTask: (ticket, phase, options) => transitionTask(ticket, phase, options),
    applyErrorRuntimeStep,
    applyOptionalUiFeedback,
    beginBatchRerunSession,
    clearBatchRerunSession,
    markBatchRerunCancelRequested,
    commitUi: (callback) => startTransition(callback)});

  async function flushReviewDecisionsBeforeRerun(outputPath?: string): Promise<boolean> {
    const flushed = await reviewRefreshHandlers.flushReviewDecisionSaves(outputPath);
    if (!flushed) {
      setError("审阅决定尚未成功保存，已阻止重跑；请先恢复本地服务连接后重试。");
      return false;
    }
    return true;
  }

  async function handleReviewSafeRerunRiskyChunks() {
    if (!await flushReviewDecisionsBeforeRerun()) return;
    await handleRerunRiskyChunks();
  }

    const {
    resolveCurrentExportOutputPath,
    executeExportRound,
    handleExportCurrent} = createExportHandlers({
    service,
    getDocumentStatus: () => documentStatus,
    getRoundProgressStatus: () => roundProgressStatus,
    getRoundResult: () => roundResult,
    getActiveCompareData: () => activeCompareData,
    getLastExportResult: () => activeExportResult,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    setLastExportResult,
    setLastExportFailure,
    setError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    flushReviewDecisionSaves: (outputPath) => reviewRefreshHandlers.flushReviewDecisionSaves(outputPath),
    requestConfirm: (options) => requestConfirm(options)});
  const {
    refreshDiagnostics,
    handleCleanupTaskStateSnapshots,
    applyPickedDocument,
    loadPickedDocument,
    pickAndLoadDocument,
    handlePickFile,
    handleRefreshCurrentDocumentStatus} = createDocumentLoadHandlers({
    service,
    getModelConfig: () => modelConfig,
    getDocumentStatus: () => documentStatus,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getLatestModelConfig: () => latestModelConfigRef.current,
    setDiagnostics,
    setHistoryPanelOpen,
    setError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    transitionTask: (ticket, phase, options) => transitionTask(ticket, phase, options),
    applyErrorRuntimeStep,
    applyOptionalUiFeedback,
    clearAutoSnapshotSuppression,
    clearPendingAutoActionForManualContextChange,
    clearDocumentDerivedState,
    refreshDocumentState,
    refreshHistoryList});

const {
    persistActivePromptRoute,
    refreshPromptPreviews,
    applyPromptSaveResult,
    handleSavePromptDraft,
    handleRestoreDefaultPrompt,
    handleCreatePrompt,
    handleDeletePrompt,
    applyUpdatedDefaultPromptWorkflow,
    handleUpdatePromptWorkflow,
    reloadDocumentAfterPromptRouteSwitch,
    applyPromptRouteSwitch,
    handlePromptProfileChange,
    handlePromptSequenceChange} = createPromptHandlers({
    service,
    promptRouteRequestRef,
    getModelConfig: () => latestModelConfigRef.current ?? modelConfig,
    getDocumentStatus: () => latestDocumentStatusRef.current,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getPromptPreviews: () => promptPreviews,
    getActivePromptPreviewId: () => activePromptPreviewId,
    setModelConfig: applyModelConfigChange,
    setPromptPreviews,
    setPromptPreviewBusy,
    setPromptPreviewError,
    setActivePromptPreviewId,
    setError,
    setNotice,
    setRuntimeStep,
    requestConfirm: (options) => requestConfirm(options),
    applyErrorRuntimeStep,
    clearAutoSnapshotSuppression,
    clearPendingAutoActionForManualContextChange,
    refreshDocumentState,
    refreshHistoryList,
    loadLatestRoundSnapshot});
  useLazyWorkbenchViews({
    activeView,
    diagnostics,
    promptPreviews,
    promptPreviewBusy,
    refreshDiagnostics,
    refreshPromptPreviews});
  useDocumentRestore({
    modelConfigReady,
    historyListReady,
    restoredDocumentRef,
    documentStatus,
    historyItems,
    modelConfig,
    promptOptions,
    promptWorkflows,
    taskTicketRef,
    setModelConfig,
    setError,
    setNotice,
    setRuntimeStep,
    beginTask,
    finishTask,
    refreshDocumentState,
    refreshHistoryList,
    clearLoadedRoundSnapshot: clearDocumentDerivedState,
    loadLatestRoundSnapshot});
  useAutoSnapshotRestore({
    documentStatus,
    currentRunToken,
    currentBatchRerunToken,
    taskPhase,
    activeCompareChunkCount: activeCompareData?.chunks.length,
    autoSnapshotRestoreKeyRef,
    latestModelConfigRef,
    modelConfig,
    historyItems,
    promptOptions,
    promptWorkflows,
    setModelConfig,
    setNotice,
    setRuntimeStep,
    refreshDocumentState,
    loadLatestRoundSnapshot: (status, config, options) => loadLatestRoundSnapshot(status, config, options)});
  const {
    beginCancelableModelCatalogRequest,
    clearCancelableModelCatalogRequest,
    handleCancelModelCatalogRequest,
    beginProviderModelsTask,
    finishProviderModelsTask,
    applyProviderModelsRequestFailure,
    fetchAndApplyModelCatalog,
    refreshModelCatalog,
    listModelsForConfig,
    collectProviderModelPatches,
    saveModelConfigWithProviderPatches,
    handleRefreshAllProviderModels,
    refreshSingleProviderModels,
    handleRefreshProviderModels,
    persistNormalizedModelConfig,
    applySavedModelConfig,
    handleSaveModelConfig,
  handleTestConnection} = createModelCatalogHandlers({
    service,
    getModelConfig: () => latestModelConfigRef.current ?? modelConfig,
    getDocumentStatus: () => documentStatus,
    getPromptOptions: () => promptOptions,
    getPromptWorkflows: () => promptWorkflows,
    getModelCatalogAbortRef: () => modelCatalogAbortRef.current,
    setModelCatalogAbortRef: (controller) => { modelCatalogAbortRef.current = controller; },
    setModelConfig: applyModelConfigChange,
    setModelCatalog,
    setModelCatalogBusy,
    setModelCatalogError,
    setNotice,
    setRuntimeStep,
    beginTask: (kind, options) => beginTask(kind, options),
    finishTask,
    applyErrorRuntimeStep,
    applyOptionalUiFeedback,
    refreshDocumentState});
  useAppBootstrap({
    service,
    setError,
    setModelConfig,
    setModelConfigReady,
    setPromptPreviews,
    refreshModelCatalog,
    setHistoryItems,
    setHistoryArtifactQuery,
    setHistoryListReady});
  useActiveRunProbes({
    service,
    documentSourcePath: documentStatus?.sourcePath,
    currentRunToken,
    currentBatchRerunToken,
    attachedRunTokenRef,
    batchRerunSessionRef,
    taskPhase,
    roundResultOutputPath: roundResult?.outputPath,
    activeCompareOutputPath: activeCompareData?.outputPath,
    setDiagnostics,
    attachActiveRun,
    attachActiveBatchRerun});

async function handleRerunChunk(chunkId: string, userFeedback?: string) {
    const outputPath = roundResult?.outputPath ?? activeCompareData?.outputPath;
    if (!outputPath) { setNotice("当前没有可重跑的输出结果。"); return; }
    if (!await flushReviewDecisionsBeforeRerun(outputPath)) return;
    const visibleDocument = latestDocumentStatusRef.current ?? documentStatus;
    const visibleCompare = liveCompareRef.current ?? activeCompareData;
    const rerunIdentity = buildSingleChunkRerunIdentity(
      visibleDocument?.sourcePath,
      visibleCompare,
    );
    if (
      !rerunIdentity
      || !compareDataMatchesDocument(visibleCompare, visibleDocument, promptOptions, promptWorkflows)
      || !sameWorkspacePath(rerunIdentity.outputPath, outputPath)
    ) {
      setError("当前论文或 Diff 身份不完整，已阻止旧结果重跑；请重新打开本轮结果后再试。");
      return;
    }
    const targets = buildSingleChunkBatchRerunTargets(chunkId, userFeedback);
    await runBatchRerunTask(`重跑块 ${chunkId}`, outputPath, targets);
  }

  async function handleExecuteRateAuditStrategy(report: RateAuditReport) {
    if (uiBusy) {
      setNotice("当前已有任务在运行，请等待完成后再执行降检策略。");
      return;
    }
    if (!documentStatus?.sourcePath || !sameWorkspacePath(documentStatus.sourcePath, report.sourcePath)) {
      setError("当前论文已经切换，旧的降检策略不会执行；请重新诊断。");
      return;
    }
    const strategyOutputPath = report.currentOutputPath;
    if (!await reviewRefreshHandlers.flushReviewDecisionSaves(strategyOutputPath)) {
      setError("审阅决定尚未成功保存，已阻止策略执行；请先恢复本地服务连接后重试。");
      return;
    }
    let activeReport: RateAuditReport;
    try {
      activeReport = normalizeRateAuditReport(await service.getRateAudit(report.sourcePath, report.currentOutputPath));
    } catch (refreshError) {
      setError(`执行前重新诊断失败，未启动模型任务：${stringifyError(refreshError)}`);
      return;
    }
    const execution = deriveRateAuditStrategyExecutionState(activeReport);
    if (!execution.ready || !execution.request) {
      setError(execution.reason || "当前降检策略缺少可执行证据，请重新诊断。");
      return;
    }
    const request = execution.request;
    const currentOutputPath = activeCompareData?.outputPath ?? roundResult?.outputPath ?? "";
    if (!currentOutputPath || !sameWorkspacePath(currentOutputPath, request.outputPath)) {
      setError("当前 Diff 已经切换，旧的降检策略不会执行；请重新诊断。");
      return;
    }
    const confirmed = await requestConfirm({
      title: "执行当前定点降检策略？",
      description: "平台只会处理报告锁定的真实 Diff 块，并用同一维度复评分。通过后生成待审阅候选，不会替你确认导出。",
      details: [
        `维度：${activeReport.strategyPlan.dimensionLabel || request.dimensionId}`,
        `目标块：${request.targetChunkIds.length} 个`,
        `修复提示词：${request.recommendedPromptId}`,
        activeReport.strategyPlan.maxAttempts ? `每块最多尝试：${activeReport.strategyPlan.maxAttempts} 次` : "",
      ].filter(Boolean),
      confirmLabel: "执行定点策略",
      tone: "info",
    });
    if (!confirmed) return;

    const latestSourcePath = latestDocumentStatusRef.current?.sourcePath;
    const latestOutputPath = liveCompareRef.current?.outputPath;
    if (taskPhaseRef.current !== "idle" || runningRef.current || batchRerunSessionRef.current) {
      setNotice("确认期间已有其他任务启动，本次定点策略未执行。");
      return;
    }
    if (!latestSourcePath
      || !latestOutputPath
      || !sameWorkspacePath(latestSourcePath, request.sourcePath)
      || !sameWorkspacePath(latestOutputPath, request.outputPath)) {
      setError("确认期间论文或 Diff 已切换，旧的降检策略不会执行；请重新诊断。");
      return;
    }

    const targets = request.targetChunkIds.map((chunkId) => ({ chunkId }));
    const strategyCompareIdentity = liveCompareRef.current;
    setLastExportResult(null);
    try {
      await runPreparedBatchRerunTask(
        "执行降检定点策略",
        targets,
        () => service.startRateAuditStrategy(request, modelConfig),
        "；候选仍需在 Diff 中逐段确认",
        { rethrow: true },
      );
    } catch (appError) {
      const stalePlan = isStaleRateAuditStrategyError(appError);
      try {
        const visibleSourcePath = latestDocumentStatusRef.current?.sourcePath;
        if (!visibleSourcePath || !sameWorkspacePath(visibleSourcePath, request.sourcePath)) {
          setNotice("策略任务结束时当前文档已经切换；没有把旧文档状态应用到新页面。");
          return;
        }
        const applied = await reviewRefreshHandlers.refreshRevisionBoundReviewState(
          request.outputPath,
          strategyCompareIdentity,
        );
        if (!applied) {
          setNotice("策略任务结束时当前 Diff 已经切换；没有把旧文档状态应用到新页面。");
          return;
        }
        if (stalePlan) {
          setError("");
          setNotice("审阅或文档状态已变化，旧策略未执行；已刷新 Diff，正在生成新策略。");
        }
      } catch (refreshError) {
        setError(
          stalePlan
            ? `旧策略已被安全拦截，但刷新当前 Diff 失败：${stringifyError(refreshError)}`
            : `${stringifyError(appError)}；刷新策略执行后的 Diff 失败：${stringifyError(refreshError)}`,
        );
      }
    }
  }

  const runtimeLabel = formatRuntimeStep(progress, runtimeStep);
  const plannedProgressRounds = documentStatus?.plannedRounds ?? getPlannedRoundCount(modelConfig, promptOptions, promptWorkflows);
  const progressPercent = getProgressPercent(progress, documentStatus?.completedRounds.length ?? 0, plannedProgressRounds);
  const runtimeTaskItems = useMemo<RuntimeTaskCenterItem[]>(() => buildRuntimeTaskCenterItems({
    pendingAutoAction,
    currentRunToken,
    currentBatchRerunToken,
    runSession: runSessionRef.current,
    batchRerunSession: batchRerunSessionRef.current,
    progress,
    progressPercent,
    roundProgressStatus,
    taskPhase,
    busy,
    modelCatalogAbortActive: Boolean(modelCatalogAbortRef.current),
    diagnostics,
    activeCompareData,
    activeRerunFailures,
    reviewDecisions,
    error,
    documentStatus,
    promptOptions,
    promptWorkflows,
    actions: {
      openTaskTargetView,
      openDiffTaskTarget,
      rejectPendingAutoAction,
      handleCancelRunRound,
      handleCancelBatchRerun,
      handleCancelModelCatalogRequest}}), [activeCompareData, activeRerunFailures, busy, currentBatchRerunToken, currentRunToken, diagnostics, documentStatus?.promptProfile, documentStatus?.promptSequence, documentStatus?.sourcePath, error, pendingAutoAction, progress, progressPercent, promptOptions, promptWorkflows, reviewDecisions, roundProgressStatus, taskPhase]);
  const activeRuntimeTaskCount = runtimeTaskItems.filter((item) => item.running).length;
  const statusAutoAction = !error && pendingAutoAction ? pendingAutoAction : null;
  const hasActiveOperationFeedback = Boolean(activeRuntimeTaskCount || (uiBusy && !error));

  function applyModelConfigChange(nextConfig: ModelConfig) {
    latestModelConfigRef.current = nextConfig;
    setModelConfig(nextConfig);
  }

  const modelPanel = (
    <ModelConfigCard
      value={modelConfig}
      busy={uiBusy}
      modelCatalog={modelCatalog}
      modelCatalogBusy={modelCatalogBusy}
      modelCatalogError={modelCatalogError}
      onChange={applyModelConfigChange}
      onSave={handleSaveModelConfig}
      onTestConnection={handleTestConnection}
      onRefreshModels={() => void refreshModelCatalog()}
      onListModelsForConfig={listModelsForConfig}
    />
  );

  const activeViewMeta = WORKBENCH_NAV_ITEMS.find((item) => item.view === activeView) ?? WORKBENCH_NAV_ITEMS[0];
  const ActiveViewIcon = activeViewMeta.icon;
  const operationStatusText = runtimeLabel && runtimeLabel !== "待命" ? runtimeLabel : runtimeStatus;
  const {
    notificationStatusText,
    notificationStatusLabel,
    notificationStatusKind,
    hasStatusFeedback} = deriveAppNotificationStatus({
    error,
    notice,
    statusAutoAction,
    activeRuntimeTaskCount,
    uiBusy,
    unreadNotificationCount,
    hasActiveOperationFeedback,
    operationStatusText});
  const NotificationStatusIcon = error ? AlertCircle : statusAutoAction ? Signal : hasActiveOperationFeedback ? Loader2 : notice ? CheckCircle2 : Bell;
  const showRoundRunStatus = Boolean(currentRunToken || taskPhase === "running-round" || taskPhase === "canceling-run");
  const roundRunStatusProgress = progress ?? (showRoundRunStatus ? roundProgressStatus?.activeRun?.lastEvent ?? null : null);
  const loadedCompletedResultRound = roundResult?.round ?? null;
  const checkpointPendingForCurrentDocument = roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows) && !showRoundRunStatus;
  return (
    <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden">
      <a
        href="#fyadr-main-content"
        className="fixed left-3 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-transform focus:translate-y-0"
      >
        跳到主要内容
      </a>
      <AppSidebar
        activeView={activeView}
        onViewChange={navigateToWorkbenchView}
        runtimeStatus={runtimeStatus}
        progressPercent={progressPercent}
      />
      <SidebarInset id="fyadr-main-content" tabIndex={-1} className="h-svh overflow-hidden outline-none md:h-[calc(100svh-1rem)]">
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

          <header className="shrink-0 border-b border-border/80 bg-background/80 backdrop-blur-md">
            <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4">
              <SidebarTrigger className="border border-border/80 bg-card/70 shadow-sm" />
              <span className="vercel-icon-frame hidden size-8 sm:flex">
                <ActiveViewIcon className="size-4" />
              </span>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <h1 className="sr-only">{activeViewMeta.label}</h1>
                <Breadcrumb>
                  <BreadcrumbList className="text-xs">
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">论文 AI 降检平台</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage className="font-semibold">{activeViewMeta.label}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
                <p className="hidden truncate text-[11px] leading-none text-muted-foreground lg:block">{activeViewMeta.description}</p>
              </div>
              <ThemeModeMenu />
            </div>
            <div className="vercel-subbar flex h-11 min-w-0 items-center gap-2 overflow-hidden border-t px-3 text-xs sm:h-10 sm:px-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                data-ui-section="current-file-chip"
                className="h-9 min-w-0 flex-1 justify-start overflow-hidden px-2 text-xs sm:h-7 sm:min-w-[16rem] sm:max-w-[min(58vw,56rem)] sm:flex-none"
                onClick={() => navigateToWorkbenchView("home")}
              >
                <FileText data-icon="inline-start" />
                <span className="hidden text-muted-foreground sm:inline">当前文件</span>
                <span className="min-w-0 truncate text-foreground">{documentStatus ? formatFileScopeLabel(documentStatus.sourcePath) : "未选择"}</span>
              </Button>
              <div className="flex shrink-0 items-center gap-2">
                <Separator orientation="vertical" className="hidden h-4 md:block" />
                <Button type="button" variant="ghost" size="sm" className="hidden h-7 min-w-0 shrink-0 px-2 text-xs md:inline-flex" onClick={() => navigateToWorkbenchView("model")}>
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
                    "relative size-9 min-w-9 shrink-0 justify-center px-0 text-xs sm:h-8 sm:w-auto sm:min-w-[220px] sm:max-w-[min(42vw,560px)] sm:justify-start sm:px-3",
                    hasStatusFeedback && "border-border bg-muted/60 shadow-sm",
                    notificationStatusKind === "error" && "border-destructive/40 bg-destructive/10",
                  )}
                  aria-label="打开通知与任务中心"
                  aria-live="polite"
                  onClick={openNotificationCenter}
                >
                  <NotificationStatusIcon className={cn(hasActiveOperationFeedback && LOADING_ICON_CLASS_NAME)} data-icon="inline-start" />
                  {unreadNotificationCount || activeRuntimeTaskCount || error ? (
                    <span className={cn("absolute right-1 top-1 size-2 rounded-full ring-2 ring-background sm:hidden", error ? "bg-destructive" : "bg-primary")} aria-hidden="true" />
                  ) : null}
                  <Badge variant={notificationStatusKind === "error" ? "danger" : hasStatusFeedback ? "secondary" : "outline"} className="hidden shrink-0 sm:inline-flex">
                    {notificationStatusLabel}
                  </Badge>
                  <span className={cn("hidden min-w-0 flex-1 truncate text-left text-foreground sm:block", hasStatusFeedback && "font-semibold")}>{notificationStatusText}</span>
                </Button>
              </div>
            </div>
            {error ? (
              <button
                type="button"
                className="flex h-9 w-full items-center gap-2 border-t border-destructive/25 bg-destructive/8 px-3 text-left text-xs text-status-danger transition-colors hover:bg-destructive/12 sm:px-4"
                onClick={openNotificationCenter}
              >
                <AlertCircle className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{error}</span>
                <span className="shrink-0 font-semibold">查看详情</span>
              </button>
            ) : null}
          </header>

          <section className="vercel-shell min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 min-[1180px]:overflow-hidden" aria-label={`${activeViewMeta.label}内容`}>
            {activeView === "home" ? (
              <div className="min-h-full overflow-visible min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:overflow-hidden">
                <div className="grid min-h-full min-w-0 max-w-full gap-4 overflow-visible min-[1180px]:h-full min-[1180px]:min-h-0 min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)] min-[1180px]:overflow-hidden 2xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
                  <div className="order-2 flex min-h-[36rem] min-w-0 flex-col gap-4 overflow-visible min-[1180px]:order-1 min-[1180px]:min-h-0 min-[1180px]:overflow-hidden">
                    <ResultCard
                      result={roundResult}
                      preview={preview}
                      compareData={activeCompareData}
                      exportResult={activeExportResult}
                      exportFailure={lastExportFailure}
                      busy={uiBusy}
                      rerunFailures={activeRerunFailures}
                      diffFocusRequest={diffFocusRequest}
                      reviewDecisions={reviewDecisions}
                      roundRunning={showRoundRunStatus}
                      checkpointPending={checkpointPendingForCurrentDocument}
                      onReviewDecisionChange={updateReviewDecision}
                      onRerunChunk={(chunkId, userFeedback) => void handleRerunChunk(chunkId, userFeedback)}
                      onRerunRiskyChunks={() => void handleReviewSafeRerunRiskyChunks()}
                      batchRerunRunning={Boolean(currentBatchRerunToken)}
                      batchRerunStatusText={runtimeLabel}
                      onCancelBatchRerun={() => void handleCancelBatchRerun()}
                      onExportTxt={() => void handleExportCurrent("txt")}
                      onExportDocx={() => void handleExportCurrent("docx")}
                    />
                    <div className="min-h-[24rem] flex-1 overflow-hidden min-[1180px]:min-h-0">
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
                          diffFocusRequest={diffFocusRequest}
                          reviewDecisions={reviewDecisions}
                          onReviewDecisionChange={updateReviewDecision}
                          onRerunChunk={(chunkId, userFeedback) => void handleRerunChunk(chunkId, userFeedback)}
                          onRerunRiskyChunks={() => void handleReviewSafeRerunRiskyChunks()}
                          batchRerunRunning={Boolean(currentBatchRerunToken)}
                          batchRerunStatusText={runtimeLabel}
                          onCancelBatchRerun={() => void handleCancelBatchRerun()}
                          streamChunkId={progress?.phase === "provider-stream" ? progress.chunkId ?? null : null}
                          streamChars={progress?.phase === "provider-stream" ? progress.finalTextChars ?? null : null}
                        />
                      )}
                    </div>
                  </div>
                  <ScrollArea
                    className="shadcn-home-operation-scroll shadcn-scroll-bound order-1 h-auto min-h-0 min-w-0 max-w-full overflow-visible pr-0 min-[1180px]:order-2 min-[1180px]:h-full min-[1180px]:overflow-hidden min-[1180px]:pr-1"
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
                        activeCompareData={activeCompareData}
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
                    </div>
                  </ScrollArea>
                </div>
              </div>
            ) : activeView === "quality" ? (
              <div className="h-full min-h-0 overflow-auto">
                <Suspense fallback={<WorkbenchViewSkeleton label="降检报告" />}>
                  <QualityReportPage
                    service={service}
                    sourcePath={documentStatus?.sourcePath}
                    outputPath={activeCompareData?.outputPath ?? roundResult?.outputPath ?? documentStatus?.latestOutputPath}
                    compareData={activeCompareData}
                    reviewDecisions={reviewDecisions}
                    reviewRevision={reviewRevision}
                    exportResult={activeExportResult}
                    onGoHome={() => navigateToWorkbenchView("home")}
                    onOpenChunk={(chunkId) => openDiffTaskTarget("all", chunkId)}
                    onExecuteStrategy={(report) => void handleExecuteRateAuditStrategy(report)}
                    strategyExecuting={Boolean(currentBatchRerunToken)}
                    strategyDisabled={uiBusy}
                  />
                </Suspense>
              </div>
            ) : activeView === "model" ? (
              <div className="h-full min-h-0 overflow-hidden">
                <Suspense fallback={<WorkbenchViewSkeleton label="模型配置" />}>{modelPanel}</Suspense>
              </div>
            ) : activeView === "prompts" ? (
              <div className="h-full min-h-0 overflow-hidden">
                <Suspense fallback={<WorkbenchViewSkeleton label="提示词" />}>
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
                    onDirtyStateChange={handlePromptPreviewDirtyStateChange}
                    onConfirmDiscardChanges={requestPromptPreviewDiscardConfirmation}
                  />
                </Suspense>
              </div>
            ) : activeView === "protection" ? (
              <div className="h-full min-h-0 overflow-auto">
                <Suspense fallback={<WorkbenchViewSkeleton label="保护区地图" />}>
                  <ProtectionMapCard value={protectionMap} diagnostics={scopeDiagnostics} />
                </Suspense>
              </div>
            ) : activeView === "diagnostics" ? (
              <div className="h-full min-h-0 overflow-auto">
                <Suspense fallback={<WorkbenchViewSkeleton label="启动诊断" />}>
                  <DiagnosticsPage
                    value={diagnostics}
                    busy={uiBusy}
                    onRefresh={() => void refreshDiagnostics()}
                    onCleanupTaskSnapshots={() => void handleCleanupTaskStateSnapshots()}
                  />
                </Suspense>
              </div>
            ) : (
              <div className="h-full min-h-0 overflow-auto">
                <Suspense fallback={<WorkbenchViewSkeleton label="历史记录" />}>
                <HistoryCard
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
                dbMaintenanceSummary={historyDatabaseMaintenance}
                dbMaintenanceSummaryLoading={historyDatabaseMaintenanceLoading}
                dbBackups={historyDatabaseBackups}
                dbBackupsLoading={historyDatabaseBackupsLoading}
                onRefreshDatabaseMaintenance={() => void refreshHistoryDatabaseMaintenance()}
                onRefreshDatabaseBackups={() => void refreshHistoryDatabaseBackups(false)}
                onBackupDatabase={() => void handleBackupHistoryDatabase("manual")}
                onCompactDatabase={() => void handleCompactHistoryDatabase(true)}
                onRecoverDatabase={(backupPath) => void handleRecoverHistoryDatabase(backupPath)}
                  onDownload={(item, format) => void handleExportFromHistory(item, format)}
                />
                </Suspense>
              </div>
            )}
          </section>
        </SidebarInset>
    </SidebarProvider>
  );

}
