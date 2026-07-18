import { CheckCircle2, Gauge, Loader2, RefreshCw, Save, ServerCog, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getModelConfigValidationIssues } from "@/lib/modelConfigValidation";
import type { ModelCatalogResult, ModelConfig } from "@/types/app";

export function ModelDefaultConnectionActions({
  value,
  busy,
  modelCatalog,
  modelCatalogBusy,
  modelCatalogError,
  loadingIconClassName,
  onSave,
  onTestConnection,
  onRefreshModels,
}: {
  value: ModelConfig;
  busy: boolean;
  modelCatalog: ModelCatalogResult | null;
  modelCatalogBusy: boolean;
  modelCatalogError: string;
  loadingIconClassName: string;
  onSave: (nextValue?: ModelConfig, testValue?: ModelConfig) => void;
  onTestConnection: () => void;
  onRefreshModels: () => void;
}) {
  const validationIssues = getModelConfigValidationIssues(value, { requireConnection: true });
  const connectionBlocked = validationIssues.length > 0;
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <Card className="overflow-hidden border-border/80 bg-card/80 shadow-none">
        <CardHeader className="border-b border-border/70 bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="vercel-icon-frame size-8"><ServerCog className="size-4" /></span>
              <div>
                <div className="vercel-kicker mb-0.5">Actions</div>
                <CardTitle className="text-base">连接操作</CardTitle>
              </div>
            </div>
            <Badge variant={connectionBlocked ? "warning" : "success"}>{connectionBlocked ? "待补全" : "配置完整"}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-4 pt-0">
          <Button variant="outline" onClick={onTestConnection} disabled={busy || connectionBlocked}>
            <ShieldCheck data-icon="inline-start" />测试连接
          </Button>
          <Button variant="outline" onClick={onRefreshModels} disabled={busy || modelCatalogBusy || connectionBlocked}>
            {modelCatalogBusy ? <Loader2 className={loadingIconClassName} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}读取模型列表
          </Button>
          <Button onClick={() => onSave(value, value)} disabled={busy || connectionBlocked}>
            <Save data-icon="inline-start" />保存默认配置
          </Button>
        </CardContent>
      </Card>
      {validationIssues.length ? (
        <Alert>
          <AlertTitle>配置待完善</AlertTitle>
          <AlertDescription>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              {validationIssues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {modelCatalogError ? (
        <Alert variant="destructive">
          <AlertTitle>读取默认模型失败</AlertTitle>
          <AlertDescription>{modelCatalogError}</AlertDescription>
        </Alert>
      ) : null}
      {modelCatalog ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>模型列表已读取</AlertTitle>
          <AlertDescription>当前服务返回 {modelCatalog.models.length} 个可用模型。</AlertDescription>
        </Alert>
      ) : null}
      <Card className="mt-auto overflow-hidden border-border/80 bg-muted/25 shadow-none">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm">当前调用策略</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid gap-2 p-4 pt-1 text-xs">
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/70 px-3 py-2">
            <span className="text-muted-foreground">接口</span><span className="font-mono">{value.apiType}</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/70 px-3 py-2">
            <span className="text-muted-foreground">超时</span><span className="font-mono">{value.requestTimeoutSeconds}s</span>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border border-border/70 bg-card/70 px-3 py-2">
            <span className="text-muted-foreground">并发 / 重试</span><span className="font-mono">{value.rewriteConcurrency} / {value.maxRetries}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
