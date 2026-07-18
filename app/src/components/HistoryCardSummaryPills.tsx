import { StatPill } from "@/components/HistoryGovernancePanels";

export function HistoryCardSummaryPills({
  continuationCount,
  exportableCount,
  totalBytesLabel,
}: {
  continuationCount: number;
  exportableCount: number;
  totalBytesLabel: string;
}) {
  return (
    <div data-ui-section="history-user-summary" className="grid gap-3 lg:grid-cols-3">
      <StatPill label="可继续" value={`${continuationCount} 篇`} />
      <StatPill label="可导出" value={`${exportableCount} 篇`} />
      <StatPill label="可释放" value={totalBytesLabel} />
    </div>
  );
}
