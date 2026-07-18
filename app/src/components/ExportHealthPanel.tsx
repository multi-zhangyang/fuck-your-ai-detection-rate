import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ExportHealthDetailsDialog } from "@/components/ExportHealthDetailsDialog";
import { deriveExportHealthPanelState } from "@/lib/exportHealthViewModel";
import type { ExportResult } from "@/types/app";

export function ExportHealthPanel({ exportResult }: { exportResult: ExportResult | null }) {
  const state = deriveExportHealthPanelState(exportResult);
  if (!state) return null;
  const { statusLabel, statusVariant, sections, blockingIssueCount } = state;
  return (
    <Alert className="shrink-0" variant={blockingIssueCount > 0 ? "destructive" : "default"}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTitle>导出健康</AlertTitle>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <AlertDescription className="mt-2 flex flex-wrap gap-2 text-xs">
            {sections.map((item) => (
              <span key={item.label} className="inline-flex items-center gap-1">
                <span className="text-muted-foreground">{item.label}</span>
                <Badge variant={item.variant}>{item.value}</Badge>
              </span>
            ))}
          </AlertDescription>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ExportHealthDetailsDialog sections={sections} statusLabel={statusLabel} statusVariant={statusVariant} />
        </div>
      </div>
    </Alert>
  );
}
