import {
  ExportFailurePanel as ExportFailurePanelView,
  ExportHealthPanel as ExportHealthPanelView,
  LiveHint as LiveHintView,
} from "@/components/ExportHealthPanels";
import type { DiffFilterMode } from "@/components/RewriteDiffPanel";
import {
  hasChunkNumberRisk as hasChunkNumberRiskHelper,
  hasChunkCitationRisk as hasChunkCitationRiskHelper,
  getDiffFilterEmptyState as getDiffFilterEmptyStateHelper,
  getChunkReviewReasons as getChunkReviewReasonsHelper,
} from "@/lib/resultCardHelpers";
import type { ExportFailureDetails, ExportResult, RoundCompareData } from "@/types/app";

const T = {
  noReviewChunks: "暂无需处理块",
  noFailedChunks: "暂无重跑失败块",
  noHighRiskChunks: "暂无高风险块",
};

export function ExportHealthPanel({ exportResult }: { exportResult: ExportResult | null }) {
  return <ExportHealthPanelView exportResult={exportResult} />;
}

export function ExportFailurePanel({ value }: { value: ExportFailureDetails | null }) {
  return <ExportFailurePanelView value={value} />;
}

export function LiveHint({ running }: { running: boolean }) {
  return <LiveHintView running={running} />;
}

export function getDiffFilterEmptyState(mode: DiffFilterMode): { title: string } {
  return getDiffFilterEmptyStateHelper(mode, {
    noFailedChunks: T.noFailedChunks,
    noHighRiskChunks: T.noHighRiskChunks,
    noReviewChunks: T.noReviewChunks,
  });
}

export function hasChunkNumberRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return hasChunkNumberRiskHelper(chunk);
}

export function hasChunkCitationRisk(chunk: RoundCompareData["chunks"][number]): boolean {
  return hasChunkCitationRiskHelper(chunk);
}

export function getChunkReviewReasons(chunk: RoundCompareData["chunks"][number], extraReasons: string[] = []): string[] {
  return getChunkReviewReasonsHelper(chunk, extraReasons);
}
