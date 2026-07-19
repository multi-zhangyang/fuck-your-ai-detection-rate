import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptPreviewDraftActionFactory.ts");
const SETUP_EDITOR_DIALOG_BODY_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialogBodyProps.ts");
const RESULT_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardProps.ts");
const MODEL_CONFIG_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCardProps.ts");
const USE_REWRITE_DIFF_PANEL_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRewriteDiffPanelModel.ts");
const REWRITE_DIFF_PANEL_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelProps.ts");
const HISTORY_DOCUMENT_SHARED_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentSharedTypes.ts");
const USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAutoSnapshotRestoreRefs.ts");
const AUTO_SNAPSHOT_RESTORE_HOOK_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreHookTypes.ts");
const DOCUMENT_RESTORE_EFFECT_RUNNER_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreEffectRunner.ts");
const DOCUMENT_RESTORE_HOOK_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreHookTypes.ts");
const HISTORY_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardProps.ts");
const APPEND_ROUND_CONTROL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appendRoundControlHelpers.ts");
const HISTORY_CARD_BODY_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBodyTypes.ts");
const REWRITE_DIFF_PANEL_CHUNK_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelChunkList.tsx");
const USE_PROMPT_PREVIEW_FORM_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "usePromptPreviewFormState.ts");
const USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useActiveBatchRerunProbeEffect.ts");
const USE_ACTIVE_RUN_PROBE_EFFECT_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useActiveRunProbeEffect.ts");
const HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundListEmpty.tsx");
const USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelFocusScrollEffects.ts");
const USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollRestoreEffects.ts");
const CHUNK_QUALITY_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityActions.tsx");
const CHUNK_QUALITY_META_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityMeta.tsx");
const USE_RUN_SESSION_BATCH_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionBatchControls.ts");
const USE_RUN_SESSION_RUN_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSessionRunControls.ts");
const HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListItemRoundHelpers.ts");
const RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionAwaitHandlers.ts");
const RUN_ROUND_SESSION_START_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionStartHandlers.ts");
const HISTORY_LOAD_SNAPSHOT_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadSnapshotSelectionHelpers.ts");
const HISTORY_LOAD_ROUTE_RESOLVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadRouteResolveHelpers.ts");
const HISTORY_DELETE_RESULT_NOTICE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteResultNoticeCopy.ts");
const HISTORY_DELETE_CONFIRM_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteConfirmCopy.ts");
const HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteConfirmTextCopy.ts");
const WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModelConfigSecrets.ts");
const AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunFailureRefreshHandlers.ts");
const AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunScheduleCoreHandlers.ts");
const EXPORT_EXECUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportExecuteHandlers.ts");
const EXPORT_RESOLVE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportResolveHandlers.ts");
const HISTORY_LOAD_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadPlanHelpers.ts");
const HISTORY_LOAD_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadNoticeHelpers.ts");
const WEB_SERVICE_HTTP_ERROR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHttpErrorHelpers.ts");
const USE_DOCUMENT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDocumentRestoreRefs.ts");
const HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItemBody.tsx");
const HISTORY_CARD_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBody.tsx");
const REWRITE_DIFF_TEXT_PANE_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffTextPane.tsx");
const HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentDeleteActionHelpers.ts");
const APPEND_ROUND_DIALOG_FIELDS_PATH = resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialogFields.tsx");
const ROUND_RUN_STATUS_STATS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RoundRunStatusStats.tsx");
const ROUND_RUN_STATUS_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundRunStatusViewModel.ts");
const HOME_RUN_APPEND_DRAFT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendDraftHelpers.ts");
const HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendRouteOptionHelpers.ts");
const SETUP_EDITOR_DIALOG_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialogBody.tsx");
const USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useModelConfigProviderCatalog.ts");
const USE_PROMPT_PREVIEW_DRAFT_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "usePromptPreviewDraftState.ts");
const USE_DIFF_PANEL_SCROLL_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollEffects.ts");
const USE_DIFF_PANEL_FILTER_EFFECTS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelFilterEffects.ts");
const HISTORY_DOCUMENT_ROUND_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundHeader.tsx");
const MODEL_PROVIDER_PARAM_FIELDS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderParamFields.tsx");
const MODEL_PROVIDER_IDENTITY_FIELDS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderIdentityFields.tsx");
const DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionFailureHelpers.ts");
const DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionSuccessHelpers.ts");
const HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryActionDeriveHelpers.ts");
const HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryButtonHelpers.ts");
const HISTORY_ARTIFACT_REPAIR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactRepairHelpers.ts");
const HISTORY_ARTIFACT_QUERY_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactQueryHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreEffectHelpers.ts");
const DIAGNOSTICS_PAGE_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPageHeader.tsx");
const RESULT_CARD_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardCopy.ts");
const DIFF_REVIEW_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiffReviewCard.tsx");
const REWRITE_DIFF_CHUNK_ALERTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffChunkAlerts.tsx");
const PROMPT_PREVIEW_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptPreviewActionHelpers.ts");
const PROMPT_PREVIEW_DRAFT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptPreviewDraftHelpers.ts");
const DOCUMENT_RESTORE_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreEffectHelpers.ts");
const HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunAppendRoundDialogShell.tsx");
const HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunSetupEditorDialogShell.tsx");
const REWRITE_DIFF_PANEL_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelEmpty.tsx");
const REWRITE_DIFF_PANEL_ALERTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelAlerts.tsx");
const DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelFocusEffectHelpers.ts");
const DIFF_PANEL_SCROLL_POSITION_STORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelScrollPositionStore.ts");
const ACTIVE_RUN_PROBE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "activeRunProbeHelpers.ts");
const HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactGovernanceBody.tsx");
const HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactGovernanceToolbar.tsx");
const BATCH_RERUN_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunNoticeHelpers.ts");
const BATCH_RERUN_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunDecisionHelpers.ts");
const DOCUMENT_STATUS_RESET_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusResetNoticeHelpers.ts");
const DOCUMENT_STATUS_RESET_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusResetPlanHelpers.ts");
const DIAGNOSTICS_TASK_BUILD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskBuildHelpers.ts");
const DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskAccessHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreRouteHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestorePlanHelpers.ts");
const PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPlanPatchHelpers.ts");
const PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPlanUiHelpers.ts");
const PROTECTION_MAP_SECTION_ROW_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapSectionRow.tsx");
const PROTECTION_MAP_REASON_GRID_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapReasonGrid.tsx");
const PROTECTION_MAP_STRIP_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapStrip.tsx");
const MODEL_PROVIDER_LIST_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderListPanel.tsx");
const WEB_SERVICE_PROMPT_WORKFLOW_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServicePromptWorkflowApi.ts");
const WEB_SERVICE_PROMPT_CORE_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServicePromptCoreApi.ts");
const WEB_SERVICE_ROUND_IO_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRoundIoApi.ts");
const WEB_SERVICE_RUN_ROUND_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunRoundApi.ts");
const HISTORY_DATABASE_REPAIR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDatabaseRepairHandlers.ts");
const HISTORY_ORPHAN_SCAN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanScanHandlers.ts");
const CHUNK_QUALITY_BAR_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "chunkQualityBarCopy.ts");
const HISTORY_DELETE_PREVIEW_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeletePreviewHandlers.ts");
const HISTORY_DELETE_APPLY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteApplyHandlers.ts");
const APP_REVIEW_REFRESH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appReviewRefreshHandlers.ts");
const MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteDefaultIssueHelpers.ts");
const MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteRoundProviderHelpers.ts");
const RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressFeedbackPrep.ts");
const RUN_ROUND_PROGRESS_VIEW_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressViewPrep.ts");
const APP_DOCUMENT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appDocumentHandlers.ts");
const APP_TASK_LIFECYCLE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appTaskLifecycleHandlers.ts");
const PROTECTION_MAP_EMPTY_STATE_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapEmptyState.tsx");
const SIDEBAR_RUNTIME_PROGRESS_PATH = resolve(ROOT_DIR, "app", "src", "components", "SidebarRuntimeProgress.tsx");
const RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSnapshotLoadHandlers.ts");
const RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSnapshotApplyHandlers.ts");
const HISTORY_CARD_MAINTENANCE_STATS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardMaintenanceStatsHelpers.ts");
const HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardMaintenanceLabelHelpers.ts");
const BATCH_RERUN_WAIT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunWaitHandlers.ts");
const BATCH_RERUN_MATERIALIZE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunMaterializeHandlers.ts");
const RESULT_CARD_SM_WRAPPERS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardSmWrappers.tsx");
const DIAGNOSTICS_SHARE_RUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareRunHelpers.ts");
const DIAGNOSTICS_SHARE_CORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareCoreHelpers.ts");
const AUTO_RUN_ACTION_BUILD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunActionBuildHelpers.ts");
const AUTO_RUN_ACTION_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunActionFormatHelpers.ts");
const RUN_SESSION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "runSessionHelpers.ts");
const RUN_SESSION_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "runSessionTypes.ts");
const APP_CLEAR_PENDING_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appClearPendingHandlers.ts");
const HOME_RUN_CONTROL_ACTION_BUTTONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlActionButtons.tsx");
const HOME_RUN_CONTROL_STATUS_BLOCK_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlStatusBlock.tsx");
const MODEL_DEFAULT_CONNECTION_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelDefaultConnectionActions.tsx");
const MODEL_DEFAULT_CONNECTION_FORM_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelDefaultConnectionForm.tsx");
const RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSuccessCompletionHandlers.ts");
const RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundFailureCompletionHandlers.ts");
const APP_WORKBENCH_SHELL_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appWorkbenchShellHandlers.ts");
const RUN_FAILURE_SCHEDULE_PLAN_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureSchedulePlan.ts");
const RUN_FAILURE_SCHEDULE_BUILDERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureScheduleBuilders.ts");
const DIAGNOSTICS_TASK_SECTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsTaskSections.tsx");
const DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsWorkspaceAndConfigSection.tsx");
const PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogNoticeHelpers.ts");
const PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPatchCore.ts");
const RESULT_CARD_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardDecisionHelpers.ts");
const RESULT_CARD_REVIEW_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardReviewHelpers.ts");
const RESULT_CARD_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardFormatHelpers.ts");
const RESULT_CARD_TOKEN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardTokenHelpers.ts");
const REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelChunkViewModel.ts");
const REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelFilterViewModel.ts");
const REWRITE_DIFF_PANEL_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelCopy.ts");
const HISTORY_ARTIFACT_ROW_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactRow.tsx");
const CHUNK_QUALITY_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "chunkQualityDecisionHelpers.ts");
const SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteRoundCard.tsx");
const SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteSummary.tsx");
const REWRITE_DIFF_PANEL_TOOLBAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelToolbar.tsx");
const HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentRoundViewModel.ts");
const RESULT_CARD_EXPORT_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCardExportActions.tsx");
const HISTORY_DOCUMENT_ROUND_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundCard.tsx");
const HOME_RUN_APPEND_ISSUE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendIssueHelpers.ts");
const HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentCleanupActions.tsx");
const APP_BOOTSTRAP_HISTORY_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appBootstrapHistoryHelpers.ts");
const APP_BOOTSTRAP_CONFIG_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appBootstrapConfigHelpers.ts");
const MODEL_ROUTE_PROVIDER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteProviderHelpers.ts");
const MODEL_ROUTE_SEQUENCE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelRouteSequenceHelpers.ts");
const EXPORT_NOTICE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeActionHelpers.ts");
const EXPORT_NOTICE_ERROR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeErrorHelpers.ts");
const EXPORT_NOTICE_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeFormatHelpers.ts");
const DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelScrollFocusHelpers.ts");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const HISTORY_CARD_SUMMARY_PILLS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardSummaryPills.tsx");
const HOME_RUN_PANEL_DIALOGS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanelDialogs.tsx");
const APP_NOTIFICATION_STATUS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appNotificationStatusHelpers.ts");
const RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterBackgroundHelpers.ts");
const RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterDiffHelpers.ts");
const RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterPhaseHelpers.ts");
const RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterActiveHelpers.ts");
const RUNTIME_TASK_CENTER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterTypes.ts");
const BATCH_RERUN_STATUS_ALERT_PATH = resolve(ROOT_DIR, "app", "src", "components", "BatchRerunStatusAlert.tsx");
const APP_OPTIONAL_UI_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appOptionalUiFeedbackHelpers.ts");
const RUNTIME_TASK_CENTER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterHelpers.ts");
const APP_PENDING_AUTO_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appPendingAutoActionHelpers.ts");
const APP_REVIEW_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appReviewDecisionHelpers.ts");
const SCOPE_DIAGNOSTICS_DETAIL_SHEET_PATH = resolve(ROOT_DIR, "app", "src", "components", "ScopeDiagnosticsDetailSheet.tsx");
const SCOPE_DIAGNOSTICS_PARTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ScopeDiagnosticsParts.tsx");
const PROMPT_PREVIEW_EDITOR_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "PromptPreviewEditorPanel.tsx");
const PROMPT_PREVIEW_EDITOR_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "PromptPreviewEditorEmpty.tsx");
const PROMPT_PREVIEW_ACTIVE_EDITOR_PATH = resolve(ROOT_DIR, "app", "src", "components", "PromptPreviewActiveEditor.tsx");
const PROMPT_PREVIEW_CREATE_EDITOR_PATH = resolve(ROOT_DIR, "app", "src", "components", "PromptPreviewCreateEditor.tsx");
const EXPORT_LIVE_HINT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportLiveHint.tsx");
const EXPORT_FAILURE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportFailurePanels.tsx");
const EXPORT_HEALTH_DETAILS_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthDetailsDialog.tsx");
const EXPORT_HEALTH_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthPanel.tsx");
const APP_UI_SHELL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appUiShellHelpers.ts");
const SETUP_EDITOR_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialog.tsx");
const SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "setupEditorDialogViewModel.ts");
const SETUP_EDITOR_PROMPT_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorPromptSection.tsx");
const SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteSection.tsx");
const APP_TASK_LIFECYCLE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appTaskLifecycleHelpers.ts");
const PROVIDER_MODEL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelHelpers.ts");
const PROVIDER_MODEL_CATALOG_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogHelpers.ts");
const PROVIDER_MODEL_CATALOG_PATCH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPatchHelpers.ts");
const PROVIDER_MODEL_CATALOG_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPlanHelpers.ts");
const PROVIDER_MODEL_REFRESH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshHelpers.ts");
const PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshStateHelpers.ts");
const PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshActionHelpers.ts");
const PROVIDER_MODEL_SAVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelSaveHelpers.ts");
const HOME_RUN_PANEL_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelState.ts");
const HOME_RUN_PRIMARY_ACTION_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryActionState.ts");
const HOME_RUN_APPEND_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendState.ts");
const HOME_RUN_APPEND_ROUTE_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendRouteState.ts");
const HOME_RUN_APPEND_CONFIG_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendConfigState.ts");
const RUN_ROUND_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundHandlers.ts");
const RUN_ROUND_PROGRESS_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressHandlers.ts");
const RUN_ROUND_FINISH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundFinishHandlers.ts");
const RUN_ROUND_LAUNCH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundLaunchHandlers.ts");
const RUN_ROUND_ATTACH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundAttachHandlers.ts");
const RUN_ROUND_ATTACH_SEED_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundAttachSeedHandlers.ts");
const RUN_ROUND_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundCompletionHandlers.ts");
const RUN_ROUND_CANCEL_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundCancelHandlers.ts");
const RUN_ROUND_RESET_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundResetHandlers.ts");
const RUN_ROUND_SNAPSHOT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSnapshotHandlers.ts");
const RUN_ROUND_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundPrepareHandlers.ts");
const RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundConfigPrepareHandlers.ts");
const RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundLaunchPrepareHandlers.ts");
const RUN_ROUND_START_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundStartHandlers.ts");
const RUN_ROUND_SESSION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionHandlers.ts");
const RUN_ROUND_EXECUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundExecuteHandlers.ts");
const EXPORT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHandlers.ts");
const BATCH_RERUN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHandlers.ts");
const BATCH_RERUN_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunCoreHandlers.ts");
const BATCH_RERUN_ACTION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunActionHandlers.ts");
const DOCUMENT_RESTORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreHelpers.ts");
const DOCUMENT_RESTORE_STORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreStoreHelpers.ts");
const DOCUMENT_RESTORE_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreRouteHelpers.ts");
const BATCH_RERUN_ATTACH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunAttachHandlers.ts");
const BATCH_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHelpers.ts");
const BATCH_RERUN_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunFeedbackHelpers.ts");
const BATCH_RERUN_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunSelectionHelpers.ts");
const HOME_RUN_PANEL_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelViewModel.ts");
const HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelPrimaryViewModel.ts");
const HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelRouteViewModel.ts");
const DIAGNOSTICS_PAGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPage.tsx");
const DIAGNOSTICS_PAGE_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsPageViewModel.ts");
const DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsProblemAndChecksSection.tsx");
const DIAGNOSTICS_RUNTIME_SECTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsRuntimeSections.tsx");
const APP_INDEX_PATH = resolve(ROOT_DIR, "app", "index.html");
const MODEL_CONFIG_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelConfigCard.tsx");
const MODEL_CONFIG_PROVIDER_CATALOG_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelConfigProviderCatalogHandlers.ts");
const MODEL_CONFIG_PROVIDER_MUTATION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelConfigProviderMutationHandlers.ts");
const MODEL_PROVIDER_REPOSITORY_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelProviderRepositoryViewModel.ts");
const HOME_RUN_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanel.tsx");
const HOME_RUN_PANEL_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHomeRunPanelModel.ts");
const USE_HOME_RUN_PANEL_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHomeRunPanelActions.ts");
const HOME_RUN_PANEL_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelTypes.ts");
const USE_SETUP_EDITOR_ESCAPE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useSetupEditorEscape.ts");
const HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelRouteEditHelpers.ts");
const MODEL_DEFAULT_CONNECTION_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelDefaultConnectionPanel.tsx");
const MODEL_PROVIDER_REPOSITORY_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderRepositoryPanel.tsx");
const MODEL_PROVIDER_EDITOR_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderEditorPanel.tsx");
const MODEL_PROVIDER_EDITOR_FIELDS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ModelProviderEditorFields.tsx");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const EXPORT_HEALTH_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHealthViewModel.ts");
const NOTIFICATION_CENTER_PATH = resolve(ROOT_DIR, "app", "src", "components", "NotificationCenter.tsx");
const NOTIFICATION_RUNTIME_TASK_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "NotificationRuntimeTaskSection.tsx");
const NOTIFICATION_HISTORY_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "NotificationHistorySection.tsx");
const NOTIFICATION_CENTER_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "notificationCenterViewModel.ts");
const RESULT_CARD_OUTPUT_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardOutputViewModel.ts");
const PROMPT_PREVIEW_LIST_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "PromptPreviewListPanel.tsx");
const EXPORT_HEALTH_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthPanels.tsx");
const REWRITE_DIFF_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanel.tsx");
const REWRITE_DIFF_PANEL_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelViewModel.ts");
const REWRITE_DIFF_CHUNK_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffChunkCard.tsx");
const CHUNK_QUALITY_BAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityBar.tsx");
const DIFF_FILTER_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffFilterModel.ts");
const DIFF_PANEL_SCROLL_FOCUS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollFocus.ts");
const RUN_STATUS_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "RoundRunStatusCard.tsx");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const HISTORY_CARD_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardHeader.tsx");
const USE_HISTORY_CARD_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHistoryCardState.ts");
const HISTORY_CARD_MAINTENANCE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardMaintenanceSection.tsx");
const PROTECTION_MAP_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapCard.tsx");
const PROTECTION_MAP_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ProtectionMapPanels.tsx");
const SCOPE_DIAGNOSTICS_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ScopeDiagnosticsPanel.tsx");
const THEME_MODE_MENU_PATH = resolve(ROOT_DIR, "app", "src", "components", "ThemeModeMenu.tsx");
const THEME_MODE_HOOK_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useThemeMode.ts");
const APP_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appService.ts");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const MODEL_CATALOG_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogHandlers.ts");
const MODEL_CATALOG_LIST_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogListHandlers.ts");
const MODEL_CATALOG_PROVIDER_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogProviderHandlers.ts");
const MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogProviderTaskHandlers.ts");
const MODEL_CATALOG_CONFIG_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogConfigHandlers.ts");
const WEB_SERVICE_HTTP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHttp.ts");
const WEB_SERVICE_COMPAT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceCompat.ts");
const WEB_SERVICE_MODEL_CONFIG_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModelConfig.ts");
const WEB_SERVICE_HEALTH_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHealth.ts");
const WEB_SERVICE_PROMPTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServicePrompts.ts");
const WEB_SERVICE_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModel.ts");
const WEB_SERVICE_DOCUMENTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceDocuments.ts");
const WEB_SERVICE_HISTORY_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHistoryApi.ts");
const WEB_SERVICE_ROUNDS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRounds.ts");
const WEB_SERVICE_FILES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFiles.ts");
const WEB_SERVICE_FILE_SIZE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFileSizeHelpers.ts");
const WEB_SERVICE_FILE_PICKER_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFilePicker.ts");
const WEB_SERVICE_EXPORT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExport.ts");
const WEB_SERVICE_EXPORT_HEADERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportHeaders.ts");
const WEB_SERVICE_EXPORT_RESULT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportResult.ts");
const WEB_SERVICE_RUN_STREAM_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunStream.ts");
const WEB_SERVICE_RUN_STREAM_LIFECYCLE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunStreamLifecycle.ts");
const GLOBAL_CSS_PATH = resolve(ROOT_DIR, "app", "src", "styles", "global.css");
const TAILWIND_CONFIG_PATH = resolve(ROOT_DIR, "app", "tailwind.config.ts");
const BUTTON_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "button.tsx");
const BADGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "badge.tsx");
const INPUT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "input.tsx");
const SELECT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "select.tsx");
const TEXTAREA_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "textarea.tsx");
const DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "ui", "dialog.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_ui_consistency_regression_report.json");

