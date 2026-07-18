import { cn } from "@/lib/utils";

export function TextPane({ title, text, tone = "source" }: { title: string; text: string; tone?: "source" | "rewrite" | "danger" }) {
  return (
    <div className={cn(
      "min-w-0 overflow-hidden rounded-lg border p-3",
      tone === "danger"
        ? "border-destructive/30 bg-destructive/5"
        : tone === "rewrite"
          ? "border-border bg-muted/40"
          : "border-border bg-background",
    )}>
      <div className={cn("mb-2 text-xs font-semibold text-muted-foreground", tone === "rewrite" && "text-foreground", tone === "danger" && "text-destructive")}>{title}</div>
      <div className="max-h-[min(58vh,42rem)] min-h-[8rem] overflow-auto whitespace-pre-wrap break-words pr-2 text-sm leading-7 text-foreground">{text}</div>
    </div>
  );
}
