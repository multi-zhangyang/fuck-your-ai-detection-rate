import { AssetImpactPanel } from "@/components/HistoryDeletePanels";
import { HistoryArtifactGovernanceBody } from "@/components/HistoryArtifactGovernanceBody";
import { HistoryArtifactGovernanceToolbar } from "@/components/HistoryArtifactGovernanceToolbar";
import { getSafeArtifactStats } from "@/lib/historyCardHelpers";
import type {
  HistoryArtifactGovernanceMode,
  HistoryArtifactQueryResponse,
  HistoryDeleteImpact,
} from "@/types/app";

export function HistoryArtifactGovernancePanel({
  query,
  mode,
  loading,
  previewImpact,
  previewLoading,
  currentDocId,
  busy,
  onModeChange,
  onRefresh,
  onRepairIndex,
  onPreviewCurrentCleanup,
}: {
  query: HistoryArtifactQueryResponse | null;
  mode: HistoryArtifactGovernanceMode;
  loading: boolean;
  previewImpact: HistoryDeleteImpact | null;
  previewLoading: boolean;
  currentDocId: string | null;
  busy: boolean;
  onModeChange: (mode: HistoryArtifactGovernanceMode) => void;
  onRefresh: () => void;
  onRepairIndex: () => void;
  onPreviewCurrentCleanup: () => void;
}) {
  const stats = getSafeArtifactStats(query?.stats);
  const previewItems = query?.items.slice(0, 6) ?? [];
  const shouldSuggestRepair = mode === "missing" && (stats.missing > 0 || query?.ok === false);
  const shouldSuggestPreview = (mode === "current" || mode === "large") && Boolean(currentDocId);
  return (
    <section data-ui-section="history-asset-governance" className="rounded-lg border border-border bg-card p-3">
      <HistoryArtifactGovernanceToolbar
        query={query}
        loading={loading}
        busy={busy}
        shouldSuggestRepair={shouldSuggestRepair}
        shouldSuggestPreview={shouldSuggestPreview}
        previewLoading={previewLoading}
        statsExisting={stats.existing}
        onRefresh={onRefresh}
        onRepairIndex={onRepairIndex}
        onPreviewCurrentCleanup={onPreviewCurrentCleanup}
      />
      <HistoryArtifactGovernanceBody
        query={query}
        mode={mode}
        loading={loading}
        stats={stats}
        previewItems={previewItems}
        currentDocId={currentDocId}
        onModeChange={onModeChange}
      />
      {previewImpact ? <div className="mt-3"><AssetImpactPanel impact={previewImpact} /></div> : null}
    </section>
  );
}

export function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <div className="text-[10px] font-semibold text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}

export {
  OrphanGovernancePanel,
  AssetImpactPanel,
  HistoryDeleteAction,
} from "@/components/HistoryDeletePanels";