function assertIncludes(source, pattern, message, failures) {
  if (!source.includes(pattern)) {
    failures.push(message);
  }
}

function assertNotIncludes(source, pattern, message, failures) {
  if (source.includes(pattern)) {
    failures.push(message);
  }
}

function assertCountEquals(source, pattern, expected, message, failures) {
  const count = source.split(pattern).length - 1;
  if (count !== expected) {
    failures.push(`${message} Found ${count}, expected ${expected}.`);
  }
}

function assertNoLegacyFyClassTokens(source, message, failures) {
  const matches = source.match(/(^|[\s"'`{])fy-[A-Za-z0-9_-]+/gm) ?? [];
  if (matches.length) {
    failures.push(`${message} Found ${matches.length}: ${matches.slice(0, 5).map((item) => item.trim()).join(", ")}.`);
  }
}

function loadSource(filePath, failures) {
  if (!existsSync(filePath)) {
    failures.push(`Missing file: ${filePath}`);
    return "";
  }
  return readFileSync(filePath, "utf-8");
}

function runRegression() {
  const failures = [];
  const appSource = [
      loadSource(APP_PATH, failures),
      existsSync(APP_REVIEW_REFRESH_HANDLERS_PATH) ? readFileSync(APP_REVIEW_REFRESH_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_DOCUMENT_HANDLERS_PATH) ? readFileSync(APP_DOCUMENT_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_TASK_LIFECYCLE_HANDLERS_PATH) ? readFileSync(APP_TASK_LIFECYCLE_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_CLEAR_PENDING_HANDLERS_PATH) ? readFileSync(APP_CLEAR_PENDING_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_WORKBENCH_SHELL_HANDLERS_PATH) ? readFileSync(APP_WORKBENCH_SHELL_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_UI_SHELL_HELPERS_PATH) ? readFileSync(APP_UI_SHELL_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_REVIEW_DECISION_HELPERS_PATH) ? readFileSync(APP_REVIEW_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_PENDING_AUTO_ACTION_HELPERS_PATH) ? readFileSync(APP_PENDING_AUTO_ACTION_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_OPTIONAL_UI_FEEDBACK_HELPERS_PATH) ? readFileSync(APP_OPTIONAL_UI_FEEDBACK_HELPERS_PATH, "utf-8") : "",
      existsSync(RUNTIME_TASK_CENTER_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_HELPERS_PATH, "utf-8") : "",
          existsSync(RUNTIME_TASK_CENTER_TYPES_PATH) ? readFileSync(RUNTIME_TASK_CENTER_TYPES_PATH, "utf-8") : "",
      existsSync(RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH, "utf-8") : "",
      existsSync(RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH, "utf-8") : "",
      existsSync(RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH, "utf-8") : "",
      existsSync(RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH) ? readFileSync(RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_NOTIFICATION_STATUS_HELPERS_PATH) ? readFileSync(APP_NOTIFICATION_STATUS_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_DIALOGS_PATH) ? readFileSync(HOME_RUN_PANEL_DIALOGS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH, "utf-8") : "",
      existsSync(HISTORY_CARD_SUMMARY_PILLS_PATH) ? readFileSync(HISTORY_CARD_SUMMARY_PILLS_PATH, "utf-8") : "",
          existsSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH) ? readFileSync(DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH, "utf-8") : "",
          existsSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH) ? readFileSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH, "utf-8") : "",
          existsSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH) ? readFileSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ERROR_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ERROR_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ACTION_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ACTION_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_SEQUENCE_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_SEQUENCE_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_PROVIDER_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_PROVIDER_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_BOOTSTRAP_CONFIG_HELPERS_PATH) ? readFileSync(APP_BOOTSTRAP_CONFIG_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_BOOTSTRAP_HISTORY_HELPERS_PATH) ? readFileSync(APP_BOOTSTRAP_HISTORY_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH) ? readFileSync(HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH, "utf-8") : "",
          existsSync(HISTORY_DOCUMENT_ROUND_CARD_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_CARD_PATH, "utf-8") : "",
          existsSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_EXPORT_ACTIONS_PATH) ? readFileSync(RESULT_CARD_EXPORT_ACTIONS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH) ? readFileSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH, "utf-8") : "",
          existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(CHUNK_QUALITY_DECISION_HELPERS_PATH) ? readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ARTIFACT_ROW_PATH) ? readFileSync(HISTORY_ARTIFACT_ROW_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_COPY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_COPY_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH, "utf-8") : "",
          existsSync(RESULT_CARD_TOKEN_HELPERS_PATH) ? readFileSync(RESULT_CARD_TOKEN_HELPERS_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_FORMAT_HELPERS_PATH) ? readFileSync(RESULT_CARD_FORMAT_HELPERS_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_REVIEW_HELPERS_PATH) ? readFileSync(RESULT_CARD_REVIEW_HELPERS_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_DECISION_HELPERS_PATH) ? readFileSync(RESULT_CARD_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH) ? readFileSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_TASK_SECTIONS_PATH, "utf-8") : "",
      existsSync(RUN_FAILURE_SCHEDULE_BUILDERS_PATH) ? readFileSync(RUN_FAILURE_SCHEDULE_BUILDERS_PATH, "utf-8") : "",
      existsSync(RUN_FAILURE_SCHEDULE_PLAN_PATH) ? readFileSync(RUN_FAILURE_SCHEDULE_PLAN_PATH, "utf-8") : "",
          existsSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH, "utf-8") : "",
      existsSync(APP_WORKBENCH_SHELL_HANDLERS_PATH) ? readFileSync(APP_WORKBENCH_SHELL_HANDLERS_PATH, "utf-8") : "",
          existsSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH, "utf-8") : "",
      existsSync(MODEL_DEFAULT_CONNECTION_FORM_PATH) ? readFileSync(MODEL_DEFAULT_CONNECTION_FORM_PATH, "utf-8") : "",
      existsSync(MODEL_DEFAULT_CONNECTION_ACTIONS_PATH) ? readFileSync(MODEL_DEFAULT_CONNECTION_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "",
      existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : "",
      existsSync(APP_CLEAR_PENDING_HANDLERS_PATH) ? readFileSync(APP_CLEAR_PENDING_HANDLERS_PATH, "utf-8") : "",
          existsSync(RUN_SESSION_TYPES_PATH) ? readFileSync(RUN_SESSION_TYPES_PATH, "utf-8") : "",
      existsSync(RUN_SESSION_HELPERS_PATH) ? readFileSync(RUN_SESSION_HELPERS_PATH, "utf-8") : "",
      existsSync(AUTO_RUN_ACTION_FORMAT_HELPERS_PATH) ? readFileSync(AUTO_RUN_ACTION_FORMAT_HELPERS_PATH, "utf-8") : "",
      existsSync(AUTO_RUN_ACTION_BUILD_HELPERS_PATH) ? readFileSync(AUTO_RUN_ACTION_BUILD_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_SHARE_CORE_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_CORE_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_SHARE_RUN_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_SHARE_RUN_HELPERS_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_SM_WRAPPERS_PATH) ? readFileSync(RESULT_CARD_SM_WRAPPERS_PATH, "utf-8") : "",
          existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_CARD_MAINTENANCE_STATS_HELPERS_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_STATS_HELPERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH, "utf-8") : "",
      existsSync(SIDEBAR_RUNTIME_PROGRESS_PATH) ? readFileSync(SIDEBAR_RUNTIME_PROGRESS_PATH, "utf-8") : "",
      existsSync(PROTECTION_MAP_EMPTY_STATE_PATH) ? readFileSync(PROTECTION_MAP_EMPTY_STATE_PATH, "utf-8") : "",
          existsSync(APP_TASK_LIFECYCLE_HANDLERS_PATH) ? readFileSync(APP_TASK_LIFECYCLE_HANDLERS_PATH, "utf-8") : "",
      existsSync(APP_DOCUMENT_HANDLERS_PATH) ? readFileSync(APP_DOCUMENT_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_PROGRESS_VIEW_PREP_PATH) ? readFileSync(RUN_ROUND_PROGRESS_VIEW_PREP_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH) ? readFileSync(RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH) ? readFileSync(MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH, "utf-8") : "",
          existsSync(APP_REVIEW_REFRESH_HANDLERS_PATH) ? readFileSync(APP_REVIEW_REFRESH_HANDLERS_PATH, "utf-8") : "",
          existsSync(HISTORY_DELETE_APPLY_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_APPLY_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_PREVIEW_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_PREVIEW_HANDLERS_PATH, "utf-8") : "",
      existsSync(CHUNK_QUALITY_BAR_COPY_PATH) ? readFileSync(CHUNK_QUALITY_BAR_COPY_PATH, "utf-8") : "",
          existsSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH) ? readFileSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH) ? readFileSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH, "utf-8") : "",
      existsSync(WEB_SERVICE_RUN_ROUND_API_PATH) ? readFileSync(WEB_SERVICE_RUN_ROUND_API_PATH, "utf-8") : "",
      existsSync(WEB_SERVICE_ROUND_IO_API_PATH) ? readFileSync(WEB_SERVICE_ROUND_IO_API_PATH, "utf-8") : "",
      existsSync(WEB_SERVICE_PROMPT_CORE_API_PATH) ? readFileSync(WEB_SERVICE_PROMPT_CORE_API_PATH, "utf-8") : "",
      existsSync(WEB_SERVICE_PROMPT_WORKFLOW_API_PATH) ? readFileSync(WEB_SERVICE_PROMPT_WORKFLOW_API_PATH, "utf-8") : "",
      existsSync(MODEL_PROVIDER_LIST_PANEL_PATH) ? readFileSync(MODEL_PROVIDER_LIST_PANEL_PATH, "utf-8") : "",
      existsSync(PROTECTION_MAP_STRIP_PATH) ? readFileSync(PROTECTION_MAP_STRIP_PATH, "utf-8") : "",
      existsSync(PROTECTION_MAP_REASON_GRID_PATH) ? readFileSync(PROTECTION_MAP_REASON_GRID_PATH, "utf-8") : "",
      existsSync(PROTECTION_MAP_SECTION_ROW_PATH) ? readFileSync(PROTECTION_MAP_SECTION_ROW_PATH, "utf-8") : "",
          existsSync(PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH, "utf-8") : "",
      existsSync(AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH) ? readFileSync(AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH, "utf-8") : "",
      existsSync(AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH) ? readFileSync(AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH) ? readFileSync(DIAGNOSTICS_TASK_BUILD_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_STATUS_RESET_PLAN_HELPERS_PATH) ? readFileSync(DOCUMENT_STATUS_RESET_PLAN_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_STATUS_RESET_NOTICE_HELPERS_PATH) ? readFileSync(DOCUMENT_STATUS_RESET_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_DECISION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_NOTICE_HELPERS_PATH) ? readFileSync(BATCH_RERUN_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH) ? readFileSync(HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH, "utf-8") : "",
      existsSync(HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH) ? readFileSync(HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH, "utf-8") : "",
      existsSync(ACTIVE_RUN_PROBE_HELPERS_PATH) ? readFileSync(ACTIVE_RUN_PROBE_HELPERS_PATH, "utf-8") : "",
          existsSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH) ? readFileSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH, "utf-8") : "",
      existsSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH) ? readFileSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_ALERTS_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_EMPTY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_EMPTY_PATH, "utf-8") : "",
      existsSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH) ? readFileSync(HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_EFFECT_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_EFFECT_HELPERS_PATH, "utf-8") : "",
          existsSync(PROMPT_PREVIEW_DRAFT_HELPERS_PATH) ? readFileSync(PROMPT_PREVIEW_DRAFT_HELPERS_PATH, "utf-8") : "",
      existsSync(PROMPT_PREVIEW_ACTION_HELPERS_PATH) ? readFileSync(PROMPT_PREVIEW_ACTION_HELPERS_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_CHUNK_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_CHUNK_ALERTS_PATH, "utf-8") : "",
      existsSync(DIFF_REVIEW_CARD_PATH) ? readFileSync(DIFF_REVIEW_CARD_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_COPY_PATH) ? readFileSync(RESULT_CARD_COPY_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_HEADER_PATH) ? readFileSync(DIAGNOSTICS_PAGE_HEADER_PATH, "utf-8") : "",
      existsSync(AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH) ? readFileSync(AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH, "utf-8") : "",
          existsSync(HISTORY_ARTIFACT_QUERY_HELPERS_PATH) ? readFileSync(HISTORY_ARTIFACT_QUERY_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ARTIFACT_REPAIR_HELPERS_PATH) ? readFileSync(HISTORY_ARTIFACT_REPAIR_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(MODEL_PROVIDER_IDENTITY_FIELDS_PATH) ? readFileSync(MODEL_PROVIDER_IDENTITY_FIELDS_PATH, "utf-8") : "",
      existsSync(MODEL_PROVIDER_PARAM_FIELDS_PATH) ? readFileSync(MODEL_PROVIDER_PARAM_FIELDS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH, "utf-8") : "",
          existsSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH, "utf-8") : "",
      existsSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH, "utf-8") : "",
      existsSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH, "utf-8") : "",
      existsSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH, "utf-8") : "",
      existsSync(USE_PROMPT_PREVIEW_DRAFT_STATE_PATH) ? readFileSync(USE_PROMPT_PREVIEW_DRAFT_STATE_PATH, "utf-8") : "",
      existsSync(PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH) ? readFileSync(PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH, "utf-8") : "",
      existsSync(USE_PROMPT_PREVIEW_FORM_STATE_PATH) ? readFileSync(USE_PROMPT_PREVIEW_FORM_STATE_PATH, "utf-8") : "",
      existsSync(USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH) ? readFileSync(USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
          existsSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH, "utf-8") : "",
      existsSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH) ? readFileSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(ROUND_RUN_STATUS_STATS_PATH) ? readFileSync(ROUND_RUN_STATUS_STATS_PATH, "utf-8") : "",
      existsSync(APPEND_ROUND_DIALOG_FIELDS_PATH) ? readFileSync(APPEND_ROUND_DIALOG_FIELDS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH) ? readFileSync(HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_TEXT_PANE_PATH) ? readFileSync(REWRITE_DIFF_TEXT_PANE_PATH, "utf-8") : "",
          existsSync(HISTORY_CARD_BODY_PATH) ? readFileSync(HISTORY_CARD_BODY_PATH, "utf-8") : "",
          existsSync(HISTORY_CARD_BODY_TYPES_PATH) ? readFileSync(HISTORY_CARD_BODY_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH) ? readFileSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH, "utf-8") : "",
      existsSync(USE_DOCUMENT_RESTORE_REFS_PATH) ? readFileSync(USE_DOCUMENT_RESTORE_REFS_PATH, "utf-8") : "",
          existsSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH) ? readFileSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_LOAD_NOTICE_HELPERS_PATH) ? readFileSync(HISTORY_LOAD_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_LOAD_PLAN_HELPERS_PATH) ? readFileSync(HISTORY_LOAD_PLAN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RESOLVE_HANDLERS_PATH) ? readFileSync(EXPORT_RESOLVE_HANDLERS_PATH, "utf-8") : "",
      existsSync(EXPORT_EXECUTE_HANDLERS_PATH) ? readFileSync(EXPORT_EXECUTE_HANDLERS_PATH, "utf-8") : "",
      existsSync(AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH) ? readFileSync(AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH, "utf-8") : "",
      existsSync(AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH) ? readFileSync(AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH, "utf-8") : "",
      existsSync(WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH) ? readFileSync(WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_LOAD_ROUTE_RESOLVE_HELPERS_PATH) ? readFileSync(HISTORY_LOAD_ROUTE_RESOLVE_HELPERS_PATH, "utf-8") : "",
      existsSync(HISTORY_LOAD_SNAPSHOT_SELECTION_HELPERS_PATH) ? readFileSync(HISTORY_LOAD_SNAPSHOT_SELECTION_HELPERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_START_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_START_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH, "utf-8") : "",
          existsSync(HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH, "utf-8") : "",
      existsSync(USE_RUN_SESSION_RUN_CONTROLS_PATH) ? readFileSync(USE_RUN_SESSION_RUN_CONTROLS_PATH, "utf-8") : "",
      existsSync(USE_RUN_SESSION_BATCH_CONTROLS_PATH) ? readFileSync(USE_RUN_SESSION_BATCH_CONTROLS_PATH, "utf-8") : "",
      existsSync(CHUNK_QUALITY_META_PATH) ? readFileSync(CHUNK_QUALITY_META_PATH, "utf-8") : "",
      existsSync(CHUNK_QUALITY_ACTIONS_PATH) ? readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8") : "",
      existsSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH, "utf-8") : "",
      existsSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH, "utf-8") : "",
          existsSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_RUN_PROBE_EFFECT_PATH, "utf-8") : "",
      existsSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH) ? readFileSync(USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH, "utf-8") : "",
      existsSync(USE_PROMPT_PREVIEW_FORM_STATE_PATH) ? readFileSync(USE_PROMPT_PREVIEW_FORM_STATE_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH, "utf-8") : "",
      existsSync(HISTORY_CARD_BODY_TYPES_PATH) ? readFileSync(HISTORY_CARD_BODY_TYPES_PATH, "utf-8") : "",
      existsSync(APPEND_ROUND_CONTROL_HELPERS_PATH) ? readFileSync(APPEND_ROUND_CONTROL_HELPERS_PATH, "utf-8") : "",
          existsSync(HISTORY_CARD_PROPS_PATH) ? readFileSync(HISTORY_CARD_PROPS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_HOOK_TYPES_PATH) ? readFileSync(DOCUMENT_RESTORE_HOOK_TYPES_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_EFFECT_RUNNER_PATH) ? readFileSync(DOCUMENT_RESTORE_EFFECT_RUNNER_PATH, "utf-8") : "",
      existsSync(AUTO_SNAPSHOT_RESTORE_HOOK_TYPES_PATH) ? readFileSync(AUTO_SNAPSHOT_RESTORE_HOOK_TYPES_PATH, "utf-8") : "",
      existsSync(USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH) ? readFileSync(USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH) ? readFileSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH, "utf-8") : "",
          existsSync(REWRITE_DIFF_PANEL_PROPS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_PROPS_PATH, "utf-8") : "",
      existsSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH) ? readFileSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(MODEL_CONFIG_CARD_PROPS_PATH) ? readFileSync(MODEL_CONFIG_CARD_PROPS_PATH, "utf-8") : "",
      existsSync(RESULT_CARD_PROPS_PATH) ? readFileSync(RESULT_CARD_PROPS_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
      existsSync(PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH) ? readFileSync(PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH, "utf-8") : "",
    ].join("\n");
  const appIndexSource = loadSource(APP_INDEX_PATH, failures);
  const modelConfigCardSource = [
    loadSource(MODEL_CONFIG_CARD_PATH, failures),
    existsSync(MODEL_CONFIG_CARD_PROPS_PATH) ? readFileSync(MODEL_CONFIG_CARD_PROPS_PATH, "utf-8") : "",
    existsSync(USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH) ? readFileSync(USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH, "utf-8") : "",
    existsSync(MODEL_CONFIG_PROVIDER_CATALOG_HANDLERS_PATH) ? readFileSync(MODEL_CONFIG_PROVIDER_CATALOG_HANDLERS_PATH, "utf-8") : "",
      existsSync(MODEL_CONFIG_PROVIDER_MUTATION_HANDLERS_PATH) ? readFileSync(MODEL_CONFIG_PROVIDER_MUTATION_HANDLERS_PATH, "utf-8") : "",
  ].join("\n");
  const modelDefaultConnectionPanelSource = [
    loadSource(MODEL_DEFAULT_CONNECTION_PANEL_PATH, failures),
    existsSync(MODEL_DEFAULT_CONNECTION_FORM_PATH) ? readFileSync(MODEL_DEFAULT_CONNECTION_FORM_PATH, "utf-8") : "",
    existsSync(MODEL_DEFAULT_CONNECTION_ACTIONS_PATH) ? readFileSync(MODEL_DEFAULT_CONNECTION_ACTIONS_PATH, "utf-8") : "",
  ].join("\n");
  const modelProviderRepositoryPanelSource = [
    loadSource(MODEL_PROVIDER_REPOSITORY_PANEL_PATH, failures),
    existsSync(MODEL_PROVIDER_LIST_PANEL_PATH) ? readFileSync(MODEL_PROVIDER_LIST_PANEL_PATH, "utf-8") : "",
    existsSync(MODEL_PROVIDER_EDITOR_PANEL_PATH) ? readFileSync(MODEL_PROVIDER_EDITOR_PANEL_PATH, "utf-8") : "",
    existsSync(MODEL_PROVIDER_EDITOR_FIELDS_PATH) ? readFileSync(MODEL_PROVIDER_EDITOR_FIELDS_PATH, "utf-8") : "",
    existsSync(MODEL_PROVIDER_PARAM_FIELDS_PATH) ? readFileSync(MODEL_PROVIDER_PARAM_FIELDS_PATH, "utf-8") : "",
    existsSync(MODEL_PROVIDER_IDENTITY_FIELDS_PATH) ? readFileSync(MODEL_PROVIDER_IDENTITY_FIELDS_PATH, "utf-8") : "",
    existsSync(MODEL_PROVIDER_REPOSITORY_VIEW_MODEL_PATH) ? readFileSync(MODEL_PROVIDER_REPOSITORY_VIEW_MODEL_PATH, "utf-8") : "",
  ].join("\n");
  const modelConfigSource = `${modelConfigCardSource}\n${modelDefaultConnectionPanelSource}\n${modelProviderRepositoryPanelSource}`;
  const resultCardSource = [
    loadSource(RESULT_CARD_PATH, failures),
    existsSync(RESULT_CARD_PROPS_PATH) ? readFileSync(RESULT_CARD_PROPS_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_COPY_PATH) ? readFileSync(RESULT_CARD_COPY_PATH, "utf-8") : "",
    existsSync(DIFF_REVIEW_CARD_PATH) ? readFileSync(DIFF_REVIEW_CARD_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_SM_WRAPPERS_PATH) ? readFileSync(RESULT_CARD_SM_WRAPPERS_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_EXPORT_ACTIONS_PATH) ? readFileSync(RESULT_CARD_EXPORT_ACTIONS_PATH, "utf-8") : "",
    existsSync(BATCH_RERUN_STATUS_ALERT_PATH) ? readFileSync(BATCH_RERUN_STATUS_ALERT_PATH, "utf-8") : "",
    existsSync(RESULT_CARD_OUTPUT_VIEW_MODEL_PATH) ? readFileSync(RESULT_CARD_OUTPUT_VIEW_MODEL_PATH, "utf-8") : "",
  ].join("\n");
  const rewriteDiffPanelSource = [
    loadSource(REWRITE_DIFF_PANEL_PATH, failures),
    existsSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH) ? readFileSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_PROPS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_PROPS_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_EMPTY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_EMPTY_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_ALERTS_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH) ? readFileSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(CHUNK_QUALITY_DECISION_HELPERS_PATH) ? readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(REWRITE_DIFF_PANEL_COPY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_COPY_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_CHUNK_CARD_PATH) ? readFileSync(REWRITE_DIFF_CHUNK_CARD_PATH, "utf-8") : "",
      existsSync(REWRITE_DIFF_CHUNK_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_CHUNK_ALERTS_PATH, "utf-8") : "",
  ].join("\n");
  const chunkQualityBarSource = loadSource(CHUNK_QUALITY_BAR_PATH, failures);
  const exportHealthPanelsSource = [
    existsSync(EXPORT_HEALTH_PANELS_PATH) ? readFileSync(EXPORT_HEALTH_PANELS_PATH, "utf-8") : "",
    existsSync(EXPORT_HEALTH_PANEL_PATH) ? readFileSync(EXPORT_HEALTH_PANEL_PATH, "utf-8") : "",
    existsSync(EXPORT_HEALTH_DETAILS_DIALOG_PATH) ? readFileSync(EXPORT_HEALTH_DETAILS_DIALOG_PATH, "utf-8") : "",
    existsSync(EXPORT_FAILURE_PANELS_PATH) ? readFileSync(EXPORT_FAILURE_PANELS_PATH, "utf-8") : "",
    existsSync(EXPORT_LIVE_HINT_PATH) ? readFileSync(EXPORT_LIVE_HINT_PATH, "utf-8") : "",
    existsSync(EXPORT_HEALTH_VIEW_MODEL_PATH) ? readFileSync(EXPORT_HEALTH_VIEW_MODEL_PATH, "utf-8") : "",
  ].join("\n");
  const diffFilterModelSource = loadSource(DIFF_FILTER_MODEL_PATH, failures);
  const resultDiffSource = `${resultCardSource}\n${rewriteDiffPanelSource}\n${chunkQualityBarSource}\n${exportHealthPanelsSource}\n${diffFilterModelSource}\n${loadSource(DIFF_PANEL_SCROLL_FOCUS_PATH, failures)}\n${existsSync(RESULT_CARD_EXPORT_ACTIONS_PATH) ? readFileSync(RESULT_CARD_EXPORT_ACTIONS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH) ? readFileSync(REWRITE_DIFF_PANEL_TOOLBAR_PATH, "utf-8") : ""}\n${existsSync(CHUNK_QUALITY_DECISION_HELPERS_PATH) ? readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_COPY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_COPY_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_TOKEN_HELPERS_PATH) ? readFileSync(RESULT_CARD_TOKEN_HELPERS_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_FORMAT_HELPERS_PATH) ? readFileSync(RESULT_CARD_FORMAT_HELPERS_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_REVIEW_HELPERS_PATH) ? readFileSync(RESULT_CARD_REVIEW_HELPERS_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_DECISION_HELPERS_PATH) ? readFileSync(RESULT_CARD_DECISION_HELPERS_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_SM_WRAPPERS_PATH) ? readFileSync(RESULT_CARD_SM_WRAPPERS_PATH, "utf-8") : ""}\n${existsSync(CHUNK_QUALITY_BAR_COPY_PATH) ? readFileSync(CHUNK_QUALITY_BAR_COPY_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_ALERTS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_EMPTY_PATH) ? readFileSync(REWRITE_DIFF_PANEL_EMPTY_PATH, "utf-8") : ""}\n${existsSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH) ? readFileSync(DIFF_PANEL_SCROLL_POSITION_STORE_PATH, "utf-8") : ""}\n${existsSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH) ? readFileSync(DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_CHUNK_ALERTS_PATH) ? readFileSync(REWRITE_DIFF_CHUNK_ALERTS_PATH, "utf-8") : ""}\n${existsSync(DIFF_REVIEW_CARD_PATH) ? readFileSync(DIFF_REVIEW_CARD_PATH, "utf-8") : ""}\n${existsSync(RESULT_CARD_COPY_PATH) ? readFileSync(RESULT_CARD_COPY_PATH, "utf-8") : ""}\n${existsSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_FILTER_EFFECTS_PATH, "utf-8") : ""}\n${existsSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_SCROLL_EFFECTS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_TEXT_PANE_PATH) ? readFileSync(REWRITE_DIFF_TEXT_PANE_PATH, "utf-8") : ""}\n${existsSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH) ? readFileSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH, "utf-8") : ""}\n${existsSync(CHUNK_QUALITY_META_PATH) ? readFileSync(CHUNK_QUALITY_META_PATH, "utf-8") : ""}\n${existsSync(CHUNK_QUALITY_ACTIONS_PATH) ? readFileSync(CHUNK_QUALITY_ACTIONS_PATH, "utf-8") : ""}\n${existsSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH, "utf-8") : ""}\n${existsSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH) ? readFileSync(USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH) ? readFileSync(REWRITE_DIFF_PANEL_CHUNK_LIST_PATH, "utf-8") : ""}\n${existsSync(REWRITE_DIFF_PANEL_PROPS_PATH) ? readFileSync(REWRITE_DIFF_PANEL_PROPS_PATH, "utf-8") : ""}\n${existsSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH) ? readFileSync(USE_REWRITE_DIFF_PANEL_MODEL_PATH, "utf-8") : ""}`;
  const historyCardSource = [
    loadSource(HISTORY_CARD_PATH, failures),
    existsSync(HISTORY_CARD_PROPS_PATH) ? readFileSync(HISTORY_CARD_PROPS_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_BODY_PATH) ? readFileSync(HISTORY_CARD_BODY_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_BODY_TYPES_PATH) ? readFileSync(HISTORY_CARD_BODY_TYPES_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH, "utf-8") : "",
    existsSync(HISTORY_ARTIFACT_ROW_PATH) ? readFileSync(HISTORY_ARTIFACT_ROW_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_HEADER_PATH) ? readFileSync(HISTORY_CARD_HEADER_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_SUMMARY_PILLS_PATH) ? readFileSync(HISTORY_CARD_SUMMARY_PILLS_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_MAINTENANCE_SECTION_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_SECTION_PATH, "utf-8") : "",
    existsSync(USE_HISTORY_CARD_STATE_PATH) ? readFileSync(USE_HISTORY_CARD_STATE_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUND_CARD_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH, "utf-8") : "",
  ].join("\n");
  const runStatusCardSource = [
    loadSource(RUN_STATUS_CARD_PATH, failures),
    existsSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH) ? readFileSync(ROUND_RUN_STATUS_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(ROUND_RUN_STATUS_STATS_PATH) ? readFileSync(ROUND_RUN_STATUS_STATS_PATH, "utf-8") : "",
  ].join("\n");
  const protectionMapCardSource = loadSource(PROTECTION_MAP_CARD_PATH, failures);
  const protectionMapPanelsSource = loadSource(PROTECTION_MAP_PANELS_PATH, failures);
  const scopeDiagnosticsPanelSource = [
    loadSource(SCOPE_DIAGNOSTICS_PANEL_PATH, failures),
    existsSync(SCOPE_DIAGNOSTICS_PARTS_PATH) ? readFileSync(SCOPE_DIAGNOSTICS_PARTS_PATH, "utf-8") : "",
    existsSync(SCOPE_DIAGNOSTICS_DETAIL_SHEET_PATH) ? readFileSync(SCOPE_DIAGNOSTICS_DETAIL_SHEET_PATH, "utf-8") : "",
  ].join("\n");
  const protectionMapSource = `${protectionMapCardSource}\n${protectionMapPanelsSource}\n${scopeDiagnosticsPanelSource}`;
  const themeModeMenuSource = loadSource(THEME_MODE_MENU_PATH, failures);
  const themeModeHookSource = loadSource(THEME_MODE_HOOK_PATH, failures);
  const appServiceSource = loadSource(APP_SERVICE_PATH, failures);
  const webServiceMainSource = loadSource(WEB_SERVICE_PATH, failures);
  const webServiceHttpSource = [
    loadSource(WEB_SERVICE_HTTP_PATH, failures),
    existsSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH) ? readFileSync(WEB_SERVICE_HTTP_ERROR_HELPERS_PATH, "utf-8") : "",
  ].join("\n");
  const webServiceCompatSource = loadSource(WEB_SERVICE_COMPAT_PATH, failures);
  const webServiceModelConfigSource = loadSource(WEB_SERVICE_MODEL_CONFIG_PATH, failures);
  const webServiceHealthSource = loadSource(WEB_SERVICE_HEALTH_PATH, failures);
  const webServicePromptsSource = loadSource(WEB_SERVICE_PROMPTS_PATH, failures);
  const webServiceModelSource = loadSource(WEB_SERVICE_MODEL_PATH, failures);
  const webServiceDocumentsSource = loadSource(WEB_SERVICE_DOCUMENTS_PATH, failures);
  const webServiceHistoryApiSource = loadSource(WEB_SERVICE_HISTORY_API_PATH, failures);
  const webServiceRoundsSource = loadSource(WEB_SERVICE_ROUNDS_PATH, failures);
  const webServiceFilesSource = loadSource(WEB_SERVICE_FILES_PATH, failures);
  const webServiceExportSource = [
    loadSource(WEB_SERVICE_EXPORT_PATH, failures),
    existsSync(WEB_SERVICE_EXPORT_HEADERS_PATH) ? readFileSync(WEB_SERVICE_EXPORT_HEADERS_PATH, "utf-8") : "",
    existsSync(WEB_SERVICE_EXPORT_RESULT_PATH) ? readFileSync(WEB_SERVICE_EXPORT_RESULT_PATH, "utf-8") : "",
  ].join("\n");
  const webServiceRunStreamSource = loadSource(WEB_SERVICE_RUN_STREAM_PATH, failures);
  const webServiceSource = [
    webServiceMainSource,
    webServiceHttpSource,
    webServiceCompatSource,
    webServiceModelConfigSource,
    webServiceHealthSource,
    webServicePromptsSource,
    webServiceModelSource,
    webServiceDocumentsSource,
    webServiceHistoryApiSource,
    webServiceRoundsSource,
    webServiceFilesSource,
    webServiceExportSource,
    webServiceRunStreamSource,
  ].join("\n");
  const cssSource = loadSource(GLOBAL_CSS_PATH, failures);
  const tailwindConfigSource = loadSource(TAILWIND_CONFIG_PATH, failures);
  const buttonSource = loadSource(BUTTON_PATH, failures);
  const badgeSource = loadSource(BADGE_PATH, failures);
  const inputSource = loadSource(INPUT_PATH, failures);
  const selectSource = loadSource(SELECT_PATH, failures);
  const textareaSource = loadSource(TEXTAREA_PATH, failures);
  const dialogSource = loadSource(DIALOG_PATH, failures);
  const combinedSource = [appSource, appIndexSource, modelConfigCardSource, modelDefaultConnectionPanelSource, modelProviderRepositoryPanelSource, resultCardSource, rewriteDiffPanelSource, chunkQualityBarSource, exportHealthPanelsSource, diffFilterModelSource, historyCardSource, protectionMapCardSource, protectionMapPanelsSource, scopeDiagnosticsPanelSource, themeModeMenuSource, themeModeHookSource, appServiceSource, webServiceSource, cssSource, tailwindConfigSource, buttonSource, badgeSource, inputSource, selectSource, textareaSource, dialogSource].join("\n");

  if (cssSource) {
    assertIncludes(cssSource, "html {\n    @apply h-svh overflow-hidden", "Document root must keep the app viewport-bound.", failures);
    assertIncludes(cssSource, "body {\n    @apply h-svh overflow-hidden bg-background", "Body must use semantic shadcn tokens and prevent whole-page scroll.", failures);
    assertIncludes(cssSource, "#root {\n    @apply h-svh overflow-hidden;", "React root must preserve fixed workbench height.", failures);
    assertIncludes(cssSource, ".shadcn-control-panel", "Shared utilities must be shadcn-scoped.", failures);
    assertIncludes(cssSource, ".shadcn-choice-card", "Choice cards must use shared shadcn utility semantics.", failures);
    assertIncludes(cssSource, "min-h-[4.25rem]", "Home route choice cards must stay compact and avoid blank vertical space.", failures);
    assertNotIncludes(cssSource, "min-h-[7rem]", "Home route choice cards must not return to the oversized blank layout.", failures);
    assertIncludes(cssSource, ".shadcn-config-dialog", "Home setup dialogs must use shared shadcn utility semantics.", failures);
    assertIncludes(cssSource, ".shadcn-scroll-bound [data-radix-scroll-area-viewport] > div", "Radix ScrollArea content must be width-bound inside shadcn overlays.", failures);
    assertIncludes(cssSource, "--success:", "Loading feedback must have a semantic green success token.", failures);
    assertNotIncludes(cssSource, ".fy-", "Old fy-* utility classes must not return after the shadcn migration.", failures);
  }

  if (tailwindConfigSource) {
    assertIncludes(tailwindConfigSource, "success: {", "Tailwind must expose the semantic success token for green loading icons.", failures);
    assertIncludes(tailwindConfigSource, "DEFAULT: \"hsl(var(--success))\"", "Tailwind success color must read from the shadcn CSS variable.", failures);
  }

  if (appSource) {
    assertIncludes(appSource, "SidebarProvider defaultOpen className=\"h-svh min-h-0 overflow-hidden\"", "App shell must use shadcn SidebarProvider with fixed viewport height.", failures);
    assertIncludes(appSource, "<ThemeModeMenu />", "Top header must expose the light/dark/system theme control.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "AppSidebar.tsx"), "utf-8"), "SidebarMenuButton", "Sidebar items must use the shadcn Sidebar menu button primitive.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "AppSidebar.tsx"), "utf-8"), "isActive={activeView === item.view}", "Sidebar active state must be delegated to the shadcn Sidebar item.", failures);
    assertIncludes(appSource, "<Breadcrumb", "Top status area must use shadcn Breadcrumb composition.", failures);
    assertIncludes(appSource, "data-ui-section=\"current-file-chip\"", "Top status area must keep the current-file chip identifiable.", failures);
    assertIncludes(appSource, "flex h-11 min-w-0 items-center gap-2 overflow-hidden border-t px-3 text-xs sm:h-10 sm:px-4", "Top status bar must remain single-line while adapting its height and padding on mobile.", failures);
    assertIncludes(appSource, "h-9 min-w-0 flex-1 justify-start overflow-hidden px-2 text-xs sm:h-7 sm:min-w-[16rem]", "Current document chip must shrink safely on mobile and retain a readable desktop base width.", failures);
    assertIncludes(appSource, "flex shrink-0 items-center gap-2", "Top route, Diff, and feedback controls must follow the current-file chip without a large blank gap.", failures);
    assertNotIncludes(appSource, "ml-auto flex min-w-0 shrink-0 items-center gap-2", "Top status bar must not push route, Diff, and feedback controls into a far-right island.", failures);
    assertIncludes(appSource, "min-w-0 truncate text-foreground", "Current document name must truncate instead of clipping mobile status actions.", failures);
    assertIncludes(appSource, "aria-label=\"打开通知与任务中心\"", "Notification status action must remain accessible.", failures);
    assertIncludes(appSource, "notificationStatusLabel", "Notification status must label operation feedback clearly.", failures);
    assertIncludes(appSource, "操作反馈", "Successful operation notices must be visually distinguishable from passive notifications.", failures);
    assertIncludes(appSource, "aria-live=\"polite\"", "Status feedback must be announced as live feedback.", failures);
    assertIncludes(appSource, "const hasActiveOperationFeedback = Boolean(activeRuntimeTaskCount || (uiBusy && !error));", "Global loading feedback must be collapsed into the top status action.", failures);
    assertNotIncludes(appSource, "data-ui-section=\"operation-feedback-bar\"", "Top status feedback must not be duplicated by a second operation bar.", failures);
    assertNotIncludes(appSource, "<OperationFeedbackBar", "The app shell must not render duplicate global loading surfaces.", failures);
    assertIncludes(appSource, "hasActiveOperationFeedback ? Loader2", "Top status feedback must use a spinner while work is running.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "loadingIcon.ts"), "utf-8"), "export const LOADING_ICON_CLASS_NAME = \"animate-spin text-success\";", "App loading spinners must render with the green success token.", failures);
    assertIncludes(appSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Frontend must expose the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(appSource, "const REWRITE_CONCURRENCY_LEVELS = [1, 2, 3, 4, 6, 8, 12, 16] as const;", "Home concurrency selector must expose stable 1/2/3/4/6/8/12/16 tiers.", failures);
    assertIncludes(`${appSource}\n${existsSync(RUN_ROUND_HANDLERS_PATH) ? readFileSync(RUN_ROUND_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_PROGRESS_HANDLERS_PATH) ? readFileSync(RUN_ROUND_PROGRESS_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_FINISH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FINISH_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_LAUNCH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_LAUNCH_HANDLERS_PATH, "utf-8") : ""}\n${[
      existsSync(RUN_ROUND_ATTACH_HANDLERS_PATH) ? [
      existsSync(RUN_ROUND_ATTACH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}\n${existsSync(RUN_ROUND_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_COMPLETION_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_CANCEL_HANDLERS_PATH) ? readFileSync(RUN_ROUND_CANCEL_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_RESET_HANDLERS_PATH) ? readFileSync(RUN_ROUND_RESET_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_SNAPSHOT_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_HANDLERS_PATH, "utf-8") : ""}\n${[
    existsSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_PREPARE_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}\n${[
      existsSync(RUN_ROUND_START_HANDLERS_PATH) ? readFileSync(RUN_ROUND_START_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_START_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_START_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_EXECUTE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_EXECUTE_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}`, "assertBackendConcurrencyReady(", "Round launch must verify the live backend supports the selected concurrency.", failures);
    assertIncludes(`${appSource}\n${existsSync(RUN_ROUND_HANDLERS_PATH) ? readFileSync(RUN_ROUND_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_PROGRESS_HANDLERS_PATH) ? readFileSync(RUN_ROUND_PROGRESS_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_FINISH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FINISH_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_LAUNCH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_LAUNCH_HANDLERS_PATH, "utf-8") : ""}\n${[
      existsSync(RUN_ROUND_ATTACH_HANDLERS_PATH) ? [
      existsSync(RUN_ROUND_ATTACH_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH) ? readFileSync(RUN_ROUND_ATTACH_SEED_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}\n${existsSync(RUN_ROUND_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_COMPLETION_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_CANCEL_HANDLERS_PATH) ? readFileSync(RUN_ROUND_CANCEL_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_RESET_HANDLERS_PATH) ? readFileSync(RUN_ROUND_RESET_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(RUN_ROUND_SNAPSHOT_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_HANDLERS_PATH, "utf-8") : ""}\n${[
    existsSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH, "utf-8") : "",
    existsSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_PREPARE_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}\n${[
      existsSync(RUN_ROUND_START_HANDLERS_PATH) ? readFileSync(RUN_ROUND_START_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_SESSION_START_HANDLERS_PATH) ? readFileSync(RUN_ROUND_SESSION_START_HANDLERS_PATH, "utf-8") : "",
      existsSync(RUN_ROUND_EXECUTE_HANDLERS_PATH) ? readFileSync(RUN_ROUND_EXECUTE_HANDLERS_PATH, "utf-8") : ""
    ].join("\n")}`, "maxRewriteConcurrency", "Round launch guard must read the backend-reported concurrency ceiling.", failures);
    assertIncludes(runStatusCardSource, "const concurrencyLabel = String(configuredConcurrencyValue);", "Run status must show configured concurrency as the primary value.", failures);
    assertIncludes(runStatusCardSource, "const concurrencyDetail = actualConcurrency && actualConcurrency !== configuredConcurrencyValue", "Run status must surface effective worker count separately when it differs.", failures);
    assertIncludes([
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? [
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(USE_HOME_RUN_PANEL_ACTIONS_PATH) ? readFileSync(USE_HOME_RUN_PANEL_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n"), "onRunRound(modelConfigRef.current);", "Home run button must start with the latest selected concurrency.", failures);
    assertIncludes(appSource, "configuredConcurrency", "Round progress UI must distinguish configured concurrency from effective active workers.", failures);
    assertNotIncludes(appSource, "progress?.concurrency ?? 2", "Round run status must not fall back to a hard-coded concurrency value.", failures);
    assertIncludes(appSource, "className={cn(hasActiveOperationFeedback && LOADING_ICON_CLASS_NAME)}", "Top status spinner must turn green while work is running.", failures);
    assertIncludes(appSource, "openDiffTaskTarget(diffDashboardStats.preferredFilter, diffDashboardStats.preferredChunkId)", "Top status area must route directly into focused Diff review.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "diffDashboard.ts"), "utf-8"), "export function formatDiffDashboardLabel", "Top Diff status must format needs-review and high-risk counts separately.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "diffDashboard.ts"), "utf-8"), "highRiskCount", "Global Diff dashboard stats must track high-risk chunks separately.", failures);
    assertIncludes(appSource, "failedChunkIds.length ? \"failed\" : highRiskChunkIds.length ? \"highRisk\"", "Global Diff focus must prefer high-risk chunks before ordinary review chunks.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function getDefaultReviewDecisionForChunk(data: RoundCompareData, chunkId: string): ReviewDecision", "Rerun completion must derive per-chunk default decisions from the latest compare data.", failures);
    assertIncludes(
      `${appSource}\n${existsSync(BATCH_RERUN_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(BATCH_RERUN_CORE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_CORE_HANDLERS_PATH, "utf-8") : ""}\n${existsSync(BATCH_RERUN_ACTION_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_ACTION_HANDLERS_PATH, "utf-8") : ""}`,
      existsSync(BATCH_RERUN_WAIT_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_WAIT_HANDLERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH) ? readFileSync(BATCH_RERUN_MATERIALIZE_HANDLERS_PATH, "utf-8") : "",
      "[chunkId]: nextDecision",
      "Single rerun fallback chunks must not be forced back to default rewrite.",
      failures,
    );
    assertIncludes([
      existsSync(BATCH_RERUN_HELPERS_PATH) ? readFileSync(BATCH_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH) ? readFileSync(BATCH_RERUN_FEEDBACK_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_NOTICE_HELPERS_PATH) ? readFileSync(BATCH_RERUN_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_DECISION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_DECISION_HELPERS_PATH, "utf-8") : "",
      existsSync(BATCH_RERUN_SELECTION_HELPERS_PATH) ? readFileSync(BATCH_RERUN_SELECTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "getDefaultReviewDecisionForChunk(compareData, target.chunkId)", "Batch rerun fallback chunks must keep safe-source defaults.", failures);
    assertIncludes(appSource, "<ResultCard", "Home must keep output/export summary in the main work area.", failures);
    assertIncludes(appSource, "<DiffReviewCard", "Home must embed the full Diff review surface.", failures);
    assertIncludes(appSource, "<RoundRunStatusCard", "Home must show a compact run status card instead of the Diff surface while a round is running.", failures);
    assertIncludes(runStatusCardSource, "<Progress value={percent} className=\"h-2\" />", "Round run status card must use shadcn Progress for chunk progress.", failures);
    assertIncludes([readFileSync(resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlSection.tsx"), "utf-8"), existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "", existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : ""].join("\n"), "轮内并发", "Home run controls must expose the bounded rewrite concurrency setting.", failures);
    assertIncludes([
      existsSync(DIAGNOSTICS_PAGE_PATH) ? readFileSync(DIAGNOSTICS_PAGE_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_HEADER_PATH) ? readFileSync(DIAGNOSTICS_PAGE_HEADER_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH) ? readFileSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH) ? readFileSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_TASK_SECTIONS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH) ? readFileSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH, "utf-8") : "",
    ].join("\n"), "value.config.rewriteConcurrency ?? 2", "Diagnostics must show the active rewrite concurrency setting.", failures);
    assertIncludes([
      existsSync(DIAGNOSTICS_PAGE_PATH) ? readFileSync(DIAGNOSTICS_PAGE_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_HEADER_PATH) ? readFileSync(DIAGNOSTICS_PAGE_HEADER_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH) ? readFileSync(DIAGNOSTICS_PAGE_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH) ? readFileSync(DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_RUNTIME_SECTIONS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_TASK_SECTIONS_PATH) ? readFileSync(DIAGNOSTICS_TASK_SECTIONS_PATH, "utf-8") : "",
      existsSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH) ? readFileSync(DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH, "utf-8") : "",
    ].join("\n"), "value.config.effectiveRewriteTimeoutSeconds ?? value.config.requestTimeoutSeconds", "Diagnostics must show the effective long-thinking rewrite timeout.", failures);
    assertIncludes(appSource, "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]", "Home operation column must use a bounded responsive track instead of a hard fixed width.", failures);
    assertNotIncludes(appSource, "xl:grid-cols-[minmax(0,1fr)_440px]", "Home operation column must not return to the overflowing fixed 440px track.", failures);
    assertIncludes(appSource, "data-ui-section=\"home-operation-scroll\"", "Home right operation stack must use shadcn ScrollArea scrolling.", failures);
    assertIncludes(appSource, "className=\"shadcn-home-operation-scroll shadcn-scroll-bound order-1 h-auto", "Home operation stack must use its responsive scroll boundary and appear first on narrow screens.", failures);
    assertIncludes(appSource, "<HomeRunPanel", "Run controls must stay in the right operation stack.", failures);
    assertIncludes([
      existsSync(HOME_RUN_PANEL_STATE_PATH) ? readFileSync(HOME_RUN_PANEL_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_ACTION_STATE_PATH) ? readFileSync(HOME_RUN_PRIMARY_ACTION_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_STATE_PATH, "utf-8") : "",
      existsSync(APPEND_ROUND_CONTROL_HELPERS_PATH) ? readFileSync(APPEND_ROUND_CONTROL_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUTE_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_ROUTE_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_CONFIG_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_CONFIG_STATE_PATH, "utf-8") : "",
    ].join("\n"), "刷新轮次状态", "Stale round status must show an actionable refresh button instead of a dead sync state.", failures);
    assertIncludes([
      existsSync(HOME_RUN_PANEL_STATE_PATH) ? readFileSync(HOME_RUN_PANEL_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_ACTION_STATE_PATH) ? readFileSync(HOME_RUN_PRIMARY_ACTION_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH) ? readFileSync(HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_STATE_PATH, "utf-8") : "",
      existsSync(APPEND_ROUND_CONTROL_HELPERS_PATH) ? readFileSync(APPEND_ROUND_CONTROL_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUTE_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_ROUTE_STATE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_DRAFT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH) ? readFileSync(HOME_RUN_APPEND_ISSUE_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_APPEND_CONFIG_STATE_PATH) ? readFileSync(HOME_RUN_APPEND_CONFIG_STATE_PATH, "utf-8") : "",
    ].join("\n"), "? `继续第 ${input.nextRound} 轮`", "Selected multi-round workflows must present round 2+ as continuation, not append.", failures);
    assertIncludes(appSource, "onRefreshStatus={() => void handleRefreshCurrentDocumentStatus()}", "Home run panel must be able to refresh stale round status from the primary action.", failures);
    assertNotIncludes(appSource, "所选流程已完成，可追加", "Home run controls must not show verbose selected-workflow helper copy.", failures);
    assertNotIncludes(appSource, "左侧可查看 Diff 和导出", "Loaded result alert must stay compact and not repeat obvious actions.", failures);
    assertIncludes([readFileSync(resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlSection.tsx"), "utf-8"), existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "", existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : ""].join("\n"), "第 {visibleResultRound} 轮已完成", "Loaded result alert should use short completion wording.", failures);
    assertNotIncludes(appSource, "<DetectionReportPanel", "External detection report controls must stay removed.", failures);
    assertIncludes([
      existsSync(SETUP_EDITOR_DIALOG_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_PROMPT_SECTION_PATH) ? readFileSync(SETUP_EDITOR_PROMPT_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
    ].join("\n"), "<Dialog open={open}", "Setup editors must use centered shadcn Dialog.", failures);
    assertIncludes([
      existsSync(SETUP_EDITOR_DIALOG_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_PROMPT_SECTION_PATH) ? readFileSync(SETUP_EDITOR_PROMPT_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
    ].join("\n"), "className={cn(\"shadcn-config-dialog", "Setup editors must share the shadcn dialog utility.", failures);
    assertNotIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanel.tsx"), "utf-8"), "<Sheet open={Boolean(setupEditor)}", "Setup editors must not reopen as right-side Sheets.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialog.tsx"), "utf-8"), "<Dialog open={open}", "Append round route picker must use a centered shadcn Dialog.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialog.tsx"), "utf-8"), "追加第 {appendRoundNumber} 轮", "Append dialog must clearly identify the single appended round.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialog.tsx"), "utf-8"), "开始追加", "Append dialog must keep one clear confirm action.", failures);
    assertNotIncludes(appSource, "<Sheet open={Boolean(appendDraft)}", "Append round route picker must not open as a right-side Sheet.", failures);
    assertNotIncludes(appSource, "shadcn-config-sheet", "Setup editors must not use the removed config Sheet utility.", failures);
    assertIncludes([
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? [
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(USE_HOME_RUN_PANEL_ACTIONS_PATH) ? readFileSync(USE_HOME_RUN_PANEL_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n"), "const editablePromptProfile = getDefaultPromptProfile(promptWorkflows);", "Rewrite workflow action must derive the editable workflow from backend metadata.", failures);
    assertIncludes(`${readFileSync(HOME_RUN_PANEL_PATH, "utf-8")}\n${[
    existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? [
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(USE_HOME_RUN_PANEL_ACTIONS_PATH) ? readFileSync(USE_HOME_RUN_PANEL_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n")}`, "onPromptProfileChange(m.editablePromptProfile)", "Rewrite workflow action must switch to the editable workflow before editing.", failures);
    assertNotIncludes(appSource, "ToggleGroupItem value=\"cn_prewrite\"", "Rewrite workflow editor must not expose the legacy three-round preset.", failures);
    assertNotIncludes(appSource, "ToggleGroupItem value=\"cn\"", "Rewrite workflow editor must not expose the legacy two-round preset.", failures);
    assertNotIncludes(appSource, "data-ui-section=\"prompt-workflow-route-defaults\"", "Prompt library page must not duplicate home workflow/model-route settings.", failures);
    assertIncludes(readFileSync(PROMPT_PREVIEW_LIST_PANEL_PATH, "utf-8"), "<Card className=\"flex h-full min-h-0 flex-col overflow-hidden\">", "Prompt library left panel must use a flex container for internal scrolling.", failures);
    assertIncludes(readFileSync(PROMPT_PREVIEW_LIST_PANEL_PATH, "utf-8"), "<CardContent className=\"flex min-h-0 flex-1 flex-col gap-4 px-5 pb-5\">", "Prompt library list must allocate remaining height to its ScrollArea.", failures);
    assertIncludes(appSource, "onDeletePrompt={(promptId) => handleDeletePrompt(promptId)}", "Prompt library must expose custom prompt delete in the main CRUD flow.", failures);
    assertNotIncludes(appSource, "保存内容", "Prompt library must not split one save action into content save.", failures);
    assertNotIncludes(appSource, "保存信息", "Prompt library must not split one save action into metadata save.", failures);
    assertNotIncludes(appSource, "restoreSelectedBackup", "Prompt library must keep backup restore out of the main UI.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "UnifiedConfirmDialog.tsx"), "utf-8"), "<AlertDialog open", "Risky actions must use the shadcn AlertDialog confirmation flow.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "UnifiedConfirmDialog.tsx"), "utf-8"), "export function UnifiedConfirmDialog", "Native confirms must stay replaced by the unified app dialog.", failures);
    assertIncludes(appSource, "requestConfirm", "Risky actions must route through the async confirmation flow.", failures);
    const notificationCenterSource = [
      readFileSync(resolve(ROOT_DIR, "app", "src", "components", "NotificationCenter.tsx"), "utf-8"),
      existsSync(NOTIFICATION_RUNTIME_TASK_SECTION_PATH) ? readFileSync(NOTIFICATION_RUNTIME_TASK_SECTION_PATH, "utf-8") : "",
      existsSync(NOTIFICATION_HISTORY_SECTION_PATH) ? readFileSync(NOTIFICATION_HISTORY_SECTION_PATH, "utf-8") : "",
      existsSync(NOTIFICATION_CENTER_VIEW_MODEL_PATH) ? readFileSync(NOTIFICATION_CENTER_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n");
    assertIncludes(notificationCenterSource, "<SheetTitle className=\"flex min-w-0 items-center gap-2\">", "Notification center must expose an accessible shadcn SheetTitle.", failures);
    assertIncludes(notificationCenterSource, "<SheetDescription className=\"sr-only\">查看运行任务和最近通知。</SheetDescription>", "Notification center must expose a non-visual accessible description.", failures);
    assertNotIncludes(appSource, "aria-labelledby=\"notification-center-title\"", "Notification center must not override the Radix-generated title id.", failures);
    assertIncludes(notificationCenterSource, "data-ui-section=\"runtime-task-center\"", "Notification center must separate active runtime tasks from notification history.", failures);
    assertIncludes(appSource, "taskItems={runtimeTaskItems}", "Runtime task center items must be passed into the notification center.", failures);
    assertIncludes(notificationCenterSource, "className=\"flex w-[min(96vw,34rem)] min-w-0 max-w-[calc(100vw-0.75rem)] flex-col overflow-hidden p-0 sm:max-w-none [&>button]:hidden\"", "Notification center sheet must clamp horizontal overflow with enough readable width.", failures);
    assertIncludes(notificationCenterSource, "whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]", "Notification text must fully wrap long backend/provider messages inside the sheet.", failures);
    assertNotIncludes(appSource, "mt-1 line-clamp-3 min-w-0 break-words text-sm leading-6 text-muted-foreground", "Notification history must not clamp long notices horizontally or vertically.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "errorText.ts"), "utf-8"), "export function isRawHtmlErrorText", "Notification history must detect stale raw backend HTML error pages.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "notificationHelpers.ts"), "utf-8"), "isRawHtmlErrorText(text)", "Notification history must filter raw HTML errors before rendering persisted history.", failures);
    assertIncludes(appSource, "setError(\"\")", "Stale backend method-mismatch errors must be cleared from hot-reloaded app state.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "errorText.ts"), "utf-8"), "本地后端接口方法不匹配（HTTP 405）", "App error display must translate raw 405 HTML pages into a user-facing local backend hint.", failures);
    assertIncludes(appSource, "function openTaskTargetView", "Task-center navigation must be centralized.", failures);
    assertIncludes(appSource, "function openDiffTaskTarget", "Task center must support direct navigation into focused Diff filters.", failures);
    assertIncludes(appSource, "diffFocusRequest={diffFocusRequest}", "Focused Diff requests must flow into the Diff review card.", failures);
    assertIncludes([
      existsSync(SETUP_EDITOR_DIALOG_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_PROMPT_SECTION_PATH) ? readFileSync(SETUP_EDITOR_PROMPT_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
    ].join("\n"), "data-ui-section=\"model-route-compact\"", "Model route Dialog must use a compact shadcn summary bar before per-round controls.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "components", "HomeSetupChoiceCards.tsx"), "utf-8"), "data-ui-section=\"home-active-model-route\"", "Home model route card must show the active per-round route, not only the default model.", failures);
    assertIncludes([
      existsSync(SETUP_EDITOR_DIALOG_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_BODY_PROPS_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH) ? readFileSync(SETUP_EDITOR_DIALOG_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_PROMPT_SECTION_PATH) ? readFileSync(SETUP_EDITOR_PROMPT_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH, "utf-8") : "",
      existsSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH) ? readFileSync(SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH, "utf-8") : "",
    ].join("\n"), "sm:grid-cols-3", "Model route Dialog actions should stay limited to the necessary three operations.", failures);
    assertNotIncludes(appSource, "sm:grid-cols-2 xl:grid-cols-5", "Model route Dialog actions must not use viewport-xl columns inside the bounded overlay.", failures);
    assertIncludes(`${readFileSync(HOME_RUN_PANEL_PATH, "utf-8")}\n${[
    existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? [
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(USE_HOME_RUN_PANEL_ACTIONS_PATH) ? readFileSync(USE_HOME_RUN_PANEL_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n")}`, "modelConfigRef.current", "Model route edits must save the latest selected provider/model without waiting for a React rerender.", failures);
    assertIncludes(`${readFileSync(HOME_RUN_PANEL_PATH, "utf-8")}\n${[
    existsSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH) ? readFileSync(HOME_RUN_CONTROL_ACTION_BUTTONS_PATH, "utf-8") : "",
    existsSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH) ? readFileSync(HOME_RUN_CONTROL_STATUS_BLOCK_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? [
      existsSync(HOME_RUN_PANEL_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_MODEL_PATH, "utf-8") : "",
      existsSync(USE_HOME_RUN_PANEL_ACTIONS_PATH) ? readFileSync(USE_HOME_RUN_PANEL_ACTIONS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_TYPES_PATH) ? readFileSync(HOME_RUN_PANEL_TYPES_PATH, "utf-8") : "",
      existsSync(USE_SETUP_EDITOR_ESCAPE_PATH) ? readFileSync(USE_SETUP_EDITOR_ESCAPE_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_VIEW_MODEL_PATH, "utf-8") : "",
      existsSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH) ? readFileSync(HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH, "utf-8") : "",
    ].join("\n")}`, "modelRouteLines", "Model route summary must list effective providers and models per round.", failures);
    assertIncludes(appSource, "scopeDiagnostics", "Protection view must keep DOCX body-scope diagnostics in app state.", failures);
    assertIncludes(appSource, "service.getDocumentScopeDiagnostics(sourcePath)", "Document refresh must fetch DOCX body-scope diagnostics with the other document state.", failures);
    assertIncludes(appSource, "<ProtectionMapCard value={protectionMap} diagnostics={scopeDiagnostics} />", "Protection view must pass body-scope diagnostics into the protection map.", failures);
    assertIncludes([
      existsSync(DOCUMENT_RESTORE_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_STORE_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_STORE_HELPERS_PATH, "utf-8") : "",
      existsSync(DOCUMENT_RESTORE_ROUTE_HELPERS_PATH) ? readFileSync(DOCUMENT_RESTORE_ROUTE_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "if (!input.storedSourcePath)", "App restore must not auto-open an arbitrary first history item when the user has no active document.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "errorRecovery.ts"), "utf-8"), "export function isDiscardableRestoreError", "Invalid legacy active-document records must be skipped without leaving a startup error.", failures);
    assertNotIncludes(appSource, "const fallbackItem = historyItems[0]", "Startup restore must not fall back to the first history record.", failures);
    assertNotIncludes(appSource, "默认 {modelConfig.model || \"未选\"} · {activeFlowSequence.length} 轮", "Home model route summary must not keep showing the default model after custom per-round routes are selected.", failures);
    assertNotIncludes(appSource, "rotateModelRoute", "Model route Sheet must not keep the removed provider-rotation shortcut.", failures);
    assertNotIncludes(appSource, "轮换服务商", "Model route Sheet must not show the removed provider-rotation shortcut.", failures);
    assertNotIncludes(appSource, "读默认", "Model route Sheet must not duplicate default-model refresh from the full model configuration page.", failures);
    assertNotIncludes(appSource, "onRefreshDefaultModels", "Home route panel must not keep dead default-model refresh props.", failures);
    assertNotIncludes(appSource, "RouteOverviewCard", "Model route Sheet must not reintroduce verbose overview cards.", failures);
    assertIncludes(
      [
        existsSync(PROVIDER_MODEL_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_PATCH_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PATCH_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_PLAN_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PLAN_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_REFRESH_HELPERS_PATH) ? [
      existsSync(PROVIDER_MODEL_REFRESH_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_REFRESH_HELPERS_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH, "utf-8") : "",
      existsSync(PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH, "utf-8") : "",
        existsSync(PROVIDER_MODEL_SAVE_HELPERS_PATH) ? readFileSync(PROVIDER_MODEL_SAVE_HELPERS_PATH, "utf-8") : "",
      ].join("\n"),
      "provider.enabled !== false",
      "Provider selection must treat legacy providers without an enabled flag as enabled.",
      failures,
    );
    assertIncludes(
      [
        existsSync(MODEL_CATALOG_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_HANDLERS_PATH, "utf-8") : "",
        existsSync(MODEL_CATALOG_LIST_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_LIST_HANDLERS_PATH, "utf-8") : "",
        existsSync(MODEL_CATALOG_PROVIDER_HANDLERS_PATH) ? [
      existsSync(MODEL_CATALOG_PROVIDER_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_PROVIDER_HANDLERS_PATH, "utf-8") : "",
      existsSync(MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH, "utf-8") : "",
        existsSync(MODEL_CATALOG_CONFIG_HANDLERS_PATH) ? readFileSync(MODEL_CATALOG_CONFIG_HANDLERS_PATH, "utf-8") : "",
      ].join("\n"),
      "beginTask(\"loading-models\"",
      "Model catalog refresh must enter the shared task state flow.",
      failures,
    );
    assertNotIncludes(appSource, "window.confirm", "App must not use native browser confirmation popups.", failures);
    assertNotIncludes(appSource, "window.alert", "App must not use native browser alert popups.", failures);
    assertNoLegacyFyClassTokens(appSource, "App must not reintroduce old fy-* UI classes.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "const LOADING_ICON_CLASS_NAME = \"animate-spin text-success\";", "Model and format loading spinners must render with the green success token.", failures);
    assertIncludes(modelConfigCardSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Model config must expose the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(modelConfigSource, "max={MAX_REWRITE_CONCURRENCY}", "Model config concurrency input must use the shared 16-way ceiling.", failures);
  }

  if (inputSource && selectSource && textareaSource) {
    const fieldControlSource = [inputSource, selectSource, textareaSource].join("\n");
    assertIncludes(fieldControlSource, "focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--ring)/0.22)]", "Form controls must use a subtle inset shadcn focus treatment that cannot be clipped by right-panel bounds.", failures);
    assertIncludes(fieldControlSource, "focus-visible:border-ring/45", "Form controls must keep focus visible without heavy black borders.", failures);
    assertIncludes(selectSource, "[&>span]:truncate", "Select trigger text must stay truncated without widening route cards.", failures);
    assertNotIncludes(fieldControlSource, "focus-visible:ring-offset-2", "Form controls must not use external ring offsets that look clipped inside bounded panels.", failures);
    assertNotIncludes(selectSource, "focus:ring-2", "Select trigger must not use an always-on external focus ring.", failures);
  }

  const modelProviderParamFieldsSource = loadSource(MODEL_PROVIDER_PARAM_FIELDS_PATH, failures);
  const appendRoundDialogFieldsSource = loadSource(APPEND_ROUND_DIALOG_FIELDS_PATH, failures);
  if (modelProviderParamFieldsSource) {
    assertIncludes(modelProviderParamFieldsSource, "htmlFor={`${selectedProvider.id}-temperature`}", "Provider temperature field must associate its label with the input via htmlFor/id.", failures);
    assertIncludes(modelProviderParamFieldsSource, "htmlFor={`${selectedProvider.id}-defaultModel`}", "Provider default-model field must associate its label with the control via htmlFor/id.", failures);
    assertIncludes(modelProviderParamFieldsSource, 'id={`${selectedProvider.id}-defaultModel`}', "Provider default-model control must carry the id its label points to.", failures);
    assertNotIncludes(modelProviderParamFieldsSource, "<FieldLabel>", "No provider field label may be left without an htmlFor association.", failures);
  }
  if (appendRoundDialogFieldsSource) {
    assertIncludes(appendRoundDialogFieldsSource, 'htmlFor="appendRoundPrompt"', "Append-round prompt field must associate its label with the select via htmlFor/id.", failures);
    assertIncludes(appendRoundDialogFieldsSource, 'id="appendRoundPrompt"', "Append-round prompt control must carry the id its label points to.", failures);
    assertIncludes(appendRoundDialogFieldsSource, 'htmlFor="appendRoundModel"', "Append-round model field must associate its label with the control via htmlFor/id.", failures);
    assertNotIncludes(appendRoundDialogFieldsSource, "<FieldLabel>", "No append-round field label may be left without an htmlFor association.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultDiffSource, "export function DiffReviewCard", "ResultCard module must export the full-height Diff review surface.", failures);
    assertIncludes(resultDiffSource, "flex shrink-0 flex-wrap items-center gap-2", "Output export actions should stay compact and avoid dead spacing.", failures);
    assertIncludes(resultDiffSource, "function ExportHealthPanel", "Output card must summarize export health in one compact panel.", failures);
    assertIncludes(resultDiffSource, "function ExportHealthDetailsDialog", "Export health must expose report details without sending users to JSON files.", failures);
    assertIncludes(resultDiffSource, "function ExportFailurePanel", "Blocked DOCX exports must show structured failure feedback in the result area.", failures);
    assertIncludes(resultDiffSource, "导出拦截", "Blocked DOCX export feedback must use a compact visible label.", failures);
    assertIncludes(resultDiffSource, "导出健康", "Output card must label the combined export health panel clearly.", failures);
    assertIncludes(resultDiffSource, "const blockingIssueCount = evidenceBlockingCount", "Export health must fail closed when versioned export evidence is missing.", failures);
    assertIncludes(resultDiffSource, "+ guardIssueCount", "Export health must include the blocking guard count after the evidence gate.", failures);
    assertIncludes(resultDiffSource, "+ ooxmlAuditIssueCount", "Export health must include OOXML integrity issues.", failures);
    assertIncludes(resultDiffSource, "+ formatLockIssueCount", "Export health must include source-format lock issues.", failures);
    assertIncludes(resultDiffSource, "+ contentContractBlockingCount", "Export health must include normalized body-only contract issues.", failures);
    assertNotIncludes(resultDiffSource, "contentContractIssueCount + editableHeadingCount", "Export health must not double-count editable headings already represented by the contract.", failures);
    assertIncludes(resultDiffSource, "warningCount = guardWarningCount", "Export health must surface non-blocking guard warnings.", failures);
    assertIncludes(resultDiffSource, "buildExportHealthSection", "Export health details must format report samples consistently.", failures);
    assertNotIncludes(resultDiffSource, "T.adoptAllRejected", "Output export actions must not expose removed candidate adoption.", failures);
    assertNotIncludes(appSource, "collectAdoptableRejectedCandidates", "Home must not compute removed candidate adoption state.", failures);
    assertIncludes(appSource, "buildDiffDashboardStats(activeCompareData, activeRerunFailures, reviewDecisions)", "Home Diff dashboard counts must follow review decisions.", failures);
    assertIncludes(
      `${appSource}\n${existsSync(EXPORT_HANDLERS_PATH) ? readFileSync(EXPORT_HANDLERS_PATH, "utf-8") : ""}`,
      existsSync(EXPORT_EXECUTE_HANDLERS_PATH) ? readFileSync(EXPORT_EXECUTE_HANDLERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RESOLVE_HANDLERS_PATH) ? readFileSync(EXPORT_RESOLVE_HANDLERS_PATH, "utf-8") : "",
      "extractExportFailure(appError)",
      "Export failures must preserve structured backend issue details.",
      failures,
    );
    assertIncludes(appSource, "exportFailure={lastExportFailure}", "Result card must receive the latest structured export failure.", failures);
    assertIncludes(appSource, "!failedChunkIdSet.has(chunk.chunkId) && !highRiskChunkIdSet.has(chunk.chunkId) && !isReviewDecisionResolved", "Home Diff dashboard must not double-count failed or high-risk chunks as ordinary needs-review.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function normalizeReviewDecisionsForSave", "Review decisions must preserve explicit confirmation state when saved.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "return [chunkId, \"rewrite\" as ReviewDecision];", "Saved legacy default rewrites must reload as unresolved defaults.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "if (isFailedOutputDecision(decision))", "Failed-output decisions must never hide unresolved high-risk chunks.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "return [[chunkId, \"rewrite_confirmed\" as ReviewDecision] as const];", "Explicit rewrite confirmations must be persisted distinctly from default rewrites.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "if (decision === \"source_confirmed\")", "Only explicit source confirmations should be persisted.", failures);
    assertNotIncludes(appSource, "if (decision === \"source\" || decision === \"source_confirmed\")", "Default safe-source choices must not be saved as confirmed.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "export function normalizeSavedReviewDecisionsForCompare", "Saved review decisions must be scoped to the loaded compare data.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts"), "utf-8"), "const validChunkIds = new Set(data.chunks.map((chunk) => chunk.chunkId));", "Saved review decisions must drop stale chunks without reopening handled high-risk outputs.", failures);
    assertNotIncludes(appSource, "highRiskChunkIds.has(chunkId) && decision === \"source_confirmed\" ? \"source\"", "Confirmed source choices must not re-open handled high-risk failed outputs.", failures);
    assertNotIncludes(appSource, "[chunkId]: \"rewrite\" }));", "Single rerun must not force high-risk fallback chunks to default rewrite.", failures);
    assertNotIncludes(appSource, "completedTargets.map((target) => [target.chunkId, \"rewrite\" as ReviewDecision])", "Batch rerun must not force high-risk fallback chunks to default rewrite.", failures);
    assertNotIncludes(appSource, "buildRejectedCandidateReviewDecision", "Candidate adoption decision builders must stay removed from the frontend.", failures);
    assertNotIncludes(appSource, "if (decision === \"rewrite\") return [chunkId, \"rewrite_confirmed\" as ReviewDecision];", "Default rewrite choices must not be promoted to confirmed on reload.", failures);
    assertNotIncludes(appSource, "function handleAdoptAllRejectedCandidates", "Home must not wire removed all-candidate adoption actions.", failures);
    assertNotIncludes(resultDiffSource, "onExportReviewed", "Reviewed export props must be removed from the output card.", failures);
    assertNotIncludes(resultDiffSource, "审阅 Word", "Reviewed Word export button must not return.", failures);
    assertNotIncludes(resultDiffSource, "审阅 TXT", "Reviewed TXT export button must not return.", failures);
    assertCountEquals(resultCardSource, "<RewriteDiffPanel", 1, "Full Diff panel must only be mounted by DiffReviewCard.", failures);
    assertIncludes(resultDiffSource, "Card className=\"flex h-full min-h-0", "Diff review card must use a fixed-height shadcn Card shell.", failures);
    assertIncludes(resultDiffSource, "sticky top-0 z-20", "Inline Diff toolbar must stay pinned while chunks scroll.", failures);
    assertIncludes(resultDiffSource, "ToggleGroup", "Diff filters must use shadcn ToggleGroup.", failures);
    assertIncludes(resultDiffSource, "type DiffFilterMode = \"all\" | \"review\" | \"highRisk\" | \"failed\";", "Diff filters must keep high-risk as a compact first-class mode.", failures);
    assertNotIncludes(resultDiffSource, "\"candidate\"", "Diff filters must not reintroduce the removed candidate mode.", failures);
    assertIncludes(resultDiffSource, "Empty className=\"min-h-0 flex-1 border bg-background/70\"", "Diff empty state must use shadcn Empty.", failures);
    assertIncludes(resultDiffSource, "overflow-auto whitespace-pre-wrap break-words", "Diff text panes must constrain and wrap long paragraph content.", failures);
    assertNotIncludes(resultDiffSource, "function getRejectedCandidateReasons", "Rejected candidate UI helpers must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "function buildRejectedCandidatesRerunFeedback", "Rejected candidate rerun helpers must stay removed from the UI layer.", failures);
    assertNotIncludes(resultDiffSource, "function getLatestRejectedCandidate", "Rejected candidate previews must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "function buildRejectedCandidateDecision", "Rejected candidate adoption helpers must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "T.adoptRejected", "Rejected candidate one-click adoption must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "T.highRiskCandidate", "Rejected candidate high-risk UI must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "candidateAdoptableCount", "Bulk candidate adoption state must stay removed.", failures);
    assertIncludes(resultDiffSource, "isHighRiskFailedOutputChunk", "Failed hard-validation outputs must keep a separate high-risk Diff state.", failures);
    assertIncludes(resultDiffSource, "flags.includes(\"targeted_rerun_fallback\")", "Targeted rerun hard-validation fallbacks must also surface as high-risk failed outputs.", failures);
    assertIncludes(readFileSync(resolve(ROOT_DIR, "app", "src", "lib", "diffDashboard.ts"), "utf-8"), "flags.includes(\"targeted_rerun_fallback\")", "Home Diff counters must include targeted rerun hard-validation fallbacks as high risk.", failures);
    assertIncludes(resultDiffSource, "!highRiskChunkIdSet.has(chunk.chunkId)", "Ordinary needs-review counts must not double-count high-risk failed outputs.", failures);
    assertIncludes(resultDiffSource, "高风险 {highRiskCount}", "Diff panel must expose a high-risk filter for failed model outputs.", failures);
    assertNotIncludes(
      readFileSync(CHUNK_QUALITY_DECISION_HELPERS_PATH, "utf-8"),
      "source: \"failed_output\"",
      "Failed hard-validation outputs must not expose a frontend adoption decision.",
      failures,
    );
    assertIncludes(resultDiffSource, "disabled={busy || isHighRiskFailedOutput}", "Failed hard-validation outputs must disable the adopt-rewrite action.", failures);
    assertIncludes(resultDiffSource, "失败候选不可采用", "Failed hard-validation outputs must label their blocked action explicitly.", failures);
    assertIncludes(resultDiffSource, "已强制隔离，不能采用或导出", "High-risk failed outputs must explain that they are isolated from export.", failures);
    assertIncludes(resultDiffSource, "function getChunkReviewReasons", "Needs-review chunks must render concise visible reasons.", failures);
    assertIncludes(resultDiffSource, "forceNeedsReview={needsReview}", "Diff-level review state must drive the visible quality badge.", failures);
    assertNotIncludes(resultDiffSource, "<AlertTitle>报错</AlertTitle>", "Ordinary user UI must not expose raw fallback errors.", failures);
    assertNotIncludes(resultDiffSource, "compactFeedbackText(chunk.fallbackError", "Fallback error detail must stay out of the review UI.", failures);
    assertNotIncludes(resultDiffSource, "读取本块原因与当前轮配置", "Targeted rerun UI must avoid verbose helper copy.", failures);
    assertNotIncludes(resultDiffSource, "右侧仅预览，默认不导出。", "Rejected candidate UI must avoid generic preview helper copy.", failures);
    assertNotIncludes(resultDiffSource, "模型连续输出未通过硬校验，本块没有采用不合格改写。", "Fallback UI must avoid duplicate hard-check boilerplate.", failures);
    assertNotIncludes(resultDiffSource, "重跑指令", "Manual rerun panel must not render redundant headings.", failures);
    assertNotIncludes(resultDiffSource, "候选不展示、不导出", "Rejected candidate UI must not show generic filler copy.", failures);
    assertNotIncludes(resultDiffSource, "重跑本块", "Rejected candidate action label must stay concise.", failures);
    assertNotIncludes(resultDiffSource, "function CandidateInspectionPanel", "Rejected candidate inspection panel must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "function CandidateDiffPanel", "Rejected candidate diff panel must stay removed.", failures);
    assertNotIncludes(resultDiffSource, "<Accordion type=\"single\" collapsible>", "Rejected candidate details must not return as expandable blocks.", failures);
    assertNotIncludes(resultDiffSource, "生成重跑意见", "Rejected candidate cards must not return to a vague feedback-generation button.", failures);
    assertNotIncludes(resultDiffSource, "候选输出需要人工判断", "Rejected candidate helper copy must stay concise.", failures);
    assertNotIncludes(resultDiffSource, "isDecisionForRejectedCandidate", "Rejected candidates must not expose manual adoption matching in the UI layer.", failures);
    assertNotIncludes(resultDiffSource, "确认采用候选", "Rejected candidates must not expose manual adoption copy.", failures);
    assertIncludes(resultDiffSource, "getDecisionDisplayOutput", "Main rewrite pane must render the selected review decision.", failures);
    assertIncludes(resultDiffSource, "handledDiffFocusNonceRef", "Focused Diff navigation must consume each request once.", failures);
    assertIncludes(resultDiffSource, "scrollIntoView({ behavior: \"smooth\", block: \"start\" })", "Focused Diff navigation must scroll to the target chunk.", failures);
    assertNotIncludes(resultDiffSource, "function DiffWorkbenchEntryCard", "Home must not keep a redundant open-Diff card.", failures);
  }

  if (historyCardSource) {
    assertNotIncludes(historyCardSource, "data-ui-section=\"history-governance-boundary\"", "History page must not reintroduce verbose governance boundary copy.", failures);
    assertIncludes(historyCardSource, "data-ui-section=\"history-user-summary\"", "History page must lead with user workflow outcomes.", failures);
    assertIncludes(historyCardSource, "data-ui-section=\"history-advanced-maintenance\"", "History maintenance controls must stay grouped behind an advanced section.", failures);
    assertIncludes(historyCardSource, "Card className=\"min-h-full overflow-visible\"", "History page must use shadcn Card composition.", failures);
    assertIncludes(historyCardSource + "\n" + loadSource(resolve(ROOT_DIR, "app", "src", "components", "HistoryGovernancePanels.tsx"), failures), "StatPill", "History cleanup impact must stay summarized with compact stats.", failures);
    assertNotIncludes(historyCardSource, "ImpactCard", "History page must not keep removed impact-card boilerplate.", failures);
    assertNotIncludes(historyCardSource, "<Card key={card.title}", "History governance boundary must not nest cards inside the page card.", failures);
  }

  if (themeModeMenuSource && themeModeHookSource && appIndexSource && cssSource) {
    assertIncludes(themeModeMenuSource, "DropdownMenuRadioGroup", "Theme control must use shadcn DropdownMenu radio composition.", failures);
    assertIncludes(themeModeMenuSource, "value=\"system\"", "Theme control must expose system mode.", failures);
    assertIncludes(themeModeMenuSource, "data-icon=\"inline-start\"", "Theme trigger icon must use the shadcn Button icon contract.", failures);
    assertIncludes(themeModeHookSource, "fyadr.themeMode", "Theme mode must persist in localStorage under a stable app key.", failures);
    assertIncludes(themeModeHookSource, "fyadr.themeMode.defaultDarkMigrated", "Theme mode must migrate the previous system-default preference once.", failures);
    assertIncludes(themeModeHookSource, "value === \"system\" && !migrated", "Legacy stored system theme must be treated as the old default and moved to dark.", failures);
    assertIncludes(themeModeHookSource, "const DEFAULT_THEME_MODE: ThemeMode = \"dark\"", "Theme mode must default to dark when no user preference exists.", failures);
    assertIncludes(themeModeHookSource, "prefers-color-scheme: dark", "System theme mode must listen to the OS color scheme.", failures);
    assertIncludes(themeModeHookSource, "classList.toggle(\"dark\"", "Theme mode must toggle Tailwind's dark class.", failures);
    assertIncludes(appIndexSource, "fyadr.themeMode", "Initial HTML must apply the saved/system theme before React mounts.", failures);
    assertIncludes(appIndexSource, "fyadr.themeMode.defaultDarkMigrated", "Initial HTML must migrate legacy system-default theme before React mounts.", failures);
    assertIncludes(appIndexSource, "const defaultMode = \"dark\"", "Initial HTML must default to dark before React mounts.", failures);
    assertIncludes(appIndexSource, "document.documentElement.classList.add(\"dark\")", "Initial HTML fallback must keep the app dark if theme storage throws.", failures);
    assertIncludes(cssSource, ".dark {", "Global CSS must define dark-mode semantic tokens.", failures);
    assertIncludes(cssSource, "--sidebar-background:", "Dark-mode variables must include sidebar tokens.", failures);
  }

  if (protectionMapCardSource) {
    assertIncludes(protectionMapSource, "data-ui-section=\"docx-scope-diagnostics\"", "Protection map must expose the body-scope diagnostics section for regression checks.", failures);
    assertIncludes(protectionMapSource, "<Sheet open={open}", "Full body-scope diagnostics must use a shadcn Sheet.", failures);
    assertIncludes(protectionMapSource, "<SheetTitle>正文边界完整诊断</SheetTitle>", "Body-scope diagnostics Sheet must have an accessible shadcn SheetTitle.", failures);
    assertIncludes(protectionMapSource, "BoundaryStrip", "Protection map must keep the visual body-scope boundary strip.", failures);
    assertIncludes(protectionMapSource, "ReasonGrid", "Protection map must keep compact protection reason distribution.", failures);
    assertNotIncludes(protectionMapSource, "普通段落和自动编号正文会参与改写。", "Protection map must not reintroduce verbose numbered-paragraph helper copy.", failures);
    assertNotIncludes(protectionMapSource, "只把摘要到致谢之间的正文交给模型处理", "Protection map must not reintroduce verbose rewrite-scope helper copy.", failures);
    assertNotIncludes(protectionMapSource, "<Card key={`${section.key}", "Protection map list rows must not nest shadcn Cards inside another Card.", failures);
    assertNotIncludes(protectionMapSource, "line-clamp-", "Protection map diagnostics should avoid optional Tailwind line-clamp dependencies.", failures);
  }

  if (appServiceSource && webServiceSource) {
    assertIncludes(appServiceSource, "getBackendRuntime(): Promise<BackendRuntimeInfo>;", "App service contract must expose fast backend runtime capability checks.", failures);
    assertIncludes(webServiceSource, "async getBackendRuntime(): Promise<BackendRuntimeInfo>", "Web service must implement fast backend runtime capability checks.", failures);
    assertIncludes(webServiceSource, "requestJson<BackendRuntimeInfo>(\"/api/ping\", { timeoutMs: 3_000 })", "Backend runtime check must use the fast ping endpoint instead of slow diagnostics.", failures);
    assertIncludes(appServiceSource, "getDocumentScopeDiagnostics(sourcePath: string): Promise<DocumentScopeDiagnostics>;", "App service contract must expose document-scope diagnostics.", failures);
    assertIncludes(webServiceSource, "/api/document-scope-diagnostics", "Web service must call the document-scope diagnostics API.", failures);
    assertIncludes(webServiceSource, "function formatHttpErrorMessage", "Web service must centralize HTTP error display text.", failures);
    assertIncludes(webServiceSource, "function isHtmlErrorPage", "Web service must detect HTML error pages returned by Flask or proxies.", failures);
    assertIncludes(webServiceSource, "const MAX_REWRITE_CONCURRENCY = 16;", "Web service config merge must keep the 16-way rewrite concurrency ceiling.", failures);
    assertIncludes(webServiceSource, "buildUnavailableScopeDiagnostics", "Missing document-scope diagnostics endpoints must degrade without breaking document restore.", failures);
    assertIncludes(webServiceSource, "buildEmptyHistoryArtifactQueryResponse", "Missing history artifact endpoints must degrade without showing startup errors.", failures);
    assertIncludes(webServiceSource, "isEndpointCompatibilityError", "Web service must recognize old-backend 404/405 compatibility gaps.", failures);
    assertIncludes(webServiceSource, "HTTP 405", "Web service must provide a specific friendly message for method-mismatch responses.", failures);
    assertNotIncludes(webServiceSource, "errorPayload?.message || responseText ||", "Web service must not surface raw non-JSON responseText to users.", failures);
  }

  if (modelConfigCardSource) {
    assertIncludes(modelConfigCardSource, "Tabs defaultValue=\"default\"", "Model config must use shadcn Tabs for major panes.", failures);
    assertIncludes(modelConfigCardSource, "<Tabs defaultValue=\"default\" className=\"flex h-full min-h-0 flex-col\">", "Model config tabs must wrap the full card so tab controls can live in the header.", failures);
    assertIncludes(modelConfigCardSource, "<CardHeader className=\"shrink-0 border-b px-5 py-3\">", "Model config header must stay compact after moving tab controls into the title row.", failures);
    assertIncludes(modelConfigCardSource, "TabsList className=\"grid h-9 w-full shrink-0 grid-cols-2 lg:w-[360px]\"", "Model config tabs must be compact and aligned with the card title.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"default\"", "Model config must expose default connection as the first pane.", failures);
    assertIncludes(modelConfigCardSource, "TabsTrigger value=\"providers\"", "Model config must expose provider repository as the second pane.", failures);
    assertIncludes(modelConfigSource, "ScrollArea className=\"min-h-0 flex-1\"", "Model config panes must delegate scrolling to inner panes.", failures);
    assertNotIncludes(modelConfigCardSource, "onCheckedChange={(offlineMode)", "Model config UI must not expose the removed offline-mode switch.", failures);
    assertIncludes(modelConfigCardSource, "refreshAllProviderCatalogs", "Model provider repository must support batch model catalog refresh.", failures);
    assertIncludes(modelConfigSource, "获取全部", "Model provider repository must expose batch model catalog refresh in the UI.", failures);
    assertIncludes(modelConfigCardSource, "providerCatalogAbortRef", "Provider model catalog loading must be cancellable.", failures);
    assertIncludes(modelConfigCardSource, "onListModelsForConfig(providerToModelConfig(value, provider), abortController.signal)", "Provider catalog refresh must pass an AbortSignal to the service layer.", failures);
  }

  assertNoLegacyFyClassTokens(combinedSource, "Component sources must not reintroduce old fy-* UI class tokens.", failures);
  assertNotIncludes(combinedSource, "exportReviewedRound", "Reviewed export service API must stay removed.", failures);

  if (buttonSource) {
    [
      "neutral:",
      "brand:",
      "success:",
      "warning:",
      "outlineBrand:",
      "outlineSuccess:",
      "outlineWarning:",
      "outlineDanger:",
    ].forEach((variantName) => {
      assertIncludes(buttonSource, variantName, `Button component must expose semantic variant ${variantName}.`, failures);
    });
  }

  if (badgeSource) {
    [
      "neutral:",
      "brand:",
      "info:",
      "danger:",
    ].forEach((variantName) => {
      assertIncludes(badgeSource, variantName, `Badge component must expose semantic variant ${variantName}.`, failures);
    });
  }

  [
    "bg-white/92",
    "bg-white/94",
    "space-y-",
    "rounded-3xl",
    "rounded-2xl",
  ].forEach((pattern) => {
    assertNotIncludes(combinedSource, pattern, `Avoid stale or non-shadcn class pattern: ${pattern}`, failures);
  });

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    appIndexPath: APP_INDEX_PATH,
    modelConfigCardPath: MODEL_CONFIG_CARD_PATH,
    resultCardPath: RESULT_CARD_PATH,
    historyCardPath: HISTORY_CARD_PATH,
    protectionMapCardPath: PROTECTION_MAP_CARD_PATH,
    themeModeMenuPath: THEME_MODE_MENU_PATH,
    themeModeHookPath: THEME_MODE_HOOK_PATH,
    cssPath: GLOBAL_CSS_PATH,
    buttonPath: BUTTON_PATH,
    badgePath: BADGE_PATH,
    dialogPath: DIALOG_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "shadcn shell and primitives are used",
      "home embeds output and Diff review together",
      "dialogs, drawers, and confirmations use shadcn overlays",
      "model/history/result surfaces use shadcn composition",
      "old fy utilities and stale layout classes are absent",
    ],
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf-8");
  return report;
}

const report = runRegression();
const output = JSON.stringify(report, null, 2);
if (report.ok) {
  console.log(output);
} else {
  console.error(output);
}
process.exit(report.ok ? 0 : 1);
