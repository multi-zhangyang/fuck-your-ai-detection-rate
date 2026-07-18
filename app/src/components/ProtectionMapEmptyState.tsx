import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { IconFrame, ScopeDiagnosticsPanel } from "@/components/ProtectionMapPanels";
import type { DocumentScopeDiagnostics } from "@/types/app";

export function ProtectionMapEmptyState({
  diagnostics,
}: {
  diagnostics?: DocumentScopeDiagnostics | null;
}) {
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
            </div>
            <IconFrame>
              <ShieldCheck />
            </IconFrame>
          </div>
        </CardHeader>
        <CardContent>
          <Empty className="vercel-empty-state min-h-[14rem] border border-border/70">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ShieldCheck />
              </EmptyMedia>
              <EmptyTitle>保护区未建立</EmptyTitle>
              <EmptyDescription>上传 DOCX 后，系统会识别正文边界并锁定目录、图表、公式与参考文献。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent>
      </Card>
      <ScopeDiagnosticsPanel value={diagnostics ?? null} />
    </div>
  );
}
