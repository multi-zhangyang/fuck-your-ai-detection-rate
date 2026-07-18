import {
  FORMAT_PARSER_DEFAULT_PROVIDER_ID,
  FORMAT_RULE_MODEL_ROUTE_KEY,
} from "@/lib/storageKeys";
import {
  readStorageValue,
  removeStorageValue,
  writeStorageValue,
} from "@/lib/safeStorage";
import type { FormatParserModelRoute, FormatRules } from "@/types/app";

export function loadStoredText(key: string): string {
  return readStorageValue(key) ?? "";
}

export function saveStoredText(key: string, value: string): boolean {
  return value ? writeStorageValue(key, value) : removeStorageValue(key);
}

export function loadStoredFormatRules(key: string): FormatRules | null {
  const raw = readStorageValue(key);
  if (!raw) return null;
  try {
    return raw ? JSON.parse(raw) as FormatRules : null;
  } catch {
    removeStorageValue(key);
    return null;
  }
}

export function normalizeFormatParserRoute(value: unknown): FormatParserModelRoute {
  if (!value || typeof value !== "object") {
    return { providerId: FORMAT_PARSER_DEFAULT_PROVIDER_ID, model: "" };
  }
  const route = value as Partial<FormatParserModelRoute>;
  return {
    providerId: String(route.providerId || FORMAT_PARSER_DEFAULT_PROVIDER_ID),
    model: String(route.model || ""),
  };
}

export function loadStoredFormatParserRoute(): FormatParserModelRoute {
  const raw = readStorageValue(FORMAT_RULE_MODEL_ROUTE_KEY);
  if (!raw) {
    return { providerId: FORMAT_PARSER_DEFAULT_PROVIDER_ID, model: "" };
  }
  try {
    return normalizeFormatParserRoute(JSON.parse(raw));
  } catch {
    removeStorageValue(FORMAT_RULE_MODEL_ROUTE_KEY);
    return { providerId: FORMAT_PARSER_DEFAULT_PROVIDER_ID, model: "" };
  }
}

export function saveStoredFormatParserRoute(route: FormatParserModelRoute): boolean {
  return writeStorageValue(FORMAT_RULE_MODEL_ROUTE_KEY, JSON.stringify(normalizeFormatParserRoute(route)));
}

export function saveStoredFormatRules(key: string, rules: FormatRules | null): boolean {
  if (rules) {
    return writeStorageValue(key, JSON.stringify(rules));
  }
  return removeStorageValue(key);
}
