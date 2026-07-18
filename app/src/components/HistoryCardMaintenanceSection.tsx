import { Wrench } from "lucide-react";
import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HistoryDatabaseMaintenancePanel } from "@/components/HistoryDatabaseMaintenancePanel";
import { OrphanGovernancePanel } from "@/components/HistoryGovernancePanels";
import type {
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryDatabaseBackupListResult,
  HistoryDatabaseMaintenanceSummary,
  HistoryDeleteImpact,
  HistoryOrphanScanResult,
} from "@/types/app";

type GovernancePanelProps = {
  query: HistoryArtifactQueryResponse | null;
  mode: HistoryArtifactGovernanceMode;
  loading: boolean;
  previewImpact: HistoryDeleteImpact | null;
  previewLoading: boolean;
  currentDocId: string | null;
  busy: boolean;
  onModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefresh: () => void;
  onRepairIndex: () => void;
  onPreviewCurrentCleanup: () => void;
};

export function HistoryCardMaintenanceSection({
  busy,
  maintenanceOpen,
  onToggleMaintenance,
  maintenanceStateLabel,
  maintenanceBadgeVariant,
  artifactQuery,
  artifactMode,
  artifactLoading,
  governanceImpactPreview,
  previewLoading,
  currentDocId,
  onArtifactModeChange,
  onRefreshArtifacts,
  onRepairHistoryDatabase,
  onPreviewCurrentCleanup,
  dbMaintenanceSummary,
  dbMaintenanceSummaryLoading,
  dbBackups,
  dbBackupsLoading,
  onRefreshDatabaseMaintenance,
  onRefreshDatabaseBackups,
  onBackupDatabase,
  onCompactDatabase,
  onRecoverDatabase,
  orphanScan,
  onScanOrphans,
  onDeleteOrphans,
  HistoryArtifactGovernancePanel,
}: {
  busy: boolean;
  maintenanceOpen: boolean;
  onToggleMaintenance: () => void;
  maintenanceStateLabel: string;
  maintenanceBadgeVariant: "warning" | "secondary" | "outline";
  artifactQuery: HistoryArtifactQueryResponse | null;
  artifactMode: HistoryArtifactGovernanceMode;
  artifactLoading: boolean;
  governanceImpactPreview: HistoryDeleteImpact | null;
  previewLoading: boolean;
  currentDocId: string | null;
  onArtifactModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefreshArtifacts: () => void;
  onRepairHistoryDatabase: () => void;
  onPreviewCurrentCleanup: () => void;
  dbMaintenanceSummary: HistoryDatabaseMaintenanceSummary | null;
  dbMaintenanceSummaryLoading: boolean;
  dbBackups: HistoryDatabaseBackupListResult | null;
  dbBackupsLoading: boolean;
  onRefreshDatabaseMaintenance: () => void;
  onRefreshDatabaseBackups: () => void;
  onBackupDatabase: () => void;
  onCompactDatabase: () => void;
  onRecoverDatabase: (backupPath: string | null) => void;
  orphanScan: HistoryOrphanScanResult | null;
  onScanOrphans: () => void;
  onDeleteOrphans: () => void;
  HistoryArtifactGovernancePanel: ComponentType<GovernancePanelProps>;
}) {
  return (
    <section data-ui-section="history-advanced-maintenance" className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">高级维护</Badge>
            <Badge variant={maintenanceBadgeVariant}>{maintenanceStateLabel}</Badge>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onToggleMaintenance} disabled={busy}>
          <Wrench data-icon="inline-start" />
          {maintenanceOpen ? "收起" : "维护"}
        </Button>
      </div>
      {maintenanceOpen ? (
        <div className="mt-4 flex flex-col gap-4">
          <HistoryArtifactGovernancePanel
            query={artifactQuery}
            mode={artifactMode}
            loading={artifactLoading}
            previewImpact={governanceImpactPreview}
            previewLoading={previewLoading}
            currentDocId={currentDocId}
            busy={busy}
            onModeChange={onArtifactModeChange}
            onRefresh={onRefreshArtifacts}
            onRepairIndex={onRepairHistoryDatabase}
            onPreviewCurrentCleanup={onPreviewCurrentCleanup}
          />
          <HistoryDatabaseMaintenancePanel
            summary={dbMaintenanceSummary}
            summaryLoading={dbMaintenanceSummaryLoading}
            backups={dbBackups}
            backupsLoading={dbBackupsLoading}
            busy={busy}
            onRefresh={onRefreshDatabaseMaintenance}
            onRefreshBackups={onRefreshDatabaseBackups}
            onBackup={onBackupDatabase}
            onCompact={onCompactDatabase}
            onRecover={onRecoverDatabase}
          />
          <OrphanGovernancePanel
            scan={orphanScan}
            busy={busy}
            onScan={onScanOrphans}
            onDelete={onDeleteOrphans}
          />
        </div>
      ) : null}
    </section>
  );
}
