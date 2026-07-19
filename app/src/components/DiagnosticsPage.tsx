import { useState } from "react";
import { Activity, AlertCircle } from "lucide-react";

import {
  DiagnosticTaskAlert as DiagnosticTaskAlertView,
} from "@/components/DiagnosticsPanels";
import { DiagnosticsPageHeader } from "@/components/DiagnosticsPageHeader";
import { DiagnosticsProblemAndChecksSection } from "@/components/DiagnosticsProblemAndChecksSection";
import { DiagnosticsRuntimeSections } from "@/components/DiagnosticsRuntimeSections";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  const [copyError, setCopyError] = useState("");
  const copyDiagnostics = async () => {
    if (!value) return;
    setCopyError("");
    try {
      await copyTextToClipboard(JSON.stringify(buildShareableDiagnostics(value), null, 2));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      setCopied(false);
      setCopyError(error instanceof Error && error.message
        ? error.message
        : "复制诊断失败，请检查浏览器剪贴板权限后重试。");
    }
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
        copyError={Boolean(copyError)}
        onCopy={() => { void copyDiagnostics(); }}
        onRefresh={onRefresh}
      />

      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
        {copyError ? (
          <Alert variant="destructive" className="shrink-0">
            <AlertCircle />
            <AlertTitle>复制诊断失败</AlertTitle>
            <AlertDescription>{copyError}</AlertDescription>
          </Alert>
        ) : null}
        {value ? (
          <ScrollArea className="min-h-0 flex-1 pr-1">
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
    </div>
  );
}
