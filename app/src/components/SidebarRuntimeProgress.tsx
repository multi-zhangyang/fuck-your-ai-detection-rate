import { useSidebar } from "@/components/ui/sidebar";
import { SidebarFooter } from "@/components/ui/sidebar";
import { Progress } from "@/components/ui/progress";

export function SidebarRuntimeProgress({ status, percent }: { status: string; percent: number }) {
  const { isMobile, state } = useSidebar();
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  if (!isMobile && state === "collapsed") {
    return (
      <SidebarFooter className="items-center px-2 pb-3 pt-2">
        <div
          data-runtime-progress-ring
          className="vercel-icon-frame relative size-8 text-foreground"
          title={`${status} ${value}%`}
          aria-label={`${status} ${value}%`}
        >
          <svg viewBox="0 0 32 32" className="size-7 -rotate-90" aria-hidden="true">
            <circle cx="16" cy="16" r={radius} fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
            <circle
              cx="16"
              cy="16"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="3"
              className="text-primary"
              style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
            />
          </svg>
          <span className="absolute text-[10px] font-semibold">{value}</span>
        </div>
      </SidebarFooter>
    );
  }

  return (
    <SidebarFooter className="px-3 pb-3 pt-2">
      <div className="rounded-lg border border-sidebar-border/80 bg-card/70 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-foreground/70 shadow-[0_0_0_3px_hsl(var(--foreground)/0.06)]" />
            <span className="truncate">{status}</span>
          </span>
          <span className="font-mono text-[11px] font-medium text-foreground">{value}%</span>
        </div>
        <Progress value={value} className="mt-2 h-1.5" />
      </div>
    </SidebarFooter>
  );
}
