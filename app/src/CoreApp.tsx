import { useCallback, useEffect, useRef, useState } from "react";

import { useAppNotifications } from "@/components/AppNotifications";
import { AppSidebar, WORKBENCH_NAV_ITEMS, type WorkbenchPage } from "@/components/AppSidebar";
import { ModelProfilesPage } from "@/components/core/ModelProfilesPage";
import { PromptTemplatesPage } from "@/components/core/PromptTemplatesPage";
import { ProtectionMapPage } from "@/components/core/ProtectionMapPage";
import { RecentDocumentsPage } from "@/components/core/RecentDocumentsPage";
import { RewritePage } from "@/components/core/RewritePage";
import { ThemeModeMenu } from "@/components/ThemeModeMenu";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { coreService } from "@/lib/coreService";
import type { CoreDocument, CoreRun, CoreSettings, RunEvent } from "@/types/core";

const WORKSPACE_STORAGE_KEY = "fyadr.workspace.v2";
const ACTIVE_RUN_STATUSES = new Set<CoreRun["status"]>(["queued", "running", "cancelling"]);

interface WorkspacePointer {
  documentId: string;
  runId: string;
}

function readWorkspacePointer(): WorkspacePointer | null {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(WORKSPACE_STORAGE_KEY) || "null") as Partial<WorkspacePointer> | null;
    if (!value || typeof value.documentId !== "string" || !value.documentId) return null;
    return { documentId: value.documentId, runId: typeof value.runId === "string" ? value.runId : "" };
  } catch {
    return null;
  }
}

function writeWorkspacePointer(value: WorkspacePointer | null): void {
  try {
    if (value) globalThis.localStorage?.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(value));
    else globalThis.localStorage?.removeItem(WORKSPACE_STORAGE_KEY);
  } catch {
    // Browser storage is optional.
  }
}

function statusLabel(run: CoreRun | null): string {
  if (!run) return "就绪";
  return {
    queued: "准备中",
    running: "正在改写",
    cancelling: "正在停止",
    paused: "等待继续",
    cancelled: "已停止",
    completed: "改写完成",
  }[run.status];
}

function mergeRunSnapshot(current: CoreRun, refreshed: CoreRun): CoreRun {
  const visibleChunks = new Map(current.chunks.map((chunk) => [chunk.id, chunk]));
  return {
    ...refreshed,
    chunks: refreshed.chunks.map((chunk) => {
      const visible = visibleChunks.get(chunk.id);
      return visible && visible.revision > chunk.revision ? visible : chunk;
    }),
  };
}

function ResponsiveSidebarController() {
  const { isMobile, open, setOpen } = useSidebar();
  const openRef = useRef(open);
  const autoCollapsed = useRef(false);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (isMobile) return;
    const media = window.matchMedia("(min-width: 768px) and (max-width: 1151px)");
    const sync = () => {
      if (media.matches && openRef.current) {
        autoCollapsed.current = true;
        setOpen(false);
      } else if (!media.matches && autoCollapsed.current) {
        autoCollapsed.current = false;
        setOpen(true);
      }
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [isMobile, setOpen]);

  return null;
}

