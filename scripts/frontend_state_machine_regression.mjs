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
const COMPONENTS_APPEND_ROUND_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "AppendRoundDialog.tsx");
const COMPONENTS_BATCH_RERUN_STATUS_ALERT_PATH = resolve(ROOT_DIR, "app", "src", "components", "BatchRerunStatusAlert.tsx");
const COMPONENTS_CHUNK_QUALITY_BAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "ChunkQualityBar.tsx");
const COMPONENTS_DIAGNOSTICS_PAGE_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPage.tsx");
const COMPONENTS_DIAGNOSTICS_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsPanels.tsx");
const COMPONENTS_DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsProblemAndChecksSection.tsx");
const COMPONENTS_DIAGNOSTICS_RUNTIME_SECTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "DiagnosticsRuntimeSections.tsx");
const COMPONENTS_EXPORT_FAILURE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportFailurePanels.tsx");
const COMPONENTS_EXPORT_HEALTH_DETAILS_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthDetailsDialog.tsx");
const COMPONENTS_EXPORT_HEALTH_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthPanels.tsx");
const COMPONENTS_EXPORT_HEALTH_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportHealthPanel.tsx");
const COMPONENTS_EXPORT_LIVE_HINT_PATH = resolve(ROOT_DIR, "app", "src", "components", "ExportLiveHint.tsx");
const COMPONENTS_HISTORY_ASSET_IMPACT_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryAssetImpactPanel.tsx");
const COMPONENTS_HISTORY_CARD_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardHeader.tsx");
const COMPONENTS_HISTORY_CARD_MAINTENANCE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardMaintenanceSection.tsx");
const COMPONENTS_HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const COMPONENTS_HISTORY_DELETE_ACTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDeleteAction.tsx");
const COMPONENTS_HISTORY_DELETE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDeletePanels.tsx");
const COMPONENTS_HISTORY_DOCUMENT_LIST_ITEM_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItemHeader.tsx");
const COMPONENTS_HISTORY_DOCUMENT_LIST_ITEM_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItem.tsx");
const COMPONENTS_HISTORY_DOCUMENT_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentList.tsx");
const COMPONENTS_HISTORY_DOCUMENT_ROUND_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundList.tsx");
const COMPONENTS_HISTORY_GOVERNANCE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryGovernancePanels.tsx");
const COMPONENTS_HISTORY_ORPHAN_GOVERNANCE_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryOrphanGovernancePanel.tsx");
const COMPONENTS_HOME_RUN_CONTROL_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunControlSection.tsx");
const COMPONENTS_HOME_RUN_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanel.tsx");
const COMPONENTS_REWRITE_DIFF_CHUNK_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffChunkCard.tsx");
const COMPONENTS_REWRITE_DIFF_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanel.tsx");
const COMPONENTS_RUN_RECOVERY_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "RunRecoveryPanel.tsx");
const COMPONENTS_SETUP_EDITOR_DIALOG_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorDialog.tsx");
const COMPONENTS_SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorModelRouteSection.tsx");
const COMPONENTS_SETUP_EDITOR_PROMPT_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "SetupEditorPromptSection.tsx");
const HOOKS_USE_ACTIVE_RUN_PROBES_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useActiveRunProbes.ts");
const HOOKS_USE_APPEND_ROUND_CONTROLS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAppendRoundControls.ts");
const HOOKS_USE_APP_BOOTSTRAP_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAppBootstrap.ts");
const HOOKS_USE_APP_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAppState.ts");
const HOOKS_USE_AUTO_SNAPSHOT_RESTORE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useAutoSnapshotRestore.ts");
const HOOKS_USE_DIFF_PANEL_SCROLL_FOCUS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDiffPanelScrollFocus.ts");
const HOOKS_USE_DOCUMENT_RESTORE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDocumentRestore.ts");
const HOOKS_USE_HISTORY_CARD_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHistoryCardState.ts");
const HOOKS_USE_HOME_RUN_PANEL_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHomeRunPanelActions.ts");
const HOOKS_USE_HOME_RUN_PANEL_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHomeRunPanelModel.ts");
const HOOKS_USE_LAZY_WORKBENCH_VIEWS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useLazyWorkbenchViews.ts");
const HOOKS_USE_NOTICE_NOTIFICATIONS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useNoticeNotifications.ts");
const HOOKS_USE_PENDING_AUTO_COUNTDOWN_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "usePendingAutoCountdown.ts");
const HOOKS_USE_RUN_SESSION_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useRunSession.ts");
const HOOKS_USE_SETUP_EDITOR_ESCAPE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useSetupEditorEscape.ts");
const HOOKS_USE_THEME_MODE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useThemeMode.ts");
const LIB_APP_OPTIONAL_UI_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appOptionalUiFeedbackHelpers.ts");
const LIB_APP_PENDING_AUTO_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appPendingAutoActionHelpers.ts");
const LIB_APP_REVIEW_DECISION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appReviewDecisionHelpers.ts");
const LIB_APP_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appService.ts");
const LIB_APP_TASK_LIFECYCLE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appTaskLifecycleHelpers.ts");
const LIB_APP_UI_SHELL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appUiShellHelpers.ts");
const LIB_AUTO_RUN_ACTION_BUILDERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunActionBuilders.ts");
const LIB_AUTO_RUN_ATTACH_PLANNING_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunAttachPlanning.ts");
const LIB_AUTO_RUN_CLEAR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunClearHandlers.ts");
const LIB_AUTO_RUN_GUARD_PLANNING_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunGuardPlanning.ts");
const LIB_AUTO_RUN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunHandlers.ts");
const LIB_AUTO_RUN_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunHandlerTypes.ts");
const LIB_AUTO_RUN_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRun.ts");
const LIB_AUTO_RUN_PERFORM_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunPerformHandlers.ts");
const LIB_AUTO_RUN_PLANNING_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunPlanning.ts");
const LIB_AUTO_RUN_RETRY_SCHEDULE_PLANNING_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunRetrySchedulePlanning.ts");
const LIB_AUTO_RUN_SCHEDULE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunScheduleHandlers.ts");
const LIB_AUTO_RUN_SCHEDULE_PLANNING_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunSchedulePlanning.ts");
const LIB_AUTO_RUN_SCOPE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunScope.ts");
const LIB_AUTO_RUN_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoRunTypes.ts");
const LIB_AUTO_SNAPSHOT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshot.ts");
const LIB_AUTO_SNAPSHOT_RESTORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreHelpers.ts");
const LIB_AUTO_SNAPSHOT_RESTORE_SESSION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreSessionHelpers.ts");
const LIB_BATCH_RERUN_ACTION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunActionHandlers.ts");
const LIB_BATCH_RERUN_ATTACH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunAttachHandlers.ts");
const LIB_BATCH_RERUN_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunCoreHandlers.ts");
const LIB_BATCH_RERUN_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunFeedbackHelpers.ts");
const LIB_BATCH_RERUN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHandlers.ts");
const LIB_BATCH_RERUN_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHandlerTypes.ts");
const LIB_BATCH_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunHelpers.ts");
const LIB_BATCH_RERUN_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "batchRerunSelectionHelpers.ts");
const LIB_DIAGNOSTICS_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsFeedbackHelpers.ts");
const LIB_DIAGNOSTICS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsHelpers.ts");
const LIB_DIAGNOSTICS_PAGE_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsPageViewModel.ts");
const LIB_DIAGNOSTICS_SHARE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsShareHelpers.ts");
const LIB_DIAGNOSTICS_TASK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diagnosticsTaskHelpers.ts");
const LIB_DIFF_DASHBOARD_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffDashboard.ts");
const LIB_DIFF_FILTER_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffFilterModel.ts");
const LIB_DOCUMENT_DIAGNOSTICS_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentDiagnosticsHandlers.ts");
const LIB_DOCUMENT_LOAD_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentLoadHandlers.ts");
const LIB_DOCUMENT_LOAD_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentLoadHandlerTypes.ts");
const LIB_DOCUMENT_MATCH_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentMatch.ts");
const LIB_DOCUMENT_PATHS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentPaths.ts");
const LIB_DOCUMENT_PICK_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentPickHandlers.ts");
const LIB_DOCUMENT_RESTORE_BOOTSTRAP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreBootstrap.ts");
const LIB_DOCUMENT_RESTORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreHelpers.ts");
const LIB_DOCUMENT_RESTORE_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreRouteHelpers.ts");
const LIB_DOCUMENT_RESTORE_SESSION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreSessionHelpers.ts");
const LIB_DOCUMENT_RESTORE_STORE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentRestoreStoreHelpers.ts");
const LIB_DOCUMENT_STATUS_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusCopy.ts");
const LIB_DOCUMENT_STATUS_PROGRESS_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusProgressCopy.ts");
const LIB_DOCUMENT_STATUS_RESET_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusResetCopy.ts");
const LIB_DOCUMENT_STATUS_SWITCH_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "documentStatusSwitchCopy.ts");
const LIB_ERROR_RECOVERY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "errorRecovery.ts");
const LIB_EXPORT_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportFailureHelpers.ts");
const LIB_EXPORT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHandlers.ts");
const LIB_EXPORT_HEALTH_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHealthViewModel.ts");
const LIB_EXPORT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHelpers.ts");
const LIB_EXPORT_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeHelpers.ts");
const LIB_EXPORT_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportRerunHelpers.ts");
const LIB_HISTORY_ARTIFACT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactHelpers.ts");
const LIB_HISTORY_CARD_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardFormatHelpers.ts");
const LIB_HISTORY_CARD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardHelpers.ts");
const LIB_HISTORY_CARD_MAINTENANCE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardMaintenanceHelpers.ts");
const LIB_HISTORY_CARD_ROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardRoundHelpers.ts");
const LIB_HISTORY_CARD_SUMMARY_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardSummaryViewModel.ts");
const LIB_HISTORY_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCoreHandlers.ts");
const LIB_HISTORY_DELETE_ACTION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteActionHandlers.ts");
const LIB_HISTORY_DELETE_ACTION_KEY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteActionKey.ts");
const LIB_HISTORY_DELETE_CONFIRM_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteConfirmCopy.ts");
const LIB_HISTORY_DELETE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteCopy.ts");
const LIB_HISTORY_DELETE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteHandlers.ts");
const LIB_HISTORY_DELETE_NOTICE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteNoticeCopy.ts");
const LIB_HISTORY_DELETE_PANELS_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeletePanelsViewModel.ts");
const LIB_HISTORY_DELETE_RUNTIME_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteRuntimeCopy.ts");
const LIB_HISTORY_DOCUMENT_LIST_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListViewModel.ts");
const LIB_HISTORY_DOCUMENT_LIST_VIEW_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListViewTypes.ts");
const LIB_HISTORY_DOCUMENT_LOAD_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentLoadHandlers.ts");
const LIB_HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentRouteHandlers.ts");
const LIB_HISTORY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlers.ts");
const LIB_HISTORY_HANDLER_DEPS_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerDepsTypes.ts");
const LIB_HISTORY_HANDLER_INPUT_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerInputTypes.ts");
const LIB_HISTORY_HANDLER_INTERFACE_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerInterfaceTypes.ts");
const LIB_HISTORY_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerTypes.ts");
const LIB_HISTORY_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHelpers.ts");
const LIB_HISTORY_LIST_GOVERNANCE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyListGovernanceHandlers.ts");
const LIB_HISTORY_LOAD_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadFeedbackHelpers.ts");
const LIB_HISTORY_LOAD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadHelpers.ts");
const LIB_HISTORY_LOAD_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadRouteHelpers.ts");
const LIB_HISTORY_MATCH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyMatchHelpers.ts");
const LIB_HISTORY_ORPHAN_REPAIR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanRepairHandlers.ts");
const LIB_HISTORY_ROUND_MATCH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyRoundMatchHelpers.ts");
const LIB_HISTORY_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historySelectionHelpers.ts");
const LIB_HOME_RUN_APPEND_CONFIG_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendConfigState.ts");
const LIB_HOME_RUN_APPEND_ROUTE_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendRouteState.ts");
const LIB_HOME_RUN_APPEND_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunAppendState.ts");
const LIB_HOME_RUN_CONTROL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunControl.ts");
const LIB_HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelPrimaryViewModel.ts");
const LIB_HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelRouteEditHelpers.ts");
const LIB_HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelRouteViewModel.ts");
const LIB_HOME_RUN_PANEL_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelState.ts");
const LIB_HOME_RUN_PANEL_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelTypes.ts");
const LIB_HOME_RUN_PANEL_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPanelViewModel.ts");
const LIB_HOME_RUN_PRIMARY_ACTION_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "homeRunPrimaryActionState.ts");
const LIB_MODEL_CATALOG_CONFIG_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogConfigHandlers.ts");
const LIB_MODEL_CATALOG_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogHandlers.ts");
const LIB_MODEL_CATALOG_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogHandlerTypes.ts");
const LIB_MODEL_CATALOG_LIST_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogListHandlers.ts");
const LIB_MODEL_CATALOG_PROVIDER_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogProviderHandlers.ts");
const LIB_MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "modelCatalogProviderTaskHandlers.ts");
const LIB_PROGRESS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "progressHelpers.ts");
const LIB_PROGRESS_MERGE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "progressMergeHelpers.ts");
const LIB_PROGRESS_PERCENT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "progressPercentHelpers.ts");
const LIB_PROMPT_CRUD_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptCrudHandlers.ts");
const LIB_PROMPT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptHandlers.ts");
const LIB_PROMPT_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptHandlerTypes.ts");
const LIB_PROMPT_REGISTRY_CORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryCore.ts");
const LIB_PROMPT_REGISTRY_DEFAULTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryDefaults.ts");
const LIB_PROMPT_REGISTRY_LABEL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryLabelHelpers.ts");
const LIB_PROMPT_REGISTRY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistry.ts");
const LIB_PROMPT_REGISTRY_PREVIEW_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryPreviewHelpers.ts");
const LIB_PROMPT_REGISTRY_RESOLVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryResolveHelpers.ts");
const LIB_PROMPT_REGISTRY_SEQUENCE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistrySequenceHelpers.ts");
const LIB_PROMPT_REGISTRY_UPDATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryUpdate.ts");
const LIB_PROMPT_REGISTRY_WORKFLOW_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRegistryWorkflowHelpers.ts");
const LIB_PROMPT_ROUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptRouteHandlers.ts");
const LIB_PROMPT_STORAGE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptStorage.ts");
const LIB_PROMPT_WORKFLOW_ROUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "promptWorkflowRouteHandlers.ts");
const LIB_PROVIDER_MODEL_CATALOG_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogHelpers.ts");
const LIB_PROVIDER_MODEL_CATALOG_PATCH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPatchHelpers.ts");
const LIB_PROVIDER_MODEL_CATALOG_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelCatalogPlanHelpers.ts");
const LIB_PROVIDER_MODEL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelHelpers.ts");
const LIB_PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshActionHelpers.ts");
const LIB_PROVIDER_MODEL_REFRESH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshHelpers.ts");
const LIB_PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelRefreshStateHelpers.ts");
const LIB_PROVIDER_MODEL_SAVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "providerModelSaveHelpers.ts");
const LIB_RESULT_CARD_EXPORT_HEALTH_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardExportHealthHelpers.ts");
const LIB_RESULT_CARD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardHelpers.ts");
const LIB_RESULT_CARD_OUTPUT_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardOutputViewModel.ts");
const LIB_RESULT_CARD_REVIEW_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardReviewHelpers.ts");
const LIB_RESULT_CARD_RISK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "resultCardRiskHelpers.ts");
const LIB_REVIEW_DECISIONS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "reviewDecisions.ts");
const LIB_REWRITE_DIFF_PANEL_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "rewriteDiffPanelViewModel.ts");
const LIB_ROUND_RESULT_BUILD_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundResultBuildHelpers.ts");
const LIB_ROUND_RESULT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundResultHelpers.ts");
const LIB_ROUND_RESULT_SNAPSHOT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "roundResultSnapshotHelpers.ts");
const LIB_RUNTIME_TASK_CENTER_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterHelpers.ts");
const LIB_RUN_FAILURE_CLASSIFY_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureClassifyPrep.ts");
const LIB_RUN_FAILURE_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailurePrep.ts");
const LIB_RUN_FAILURE_PREP_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailurePrepTypes.ts");
const LIB_RUN_FAILURE_SCHEDULE_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runFailureSchedulePrep.ts");
const LIB_RUN_LAUNCH_CONCURRENCY_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchConcurrencyPrep.ts");
const LIB_RUN_LAUNCH_CONFIG_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchConfigPrep.ts");
const LIB_RUN_LAUNCH_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchPrep.ts");
const LIB_RUN_LAUNCH_SEED_CORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchSeedCore.ts");
const LIB_RUN_LAUNCH_SEED_FEEDBACK_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchSeedFeedbackHelpers.ts");
const LIB_RUN_LAUNCH_SEED_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchSeedPlanHelpers.ts");
const LIB_RUN_LAUNCH_SEED_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchSeedPrep.ts");
const LIB_RUN_LAUNCH_SEED_RESULT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runLaunchSeedResult.ts");
const LIB_RUN_ROUND_ATTACH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundAttachHandlers.ts");
const LIB_RUN_ROUND_ATTACH_SEED_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundAttachSeedHandlers.ts");
const LIB_RUN_ROUND_CANCEL_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundCancelHandlers.ts");
const LIB_RUN_ROUND_COMPLETION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundCompletionHandlers.ts");
const LIB_RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundConfigPrepareHandlers.ts");
const LIB_RUN_ROUND_DEPS_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundDepsTypes.ts");
const LIB_RUN_ROUND_EXECUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundExecuteHandlers.ts");
const LIB_RUN_ROUND_FINISH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundFinishHandlers.ts");
const LIB_RUN_ROUND_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundHandlers.ts");
const LIB_RUN_ROUND_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundHandlerTypes.ts");
const LIB_RUN_ROUND_INPUT_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundInputTypes.ts");
const LIB_RUN_ROUND_INTERFACE_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundInterfaceTypes.ts");
const LIB_RUN_ROUND_LAUNCH_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundLaunchHandlers.ts");
const LIB_RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundLaunchPrepareHandlers.ts");
const LIB_RUN_ROUND_PREPARE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundPrepareHandlers.ts");
const LIB_RUN_ROUND_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundPrep.ts");
const LIB_RUN_ROUND_PROGRESS_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressHandlers.ts");
const LIB_RUN_ROUND_PROGRESS_PREP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundProgressPrep.ts");
const LIB_RUN_ROUND_RESET_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundResetHandlers.ts");
const LIB_RUN_ROUND_SESSION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSessionHandlers.ts");
const LIB_RUN_ROUND_SNAPSHOT_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundSnapshotHandlers.ts");
const LIB_RUN_ROUND_START_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundStartHandlers.ts");
const LIB_RUN_ROUND_START_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRoundStartHandlerTypes.ts");
const LIB_TASK_STATE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "taskState.ts");
const LIB_WEB_SERVICE_COMPAT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceCompat.ts");
const LIB_WEB_SERVICE_DOCUMENTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceDocuments.ts");
const LIB_WEB_SERVICE_EXPORT_HEADERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportHeaders.ts");
const LIB_WEB_SERVICE_EXPORT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExport.ts");
const LIB_WEB_SERVICE_EXPORT_RESULT_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceExportResult.ts");
const LIB_WEB_SERVICE_FILES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFiles.ts");
const LIB_WEB_SERVICE_FILE_PICKER_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFilePicker.ts");
const LIB_WEB_SERVICE_FILE_SIZE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceFileSizeHelpers.ts");
const LIB_WEB_SERVICE_HEALTH_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHealth.ts");
const LIB_WEB_SERVICE_HISTORY_API_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHistoryApi.ts");
const LIB_WEB_SERVICE_HTTP_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceHttp.ts");
const LIB_WEB_SERVICE_MODEL_CONFIG_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModelConfig.ts");
const LIB_WEB_SERVICE_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceModel.ts");
const LIB_WEB_SERVICE_PROMPTS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServicePrompts.ts");
const LIB_WEB_SERVICE_ROUNDS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRounds.ts");
const LIB_WEB_SERVICE_RUN_STREAM_LIFECYCLE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunStreamLifecycle.ts");
const LIB_WEB_SERVICE_RUN_STREAM_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webServiceRunStream.ts");
const RESULT_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "ResultCard.tsx");
const WEB_SERVICE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "webService.ts");
const LIB_STORAGE_KEYS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "storageKeys.ts");
const LIB_RUNTIME_PROGRESS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeProgress.ts");
const LIB_RUN_RECOVERY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runRecovery.ts");
const COMPONENTS_AUTO_RUN_SIGNAL_PATH = resolve(ROOT_DIR, "app", "src", "components", "AutoRunSignal.tsx");
const COMPONENTS_ROUND_RUN_STATUS_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "RoundRunStatusCard.tsx");
const RUNTIME_TASK_CENTER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterTypes.ts");
const RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterActiveHelpers.ts");
const RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterPhaseHelpers.ts");
const RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterDiffHelpers.ts");
const RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "runtimeTaskCenterBackgroundHelpers.ts");
const APP_NOTIFICATION_STATUS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "appNotificationStatusHelpers.ts");
const HOME_RUN_PANEL_DIALOGS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HomeRunPanelDialogs.tsx");
const HISTORY_CARD_SUMMARY_PILLS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardSummaryPills.tsx");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_state_machine_regression_report.json");

