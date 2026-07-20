import { ArrowLeft, FileUp, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { IconFrame, ScopeDiagnosticsPanel } from "@/components/ProtectionMapPanels";
import type { DocumentScopeDiagnostics } from "@/types/app";

export function ProtectionMapEmptyState({
  diagnostics,
  onChooseFile,
  onGoHome,
  chooseFileDisabled = false,
}: {
  diagnostics?: DocumentScopeDiagnostics | null;
  onChooseFile?: () => void;
  onGoHome?: () => void;
  chooseFileDisabled?: boolean;
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
            {onChooseFile || onGoHome ? (
              <EmptyContent className="sm:flex-row sm:justify-center">
                {onChooseFile ? (
                  <Button type="button" onClick={onChooseFile} disabled={chooseFileDisabled}>
                    <FileUp />
                    选择文档
                  </Button>
                ) : null}
                {onGoHome ? (
                  <Button type="button" variant="outline" onClick={onGoHome}>
                    <ArrowLeft />
                    返回工作台
                  </Button>
                ) : null}
              </EmptyContent>
            ) : null}
          </Empty>
        </CardContent>
      </Card>
      <ScopeDiagnosticsPanel value={diagnostics ?? null} />
    </div>
  );
}
