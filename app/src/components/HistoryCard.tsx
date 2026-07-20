import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HistoryCardBody } from "@/components/HistoryCardBody";
import { HistoryCardHeader } from "@/components/HistoryCardHeader";
import type { HistoryCardProps } from "@/components/HistoryCardProps";
import { useHistoryCardState } from "@/hooks/useHistoryCardState";

export function HistoryCard({
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
  onToggle,
  onSelect,
  onPreviewDelete,
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
}: HistoryCardProps) {
  const state = useHistoryCardState({
    items,
    promptProfile,
    promptSequence,
    promptOptions,
    promptWorkflows,
    orphanScan,
    artifactQuery,
    artifactLoading,
    currentDocId,
    onPreviewDelete,
  });

  return (
    <Card className="min-h-full overflow-visible">
      <CardHeader className="flex flex-col gap-3 pb-3">
        <HistoryCardHeader
          promptProfile={promptProfile}
          promptWorkflows={promptWorkflows}
          open={open}
          busy={busy}
          itemsLength={items.length}
          onToggle={onToggle}
        />
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <HistoryCardBody
          currentDocId={currentDocId}
          currentHistory={currentHistory}
          items={items}
          promptProfile={promptProfile}
          promptSequence={promptSequence}
          promptOptions={promptOptions}
          promptWorkflows={promptWorkflows}
          orphanScan={orphanScan}
          artifactQuery={artifactQuery}
          artifactMode={artifactMode}
          artifactLoading={artifactLoading}
          open={open}
          busy={busy}
          onSelect={onSelect}
          onDelete={onDelete}
          onArtifactModeChange={onArtifactModeChange}
          onRefreshArtifacts={onRefreshArtifacts}
          onRepairHistoryDatabase={onRepairHistoryDatabase}
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
          onDownload={onDownload}
          impactPreview={state.impactPreview}
          impactLoadingKey={state.impactLoadingKey}
          maintenanceOpen={state.maintenanceOpen}
          setMaintenanceOpen={state.setMaintenanceOpen}
          cleanupDocId={state.cleanupDocId}
          setCleanupDocId={state.setCleanupDocId}
          continuationCount={state.continuationCount}
          exportableCount={state.exportableCount}
          missingDocumentCount={state.missingDocumentCount}
          maintenanceStateLabel={state.maintenanceStateLabel}
          totalBytesLabel={state.totalBytesLabel}
          currentCleanupOptions={state.currentCleanupOptions}
          currentCleanupKey={state.currentCleanupKey}
          governanceImpactPreview={state.governanceImpactPreview}
          handlePreviewDelete={state.handlePreviewDelete}
        />
      </CardContent>
    </Card>
  );
}
