import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExportHealthBadgeVariant, ExportHealthSection } from "@/lib/resultCardHelpers";

export function ExportHealthDetailsDialog({ sections, statusLabel, statusVariant }: { sections: ExportHealthSection[]; statusLabel: string; statusVariant: ExportHealthBadgeVariant }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">详情</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[min(86vh,42rem)] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <DialogTitle>导出健康详情</DialogTitle>
            <Badge variant={statusVariant}>{statusLabel}</Badge>
          </div>
          <DialogDescription>保护、审计、预检、结构</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(64vh,30rem)] pr-3">
          <div className="flex flex-col gap-3">
            {sections.map((section) => (
              <div key={section.label} className="rounded-md border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{section.label}</div>
                  <Badge variant={section.variant}>{section.value}</Badge>
                </div>
                {section.samples.length ? (
                  <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground">
                    {section.samples.map((sample, index) => (
                      <div key={`${section.label}-${index}`} className="break-words rounded-md bg-muted px-2 py-1.5">
                        {sample}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">{section.emptyText}</div>
                )}
                {section.path ? <div className="mt-2 break-all text-xs text-muted-foreground">{section.path}</div> : null}
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
