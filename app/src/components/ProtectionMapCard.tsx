import { AlertTriangle, FileText, Layers3, Lock, Map, ShieldCheck, Unlock } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { DocumentProtectionMap, ProtectionMapSection, ProtectionReasonSummary } from "@/types/app";

type Props = {
  value: DocumentProtectionMap | null;
};

type BoundaryRisk = {
  title: string;
  text: string;
  level: "ok" | "warn";
};

export function ProtectionMapCard({ value }: Props) {
  if (!value || !value.available) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">保护区</Badge>
                <Badge variant="outline">未建立</Badge>
              </div>
              <CardTitle className="text-xl">文档边界地图</CardTitle>
              <CardDescription className="mt-2">上传 DOCX 后，系统会解析哪些区域可改写，哪些区域必须锁死。</CardDescription>
            </div>
            <div className="rounded-md bg-muted p-3 text-muted-foreground">
              <ShieldCheck />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Empty className="min-h-[14rem] border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>保护区未建立</EmptyTitle>
              <EmptyDescription>上传 DOCX 后会解析封面、目录、图表、参考文献和正文边界。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  const { summary } = value;
  const editableRate = summary.totalUnits ? Math.round((summary.editableUnits / summary.totalUnits) * 100) : 0;
  const protectedRate = summary.totalUnits ? 100 - editableRate : 0;
  const risks = buildBoundaryRisks(value, editableRate);

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-5 overflow-hidden">
      <div className="grid gap-5">
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
                这里负责说明“哪些内容能交给模型，哪些内容必须原样保留”。它是降低 AI 率和 Word 排版安全之间的边界层。
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
              <InfoCard icon={<FileText />} label="正文段落" value={`${summary.topLevelParagraphUnits}`} text="普通段落与正文结构主体。" />
              <InfoCard icon={<Layers3 />} label="表格单元" value={`${summary.tableUnits}`} text="表格默认锁定，不进入改写。" />
              <InfoCard icon={<Map />} label="连续区块" value={`${value.sections.length}`} text="按编辑权限和保护原因切分。" />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">保护原因分布</CardTitle>
              <CardDescription>改写和导出阶段会重点保护这些区域。</CardDescription>
            </CardHeader>
            <CardContent>
              <ReasonGrid reasons={summary.protectionReasons} protectedUnits={summary.protectedUnits} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">边界审计</CardTitle>
              <CardDescription>判断当前文档结构是否适合直接改写。</CardDescription>
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
      </div>

      <Card className="min-h-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">完整边界序列</CardTitle>
          <CardDescription>按 Word 解析顺序展示全部连续区块，列表在当前区域内滚动。</CardDescription>
        </CardHeader>
        <CardContent className="h-[calc(100%-5.75rem)] min-h-0">
          <ScrollArea className="h-full pr-1">
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

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="shadow-none">
      <CardContent className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function InfoCard({ icon, label, value, text }: { icon: ReactNode; label: string; value: string; text: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-foreground">
          <span className="rounded-md bg-primary/10 p-2 text-primary [&_svg]:size-4">{icon}</span>
          {label}
        </div>
        <div className="text-xl font-black text-foreground">{value}</div>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  );
}

function BoundaryStrip({ sections, totalUnits }: { sections: ProtectionMapSection[]; totalUnits: number }) {
  if (!sections.length || totalUnits <= 0) {
    return null;
  }
  return (
    <Card className="bg-muted/25 shadow-none">
      <CardContent className="p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-black text-foreground">文档结构条</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />可改写</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted-foreground/30" />保护区</span>
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
      </CardContent>
    </Card>
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
          <Card key={item.reason} className="shadow-none">
            <CardContent className="p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-black text-foreground">{item.label}</span>
              <Badge variant="outline">{item.count}</Badge>
            </div>
            <Progress value={percent} className="mt-3 h-2" />
            <div className="mt-1 text-xs text-muted-foreground">保护区占比 {percent}%</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function SectionRow({ section, totalUnits }: { section: ProtectionMapSection; totalUnits: number }) {
  const Icon = section.editable ? Unlock : Lock;
  const percent = totalUnits ? Math.round((section.count / totalUnits) * 100) : 0;
  return (
    <Card className={section.editable ? "border-primary/20 bg-primary/5 shadow-none" : "shadow-none"}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={section.editable ? "text-primary" : "text-muted-foreground"}>
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
      </CardContent>
    </Card>
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
