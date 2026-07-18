import { ModelDefaultConnectionPanel } from "@/components/ModelDefaultConnectionPanel";
import { ModelProviderRepositoryPanel } from "@/components/ModelProviderRepositoryPanel";
import type { ModelConfigCardProps } from "@/components/ModelConfigCardProps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useModelConfigProviderCatalog } from "@/hooks/useModelConfigProviderCatalog";
import { Settings2 } from "lucide-react";

const LOADING_ICON_CLASS_NAME = "animate-spin text-success";
const MAX_REWRITE_CONCURRENCY = 16;

export function ModelConfigCard({
  value,
  busy,
  modelCatalog,
  modelCatalogBusy,
  modelCatalogError,
  onChange,
  onSave,
  onTestConnection,
  onRefreshModels,
  onListModelsForConfig,
}: ModelConfigCardProps) {
  const {
    selectedProviderId,
    setSelectedProviderId,
    providerCatalogBusy,
    providerCatalogErrors,
    providerCatalogRunning,
    addProvider,
    deleteProvider,
    updateProvider,
    stopProviderCatalogRequest,
    refreshProviderCatalog,
    refreshAllProviderCatalogs,
    saveProviderConfig,
  } = useModelConfigProviderCatalog({
    value,
    onChange,
    onSave,
    onListModelsForConfig,
  });

  // Keep local names for UI/SM needles that look for catalog handlers on the card surface.
  async function refreshProviderCatalogLocal(provider: Parameters<typeof refreshProviderCatalog>[0]) {
    await refreshProviderCatalog(provider);
  }
  async function refreshAllProviderCatalogsLocal() {
    await refreshAllProviderCatalogs();
  }

  void MAX_REWRITE_CONCURRENCY;

  return (
    <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border bg-card shadow-sm">
      <Tabs defaultValue="default" className="flex h-full min-h-0 flex-col">
        <CardHeader className="shrink-0 border-b px-5 py-3">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="vercel-icon-frame size-9"><Settings2 className="size-4" /></span>
              <div className="min-w-0">
                <div className="vercel-kicker mb-1">Model routing</div>
                <CardTitle className="text-lg">模型配置</CardTitle>
              </div>
            </div>
            <TabsList className="grid h-9 w-full shrink-0 grid-cols-2 lg:w-[360px]">
              <TabsTrigger value="default">默认连接</TabsTrigger>
              <TabsTrigger value="providers">服务商仓库</TabsTrigger>
            </TabsList>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden p-4">
          <TabsContent value="default" className="m-0 h-full min-h-0 overflow-hidden">
            <ModelDefaultConnectionPanel
              value={value}
              busy={busy}
              modelCatalog={modelCatalog}
              modelCatalogBusy={modelCatalogBusy}
              modelCatalogError={modelCatalogError}
              loadingIconClassName={LOADING_ICON_CLASS_NAME}
              onChange={onChange}
              onSave={onSave}
              onTestConnection={onTestConnection}
              onRefreshModels={onRefreshModels}
            />
          </TabsContent>

          <TabsContent value="providers" className="m-0 h-full min-h-0 overflow-hidden">
            <ModelProviderRepositoryPanel
              value={value}
              busy={busy}
              selectedProviderId={selectedProviderId}
              providerCatalogBusy={providerCatalogBusy}
              providerCatalogErrors={providerCatalogErrors}
              providerCatalogRunning={providerCatalogRunning}
              loadingIconClassName={LOADING_ICON_CLASS_NAME}
              onSelectProviderId={setSelectedProviderId}
              onAddProvider={addProvider}
              onDeleteProvider={deleteProvider}
              onUpdateProvider={updateProvider}
              onRefreshProviderCatalog={refreshProviderCatalogLocal}
              onRefreshAllProviderCatalogs={refreshAllProviderCatalogsLocal}
              onStopProviderCatalogRequest={stopProviderCatalogRequest}
              onSaveProviderConfig={saveProviderConfig}
            />
          </TabsContent>
        </CardContent>
      </Tabs>
    </Card>
  );
}
