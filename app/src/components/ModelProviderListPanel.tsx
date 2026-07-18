import { DatabaseZap, Loader2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { deriveModelProviderListItemState } from "@/lib/modelProviderRepositoryViewModel";
import type { ModelProviderConfig } from "@/types/app";

export function ModelProviderListPanel({
  providers,
  selectedProviderId,
  enabledProviderCount,
  busy,
  providerCatalogRunning,
  loadingIconClassName,
  onSelectProviderId,
  onAddProvider,
  onRefreshAllProviderCatalogs,
}: {
  providers: ModelProviderConfig[];
  selectedProviderId: string;
  enabledProviderCount: number;
  busy: boolean;
  providerCatalogRunning: boolean;
  loadingIconClassName: string;
  onSelectProviderId: (providerId: string) => void;
  onAddProvider: () => void;
  onRefreshAllProviderCatalogs: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 text-sm font-semibold text-foreground">服务商</div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline">{providers.length} 个</Badge>
            <Badge variant="outline">{enabledProviderCount} 启用</Badge>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button type="button" size="sm" variant="outline" className="w-full justify-center" onClick={() => void onRefreshAllProviderCatalogs()} disabled={busy || providerCatalogRunning || enabledProviderCount === 0}>
            {providerCatalogRunning ? <Loader2 className={loadingIconClassName} data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}获取全部
          </Button>
          <Button type="button" size="sm" className="w-full justify-center" onClick={onAddProvider} disabled={busy}>
            <Plus data-icon="inline-start" />添加
          </Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col p-2">
          {providers.length ? providers.map((provider) => {
            const {
              active,
              modelLabel,
              modelCount,
              providerEnabled,
            } = deriveModelProviderListItemState(provider, selectedProviderId || null);
            return (
              <Button
                key={provider.id}
                type="button"
                variant="ghost"
                onClick={() => onSelectProviderId(provider.id)}
                className={cn(
                  "h-auto w-full flex-col items-stretch justify-start gap-2 whitespace-normal p-2.5 text-left",
                  active && "bg-muted",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{provider.name || "未命名服务商"}</span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">{modelLabel}</span>
                  </span>
                  <Badge variant={providerEnabled ? "secondary" : "outline"}>{providerEnabled ? "启用" : "关闭"}</Badge>
                </span>
                <span className="flex gap-2 text-xs text-muted-foreground">
                  <span>{modelCount} 模型</span>
                  <span>{provider.apiType}</span>
                </span>
              </Button>
            );
          }) : (
            <Empty className="border bg-background">
              <EmptyHeader>
                <EmptyMedia variant="icon"><DatabaseZap /></EmptyMedia>
                <EmptyTitle>还没有服务商</EmptyTitle>
              </EmptyHeader>
              <Button type="button" onClick={onAddProvider} disabled={busy}><Plus data-icon="inline-start" />添加服务商</Button>
            </Empty>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
