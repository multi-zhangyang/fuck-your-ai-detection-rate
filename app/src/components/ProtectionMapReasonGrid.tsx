import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import type { ProtectionReasonSummary } from "@/types/app";

export function ReasonGrid({ reasons, protectedUnits }: { reasons: ProtectionReasonSummary[]; protectedUnits: number }) {
  if (!reasons.length) {
    return (
      <Empty className="min-h-[10rem] border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>暂无额外保护原因</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {reasons.map((item) => {
        const percent = protectedUnits ? Math.round((item.count / protectedUnits) * 100) : 0;
        return (
          <div key={item.reason} className="rounded-md border bg-muted/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-black text-foreground">{item.label}</span>
              <Badge variant="outline">{item.count}</Badge>
            </div>
            <Progress value={percent} className="mt-3 h-2" />
            <Badge variant="outline" className="mt-2">{percent}%</Badge>
          </div>
        );
      })}
    </div>
  );
}
