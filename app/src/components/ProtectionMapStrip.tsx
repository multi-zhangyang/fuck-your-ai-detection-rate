import type { ProtectionMapSection } from "@/types/app";

export function BoundaryStrip({ sections, totalUnits }: { sections: ProtectionMapSection[]; totalUnits: number }) {
  if (!sections.length || totalUnits <= 0) {
    return null;
  }
  return (
    <div className="rounded-md border bg-muted/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-black text-foreground">文档结构条</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" />
            可改写
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            保护区
          </span>
        </div>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-muted">
        {sections.map((section, index) => (
          <div
            key={`${section.key}-${index}-strip`}
            title={`${section.label}：${section.count} 个单元`}
            className={section.editable ? "bg-primary" : "bg-muted-foreground/30"}
            style={{ width: `${Math.max(1, (section.count / totalUnits) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
