import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ROLE_GROUPS,
  ROLE_LABELS,
  formatAlignment,
  styleSpacing,
  styleSummary,
} from "@/lib/modelConfigCardHelpers";
import type { FormatRules } from "@/types/app";

function RuleRow({ role, style, meta }: { role: string; style?: Record<string, unknown>; meta?: { sourceText?: string; confidence?: number; isInferred?: boolean } }) {
  return (
    <div className="min-w-0 border-b border-border/70 p-3 last:border-b-0 xl:border-r xl:[&:nth-child(even)]:border-r-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate font-medium text-foreground">{ROLE_LABELS[role] ?? role}</div>
        <Badge variant={meta?.isInferred ? "warning" : meta ? "success" : "outline"}>{meta?.isInferred ? "继承" : meta ? `解析 ${Math.round((meta.confidence ?? 0.7) * 100)}%` : "默认"}</Badge>
      </div>
      <div className="mt-1 truncate text-sm text-muted-foreground">{styleSummary(style)} · {styleSpacing(style)} · {formatAlignment(style?.alignment)}</div>
    </div>
  );
}

export function FormatRulesPreview({
  rules,
  busy,
  isPending,
  onConfirm,
  onDiscard,
}: {
  rules: FormatRules;
  busy: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const styles = rules.styles ?? {};
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 md:flex-row md:items-center md:justify-between">
        <h3 className="text-base font-semibold text-foreground">解析结果</h3>
        {isPending ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={onConfirm} disabled={busy}>
              <CheckCircle2 data-icon="inline-start" />
              保存为对照
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={onDiscard} disabled={busy}>
              放弃本次解析
            </Button>
          </div>
        ) : null}
      </div>
      <div className="divide-y">
        {ROLE_GROUPS.map((group) => (
          <section key={group.title} className="grid gap-3 px-4 py-3 xl:grid-cols-[9rem_minmax(0,1fr)]">
            <div className="text-sm font-semibold text-foreground">{group.title}</div>
            <div className="grid overflow-hidden rounded-lg border bg-background xl:grid-cols-2">
              {group.roles.map((role) => (
                <RuleRow key={role} role={role} style={styles[role]} meta={rules.styleMeta?.[role]} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
