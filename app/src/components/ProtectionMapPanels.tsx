import type { ReactNode } from "react";

export function IconFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
      {children}
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/25 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

export { BoundaryStrip } from "@/components/ProtectionMapStrip";
export { ReasonGrid } from "@/components/ProtectionMapReasonGrid";
export { SectionRow } from "@/components/ProtectionMapSectionRow";
export { ScopeDiagnosticsPanel } from "@/components/ScopeDiagnosticsPanel";
