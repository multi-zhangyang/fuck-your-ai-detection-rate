import { Lock, Unlock } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatEligibilityReason } from "@/lib/protectionMapHelpers";
import type { ProtectionMapSection } from "@/types/app";

export function SectionRow({ section, totalUnits }: { section: ProtectionMapSection; totalUnits: number }) {
  const Icon = section.editable ? Unlock : Lock;
  const percent = totalUnits ? Math.round((section.count / totalUnits) * 100) : 0;
  return (
    <div className={cn("rounded-md border p-4", section.editable ? "border-foreground/15 bg-muted/40" : "bg-card")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={section.editable ? "text-primary" : "text-muted-foreground"} aria-hidden="true">
              <Icon />
            </span>
            <span className="font-black text-foreground">{section.label}</span>
            {section.structuralRoleLabel ? <Badge variant="secondary">角色：{section.structuralRoleLabel}</Badge> : null}
            <Badge variant={section.editable ? "default" : "outline"}>{section.count} 单元</Badge>
            <Badge variant="outline">#{section.startUnit} - #{section.endUnit}</Badge>
            <Badge variant="outline">{percent}%</Badge>
          </div>
          {section.eligibilityReasonCodes?.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {section.eligibilityReasonCodes.slice(0, 4).map((reason) => (
                <Badge key={`${section.key}-${reason}`} variant="outline">
                  {formatEligibilityReason(reason)}
                </Badge>
              ))}
            </div>
          ) : null}
          {section.samples.length ? (
            <>
              <Separator className="my-3" />
              <div className="flex flex-col gap-2">
                {section.samples.map((sample, index) => (
                  <p key={`${section.key}-sample-${index}`} className="rounded-md bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {sample || "空文本单元"}
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <Badge className="shrink-0" variant={section.editable ? "brand" : "secondary"}>
          {section.editable ? "进入改写" : "锁定保留"}
        </Badge>
      </div>
    </div>
  );
}
