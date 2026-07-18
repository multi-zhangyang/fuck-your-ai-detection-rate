import { ListChecks } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  formatEligibilityReason,
  formatProtectReason,
  formatScopeFlag,
  formatScopeReason,
  formatStructuralRole,
  formatUnitIndex,
} from "@/lib/protectionMapHelpers";
import type { ScopeDiagnosticUnit } from "@/types/app";

export function ScopePoint({ title, index, unit, meta }: { title: string; index?: number | null; unit?: ScopeDiagnosticUnit | null; meta?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">{title}</div>
        <Badge variant="outline">{formatUnitIndex(index)}</Badge>
      </div>
      <div className="mt-2 max-h-[2.75rem] min-h-[2.75rem] overflow-hidden text-sm font-semibold leading-5 text-foreground">
        {unit?.textPreview || "未命中"}
      </div>
      {meta ? <div className="mt-2 text-xs text-muted-foreground">{formatScopeReason(meta)}</div> : null}
    </div>
  );
}

export function CompactDiagnosticStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/25 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

export function ScopeUnitRow({ unit }: { unit: ScopeDiagnosticUnit }) {
  const activeFlags = Object.entries(unit.flags ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([flag]) => flag)
    .slice(0, 5);

  return (
    <div className={cn("rounded-md border p-3", unit.editable ? "bg-muted/40" : "bg-card")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={unit.editable ? "default" : "secondary"}>{unit.editable ? "可改" : "保护"}</Badge>
        <Badge variant="outline">#{unit.unitIndex}</Badge>
        {unit.structuralRole ? <Badge variant="secondary">角色：{formatStructuralRole(unit.structuralRole)}</Badge> : null}
        {unit.protectReason ? <Badge variant="outline">{formatProtectReason(unit.protectReason)}</Badge> : null}
        {unit.styleName ? <Badge variant="outline">{unit.styleName}</Badge> : null}
        {unit.hasNumbering ? <Badge variant="outline">编号</Badge> : null}
        {(unit.formatAnchorCount ?? 0) > 0 ? <Badge variant="info">格式锚点 {unit.formatAnchorCount}</Badge> : null}
        {unit.formatAnchorAmbiguous ? <Badge variant="warning">锚点歧义 · 整段保护</Badge> : null}
        {unit.hasBookmarkRangeAnchor ? <Badge variant="info">书签边界 · 锚点段冻结</Badge> : null}
        {unit.hasCommentRangeAnchor ? <Badge variant="info">批注边界 · 锚点段冻结</Badge> : null}
        {unit.hasSemanticRangeAnchor && !unit.hasBookmarkRangeAnchor && !unit.hasCommentRangeAnchor ? <Badge variant="info">语义范围边界 · 整段冻结</Badge> : null}
        {unit.insideCommentRange && !unit.hasSemanticRangeAnchor ? <Badge variant="info">跨段批注内部 · 整段冻结</Badge> : null}
        {unit.insideBookmarkRange && !unit.hasSemanticRangeAnchor ? <Badge variant={unit.editable ? "success" : "outline"}>书签内部 · 边界节点保留</Badge> : null}
        {unit.hasSemanticPointReference ? <Badge variant="info">脚注/尾注/批注落点 · 整段冻结</Badge> : null}
        {unit.hasMath ? <Badge variant="outline">公式</Badge> : null}
        {unit.hasComplexInline ? <Badge variant="outline">复杂行内结构</Badge> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{unit.textPreview || "空文本单元"}</p>
      {unit.editEligibilityReasonCodes?.length ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {unit.editEligibilityReasonCodes.slice(0, 4).map((reason) => (
            <Badge key={`${unit.unitIndex}-eligibility-${reason}`} variant="outline">
              {formatEligibilityReason(reason)}
            </Badge>
          ))}
        </div>
      ) : null}
      {activeFlags.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ListChecks aria-hidden="true" />
          {activeFlags.map((flag) => (
            <Badge key={`${unit.unitIndex}-${flag}`} variant="info">
              {formatScopeFlag(flag)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
