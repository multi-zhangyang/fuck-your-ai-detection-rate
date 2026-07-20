import { HistoryCardMaintenanceSection } from "@/components/HistoryCardMaintenanceSection";
import { HistoryDocumentList } from "@/components/HistoryDocumentList";
import { HistoryCardSummaryPills } from "@/components/HistoryCardSummaryPills";
import type { HistoryCardBodyProps } from "@/components/HistoryCardBodyTypes";
import {
  AssetImpactPanel,
  HistoryDeleteAction,
} from "@/components/HistoryDeletePanels";
import { HistoryArtifactGovernancePanel } from "@/components/HistoryGovernancePanels";
import { buildHistoryDeleteActionKey as makeDeleteActionKey } from "@/lib/historyDeleteActionKey";

export function HistoryCardBody({
  currentDocId,
  currentHistory,
  items,
  promptProfile,
  promptSequence,
  promptOptions,
  promptWorkflows,
  orphanScan,
  artifactQuery,
  artifactMode,
  artifactLoading,
  open,
  busy,
  onSelect,
  onDelete,
  onArtifactModeChange,
  onRefreshArtifacts,
  onRepairHistoryDatabase,
  onScanOrphans,
  onDeleteOrphans,
  dbMaintenanceSummary,
  dbMaintenanceSummaryLoading,
  dbBackups,
  dbBackupsLoading,
  dbCheck,
  dbCheckLoading,
  onRefreshDatabaseMaintenance,
  onRefreshDatabaseBackups,
  onCheckDatabase,
  onBackupDatabase,
  onCompactDatabase,
  onRecoverDatabase,
  onDownload,
  impactPreview,
  impactLoadingKey,
  maintenanceOpen,
  setMaintenanceOpen,
  cleanupDocId,
  setCleanupDocId,
  continuationCount,
  exportableCount,
  missingDocumentCount,
  maintenanceStateLabel,
  totalBytesLabel,
  currentCleanupOptions,
  currentCleanupKey,
  governanceImpactPreview,
  handlePreviewDelete,
}: HistoryCardBodyProps) {
  return (
    <>
      <HistoryCardSummaryPills
        continuationCount={continuationCount}
        exportableCount={exportableCount}
        totalBytesLabel={totalBytesLabel}
      />
      <HistoryCardMaintenanceSection
        busy={busy}
        maintenanceOpen={maintenanceOpen}
        onToggleMaintenance={() => setMaintenanceOpen((value) => !value)}
        maintenanceStateLabel={maintenanceStateLabel}
        maintenanceBadgeVariant={artifactQuery?.ok === false || missingDocumentCount ? "warning" : orphanScan?.orphanStats.existing ? "secondary" : "outline"}
        artifactQuery={artifactQuery}
        artifactMode={artifactMode}
        artifactLoading={artifactLoading}
        governanceImpactPreview={governanceImpactPreview}
        previewLoading={Boolean(currentCleanupKey) && impactLoadingKey === currentCleanupKey}
        currentDocId={currentDocId}
        onArtifactModeChange={onArtifactModeChange}
        onRefreshArtifacts={onRefreshArtifacts}
        onRepairHistoryDatabase={onRepairHistoryDatabase}
        onPreviewCurrentCleanup={() => {
          if (currentDocId) {
            void handlePreviewDelete(currentDocId, currentCleanupOptions);
          }
        }}
        orphanScan={orphanScan}
        onScanOrphans={onScanOrphans}
        onDeleteOrphans={onDeleteOrphans}
        dbMaintenanceSummary={dbMaintenanceSummary}
        dbMaintenanceSummaryLoading={dbMaintenanceSummaryLoading}
        dbBackups={dbBackups}
        dbBackupsLoading={dbBackupsLoading}
        dbCheck={dbCheck}
        dbCheckLoading={dbCheckLoading}
        onRefreshDatabaseMaintenance={onRefreshDatabaseMaintenance}
        onRefreshDatabaseBackups={onRefreshDatabaseBackups}
        onCheckDatabase={onCheckDatabase}
        onBackupDatabase={onBackupDatabase}
        onCompactDatabase={onCompactDatabase}
        onRecoverDatabase={onRecoverDatabase}
        HistoryArtifactGovernancePanel={HistoryArtifactGovernancePanel}
      />

      {!open ? null : (
        <HistoryDocumentList
          items={items}
          currentDocId={currentDocId}
          currentHistory={currentHistory}
          promptProfile={promptProfile}
          promptSequence={promptSequence}
          promptOptions={promptOptions}
          promptWorkflows={promptWorkflows}
          busy={busy}
          cleanupDocId={cleanupDocId}
          impactPreview={impactPreview}
          impactLoadingKey={impactLoadingKey}
          makeDeleteActionKey={makeDeleteActionKey}
          onSelect={onSelect}
          onToggleCleanup={(docId) => setCleanupDocId((value) => value === docId ? null : docId)}
          onPreviewDelete={handlePreviewDelete}
          onDelete={onDelete}
          onDownload={onDownload}
          AssetImpactPanel={AssetImpactPanel}
          HistoryDeleteAction={HistoryDeleteAction}
        />
      )}
    </>
  );
}
