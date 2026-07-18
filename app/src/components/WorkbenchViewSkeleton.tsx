import { Skeleton } from "@/components/ui/skeleton";

export function WorkbenchViewSkeleton({ label = "页面" }: { label?: string }) {
  return (
    <div className="grid h-full min-h-[24rem] w-full grid-rows-[auto_minmax(0,1fr)] gap-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">正在加载{label}</span>
      <div className="flex items-center justify-between rounded-xl border border-border/70 bg-card/80 p-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-64 max-w-[65vw]" />
        </div>
        <Skeleton className="size-9 rounded-lg" />
      </div>
      <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(15rem,0.36fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-border/70 bg-card/80 p-4">
          <Skeleton className="h-9 w-full" />
          <div className="mt-4 flex flex-col gap-2.5">
            {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 w-full rounded-lg" />)}
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-card/80 p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-8 w-24" />
          </div>
          <Skeleton className="mt-6 h-10 w-full" />
          <Skeleton className="mt-3 h-10 w-full" />
          <Skeleton className="mt-4 h-[min(22rem,42svh)] w-full" />
        </div>
      </div>
    </div>
  );
}
