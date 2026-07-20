import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarRuntimeProgress } from "@/components/SidebarRuntimeProgress";
import { WORKBENCH_NAV_ITEMS, type WorkbenchView } from "@/lib/workbenchNav";
import { buildWorkbenchViewUrl } from "@/lib/workbenchRoute";
import { ChevronRight } from "lucide-react";
import type { MouseEvent } from "react";

export function AppSidebar({
  activeView,
  onViewChange,
  runtimeStatus,
  progressPercent,
}: {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => boolean | Promise<boolean>;
  runtimeStatus: string;
  progressPercent: number;
}) {
  const { isMobile, closeMobileForNavigation } = useSidebar();
  const primaryItems = WORKBENCH_NAV_ITEMS.filter((item) => ["home", "quality", "model"].includes(item.view));
  const documentItems = WORKBENCH_NAV_ITEMS.filter((item) => ["prompts", "protection", "history"].includes(item.view));
  const systemItems = WORKBENCH_NAV_ITEMS.filter((item) => ["diagnostics"].includes(item.view));
  async function navigateFromSidebar(view: WorkbenchView) {
    try {
      const allowed = await onViewChange(view);
      if (allowed !== false && isMobile) {
        closeMobileForNavigation();
      }
    } catch {
      // A rejected navigation must leave the mobile drawer open so the user can retry.
    }
  }
  function handleNavigationClick(event: MouseEvent<HTMLAnchorElement>, view: WorkbenchView) {
    // Keep native link behavior available for new tabs/windows, copied links,
    // and middle-clicks. Only an unmodified primary click is an SPA action.
    if (
      event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) {
      return;
    }
    event.preventDefault();
    void navigateFromSidebar(view);
  }
  function viewHref(view: WorkbenchView) {
    return buildWorkbenchViewUrl(
      view,
      typeof window === "undefined" ? "/workbench" : window.location.href,
    );
  }
  const renderNavItems = (items: typeof WORKBENCH_NAV_ITEMS) => items.map((item) => {
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.view}>
        <SidebarMenuButton
          asChild
          isActive={activeView === item.view}
          aria-current={activeView === item.view ? "page" : undefined}
          tooltip={item.label}
          className="group/nav relative h-9 px-2.5 text-sidebar-foreground/70 before:absolute before:left-0 before:h-4 before:w-0.5 before:rounded-full before:bg-sidebar-foreground before:opacity-0 before:transition-opacity hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent/80 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-sm data-[active=true]:before:opacity-100"
        >
          <a
            data-workbench-view={item.view}
            href={viewHref(item.view)}
            onClick={(event) => handleNavigationClick(event, item.view)}
          >
            <Icon />
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">{item.label}</span>
              <ChevronRight className="size-3.5 -translate-x-1 text-sidebar-foreground/40 opacity-0 transition-all group-hover/nav:translate-x-0 group-hover/nav:opacity-100 group-data-[collapsible=icon]:hidden" />
            </span>
          </a>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  });

  return (
    <Sidebar variant="inset" collapsible="icon" className="border-border/80">
      <SidebarHeader className="p-3 pb-2 pr-12 md:pr-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="论文 AI 降检平台"
              className="h-auto min-h-14 items-center gap-3 px-1.5 py-2 hover:bg-transparent"
            >
              <a data-workbench-home-link href={viewHref("home")} onClick={(event) => handleNavigationClick(event, "home")}>
                <span className="vercel-icon-frame size-9 overflow-hidden rounded-lg bg-card">
                  <img src="/brand-logo-96.webp" alt="" className="size-8 shrink-0 object-contain grayscale contrast-125" />
                </span>
                <span className="flex min-w-0 flex-col justify-center gap-0.5">
                  <span className="block truncate text-sm font-semibold">论文 AI 降检平台</span>
                  <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                    FYADR
                  </span>
                </span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel id="fyadr-sidebar-group-primary" className="vercel-kicker px-1">主工作流</SidebarGroupLabel>
          <SidebarGroupContent role="group" aria-labelledby="fyadr-sidebar-group-primary">
            <SidebarMenu className="gap-1.5">
              {renderNavItems(primaryItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel id="fyadr-sidebar-group-documents" className="vercel-kicker px-1">文档资产</SidebarGroupLabel>
          <SidebarGroupContent role="group" aria-labelledby="fyadr-sidebar-group-documents">
            <SidebarMenu className="gap-1.5">
              {renderNavItems(documentItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel id="fyadr-sidebar-group-system" className="vercel-kicker px-1">运行状态</SidebarGroupLabel>
          <SidebarGroupContent role="group" aria-labelledby="fyadr-sidebar-group-system">
            <SidebarMenu className="gap-1.5">
              {renderNavItems(systemItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRuntimeProgress status={runtimeStatus} percent={progressPercent} />
      <SidebarRail />
    </Sidebar>
  );
}
