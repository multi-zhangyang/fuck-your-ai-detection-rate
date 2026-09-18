import { useCallback, useLayoutEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedThemeMode = "light" | "dark";

const THEME_MODE_KEY = "fyadr.themeMode";
const THEME_MODE_DEFAULT_MIGRATION_KEY = "fyadr.themeMode.defaultDarkMigrated";
const SYSTEM_THEME_QUERY = "(prefers-color-scheme: dark)";
const DEFAULT_THEME_MODE: ThemeMode = "dark";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

function getStoredThemeMode(): ThemeMode {
  try {
    const storage = globalThis.localStorage;
    const value = storage?.getItem(THEME_MODE_KEY);
    const migrated = storage?.getItem(THEME_MODE_DEFAULT_MIGRATION_KEY) === "1";
    if (value === "system" && !migrated) {
      storage?.setItem(THEME_MODE_KEY, DEFAULT_THEME_MODE);
      storage?.setItem(THEME_MODE_DEFAULT_MIGRATION_KEY, "1");
      return DEFAULT_THEME_MODE;
    }
    return isThemeMode(value) ? value : DEFAULT_THEME_MODE;
  } catch {
    return DEFAULT_THEME_MODE;
  }
}

function getSystemThemeMode(): ResolvedThemeMode {
  if (typeof globalThis.matchMedia !== "function") {
    return "light";
  }
  return globalThis.matchMedia(SYSTEM_THEME_QUERY).matches ? "dark" : "light";
}

function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  return mode === "system" ? getSystemThemeMode() : mode;
}

function applyThemeMode(mode: ThemeMode): ResolvedThemeMode {
  const resolvedMode = resolveThemeMode(mode);
  const root = globalThis.document?.documentElement;
  if (root) {
    root.classList.toggle("dark", resolvedMode === "dark");
    root.dataset.themeMode = mode;
    root.dataset.resolvedTheme = resolvedMode;
    root.style.colorScheme = resolvedMode;
  }
  return resolvedMode;
}

export function useThemeMode() {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredThemeMode());
  const [resolvedMode, setResolvedMode] = useState<ResolvedThemeMode>(() => resolveThemeMode(getStoredThemeMode()));

  useLayoutEffect(() => {
    setResolvedMode(applyThemeMode(mode));
    if (mode !== "system" || typeof globalThis.matchMedia !== "function") {
      return undefined;
    }

    const query = globalThis.matchMedia(SYSTEM_THEME_QUERY);
    const handleSystemThemeChange = () => setResolvedMode(applyThemeMode("system"));
    query.addEventListener?.("change", handleSystemThemeChange);
    return () => query.removeEventListener?.("change", handleSystemThemeChange);
  }, [mode]);

  const setMode = useCallback((nextMode: ThemeMode) => {
    setModeState(nextMode);
    try {
      globalThis.localStorage?.setItem(THEME_MODE_KEY, nextMode);
      globalThis.localStorage?.setItem(THEME_MODE_DEFAULT_MIGRATION_KEY, "1");
    } catch {
      // Theme preference is cosmetic; ignore storage failures.
    }
  }, []);

  return { mode, resolvedMode, setMode };
}
