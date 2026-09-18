import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useThemeMode, type ThemeMode } from "@/hooks/useThemeMode";

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "浅色",
  dark: "暗黑",
  system: "系统",
};

export function ThemeModeMenu() {
  const { mode, setMode } = useThemeMode();
  const TriggerIcon = mode === "system" ? Monitor : mode === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="shrink-0" aria-label={`切换主题：${THEME_LABELS[mode]}`}>
          <TriggerIcon data-icon="inline-start" />
          <span className="hidden sm:inline">{THEME_LABELS[mode]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuGroup>
          <DropdownMenuLabel>主题模式</DropdownMenuLabel>
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
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
