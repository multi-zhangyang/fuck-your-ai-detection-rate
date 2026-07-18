import { Badge } from "@/components/ui/badge";
import {
  formatChunkFlag,
  formatProtectedTypes,
  formatRerunStrategy,
} from "@/lib/resultCardHelpers";
import { T } from "@/lib/chunkQualityBarCopy";
import type { RoundCompareData } from "@/types/app";

export function ChunkQualityMeta({
  chunk,
  quality,
  isHighRiskFailedOutput,
  isValidationFallback,
  needsReview,
  visibleFlags,
  advisoryFlags,
  isConfirmed,
  decisionLabel,
  reviewReasons,
}: {
  chunk: RoundCompareData["chunks"][number];
  quality?: {
    expansionRatio?: number;
    protectedTokenCount?: number;
    protectedTokenTypes?: Record<string, number>;
    missingCitationCount?: number;
    introducedColloquialPhraseCount?: number;
    introducedColloquialPhrases?: string[];
    styleMetrics?: {
      sentenceCount?: number;
      sentenceVariance?: number;
      burstinessRatio?: number;
      passiveDensity?: number;
      chengyuDensity?: number;
      connectorDensity?: number;
      paragraphCount?: number;
      paragraphLengthCv?: number;
      adjacentParagraphUniformity?: number;
    };
  };
  isHighRiskFailedOutput: boolean;
  isValidationFallback: boolean;
  needsReview: boolean;
  visibleFlags: string[];
  advisoryFlags: string[];
  isConfirmed: boolean;
  decisionLabel: string;
  reviewReasons: string[];
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {isHighRiskFailedOutput ? <Badge variant="danger">{T.highRisk}</Badge> : null}
        {!isHighRiskFailedOutput ? <Badge variant={needsReview ? "warning" : "success"}>{needsReview ? T.needsReview : T.stable}</Badge> : null}
        {!isHighRiskFailedOutput && isValidationFallback ? <Badge variant="warning">{T.sourceFallback}</Badge> : null}
        <span>{T.expansion} {quality?.expansionRatio ?? "-"}</span>
        <span>{T.protectedTokens} {quality?.protectedTokenCount ?? 0}</span>
        {formatProtectedTypes(quality?.protectedTokenTypes) ? <span>{formatProtectedTypes(quality?.protectedTokenTypes)}</span> : null}
        <span>{T.citationMissing} {quality?.missingCitationCount ?? 0}</span>
        {(quality?.introducedColloquialPhraseCount ?? 0) > 0 ? (
          <Badge variant="warning">
            {T.colloquialIntroduced} {quality?.introducedColloquialPhraseCount}
            {quality?.introducedColloquialPhrases?.length ? `：${quality.introducedColloquialPhrases.join("、")}` : ""}
          </Badge>
        ) : null}
        {quality?.styleMetrics ? (
          <span className="text-muted-foreground">
            {T.styleMetrics}：
            {T.burstinessRatio} {quality.styleMetrics.burstinessRatio?.toFixed(2) ?? "-"}
            <span className="mx-1">·</span>
            {T.passiveDensity} {quality.styleMetrics.passiveDensity?.toFixed(2) ?? "-"}
            <span className="mx-1">·</span>
            {T.chengyuDensity} {quality.styleMetrics.chengyuDensity?.toFixed(2) ?? "-"}
            {(quality.styleMetrics.paragraphCount ?? 0) >= 2 ? (
              <>
                <span className="mx-1">·</span>
                {T.paragraphLengthCv} {quality.styleMetrics.paragraphLengthCv?.toFixed(2) ?? "-"}
                <span className="mx-1">·</span>
                {T.adjacentParagraphUniformity} {quality.styleMetrics.adjacentParagraphUniformity?.toFixed(2) ?? "-"}
              </>
            ) : null}
          </span>
        ) : null}
        {chunk.rerunStrategy?.length ? <span>{T.rerunStrategy} {chunk.rerunStrategy.map(formatRerunStrategy).join(" / ")}</span> : null}
        {visibleFlags.slice(0, 3).map((flag) => <Badge key={flag} variant="outline">{formatChunkFlag(flag)}</Badge>)}
        {!needsReview && advisoryFlags.length ? <Badge variant="outline">{T.risk} {advisoryFlags.slice(0, 2).map(formatChunkFlag).join(" / ")}</Badge> : null}
        <Badge variant={isConfirmed ? "success" : "secondary"}>{isConfirmed ? T.confirmedChoice : T.defaultChoice}：{decisionLabel}</Badge>
      </div>
      {reviewReasons.length ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-muted/50 px-2 py-2">
          <span className="font-medium text-foreground">{T.reviewReason}：</span>
          {reviewReasons.map((reason) => (
            <Badge key={reason} variant="outline" className="max-w-full whitespace-normal text-left">
              {reason}
            </Badge>
          ))}
        </div>
      ) : null}
    </>
  );
}
