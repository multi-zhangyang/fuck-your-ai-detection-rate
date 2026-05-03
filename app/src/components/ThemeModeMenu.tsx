import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeMode, type ThemeMode } from "@/hooks/useThemeMode";

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "暗黑",
  system: "系统",
};

export function ThemeModeMenu() {
  const { mode, resolvedMode, setMode } = useThemeMode();
  const TriggerIcon = mode === "system" ? Monitor : mode === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-xs" aria-label={`切换主题：${THEME_LABELS[mode]}`}>
          <TriggerIcon data-icon="inline-start" />
          <span className="hidden sm:inline">{THEME_LABELS[mode]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>主题</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
          <DropdownMenuRadioItem value="light">
            <Sun />
            浅色
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon />
            暗黑
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor />
            系统
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">当前：{resolvedMode === "dark" ? "暗黑" : "浅色"}</DropdownMenuLabel>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
