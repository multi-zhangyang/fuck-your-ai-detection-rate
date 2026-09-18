import { useMemo, useState } from "react";
import { Ellipsis, FileSearch, ListFilter, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { documentScopeUnits, scopeStateOf } from "@/lib/scopeModel";
import type { CoreDocument } from "@/types/core";

type ScopeFilter = "all" | "selected" | "available" | "locked";

interface Props {
  document: CoreDocument;
  selectedIds: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
  disabled?: boolean;
  heightClassName?: string;
}

export function ScopeEditor({
  document,
  selectedIds,
  onSelectionChange,
  disabled = false,
  heightClassName = "h-[min(64svh,42rem)]",
}: Props) {
  const [filter, setFilter] = useState<ScopeFilter>("all");
  const [query, setQuery] = useState("");
  const units = useMemo(() => documentScopeUnits(document), [document]);
  const paragraphs = useMemo(
    () => new Map(document.paragraphs.map((paragraph) => [paragraph.id, paragraph])),
    [document.paragraphs],
  );
  const suggested = useMemo(() => new Set(
    document.paragraphs
      .filter((paragraph) => paragraph.safe && paragraph.suggestedSelected)
      .map((paragraph) => paragraph.id),
  ), [document.paragraphs]);
  const allSelectable = useMemo(() => new Set(
    document.paragraphs
      .filter((paragraph) => paragraph.safe && paragraph.text.trim())
      .map((paragraph) => paragraph.id),
  ), [document.paragraphs]);
  const visibleUnits = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return units.filter((unit) => {
      const state = scopeStateOf(unit, selectedIds);
      if (filter !== "all" && state !== filter) return false;
      if (!unit.text.trim() && filter !== "locked") return false;
      if (!needle) return true;
      const paragraph = paragraphs.get(unit.paragraphId);
      return [unit.text, unit.label, paragraph?.text]
        .some((value) => String(value || "").toLocaleLowerCase().includes(needle));
    });
  }, [filter, paragraphs, query, selectedIds, units]);

  const setChecked = (paragraphId: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(paragraphId);
    else next.delete(paragraphId);
    onSelectionChange(next);
  };

  return (
    <Card className={`flex min-h-0 flex-col overflow-hidden ${heightClassName}`}>
      <CardHeader className="shrink-0 p-3">
        <div className="flex items-center gap-2">
          <InputGroup className="min-w-0 flex-1">
            <InputGroupAddon><Search /></InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索正文"
              aria-label="搜索正文"
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="shrink-0" aria-label="筛选正文范围">
                <ListFilter data-icon="inline-start" />
                {filter === "selected" ? "改写" : filter === "available" ? "保留" : filter === "locked" ? "固定" : "全部"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={filter} onValueChange={(value) => setFilter(value as ScopeFilter)}>
                <DropdownMenuRadioItem value="all">全部</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="selected">改写</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="available">保留</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="locked">固定</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="范围操作">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem disabled={disabled} onSelect={() => onSelectionChange(new Set(suggested))}>
                  恢复建议范围
                </DropdownMenuItem>
                <DropdownMenuItem disabled={disabled} onSelect={() => onSelectionChange(new Set(allSelectable))}>
                  选择全部正文
                </DropdownMenuItem>
                <DropdownMenuItem disabled={disabled} onSelect={() => onSelectionChange(new Set())}>
                  清空改写范围
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="min-h-0 flex-1 p-0">
        <ScrollArea className="h-full">
          {visibleUnits.length ? (
            <ItemGroup>
              {visibleUnits.map((unit) => {
                const paragraph = paragraphs.get(unit.paragraphId);
                const state = scopeStateOf(unit, selectedIds);
                const checked = state === "selected";
                const paragraphNumber = paragraph?.order ?? unit.order;
                const label = paragraphNumber === null || paragraphNumber === undefined
                  ? unit.label || "固定内容"
                  : `第 ${paragraphNumber + 1} 段`;
                return (
                  <Item
                    key={`${unit.unitIndex}-${unit.paragraphId || unit.reason}`}
                    id={`scope-unit-${unit.unitIndex}`}
                    size="sm"
                    className="items-start rounded-none"
                  >
                    {unit.selectable && unit.paragraphId ? (
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(value) => setChecked(unit.paragraphId, value === true)}
                        aria-label={`${checked ? "移出" : "加入"}${label}改写范围`}
                      />
                    ) : (
                      <Badge variant="outline">固定</Badge>
                    )}
                    <ItemContent className="min-w-0">
                      <ItemTitle>{label}</ItemTitle>
                      <ItemDescription className="line-clamp-none whitespace-pre-wrap break-words">
                        {unit.text || unit.label || "空白结构"}
                      </ItemDescription>
                    </ItemContent>
                  </Item>
                );
              })}
            </ItemGroup>
          ) : (
            <Empty className="min-h-64">
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileSearch /></EmptyMedia>
                <EmptyTitle>没有匹配内容</EmptyTitle>
                <EmptyDescription>调整搜索或筛选条件。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
