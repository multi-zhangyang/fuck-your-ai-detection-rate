import { AlertCircle, RefreshCw, Save } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function SetupEditorModelRouteSummary({
  busy,
  providerOptionCount,
  providerCount,
  activeFlowSequenceLength,
  customizedRouteCount,
  unavailableRouteCount,
  modelRouteStatus,
  modelRouteHealthLabel,
  modelRouteTitle,
  activeModelRouteReady,
  onResetModelRouteToDefault,
  onRefreshAllProviderModels,
  onSaveModelConfig,
}: {
  busy: boolean;
  providerOptionCount: number;
  providerCount: number;
  activeFlowSequenceLength: number;
  customizedRouteCount: number;
  unavailableRouteCount: number;
  modelRouteStatus: string;
  modelRouteHealthLabel: string;
  modelRouteTitle: string;
  activeModelRouteReady: boolean;
  onResetModelRouteToDefault: () => void;
  onRefreshAllProviderModels: () => void;
  onSaveModelConfig: () => void;
}) {
  return (
    <Card data-ui-section="model-route-compact" className="min-w-0 overflow-hidden shadow-none">
      <CardContent className="flex min-w-0 flex-col gap-3 overflow-hidden p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <Badge variant={unavailableRouteCount ? "warning" : activeModelRouteReady ? "success" : "outline"} className="shrink-0">{modelRouteHealthLabel}</Badge>
            <span className="min-w-0 truncate font-medium">{modelRouteTitle}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className="text-muted-foreground">服务商 {providerOptionCount}/{providerCount}</span>
            <span className="text-muted-foreground">轮次 {activeFlowSequenceLength}</span>
          </div>
          <Badge variant={customizedRouteCount ? "secondary" : "outline"} className="shrink-0">{modelRouteStatus}</Badge>
        </div>
        <div className="grid min-w-0 gap-2 sm:grid-cols-3">
          <Button type="button" variant="outline" size="sm" onClick={onResetModelRouteToDefault} disabled={busy}>继承默认</Button>
          <Button type="button" variant="outline" size="sm" onClick={onRefreshAllProviderModels} disabled={busy || providerOptionCount === 0}>
            <RefreshCw data-icon="inline-start" />读服务商
          </Button>
          <Button type="button" variant="neutral" size="sm" onClick={onSaveModelConfig} disabled={busy || unavailableRouteCount > 0}>
            <Save data-icon="inline-start" />保存
          </Button>
        </div>
        {unavailableRouteCount ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>有轮次不可用</AlertTitle>
            <AlertDescription>切换服务商或改为继承默认。</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
