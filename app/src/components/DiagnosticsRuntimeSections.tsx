import type { ComponentType } from "react";

import { DiagnosticsTaskSections } from "@/components/DiagnosticsTaskSections";
import { DiagnosticsHistoryDatabaseSection } from "@/components/DiagnosticsHistoryDatabaseSection";
import { DiagnosticsWorkspaceAndConfigSection } from "@/components/DiagnosticsWorkspaceAndConfigSection";
import type { DiagnosticTaskItem } from "@/lib/diagnosticsHelpers";
import type { EnvironmentDiagnostics } from "@/types/app";

export function DiagnosticsRuntimeSections({
  value,
  busy,
  activeTaskCount,
  taskItems,
  taskStateStore,
  onCleanupTaskSnapshots,
  DiagnosticTaskAlert,
}: {
  value: EnvironmentDiagnostics;
  busy: boolean;
  activeTaskCount: number;
  taskItems: DiagnosticTaskItem[];
  taskStateStore: EnvironmentDiagnostics["taskStateStore"];
  onCleanupTaskSnapshots: () => void;
  DiagnosticTaskAlert: ComponentType<{ item: DiagnosticTaskItem }>;
}) {
  return (
    <>
      <DiagnosticsWorkspaceAndConfigSection value={value} />
      <DiagnosticsHistoryDatabaseSection value={value.historyDatabase} />
      <DiagnosticsTaskSections
        busy={busy}
        activeTaskCount={activeTaskCount}
        taskItems={taskItems}
        taskStateStore={taskStateStore}
        onCleanupTaskSnapshots={onCleanupTaskSnapshots}
        DiagnosticTaskAlert={DiagnosticTaskAlert}
      />
    </>
  );
}
