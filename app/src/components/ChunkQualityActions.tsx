import { useId, useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { T } from "@/lib/chunkQualityBarCopy";
import type { RoundCompareData } from "@/types/app";

export function ChunkQualityActions({
  chunk,
  busy,
  selectedBaseDecision,
  isConfirmed,
  isHighRiskFailedOutput,
  reviewToolsVisible,
  onAdoptRewrite,
  onUseSource,
  onRerun,
}: {
  chunk: RoundCompareData["chunks"][number];
  busy: boolean;
  selectedBaseDecision: string;
  isConfirmed: boolean;
  isHighRiskFailedOutput: boolean;
  reviewToolsVisible: boolean;
  onAdoptRewrite: () => void;
  onUseSource: () => void;
  onRerun: (userFeedback?: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  const feedbackId = useId();
  const strategyReviewPending = chunk.rateAuditStrategyReviewRequired === true && !isConfirmed;
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-2">
        <Button
          size="sm"
          variant={selectedBaseDecision === "rewrite" && isConfirmed ? "default" : isHighRiskFailedOutput ? "outlineDanger" : "outline"}
          onClick={onAdoptRewrite}
          disabled={busy || isHighRiskFailedOutput}
          title={isHighRiskFailedOutput ? "该模型输出未通过发布门禁，不能采用或导出" : undefined}
        >
          {isHighRiskFailedOutput
            ? "失败候选不可采用"
            : isConfirmed && selectedBaseDecision === "rewrite"
              ? `${T.confirmedChoice}${T.useRewrite}`
              : T.useRewrite}
        </Button>
        <Button size="sm" variant={selectedBaseDecision === "source" && isConfirmed ? "default" : "outline"} onClick={onUseSource} disabled={busy}>{isConfirmed && selectedBaseDecision === "source" ? `${T.confirmedChoice}${T.useSource}` : T.useSource}</Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onRerun(feedback)}
          disabled={busy || strategyReviewPending}
          title={strategyReviewPending ? "请先在本块选择采用改写或保留原文" : undefined}
        >
          <RotateCcw data-icon="inline-start" />
          {strategyReviewPending ? "先确认候选" : T.targetedRerun}
        </Button>
      </div>
      {reviewToolsVisible ? (
        <div className="flex min-w-0 flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-foreground">
          <Field className="gap-2">
            <FieldLabel htmlFor={feedbackId} className="text-xs text-muted-foreground">补充重跑要求（可选）</FieldLabel>
            <Textarea
              id={feedbackId}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={T.feedbackPlaceholder}
              className="min-h-16 resize-none text-xs"
            />
            {chunk.rerunUserFeedbackPresent ? (
              <div className="text-[11px] opacity-75">
                {T.lastFeedback}：已提交（{Math.max(0, Number(chunk.rerunUserFeedbackCharCount) || 0)} 字，内容未保存）
              </div>
            ) : null}
          </Field>
        </div>
      ) : null}
    </>
  );
}
