export function RoundRunStatusStats({
  totalChunks,
  safeCompletedChunks,
  remainingChunks,
  concurrencyLabel,
  concurrencyDetail,
}: {
  totalChunks: number;
  safeCompletedChunks: number;
  remainingChunks: number;
  concurrencyLabel: string;
  concurrencyDetail: string;
}) {
  return (
    <div className="grid shrink-0 grid-cols-3 gap-2">
      <div className="rounded-xl border border-border/80 bg-background/70 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2"><span className="vercel-kicker">Completed</span><span className="text-[10px] text-muted-foreground">已完成</span></div>
        <div className="mt-1 font-mono text-lg font-semibold tracking-normal">{totalChunks ? `${safeCompletedChunks}/${totalChunks}` : safeCompletedChunks}</div>
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2"><span className="vercel-kicker">Remaining</span><span className="text-[10px] text-muted-foreground">剩余</span></div>
        <div className="mt-1 font-mono text-lg font-semibold tracking-normal">{remainingChunks}</div>
      </div>
      <div className="rounded-xl border border-border/80 bg-background/70 p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2"><span className="vercel-kicker">Concurrency</span><span className="text-[10px] text-muted-foreground">并发</span></div>
        <div className="mt-1 font-mono text-lg font-semibold tracking-normal">{concurrencyLabel}</div>
        <div className="mt-1 truncate text-xs text-muted-foreground">{concurrencyDetail}</div>
      </div>
    </div>
  );
}
