import { useState } from "react";
import { Activity } from "lucide-react";

import {
  DiagnosticTaskAlert as DiagnosticTaskAlertView,
} from "@/components/DiagnosticsPanels";
import { DiagnosticsPageHeader } from "@/components/DiagnosticsPageHeader";
import { DiagnosticsProblemAndChecksSection } from "@/components/DiagnosticsProblemAndChecksSection";
import { DiagnosticsRuntimeSections } from "@/components/DiagnosticsRuntimeSections";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  buildShareableDiagnostics,
  copyTextToClipboard,
  type DiagnosticTaskItem,
} from "@/lib/diagnosticsHelpers";
import { deriveDiagnosticsPageViewState } from "@/lib/diagnosticsPageViewModel";
import type { EnvironmentDiagnostics } from "@/types/app";

function DiagnosticTaskAlert({ item }: { item: DiagnosticTaskItem }) {
  return <DiagnosticTaskAlertView item={item} />;
}

export function DiagnosticsPage({
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
  const {
    checks,
    warningCount,
    errorCount,
    passedCount,
    healthPercent,
    statusText,
    statusVariant,
    problemChecks,
    activeTaskCount,
    recentTaskCount,
    taskItems,
    taskStateStore,
    configReady,
  } = deriveDiagnosticsPageViewState(value);
  const [copied, setCopied] = useState(false);
  const copyDiagnostics = async () => {
    if (!value) return;
    await copyTextToClipboard(JSON.stringify(buildShareableDiagnostics(value), null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden">
      <DiagnosticsPageHeader
        value={value}
        busy={busy}
        statusText={statusText}
        statusVariant={statusVariant}
        passedCount={passedCount}
        checksCount={checks.length}
        errorCount={errorCount}
        warningCount={warningCount}
        configReady={configReady}
        activeTaskCount={activeTaskCount}
        recentTaskCount={recentTaskCount}
        taskStateStore={taskStateStore}
        copied={copied}
        onCopy={() => { void copyDiagnostics(); }}
        onRefresh={onRefresh}
      />

      {value ? (
        <ScrollArea className="min-h-0 pr-1">
          <div className="flex flex-col gap-3 pb-2">
            <DiagnosticsProblemAndChecksSection
              problemChecks={problemChecks}
              checks={checks}
              healthPercent={healthPercent}
            />
            <DiagnosticsRuntimeSections
              value={value}
              busy={busy}
              activeTaskCount={activeTaskCount}
              taskItems={taskItems}
              taskStateStore={taskStateStore}
              onCleanupTaskSnapshots={onCleanupTaskSnapshots}
              DiagnosticTaskAlert={DiagnosticTaskAlert}
            />
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
