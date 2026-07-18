import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HISTORY_DOCUMENT_SHARED_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentSharedTypes.ts");
const HISTORY_CARD_PROPS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardProps.ts");
const HISTORY_CARD_BODY_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBodyTypes.ts");
const HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundListEmpty.tsx");
const HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListItemRoundHelpers.ts");
const HISTORY_LOAD_SNAPSHOT_SELECTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadSnapshotSelectionHelpers.ts");
const HISTORY_LOAD_ROUTE_RESOLVE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadRouteResolveHelpers.ts");
const HISTORY_LOAD_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadPlanHelpers.ts");
const HISTORY_LOAD_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyLoadNoticeHelpers.ts");
const HISTORY_DELETE_RESULT_NOTICE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteResultNoticeCopy.ts");
const HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteConfirmTextCopy.ts");
const USE_DOCUMENT_RESTORE_REFS_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useDocumentRestoreRefs.ts");
const HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItemBody.tsx");
const HISTORY_CARD_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardBody.tsx");
const HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentDeleteActionHelpers.ts");
const HISTORY_DOCUMENT_ROUND_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundHeader.tsx");
const HISTORY_ARTIFACT_REPAIR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactRepairHelpers.ts");
const HISTORY_ARTIFACT_QUERY_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyArtifactQueryHelpers.ts");
const REWRITE_DIFF_PANEL_EMPTY_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelEmpty.tsx");
const REWRITE_DIFF_PANEL_ALERTS_PATH = resolve(ROOT_DIR, "app", "src", "components", "RewriteDiffPanelAlerts.tsx");
const DIFF_PANEL_FOCUS_EFFECT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelFocusEffectHelpers.ts");
const DIFF_PANEL_SCROLL_POSITION_STORE_PATH = resolve(ROOT_DIR, "app", "src", "lib", "diffPanelScrollPositionStore.ts");
const AUTO_SNAPSHOT_RESTORE_ROUTE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestoreRouteHelpers.ts");
const AUTO_SNAPSHOT_RESTORE_PLAN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "autoSnapshotRestorePlanHelpers.ts");
const HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactGovernanceBody.tsx");
const HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactGovernanceToolbar.tsx");
const HISTORY_DATABASE_REPAIR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDatabaseRepairHandlers.ts");
const HISTORY_ORPHAN_SCAN_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanScanHandlers.ts");
const HISTORY_DELETE_PREVIEW_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeletePreviewHandlers.ts");
const HISTORY_DELETE_APPLY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteApplyHandlers.ts");
const HISTORY_CARD_MAINTENANCE_STATS_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardMaintenanceStatsHelpers.ts");
const HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardMaintenanceLabelHelpers.ts");
const HISTORY_ARTIFACT_ROW_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryArtifactRow.tsx");
const HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentRoundViewModel.ts");
const HISTORY_DOCUMENT_ROUND_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundCard.tsx");
const HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentCleanupActions.tsx");
const APP_PATH = resolve(ROOT_DIR, "app", "src", "App.tsx");
const EXPORT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportHelpers.ts");
const EXPORT_FAILURE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportFailureHelpers.ts");
const EXPORT_RERUN_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportRerunHelpers.ts");
const EXPORT_NOTICE_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeHelpers.ts");
const EXPORT_NOTICE_ACTION_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeActionHelpers.ts");
const EXPORT_NOTICE_ERROR_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeErrorHelpers.ts");
const EXPORT_NOTICE_FORMAT_HELPERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "exportNoticeFormatHelpers.ts");
const HISTORY_DELETE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteCopy.ts");
const HISTORY_DELETE_NOTICE_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteNoticeCopy.ts");
const HISTORY_DELETE_CONFIRM_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteConfirmCopy.ts");
const HISTORY_DELETE_RUNTIME_COPY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteRuntimeCopy.ts");
const HISTORY_CARD_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCard.tsx");
const HISTORY_CARD_SUMMARY_PILLS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardSummaryPills.tsx");
const HISTORY_CARD_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardHeader.tsx");
const USE_HISTORY_CARD_STATE_PATH = resolve(ROOT_DIR, "app", "src", "hooks", "useHistoryCardState.ts");
const HISTORY_CARD_MAINTENANCE_SECTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryCardMaintenanceSection.tsx");
const HISTORY_GOVERNANCE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryGovernancePanels.tsx");
const HISTORY_DOCUMENT_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentList.tsx");
const HISTORY_DOCUMENT_LIST_ITEM_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItem.tsx");
const HISTORY_DOCUMENT_LIST_ITEM_HEADER_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentListItemHeader.tsx");
const HISTORY_DOCUMENT_ROUND_LIST_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDocumentRoundList.tsx");
const HISTORY_DELETE_ACTION_KEY_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteActionKey.ts");
const HISTORY_DOCUMENT_LIST_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListViewModel.ts");
const HISTORY_DOCUMENT_LIST_VIEW_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentListViewTypes.ts");
const HISTORY_CARD_SUMMARY_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCardSummaryViewModel.ts");
const HISTORY_DELETE_PANELS_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDeletePanels.tsx");
const HISTORY_ORPHAN_GOVERNANCE_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryOrphanGovernancePanel.tsx");
const HISTORY_ASSET_IMPACT_PANEL_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryAssetImpactPanel.tsx");
const HISTORY_DELETE_ACTION_PATH = resolve(ROOT_DIR, "app", "src", "components", "HistoryDeleteAction.tsx");
const HISTORY_DELETE_PANELS_VIEW_MODEL_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeletePanelsViewModel.ts");
const HISTORY_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlers.ts");
const HISTORY_CORE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyCoreHandlers.ts");
const HISTORY_LIST_GOVERNANCE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyListGovernanceHandlers.ts");
const HISTORY_DOCUMENT_LOAD_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentLoadHandlers.ts");
const HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDocumentRouteHandlers.ts");
const HISTORY_DELETE_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteHandlers.ts");
const HISTORY_DELETE_ACTION_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyDeleteActionHandlers.ts");
const HISTORY_ORPHAN_REPAIR_HANDLERS_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyOrphanRepairHandlers.ts");
const HISTORY_HANDLER_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerTypes.ts");
const HISTORY_HANDLER_INPUT_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerInputTypes.ts");
const HISTORY_HANDLER_DEPS_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerDepsTypes.ts");
const HISTORY_HANDLER_INTERFACE_TYPES_PATH = resolve(ROOT_DIR, "app", "src", "lib", "historyHandlerInterfaceTypes.ts");
const REPORT_PATH = resolve(ROOT_DIR, "finish", "regression", "frontend_history_governance_regression_report.json");

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

