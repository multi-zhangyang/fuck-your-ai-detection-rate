import { AlertTriangle, FileText, Layers3, Lock, Map, ShieldCheck, Unlock } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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
            <div className="rounded-2xl bg-muted p-3 text-muted-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-3xl border border-dashed border-border bg-background/70 p-8">
            <div className="flex flex-col gap-3 text-sm leading-6 text-muted-foreground">
              <div className="font-semibold text-foreground">这个模块的作用不是展示好看，而是防止导出 Word 时“动错地方”。</div>
              <div>它会把封面、目录、标题、图表、参考文献、公式等区域识别为保护区，只允许摘要到致谢之间的正文内容进入改写链路。</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { summary } = value;
  const editableRate = summary.totalUnits ? Math.round((summary.editableUnits / summary.totalUnits) * 100) : 0;
  const protectedRate = summary.totalUnits ? 100 - editableRate : 0;
  const risks = buildBoundaryRisks(value, editableRate);

  return (
    <div className="space-y-5 pb-10">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-2">
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

        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>可改写正文占比</span>
              <span>{editableRate}%</span>
            </div>
            <Progress value={editableRate} className="h-3" />
          </div>

          <BoundaryStrip sections={value.sections} totalUnits={summary.totalUnits} />

          <div className="grid gap-3 md:grid-cols-3">
            <InfoCard icon={<FileText className="h-4 w-4" />} label="正文段落" value={`${summary.topLevelParagraphUnits}`} text="普通段落与正文结构主体。" />
            <InfoCard icon={<Layers3 className="h-4 w-4" />} label="表格单元" value={`${summary.tableUnits}`} text="表格默认锁定，不进入改写。" />
            <InfoCard icon={<Map className="h-4 w-4" />} label="连续区块" value={`${value.sections.length}`} text="按编辑权限和保护原因切分。" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">保护原因分布</CardTitle>
            <CardDescription>这些区域会在改写和导出阶段被重点保护，避免目录、图表、引用和结构字段被模型误改。</CardDescription>
          </CardHeader>
          <CardContent>
            <ReasonGrid reasons={summary.protectionReasons} protectedUnits={summary.protectedUnits} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">边界审计提示</CardTitle>
            <CardDescription>用于判断当前文档结构是否适合直接跑改写。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {risks.map((risk) => (
              <div key={risk.title} className={`rounded-2xl border p-3 ${risk.level === "warn" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
                <div className={`flex items-center gap-2 text-sm font-black ${risk.level === "warn" ? "text-amber-800" : "text-emerald-800"}`}>
                  {risk.level === "warn" ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  {risk.title}
                </div>
                <p className={`mt-1 text-xs leading-5 ${risk.level === "warn" ? "text-amber-700" : "text-emerald-700"}`}>{risk.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">完整边界序列</CardTitle>
          <CardDescription>按 Word 解析顺序展示全部连续区块。页面可以向下延伸，不再把内容挤进一个小滚动框。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {value.sections.map((section, index) => (
            <SectionRow key={`${section.key}-${section.startUnit}-${index}`} section={section} totalUnits={summary.totalUnits} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-black text-foreground">{value}</div>
    </div>
  );
}

function InfoCard({ icon, label, value, text }: { icon: ReactNode; label: string; value: string; text: string }) {
  return (
    <div className="rounded-3xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-black text-foreground">
          <span className="rounded-xl bg-primary/10 p-2 text-primary">{icon}</span>
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
    <div className="rounded-3xl border border-border/70 bg-muted/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-black text-foreground">文档结构条</div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />可改写</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" />保护区</span>
        </div>
      </div>
      <div className="flex h-5 overflow-hidden rounded-full bg-slate-100">
        {sections.map((section, index) => (
          <div
            key={`${section.key}-${index}-strip`}
            title={`${section.label}：${section.count} 个单元`}
            className={section.editable ? "bg-primary" : "bg-slate-300"}
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
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-sm text-muted-foreground">
        当前没有额外保护原因，文档可能只有普通正文结构。
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {reasons.map((item) => {
        const percent = protectedUnits ? Math.round((item.count / protectedUnits) * 100) : 0;
        return (
          <div key={item.reason} className="rounded-2xl border border-border/70 bg-background/80 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-sm font-black text-foreground">{item.label}</span>
              <Badge variant="outline">{item.count}</Badge>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-slate-400" style={{ width: `${percent}%` }} />
            </div>
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
    <div className={`rounded-3xl border p-4 ${section.editable ? "border-primary/20 bg-primary/5" : "border-border/70 bg-white/80"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={section.editable ? "text-primary" : "text-slate-500"}>
              <Icon className="h-4 w-4" />
            </span>
            <span className="font-black text-foreground">{section.label}</span>
            <Badge variant={section.editable ? "default" : "outline"}>{section.count} 单元</Badge>
            <Badge variant="outline">#{section.startUnit} - #{section.endUnit}</Badge>
            <Badge variant="outline">{percent}%</Badge>
          </div>
          {section.samples.length ? (
            <>
              <Separator className="my-3" />
              <div className="space-y-2">
                {section.samples.map((sample, index) => (
                  <p key={`${section.key}-sample-${index}`} className="rounded-2xl bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
                    {sample || "空文本单元"}
                  </p>
                ))}
              </div>
            </>
          ) : null}
        </div>
        <div className={`shrink-0 rounded-2xl px-3 py-2 text-xs font-black ${section.editable ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-600"}`}>
          {section.editable ? "进入改写" : "锁定保留"}
        </div>
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
