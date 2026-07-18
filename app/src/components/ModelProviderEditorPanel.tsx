import { DatabaseZap, Loader2, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";

import { ModelProviderEditorFields } from "@/components/ModelProviderEditorFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ModelConfig, ModelProviderConfig } from "@/types/app";

type Props = {
  value: ModelConfig;
  busy: boolean;
  selectedProvider: ModelProviderConfig | null;
  providerCatalogBusy: Partial<Record<string, boolean>>;
  providerCatalogErrors: Partial<Record<string, string>>;
  providerCatalogRunning: boolean;
  loadingIconClassName: string;
  onAddProvider: () => void;
  onDeleteProvider: (providerId: string) => void;
  onUpdateProvider: (providerId: string, patch: Partial<ModelProviderConfig>) => void;
  onRefreshProviderCatalog: (provider: ModelProviderConfig) => void;
  onStopProviderCatalogRequest: () => void;
  onSaveProviderConfig: (provider: ModelProviderConfig) => void;
};

export function ModelProviderEditorPanel({
  value,
  busy,
  selectedProvider,
  providerCatalogBusy,
  providerCatalogErrors,
  providerCatalogRunning,
  loadingIconClassName,
  onAddProvider,
  onDeleteProvider,
  onUpdateProvider,
  onRefreshProviderCatalog,
  onStopProviderCatalogRequest,
  onSaveProviderConfig,
}: Props) {
  if (!selectedProvider) {
    return (
      <Empty className="min-h-[28rem] border bg-background">
        <EmptyHeader>
          <EmptyMedia variant="icon"><DatabaseZap /></EmptyMedia>
          <EmptyTitle>先添加服务商</EmptyTitle>
        </EmptyHeader>
        <Button type="button" onClick={onAddProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
      </Empty>
    );
  }

  return (
    <Card className="flex min-h-0 flex-col overflow-hidden shadow-none">
      <CardHeader className="border-b p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">{selectedProvider.name || "未命名服务商"}</CardTitle>
            <div className="mt-1 flex flex-wrap gap-2">
              <Badge variant="outline">{selectedProvider.models?.length ?? 0} 模型</Badge>
              <Badge variant="outline">{selectedProvider.apiType}</Badge>
              <Badge variant={selectedProvider.enabled !== false ? "secondary" : "outline"}>{selectedProvider.enabled !== false ? "启用" : "关闭"}</Badge>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || providerCatalogRunning} onClick={() => void onRefreshProviderCatalog(selectedProvider)}>
              {providerCatalogBusy[selectedProvider.id] ? <Loader2 className={loadingIconClassName} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}获取模型
            </Button>
            {providerCatalogRunning ? (
              <Button type="button" size="sm" variant="outlineDanger" onClick={onStopProviderCatalogRequest}>
                <X data-icon="inline-start" />停止
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={() => onSaveProviderConfig(selectedProvider)} disabled={busy}>
              <Save data-icon="inline-start" />保存
            </Button>
            <Button type="button" variant="outlineDanger" size="sm" onClick={() => onDeleteProvider(selectedProvider.id)} disabled={busy}>
              <Trash2 data-icon="inline-start" />删除
            </Button>
          </div>
        </div>
      </CardHeader>
      <ScrollArea className="min-h-0 flex-1">
        <CardContent className="flex flex-col gap-3 p-3">
          <ModelProviderEditorFields
            value={value}
            selectedProvider={selectedProvider}
            providerCatalogErrors={providerCatalogErrors}
            onUpdateProvider={onUpdateProvider}
          />
        </CardContent>
      </ScrollArea>
    </Card>
  );
}
