import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScopeUnitRow } from "@/components/ScopeDiagnosticsParts";
import type { DocumentScopeDiagnostics } from "@/types/app";

export function ScopeDiagnosticsDetailSheet({
  open,
  onOpenChange,
  units,
  issues,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: NonNullable<DocumentScopeDiagnostics["units"]>;
  issues: NonNullable<DocumentScopeDiagnostics["issues"]>;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[min(92vw,760px)] flex-col gap-0 sm:max-w-[760px]">
        <SheetHeader className="shrink-0">
          <SheetTitle>正文边界完整诊断</SheetTitle>
          <SheetDescription className="sr-only">查看正文范围、诊断提示和单元序列。</SheetDescription>
        </SheetHeader>
        <Separator className="my-4" />
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <div className="flex flex-col gap-4 pb-4">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-semibold text-foreground">诊断提示</div>
              {issues.length ? (
                issues.map((issue, index) => (
                  <Alert key={`${issue.code}-${index}`} className={issue.severity === "error" ? "border-destructive/30 bg-destructive/10" : undefined}>
                    <AlertTriangle />
                    <AlertTitle>{issue.code}</AlertTitle>
                    <AlertDescription>{issue.message}</AlertDescription>
                  </Alert>
                ))
              ) : (
                <Badge variant="success" className="w-fit">无提示</Badge>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">单元序列</div>
                <Badge variant="outline">{units.length} 项</Badge>
              </div>
              <div className="flex flex-col gap-2">
                {units.map((unit) => (
                  <ScopeUnitRow key={unit.unitIndex} unit={unit} />
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