function loadOptional(path) {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

function joinSources(paths) {
  return paths.map((path) => loadOptional(path)).filter(Boolean).join("\n");
}

function extractFunctionSource(source, functionName) {
  const candidates = [
    `async function ${functionName}(`,
    `function ${functionName}(`,
    `const ${functionName} = useCallback(`,
    `const ${functionName} = async (`,
    `const ${functionName} = (`,
  ];
  let start = -1;
  for (const signature of candidates) {
    start = source.indexOf(signature);
    if (start >= 0) break;
  }
  if (start < 0) {
    // Fallback: return whole source so substring asserts can still pass via appSource
    return source;
  }
  const bodyStart = source.indexOf("{", start);
  if (bodyStart < 0) {
    return source.slice(start);
  }
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  return source.slice(start);
}

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

function assertRegex(source, pattern, message, failures) {
  if (!pattern.test(source)) {
    failures.push(message);
  }
}

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  if (!existsSync(WEB_SERVICE_PATH)) {
    failures.push(`Missing webService.ts: ${WEB_SERVICE_PATH}`);
  }
  if (!existsSync(RESULT_CARD_PATH)) {
    failures.push(`Missing ResultCard.tsx: ${RESULT_CARD_PATH}`);
  }
  const appSource = failures.length ? "" : joinSources([
    APP_PATH,
    HOOKS_USE_ACTIVE_RUN_PROBES_PATH,
    HOOKS_USE_APPEND_ROUND_CONTROLS_PATH,
    HOOKS_USE_APP_BOOTSTRAP_PATH,
    HOOKS_USE_APP_STATE_PATH,
    HOOKS_USE_AUTO_SNAPSHOT_RESTORE_PATH,
    HOOKS_USE_DIFF_PANEL_SCROLL_FOCUS_PATH,
    HOOKS_USE_DOCUMENT_RESTORE_PATH,
    HOOKS_USE_HISTORY_CARD_STATE_PATH,
    HOOKS_USE_HOME_RUN_PANEL_ACTIONS_PATH,
    HOOKS_USE_HOME_RUN_PANEL_MODEL_PATH,
    HOOKS_USE_LAZY_WORKBENCH_VIEWS_PATH,
    HOOKS_USE_NOTICE_NOTIFICATIONS_PATH,
    HOOKS_USE_PENDING_AUTO_COUNTDOWN_PATH,
    HOOKS_USE_RUN_SESSION_PATH,
    HOOKS_USE_SETUP_EDITOR_ESCAPE_PATH,
    HOOKS_USE_THEME_MODE_PATH,
    LIB_APP_OPTIONAL_UI_FEEDBACK_HELPERS_PATH,
    LIB_APP_PENDING_AUTO_ACTION_HELPERS_PATH,
    LIB_APP_REVIEW_DECISION_HELPERS_PATH,
    LIB_APP_SERVICE_PATH,
    LIB_APP_TASK_LIFECYCLE_HELPERS_PATH,
    LIB_APP_UI_SHELL_HELPERS_PATH,
    LIB_AUTO_RUN_ACTION_BUILDERS_PATH,
    LIB_AUTO_RUN_ATTACH_PLANNING_PATH,
    LIB_AUTO_RUN_CLEAR_HANDLERS_PATH,
    LIB_AUTO_RUN_GUARD_PLANNING_PATH,
    LIB_AUTO_RUN_HANDLERS_PATH,
    LIB_AUTO_RUN_HANDLER_TYPES_PATH,
    LIB_AUTO_RUN_PATH,
    LIB_AUTO_RUN_PERFORM_HANDLERS_PATH,
    LIB_AUTO_RUN_PLANNING_PATH,
    LIB_AUTO_RUN_RETRY_SCHEDULE_PLANNING_PATH,
    LIB_AUTO_RUN_SCHEDULE_HANDLERS_PATH,
    LIB_AUTO_RUN_SCHEDULE_PLANNING_PATH,
    LIB_AUTO_RUN_SCOPE_PATH,
    LIB_AUTO_RUN_TYPES_PATH,
    LIB_AUTO_SNAPSHOT_PATH,
    LIB_AUTO_SNAPSHOT_RESTORE_HELPERS_PATH,
    LIB_AUTO_SNAPSHOT_RESTORE_SESSION_HELPERS_PATH,
    LIB_BATCH_RERUN_ACTION_HANDLERS_PATH,
    LIB_BATCH_RERUN_ATTACH_HANDLERS_PATH,
    LIB_BATCH_RERUN_CORE_HANDLERS_PATH,
    LIB_BATCH_RERUN_FEEDBACK_HELPERS_PATH,
    LIB_BATCH_RERUN_HANDLERS_PATH,
    LIB_BATCH_RERUN_HANDLER_TYPES_PATH,
    LIB_BATCH_RERUN_HELPERS_PATH,
    LIB_BATCH_RERUN_SELECTION_HELPERS_PATH,
    LIB_DIAGNOSTICS_FEEDBACK_HELPERS_PATH,
    LIB_DIAGNOSTICS_HELPERS_PATH,
    LIB_DIAGNOSTICS_PAGE_VIEW_MODEL_PATH,
    LIB_DIAGNOSTICS_SHARE_HELPERS_PATH,
    LIB_DIAGNOSTICS_TASK_HELPERS_PATH,
    LIB_DIFF_DASHBOARD_PATH,
    LIB_DOCUMENT_DIAGNOSTICS_HANDLERS_PATH,
    LIB_DOCUMENT_LOAD_HANDLERS_PATH,
    LIB_DOCUMENT_LOAD_HANDLER_TYPES_PATH,
    LIB_DOCUMENT_MATCH_PATH,
    LIB_DOCUMENT_PATHS_PATH,
    LIB_DOCUMENT_PICK_HANDLERS_PATH,
    LIB_DOCUMENT_RESTORE_BOOTSTRAP_PATH,
    LIB_DOCUMENT_RESTORE_HELPERS_PATH,
    LIB_DOCUMENT_RESTORE_ROUTE_HELPERS_PATH,
    LIB_DOCUMENT_RESTORE_SESSION_HELPERS_PATH,
    LIB_DOCUMENT_RESTORE_STORE_HELPERS_PATH,
    LIB_DOCUMENT_STATUS_COPY_PATH,
    LIB_DOCUMENT_STATUS_PROGRESS_COPY_PATH,
    LIB_DOCUMENT_STATUS_RESET_COPY_PATH,
    LIB_DOCUMENT_STATUS_SWITCH_COPY_PATH,
    LIB_ERROR_RECOVERY_PATH,
    LIB_EXPORT_FAILURE_HELPERS_PATH,
    LIB_EXPORT_HANDLERS_PATH,
    LIB_EXPORT_HEALTH_VIEW_MODEL_PATH,
    LIB_EXPORT_HELPERS_PATH,
    LIB_EXPORT_NOTICE_HELPERS_PATH,
    LIB_EXPORT_RERUN_HELPERS_PATH,
    LIB_HISTORY_ARTIFACT_HELPERS_PATH,
    LIB_HISTORY_CARD_FORMAT_HELPERS_PATH,
    LIB_HISTORY_CARD_HELPERS_PATH,
    LIB_HISTORY_CARD_MAINTENANCE_HELPERS_PATH,
    LIB_HISTORY_CARD_ROUND_HELPERS_PATH,
    LIB_HISTORY_CARD_SUMMARY_VIEW_MODEL_PATH,
    LIB_HISTORY_CORE_HANDLERS_PATH,
    LIB_HISTORY_DELETE_ACTION_HANDLERS_PATH,
    LIB_HISTORY_DELETE_ACTION_KEY_PATH,
    LIB_HISTORY_DELETE_CONFIRM_COPY_PATH,
    LIB_HISTORY_DELETE_COPY_PATH,
    LIB_HISTORY_DELETE_HANDLERS_PATH,
    LIB_HISTORY_DELETE_NOTICE_COPY_PATH,
    LIB_HISTORY_DELETE_PANELS_VIEW_MODEL_PATH,
    LIB_HISTORY_DELETE_RUNTIME_COPY_PATH,
    LIB_HISTORY_DOCUMENT_LIST_VIEW_MODEL_PATH,
    LIB_HISTORY_DOCUMENT_LIST_VIEW_TYPES_PATH,
    LIB_HISTORY_DOCUMENT_LOAD_HANDLERS_PATH,
    LIB_HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH,
    LIB_HISTORY_HANDLERS_PATH,
    LIB_HISTORY_HANDLER_DEPS_TYPES_PATH,
    LIB_HISTORY_HANDLER_INPUT_TYPES_PATH,
    LIB_HISTORY_HANDLER_INTERFACE_TYPES_PATH,
    LIB_HISTORY_HANDLER_TYPES_PATH,
    LIB_HISTORY_HELPERS_PATH,
    LIB_HISTORY_LIST_GOVERNANCE_HANDLERS_PATH,
    LIB_HISTORY_LOAD_FEEDBACK_HELPERS_PATH,
    LIB_HISTORY_LOAD_HELPERS_PATH,
    LIB_HISTORY_LOAD_ROUTE_HELPERS_PATH,
    LIB_HISTORY_MATCH_HELPERS_PATH,
    LIB_HISTORY_ORPHAN_REPAIR_HANDLERS_PATH,
    LIB_HISTORY_ROUND_MATCH_HELPERS_PATH,
    LIB_HISTORY_SELECTION_HELPERS_PATH,
    LIB_HOME_RUN_APPEND_CONFIG_STATE_PATH,
    LIB_HOME_RUN_APPEND_ROUTE_STATE_PATH,
    LIB_HOME_RUN_APPEND_STATE_PATH,
    LIB_HOME_RUN_CONTROL_PATH,
    LIB_HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_STATE_PATH,
    LIB_HOME_RUN_PANEL_TYPES_PATH,
    LIB_HOME_RUN_PANEL_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PRIMARY_ACTION_STATE_PATH,
    LIB_MODEL_CATALOG_CONFIG_HANDLERS_PATH,
    LIB_MODEL_CATALOG_HANDLERS_PATH,
    LIB_MODEL_CATALOG_HANDLER_TYPES_PATH,
    LIB_MODEL_CATALOG_LIST_HANDLERS_PATH,
    LIB_MODEL_CATALOG_PROVIDER_HANDLERS_PATH,
    LIB_MODEL_CATALOG_PROVIDER_TASK_HANDLERS_PATH,
    LIB_PROGRESS_HELPERS_PATH,
    LIB_PROGRESS_MERGE_HELPERS_PATH,
    LIB_PROGRESS_PERCENT_HELPERS_PATH,
    LIB_PROMPT_CRUD_HANDLERS_PATH,
    LIB_PROMPT_HANDLERS_PATH,
    LIB_PROMPT_HANDLER_TYPES_PATH,
    LIB_PROMPT_REGISTRY_CORE_PATH,
    LIB_PROMPT_REGISTRY_DEFAULTS_PATH,
    LIB_PROMPT_REGISTRY_LABEL_HELPERS_PATH,
    LIB_PROMPT_REGISTRY_PATH,
    LIB_PROMPT_REGISTRY_PREVIEW_HELPERS_PATH,
    LIB_PROMPT_REGISTRY_RESOLVE_HELPERS_PATH,
    LIB_PROMPT_REGISTRY_SEQUENCE_HELPERS_PATH,
    LIB_PROMPT_REGISTRY_UPDATE_PATH,
    LIB_PROMPT_REGISTRY_WORKFLOW_HELPERS_PATH,
    LIB_PROMPT_ROUTE_HANDLERS_PATH,
    LIB_PROMPT_STORAGE_PATH,
    LIB_PROMPT_WORKFLOW_ROUTE_HANDLERS_PATH,
    LIB_PROVIDER_MODEL_CATALOG_HELPERS_PATH,
    LIB_PROVIDER_MODEL_CATALOG_PATCH_HELPERS_PATH,
    LIB_PROVIDER_MODEL_CATALOG_PLAN_HELPERS_PATH,
    LIB_PROVIDER_MODEL_HELPERS_PATH,
    LIB_PROVIDER_MODEL_REFRESH_ACTION_HELPERS_PATH,
    LIB_PROVIDER_MODEL_REFRESH_HELPERS_PATH,
    LIB_PROVIDER_MODEL_REFRESH_STATE_HELPERS_PATH,
    LIB_PROVIDER_MODEL_SAVE_HELPERS_PATH,
    LIB_RESULT_CARD_EXPORT_HEALTH_HELPERS_PATH,
    LIB_RESULT_CARD_HELPERS_PATH,
    LIB_RESULT_CARD_OUTPUT_VIEW_MODEL_PATH,
    LIB_RESULT_CARD_REVIEW_HELPERS_PATH,
    LIB_RESULT_CARD_RISK_HELPERS_PATH,
    LIB_REVIEW_DECISIONS_PATH,
    LIB_ROUND_RESULT_BUILD_HELPERS_PATH,
    LIB_ROUND_RESULT_HELPERS_PATH,
    LIB_ROUND_RESULT_SNAPSHOT_HELPERS_PATH,
    LIB_RUNTIME_TASK_CENTER_HELPERS_PATH,
    LIB_RUN_FAILURE_CLASSIFY_PREP_PATH,
    LIB_RUN_FAILURE_PREP_PATH,
    LIB_RUN_FAILURE_PREP_TYPES_PATH,
    LIB_RUN_FAILURE_SCHEDULE_PREP_PATH,
    LIB_RUN_LAUNCH_CONCURRENCY_PREP_PATH,
    LIB_RUN_LAUNCH_CONFIG_PREP_PATH,
    LIB_RUN_LAUNCH_PREP_PATH,
    LIB_RUN_LAUNCH_SEED_CORE_PATH,
    LIB_RUN_LAUNCH_SEED_FEEDBACK_HELPERS_PATH,
    LIB_RUN_LAUNCH_SEED_PLAN_HELPERS_PATH,
    LIB_RUN_LAUNCH_SEED_PREP_PATH,
    LIB_RUN_LAUNCH_SEED_RESULT_PATH,
    LIB_RUN_ROUND_ATTACH_HANDLERS_PATH,
    LIB_RUN_ROUND_ATTACH_SEED_HANDLERS_PATH,
    LIB_RUN_ROUND_CANCEL_HANDLERS_PATH,
    LIB_RUN_ROUND_COMPLETION_HANDLERS_PATH,
    LIB_RUN_ROUND_CONFIG_PREPARE_HANDLERS_PATH,
    LIB_RUN_ROUND_DEPS_TYPES_PATH,
    LIB_RUN_ROUND_EXECUTE_HANDLERS_PATH,
    LIB_RUN_ROUND_FINISH_HANDLERS_PATH,
    LIB_RUN_ROUND_HANDLERS_PATH,
    LIB_RUN_ROUND_HANDLER_TYPES_PATH,
    LIB_RUN_ROUND_INPUT_TYPES_PATH,
    LIB_RUN_ROUND_INTERFACE_TYPES_PATH,
    LIB_RUN_ROUND_LAUNCH_HANDLERS_PATH,
    LIB_RUN_ROUND_LAUNCH_PREPARE_HANDLERS_PATH,
    LIB_RUN_ROUND_PREPARE_HANDLERS_PATH,
    LIB_RUN_ROUND_PREP_PATH,
    LIB_RUN_ROUND_PROGRESS_HANDLERS_PATH,
    LIB_RUN_ROUND_PROGRESS_PREP_PATH,
    LIB_RUN_ROUND_RESET_HANDLERS_PATH,
    LIB_RUN_ROUND_SESSION_HANDLERS_PATH,
    LIB_RUN_ROUND_SNAPSHOT_HANDLERS_PATH,
    LIB_RUN_ROUND_START_HANDLERS_PATH,
    LIB_RUN_ROUND_START_HANDLER_TYPES_PATH,
    LIB_TASK_STATE_PATH,
    COMPONENTS_APPEND_ROUND_DIALOG_PATH,
    COMPONENTS_HOME_RUN_CONTROL_SECTION_PATH,
    COMPONENTS_HOME_RUN_PANEL_PATH,
    COMPONENTS_RUN_RECOVERY_PANEL_PATH,
    COMPONENTS_SETUP_EDITOR_DIALOG_PATH,
    COMPONENTS_SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH,
    COMPONENTS_SETUP_EDITOR_PROMPT_SECTION_PATH,
    HOOKS_USE_APPEND_ROUND_CONTROLS_PATH,
    HOOKS_USE_HOME_RUN_PANEL_ACTIONS_PATH,
    HOOKS_USE_HOME_RUN_PANEL_MODEL_PATH,
    HOOKS_USE_SETUP_EDITOR_ESCAPE_PATH,
    LIB_HOME_RUN_APPEND_CONFIG_STATE_PATH,
    LIB_HOME_RUN_APPEND_ROUTE_STATE_PATH,
    LIB_HOME_RUN_APPEND_STATE_PATH,
    LIB_HOME_RUN_CONTROL_PATH,
    LIB_HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_STATE_PATH,
    LIB_HOME_RUN_PANEL_TYPES_PATH,
    LIB_HOME_RUN_PANEL_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PRIMARY_ACTION_STATE_PATH,
    COMPONENTS_HISTORY_ASSET_IMPACT_PANEL_PATH,
    COMPONENTS_HISTORY_CARD_PATH,
    COMPONENTS_HISTORY_CARD_HEADER_PATH,
    COMPONENTS_HISTORY_CARD_MAINTENANCE_SECTION_PATH,
    COMPONENTS_HISTORY_DELETE_ACTION_PATH,
    COMPONENTS_HISTORY_DELETE_PANELS_PATH,
    COMPONENTS_HISTORY_DOCUMENT_LIST_PATH,
    COMPONENTS_HISTORY_DOCUMENT_LIST_ITEM_PATH,
    COMPONENTS_HISTORY_DOCUMENT_LIST_ITEM_HEADER_PATH,
    COMPONENTS_HISTORY_DOCUMENT_ROUND_LIST_PATH,
    COMPONENTS_HISTORY_GOVERNANCE_PANELS_PATH,
    COMPONENTS_HISTORY_ORPHAN_GOVERNANCE_PANEL_PATH,
    HOOKS_USE_HISTORY_CARD_STATE_PATH,
    COMPONENTS_DIAGNOSTICS_PAGE_PATH,
    COMPONENTS_DIAGNOSTICS_PANELS_PATH,
    COMPONENTS_DIAGNOSTICS_PROBLEM_AND_CHECKS_SECTION_PATH,
    COMPONENTS_DIAGNOSTICS_RUNTIME_SECTIONS_PATH,
    LIB_DIAGNOSTICS_FEEDBACK_HELPERS_PATH,
    LIB_DIAGNOSTICS_HELPERS_PATH,
    LIB_DIAGNOSTICS_PAGE_VIEW_MODEL_PATH,
    LIB_DIAGNOSTICS_SHARE_HELPERS_PATH,
    LIB_DIAGNOSTICS_TASK_HELPERS_PATH,
    LIB_STORAGE_KEYS_PATH,
    LIB_RUNTIME_PROGRESS_PATH,
    LIB_RUN_RECOVERY_PATH,
    COMPONENTS_AUTO_RUN_SIGNAL_PATH,
    COMPONENTS_ROUND_RUN_STATUS_CARD_PATH,
    RUNTIME_TASK_CENTER_TYPES_PATH,
    RUNTIME_TASK_CENTER_ACTIVE_HELPERS_PATH,
    RUNTIME_TASK_CENTER_PHASE_HELPERS_PATH,
    RUNTIME_TASK_CENTER_DIFF_HELPERS_PATH,
    RUNTIME_TASK_CENTER_BACKGROUND_HELPERS_PATH,
    APP_NOTIFICATION_STATUS_HELPERS_PATH,
    HOME_RUN_PANEL_DIALOGS_PATH,
    HISTORY_CARD_SUMMARY_PILLS_PATH,
    DIFF_PANEL_SCROLL_FOCUS_HELPERS_PATH,
    EXPORT_NOTICE_FORMAT_HELPERS_PATH,
    EXPORT_NOTICE_ERROR_HELPERS_PATH,
    EXPORT_NOTICE_ACTION_HELPERS_PATH,
    MODEL_ROUTE_SEQUENCE_HELPERS_PATH,
    MODEL_ROUTE_PROVIDER_HELPERS_PATH,
    APP_BOOTSTRAP_CONFIG_HELPERS_PATH,
    APP_BOOTSTRAP_HISTORY_HELPERS_PATH,
    HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH,
    HOME_RUN_APPEND_ISSUE_HELPERS_PATH,
    HISTORY_DOCUMENT_ROUND_CARD_PATH,
    RESULT_CARD_EXPORT_ACTIONS_PATH,
    HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH,
    REWRITE_DIFF_PANEL_TOOLBAR_PATH,
    SETUP_EDITOR_MODEL_ROUTE_SUMMARY_PATH,
    SETUP_EDITOR_MODEL_ROUTE_ROUND_CARD_PATH,
    CHUNK_QUALITY_DECISION_HELPERS_PATH,
    HISTORY_ARTIFACT_ROW_PATH,
    REWRITE_DIFF_PANEL_COPY_PATH,
    REWRITE_DIFF_PANEL_FILTER_VIEW_MODEL_PATH,
    REWRITE_DIFF_PANEL_CHUNK_VIEW_MODEL_PATH,
    RESULT_CARD_TOKEN_HELPERS_PATH,
    RESULT_CARD_FORMAT_HELPERS_PATH,
    RESULT_CARD_DECISION_HELPERS_PATH,
    PROVIDER_MODEL_CATALOG_PATCH_CORE_PATH,
    PROVIDER_MODEL_CATALOG_NOTICE_HELPERS_PATH,
    DIAGNOSTICS_WORKSPACE_AND_CONFIG_SECTION_PATH,
    DIAGNOSTICS_TASK_SECTIONS_PATH,
    RUN_FAILURE_SCHEDULE_BUILDERS_PATH,
    RUN_FAILURE_SCHEDULE_PLAN_PATH,
    HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH,
    APP_WORKBENCH_SHELL_HANDLERS_PATH,
    RUN_ROUND_FAILURE_COMPLETION_HANDLERS_PATH,
    RUN_ROUND_SUCCESS_COMPLETION_HANDLERS_PATH,
    MODEL_DEFAULT_CONNECTION_FORM_PATH,
    MODEL_DEFAULT_CONNECTION_ACTIONS_PATH,
    HOME_RUN_CONTROL_STATUS_BLOCK_PATH,
    HOME_RUN_CONTROL_ACTION_BUTTONS_PATH,
    APP_CLEAR_PENDING_HANDLERS_PATH,
    RUN_SESSION_TYPES_PATH,
    RUN_SESSION_HELPERS_PATH,
    AUTO_RUN_ACTION_FORMAT_HELPERS_PATH,
    AUTO_RUN_ACTION_BUILD_HELPERS_PATH,
    DIAGNOSTICS_SHARE_CORE_HELPERS_PATH,
    DIAGNOSTICS_SHARE_RUN_HELPERS_PATH,
    RESULT_CARD_SM_WRAPPERS_PATH,
    BATCH_RERUN_MATERIALIZE_HANDLERS_PATH,
    BATCH_RERUN_WAIT_HANDLERS_PATH,
    HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH,
    HISTORY_CARD_MAINTENANCE_STATS_HELPERS_PATH,
    RUN_ROUND_SNAPSHOT_APPLY_HANDLERS_PATH,
    RUN_ROUND_SNAPSHOT_LOAD_HANDLERS_PATH,
    SIDEBAR_RUNTIME_PROGRESS_PATH,
    PROTECTION_MAP_EMPTY_STATE_PATH,
    APP_TASK_LIFECYCLE_HANDLERS_PATH,
    APP_DOCUMENT_HANDLERS_PATH,
    RUN_ROUND_PROGRESS_VIEW_PREP_PATH,
    RUN_ROUND_PROGRESS_FEEDBACK_PREP_PATH,
    MODEL_ROUTE_ROUND_PROVIDER_HELPERS_PATH,
    MODEL_ROUTE_DEFAULT_ISSUE_HELPERS_PATH,
    APP_REVIEW_REFRESH_HANDLERS_PATH,
    HISTORY_DELETE_APPLY_HANDLERS_PATH,
    HISTORY_DELETE_PREVIEW_HANDLERS_PATH,
    CHUNK_QUALITY_BAR_COPY_PATH,
    HISTORY_ORPHAN_SCAN_HANDLERS_PATH,
    HISTORY_DATABASE_REPAIR_HANDLERS_PATH,
    WEB_SERVICE_RUN_ROUND_API_PATH,
    WEB_SERVICE_ROUND_IO_API_PATH,
    WEB_SERVICE_PROMPT_CORE_API_PATH,
    WEB_SERVICE_PROMPT_WORKFLOW_API_PATH,
    MODEL_PROVIDER_LIST_PANEL_PATH,
    PROTECTION_MAP_STRIP_PATH,
    PROTECTION_MAP_REASON_GRID_PATH,
    PROTECTION_MAP_SECTION_ROW_PATH,
    PROVIDER_MODEL_CATALOG_PLAN_UI_HELPERS_PATH,
    PROVIDER_MODEL_CATALOG_PLAN_PATCH_HELPERS_PATH,
    AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH,
    AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH,
    DIAGNOSTICS_TASK_ACCESS_HELPERS_PATH,
    DIAGNOSTICS_TASK_BUILD_HELPERS_PATH,
    DOCUMENT_STATUS_RESET_PLAN_HELPERS_PATH,
    DOCUMENT_STATUS_RESET_NOTICE_HELPERS_PATH,
    BATCH_RERUN_DECISION_HELPERS_PATH,
    BATCH_RERUN_NOTICE_HELPERS_PATH,
    HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH,
    HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH,
    ACTIVE_RUN_PROBE_HELPERS_PATH,
    DIFF_PANEL_SCROLL_POSITION_STORE_PATH,
    DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH,
    REWRITE_DIFF_PANEL_ALERTS_PATH,
    REWRITE_DIFF_PANEL_EMPTY_PATH,
    HOME_RUN_SETUP_EDITOR_DIALOG_SHELL_PATH,
    HOME_RUN_APPEND_ROUND_DIALOG_SHELL_PATH,
    DOCUMENT_RESTORE_EFFECT_HELPERS_PATH,
    PROMPT_PREVIEW_DRAFT_HELPERS_PATH,
    PROMPT_PREVIEW_ACTION_HELPERS_PATH,
    REWRITE_DIFF_CHUNK_ALERTS_PATH,
    DIFF_REVIEW_CARD_PATH,
    RESULT_CARD_COPY_PATH,
    DIAGNOSTICS_PAGE_HEADER_PATH,
    AUTO_SNAPSHOT_RESTORE_EFFECT_HELPERS_PATH,
    HISTORY_ARTIFACT_QUERY_HELPERS_PATH,
    HISTORY_ARTIFACT_REPAIR_HELPERS_PATH,
    HOME_RUN_PRIMARY_BUTTON_HELPERS_PATH,
    HOME_RUN_PRIMARY_ACTION_DERIVE_HELPERS_PATH,
    DOCUMENT_RESTORE_SESSION_SUCCESS_HELPERS_PATH,
    DOCUMENT_RESTORE_SESSION_FAILURE_HELPERS_PATH,
    MODEL_PROVIDER_IDENTITY_FIELDS_PATH,
    MODEL_PROVIDER_PARAM_FIELDS_PATH,
    HISTORY_DOCUMENT_ROUND_HEADER_PATH,
    USE_DIFF_PANEL_FILTER_EFFECTS_PATH,
    USE_DIFF_PANEL_SCROLL_EFFECTS_PATH,
    USE_PROMPT_PREVIEW_DRAFT_STATE_PATH,
    USE_MODEL_CONFIG_PROVIDER_CATALOG_PATH,
    SETUP_EDITOR_DIALOG_BODY_PATH,
    HOME_RUN_APPEND_ROUTE_OPTION_HELPERS_PATH,
    HOME_RUN_APPEND_DRAFT_HELPERS_PATH,
    ROUND_RUN_STATUS_VIEW_MODEL_PATH,
    ROUND_RUN_STATUS_STATS_PATH,
    APPEND_ROUND_DIALOG_FIELDS_PATH,
    HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH,
    REWRITE_DIFF_TEXT_PANE_PATH,
    HISTORY_CARD_BODY_PATH,
    HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH,
    USE_DOCUMENT_RESTORE_REFS_PATH,
    WEB_SERVICE_HTTP_ERROR_HELPERS_PATH,
    HISTORY_LOAD_NOTICE_HELPERS_PATH,
    HISTORY_LOAD_PLAN_HELPERS_PATH,
    EXPORT_RESOLVE_HANDLERS_PATH,
    EXPORT_EXECUTE_HANDLERS_PATH,
    AUTO_RUN_SCHEDULE_CORE_HANDLERS_PATH,
    AUTO_RUN_FAILURE_REFRESH_HANDLERS_PATH,
    WEB_SERVICE_MODEL_CONFIG_SECRETS_PATH,
    HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH,
    HISTORY_DELETE_RESULT_NOTICE_COPY_PATH,
    HISTORY_LOAD_ROUTE_RESOLVE_HELPERS_PATH,
    HISTORY_LOAD_SNAPSHOT_SELECTION_HELPERS_PATH,
    RUN_ROUND_SESSION_START_HANDLERS_PATH,
    RUN_ROUND_SESSION_AWAIT_HANDLERS_PATH,
    HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH,
    USE_RUN_SESSION_RUN_CONTROLS_PATH,
    USE_RUN_SESSION_BATCH_CONTROLS_PATH,
    CHUNK_QUALITY_META_PATH,
    CHUNK_QUALITY_ACTIONS_PATH,
    USE_DIFF_PANEL_SCROLL_RESTORE_EFFECTS_PATH,
    USE_DIFF_PANEL_FOCUS_SCROLL_EFFECTS_PATH,
    HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH,
    USE_ACTIVE_RUN_PROBE_EFFECT_PATH,
    USE_ACTIVE_BATCH_RERUN_PROBE_EFFECT_PATH,
    USE_PROMPT_PREVIEW_FORM_STATE_PATH,
    REWRITE_DIFF_PANEL_CHUNK_LIST_PATH,
    HISTORY_CARD_BODY_TYPES_PATH,
    APPEND_ROUND_CONTROL_HELPERS_PATH,
    HISTORY_CARD_PROPS_PATH,
    DOCUMENT_RESTORE_HOOK_TYPES_PATH,
    DOCUMENT_RESTORE_EFFECT_RUNNER_PATH,
    AUTO_SNAPSHOT_RESTORE_HOOK_TYPES_PATH,
    USE_AUTO_SNAPSHOT_RESTORE_REFS_PATH,
    HISTORY_DOCUMENT_SHARED_TYPES_PATH,
    REWRITE_DIFF_PANEL_PROPS_PATH,
    USE_REWRITE_DIFF_PANEL_MODEL_PATH,
    MODEL_CONFIG_CARD_PROPS_PATH,
    RESULT_CARD_PROPS_PATH,
    SETUP_EDITOR_DIALOG_BODY_PROPS_PATH,
    PROMPT_PREVIEW_DRAFT_ACTION_FACTORY_PATH
  ]);
  const resultCardSource = failures.length ? "" : joinSources([
    COMPONENTS_BATCH_RERUN_STATUS_ALERT_PATH,
    COMPONENTS_CHUNK_QUALITY_BAR_PATH,
    COMPONENTS_EXPORT_FAILURE_PANELS_PATH,
    COMPONENTS_EXPORT_HEALTH_DETAILS_DIALOG_PATH,
    COMPONENTS_EXPORT_HEALTH_PANEL_PATH,
    COMPONENTS_EXPORT_HEALTH_PANELS_PATH,
    COMPONENTS_EXPORT_LIVE_HINT_PATH,
    RESULT_CARD_PATH,
    COMPONENTS_REWRITE_DIFF_CHUNK_CARD_PATH,
    COMPONENTS_REWRITE_DIFF_PANEL_PATH,
    HOOKS_USE_DIFF_PANEL_SCROLL_FOCUS_PATH,
    LIB_DIFF_FILTER_MODEL_PATH,
    LIB_RESULT_CARD_EXPORT_HEALTH_HELPERS_PATH,
    LIB_RESULT_CARD_HELPERS_PATH,
    LIB_RESULT_CARD_OUTPUT_VIEW_MODEL_PATH,
    LIB_RESULT_CARD_REVIEW_HELPERS_PATH,
    LIB_RESULT_CARD_RISK_HELPERS_PATH,
    LIB_REWRITE_DIFF_PANEL_VIEW_MODEL_PATH
  ]);
  const webServiceSource = failures.length ? "" : joinSources([
    WEB_SERVICE_PATH,
    LIB_WEB_SERVICE_COMPAT_PATH,
    LIB_WEB_SERVICE_DOCUMENTS_PATH,
    LIB_WEB_SERVICE_EXPORT_PATH,
    LIB_WEB_SERVICE_EXPORT_HEADERS_PATH,
    LIB_WEB_SERVICE_EXPORT_RESULT_PATH,
    LIB_WEB_SERVICE_FILE_PICKER_PATH,
    LIB_WEB_SERVICE_FILE_SIZE_HELPERS_PATH,
    LIB_WEB_SERVICE_FILES_PATH,
    LIB_WEB_SERVICE_HEALTH_PATH,
    LIB_WEB_SERVICE_HISTORY_API_PATH,
    LIB_WEB_SERVICE_HTTP_PATH,
    LIB_WEB_SERVICE_MODEL_PATH,
    LIB_WEB_SERVICE_MODEL_CONFIG_PATH,
    LIB_WEB_SERVICE_PROMPTS_PATH,
    LIB_WEB_SERVICE_ROUNDS_PATH,
    LIB_WEB_SERVICE_RUN_STREAM_PATH,
    LIB_WEB_SERVICE_RUN_STREAM_LIFECYCLE_PATH
  ]);
  const homeSource = failures.length ? "" : joinSources([
    COMPONENTS_APPEND_ROUND_DIALOG_PATH,
    COMPONENTS_HOME_RUN_CONTROL_SECTION_PATH,
    COMPONENTS_HOME_RUN_PANEL_PATH,
    COMPONENTS_RUN_RECOVERY_PANEL_PATH,
    COMPONENTS_SETUP_EDITOR_DIALOG_PATH,
    COMPONENTS_SETUP_EDITOR_MODEL_ROUTE_SECTION_PATH,
    COMPONENTS_SETUP_EDITOR_PROMPT_SECTION_PATH,
    HOOKS_USE_APPEND_ROUND_CONTROLS_PATH,
    HOOKS_USE_HOME_RUN_PANEL_ACTIONS_PATH,
    HOOKS_USE_HOME_RUN_PANEL_MODEL_PATH,
    HOOKS_USE_SETUP_EDITOR_ESCAPE_PATH,
    LIB_HOME_RUN_APPEND_CONFIG_STATE_PATH,
    LIB_HOME_RUN_APPEND_ROUTE_STATE_PATH,
    LIB_HOME_RUN_APPEND_STATE_PATH,
    LIB_HOME_RUN_CONTROL_PATH,
    LIB_HOME_RUN_PANEL_PRIMARY_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_EDIT_HELPERS_PATH,
    LIB_HOME_RUN_PANEL_ROUTE_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PANEL_STATE_PATH,
    LIB_HOME_RUN_PANEL_TYPES_PATH,
    LIB_HOME_RUN_PANEL_VIEW_MODEL_PATH,
    LIB_HOME_RUN_PRIMARY_ACTION_STATE_PATH
  ]);

  if (appSource) {
    assertIncludes(appSource, "type RunSession = {", "Frontend must model active runs as explicit sessions.", failures);
    assertIncludes(appSource, "const runSessionRef = useRef<RunSession | null>(null);", "Active run session must be stored in a ref.", failures);
    assertIncludes(appSource, "const beginRunSession = useCallback(", "Run start/attach must create a session.", failures);
    assertIncludes(appSource, "const isActiveRunSession = useCallback(", "Async run callbacks must be able to reject stale sessions.", failures);
    assertIncludes(appSource, "const clearRunSession = useCallback(", "Run finalization must clear only the matching active session.", failures);
    assertIncludes(appSource, "const roundProgressRequestRef = useRef(0);", "Checkpoint status refreshes must be sequenced so stale history requests cannot overwrite the current document.", failures);
    assertIncludes(appSource, "type PendingAutoAction", "Frontend must model pending auto retry/next-round actions explicitly.", failures);
    assertIncludes(appSource, "AUTO_RUN_RETRY_DELAY_SECONDS = 10", "Interrupted runs must use the requested 10 second retry countdown.", failures);
    assertIncludes(appSource, "AUTO_RUN_RETRY_MAX_ATTEMPTS = 3", "Interrupted runs must stop after three automatic retry attempts.", failures);
    assertIncludes(appSource, "AUTO_NEXT_ROUND_DELAY_SECONDS = 60", "Multi-round continuation must use the requested 60 second countdown.", failures);
    assertIncludes(appSource, "function scheduleAutoRetry(", "Interrupted resumable runs must schedule automatic retry.", failures);
    assertIncludes(appSource, "function scheduleAutoNextRound(", "Completed rounds must schedule automatic next-round continuation.", failures);
    assertIncludes(appSource, "function isManualContinuationRound(", "Frontend must distinguish manual continuation rounds after the selected workflow.", failures);
    assertIncludes(appSource, "type RoundResetTarget = {", "Round reset must model whether it is clearing a checkpoint or a completed round.", failures);
    assertIncludes(appSource, "function getRoundResetTarget(", "Round reset must derive the target round instead of blindly using nextRound.", failures);
    assertIncludes(appSource, "function getAutoRunScopeKeyForStatus(", "Pending automatic actions must be scoped to the active document route.", failures);
    assertIncludes(appSource, "function clearPendingAutoActionForManualContextChange(", "Manual document or route changes must cancel pending automatic actions.", failures);
    assertIncludes(appSource, "function rejectPendingAutoAction(", "Users must be able to reject pending automatic actions.", failures);
    assertIncludes(appSource, "export function AutoRunSignal(", "Home run panel must render a visible countdown signal.", failures);
    assertIncludes(appSource, "const canAppendRound = Boolean(", "Completed custom workflows must expose an explicit append action.", failures);
    assertIncludes(appSource, "const appendRoundLimit = Math.max(sequenceLengthLimit, getPromptRoundLimit", "Append capacity must stay separate from the default workflow sequence limit.", failures);
    assertIncludes(appSource, "const sequenceLengthLimit = Math.max(1, getPromptSequenceLimit(promptProfile, promptWorkflows));", "The main workflow selector must honor the configured workflow sequence limit.", failures);
    assertNotIncludes(appSource, "DEFAULT_PROMPT_SEQUENCE.length", "The main workflow selector must not retain the legacy three-round cap.", failures);
    assertIncludes(appSource, "const [appendDraft, setAppendDraft] = useState<AppendRoundDraft | null>(null);", "Append rounds must use a dedicated single-round draft instead of mutating the main workflow picker.", failures);
    assertIncludes(appSource, "openAppendRoundDialog();", "Append action must open the single-round config dialog before starting.", failures);
    assertIncludes(appSource, "<Dialog open={open}", "Append round configuration must use a centered Dialog.", failures);
    assertIncludes(appSource, "开始追加", "Append dialog must expose a single confirm action.", failures);
    assertIncludes(appSource, "promptSequence: nextSequence", "Append action must extend the custom prompt sequence before starting a run.", failures);
    assertIncludes(appSource, "const lastRoundKey = getRoundModelKey(promptProfile, activeSequenceLength, promptWorkflows);", "Append default route must read the active prompt profile, not a hard-coded editable profile.", failures);
    assertIncludes(appSource, "const lastRoundKey = getRoundModelKey(promptProfile, activeSequenceLength, promptWorkflows);", "Append round model key must be scoped to the active prompt profile.", failures);
    assertNotIncludes(appSource, "getRoundModelKey(editablePromptProfile", "Append route logic must not use the editor default profile.", failures);
    assertNotIncludes(appSource, "promptProfile: editablePromptProfile", "Append action must not rewrite the active prompt profile implicitly.", failures);
    assertIncludes(appSource, "onRunRound(nextConfig);", "Append action must start with the extended prompt route, not the stale completed route.", failures);
    assertIncludes(appSource, "function createCheckpointProgress(", "Resumable checkpoints must seed visible progress.", failures);
    assertIncludes(appSource, "function buildRunRecoveryPanelState(", "Run recovery state must be derived by one helper.", failures);
    assertIncludes(appSource, "function RunRecoveryPanel(", "Home page must expose a visible run recovery panel.", failures);
    assertIncludes(appSource, "resumeStage === \"finalize_output\"", "100% checkpoint recovery must be displayed as finalization, not chunk rerun.", failures);
    assertIncludes(appSource, "resumeActionLabel", "Run recovery panel must show the backend-provided resume action.", failures);
    assertIncludes(appSource, "nextChunkId", "Run recovery panel must show the next chunk when available.", failures);
    assertIncludes(appSource, "不会重跑已完成分块", "Run recovery copy must explain that completed chunks are not rerun.", failures);
    assertIncludes(appSource, "next.phase === \"cancel-requested\"", "Cancel progress events must not reset visible round progress.", failures);
    assertIncludes(appSource, "正在中断当前轮次，已完成分块会保留。", "Cancel progress needs a stable runtime message.", failures);
    assertIncludes(appSource, "return progress.completedChunks ?? progress.currentChunk ?? 0;", "Parallel chunk completion must drive visible progress by completed count, not chunk index.", failures);
    assertIncludes(appSource, "剩余 ${remainingChunks}${concurrencyText}", "Runtime copy must prioritize remaining chunk countdown over duplicate active worker counts.", failures);
    assertIncludes(appSource, "function RoundRunStatusCard(", "Home must replace the Diff area with a run status card while a round is active.", failures);
    assertIncludes(appSource, "showRoundRunStatus ? (", "Diff review must be hidden during active round execution.", failures);
    assertIncludes(appSource, "function formatProviderErrorBrief(", "Provider request failures must be summarized by category in the running status UI.", failures);
    assertIncludes(appSource, "progress.errorCategory", "Parallel provider failures must carry structured error category fields into the UI.", failures);
    assertIncludes(appSource, "recentRunCount", "Diagnostics must count persisted run-round summaries.", failures);
    assertIncludes(appSource, "recentRuns", "Diagnostics must render/share persisted run-round summaries.", failures);
    assertIncludes(appSource, "function buildDiagnosticTaskItems", "Diagnostics task center should normalize backend task summaries.", failures);
    assertIncludes(appSource, "function DiagnosticTaskAlert", "Diagnostics task center should render run and rerun summaries through one component.", failures);
    assertIncludes(appSource, "后台任务", "Diagnostics task center should expose one unified user-facing task area.", failures);
    assertIncludes(appSource, "未完成", "Interrupted task snapshots need a clear user-facing label.", failures);
    assertIncludes(appSource, "任务快照治理", "Diagnostics must expose task snapshot governance.", failures);
    assertIncludes(appSource, "cleanupTaskStateSnapshots", "Frontend must call backend task snapshot cleanup.", failures);
    assertIncludes(appSource, "beginTaskRef.current(\"restoring-document\"", "Restoring the previous document must enter the shared task lifecycle.", failures);
    assertIncludes(appSource, "taskTicket !== taskTicketRef.current", "Async restoration must ignore stale task tickets.", failures);
    assertIncludes(appSource, "finishTask(taskTicket);", "Restoration and other task flows must release their task ticket.", failures);
    assertIncludes(appSource, "function buildConfigForHistorySelection", "Selecting a history document must derive the active route from that history record.", failures);
    assertIncludes(appSource, "buildConfigForHistorySelection", "History selection must not keep using a stale global prompt route.", failures);
    assertIncludes(appSource, "resolveAutoSnapshotLoadedRoute", "Auto-restore must sync custom prompt sequence changes, not only profile changes.", failures);
    assertIncludes(appSource, "const statusPromptProfile = input.documentStatus.promptProfile ?? input.modelConfig.promptProfile;", "Checkpoint status refresh must use the document status route.", failures);
    assertIncludes(appSource, "const statusPromptSequence = normalizePromptSequence(", "Checkpoint status refresh must use the document status prompt sequence.", failures);
    assertIncludes(appSource, "roundProgressRequestRef", "Checkpoint status refresh must ignore stale responses.", failures);
    assertNotIncludes(appSource, "流程已完成，可追加第 ${status.nextRound} 轮。", "Completed selected workflows must not expose an automatic append round.", failures);
    assertIncludes(appSource, "流程已完成，可导出。", "Completed selected workflows must be presented as exportable.", failures);
    assertIncludes(appSource, "autoSnapshotRestoreKeyRef", "Completed results must have a guarded automatic Diff restore path after refresh or interrupted restoration.", failures);
    assertIncludes(appSource, "loadLatestRoundSnapshotRef.current(documentStatus, plan.restoreConfig", "Missing visible Diff should be restored from the latest persisted round instead of leaving the home page empty.", failures);
    assertIncludes(appSource, "latestOutputKey && documentRefsMatch(latestOutputKey, outputKey)", "Diff ownership must accept the latest output path instead of relying only on docId.", failures);
    assertIncludes(appSource, "function promptSequenceCoversSelectedRoute(", "Diff and history route matching must support appended custom workflows without treating unrelated routes as active.", failures);
    assertIncludes(appSource, "comparePromptProfile !== documentPromptProfile", "Diff ownership must reject compare payloads from another prompt profile before trusting docId.", failures);
    assertIncludes(appSource, "promptSequenceCoversSelectedRoute(\n      compareData.promptSequence,\n      document.promptSequence,", "Diff ownership must reject stale compare payloads from another custom prompt sequence.", failures);
    assertIncludes(appSource, "compareDataMatchesDocument(compareData, documentStatus, promptOptions, promptWorkflows)", "Active Diff selection must pass route metadata into compare ownership checks.", failures);
    assertIncludes(appSource, "function isCompleteRoundCompareData(", "Frontend must reject zero-chunk compare payloads before treating a round as completed.", failures);
    assertIncludes(appSource, "!isCompleteRoundCompareData(compareData) || !document", "Diff ownership must reject incomplete compare payloads before trusting document identity.", failures);
    assertIncludes(appSource, "本轮结果不完整，不能载入为已完成 Diff。", "Snapshot restore must not load empty compare data as a completed Diff.", failures);
    assertIncludes(appSource, "const latestRoundCompareReady = Boolean(", "Append eligibility must depend on a loaded complete compare payload.", failures);
    assertIncludes(appSource, "const completedButDiffMissing = Boolean(", "Completed status without Diff must surface as incomplete instead of export-ready.", failures);
    assertIncludes(appSource, "promptSequenceCoversSelectedRoute(roundItem.promptSequence, promptSequence, roundItem.round", "History lookup must keep prefix rounds visible after a user appends one more custom round.", failures);
    assertIncludes(appSource, "const loadedCompletedResultRound = roundResult?.round ?? null;", "Home run panel must only treat completed round results as loaded results.", failures);
    assertIncludes(appSource, "loadedResultRound={loadedCompletedResultRound}", "Checkpoint Diff snapshots must not be passed to the run panel as completed results.", failures);
    assertIncludes(appSource, "function roundCheckpointMatchesDocument", "Current-round checkpoints must be detected separately from completed results.", failures);
    assertIncludes(appSource, "const checkpointPendingForCurrentDocument = roundCheckpointMatchesDocument(roundProgressStatus, documentStatus, promptOptions, promptWorkflows) && !showRoundRunStatus;", "Incomplete checkpoints must keep export and output status guarded after refresh.", failures);
    assertIncludes(appSource, "checkpoint.promptProfile === status.promptProfile", "Checkpoint matching must reject stale checkpoints from another prompt route.", failures);
    assertIncludes(appSource, "promptSequencesEqual(checkpoint.promptSequence, status.promptSequence, promptOptions, status.promptProfile, promptWorkflows)", "Checkpoint matching must include the current custom prompt sequence.", failures);
    assertIncludes(appSource, "const waitingForStatusSync = Boolean(resultAheadOfStatus && !resumableCheckpoint && !checkpointOnCurrentRound);", "Current-round checkpoints must not strand the primary button in status-sync mode.", failures);
    assertIncludes(appSource, "放弃已完成结果", "Reset copy must distinguish completed results from resumable in-progress checkpoints.", failures);

    const handleRunRoundSource = extractFunctionSource(appSource, "handleRunRound");
    assertIncludes(handleRunRoundSource, "configOverride?: ModelConfig", "Starting a round must accept the latest run-panel config instead of stale React state.", failures);
    assertIncludes(appSource, "latestModelConfigRef.current", "Starting a round must prefer the latest selected model config.", failures);
    assertIncludes(appSource, "const selectedPromptSequence = normalizePromptSequence(", "Starting a round must keep the user-selected workflow route.", failures);
    assertNotIncludes(handleRunRoundSource, "documentStatus.promptSequence ?? baseModelConfig.promptSequence", "Starting a round must not collapse the selected workflow to a stale document route.", failures);
    assertIncludes(appSource, "refreshDocumentState", "Starting a round must refresh document state with the selected route before deciding the next round.", failures);
    assertIncludes(appSource, "launchPlannedRounds", "Starting a round must reject backend continuation beyond the selected workflow.", failures);
    assertIncludes(appSource, "saveModelConfig", "Starting a round must persist the selected run settings before creating the backend run.", failures);
    assertIncludes(appSource, "promptSequencesEqual(", "Starting a round must sync route state before creating a backend run.", failures);
    assertIncludes(appSource, "input.roundProgressStatus.promptProfile === input.documentStatus.promptProfile", "Checkpoint reuse must reject checkpoints from another prompt profile.", failures);
    assertIncludes(appSource, "promptSequencesEqual(roundProgressStatus.promptSequence, activeSequence, promptOptions, promptProfile, promptWorkflows)", "Checkpoint reuse must reject checkpoints from another custom prompt sequence.", failures);
    assertIncludes(appSource, "createCheckpointProgress", "Starting a round must seed UI from checkpoint status.", failures);
    assertIncludes(appSource, "scheduleAutoRetry", "Resumable forced interruption must enqueue auto retry.", failures);
    assertIncludes(appSource, "scheduleAutoNextRound", "Successful rounds must enqueue auto next-round countdown.", failures);
    assertIncludes(appSource, "userCanceled", "Manual cancel must not be treated as a forced interruption auto-retry.", failures);
    assertIncludes(appSource, "resumeExplanation", "Resume notices must prefer backend checkpoint explanations.", failures);
    assertIncludes(appSource, "beginRunSession", "Started runs must be bound to a run session.", failures);
    assertIncludes(appSource, "isActiveRunSession", "Run result handling must ignore stale sessions.", failures);
    assertIncludes(handleRunRoundSource, "clearRunSession(runSession);", "Run finalization must clear the matching session.", failures);

    const attachActiveRunSource = extractFunctionSource(appSource, "attachActiveRun");
    assertIncludes(appSource, "mode: \"attach\"", "Attached backend runs must use attach-mode sessions.", failures);
    assertIncludes(appSource, "isActiveRunSession", "Attached progress/result callbacks must ignore stale sessions.", failures);

    const scheduleAutoNextRoundSource = extractFunctionSource(appSource, "scheduleAutoNextRound");
    assertIncludes(appSource, "isManualContinuationRound", "Automatic next-round countdown must stop once the selected workflow is complete.", failures);

    const performPendingAutoActionSource = extractFunctionSource(appSource, "performPendingAutoAction");
    assertIncludes(appSource, "const activeScopeKey = getAutoRunScopeKeyForStatus(", "Automatic actions must recheck the active prompt route before running.", failures);
    assertIncludes(appSource, "activeScopeKey", "Automatic actions from a stale prompt route must be cancelled.", failures);

    const getRoundResetTargetSource = extractFunctionSource(appSource, "getRoundResetTarget");
    assertIncludes(getRoundResetTargetSource, "checkpoint.round === status.nextRound", "Reset should prefer the current resumable checkpoint only when it matches the active next round.", failures);
    assertIncludes(getRoundResetTargetSource, "status.completedRounds ?? []", "Reset must fall back to completed rounds when there is no current checkpoint.", failures);
    assertIncludes(getRoundResetTargetSource, ".sort((left, right) => left - right)", "Reset must pick the latest completed round deterministically.", failures);
    assertIncludes(getRoundResetTargetSource, "return { round: latestCompletedRound, mode: \"completed\" };", "Resetting after a completed first round must clear round 1, not append round 2.", failures);

    const handleResetCurrentRoundSource = extractFunctionSource(appSource, "handleResetCurrentRound");
    assertIncludes(appSource, "getRoundResetTarget", "Reset action must use the derived reset target.", failures);
    assertIncludes(appSource, "resetTarget.round", "Reset action must call the backend with the derived round number.", failures);
    assertIncludes(appSource, "resetPromptProfile", "Reset action must use the current document route, not stale global config.", failures);
    assertIncludes(appSource, "resetRoundProgress", "Reset action must clear the active document route and derived round number.", failures);
    assertNotIncludes(handleResetCurrentRoundSource, "documentStatus.nextRound", "Reset action must not treat the next runnable round as the round to discard.", failures);

    const handleExportCurrentSource = extractFunctionSource(appSource, "handleExportCurrent");
    assertIncludes(appSource, "roundCheckpointMatchesDocument", "Export guard must only block for checkpoints on the active prompt route.", failures);
    assertIncludes(appSource, "activeCompareData?.outputPath", "Current export must use persisted compare output when roundResult has not been rebuilt yet.", failures);
    assertIncludes(appSource, "exportRound", "Current export must call the backend with the recovered output path.", failures);
    assertNotIncludes(handleExportCurrentSource, "if (!roundResult)", "Current export must not disappear just because roundResult is missing after refresh.", failures);

    const handleSelectHistorySource = extractFunctionSource(appSource, "handleSelectHistory");
    assertIncludes(appSource, "clearPendingAutoActionForManualContextChange", "Selecting history must cancel pending automatic runs instead of carrying them into the selected record.", failures);
    assertNotIncludes(handleSelectHistorySource, "service.startRunRound", "Selecting history must only load state and snapshots, not start a rewrite run.", failures);

    const handlePickFileSource = extractFunctionSource(appSource, "handlePickFile");
    assertIncludes(appSource, "clearPendingAutoActionForManualContextChange", "Picking a new document must cancel pending automatic runs.", failures);

    assertIncludes(appSource, "sameWorkspacePath(roundProgressStatus.sourcePath, value?.sourcePath)", "Home run panel must not show a resume checkpoint from another history document.", failures);

    const cancelSource = extractFunctionSource(appSource, "handleCancelRunRound");
    assertIncludes(appSource, "runSessionRef.current", "Cancel must target the current run session.", failures);
    assertIncludes(appSource, "canceling-run", "Cancel must transition the matching task ticket.", failures);
    assertIncludes(appSource, "cancelRunRound(runSession.runId)", "Cancel must call the backend with the session run id.", failures);
    assertIncludes(appSource, "const runRecoveryState = buildRunRecoveryPanelState", "Home run panel must use the shared recovery state helper.", failures);
    assertIncludes(appSource, "<RunRecoveryPanel state={running ? null : runRecoveryState} />", "Home run panel must not duplicate the main running progress card.", failures);
  }

  if (resultCardSource) {
    assertIncludes(resultCardSource, "const compareReady = Boolean(", "Result card must derive output readiness from compare data, not result metadata alone.", failures);
    assertIncludes(resultCardSource, "compareData.chunkCount === compareData.chunks.length", "Result card must reject empty or partial compare data before enabling export.", failures);
    assertNotIncludes(resultCardSource, "const hasOutput = Boolean(result || compareData?.chunks.length);", "Result card must not show export controls from result metadata alone.", failures);
  }

  if (webServiceSource) {
    const ensureRunStreamSource = extractFunctionSource(webServiceSource, "ensureRunStream");
    const pickSingleFileSource = extractFunctionSource(webServiceSource, "pickSingleFile");
    assertIncludes(webServiceSource, "sseDisconnected: boolean;", "Run streams must track SSE disconnection separately from run failure.", failures);
    assertIncludes(ensureRunStreamSource, "stream.sseDisconnected = true;", "SSE close should mark the stream degraded.", failures);
    assertNotIncludes(ensureRunStreamSource, "new Error(\"Progress channel disconnected.\")", "SSE close must not immediately fail an active run.", failures);
    assertIncludes(webServiceSource, "stream.statusFailureCount >= 12 && (stream.sseDisconnected || stream.eventSource.readyState === EventSource.CLOSED)", "Polling must remain the authoritative fallback after SSE loss.", failures);
    assertIncludes(pickSingleFileSource, "document.addEventListener(\"pointerdown\", handleUserReturnedToPage, true);", "File picker must release if the user returns to the page after cancel.", failures);
    assertIncludes(pickSingleFileSource, "document.removeEventListener(\"pointerdown\", handleUserReturnedToPage, true);", "File picker fallback listeners must be cleaned up.", failures);
    assertIncludes(pickSingleFileSource, "userReturnArmed = true;", "File picker return-to-page fallback must arm after the initial click.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    webServicePath: WEB_SERVICE_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "active run identity is explicit",
      "stale async callbacks cannot reset a newer run",
      "checkpoint status seeds resume progress",
      "history selection restores the route used by the selected record",
      "run start rejects checkpoints from other prompt routes",
      "cancel targets the active run session",
      "SSE disconnect no longer equals run failure",
      "zero-chunk compare data cannot become an export-ready completed result",
      "diagnostics exposes persisted run task summaries",
      "diagnostics exposes task snapshot governance",
      "document restoration participates in the shared task lifecycle",
      "file picker cancellation has a return-to-page fallback",
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
