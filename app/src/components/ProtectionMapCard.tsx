import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ProtectionMapEmptyState } from "@/components/ProtectionMapEmptyState";
import {
  BoundaryStrip,
  MiniStat,
  ReasonGrid,
  ScopeDiagnosticsPanel,
  SectionRow,
} from "@/components/ProtectionMapPanels";
import type {
  DocumentProtectionMap,
  DocumentScopeDiagnostics,
} from "@/types/app";

type Props = {
  value: DocumentProtectionMap | null;
  diagnostics?: DocumentScopeDiagnostics | null;
};

export function ProtectionMapCard({ value, diagnostics }: Props) {
  if (!value || !value.available) {
    return <ProtectionMapEmptyState diagnostics={diagnostics} />;
  }

  const { summary } = value;
  const editableRate = summary.totalUnits ? Math.round((summary.editableUnits / summary.totalUnits) * 100) : 0;
  const protectedRate = summary.totalUnits ? 100 - editableRate : 0;

  return (
    <div className="flex min-h-full flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">保护区</Badge>
                <Badge variant="success">已建立</Badge>
                {summary.structuralRolePolicyVersion ? (
                  <Badge variant="outline">结构角色 v{summary.structuralRolePolicyVersion}</Badge>
                ) : null}
                {summary.structuralInventoryVersion ? (
                  <Badge variant="outline">结构库存 v{summary.structuralInventoryVersion}</Badge>
                ) : null}
                <Badge variant="outline">可编辑 {editableRate}%</Badge>
                <Badge variant="outline">锁定 {protectedRate}%</Badge>
                {summary.ambiguousUnits ? <Badge variant="warning">安全跳过 {summary.ambiguousUnits}</Badge> : null}
                {summary.roleCounts?.template_instruction ? <Badge variant="info">模板指导语 {summary.roleCounts.template_instruction}</Badge> : null}
                {summary.editableBookmarkRangeInteriorUnits ? <Badge variant="success">书签内安全正文 {summary.editableBookmarkRangeInteriorUnits}</Badge> : null}
              </div>
              <CardTitle className="text-2xl">文档边界地图</CardTitle>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-4">
              <MiniStat label="总单元" value={summary.totalUnits} />
              <MiniStat label="正文" value={summary.editableUnits} />
              <MiniStat label="保护" value={summary.protectedUnits} />
              <MiniStat label="表格锁定" value={summary.tableUnits} />
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
        </CardContent>
      </Card>

      <ScopeDiagnosticsPanel value={diagnostics ?? null} />

      <div className="grid gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">保护原因分布</CardTitle>
          </CardHeader>
          <CardContent>
            <ReasonGrid reasons={summary.protectionReasons} protectedUnits={summary.protectedUnits} />
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">完整边界序列</CardTitle>
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
