import type { ReactNode } from "react";
import { FileText, FolderUp, Layers3, Play, ShieldCheck, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import type { DocumentStatus } from "@/types/app";

const T = {
  noDocument: "未导入",
  upload: "上传文档",
  document: "文档",
  locked: "保护区锁定",
  title: "文档处理",
  current: "当前文件",
  completed: "已完成",
  round: "轮",
  nextRound: "下一轮",
  allDone: "全部完成",
  bodyOnly: "仅改正文",
  textFlow: "纯文本流程",
  rounds: "轮次",
  none: "暂无",
  input: "输入",
  export: "导出",
  docxExport: "正文排版 + 审计",
  standardExport: "标准导出",
  readyPrefix: "准备执行第",
  docxGuard: "DOCX 不改目录、图表、表格、参考文献。",
  runNext: "执行下一轮",
  uploadedTitle: "先上传论文",
  uploadedHint: "支持 TXT 和 DOCX；DOCX 会自动建立保护区。",
};

type Props = {
  value: DocumentStatus | null;
  busy: boolean;
  onPickFile: () => void;
  onRunRound: () => void;
  pickerLabel?: string;
};

function displayDocId(status: DocumentStatus): string {
  const normalizedDocId = status.docId.replace(/\\/g, "/");
  const segments = normalizedDocId.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? status.docId;
}

function describeSourceKind(status: DocumentStatus | null): string {
  if (!status) return T.noDocument;
  return status.sourceKind === ".docx" ? "Word" : "TXT";
}

export function DocumentCard({ value, busy, onPickFile, onRunRound, pickerLabel = T.upload }: Props) {
  const canRunNextRound = Boolean(value?.hasNextRound) && !busy;
  const isDocx = value?.sourceKind === ".docx";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{T.document}</Badge>
              <Badge variant="outline">{describeSourceKind(value)}</Badge>
              {isDocx ? <Badge variant="success">{T.locked}</Badge> : null}
            </div>
            <CardTitle className="text-xl">{T.title}</CardTitle>
          </div>
          <Button size="lg" onClick={onPickFile} disabled={busy} className="min-w-[140px]">
            <FolderUp data-icon="inline-start" />
            {pickerLabel}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {value ? (
          <>
            <div className="rounded-md border bg-muted/60 p-5 text-foreground">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{T.current}</div>
                  <h3 className="mt-2 truncate text-xl font-semibold">{displayDocId(value)}</h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{T.completed} {value.completedRounds.length} {T.round}</span>
                    <span>·</span>
                    <span>{value.hasNextRound && value.nextRound ? `${T.nextRound} ${value.nextRound}` : T.allDone}</span>
                    <span>·</span>
                    <span>{isDocx ? T.bodyOnly : T.textFlow}</span>
                  </div>
                </div>
                <div className="rounded-md bg-background p-3 text-muted-foreground">
                  <FileText />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InfoPanel icon={<Layers3 />} label={T.rounds} value={value.completedRounds.length ? value.completedRounds.join(" / ") : T.none} />
              <InfoPanel icon={<Workflow />} label={T.input} value={shortPath(value.currentInputPath)} />
              <InfoPanel icon={<ShieldCheck />} label={T.export} value={isDocx ? T.docxExport : T.standardExport} />
            </div>

            <div className="flex flex-col gap-3 rounded-md border bg-background/75 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">{value.hasNextRound ? `${T.readyPrefix} ${value.nextRound} ${T.round}` : T.allDone}</div>
                <div className="mt-1 text-xs text-muted-foreground">{T.docxGuard}</div>
              </div>
              <Button size="lg" onClick={onRunRound} disabled={!canRunNextRound}>
                <Play data-icon="inline-start" />
                {value.hasNextRound ? T.runNext : T.allDone}
              </Button>
            </div>
          </>
        ) : (
          <Empty className="min-h-[16rem] border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderUp />
              </EmptyMedia>
              <EmptyTitle>{T.uploadedTitle}</EmptyTitle>
              <EmptyDescription>{T.uploadedHint}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function shortPath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path || "-";
}

function InfoPanel({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/80 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-primary [&_svg]:size-4">{icon}</span>
        {label}
      </div>
      <div className="mt-3 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
