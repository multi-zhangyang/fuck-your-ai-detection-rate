import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { createTextDiff, type TextDiffPart } from "@/lib/textDiff";

interface Props {
  original: string;
  rewritten: string;
}

function OriginalText({ parts }: { parts: TextDiffPart[] }) {
  return (
    <p className="whitespace-pre-wrap break-words text-base leading-8" data-diff-side="original">
      {parts.map((part, index) => {
        if (part.kind === "added") return null;
        if (part.kind === "removed") {
          return (
            <del
              key={index}
              className="rounded-sm bg-destructive/10 text-destructive decoration-destructive/40"
              data-diff-removed
            >
              {part.value}
            </del>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </p>
  );
}

function RewrittenText({ parts }: { parts: TextDiffPart[] }) {
  return (
    <p
      className="whitespace-pre-wrap break-words text-base leading-8"
      data-diff-side="rewritten"
      data-review-text
    >
      {parts.map((part, index) => {
        if (part.kind === "removed") return null;
        if (part.kind === "added") {
          return (
            <ins key={index} className="rounded-sm bg-primary/10 text-primary no-underline" data-diff-added>
              {part.value}
            </ins>
          );
        }
        return <span key={index}>{part.value}</span>;
      })}
    </p>
  );
}

export function RewriteDiff({ original, rewritten }: Props) {
  const parts = useMemo(() => createTextDiff(original, rewritten), [original, rewritten]);

  return (
    <div data-text-diff className="flex flex-col">
      <section className="flex flex-col gap-4 p-5 md:p-8">
        <Badge variant="outline" className="w-fit">原文</Badge>
        <OriginalText parts={parts} />
      </section>
      <Separator />
      <section className="flex flex-col gap-4 p-5 md:p-8">
        <Badge variant="secondary" className="w-fit">改写后</Badge>
        <RewrittenText parts={parts} />
      </section>
    </div>
  );
}
