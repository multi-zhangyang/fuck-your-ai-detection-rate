import { roundArtifactPathsMatch } from "@/lib/roundArtifactSnapshot";
import type {
  ExportResult,
  ExportRoundOptions,
  HistoryExportSelection,
  RoundArtifactSnapshot,
  RoundCompareData,
} from "@/types/app";

export function buildRevisionBoundExportOptions(
  snapshot: RoundArtifactSnapshot,
): ExportRoundOptions {
  return {
    expectedDocId: snapshot.docId,
    expectedRound: snapshot.round,
    expectedCompareRevision: snapshot.compareRevision,
    expectedContentRevision: snapshot.contentRevision,
    expectedArtifactSnapshotDigest: snapshot.artifactSnapshotDigest,
  };
}

export function historyExportSelectionMatchesSnapshot(
  selection: HistoryExportSelection,
  snapshot: RoundArtifactSnapshot,
): boolean {
  return selection.docId === snapshot.docId
    && selection.round === snapshot.round
    && roundArtifactPathsMatch(selection.outputPath, snapshot.outputPath);
}

export function exportResultMatchesOutput(
  result: ExportResult | null | undefined,
  outputPath: string | null | undefined,
): result is ExportResult {
  return Boolean(
    result?.outputPath
    && outputPath
    && roundArtifactPathsMatch(result.outputPath, outputPath),
  );
}

export function exportResultMatchesCompare(
  result: ExportResult | null | undefined,
  compare: RoundCompareData | null | undefined,
): result is ExportResult {
  return Boolean(
    compare
    && exportResultMatchesOutput(result, compare.outputPath)
    && result.docId
    && result.docId === compare.docId
    && result.round === compare.round
    && result.compareRevision
    && compare.compareRevision
    && result.compareRevision === compare.compareRevision,
  );
}
