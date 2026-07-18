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
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { SidebarRuntimeProgress } from "@/components/SidebarRuntimeProgress";
import { WORKBENCH_NAV_ITEMS, type WorkbenchView } from "@/lib/workbenchNav";
import { ChevronRight } from "lucide-react";

export function AppSidebar({
  activeView,
  onViewChange,
  runtimeStatus,
  progressPercent,
}: {
  activeView: WorkbenchView;
  onViewChange: (view: WorkbenchView) => void;
  runtimeStatus: string;
  progressPercent: number;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const primaryItems = WORKBENCH_NAV_ITEMS.filter((item) => ["home", "quality", "model"].includes(item.view));
  const documentItems = WORKBENCH_NAV_ITEMS.filter((item) => ["prompts", "format", "protection", "history"].includes(item.view));
  const systemItems = WORKBENCH_NAV_ITEMS.filter((item) => ["diagnostics"].includes(item.view));
  const renderNavItems = (items: typeof WORKBENCH_NAV_ITEMS) => items.map((item) => {
    const Icon = item.icon;
    return (
      <SidebarMenuItem key={item.view}>
        <SidebarMenuButton
          isActive={activeView === item.view}
          aria-current={activeView === item.view ? "page" : undefined}
          tooltip={item.label}
          className="group/nav relative h-9 px-2.5 text-sidebar-foreground/70 before:absolute before:left-0 before:h-4 before:w-0.5 before:rounded-full before:bg-sidebar-foreground before:opacity-0 before:transition-opacity hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent/80 data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-sm data-[active=true]:before:opacity-100"
          onClick={() => {
            onViewChange(item.view);
            if (isMobile) setOpenMobile(false);
          }}
        >
          <Icon />
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <ChevronRight className="size-3.5 -translate-x-1 text-sidebar-foreground/40 opacity-0 transition-all group-hover/nav:translate-x-0 group-hover/nav:opacity-100 group-data-[collapsible=icon]:hidden" />
          </span>
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
              size="lg"
              tooltip="论文 AI 降检平台"
              className="h-auto min-h-14 items-center gap-3 px-1.5 py-2 hover:bg-transparent"
              onClick={() => {
                onViewChange("home");
                if (isMobile) setOpenMobile(false);
              }}
            >
              <span className="vercel-icon-frame size-9 overflow-hidden rounded-lg bg-card">
                <img src="/brand-logo-96.webp" alt="论文 AI 降检平台" className="size-8 shrink-0 object-contain grayscale contrast-125" />
              </span>
              <span className="flex min-w-0 flex-col justify-center gap-0.5">
                <span className="block truncate text-sm font-semibold">论文 AI 降检平台</span>
                <span className="block truncate text-[10px] leading-tight text-muted-foreground">
                  FYADR
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        <SidebarGroup className="px-3 py-2">
          <SidebarGroupLabel className="vercel-kicker px-1">主工作流</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(primaryItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel className="vercel-kicker px-1">文档资产</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(documentItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="px-3 py-1.5">
          <SidebarGroupLabel className="vercel-kicker px-1">运行状态</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1.5">
              {renderNavItems(systemItems)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRuntimeProgress status={runtimeStatus} percent={progressPercent} />
    </Sidebar>
  );
}