export function CoreApp() {
  const { notify } = useAppNotifications();
  const [page, setPage] = useState<WorkbenchPage>("rewrite");
  const [settings, setSettings] = useState<CoreSettings | null>(null);
  const [document, setDocument] = useState<CoreDocument | null>(null);
  const [run, setRun] = useState<CoreRun | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [error, setError] = useState("");
  const [scopeRequest, setScopeRequest] = useState(0);

  const loadSettings = useCallback(async () => {
    try {
      setSettings(await coreService.getSettings());
      setError("");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "无法连接本机服务。";
      setError(message);
      notify({ kind: "error", title: "设置读取失败", text: message });
    }
  }, [notify]);

  useEffect(() => {
    let disposed = false;
    const bootstrap = async () => {
      try {
        const nextSettings = await coreService.getSettings();
        if (disposed) return;
        setSettings(nextSettings);
        setError("");

        const pointer = readWorkspacePointer();
        if (!pointer) return;
        try {
          const nextDocument = await coreService.getDocument(pointer.documentId);
          let nextRun: CoreRun | null = null;
          if (pointer.runId) {
            try {
              nextRun = await coreService.getRun(pointer.runId);
            } catch (reason) {
              writeWorkspacePointer({ documentId: pointer.documentId, runId: "" });
              notify({
                kind: "warning",
                title: "任务未能恢复",
                text: reason instanceof Error ? reason.message : "文档仍可继续使用。",
              });
            }
          }
          if (!disposed) {
            setDocument(nextDocument);
            setRun(nextRun);
          }
        } catch (reason) {
          writeWorkspacePointer(null);
          if (!disposed) {
            notify({
              kind: "warning",
              title: "文档未能恢复",
              text: reason instanceof Error ? reason.message : undefined,
            });
          }
        }
      } catch (reason) {
        if (!disposed) {
          const message = reason instanceof Error ? reason.message : "无法连接本机服务。";
          setError(message);
          notify({ kind: "error", title: "本机服务未连接", text: message });
        }
      } finally {
        if (!disposed) setBootstrapping(false);
      }
    };
    void bootstrap();
    return () => {
      disposed = true;
    };
  }, [notify]);

  useEffect(() => {
    if (bootstrapping) return;
    writeWorkspacePointer(document ? { documentId: document.id, runId: run?.id || "" } : null);
  }, [bootstrapping, document?.id, run?.id]);

  useEffect(() => {
    if (!run || !ACTIVE_RUN_STATUSES.has(run.status)) return;
    const runId = run.id;
    let disposed = false;
    let refreshing = false;
    let refreshAgain = false;

    const refreshRun = async () => {
      if (disposed) return;
      if (refreshing) {
        refreshAgain = true;
        return;
      }
      refreshing = true;
      try {
        const refreshed = await coreService.getRun(runId);
        if (disposed) return;
        setRun((current) => (
          current?.id === runId ? mergeRunSnapshot(current, refreshed) : current
        ));
      } catch {
        // EventSource reconnects automatically; polling remains a quiet fallback.
      } finally {
        refreshing = false;
        if (refreshAgain && !disposed) {
          refreshAgain = false;
          void refreshRun();
        }
      }
    };

    const handleEvent = (event: RunEvent) => {
      if (disposed) return;
      if (event.type === "chunk-stream" && event.chunkId && typeof event.text === "string") {
        setRun((current) => {
          if (!current || current.id !== runId) return current;
          const nextRevision = event.revision ?? 0;
          let changed = false;
          const chunks = current.chunks.map((chunk) => {
            if (chunk.id !== event.chunkId || nextRevision < chunk.revision) return chunk;
            if (chunk.revision === nextRevision && chunk.streamText === event.text) return chunk;
            changed = true;
            return { ...chunk, revision: nextRevision, streamText: event.text || "" };
          });
          return changed ? { ...current, chunks } : current;
        });
        return;
      }
      if (["run-status", "chunk-status", "chunk-complete", "chunk-paused", "paragraph-warnings"].includes(event.type)) {
        void refreshRun();
      }
    };

    const closeStream = coreService.streamRun(runId, handleEvent, { onOpen: () => void refreshRun() });
    const polling = window.setInterval(() => void refreshRun(), 4000);
    const handleVisibility = () => {
      if (globalThis.document.visibilityState === "visible") void refreshRun();
    };
    globalThis.document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      disposed = true;
      closeStream();
      window.clearInterval(polling);
      globalThis.document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [run?.id, run?.status]);

  const openRecent = (nextDocument: CoreDocument, nextRun: CoreRun | null) => {
    setDocument(nextDocument);
    setRun(nextRun);
    setPage("rewrite");
  };

  const pageLabel = WORKBENCH_NAV_ITEMS.find((item) => item.id === page)?.label || "开始改写";

  return (
    <SidebarProvider defaultOpen className="h-svh min-h-0 overflow-hidden bg-muted/40">
      <ResponsiveSidebarController />
      <AppSidebar
        activePage={page}
        onPageChange={setPage}
        runtimeStatus={statusLabel(run)}
        progressPercent={run?.progress.percent ?? 0}
        activityRevision={run?.chunks.reduce((total, chunk) => total + chunk.revision, 0) ?? 0}
      />

      <SidebarInset className="h-svh min-h-0 overflow-hidden">
        <header className="flex h-14 shrink-0 items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbPage>{pageLabel}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <ThemeModeMenu />
          </div>
        </header>
        <Separator />

        <main className="min-h-0 flex-1 overflow-hidden p-3 md:p-4">
          {!settings || bootstrapping ? (
            <div className="flex h-full items-center justify-center">
              {error && !settings ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>本机服务未连接</CardTitle>
                    <CardDescription>{error}</CardDescription>
                  </CardHeader>
                  <CardFooter>
                    <Button onClick={loadSettings}>重新连接</Button>
                  </CardFooter>
                </Card>
              ) : (
                <Spinner />
              )}
            </div>
          ) : (
            <div className="h-full min-h-0 overflow-hidden">
              {page === "rewrite" ? (
                <RewritePage
                  settings={settings}
                  document={document}
                  run={run}
                  onDocumentChange={setDocument}
                  onRunChange={setRun}
                  onSettingsRefresh={loadSettings}
                  onNavigate={setPage}
                  scopeRequest={scopeRequest}
                />
              ) : null}
              {page === "models" ? <ModelProfilesPage settings={settings} onRefresh={loadSettings} /> : null}
              {page === "prompts" ? <PromptTemplatesPage settings={settings} onRefresh={loadSettings} /> : null}
              {page === "protection" ? (
                <ProtectionMapPage
                  document={document}
                  run={run}
                  onOpenDocument={() => setPage("rewrite")}
                  onDocumentChange={setDocument}
                />
              ) : null}
              {page === "recent" ? (
                <RecentDocumentsPage
                  activeDocument={document}
                  activeRun={run}
                  onOpen={openRecent}
                  onDeleted={(documentId) => {
                    if (document?.id === documentId) {
                      setDocument(null);
                      setRun(null);
                    }
                  }}
                />
              ) : null}
            </div>
          )}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
