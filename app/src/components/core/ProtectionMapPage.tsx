import { useEffect, useState } from "react";
import { FileText, Save, ShieldCheck } from "lucide-react";

import { useAppNotifications } from "@/components/AppNotifications";
import { ScopeEditor } from "@/components/core/ScopeEditor";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { coreService } from "@/lib/coreService";
import type { CoreDocument, CoreRun } from "@/types/core";

interface Props {
  document: CoreDocument | null;
  run: CoreRun | null;
  onOpenDocument: () => void;
  onDocumentChange: (document: CoreDocument) => void;
}

export function ProtectionMapPage({ document, run, onOpenDocument, onDocumentChange }: Props) {
  const { notify } = useAppNotifications();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSelectedIds(new Set(
      document?.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id) || [],
    ));
  }, [document?.id, document?.updatedAt]);

  if (!document) {
    return (
      <Empty className="h-full border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
          <EmptyTitle>尚未选择文档</EmptyTitle>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onOpenDocument}>
            <FileText data-icon="inline-start" />
            选择文档
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (document.kind !== "docx") {
    return (
      <Empty className="h-full border">
        <EmptyHeader>
          <EmptyMedia variant="icon"><FileText /></EmptyMedia>
          <EmptyTitle>TXT 没有 Word 结构</EmptyTitle>
          <EmptyDescription>可在开始改写中继续处理。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" onClick={onOpenDocument}>返回开始改写</Button>
        </EmptyContent>
      </Empty>
    );
  }

  const persisted = new Set(document.paragraphs.filter((paragraph) => paragraph.selected).map((paragraph) => paragraph.id));
  const changed = selectedIds.size !== persisted.size
    || [...selectedIds].some((paragraphId) => !persisted.has(paragraphId));
  const locked = Boolean(run);

  const save = async () => {
    if (!selectedIds.size) {
      notify({ kind: "warning", title: "至少选择一个正文段落" });
      return;
    }
    setSaving(true);
    try {
      const value = await coreService.saveScope(document.id, [...selectedIds]);
      onDocumentChange(value);
      notify({ kind: "success", title: "正文范围已保存" });
    } catch (reason) {
      notify({
        kind: "error",
        title: "正文范围保存失败",
        text: reason instanceof Error ? reason.message : "请稍后重试。",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section data-testid="protection-map-workspace" className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <Item variant="outline" size="sm" className="shrink-0">
        <ItemContent>
          <ItemTitle className="truncate">{document.name}</ItemTitle>
          <ItemDescription>{document.kind.toUpperCase()} · {document.paragraphs.length} 段</ItemDescription>
        </ItemContent>
      </Item>

      {document.hasDigitalSignature ? (
        <Alert className="shrink-0">
          <ShieldCheck />
          <AlertTitle>数字签名可能失效</AlertTitle>
          <AlertDescription>导出时可自行决定是否继续。</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1">
        <ScopeEditor
          document={document}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          disabled={locked}
          heightClassName="h-full"
        />
      </div>

      <Separator />
      <div className="flex shrink-0 items-center justify-between gap-3">
        <Button variant="outline" onClick={onOpenDocument}>返回开始改写</Button>
        <Button disabled={locked || saving || !changed || !selectedIds.size} onClick={() => void save()}>
          {saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存正文范围
        </Button>
      </div>
    </section>
  );
}
