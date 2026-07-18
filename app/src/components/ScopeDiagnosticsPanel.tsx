import { AlertTriangle, FileSearch, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CompactDiagnosticStat,
  ScopePoint,
} from "@/components/ScopeDiagnosticsParts";
import { ScopeDiagnosticsDetailSheet } from "@/components/ScopeDiagnosticsDetailSheet";
import type { DocumentScopeDiagnostics } from "@/types/app";

export {
  ScopePoint,
  CompactDiagnosticStat,
  ScopeUnitRow,
} from "@/components/ScopeDiagnosticsParts";

export function ScopeDiagnosticsPanel({ value }: { value: DocumentScopeDiagnostics | null }) {
  const [open, setOpen] = useState(false);

  if (!value || !value.available) {
    return null;
  }

  const scope = value.scope ?? {};
  const units = value.units ?? [];
  const issues = value.issues ?? [];
  const hasIssues = value.issueCount > 0;
  const formatAnchorCount = units.reduce(
    (total, unit) => total + Math.max(0, Number(unit.formatAnchorCount) || 0),
    0,
  );
  const ambiguousAnchorUnitCount = units.filter((unit) => unit.formatAnchorAmbiguous === true).length;
  const semanticRangeAnchorUnitCount = units.filter((unit) => unit.hasSemanticRangeAnchor === true).length;
  const bookmarkRangeCount = Math.max(0, Number(value.bookmarkRangeCount) || 0);
  const commentRangeCount = Math.max(0, Number(value.commentRangeCount) || 0);
  const kindAwareSemanticRanges = value.bookmarkRangeCount !== undefined || value.commentRangeCount !== undefined;
  const semanticRangeCoveredUnitCount = Math.max(
    Math.max(0, Number(value.semanticRangeCoveredUnitCount) || 0),
    units.filter((unit) => unit.insideCommentRange === true || (!kindAwareSemanticRanges && unit.insideSemanticRange === true)).length,
  );
  const bookmarkRangeInteriorUnitCount = Math.max(
    Math.max(0, Number(value.bookmarkRangeInteriorUnitCount) || 0),
    units.filter((unit) => unit.insideBookmarkRange === true).length,
  );
  const editableBookmarkRangeInteriorUnitCount = Math.max(
    Math.max(0, Number(value.editableBookmarkRangeInteriorUnitCount) || 0),
    units.filter((unit) => unit.insideBookmarkRange === true && unit.editable).length,
  );
  const semanticRangeCount = Math.max(0, Number(value.semanticRangeCount) || 0);
  const semanticRangeTopologyValid = value.semanticRangeTopologyValid === true;
  const semanticPointReferenceUnitCount = units.filter((unit) => unit.hasSemanticPointReference === true).length;
  const templateInstructionUnitCount = Math.max(
    Math.max(0, Number(value.templateInstructionUnitCount) || 0),
    units.filter((unit) => unit.structuralRole === "template_instruction").length,
  );

  return (
    <>
      <Card data-ui-section="docx-scope-diagnostics">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">正文诊断</Badge>
                <Badge variant={value.ok ? "success" : "danger"}>{value.ok ? "可用" : "需处理"}</Badge>
                <Badge variant={hasIssues ? "warning" : "outline"}>{value.issueCount} 条</Badge>
              </div>
              <CardTitle className="text-lg">正文边界诊断</CardTitle>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              <FileSearch data-icon="inline-start" />
              查看完整诊断
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ScopePoint title="起点" index={scope.startIndex} unit={scope.startUnit} meta={scope.startReason} />
            <ScopePoint title="终点" index={scope.endIndex} unit={scope.endUnit} meta={scope.endReason} />
            <ScopePoint title="致谢" index={scope.acknowledgementIndex} unit={scope.acknowledgementUnit} />
            <ScopePoint title="后置边界" index={scope.postAcknowledgementBoundaryIndex} unit={scope.postAcknowledgementBoundaryUnit} />
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <CompactDiagnosticStat label="文本单元" value={value.totalTextUnitCount ?? 0} />
            <CompactDiagnosticStat label="可改正文" value={value.editableUnitCount ?? 0} />
            <CompactDiagnosticStat label="保护单元" value={value.protectedUnitCount ?? 0} />
            <CompactDiagnosticStat label="格式锚点" value={formatAnchorCount} />
          </div>

          {templateInstructionUnitCount > 0 ? (
            <Alert className="border-success/20 bg-success/[0.035]" data-ui-section="docx-template-instruction-evidence">
              <ShieldCheck />
              <AlertTitle>模板撰写指导语已冻结</AlertTitle>
              <AlertDescription className="text-xs leading-5">
                已识别 {templateInstructionUnitCount} 个独立模板说明或致谢撰写提示。它们保留在原 Word 位置，不会进入模型、比较正文或改写回填。
              </AlertDescription>
            </Alert>
          ) : null}

          {formatAnchorCount > 0 ? (
            <Alert className={ambiguousAnchorUnitCount ? "border-warning/25 bg-warning/[0.045]" : "border-success/20 bg-success/[0.035]"}>
              <ShieldCheck />
              <AlertTitle>Word 局部格式锚点已纳入冻结</AlertTitle>
              <AlertDescription className="text-xs leading-5">
                已识别 {formatAnchorCount} 处局部格式敏感文本。模型调用时它们以不可改占位符保护，回填时必须保持数量、顺序、文本和边界一致。
                {ambiguousAnchorUnitCount
                  ? ` 其中 ${ambiguousAnchorUnitCount} 个文本单元存在锚点歧义，已整段移出可编辑范围，不会发送给模型。`
                  : " 当前未发现锚点歧义。"}
              </AlertDescription>
            </Alert>
          ) : null}

          {semanticRangeCount > 0 || semanticRangeCoveredUnitCount > 0 || semanticPointReferenceUnitCount > 0 || !semanticRangeTopologyValid ? (
            <Alert className={semanticRangeTopologyValid ? "border-success/20 bg-success/[0.035]" : "border-destructive/30 bg-destructive/10"} data-ui-section="docx-semantic-boundary-evidence">
              {semanticRangeTopologyValid ? <ShieldCheck /> : <AlertTriangle />}
              <AlertTitle>{semanticRangeTopologyValid ? "Word 书签与批注范围已分类保护" : "Word 语义范围拓扑异常，已阻断处理"}</AlertTitle>
              <AlertDescription className="text-xs leading-5">
                {semanticRangeTopologyValid && semanticRangeCount > 0 ? `已闭合配对 ${semanticRangeCount} 条范围（书签 ${bookmarkRangeCount}，批注 ${commentRangeCount}）；锚点段冻结 ${semanticRangeAnchorUnitCount} 个，跨段批注内部冻结 ${semanticRangeCoveredUnitCount} 个。` : ""}
                {semanticRangeTopologyValid && bookmarkRangeInteriorUnitCount > 0 ? ` 无标记书签内部共 ${bookmarkRangeInteriorUnitCount} 个文本单元，其中 ${editableBookmarkRangeInteriorUnitCount} 个具备正文正证据，可在不移动书签边界的前提下处理。` : ""}
                {!semanticRangeTopologyValid ? ` 检测到 ${Math.max(0, Number(value.semanticRangeIssueCount) || 0)} 个未配对、重复或反序范围问题；正文范围已 fail closed，不会进入模型或导出。` : ""}
                {semanticPointReferenceUnitCount > 0 ? ` 脚注/尾注/批注落点整段冻结 ${semanticPointReferenceUnitCount} 个文本单元。` : ""}
                {" "}批注范围、锚点段与引用落点不会发送给模型；这里只展示保护类型和数量，不显示批注正文。
              </AlertDescription>
            </Alert>
          ) : null}

          {hasIssues ? (
            <Alert className={value.errorCount > 0 ? "border-destructive/30 bg-destructive/10" : "border-primary/25 bg-muted/60"}>
              <AlertTriangle />
              <AlertTitle>{value.errorCount > 0 ? "存在边界错误" : "存在边界提示"}</AlertTitle>
              <AlertDescription>{issues[0]?.message ?? "诊断报告包含需要复核的正文边界提示。"}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <ScopeDiagnosticsDetailSheet
        open={open}
        onOpenChange={setOpen}
        units={units}
        issues={issues}
      />
    </>
  );
}
