import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatFailedAttemptEvidence } from "@/lib/failedAttemptEvidence";
import { REWRITE_DIFF_PANEL_COPY as T } from "@/lib/rewriteDiffPanelViewModel";
import type { RerunFailure } from "@/lib/diffFilterModel";
import type { RoundCompareChunk } from "@/types/app";

export function RewriteDiffChunkAlerts({
  chunk,
  rerunFailure,
  hasHighRiskFailedOutput,
  strategyReviewRequired,
  hasChangedText,
  hasNumberRisk,
  hasCitationRisk,
}: {
  chunk: RoundCompareChunk;
  rerunFailure?: RerunFailure | null;
  hasHighRiskFailedOutput: boolean;
  strategyReviewRequired: boolean;
  hasChangedText: boolean;
  hasNumberRisk: boolean;
  hasCitationRisk: boolean;
}) {
  const rerunFailureDetail = rerunFailure
    ? formatFailedAttemptEvidence(rerunFailure, "重跑未完成。失败正文与原始错误未保存。")
    : "";
  const hardGateDetail = formatFailedAttemptEvidence(chunk);
  return (
    <>
      {rerunFailure ? (
        <Alert variant="destructive" className="xl:col-span-2 py-3 text-xs leading-5">
          <AlertTitle>{T.rerunFailure}</AlertTitle>
          <AlertDescription className="text-xs">
            <span>{rerunFailureDetail}</span>
          </AlertDescription>
        </Alert>
      ) : null}
      {hasHighRiskFailedOutput ? (
        <Alert variant="destructive" className="xl:col-span-2 py-3 text-xs leading-5">
          <AlertTitle>{T.highRiskRewrite}</AlertTitle>
          <AlertDescription className="text-xs">
            {hardGateDetail} 未通过门禁的候选已强制隔离，不能采用或导出；请保留原文或重新生成。
          </AlertDescription>
        </Alert>
      ) : null}
      {strategyReviewRequired ? (
        <Alert variant="default" className="xl:col-span-2 py-3 text-xs leading-5">
          <AlertTitle>定点策略候选待确认</AlertTitle>
          <AlertDescription className="text-xs">
            候选已通过目标维度复评分；在你明确采用前，RateAudit 与导出仍使用本轮安全原文。
          </AlertDescription>
        </Alert>
      ) : null}
      {hasChangedText || hasNumberRisk || hasCitationRisk ? (
        <div className="xl:col-span-2 flex flex-wrap items-center gap-2 text-xs">
          {hasChangedText ? <Badge variant="secondary">{T.changedChunks}</Badge> : null}
          {hasNumberRisk ? <Badge variant="warning">{T.numberRisk}</Badge> : null}
          {hasCitationRisk ? <Badge variant="warning">{T.citationRisk}</Badge> : null}
        </div>
      ) : null}
    </>
  );
}
