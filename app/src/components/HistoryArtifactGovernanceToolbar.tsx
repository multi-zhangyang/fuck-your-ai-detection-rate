import { Search, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getArtifactQueryStateLabel } from "@/lib/historyCardHelpers";
import type { HistoryArtifactQueryResponse } from "@/types/app";

export function HistoryArtifactGovernanceToolbar({
  query,
  loading,
  busy,
  shouldSuggestRepair,
  shouldSuggestPreview,
  previewLoading,
  statsExisting,
  onRefresh,
  onRepairIndex,
  onPreviewCurrentCleanup,
}: {
  query: HistoryArtifactQueryResponse | null;
  loading: boolean;
  busy: boolean;
  shouldSuggestRepair: boolean;
  shouldSuggestPreview: boolean;
  previewLoading: boolean;
  statsExisting: number;
  onRefresh: () => void;
  onRepairIndex: () => void;
  onPreviewCurrentCleanup: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">资产治理</Badge>
          <Badge variant={query?.ok === false ? "warning" : "outline"}>{getArtifactQueryStateLabel(query, loading)}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={busy || loading}>
          <Search data-icon="inline-start" />
          {loading ? "读取中" : "刷新"}
        </Button>
        {shouldSuggestRepair ? (
          <Button variant="outline" size="sm" onClick={onRepairIndex} disabled={busy || loading}>
            <Wrench data-icon="inline-start" />
            修复索引
          </Button>
        ) : null}
        {shouldSuggestPreview ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onPreviewCurrentCleanup}
            disabled={busy || loading || previewLoading || !statsExisting}
          >
            <Search data-icon="inline-start" />
            {previewLoading ? "预览中" : "先看影响"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
