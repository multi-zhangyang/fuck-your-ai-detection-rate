import { AlertTriangle, FileSearch, FileText, Layers3, ListChecks, Lock, Map, ShieldCheck, Unlock } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type {
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
  ProtectionMapSection,
  ProtectionReasonSummary,
  ScopeDiagnosticUnit,
} from "@/types/app";

type Props = {
  value: DocumentProtectionMap | null;
  diagnostics?: DocumentScopeDiagnostics | null;
};

type BoundaryRisk = {
  title: string;
  text: string;
  level: "ok" | "warn";
};

export function ProtectionMapCard({ value, diagnostics }: Props) {
  if (!value || !value.available) {
    return (
      <div className="flex min-h-full flex-col gap-5">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">保护区</Badge>
                  <Badge variant="outline">未建立</Badge>
                </div>
                <CardTitle className="text-xl">文档边界地图</CardTitle>
                <CardDescription className="mt-2">上传 DOCX 后会显示可改正文、锁定结构和导出保护边界。</CardDescription>
              </div>
              <IconFrame>
                <ShieldCheck />
              </IconFrame>
            </div>
          </CardHeader>
          <CardContent>
            <Empty className="min-h-[14rem] border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ShieldCheck />
                </EmptyMedia>
                <EmptyTitle>保护区未建立</EmptyTitle>
                <EmptyDescription>当前文档还没有可展示的 DOCX 保护区快照。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
        <ScopeDiagnosticsPanel value={diagnostics ?? null} />
      </div>
    );
  }

  const { summary } = value;
  const editableRate = summary.totalUnits ? Math.round((summary.editableUnits / summary.totalUnits) * 100) : 0;
  const protectedRate = summary.totalUnits ? 100 - editableRate : 0;
  const risks = buildBoundaryRisks(value, editableRate);

  return (
    <div className="flex min-h-full flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">保护区</Badge>
                <Badge variant="success">已建立</Badge>
                <Badge variant="outline">可编辑 {editableRate}%</Badge>
                <Badge variant="outline">锁定 {protectedRate}%</Badge>
              </div>
              <CardTitle className="text-2xl">文档边界地图</CardTitle>
              <CardDescription className="max-w-3xl leading-6">
                只把摘要到致谢之间的正文交给模型处理，目录、图表、公式、表格和参考文献保持锁定。
              </CardDescription>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <MiniStat label="总单元" value={summary.totalUnits} />
              <MiniStat label="正文" value={summary.editableUnits} />
              <MiniStat label="保护" value={summary.protectedUnits} />
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>可改写正文占比</span>
              <span>{editableRate}%</span>
            </div>
            <Progress value={editableRate} className="h-3" />
          </div>

          <BoundaryStrip sections={value.sections} totalUnits={summary.totalUnits} />

          <div className="grid gap-3 md:grid-cols-3">
            <InfoTile icon={<FileText />} label="正文段落" value={`${summary.topLevelParagraphUnits}`} text="普通段落和自动编号正文会参与改写。" />
            <InfoTile icon={<Layers3 />} label="表格单元" value={`${summary.tableUnits}`} text="表格内容默认锁定，避免破坏版式。" />
            <InfoTile icon={<Map />} label="连续区块" value={`${value.sections.length}`} text="按正文范围和保护原因连续分组。" />
          </div>
        </CardContent>
      </Card>

      <ScopeDiagnosticsPanel value={diagnostics ?? null} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">保护原因分布</CardTitle>
            <CardDescription>改写和导出阶段会继续复核这些锁定原因。</CardDescription>
          </CardHeader>
          <CardContent>
            <ReasonGrid reasons={summary.protectionReasons} protectedUnits={summary.protectedUnits} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">边界审计</CardTitle>
            <CardDescription>判断当前文档结构是否适合直接进入改写。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {risks.map((risk) => (
              <Alert key={risk.title} className={risk.level === "warn" ? "border-primary/25 bg-muted/60" : undefined}>
                {risk.level === "warn" ? <AlertTriangle /> : <ShieldCheck />}
                <AlertTitle>{risk.title}</AlertTitle>
                <AlertDescription>{risk.text}</AlertDescription>
              </Alert>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">完整边界序列</CardTitle>
          <CardDescription>按 Word 解析顺序展示全部连续区块。</CardDescription>
        </CardHeader>
        <CardContent className="pb-5">
          <ScrollArea className="h-[min(38rem,58svh)] pr-1">
            <div className="flex flex-col gap-3">
              {value.sections.map((section, index) => (
                <SectionRow key={`${section.key}-${section.startUnit}-${index}`} section={section} totalUnits={summary.totalUnits} />
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

function ScopeDiagnosticsPanel({ value }: { value: DocumentScopeDiagnostics | null }) {
  const [open, setOpen] = useState(false);

  if (!value || !value.available) {
    return (
      <Card data-ui-section="docx-scope-diagnostics">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">正文诊断</Badge>
                <Badge variant="outline">未生成</Badge>
              </div>
              <CardTitle className="text-lg">正文边界诊断</CardTitle>
              <CardDescription className="mt-2">{value?.message ?? "当前文档暂无 DOCX 正文边界诊断。"}</CardDescription>
            </div>
            <IconFrame>
              <FileSearch />
            </IconFrame>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const scope = value.scope ?? {};
  const units = value.units ?? [];
  const issues = value.issues ?? [];
  const hasIssues = value.issueCount > 0;

  return (
    <>
      <Card data-ui-section="docx-scope-diagnostics">
        <CardHeader>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">正文诊断</Badge>
                <Badge variant={value.ok ? "success" : "danger"}>{value.ok ? "可用" : "需处理"}</Badge>
                <Badge variant={hasIssues ? "warning" : "outline"}>{value.issueCount} 条提示</Badge>
              </div>
              <CardTitle className="text-lg">正文边界诊断</CardTitle>
              <CardDescription className="mt-2">摘要起点、致谢终点和后置材料边界已写入诊断报告。</CardDescription>
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

          <div className="grid gap-3 md:grid-cols-3">
            <CompactDiagnosticStat label="文本单元" value={value.totalTextUnitCount ?? 0} />
            <CompactDiagnosticStat label="可改正文" value={value.editableUnitCount ?? 0} />
            <CompactDiagnosticStat label="保护单元" value={value.protectedUnitCount ?? 0} />
          </div>

          {hasIssues ? (
            <Alert className={value.errorCount > 0 ? "border-destructive/30 bg-destructive/10" : "border-primary/25 bg-muted/60"}>
              <AlertTriangle />
              <AlertTitle>{value.errorCount > 0 ? "存在边界错误" : "存在边界提示"}</AlertTitle>
              <AlertDescription>{issues[0]?.message ?? "诊断报告包含需要复核的正文边界提示。"}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <ShieldCheck />
              <AlertTitle>边界诊断通过</AlertTitle>
              <AlertDescription>当前 DOCX 的正文范围与保护区没有发现明显冲突。</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-[min(92vw,760px)] flex-col gap-0 sm:max-w-[760px]">
          <SheetHeader className="shrink-0">
            <SheetTitle>正文边界完整诊断</SheetTitle>
            <SheetDescription>
              {formatScopeRange(scope.startIndex, scope.endIndex)}，{value.editableUnitCount ?? 0} 个可改正文单元。
            </SheetDescription>
          </SheetHeader>
          <Separator className="my-4" />
          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="flex flex-col gap-4 pb-4">
              <div className="flex flex-col gap-2">
                <div className="text-sm font-semibold text-foreground">诊断提示</div>
                {issues.length ? (
                  issues.map((issue, index) => (
                    <Alert key={`${issue.code}-${index}`} className={issue.severity === "error" ? "border-destructive/30 bg-destructive/10" : undefined}>
                      <AlertTriangle />
                      <AlertTitle>{issue.code}</AlertTitle>
                      <AlertDescription>{issue.message}</AlertDescription>
                    </Alert>
                  ))
                ) : (
                  <Alert>
                    <ShieldCheck />
                    <AlertTitle>没有诊断提示</AlertTitle>
                    <AlertDescription>正文边界、结构保护和可改范围保持一致。</AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-foreground">单元序列</div>
                  <Badge variant="outline">{units.length} 项</Badge>
                </div>
                <div className="flex flex-col gap-2">
                  {units.map((unit) => (
                    <ScopeUnitRow key={unit.unitIndex} unit={unit} />
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  );
}

function IconFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground" aria-hidden="true">
      {children}
    </div>
  );
}

function ScopePoint({ title, index, unit, meta }: { title: string; index?: number | null; unit?: ScopeDiagnosticUnit | null; meta?: string }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-muted-foreground">{title}</div>
        <Badge variant="outline">{formatUnitIndex(index)}</Badge>
      </div>
      <div className="mt-2 max-h-[2.75rem] min-h-[2.75rem] overflow-hidden text-sm font-semibold leading-5 text-foreground">
        {unit?.textPreview || "未命中"}
      </div>
      {meta ? <div className="mt-2 text-xs text-muted-foreground">{formatScopeReason(meta)}</div> : null}
    </div>
  );
}

function CompactDiagnosticStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/25 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

function ScopeUnitRow({ unit }: { unit: ScopeDiagnosticUnit }) {
  const activeFlags = Object.entries(unit.flags ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([flag]) => flag)
    .slice(0, 5);

  return (
    <div className={cn("rounded-md border p-3", unit.editable ? "bg-primary/5" : "bg-card")}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={unit.editable ? "default" : "secondary"}>{unit.editable ? "可改" : "保护"}</Badge>
        <Badge variant="outline">#{unit.unitIndex}</Badge>
        {unit.protectReason ? <Badge variant="outline">{formatProtectReason(unit.protectReason)}</Badge> : null}
        {unit.styleName ? <Badge variant="outline">{unit.styleName}</Badge> : null}
        {unit.hasNumbering ? <Badge variant="outline">编号</Badge> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-foreground">{unit.textPreview || "空文本单元"}</p>
      {activeFlags.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <ListChecks aria-hidden="true" />
          {activeFlags.map((flag) => (
            <Badge key={`${unit.unitIndex}-${flag}`} variant="info">
              {formatScopeFlag(flag)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/25 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

function InfoTile({ icon, label, value, text }: { icon: ReactNode; label: string; value: string; text: string }) {
  return (
    <div className="rounded-md border bg-muted/25 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-foreground">
          <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden="true">
            {icon}
          </span>
          {label}
        </div>
        <div className="text-xl font-black text-foreground">{value}</div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function BoundaryStrip({ sections, totalUnits }: { sections: ProtectionMapSection[]; totalUnits: number }) {
  if (!sections.length || totalUnits <= 0) {
    return null;
  }
  return (
    <div className="rounded-md border bg-muted/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-black text-foreground">文档结构条</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" />
            可改写
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-muted-foreground/30" />
            保护区
          </span>
        </div>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-muted">
        {sections.map((section, index) => (
          <div
            key={`${section.key}-${index}-strip`}
            title={`${section.label}：${section.count} 个单元`}
            className={section.editable ? "bg-primary" : "bg-muted-foreground/30"}
            style={{ width: `${Math.max(1, (section.count / totalUnits) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function ReasonGrid({ reasons, protectedUnits }: { reasons: ProtectionReasonSummary[]; protectedUnits: number }) {
  if (!reasons.length) {
    return (
      <Empty className="min-h-[10rem] border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>暂无额外保护原因</EmptyTitle>
          <EmptyDescription>文档可能只有普通正文结构。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {reasons.map((item) => {
        const percent = protectedUnits ? Math.round((item.count / protectedUnits) * 100) : 0;
        return (
          <div key={item.reason} className="rounded-md border bg-muted/25 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-black text-foreground">{item.label}</span>
              <Badge variant="outline">{item.count}</Badge>
            </div>
            <Progress value={percent} className="mt-3 h-2" />
            <div className="mt-1 text-xs text-muted-foreground">保护区占比 {percent}%</div>
          </div>
        );
      })}
    </div>
  );
}

function SectionRow({ section, totalUnits }: { section: ProtectionMapSection; totalUnits: number }) {
  const Icon = section.editable ? Unlock : Lock;
  const percent = totalUnits ? Math.round((section.count / totalUnits) * 100) : 0;
  return (
    <div className={cn("rounded-md border p-4", section.editable ? "border-primary/20 bg-primary/5" : "bg-card")}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={section.editable ? "text-primary" : "text-muted-foreground"} aria-hidden="true">
              <Icon />
            </span>
            <span className="font-black text-foreground">{section.label}</span>
            <Badge variant={section.editable ? "default" : "outline"}>{section.count} 单元</Badge>
            <Badge variant="outline">#{section.startUnit} - #{section.endUnit}</Badge>
            <Badge variant="outline">{percent}%</Badge>
          </div>
          {section.samples.length ? (
            <>
              <Separator className="my-3" />
              <div className="flex flex-col gap-2">
                {section.samples.map((sample, index) => (
                  <p key={`${section.key}-sample-${index}`} className="rounded-md bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {sample || "空文本单元"}
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <Badge className="shrink-0" variant={section.editable ? "brand" : "secondary"}>
          {section.editable ? "进入改写" : "锁定保留"}
        </Badge>
      </div>
    </div>
  );
}

function buildBoundaryRisks(value: DocumentProtectionMap, editableRate: number): BoundaryRisk[] {
  const risks: BoundaryRisk[] = [];
  const { summary } = value;
  if (summary.editableUnits <= 0) {
    risks.push({
      title: "未识别到可改写正文",
      text: "这通常说明文档结构异常，或正文被表格、文本框等结构包住。建议先检查原始 Word。",
      level: "warn",
    });
  } else {
    risks.push({
      title: "正文边界已建立",
      text: "系统会优先只处理可编辑正文，并在导出时重新校验保护区是否被误改。",
      level: "ok",
    });
  }
  if (editableRate > 0 && editableRate < 20) {
    risks.push({
      title: "可编辑占比较低",
      text: "如果论文正文很多但这里只显示较少正文，可能存在解析遗漏，需要重点检查完整边界序列。",
      level: "warn",
    });
  }
  if (summary.tableUnits > 0) {
    risks.push({
      title: "表格已锁定",
      text: "表格内容不会进入普通改写链路，避免三线表、数据和单元格结构被破坏。",
      level: "ok",
    });
  }
  if (summary.protectionReasons.some((item) => item.reason === "references")) {
    risks.push({
      title: "参考文献已锁定",
      text: "参考文献不参与改写，防止作者、年份、题名和格式被模型改坏。",
      level: "ok",
    });
  }
  return risks;
}

function formatUnitIndex(value?: number | null): string {
  return typeof value === "number" ? `#${value}` : "未命中";
}

function formatScopeRange(start?: number | null, end?: number | null): string {
  return `${formatUnitIndex(start)} - ${formatUnitIndex(end)}`;
}

function formatScopeReason(value?: string): string {
  const labels: Record<string, string> = {
    abstract_marker: "摘要起点",
    body_start_marker: "正文标题起点",
    before_back_matter_boundary: "后置材料前结束",
    document_end: "文档末尾结束",
    fallback: "兜底边界",
  };
  return labels[value ?? ""] ?? value ?? "";
}

function formatProtectReason(value: string): string {
  const labels: Record<string, string> = {
    front_matter: "前置内容",
    generated_field: "自动域",
    table_content: "表格",
    graphic_anchor: "图形锚点",
    formula: "公式",
    references: "参考文献",
    heading: "标题",
    back_matter: "后置内容",
    caption: "图表名",
    structured_field: "结构字段",
    outside_body_scope: "正文外",
  };
  return labels[value] ?? value;
}

function formatScopeFlag(value: string): string {
  const labels: Record<string, string> = {
    abstractStart: "摘要",
    bodyStart: "正文起点",
    acknowledgementHeading: "致谢",
    referencesHeading: "参考文献",
    backMatterHeading: "后置",
    tocHeading: "目录标题",
    tocEntry: "目录项",
    heading: "标题",
    numberedBodyItem: "编号正文",
    keywordLine: "关键词",
    caption: "图表名",
    note: "注释",
    formula: "公式",
  };
  return labels[value] ?? value;
}
