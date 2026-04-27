import type { ReactNode } from "react";
import { FileText, FolderUp, Layers3, Play, ShieldCheck, Workflow } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DocumentStatus } from "@/types/app";

const T = {
  noDocument: "未导入",
  upload: "上传文档",
  document: "文档",
  locked: "保护区锁定",
  title: "文档处理",
  current: "当前文档",
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
    <Card className="surface-card overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{T.document}</Badge>
              <Badge variant="outline">{describeSourceKind(value)}</Badge>
              {isDocx ? <Badge variant="success">{T.locked}</Badge> : null}
            </div>
            <CardTitle className="text-xl">{T.title}</CardTitle>
          </div>
          <Button size="lg" onClick={onPickFile} disabled={busy} className="min-w-[140px]">
            <FolderUp className="h-4 w-4" />
            {pickerLabel}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {value ? (
          <>
            <div className="rounded-3xl border border-border/70 bg-slate-950 p-5 text-slate-50 shadow-glow">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{T.current}</div>
                  <h3 className="mt-2 truncate text-xl font-semibold">{displayDocId(value)}</h3>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                    <span>{T.completed} {value.completedRounds.length} {T.round}</span>
                    <span>?</span>
                    <span>{value.hasNextRound && value.nextRound ? `${T.nextRound} ${value.nextRound}` : T.allDone}</span>
                    <span>?</span>
                    <span>{isDocx ? T.bodyOnly : T.textFlow}</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/10">
                  <FileText className="h-6 w-6" />
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <InfoPanel icon={<Layers3 className="h-4 w-4" />} label={T.rounds} value={value.completedRounds.length ? value.completedRounds.join(" / ") : T.none} />
              <InfoPanel icon={<Workflow className="h-4 w-4" />} label={T.input} value={shortPath(value.currentInputPath)} />
              <InfoPanel icon={<ShieldCheck className="h-4 w-4" />} label={T.export} value={isDocx ? T.docxExport : T.standardExport} />
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-border/70 bg-background/75 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-foreground">{value.hasNextRound ? `${T.readyPrefix} ${value.nextRound} ${T.round}` : T.allDone}</div>
                <div className="mt-1 text-xs text-muted-foreground">{T.docxGuard}</div>
              </div>
              <Button size="lg" onClick={onRunRound} disabled={!canRunNextRound}>
                <Play className="h-4 w-4" />
                {value.hasNextRound ? T.runNext : T.allDone}
              </Button>
            </div>
          </>
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-background/70 p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <FolderUp className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-foreground">{T.uploadedTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{T.uploadedHint}</p>
          </div>
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
    <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-3 truncate text-sm font-semibold text-foreground">{value}</div>
    </div>
  );
}
