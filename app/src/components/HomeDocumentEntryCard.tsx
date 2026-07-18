import { FileCheck2, FileText, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";

type Props = {
  hasDocument: boolean;
  sourceKind?: string | null;
  busy: boolean;
  running: boolean;
  onPickFile: () => void;
};

export function HomeDocumentEntryCard({
  hasDocument,
  sourceKind,
  busy,
  running,
  onPickFile,
}: Props) {
  return (
    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border/80 bg-card/60 p-3 shadow-[inset_0_1px_0_hsl(var(--foreground)/0.025)]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="vercel-icon-frame size-8">
            {hasDocument ? <FileCheck2 className="size-4" /> : <UploadCloud className="size-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold tracking-tight">文档入口</div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{hasDocument ? "源文件已就绪，可随时更换" : "支持 Word 与纯文本文件"}</div>
          </div>
          <span className="font-mono text-[10px] text-muted-foreground">DOCX / TXT</span>
        </div>
        <Button
          type="button"
          variant={hasDocument ? "outlineWarning" : "default"}
          onClick={onPickFile}
          disabled={busy || running}
          className="h-10 w-full min-w-0 overflow-hidden"
        >
          <FileText data-icon="inline-start" />
          <span className="min-w-0 truncate">{hasDocument ? "更换文档" : "上传文档"}</span>
        </Button>
      </div>
      <Separator className="my-3 opacity-70" />
      <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Checkbox checked={sourceKind === ".docx"} disabled aria-label="DOCX 结构保护" />
        <span className="min-w-0 truncate">DOCX 只改正文：标题与原格式锁定</span>
      </label>
    </div>
  );
}