function runRegression() {
  const failures = [];
  if (!existsSync(APP_PATH)) {
    failures.push(`Missing App.tsx: ${APP_PATH}`);
  }
  if (!existsSync(HISTORY_CARD_PATH)) {
    failures.push(`Missing HistoryCard.tsx: ${HISTORY_CARD_PATH}`);
  }

  const appSource = failures.length ? "" : readFileSync(APP_PATH, "utf-8");
  const historyHandlersSource = failures.length ? "" : [
    existsSync(HISTORY_HANDLERS_PATH) ? readFileSync(HISTORY_HANDLERS_PATH, "utf-8") : "",
    existsSync(HISTORY_CORE_HANDLERS_PATH) ? [
      existsSync(HISTORY_CORE_HANDLERS_PATH) ? readFileSync(HISTORY_CORE_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_LIST_GOVERNANCE_HANDLERS_PATH) ? readFileSync(HISTORY_LIST_GOVERNANCE_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH) ? [
      existsSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HISTORY_LIST_GOVERNANCE_HANDLERS_PATH) ? readFileSync(HISTORY_LIST_GOVERNANCE_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH) ? [
      existsSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_LOAD_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUTE_HANDLERS_PATH, "utf-8") : "",
    existsSync(HISTORY_DELETE_HANDLERS_PATH) ? [
      existsSync(HISTORY_DELETE_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH) ? readFileSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH) ? readFileSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_ACTION_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_ACTION_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_PREVIEW_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_PREVIEW_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_APPLY_HANDLERS_PATH) ? readFileSync(HISTORY_DELETE_APPLY_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ORPHAN_REPAIR_HANDLERS_PATH) ? readFileSync(HISTORY_ORPHAN_REPAIR_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH) ? readFileSync(HISTORY_DATABASE_REPAIR_HANDLERS_PATH, "utf-8") : "",
      existsSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH) ? readFileSync(HISTORY_ORPHAN_SCAN_HANDLERS_PATH, "utf-8") : "",
    ].join("\n") : "",
    existsSync(HISTORY_HANDLER_TYPES_PATH) ? [
      existsSync(HISTORY_HANDLER_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_HANDLER_INPUT_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_INPUT_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_HANDLER_DEPS_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_DEPS_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_HANDLER_INTERFACE_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_INTERFACE_TYPES_PATH, "utf-8") : "",
    ].join("\n") : "",
      existsSync(HISTORY_HANDLER_INPUT_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_INPUT_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_HANDLER_DEPS_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_DEPS_TYPES_PATH, "utf-8") : "",
      existsSync(HISTORY_HANDLER_INTERFACE_TYPES_PATH) ? readFileSync(HISTORY_HANDLER_INTERFACE_TYPES_PATH, "utf-8") : "",
  ].join("\n");
  const historyAppSource = `${appSource}\n${historyHandlersSource}`;
  const historyCardSource = failures.length ? "" : [
    readFileSync(HISTORY_CARD_PATH, "utf-8"),
    existsSync(HISTORY_CARD_PROPS_PATH) ? readFileSync(HISTORY_CARD_PROPS_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_BODY_PATH) ? readFileSync(HISTORY_CARD_BODY_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_BODY_TYPES_PATH) ? readFileSync(HISTORY_CARD_BODY_TYPES_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_LABEL_HELPERS_PATH, "utf-8") : "",
    existsSync(HISTORY_ARTIFACT_ROW_PATH) ? readFileSync(HISTORY_ARTIFACT_ROW_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_HEADER_PATH) ? readFileSync(HISTORY_CARD_HEADER_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_MAINTENANCE_SECTION_PATH) ? readFileSync(HISTORY_CARD_MAINTENANCE_SECTION_PATH, "utf-8") : "",
    existsSync(HISTORY_CARD_SUMMARY_PILLS_PATH) ? readFileSync(HISTORY_CARD_SUMMARY_PILLS_PATH, "utf-8") : "",
    existsSync(HISTORY_DELETE_ACTION_KEY_PATH) ? readFileSync(HISTORY_DELETE_ACTION_KEY_PATH, "utf-8") : "",
  ].join("\n");
  const historyPanelsSource = failures.length || !existsSync(HISTORY_GOVERNANCE_PANELS_PATH) ? "" : [
    readFileSync(HISTORY_GOVERNANCE_PANELS_PATH, "utf-8"),
    existsSync(HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH) ? readFileSync(HISTORY_ARTIFACT_GOVERNANCE_TOOLBAR_PATH, "utf-8") : "",
    existsSync(HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH) ? readFileSync(HISTORY_ARTIFACT_GOVERNANCE_BODY_PATH, "utf-8") : "",
  ].join("\n");
  const historyDocumentListSource = failures.length || !existsSync(HISTORY_DOCUMENT_LIST_PATH) ? "" : [
    readFileSync(HISTORY_DOCUMENT_LIST_PATH, "utf-8"),
    existsSync(HISTORY_DOCUMENT_LIST_ITEM_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_BODY_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH) ? readFileSync(HISTORY_DOCUMENT_CLEANUP_ACTIONS_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_LIST_ITEM_HEADER_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_HEADER_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_ROUND_LIST_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_LIST_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH) ? readFileSync(HISTORY_DOCUMENT_SHARED_TYPES_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_LIST_EMPTY_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_ROUND_CARD_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_CARD_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_HEADER_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_LIST_VIEW_MODEL_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_ITEM_ROUND_HELPERS_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH) ? readFileSync(HISTORY_DOCUMENT_DELETE_ACTION_HELPERS_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH) ? readFileSync(HISTORY_DOCUMENT_ROUND_VIEW_MODEL_PATH, "utf-8") : "",
    existsSync(HISTORY_DOCUMENT_LIST_VIEW_TYPES_PATH) ? readFileSync(HISTORY_DOCUMENT_LIST_VIEW_TYPES_PATH, "utf-8") : "",
  ].join("\n");
  const historyCardSummaryViewModelSource = failures.length || !existsSync(HISTORY_CARD_SUMMARY_VIEW_MODEL_PATH) ? "" : readFileSync(HISTORY_CARD_SUMMARY_VIEW_MODEL_PATH, "utf-8");
  const historyDeletePanelsSource = failures.length || !existsSync(HISTORY_DELETE_PANELS_PATH) ? "" : [
    readFileSync(HISTORY_DELETE_PANELS_PATH, "utf-8"),
    existsSync(HISTORY_ARTIFACT_ROW_PATH) ? readFileSync(HISTORY_ARTIFACT_ROW_PATH, "utf-8") : "",
    existsSync(HISTORY_ORPHAN_GOVERNANCE_PANEL_PATH) ? readFileSync(HISTORY_ORPHAN_GOVERNANCE_PANEL_PATH, "utf-8") : "",
    existsSync(HISTORY_ASSET_IMPACT_PANEL_PATH) ? readFileSync(HISTORY_ASSET_IMPACT_PANEL_PATH, "utf-8") : "",
    existsSync(HISTORY_DELETE_ACTION_PATH) ? readFileSync(HISTORY_DELETE_ACTION_PATH, "utf-8") : "",
    existsSync(HISTORY_DELETE_PANELS_VIEW_MODEL_PATH) ? readFileSync(HISTORY_DELETE_PANELS_VIEW_MODEL_PATH, "utf-8") : "",
  ].join("\n");
  const historySource = `${historyCardSource}\n${historyPanelsSource}\n${historyDocumentListSource}\n${historyDeletePanelsSource}\n${historyCardSummaryViewModelSource}`;

  if (historySource) {
    assertIncludes(historySource, "onPreviewDelete: (docId: string, options?: DeleteHistoryOptions) => Promise<HistoryDeleteImpact | null>;", "HistoryCard must expose a delete-impact preview callback.", failures);
    assertIncludes(historySource, "function buildHistoryDeleteActionKey", "History delete actions must have stable preview keys.", failures);
    assertIncludes(historySource, "function AssetImpactPanel", "History page must render a structured impact panel.", failures);
    assertIncludes(historySource, "function HistoryDeleteAction", "History destructive actions must be split into preview and execute controls.", failures);
    assertNotIncludes(historySource, "function HistoryGovernanceBoundary", "History page must not keep removed verbose governance copy.", failures);
    assertIncludes(historySource, "function HistoryArtifactGovernancePanel", "History page must expose the SQL-backed asset governance panel.", failures);
    assertIncludes(historySource, "function getMaintenanceStateLabel", "History maintenance summary must collapse backend details into one concise state.", failures);
    assertNotIncludes(historySource, "data-ui-section=\"history-governance-boundary\"", "History governance boundary section must stay removed.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-asset-governance\"", "Asset governance panel must expose a stable UI section.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-user-summary\"", "History default view must expose a user-centered summary section.", failures);
    assertIncludes(historySource, "data-ui-section=\"history-advanced-maintenance\"", "History maintenance tools must stay behind an advanced section.", failures);
    assertIncludes(historySource, "继续处理与导出", "History default title must speak in user workflow terms.", failures);
    assertIncludes(historySource, "可继续", "History summary must show continuable documents.", failures);
    assertIncludes(historySource, "可导出", "History summary must show exportable documents.", failures);
    assertIncludes(historySource, "可释放", "History summary must show cleanup as a simple space outcome.", failures);
    assertIncludes(historySource, "资产需检查", "History rows must flag records with missing generated assets before export.", failures);
    assertIncludes(historySource, "需检查", "History export state must warn when generated assets are incomplete.", failures);
    assertNotIncludes(historySource, "项目体检、空间清理和异常修复都收在这里", "Advanced maintenance must not reintroduce verbose helper copy.", failures);
    assertNotIncludes(historySource, "文档与生成物管理", "History page must not return to a backend-governance title.", failures);
    assertNotIncludes(historySource, "清理、索引修复和未归属文件扫描默认收起", "Collapsed maintenance copy must avoid leading with implementation details.", failures);
    assertNotIncludes(historySource, "function ArtifactGovernanceMap", "Removed history helper must not return as unused UI clutter.", failures);
    assertNotIncludes(historySource, "function RoundAuditStrip", "Round audit detail strip must stay out of the user history view.", failures);
    assertIncludes(historySource, "ToggleGroup", "Asset governance view must use shadcn ToggleGroup for mode selection.", failures);
    assertIncludes(historySource, "缺失资产", "Asset governance must keep user-facing modes concise.", failures);
    assertIncludes(historySource, "当前文档", "Asset governance must support a current-document view.", failures);
    assertIncludes(historySource, "大文件", "Asset governance must support a simple large-file view.", failures);
    assertIncludes(historySource, "修复索引", "Missing-asset governance must offer a safe index repair action.", failures);
    assertIncludes(historySource, "onRepairHistoryDatabase", "HistoryCard must receive a safe database repair callback.", failures);
    assertIncludes(historySource, "先看影响", "Delete controls must encourage preview before execution.", failures);
    assertIncludes(historySource, "documentImpactPreview ? <AssetImpactPanel", "Document-level delete preview must render inline.", failures);
    assertIncludes(historySource, "roundImpactPreview ? <div className=\"mt-4\"><AssetImpactPanel", "Round-level delete preview must render inline.", failures);
  }

  if (appSource) {
    assertIncludes(historyHandlersSource, "async function handlePreviewHistoryDelete", "App must provide a safe history delete preview handler.", failures);
    assertIncludes(historyHandlersSource, "service.previewDocumentHistoryDelete(docId, options)", "Preview handler must call backend impact endpoint.", failures);
    assertIncludes(historyHandlersSource, "service.queryHistoryArtifacts", "App must query SQL-backed history artifact governance data.", failures);
    assertIncludes(historyHandlersSource, "service.repairHistoryDatabase", "App must call the backend repair endpoint from governance UI.", failures);
    assertIncludes(historyHandlersSource, "async function handleRepairHistoryDatabase", "App must provide a history database repair handler.", failures);
    assertIncludes(appSource, "HistoryArtifactGovernanceMode", "App must keep asset governance modes typed.", failures);
    assertIncludes(appSource, "onPreviewDelete={(docId, options) => handlePreviewHistoryDelete(docId, options)}", "HistoryCard must receive the preview handler.", failures);
    assertIncludes(appSource, "onArtifactModeChange={(mode) => void refreshHistoryArtifactGovernance(mode)}", "HistoryCard must receive asset governance mode changes.", failures);
    assertIncludes(appSource, "onRepairHistoryDatabase={() => void handleRepairHistoryDatabase()}", "HistoryCard must receive the database repair handler.", failures);
    assertIncludes(historyHandlersSource, "已生成删除前影响预览", "Preview handler must notify users without deleting files.", failures);
    assertIncludes([
      existsSync(HISTORY_DELETE_COPY_PATH) ? readFileSync(HISTORY_DELETE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RUNTIME_COPY_PATH) ? readFileSync(HISTORY_DELETE_RUNTIME_COPY_PATH, "utf-8") : "",
    ].join("\n"), "result.failedFiles?.length", "History deletion must surface files that failed to delete.", failures);
    assertIncludes([
      existsSync(HISTORY_DELETE_COPY_PATH) ? readFileSync(HISTORY_DELETE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_TEXT_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH) ? readFileSync(HISTORY_DELETE_RESULT_NOTICE_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_CONFIRM_COPY_PATH) ? readFileSync(HISTORY_DELETE_CONFIRM_COPY_PATH, "utf-8") : "",
      existsSync(HISTORY_DELETE_RUNTIME_COPY_PATH) ? readFileSync(HISTORY_DELETE_RUNTIME_COPY_PATH, "utf-8") : "",
    ].join("\n"), "已保留在项目目录中", "History deletion notice must explain failed files are retained.", failures);
    assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ERROR_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ERROR_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ACTION_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ACTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "Output file does not exist", "Export errors must recognize history records whose output file is gone.", failures);
    assertIncludes([
      existsSync(EXPORT_HELPERS_PATH) ? readFileSync(EXPORT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_FAILURE_HELPERS_PATH) ? readFileSync(EXPORT_FAILURE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_RERUN_HELPERS_PATH) ? readFileSync(EXPORT_RERUN_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_FORMAT_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ERROR_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ERROR_HELPERS_PATH, "utf-8") : "",
      existsSync(EXPORT_NOTICE_ACTION_HELPERS_PATH) ? readFileSync(EXPORT_NOTICE_ACTION_HELPERS_PATH, "utf-8") : "",
    ].join("\n"), "修复索引或清理缺失资产", "Missing-output export errors must point users back to history governance.", failures);
  }

  const report = {
    ok: failures.length === 0,
    createdAt: new Date().toISOString(),
    appPath: APP_PATH,
    historyCardPath: HISTORY_CARD_PATH,
    reportPath: REPORT_PATH,
    failures,
    checks: [
      "delete actions separate preview from execution",
      "document and round previews render inline",
      "SQL asset governance is surfaced behind advanced tools",
      "delete failures are surfaced without hiding cleanup results",
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
