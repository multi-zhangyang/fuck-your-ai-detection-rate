import { FileClock, FilePenLine, Home, Settings2, ShieldCheck } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

export type WorkbenchPage = "rewrite" | "models" | "prompts" | "protection" | "recent";

export const WORKBENCH_NAV_ITEMS = [
  { id: "rewrite", label: "开始改写", icon: Home },
  { id: "models", label: "模型连接", icon: Settings2 },
  { id: "prompts", label: "提示词", icon: FilePenLine },
  { id: "protection", label: "保护区地图", icon: ShieldCheck },
  { id: "recent", label: "最近文档", icon: FileClock },
] satisfies Array<{ id: WorkbenchPage; label: string; icon: typeof Home }>;

interface Props {
  activePage: WorkbenchPage;
  onPageChange: (page: WorkbenchPage) => void;
  runtimeStatus: string;
  progressPercent: number;
  activityRevision: number;
}

export function AppSidebar({ activePage, onPageChange, runtimeStatus, progressPercent, activityRevision }: Props) {
  const { isMobile, setOpenMobile, state } = useSidebar();
  const progress = Math.max(0, Math.min(100, Math.round(progressPercent)));

  const navigate = (page: WorkbenchPage) => {
    onPageChange(page);
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="FYADR" onClick={() => navigate("rewrite")}>
              <img src="/brand-logo-96.webp" alt="" className="size-9 rounded-md object-contain" />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate font-semibold">FYADR</span>
                <span className="truncate text-xs">文档改写平台</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {WORKBENCH_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activePage === item.id}
                      aria-current={activePage === item.id ? "page" : undefined}
                      tooltip={item.label}
                      onClick={() => navigate(item.id)}
                    >
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {activePage !== "rewrite" && runtimeStatus !== "就绪" ? (
        <SidebarFooter data-testid="active-run-sidebar" data-run-revision={activityRevision}>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={`${runtimeStatus} · ${progress}%`}>
                <span className="truncate">{runtimeStatus}</span>
                {state === "expanded" ? <SidebarMenuBadge>{progress}%</SidebarMenuBadge> : null}
              </SidebarMenuButton>
              {state === "expanded" ? <Progress value={progress} className="mt-2" aria-label={`${runtimeStatus} ${progress}%`} /> : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
      <SidebarRail />
    </Sidebar>
  );
}
