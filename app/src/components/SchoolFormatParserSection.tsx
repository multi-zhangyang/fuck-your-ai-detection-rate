import { SchoolFormatParserControls } from "@/components/SchoolFormatParserControls";
import { SchoolFormatParserTextActions } from "@/components/SchoolFormatParserTextActions";
import type { ModelProviderConfig } from "@/types/app";

export function SchoolFormatParserSection({
  busy,
  formatRuleText,
  hasInput,
  parserProviderValue,
  providers,
  effectiveParserModel,
  parserModelOptions,
  parserModel,
  formatParsing,
  onFormatRuleTextChange,
  onParseFormatRules,
  onCancelParseFormatRules,
  onParserProviderChange,
  onParserModelChange,
  onResetFormatRules,
}: {
  busy: boolean;
  formatRuleText: string;
  hasInput: boolean;
  parserProviderValue: string;
  providers: ModelProviderConfig[];
  effectiveParserModel: string;
  parserModelOptions: string[];
  parserModel: string;
  formatParsing: boolean;
  onFormatRuleTextChange: (text: string) => void;
  onParseFormatRules: (text: string) => void;
  onCancelParseFormatRules: () => void;
  onParserProviderChange: (providerId: string) => void;
  onParserModelChange: (model: string) => void;
  onResetFormatRules: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(15rem,18rem)_minmax(0,1fr)]">
        <SchoolFormatParserControls
          busy={busy}
          parserProviderValue={parserProviderValue}
          providers={providers}
          effectiveParserModel={effectiveParserModel}
          parserModelOptions={parserModelOptions}
          parserModel={parserModel}
          onParserProviderChange={onParserProviderChange}
          onParserModelChange={onParserModelChange}
        />
        <SchoolFormatParserTextActions
          busy={busy}
          formatRuleText={formatRuleText}
          hasInput={hasInput}
          formatParsing={formatParsing}
          onFormatRuleTextChange={onFormatRuleTextChange}
          onParseFormatRules={onParseFormatRules}
          onCancelParseFormatRules={onCancelParseFormatRules}
          onResetFormatRules={onResetFormatRules}
        />
      </div>
    </div>
  );
}
