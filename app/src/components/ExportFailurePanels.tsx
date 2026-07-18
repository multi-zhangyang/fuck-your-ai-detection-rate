import { AlertCircle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  formatExportIssueSample,
  formatExportIssueCount,
} from "@/lib/resultCardHelpers";
import type { ExportFailureDetails } from "@/types/app";

export function ExportFailurePanel({ value }: { value: ExportFailureDetails | null }) {
  if (!value) return null;
  const issueCount = Number(value.issueCount ?? 0) || 0;
  const warningCount = Number(value.warningCount ?? 0) || 0;
  const samples = (value.samples ?? []).map(formatExportIssueSample).filter(Boolean).slice(0, 3);
  const label = value.label || "导出检查";
  return (
    <Alert variant="destructive" className="shrink-0">
      <AlertCircle />
      <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTitle>导出拦截</AlertTitle>
            <Badge variant="danger">{label}</Badge>
            {issueCount || warningCount ? <Badge variant="outline">{formatExportIssueCount(issueCount, warningCount)}</Badge> : null}
          </div>
          <AlertDescription className="mt-2 flex flex-col gap-1 text-xs">
            <span className="break-words">{samples[0] || value.message}</span>
            {value.reportPath ? <span className="break-all text-muted-foreground">{value.reportPath}</span> : null}
          </AlertDescription>
        </div>
        <ExportFailureDetailsDialog value={value} samples={samples} />
      </div>
    </Alert>
  );
}

export function ExportFailureDetailsDialog({ value, samples }: { value: ExportFailureDetails; samples: string[] }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">详情</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(86vh,36rem)] overflow-hidden sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>导出拦截详情</DialogTitle>
          <DialogDescription>{value.label || "导出检查"}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(58vh,24rem)] pr-3">
          <div className="flex flex-col gap-3 text-sm">
            <div className="break-words text-muted-foreground">{value.message}</div>
            {samples.length ? (
              <div className="flex flex-col gap-2">
                {samples.map((sample, index) => (
                  <div key={index} className="break-words rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                    {sample}
                  </div>
                ))}
              </div>
            ) : null}
            {value.reportPath ? <div className="break-all text-xs text-muted-foreground">{value.reportPath}</div> : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
