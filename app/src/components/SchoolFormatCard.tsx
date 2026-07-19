import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormatRulesPreview } from "@/components/FormatRulesPreview";
import { SchoolFormatParserSection } from "@/components/SchoolFormatParserSection";
import { deriveSchoolFormatCardState } from "@/lib/schoolFormatCardViewModel";
import type { FormatRules, ModelCatalogResult, ModelConfig } from "@/types/app";
import { GraduationCap } from "lucide-react";

type SchoolFormatCardProps = {
  busy: boolean;
  formatRuleText: string;
  activeFormatRules: FormatRules | null;
  modelConfig: ModelConfig;
  modelCatalog: ModelCatalogResult | null;
  parserProviderId: string;
  parserModel: string;
  onFormatRuleTextChange: (text: string) => void;
  onParseFormatRules: (text: string) => void;
  formatParsing: boolean;
  onCancelParseFormatRules: () => void;
  onParserProviderChange: (providerId: string) => void;
  onParserModelChange: (model: string) => void;
  pendingFormatRules: FormatRules | null;
  onConfirmFormatRules: () => void;
  onDiscardFormatRules: () => void;
  onResetFormatRules: () => void;
};

export function SchoolFormatCard({
  busy,
  formatRuleText,
  activeFormatRules,
  modelConfig,
  modelCatalog,
  parserProviderId,
  parserModel,
  onFormatRuleTextChange,
  onParseFormatRules,
  formatParsing,
  onCancelParseFormatRules,
  onParserProviderChange,
  onParserModelChange,
  pendingFormatRules,
  onConfirmFormatRules,
  onDiscardFormatRules,
  onResetFormatRules,
}: SchoolFormatCardProps) {
  const {
    displayRules,
    hasInput,
    usingDefault,
    parserProviderValue,
    providers,
    effectiveParserModel,
    parserModelOptions,
  } = deriveSchoolFormatCardState({
    formatRuleText,
    activeFormatRules,
    modelConfig,
    modelCatalog,
    parserProviderId,
    parserModel,
    pendingFormatRules,
  });
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/20 px-5 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="vercel-icon-frame size-9"><GraduationCap className="size-4" /></span>
            <div className="min-w-0">
              <div className="vercel-kicker mb-1">Requirement parser</div>
              <CardTitle className="text-lg">学校规范对照</CardTitle>
            </div>
          </div>
          <Badge variant={pendingFormatRules ? "warning" : usingDefault ? "outline" : "success"}>{pendingFormatRules ? "待确认" : usingDefault ? "默认对照" : "对照已保存"}</Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 p-4">
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
          这里会把粘贴的学校说明解析为结构化规范，供你与原稿人工对照；当前不会自动判定 Word 是否合规，也不会重排上传文件。导出始终以原文件格式为唯一真相源，只回填可编辑正文文字。
        </div>
        <SchoolFormatParserSection
          busy={busy}
          formatRuleText={formatRuleText}
          hasInput={hasInput}
          parserProviderValue={parserProviderValue}
          providers={providers}
          effectiveParserModel={effectiveParserModel}
          parserModelOptions={parserModelOptions}
          parserModel={parserModel}
          formatParsing={formatParsing}
          onFormatRuleTextChange={onFormatRuleTextChange}
          onParseFormatRules={onParseFormatRules}
          onCancelParseFormatRules={onCancelParseFormatRules}
          onParserProviderChange={onParserProviderChange}
          onParserModelChange={onParserModelChange}
          onResetFormatRules={onResetFormatRules}
        />

        {displayRules ? (
          <FormatRulesPreview
            rules={displayRules}
            busy={busy}
            isPending={Boolean(pendingFormatRules)}
            onConfirm={onConfirmFormatRules}
            onDiscard={onDiscardFormatRules}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
