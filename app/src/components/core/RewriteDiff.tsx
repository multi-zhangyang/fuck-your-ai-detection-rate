import { useMemo } from "react";

import { Item, ItemContent, ItemTitle } from "@/components/ui/item";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createTextDiff, type TextDiffPart } from "@/lib/textDiff";

export type DiffMode = "compare" | "changes";

interface Props {
  original: string;
  rewritten: string;
  mode: DiffMode;
}

interface ProjectedPart {
  changed: boolean;
  value: string;
}

function projectParts(parts: TextDiffPart[], side: "original" | "rewritten"): ProjectedPart[] {
  const projected: ProjectedPart[] = [];
  for (const part of parts) {
    if (side === "original" && part.kind === "added") continue;
    if (side === "rewritten" && part.kind === "removed") continue;
    const changed = part.kind !== "equal";
    const previous = projected[projected.length - 1];
    if (previous?.changed === changed) previous.value += part.value;
    else projected.push({ changed, value: part.value });
  }
  return projected;
}

function DiffText({
  parts,
  side,
  marked,
}: {
  parts: TextDiffPart[];
  side: "original" | "rewritten";
  marked: boolean;
}) {
  const projected = useMemo(() => projectParts(parts, side), [parts, side]);
  return (
    <p
      className="whitespace-pre-wrap break-words text-base leading-8"
      data-diff-side={side}
      {...(side === "rewritten" ? { "data-review-text": true } : {})}
    >
      {projected.map((part, index) => {
        if (!marked || !part.changed) return <span key={index}>{part.value}</span>;
        if (side === "original") {
          return (
            <del
              key={index}
              className="rounded-sm bg-destructive/10 text-destructive decoration-transparent"
              data-diff-removed
            >
              {part.value}
            </del>
          );
        }
        return (
          <ins key={index} className="rounded-sm bg-primary/10 text-primary no-underline" data-diff-added>
            {part.value}
          </ins>
        );
      })}
    </p>
  );
}

function TextPane({
  title,
  side,
  parts,
  marked,
  showHeader = true,
}: {
  title: string;
  side: "original" | "rewritten";
  parts: TextDiffPart[];
  marked: boolean;
  showHeader?: boolean;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col" data-diff-pane={side}>
      {showHeader ? (
        <>
          <Item size="sm" className="shrink-0 rounded-none px-5">
            <ItemContent>
              <ItemTitle>{title}</ItemTitle>
            </ItemContent>
          </Item>
          <Separator />
        </>
      ) : null}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto w-full max-w-3xl p-5 md:p-7">
          <DiffText parts={parts} side={side} marked={marked} />
        </div>
      </ScrollArea>
    </section>
  );
}

export function RewriteDiff({ original, rewritten, mode }: Props) {
  const parts = useMemo(() => createTextDiff(original, rewritten), [original, rewritten]);
  const marked = mode === "changes";

  return (
    <div className="h-full min-h-0" data-text-diff data-diff-mode={mode}>
      <div className="hidden h-full min-h-0 lg:block" data-diff-layout="split">
        <ResizablePanelGroup orientation="horizontal" className="overflow-hidden">
          <ResizablePanel defaultSize="50%" minSize="30%">
            <TextPane title="原文" side="original" parts={parts} marked={marked} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="50%" minSize="30%">
            <TextPane title="改写" side="rewritten" parts={parts} marked={marked} />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <Tabs defaultValue="rewritten" className="flex h-full min-h-0 flex-col lg:hidden" data-diff-layout="tabs">
        <TabsList className="mx-3 mt-3 grid shrink-0 grid-cols-2">
          <TabsTrigger value="original">原文</TabsTrigger>
          <TabsTrigger value="rewritten">改写</TabsTrigger>
        </TabsList>
        <TabsContent value="original" className="m-0 min-h-0 flex-1 overflow-hidden">
          <TextPane title="原文" side="original" parts={parts} marked={marked} showHeader={false} />
        </TabsContent>
        <TabsContent value="rewritten" className="m-0 min-h-0 flex-1 overflow-hidden">
          <TextPane title="改写" side="rewritten" parts={parts} marked={marked} showHeader={false} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
