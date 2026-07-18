import { Loader2, SlidersHorizontal, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { LOADING_ICON_CLASS_NAME } from "@/lib/loadingIcon";

export function SchoolFormatParserTextActions({
  busy,
  formatRuleText,
  hasInput,
  formatParsing,
  onFormatRuleTextChange,
  onParseFormatRules,
  onCancelParseFormatRules,
  onResetFormatRules,
}: {
  busy: boolean;
  formatRuleText: string;
  hasInput: boolean;
  formatParsing: boolean;
  onFormatRuleTextChange: (text: string) => void;
  onParseFormatRules: (text: string) => void;
  onCancelParseFormatRules: () => void;
  onResetFormatRules: () => void;
}) {
  return (
    <FieldGroup className="gap-3">
      <Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FieldLabel htmlFor="formatRuleText">学校格式要求</FieldLabel>
          <Badge variant={hasInput ? "default" : "outline"}>{hasInput ? `${formatRuleText.trim().length} 字` : "未填写"}</Badge>
        </div>
        <Textarea
          id="formatRuleText"
          value={formatRuleText}
          onChange={(event) => onFormatRuleTextChange(event.target.value)}
          placeholder="粘贴学校格式要求"
          disabled={busy}
          className="h-[150px] min-h-[150px] resize-y"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onParseFormatRules(formatRuleText)} disabled={busy}>
          {formatParsing ? <Loader2 className={LOADING_ICON_CLASS_NAME} data-icon="inline-start" /> : <SlidersHorizontal data-icon="inline-start" />}
          {hasInput ? "解析规范" : "使用默认规范"}
        </Button>
        {formatParsing ? (
          <Button type="button" size="sm" variant="destructive" onClick={onCancelParseFormatRules}>
            <X data-icon="inline-start" />
            停止解析
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" onClick={onResetFormatRules} disabled={busy}>
          恢复默认
        </Button>
      </div>
    </FieldGroup>
  );
}
