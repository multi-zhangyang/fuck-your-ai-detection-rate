import type {
  DocumentStatus,
  BatchRerunResult,
  HistoryRound,
  RerunChunkResult,
  RoundCompareData,
  RoundResult,
} from "@/types/app";

export function createLiveCompareData(status: DocumentStatus, round: number): RoundCompareData {
  return {
    version: 0,
    docId: status.docId,
    round,
    promptProfile: status.promptProfile,
    promptSequence: status.promptSequence,
    inputPath: status.currentInputPath,
    outputPath: status.currentOutputPath,
    manifestPath: status.manifestPath,
    paragraphCount: 0,
    chunkCount: 0,
    updatedAt: new Date().toISOString(),
    chunks: [],
  };
}

export function buildRoundResultFromHistoryRound(roundItem: HistoryRound, compareData: RoundCompareData): RoundResult {
  return {
    round: roundItem.round,
    outputPath: roundItem.outputPath,
    manifestPath: roundItem.manifestPath,
    comparePath: roundItem.comparePath,
    qualityPath: roundItem.qualityPath,
    bodyMapPath: roundItem.bodyMapPath,
    validationPath: roundItem.validationPath,
    chunkLimit: roundItem.chunkLimit ?? 0,
    inputSegmentCount: roundItem.inputSegmentCount ?? compareData.chunkCount,
    outputSegmentCount: roundItem.outputSegmentCount ?? compareData.chunks.length,
    paragraphCount: compareData.paragraphCount,
    docEntry: {},
    roundContext: {},
    qualitySummary: compareData.qualitySummary,
  };
}

export function buildRoundResultFromCompareData(compareData: RoundCompareData): RoundResult {
  return {
    round: compareData.round,
    outputPath: compareData.outputPath,
    manifestPath: compareData.manifestPath,
    comparePath: "",
    chunkLimit: compareData.chunkCount,
    inputSegmentCount: compareData.chunkCount,
    outputSegmentCount: compareData.chunks.length,
    paragraphCount: compareData.paragraphCount,
    docEntry: {},
    roundContext: {},
    qualitySummary: compareData.qualitySummary,
  };
}

export function buildRoundResultFromRerunResult(result: RerunChunkResult, current: RoundResult | null): RoundResult {
  const fallback = buildRoundResultFromCompareData(result.compare);
  return {
    ...(current ?? fallback),
    round: result.compare.round,
    outputPath: result.outputPath,
    manifestPath: result.compare.manifestPath,
    comparePath: result.comparePath || current?.comparePath || fallback.comparePath,
    chunkLimit: result.compare.chunkCount,
    inputSegmentCount: result.compare.chunkCount,
    outputSegmentCount: result.compare.chunks.length,
    paragraphCount: result.compare.paragraphCount,
    qualitySummary: result.compare.qualitySummary,
  };
}

export function buildRoundResultFromBatchRerunResult(result: BatchRerunResult, current: RoundResult | null): RoundResult | null {
  if (!result.compare) {
    return current;
  }
  const fallback = buildRoundResultFromCompareData(result.compare);
  return {
    ...(current ?? fallback),
    round: result.compare.round,
    outputPath: result.outputPath,
    manifestPath: result.compare.manifestPath,
    comparePath: result.comparePath || current?.comparePath || fallback.comparePath,
    chunkLimit: result.compare.chunkCount,
    inputSegmentCount: result.compare.chunkCount,
    outputSegmentCount: result.compare.chunks.length,
    paragraphCount: result.compare.paragraphCount,
    qualitySummary: result.compare.qualitySummary,
  };
}
